# VRC Package Crawler

The VRC Package Crawler will run as a continuous 24/7 background service. It will discover, crawl, and index unlisted VRChat tools and packages. Supported sources will include BOOTH, GitHub, Gumroad, Jinxxy, Itch.io, and decentralized VPM registries. The service will maintain a local SQLite database. It will also export a lightweight single-file catalog for external applications.

This system will not download or redistribute binary assets. It will index only factual public metadata: titles, descriptions, pricing, storefront URLs, and low-resolution thumbnails. The system will route all commercial checkout traffic directly to original creator storefronts.

See [docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md](docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md) for the legal and compliance specification.

---

## Architecture

```
dist/vrc-crawler.exe          -- 24/7 background daemon (headless, no console window)
dist/vrc-monitor.exe          -- Interactive console monitor and CLI control interface
dist/vrc-sync.exe             -- Periodic Cloudflare edge sync utility
dist/vrc-server.exe           -- Headless REST API server (Schemas 1, 2, and 4)
dist/vrc-crawler-linux        -- Linux daemon binary
dist/vrc-server-linux         -- Linux headless REST API binary
```

### Core Components

| Component | Description |
|---|---|
| Poisson Refresh Scheduler | The scheduler will re-crawl URLs based on observed change frequency. It will keep the index fresh during continuous operation. |
| CQRS Observation Lake | The `entities` table will store raw crawl payloads immutably. Relevance status flags will quarantine items without deleting data. |
| Canonical Projection Engine | The projection engine will run every 15 minutes. It will synthesize `canonical_packages` and `package_fronts` from raw entities. |
| WebP Image Proxy Pipeline | The pipeline will download, transcode, and store low-resolution thumbnails (480x270). It will compute BlurHash and 64-bit pHash. |
| Loopback IPC Control | The crawler daemon will listen on `127.0.0.1:8765`. It will accept `/stop`, `/recrawl`, `/project`, `/sync`, and `/steering` commands. |
| Interactive Monitor CLI | The `vrc-monitor.exe` binary will dispatch IPC commands to the daemon. It will display real-time terminal metrics. |
| Cloudflare Edge Sync | The `vrc-sync.exe` utility will push incremental deltas to Cloudflare D1. It will fall back to local backup deltas if offline. |
| Autonomous Steering Engine | The steering engine will process Schema 4 feedback every 30 minutes. It will apply curator overrides and search pattern weights. |
| Exportable Single-File Catalog | The exporter will build a defragmented `vrc_catalog.db` file with SQLite FTS5 for offline search. |

### Database

The primary database will reside at `dist/crawler_state.db`. The system will create this file on first run. It will contain:

- `frontier`: URL queue with Cho-Garcia-Molina Poisson adaptive scheduling.
- `entities`: Immutable raw observation lake across all platforms.
- `canonical_packages`: Deduplicated catalog projections with lifecycle and confidence tracking.
- `package_fronts`: Per-platform storefront mappings (BOOTH, GitHub, Gumroad, Jinxxy, Itch).
- `media_cache`: Proxied low-resolution WebP image metadata, BlurHash, and 64-bit pHash.
- `curator_overrides`: Persistent community and author overrides surviving projection rebuilds.
- `user_reports`: Inbound user feedback and steering reports (Schema 4).
- `search_patterns`: Closed-loop dynamic discovery query seeds and negative filter tokens.
- `creator_opt_outs`: Legal exclusion registry with regex and bio-token verification.
- `sync_checkpoints`: High-watermark cursors for edge sync.

---

## Directory Structure

