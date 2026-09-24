# Operations Checklist and Binary Execution Guide

This document gives operational checklists and parameter references for the VRChat Package Crawler.

---

## 1. System Architecture & Binary Mapping

The toolset will separate into dedicated source directories. Each directory will compile into an executable in `dist/`:

| Binary Executable | Source Entry Point | Operational Role |
| :--- | :--- | :--- |
| `dist/vrc-crawler.exe` | `src/crawler/index.ts` | 24/7 background harvesting daemon. Acquires single-instance `ProcessLock`. Contains zero CLI subcommand parsing. |
| `dist/vrc-crawler-linux` | `src/crawler/index.ts` | Headless Linux service binary. Cross-compiled for Linux server deployments. |
| `dist/vrc-monitor.exe` | `src/monitor/index.ts` | Interactive terminal monitor and primary CLI control interface for the daemon. |
| `dist/vrc-sync.exe` | `src/sync/index.ts` | High-watermark delta synchronizer for Cloudflare D1 and R2 media. |
| `dist/vrc-server.exe` | `src/server/index.ts` | Headless REST API gateway serving Schemas 1, 2, and ingesting Schema 4 reports. |

### Auxiliary Operational Commands

Run operations directly with Bun:
- `bun run sanitize` or `bun run project` (`src/crawler/projection.ts`): Re-evaluates relevance, computes SimHash clusters, and projects `canonical_packages` with 2 URL columns (`url`, `vcc_url`).
- `bun run export` (`src/sync/exporter.ts`): Builds a defragmented SQLite catalog with FTS5 search index (`vrc_catalog.db`), terms metadata, and pure origin media pointers.
- `bun run steering` (`src/crawler/steering.ts`): Processes queued Schema 4 reports and tunes search patterns.
- `bun run discover:vpm` (`src/drivers/vpm_index.ts`): Ingests community VPM repository URLs.

---

## 2. Canonical Database Specification (`dist/crawler_state.db`)

The primary database will reside at:
```
dist/crawler_state.db
```

### Invariants:
1. **Zero Root Database Files:** The project root must never host `crawler_state.db`. Both compiled binaries and Bun scripts will resolve `CONFIG.dbPath` to `dist/crawler_state.db`.
2. **Crash & Power Loss Resilience:** The database will run in WAL mode (`PRAGMA journal_mode = WAL;`) and normal synchronization (`PRAGMA synchronous = NORMAL;`). The startup routine will automatically restore orphaned in-flight fetches to `pending`.
3. **Timestamp Decoupling:**
   - `origin_created_at`: Upstream platform creation date. Will remain `NULL` if absent upstream.
   - `origin_updated_at`: Upstream platform last modified date.
   - `created_at_confidence`: `'confirmed'` (scraped from platform API), `'inferred'` (derived from verified commit), or `'unknown'` (`NULL` date).
   - `created_at`: Local crawler first observation timestamp. Never overwritten by upstream dates.
   - `updated_at`: Local projection calculation timestamp.

---

## 3. Pre-Flight Production Checklist

Before starting 24/7 background crawling in production, complete this operational check:

- [ ] **Check 1: Single Canonical DB Verification**
  Confirm that `dist/crawler_state.db` exists and no database files exist in the project root:
  ```powershell
  Get-ChildItem -Path . -Filter "crawler_state.db*" # Must return empty
  Test-Path "dist/crawler_state.db"                # Must return True
  ```

- [ ] **Check 2: SQLite Quick Check & WAL Health**
  Verify database structural integrity:
  ```powershell
  bun -e "import { Database } from 'bun:sqlite'; const db = new Database('dist/crawler_state.db'); console.log(db.query('PRAGMA quick_check;').get());"
  # Expected: { quick_check: "ok" }
  ```

- [ ] **Check 3: All Frontier Items Requeued for Discovery**
  Verify that all frontier URLs are ready for re-crawling with fresh adaptive intervals:
  ```powershell
  bun -e "import { Database } from 'bun:sqlite'; const db = new Database('dist/crawler_state.db'); console.log(db.query('SELECT status, count(1) as count FROM frontier GROUP BY status;').all());"
  ```

- [ ] **Check 4: Environment Credentials Verification**
  Confirm that `dist/.env` contains the required secret tokens:
  ```env
  API_SECRET_TOKEN=secure_random_hex_token   # Protects administrative reports
  GITHUB_TOKEN=ghp_personal_access_token     # Optional: switches API to 5,000 req/hr
  CLOUDFLARE_ACCOUNT_ID=...                  # Optional for vrc-sync
  CLOUDFLARE_API_TOKEN=...
  CLOUDFLARE_D1_DATABASE_ID=...
  CLOUDFLARE_R2_BUCKET_NAME=...
  ```

- [ ] **Check 5: Lock File Check**
  Verify no stale `crawler.lock` exists in `dist/`:
  ```powershell
  Remove-Item -Path "dist/crawler.lock" -ErrorAction SilentlyContinue
  ```

---

## 4. Binary Execution & Parameter Reference

### 4.1 `dist/vrc-crawler.exe` (Crawler Daemon)

The crawler daemon will run the harvesting engine with Mercator host pacing and RFC 9309 robots enforcement.

**Syntax:**
```powershell
Start-Process "dist\vrc-crawler.exe"
# Or via bun:
bun run start
```

> [!CAUTION]
> The `vrc-crawler.exe` binary will not parse CLI subcommands. Do not execute arguments like `vrc-crawler.exe status` or `recrawl`. Doing so will attempt to start a second crawler and crash on `ProcessLock`. Dispatch all management commands through `vrc-monitor.exe`.

