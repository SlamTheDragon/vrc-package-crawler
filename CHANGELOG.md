<!-- LOCKED DOCUMENTATION - DO NOT CHANGE HEADERS AND TOP-LEVEL DESCRIPTION & NAVIGATION. CHANGES MUST PRESERVE BULLET-POINT DELIVERY IN SUB-HEADERS. SUMMARIES MUST BE COMPACTED, AND ALWAYS FALL INSIDE THE SPECIFIED SUMMARY HEADER -->

# Changelog

Here are the latest changelogs of each package and applications. For a full history, please visit [docs/changelogs](docs/changelogs)

## What Changed

<!-- MASTER_SUMMARY -->
- **VRC Packages Crawler (`vrcp-crawler-node-preview`)**: Transitioned to a pure headless daemon running directly from `.env`/environment variables (removed CLI `init`/`help` commands and `node.config.json` scaffolding); added durable SQLite outbox staging and restart recovery for crawled job results; implemented an adaptive idle backoff ladder (5s–60s) with ±20% bounded jitter to eliminate fleet request hammering.
- **VRC Packages Worker (`vrcp-worker-preview`)**: Aligned coordinator default empty claim `retryAfterMs` to 5,000ms (from 1,000ms) to coordinate fleet-wide polling pacing and prevent daily request quota exhaustion.
<!-- MASTER_SUMMARY -->

## Table of Contents

### Applications - Release

