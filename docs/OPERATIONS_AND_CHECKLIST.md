# Operations Checklist and Binary Execution Guide

This document provides the authoritative operational checklists and parameter references for running the VRChat Package Crawler in production and development environments.

---

## 1. System Architecture & Binary Mapping

The toolset is separated into dedicated, decoupled source directories corresponding to each compiled executable in `dist/`:

| Binary Executable | Source Entry Point | Description | Primary Ingestion / Distribution Role |
| :--- | :--- | :--- | :--- |
| `dist/vrc-crawler.exe` | `src/crawler/index.ts` | 24/7 Background Crawler Daemon | Autonomous multi-platform crawling, rate-limiting, and loopback IPC control |
| `dist/vrc-crawler-linux` | `src/crawler/index.ts` | Headless Linux Daemon | Cross-compiled binary (`bun-linux-x64`) for Linux server deployments |
| `dist/vrc-monitor.exe` | `src/monitor/index.ts` | Interactive Terminal Monitor | Real-time saturation metrics, platform queue telemetry, and IPC command console |
| `dist/vrc-sync.exe` | `src/sync/index.ts` | Edge Synchronizer Daemon | High-watermark delta push to Cloudflare D1 and WebP thumbnail upload to R2 |
| `dist/vrc-server.exe` | `src/server/index.ts` | Headless HTTP Gateway | High-throughput REST API serving Schemas 1, 2, and ingesting Schema 4 reports |

### Auxiliary Maintenance Toolset (`src/tools/`)
Offline batch tools executed on demand via Bun:
- `bun run sanitize` (`src/tools/pipeline_sanitize.ts`): Re-evaluates relevance, computes SimHash/Jaro-Winkler multi-platform clustering, resolves origin timestamps, and projects `canonical_packages` and `package_fronts`.
- `bun run export` (`src/tools/exporter.ts`): Builds a defragmented SQLite catalog with FTS5 search index (`vrc_catalog.db`).
- `bun run steering` (`src/tools/steering.ts`): Processes queued Schema 4 reports, applies curator overrides, and tunes search patterns.
- `bun run discover:vpm` (`src/tools/discover_vpm.ts`): Crawls public indexes for new community VPM repository URLs.

---

## 2. Canonical Database Specification (`dist/crawler_state.db`)

The single authoritative database is:
```
dist/crawler_state.db
```

### Invariants:
1. **Zero Root Database Files:** The project root must never host `crawler_state.db`. Both compiled binaries and Bun development scripts (`bun run ...`) automatically resolve `CONFIG.dbPath` to `dist/crawler_state.db`.
2. **Crash & Power Loss Resilience:** Configured with `PRAGMA journal_mode = WAL;` and `PRAGMA synchronous = NORMAL;`. Orphaned in-flight fetches are automatically rolled back from `fetching` to `pending` upon startup via `resetStaleFetching()`.
3. **Timestamp Decoupling:**
   - `origin_created_at`: Upstream platform creation date (e.g. GitHub repo created date or BOOTH item published date).
   - `origin_updated_at`: Upstream platform last modified date.
   - `created_at_confidence`: `'confirmed'` (directly extracted from upstream API/DOM), `'inferred'` (inferred from earliest observation date), or `'unknown'`.
   - `created_at`: Local crawler first observation timestamp. Never overwritten by upstream dates.
   - `updated_at`: Local projection recalculation timestamp.

---

## 3. Pre-Flight Production Checklist

Before starting 24/7 background crawling in production, complete this operational verification:

- [ ] **Check 1: Single Canonical DB Verification**
  Confirm that `dist/crawler_state.db` exists and no `crawler_state.db` files exist in the project root:
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
  Verify that all frontier URLs are ready for re-crawling with fresh adaptive Poisson intervals:
  ```powershell
  bun -e "import { Database } from 'bun:sqlite'; const db = new Database('dist/crawler_state.db'); console.log(db.query('SELECT status, count(1) as count FROM frontier GROUP BY status;').all());"
  # All items should have status: "pending" and attempts: 0
  ```