**Environment Variables:**
- `GITHUB_TOKEN` / `GH_TOKEN`: GitHub personal access token (switches API from 60 to 5,000 req/hr).
- `CRAWLER_DB_PATH`: Custom path to SQLite database (defaults to `dist/crawler_state.db`).
- `CRAWLER_LOGS_DIR`: Custom path to log directory (defaults to `dist/logs`).
- `CRAWLER_IPC_PORT`: Custom loopback IPC port (defaults to `8765`).

**Daemon Loopback IPC API (`127.0.0.1:8765`):**
- `GET /status` / `GET /health`: JSON status of active workers, memory, uptime, and queue lengths.
- `GET /recrawl`: Triggers an immediate Poisson stale URL freshness sweep.
- `GET /project`: Triggers an immediate canonical projection synthesis pass.
- `GET /sync`: Triggers an immediate Cloudflare edge synchronization pass.
- `GET /steering`: Triggers an immediate feedback ingestion pass.
- `GET /export`: Triggers an immediate catalog export.
- `GET /stop`: Gracefully shuts down the background daemon.

**Interactive Keystrokes (when attached to stdin):**
- `q`: Gracefully terminate daemon and release single-instance process lock.

---

### 4.2 `dist/vrc-monitor.exe` (Terminal Telemetry & Control CLI)

The monitor will provide a terminal dashboard displaying queue telemetry, throughput, and categories. It will also serve as the primary CLI control interface for the daemon.

**Syntax:**
```powershell
.\dist\vrc-monitor.exe [command] [options]
# Or via bun:
bun run monitor [command] [options]
```

**CLI Commands (dispatched to running daemon via loopback IPC):**
- `status`: Queries and displays current daemon IPC status, port, uptime, and metrics.
- `start`: Launches the crawler daemon as a detached background process.
- `stop`: Dispatches a graceful shutdown signal to the running daemon.
- `recrawl`: Triggers an immediate Poisson freshness sweep on the running daemon.
- `project`: Triggers a canonical projection rebuild on the running daemon.
- `sync`: Triggers an edge synchronization pass on the running daemon.
- `export`: Triggers a catalog export on the running daemon.

**Parameters & Flags:**
- `--once`: Renders a single metrics snapshot and exits immediately (useful for scripts and cron).
- `--help`, `-h`: Displays monitor usage and interactive hotkeys.

**Interactive Hotkeys (in live dashboard mode):**
- `[r]`: Dispatches an immediate re-crawl request to the daemon via IPC.
- `[p]`: Dispatches a canonical projection rebuild request to the daemon via IPC.
- `[s]`: Dispatches an edge sync request to the daemon via IPC.
- `[e]`: Dispatches a catalog export request to the daemon via IPC.
- `[q]`: Signals the running daemon to stop cleanly and exits the monitor.

---

### 4.3 `dist/vrc-sync.exe` (Cloudflare Edge Synchronizer)

The synchronizer will push incremental deltas to Cloudflare D1 and upload media thumbnails to R2.

**Syntax:**
```powershell
.\dist\vrc-sync.exe [options]
# Or via bun:
bun run sync [options]
```

**Parameters & Flags:**
- `--dry-run`: Validates batch payload structures without executing mutations to Cloudflare.
- `--batch-size <N>`, `-b <N>`: Sets transaction batch size (default: `50`).
- `--reset-watermark`: Resets high-watermark checkpoint to 0 and re-syncs the entire catalog.
- `--help`, `-h`: Displays sync CLI usage and required variables.

**Watermark Recovery:**
Full projection rebuilds execute `DELETE FROM canonical_packages`, which restarts SQLite rowids at 1. If the previous watermark exceeds the rebuilt row count, run `--reset-watermark` to prevent silent omission of rows.

---

### 4.4 `dist/vrc-server.exe` (Headless REST Gateway)

The HTTP server will provide discovery endpoints for community tools and client applications.

**Syntax:**
```powershell
.\dist\vrc-server.exe [options]
# Or via bun:
bun run server [options]
```

**Parameters & Flags:**
- `--port <N>`, `-p <N>`: Port to bind HTTP server (default: `8080`, or `PORT` environment variable).
- `--host <ip>`, `-H <ip>`: Host interface to bind (default: `0.0.0.0`, or `HOST` environment variable).
- `--token <secret>`: Secret API bearer token for privileged administrative routes.
- `--help`, `-h`: Displays server usage and endpoint reference.

**API Endpoints:**
- `GET /v1/health`: Server uptime, memory metrics, and catalog counts.
- `GET /v1/catalog/delta`: Schema 1 cursor-paginated delta stream with SHA-256 validation digest.
- `GET /v1/vpm/index.json`: Schema 2 VCC/ALCOM community repository manifest.
- `GET /v1/media/:id`: Serves cached low-resolution WebP images.
- `POST /v1/reports`: Ingests Schema 4 community steering reports. Requires `API_SECRET_TOKEN` authentication. Enforces rate limits (10 reports/min per IP).

---

## 5. Maintenance Operations Reference

### Re-audit and Sanitize Entire Database
```powershell
bun run sanitize
```
Re-evaluates every active entity, computes SimHash clusters, maps `package_fronts`, and updates `canonical_packages`.

### Reset Frontier for Complete Ecosystem Re-discovery
```powershell
bun -e "import { Database } from 'bun:sqlite'; const db = new Database('dist/crawler_state.db'); db.run(\"UPDATE frontier SET status = 'pending', attempts = 0, next_fetch_at = datetime('now');\"); console.log('All frontier URLs reset to pending.');"
```

### Export Lightweight Standalone Catalog
```powershell
bun run export -- --catalog
```
Produces `dist/vrc_catalog.db` containing pre-indexed FTS5 search virtual tables for zero-latency local querying.