- [VRC Packages Crawler Client](#vrc-packages-crawler-client---vrcp-crawler-client)
  - [Added](#vrc-packages-crawler-client---vrcp-crawler-client)
  - [Bugs Fixed](#vrc-packages-crawler-client---vrcp-crawler-client)
  - [Changes](#vrc-packages-crawler-client---vrcp-crawler-client)
- [VRC Packages Crawler](#vrc-packages-crawler---vrcp-crawler-node)
  - [Added](#vrc-packages-crawler---vrcp-crawler-node)
  - [Bugs Fixed](#vrc-packages-crawler---vrcp-crawler-node)
  - [Changes](#vrc-packages-crawler---vrcp-crawler-node)
- [VRC Packages API](#vrc-packages-api---vrcp-packages-api)
  - [Added](#vrc-packages-api---vrcp-packages-api)
  - [Bugs Fixed](#vrc-packages-api---vrcp-packages-api)
  - [Changes](#vrc-packages-api---vrcp-packages-api)

### Internal - Release

- [VRC Packages Web](#vrc-packages-web---vrcp-web)
  - [Added](#vrc-packages-web---vrcp-web)
  - [Bugs Fixed](#vrc-packages-web---vrcp-web)
  - [Changes](#vrc-packages-web---vrcp-web)
- [VRC Packages Cloudflare Workers](#vrc-packages-worker---vrcp-worker)
  - [Added](#vrc-packages-worker---vrcp-worker)
  - [Bugs Fixed](#vrc-packages-worker---vrcp-worker)
  - [Changes](#vrc-packages-worker---vrcp-worker)

### Applications - Preview

- [VRC Packages Crawler Client](#vrc-packages-crawler---vrcp-crawler-client-preview)
  - [Added](#vrc-packages-crawler---vrcp-crawler-client-preview)
  - [Bugs Fixed](#vrc-packages-crawler---vrcp-crawler-client-preview)
  - [Changes](#vrc-packages-crawler---vrcp-crawler-client-preview)
- [VRC Packages Crawler](#vrc-packages-crawler---vrcp-crawler-node-preview)
  - [Added](#vrc-packages-crawler---vrcp-crawler-node-preview)
  - [Bugs Fixed](#vrc-packages-crawler---vrcp-crawler-node-preview)
  - [Changes](#vrc-packages-crawler---vrcp-crawler-node-preview)
- [VRC Packages API](#vrc-packages-api---vrcp-packages-api-preview)
  - [Added](#vrc-packages-api---vrcp-packages-api-preview)
  - [Bugs Fixed](#vrc-packages-api---vrcp-packages-api-preview)
  - [Changes](#vrc-packages-api---vrcp-packages-api-preview)

### Internal - Preview

- [VRC Packages Web](#vrc-packages-web---vrcp-web-preview-preview)
  - [Added](#vrc-packages-web---vrcp-web-preview-preview)
  - [Bugs Fixed](#vrc-packages-web---vrcp-web-preview-preview)
  - [Changes](#vrc-packages-web---vrcp-web-preview-preview)
- [VRC Packages Cloudflare Workers](#vrc-packages-worker-preview)
  - [Added](#vrc-packages-worker-preview)
  - [Bugs Fixed](#vrc-packages-worker-preview)
  - [Changes](#vrc-packages-worker-preview)

### Internal - Packages

- [VRC Packages Networking](#vrc-packages-network-vrcp-packages-network)
  - [Added](#vrc-packages-network-vrcp-packages-network)
  - [Bugs Fixed](#vrc-packages-network-vrcp-packages-network)
  - [Changes](#vrc-packages-network-vrcp-packages-network)

---

# Applications - Release

## VRC Packages Crawler Client - `vrcp-crawler-client`

<!-- vrcp-crawler-client-DESCRIPTION_SUMMARY -->
test
<!-- vrcp-crawler-client-DESCRIPTION_SUMMARY -->

test

## VRC Packages Crawler - `vrcp-crawler-node`

<!-- vrcp-crawler-node-DESCRIPTION_SUMMARY -->
test
<!-- vrcp-crawler-node-DESCRIPTION_SUMMARY -->

test

See full history at [docs/changelogs/vrcp-crawler-node/release](docs/changelogs/vrcp-crawler-node/release)

## VRC Packages API - `vrcp-packages-api`

<!-- vrcp-packages-api-DESCRIPTION_SUMMARY -->
test
<!-- vrcp-packages-api-DESCRIPTION_SUMMARY -->

test

See full history at [docs/changelogs/vrcp-packages-api/release](docs/changelogs/vrcp-packages-api/release)

---

# Internal - Release

## VRC Packages Web - `vrcp-web`

<!-- vrcp-web-DESCRIPTION_SUMMARY -->
test
<!-- vrcp-web-DESCRIPTION_SUMMARY -->

test

See full history at [docs/changelogs/vrcp-web/release](docs/changelogs/vrcp-web/release)

## VRC Packages Worker - `vrcp-worker`

<!-- vrcp-worker-DESCRIPTION_SUMMARY -->
test
<!-- vrcp-worker-DESCRIPTION_SUMMARY -->

test

See full history at [docs/changelogs/vrcp-worker/release](docs/changelogs/vrcp-worker/release)

---

# Applications - Preview

## VRC Packages Crawler - `vrcp-crawler-client-preview`

<!-- vrcp-crawler-client-preview-DESCRIPTION_SUMMARY -->
test
<!-- vrcp-crawler-client-preview-DESCRIPTION_SUMMARY -->

test

See full history at [docs/changelogs/vrcp-crawler-client/preview](docs/changelogs/vrcp-crawler-client/preview)

## VRC Packages Crawler - `vrcp-crawler-node-preview`

<!-- vrcp-crawler-node-preview-DESCRIPTION_SUMMARY -->
Headless crawler node daemon improvements including pure `.env`-driven configuration, durable SQLite outbox result staging with crash-restart recovery, and adaptive idle polling backoff with jitter.
<!-- vrcp-crawler-node-preview-DESCRIPTION_SUMMARY -->

### Added
- **Durable Result Outbox**: Added SQLite WAL-backed `node_outbox` table in `LocalNodeStore` with automatic 24-hour TTL and 50MB disk quota pruning.
- **Crash Recovery & Replay**: Added startup and reconnection outbox flush in `CrawlerNodeDaemon` to replay unacknowledged results without data loss across process crashes or network interruptions.
- **Adaptive Idle Backoff Ladder**: Implemented dynamic backoff ladder scaling from 5s to 60s (`1.5x` multiplier) with configurable `±20%` bounded jitter, resetting immediately to base interval upon leasing a job.
- **Envelope Wire Bounds**: Enforced 2MB streaming response limits in `CoordinatorClient` and strict length bounds on job URLs, origin URLs, ETags, and Last-Modified headers.

### Bugs Fixed
- **Fleet Claim Polling**: Fixed unbounded fleet claim polling by eliminating aggressive 1s spin loops on empty queues, mitigating Cloudflare request allowance exhaustion.

### Changes
- **Headless `.env` Execution**: Removed interactive CLI tooling (`init`, `help`, `printSetupGuide()`) and `node.config.json` setup wizard; daemon now starts directly from environment variables / `.env` (`NODE_ID`, `NODE_TOKEN`, and optional `COORDINATOR_URL`, `NODE_CAPABILITIES`, `NODE_DB_PATH`).
- **Fail-Fast Configuration Validation**: Updated runtime configuration error reporting to fail fast with concise guidance pointing to `.env` variables instead of CLI setup commands. Preserved `--version` and `--once` execution modes.

See full history at [docs/changelogs/vrcp-crawler-node/preview](docs/changelogs/vrcp-crawler-node/preview)

## VRC Packages API - `vrcp-packages-api-preview`

<!-- vrcp-packages-api-preview-DESCRIPTION_SUMMARY -->
test
<!-- vrcp-packages-api-preview-DESCRIPTION_SUMMARY -->

test

See full history at [docs/changelogs/vrcp-packages-api/preview](docs/changelogs/vrcp-packages-api/preview)

---

# Internal - Preview

## VRC Packages Web - `vrcp-web-preview-preview`

<!-- vrcp-web-preview-preview-DESCRIPTION_SUMMARY -->
test
<!-- vrcp-web-preview-preview-DESCRIPTION_SUMMARY -->

test

See full history at [docs/changelogs/vrcp-web/preview](docs/changelogs/vrcp-web/preview)

## VRC Packages Worker - `vrcp-worker-preview`

<!-- vrcp-worker-preview-DESCRIPTION_SUMMARY -->
Coordinator D1 storage updates aligning fleet claim pacing and empty queue backoff intervals.
<!-- vrcp-worker-preview-DESCRIPTION_SUMMARY -->

### Added
- **Fleet Pacing Support**: Aligned coordinator response contracts to coordinate minimum polling retry intervals across distributed crawler nodes.

### Bugs Fixed
- **Excessive Claim Polling**: Mitigated rapid-fire claim requests from idle crawler nodes exhausting coordinator daily request allowances.

### Changes
- **Empty Claim Retry Interval**: Aligned default coordinator empty queue `retryAfterMs` from 1,000ms to 5,000ms in D1 coordinator storage (`src-worker/src/storage/d1/coordinator.ts`) and local SQLite simulation.

See full history at [docs/changelogs/vrcp-worker/preview](docs/changelogs/vrcp-worker/preview)

---

# Internal - Packages

## VRC Packages Network `vrcp-packages-network`

<!-- vrcp-packages-network-DESCRIPTION_SUMMARY -->
test
<!-- vrcp-packages-network-DESCRIPTION_SUMMARY -->

test

See full history at [docs/changelogs/vrcp-packages-network/](docs/changelogs/vrcp-packages-network/)