- [ ] **Check 4: Environment Credentials Verification**
  Confirm that `dist/.env` (or environment variables) contains the recommended tokens:
  ```env
  GITHUB_TOKEN=ghp_your_personal_access_token # 5,000 req/hr rate limit
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

Runs the multi-threaded autonomous harvesting engine with Mercator host schedulers and RFC 9309 robots enforcement.

**Syntax:**
```powershell
.\dist\vrc-crawler.exe [command] [options]
# Or via bun:
bun run start [command] [options]
```

**Commands (dispatched to running daemon via loopback IPC):**
- `status`: Queries and prints active crawler daemon health and metrics.
- `stop`: Dispatches graceful shutdown signal to running daemon.
- `recrawl`: Triggers an immediate Poisson stale URL freshness sweep.
- `project`: Triggers an immediate canonical projection synthesis pass.

**Parameters & Flags:**
- `--help`, `-h`: Displays command-line help and usage.

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
- `GET /steering`: Triggers an immediate community feedback ingestion pass.
- `GET /export`: Triggers an immediate catalog export.
- `GET /stop`: Gracefully shuts down the background daemon.

**Interactive Keystrokes (when attached to stdin):**
- `q`: Gracefully flush database WAL, release single-instance lock, and terminate.

---

### 4.2 `dist/vrc-monitor.exe` (Terminal Telemetry & Control CLI)

Live full-screen dashboard displaying queue telemetry, throughput, pre-indexed categories, and recent crawler events. Also serves as the primary CLI control interface for the daemon.

**Syntax:**
```powershell
.\dist\vrc-monitor.exe [command] [options]
# Or via bun:
bun run monitor [command] [options]
```

**CLI Commands:**
- `status`: Displays current daemon IPC status, active port, uptime, and exits.
- `stop`: Dispatches a graceful shutdown signal to the running daemon and exits.
- `recrawl`: Triggers an immediate freshness sweep on the running daemon and exits.
- `project`: Triggers a canonical projection rebuild on the running daemon and exits.
- `sync`: Triggers an edge sync pass on the running daemon and exits.

**Parameters & Flags:**
- `--once`: Renders a single snapshot of system metrics and exits immediately (useful for scripts, cron, and health checks).
- `--help`, `-h`: Displays monitor usage and interactive key commands.

**Interactive Hotkeys (in live dashboard mode):**
- `[r]`: Dispatches an immediate re-crawl request to the daemon via IPC.
- `[p]`: Dispatches a canonical projection rebuild request to the daemon via IPC.
- `[s]`: Dispatches an edge sync request to the daemon via IPC.
- `[e]`: Dispatches a catalog export request to the daemon via IPC.
- `[q]`: Signals the running daemon to stop cleanly and exits the monitor.

---

### 4.3 `dist/vrc-sync.exe` (Cloudflare Edge Synchronizer)

Incremental delta synchronizer that pushes new/updated canonical packages to Cloudflare D1 relational databases and syncs media thumbnails to R2.

**Syntax:**
```powershell
.\dist\vrc-sync.exe [options]
# Or via bun:
bun run sync [options]
```

**Parameters & Flags:**
- `--dry-run`: Validates batch payload structures and displays diffs without executing network mutations to Cloudflare.
- `--batch-size <N>`, `-b <N>`: Sets the transaction batch size (default: `50`).
- `--full`, `--reset`: Resets high-watermark checkpoint to 0 and re-syncs the entire catalog from the beginning.
- `--help`, `-h`: Displays sync CLI usage and required environment variables.

**Automatic Rebuild Detection:**
If `canonical_packages` is rebuilt or truncated, the synchronizer automatically detects when `watermarkRowId > maxRowIdInDb` and resets the watermark to 0 to prevent silent desynchronization.

**Required Environment Variables (for live sync):**
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
- `CLOUDFLARE_API_TOKEN`: API Token with D1 and R2 edit permissions.
- `CLOUDFLARE_D1_DATABASE_ID`: Destination D1 UUID.
- `CLOUDFLARE_R2_BUCKET_NAME`: Destination R2 media bucket name.

---

### 4.4 `dist/vrc-server.exe` (Headless REST Gateway)

High-performance Bun HTTP server providing client discovery endpoints for community tools.

**Syntax:**
```powershell
.\dist\vrc-server.exe [options]
# Or via bun:
bun run server [options]
```

**Parameters & Flags:**
- `--port <N>`, `-p <N>`: Port to bind HTTP server (default: `8080`, or `PORT` / `API_PORT` environment variable).
- `--host <ip>`, `-H <ip>`: Host interface to bind to (default: `0.0.0.0`, or `HOST` / `API_HOST` environment variable).
- `--token <secret>`: Secret API bearer token for privileged administrative routes.
- `--help`, `-h`: Displays server usage and endpoint reference.

**API Endpoints:**
- `GET /v1/health`: Server uptime, memory metrics, and catalog counts.
- `GET /v1/packages`: Schema 1 cursor-paginated delta stream with SHA-256 validation digest.
- `GET /v1/vpm/index.json` / `GET /v1/index.json`: Schema 2 VCC/ALCOM community repository manifest.
- `GET /v1/media/:id`: Serves cached low-resolution WebP images.
- `POST /v1/reports`: Ingests Schema 4 community steering reports (categorization, irrelevance, listing, tags, discovery queries). Enforces sliding-window rate limit (10 reports/min per IP/fingerprint).

---

## 5. Maintenance Operations Reference

### Re-audit and Sanitize Entire Database
```powershell
bun run sanitize
```
Re-evaluates every active entity against `RelevanceFilter`, computes SimHash and Jaro-Winkler similarity clusters, deduplicates cross-platform links into `package_fronts`, resolves origin dates, and updates `canonical_packages`.

### Reset Frontier for Complete Ecosystem Re-discovery
```powershell
bun -e "import { Database } from 'bun:sqlite'; const db = new Database('dist/crawler_state.db'); db.run(\"UPDATE frontier SET status = 'pending', attempts = 0, next_fetch_at = datetime('now');\"); console.log('All frontier URLs reset to pending.');"
```

### Export Lightweight Standalone Catalog
```powershell
bun run export
```
Produces `dist/vrc_catalog.db` containing pre-indexed FTS5 search virtual tables for zero-latency local querying.
