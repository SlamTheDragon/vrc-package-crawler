<!-- LOCKED DOCUMENTATION - DO NOT CHANGE HEADERS AND TOP-LEVEL DESCRIPTION & NAVIGATION. CHANGES MUST PRESERVE BULLET-POINT DELIVERY IN SUB-HEADERS. SUMMARIES MUST BE COMPACTED, AND ALWAYS FALL INSIDE THE SPECIFIED SUMMARY HEADER -->
<!-- CLEAR ENTRIES DURING PUBLISHING -->

# Changelog

Here are the latest changelogs of each package and applications. For a full history, please visit [docs/changelogs](docs/changelogs)

## What Changed

<!-- MASTER_SUMMARY -->

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
empty
<!-- vrcp-crawler-node-preview-DESCRIPTION_SUMMARY -->

### Added
- **Outbox Quota Flow Control**: Paused job claims when pending outbox entries exceed configured limits to avoid memory and disk saturation.
- **Startup Crash Recovery**: Reset interrupted outbox submissions to pending status on daemon start to resume deliveries safely.
- **Periodic Storage Pruning**: Added background TTL maintenance intervals to remove old acknowledged entries during active runs.
- **Batched Outbox Flush**: Updated `flushOutbox` to submit up to 10 results in one request using `submitBatch`.
- **Per-Item Receipt Tracking**: Processed individual accepted and rejected receipts to isolate failures during batch flushes.
- **Batched Claim Support**: Added optional `maxJobs` parameter to `CoordinatorClient.claim` to request multiple jobs.
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
none
<!-- vrcp-packages-api-preview-DESCRIPTION_SUMMARY -->

- none currently

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
Coordinator updates for intensive application candidate tracking, automatic threshold flagging, and operator and moderator review pathways.
<!-- vrcp-worker-preview-DESCRIPTION_SUMMARY -->

### Added
- **App Activity Tracking**: Tracked application request count and last active timestamp on all downstream API invocations.
- **Intensive-Use Candidate Flagging**: Flagged applications with 50 or more requests automatically as review pending candidates.
- **Operator Candidate Review**: Added `POST /v1/operator/apps/:appId/candidate-review` to update status and delegation permissions.
- **Moderator Candidate Endpoints**: Added `GET /v1/moderator/apps` and `POST /v1/moderator/apps/:appId/candidate-review` for age-verified staff.
- **Candidate Status Filtering**: Added `candidateStatus` query parameter to application listing endpoints.
- **Moderator Rating Endpoints**: Added `GET /v1/moderator/ratings` and `POST /v1/moderator/ratings/:canonicalId` for content rating oversight.
- **Moderator Access Gate**: Enforced verified age and moderator authority checks on all `/v1/moderator/*` routes.
- **Storage Rating Adjustment**: Implemented `listModeratorRatingsPage` and `adjustPackageRating` on coordinator storage engines.
- **Moderator Flag Storage**: Added `is_moderator` flag to `registered_users` schema for staff authorization.
- **Delegation Authority Check**: Enforced `claims:delegate` permission check on `/v1/app/claims/intake` to reject un-reviewed applications with 403 Forbidden.
- **Operator Application Endpoints**: Added `GET /v1/operator/apps` and `POST /v1/operator/apps/:appId/delegation` for application inspection and delegation control.
- **Storage Delegation Management**: Implemented `listOperatorAppsPage` and `setAppDelegation` on coordinator storage engines.
- **Content Rating Storage**: Added `content_rating` column to `canonical_packages` with default `general`.
- **User Age Verification Storage**: Added `age_verified` integer flag to `registered_users` schema.
- **Fail-Closed Public Index**: Filtered public catalog and delta feeds to serve only `general` rated packages.
- **Age-Gated Package Search**: Restricted age-rated catalog search results to applications owned by verified users.
- **Delegated Creator Claim Intake**: Added `/v1/app/claims/intake` with atomic replay protection on application ID and nonce.
- **Operator Claim Review Endpoints**: Added `/v1/operator/claims` and `/v1/operator/claims/{id}/verify` for listing and reviewing stored claims.
- **Cryptographic Delegation Benchmark**: Measured Web Crypto verification budgets under the 10 ms CPU limit for HMAC and ECDSA.
- **Query Log Redaction**: Redacted full request URLs in error logs to prevent query parameter leaks.
- **Fail-Fast Bearer Authentication**: Validated node authorization headers before body streaming and schema parsing to prevent resource exhaustion.
- **Expired Lease Classification**: Tagged late result submissions with the terminal rejection code `lease_expired`.
- **Post-Expiry Replay Idempotency**: Returned accepted duplicate receipts when clients replay previously accepted jobs after lease expiry.
- **Batched Claim Route**: Added multi-job claims up to 10 items with per-origin reservations to prevent single-origin contention.
- **Batched Result Endpoint**: Implemented `/v1/node/jobs/results` with per-item idempotency and atomic transactional commits.
- **Partial Failure Isolation**: Added per-item accepted and rejected receipts with terminal error classification.
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
Node protocol contracts adding batched job claims and batched result submission schemas with receipts.
<!-- vrcp-packages-network-DESCRIPTION_SUMMARY -->

### Added
- **Batched Claim Schema**: Added `maxJobs` parameter to `ClaimRequestSchema` and `jobs` array to `ClaimResponseSchema`.
- **Batched Result Schemas**: Added `BatchResultRequestSchema`, `BatchResultResponseSchema`, and `BatchResultReceiptSchema`.
- **Batch Size Limits**: Pinned `MAX_CLAIM_JOBS` and `MAX_BATCH_RESULTS` constants to 10 items.

See full history at [docs/changelogs/vrcp-packages-network/](docs/changelogs/vrcp-packages-network/)
