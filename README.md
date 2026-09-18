# VRC Package Crawler

A continuous 24/7 background service that discovers, crawls, and indexes unlisted VRChat tools and packages from BOOTH, GitHub, Gumroad, Jinxxy, Itch.io, and decentralized VPM registries. It maintains a local SQLite database and exports a lightweight single-file catalog for use by external applications.

This project does not download or redistribute any binary assets. It indexes only factual public metadata (titles, descriptions, pricing, storefront URLs, and low-resolution thumbnails) and routes all user transactions directly to original creator storefronts.

See [docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md](docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md) for the full legal and compliance specification.

---

## Architecture

```
dist/vrc-crawler.exe          -- 24/7 background daemon (headless, no console window)
dist/vrc-monitor.exe          -- Interactive console monitor (launch on demand)
dist/vrc-sync.exe             -- Periodic Cloudflare edge sync utility
dist/vrc-crawler-linux        -- Linux daemon binary
```

### Core Components

| Component | Description |
|---|---|
| Poisson Refresh Scheduler | Adaptively re-crawls URLs based on observed change frequency (lambda). Replaces the legacy saturation-stop batch model. |
| CQRS Observation Lake | `entities_v2` stores 100% of raw crawl payloads immutably. Relevance status flags quarantined items without destroying data. |
| Canonical Projection Engine | Runs every 15 minutes. Synthesizes `canonical_packages_v2` and `package_fronts_v2` from the observation lake. |
| WebP Image Proxy Pipeline | Downloads, transcodes, and stores compliant low-resolution thumbnails. Computes BlurHash and perceptual hash (pHash). |
| Loopback IPC Control | Daemon listens on `127.0.0.1:8765`. Allows `vrc-monitor.exe` to send graceful shutdown signals. |
| Cloudflare Edge Sync | `vrc-sync.exe` pushes incremental deltas to Cloudflare D1 and uploads WebP thumbnails to Cloudflare R2 via high-watermark cursors. |
| Exportable Single-File Catalog | `VACUUM INTO` generates a defragmented `vrc_catalog.db` with SQLite FTS5 for zero-latency offline querying. |

### Database

The single canonical database is `crawler_state.db`, created next to the binary on first run. It contains:

- `frontier_v2` -- URL queue with adaptive re-crawl scheduling
- `entities_v2` -- Immutable raw observation lake (all platforms)
- `canonical_packages_v2` -- Deduplicated catalog projections
- `package_fronts_v2` -- Per-platform storefront mappings
- `media_cache_v2` -- Proxied WebP image metadata
- `sync_checkpoints` -- High-watermark cursors for edge sync
- `user_reports_v2` -- Inbound user feedback and steering reports
- `search_patterns_v2` -- Discovery query seeds and negative filter tokens
- `creator_optouts` -- Self-service creator opt-out registry

---

## Directory Structure

```
vrc-package-crawler/
  src/                        Source files
    drivers/                  Per-platform crawl drivers (BOOTH, GitHub, Gumroad, Jinxxy, Itch, VPM)
    utils/                    Shared utilities (image proxy, robots.txt enforcer, Poisson scheduler, IPC)
    index.ts                  Main daemon entry point
    status.ts                 Console monitor entry point
    sync.ts                   Edge sync entry point
    exporter.ts               Single-file catalog exporter
    db.ts / db_v2.ts          Database layer (V1 compatibility + V2 schema)
    migrate_v2.ts             One-time V1-to-V2 migration script
    pipeline_sanitize.ts      Canonical projection and name arbitration engine
    config.ts                 Path resolution and runtime configuration
  docs/                       Specification documents
    ARCHITECTURE_AND_COMPLIANCE_GUIDE.md
    REPORTING_SCHEMAS.md      Schemas 1-4 for downstream/upstream client ingestion
    EDGE_SYNC_AND_SCALE_GUIDE.md
    VRChat Asset Indexing Standards.md
    topics/                   Deep-dive technical topics
  tests/                      Bun test suites
  dist/                       Compiled standalone binaries (gitignored)
  archive/legacy/             Pre-redesign launch scripts (archived for reference)
  logs/                       Rotating log files (gitignored)
```