```
vrc-package-crawler/
  src/                        Core crawler engine and foundation
    crawler/                  Autonomous 24/7 crawler daemon (vrc-crawler.exe / linux)
      index.ts                Main harvesting daemon & DLQ idle draining loop
      projection.ts           Canonical projection, SimHash clustering, and umbrella tagging
      steering.ts             Autonomous steering feedback processor & quarantine buffer
    monitor/                  Interactive console monitor & IPC status CLI (vrc-monitor.exe)
      index.ts
    sync/                     Cloudflare D1/R2 incremental sync daemon (vrc-sync.exe)
      index.ts
      exporter.ts             Single-file catalog and FTS5 SQLite exporter (vrc-export.exe)
    server/                   Headless REST API server (Schemas 1, 2, 4) (vrc-server.exe)
      index.ts
    drivers/                  Per-platform crawl drivers (BOOTH, GitHub, Gumroad, Jinxxy, Itch, VPM)
    utils/                    Shared utilities (circuit breaker, image proxy, robots.txt, Poisson, IPC, lock)
    db.ts                     Unified SQLite database layer with auto-upgrade
    filter.ts                 Relevance and safety filters
    classifier.ts             Taxonomy classification
    config.ts                 Path resolution and runtime configuration (sole canonical DB in dist/)
  docs/                       Specification documents
    DISCOVERY_RULES.md        Discovery, relevance scoring, and re-audit rules
    COMPREHENSIVE_SYSTEM_ARCHITECTURE.md System blueprint and guardrails audit
    ARCHITECTURE_AND_COMPLIANCE_GUIDE.md Legal, contractual, and technical boundaries
    REPORTING_SCHEMAS.md      Schemas 1 to 5 for client ingestion and telemetry
    EDGE_SYNC_AND_SCALE_GUIDE.md Cloudflare edge synchronization guide
    OPERATIONS_AND_CHECKLIST.md Operational checklists and verification
    topics/                   Technical deep-dive topics
  tests/                      Bun test suites (39 passing tests across 12 files)
  dist/                       Isolated runtime environment (gitignored)
    vrc-crawler.exe           Background daemon binary (Windows)
    vrc-monitor.exe           Console monitor & CLI binary (Windows)
    vrc-sync.exe              Cloudflare edge sync binary (Windows)
    vrc-server.exe            Headless API gateway binary (Windows)
    vrc-crawler-linux         Background daemon binary (Linux)
    vrc-server-linux          Headless API gateway binary (Linux)
    crawler_state.db          Live SQLite database
    logs/                     Log files
    .env                      Local environment secrets
    .env.example              Configuration template
```

> [!IMPORTANT]
> The `dist/` directory will serve as the isolated runtime environment. Binaries, database files, logs, and `.env` will live inside `dist/`. The project root will store only source code and documentation. Run binaries from `dist/` or specify absolute paths.

---

## Prerequisites

- **Bun** >= 1.4.0 (required for development and building).
- **GitHub Token** (optional): increases GitHub API rate limit from 60 to 5,000 requests per hour.
- **Cloudflare Credentials** (optional): required for edge sync via `vrc-sync`.

---

## First-Time Setup

1. Install project dependencies:
   ```powershell
   bun install
   ```

2. Build standalone binaries into `dist/`:
   ```powershell
   bun run build:all
   ```

3. Configure runtime environment variables:
   ```powershell
   copy .env.example dist\.env
   ```
   Open `dist\.env` and set `API_SECRET_TOKEN`, `GITHUB_TOKEN`, and Cloudflare variables.

For development mode (runs via Bun, database emits to project root):
```powershell
copy .env.example .env
bun run start
```

---

## Running on Windows

### Start Background Crawler Daemon

The crawler daemon will run in the background without a console window. It will acquire a single-instance process lock.

```powershell
Start-Process "dist\vrc-crawler.exe"
```

> [!NOTE]
> The `vrc-crawler.exe` binary will not parse CLI subcommands. Do not run arguments against `vrc-crawler.exe`. Dispatch all administrative commands through `vrc-monitor.exe`.

### Monitor and Control Crawler Daemon

Launch the interactive monitor:

```powershell
dist\vrc-monitor.exe
```

The monitor will read from the SQLite database. It will use indexed queries and will not block crawling.

You can also send non-interactive commands to the daemon through `vrc-monitor.exe`:

```powershell
dist\vrc-monitor.exe status     # Check daemon health and metrics
dist\vrc-monitor.exe recrawl    # Trigger immediate Poisson re-crawl sweep
dist\vrc-monitor.exe project    # Trigger canonical projection rebuild
dist\vrc-monitor.exe sync       # Trigger Cloudflare edge sync
dist\vrc-monitor.exe export     # Trigger catalog export
dist\vrc-monitor.exe stop       # Send graceful shutdown signal to daemon
```

Interactive monitor hotkeys:

| Key | Action |
|---|---|
| `r` | Send immediate re-crawl request to daemon |
| `p` | Trigger canonical projection rebuild |
| `s` | Run Cloudflare edge sync |
| `e` | Export catalog to `vrc_catalog.db` |
| `q` | Send graceful shutdown to daemon |

### Run Headless API Server

The headless API server will serve Schemas 1, 2, and 4:

```powershell
dist\vrc-server.exe --port 8080 --host 127.0.0.1
```

Set `API_SECRET_TOKEN` in `.env` to protect administrative endpoints and report processing.

### Run Cloudflare Edge Sync Manually

```powershell
dist\vrc-sync.exe
```

This utility will require `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN`.

---

## Running on Linux

1. Make the daemon executable and start it in the background:
   ```bash
   chmod +x dist/vrc-crawler-linux
   ./dist/vrc-crawler-linux &
   ```

2. View crawler log output:
   ```bash
   tail -f logs/crawler.log
   ```

3. Run the headless API server:
   ```bash
   chmod +x dist/vrc-server-linux
   ./dist/vrc-server-linux --port 8080 --host 127.0.0.1
   ```

A systemd service template will reside in `DELEGATES.md` for production deployment.

---

## Exporting the Catalog

1. Export lightweight catalog with FTS5 search:
   ```powershell
   bun run export -- --catalog
   ```

2. Export full observation lake snapshot:
   ```powershell
   bun run export -- --lake
   ```

Output will write to `vrc_catalog.db` in the working directory.

---

## Development & Verification

1. Run the test suite:
   ```powershell
   bun test
   ```
   The ground-truth test suite contains 57 passing tests across 12 files (276 assertions).

2. Check TypeScript types without emitting:
   ```powershell
   bun x tsc --noEmit
   ```

---

## Reporting Schemas

External applications will integrate with the crawler through standardized schemas. See [docs/REPORTING_SCHEMAS.md](docs/REPORTING_SCHEMAS.md):

- **Schema 1**: Downstream Feed Delta Ingestion Report (cursor-paginated, SHA-256 digest).
- **Schema 2**: Native VCC / ALCOM Community Repository Manifest (`index.json`).
- **Schema 3**: End-User Project Dependency Audit Report.
- **Schema 4**: Upstream User Steering Report (curator overrides, delisting flags, negative tokens).
- **Schema 5**: Downstream Interaction and Search Telemetry (clicks, bookmarks, queries).

---

## Cloudflare Edge Distribution

See [docs/EDGE_SYNC_AND_SCALE_GUIDE.md](docs/EDGE_SYNC_AND_SCALE_GUIDE.md) for details:

- Cloudflare D1 and R2 provisioning and schema setup.
- Incremental delta replication via `vrc-sync.exe` with high-watermark cursors.
- Watermark recovery procedures for projection rebuilds.
- Catalog delivery through Cloudflare Workers.

---

## Legal and Compliance

The crawler will follow strict legal boundaries and community norms:

- It will not download binary asset archives (`.unitypackage`, executables, textures).
- It will index only factual public metadata.
- It will route all store links directly to original creators.
- It will identify itself via `User-Agent: VRCDiscoveryBot/1.0`.
- It will obey `robots.txt` with 24-hour caching per RFC 9309.
See [LEGAL.md](LEGAL.md) and [docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md](docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md) for full compliance specifications.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) — see the [LICENSE.md](LICENSE.md) file for details.