---

## Prerequisites

- **Bun** >= 1.4.0 (required for development and building)
- **GitHub Token** (optional but recommended): increases GitHub API rate limit from 60 to 5,000 requests/hour
- **Cloudflare credentials** (optional): required only for edge sync via `vrc-sync`

---

## First-Time Setup

```powershell
# 1. Install dependencies
bun install

# 2. Copy and configure environment variables
copy .env.example .env
# Edit .env and set GITHUB_TOKEN, and optionally CLOUDFLARE_* variables

# 3. Run the V2 database migration (one-time only)
bun run migrate

# 4. Build all standalone binaries
bun run build:all
```

---

## Running on Windows

### Start the background crawler daemon

```powershell
# Runs silently with no console window
Start-Process "dist\vrc-crawler.exe"
```

### Monitor live crawler status

```powershell
dist\vrc-monitor.exe
```

The monitor reads directly from the SQLite database. It uses pre-indexed SQL aggregate queries and does not block the crawler. Interactive commands:

| Key | Action |
|---|---|
| `r` | Force immediate re-crawl of next pending URL |
| `s` | Run edge sync now |
| `e` | Export catalog to vrc_catalog.db |
| `q` | Send graceful shutdown to daemon |

### Run Cloudflare edge sync manually

```powershell
dist\vrc-sync.exe
```

Requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, and `CLOUDFLARE_API_TOKEN` set in `.env`.

---

## Running on Linux

```bash
# Make executable and launch in background
chmod +x dist/vrc-crawler-linux
./dist/vrc-crawler-linux &

# View logs
tail -f logs/crawler.log
```

A systemd service template is available in `docs/topics/` for production deployment.

---

## Exporting the Catalog

```powershell
# Lightweight single-file catalog with FTS5 full-text search (~15MB)
bun run export -- --catalog

# Full observation lake snapshot for disaster recovery
bun run export -- --lake
```

Output: `vrc_catalog.db` in the base directory (next to the binary when compiled).

---

## Development

```powershell
# Run in dev mode (uses project root as base directory)
bun run start

# Run tests
bun test

# Type-check only
bun x tsc --noEmit
```

---

## Reporting Schemas

External applications can integrate with the crawler using four standardized schemas. See [docs/REPORTING_SCHEMAS.md](docs/REPORTING_SCHEMAS.md):

- **Schema 1**: Downstream Feed Delta Ingestion Report (cursor-paginated, SHA-256 digest)
- **Schema 2**: Native VCC / ALCOM Community Repository Manifest (`index.json`)
- **Schema 3**: End-User Project Dependency Audit Report
- **Schema 4**: Upstream User Steering Report (branched discovery feedback, name overrides, opt-outs)

---

## Cloudflare Edge Distribution

See [docs/EDGE_SYNC_AND_SCALE_GUIDE.md](docs/EDGE_SYNC_AND_SCALE_GUIDE.md) for:

- Cloudflare D1 and R2 provisioning and schema setup
- Configuring `vrc-sync` for periodic delta replication
- Serving the catalog via Cloudflare Workers
- Multi-node scaling path for future distributed crawler deployments

---

## Legal and Compliance

This crawler is designed to comply with relevant terms of service and community standards. Key invariants:

- It never downloads binary assets (`.unitypackage`, executables, textures)
- It only indexes factual public metadata
- All storefront links route directly to the original creator
- It identifies itself transparently via `User-Agent: VRCDiscoveryBot/1.0`
- It obeys `robots.txt` with 24-hour caching per RFC 9309
- It enforces a 24-48 hour creator opt-out and takedown SLA

See [docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md](docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md) and [docs/VRChat Asset Indexing Standards.md](<docs/VRChat Asset Indexing Standards.md>) for full details.
