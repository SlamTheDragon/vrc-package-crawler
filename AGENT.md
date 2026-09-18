# Phase 2 Handover: Reporting Pipeline, Architecture Expansion & Codebase Audit

**Repository:** `F:\.repo\.main\vrc-package-crawler`
**Status at handover:** Phase 1 complete and pushed (`2c3d02e`). Phase 2 scope defined below.

---

## 1. Confirmed Implementation State (Phase 1 Output)

### ✅ Built and verified (22/22 tests passing)

| File | Status | Notes |
|---|---|---|
| `src/db_v2.ts` | ✅ Complete | V2 schema deployed: `entities_v2`, `frontier_v2`, `canonical_packages_v2`, `package_fronts_v2`, `media_cache_v2`, `sync_checkpoints`, `user_reports_v2`, `search_patterns_v2`, `creator_opt_outs_v2` |
| `src/migrate_v2.ts` | ✅ Complete | Zero-loss migration of all V1 data verified |
| `src/utils/robots.ts` | ✅ Complete | RFC 9309 enforcer with permissive network-error fallback |
| `src/utils/poisson_scheduler.ts` | ✅ Complete | Cho-Garcia-Molina adaptive re-crawl with dual V1/V2 writes |
| `src/utils/ipc.ts` | ✅ Complete | Loopback control server on `127.0.0.1:8765` |
| `src/utils/image_proxy.ts` | ✅ Complete | WebP transcoding, BlurHash, pHash, 2MB guardrail |
| `src/exporter.ts` | ✅ Complete | `VACUUM INTO` FTS5 catalog export |
| `src/sync.ts` | ✅ Complete | Cloudflare D1/R2 delta sync with high-watermark |
| `src/pipeline_sanitize.ts` | ✅ Modified | Creator opt-out enforcement, origin timestamps, URL sanitization |
| `docs/REPORTING_SCHEMAS.md` | ✅ Complete | Schemas 1–4 fully documented |

### ❌ Not yet built (Phase 2 scope)

| File | Status | Reason |
|---|---|---|
| `src/server.ts` | ❌ Not created | Coder crashed before Stage 4 implementation |
| `src/steering.ts` | ❌ Not created | Depends on `server.ts`; processing loop not wired |

**Confirmed via grep:** `user_reports_v2` and `search_patterns_v2` tables exist in the schema but are **never read or written to** from any running code path. The tables are present but fully inert.

---

## 2. Immediate Next Task: Reporting Pipeline (server.ts + steering.ts)

### 2.1 Intended data flow

```
Interfacing App (VRCX, web portal, Tauri client)
    │
    │  Option A: POST /v1/reports  (push, direct HTTP)
    │  Option B: Upload to Cloudflare R2 bucket (pull, async — see §3)
    ▼
src/server.ts
    │  Validates Schema 4 payload
    │  Writes to user_reports_v2 (status = 'pending')
    ▼
src/steering.ts  (processing loop, runs every N minutes)
    │
    ├─ DISCOVERY_SEED       → INSERT into frontier_v2 (priority = 100, next_fetch_at = NOW)
    ├─ SEARCH_PATTERN       → UPSERT into search_patterns_v2 (negative token or seed query)
    ├─ NAME_OVERRIDE        → UPSERT into curator_overrides (feeds registration arbitration)
    ├─ LISTING_STATUS       → UPDATE entities_v2 relevance_status flag
    └─ CREATOR_OPTOUT       → INSERT into creator_opt_outs_v2 + purge cached metadata
    │
    │  Marks report status = 'applied'
    ▼
Crawler daemon reads from search_patterns_v2 at each discovery sweep
Pipeline reads curator_overrides during name/description arbitration
```

### 2.2 src/server.ts — Bun HTTP server specification

```typescript
// Endpoints to implement:
// POST /v1/reports              — ingest Schema 4 user steering report
// GET  /v1/catalog/delta        — emit Schema 1 feed delta (cursor-paginated, SHA-256)
// GET  /v1/vpm/index.json       — emit Schema 2 VCC/ALCOM repository manifest
// GET  /v1/health               — daemon liveness check

// Validation: JSON Schema validation against Schema 4 structure
// Rate limiting: max 10 reports/min per client fingerprint
// Auth: optional HMAC-SHA256 bearer token (configurable via CRAWLER_API_TOKEN env var)
```

### 2.3 src/steering.ts — Processing loop specification

```typescript
// Runs every 5 minutes via setInterval inside the daemon
// Reads all user_reports_v2 WHERE status = 'pending'
// For each: validate, apply side-effects (see flow above), mark 'applied'
// Name arbitration: writes to curator_overrides_v2 table (NEW — add to schema)
// Negative token: appends to search_patterns_v2, immediately applies to active queries
```

> [!IMPORTANT]
> A `curator_overrides_v2` table is missing from the current V2 schema. It must be added to `src/db_v2.ts` to persist name/description overrides separately from the ephemeral canonical projection so they survive pipeline rebuilds.

---

## 3. Architectural Shift: Pull-Based Report Ingestion from Cloud Bucket

### Current design (push-only)
Client apps POST directly to `src/server.ts` running on the crawler host. This requires the crawler to expose a public HTTP endpoint — a security surface and an availability dependency.

### Proposed shift (pull from Cloudflare R2 / Firebase)

```
Interfacing App
    │
    │  PUT https://r2.cloudflare.com/<bucket>/reports/<uuid>.json
    │  (authenticated via presigned URL or Firebase client SDK)
    ▼
Cloudflare R2 Bucket: vrc-crawler-reports/
    │
    │  (crawler polls on a schedule, or R2 event triggers a Worker)
    ▼
src/steering.ts (pull loop)
    │  Lists new objects in bucket prefix reports/pending/
    │  Downloads and validates each Schema 4 payload
    │  Writes to user_reports_v2 locally
    │  Moves object to reports/processed/<uuid>.json
    ▼
Crawler reads from user_reports_v2 and applies steering
```

**Benefits of pull architecture:**
- Crawler host does not need a public IP or open port
- Reports survive crawler downtime (buffered in R2)
- Multiple crawler instances can consume the same report queue independently
- Cloudflare R2 event notifications can trigger Workers for immediate high-priority seed promotion

**What this mandates for interfacing applications:**
- Clients get a presigned R2 upload URL (or Firebase push credentials) from a lightweight auth gateway
- The gateway can be a single Cloudflare Worker that issues short-lived presigned URLs after validating client identity
- This paves the path to user accounts (see §4.1)

**Environment variables to add to `.env.example`:**
```
CRAWLER_REPORTS_BUCKET=vrc-crawler-reports
CRAWLER_REPORTS_POLL_INTERVAL_MINUTES=5
CRAWLER_API_TOKEN=           # Optional HMAC token for direct POST /v1/reports
```

---

## 4. Open Architectural Discussions (Future Phases)

### 4.1 User Accounts & Positive/Negative Signal Integration

User accounts enable persistent trust-weighted feedback. The reporting model evolves from anonymous one-shot reports to a tiered signal system:

| Tier | Weight | Auto-approved? |
|---|---|---|
| Anonymous reporter | 0.3 | No — queued for review |
| Verified creator (bio token confirmed) | 1.0 | Yes — for their own packages |
| Trusted curator | 2.0 | Yes — for all packages |

**Positive signals** (views, saves, installs tracked by interfacing apps) increment a `popularity_score` on `canonical_packages_v2`. High-popularity items are re-crawled more aggressively for version updates.

**Negative signals** (downvotes, "not a VRChat tool" flags) increment `negative_signal_count`. Sufficient negative signals trigger a relevance re-evaluation pass against the heuristic filter.

**Data design sketch:**
```sql
CREATE TABLE user_accounts (
  id TEXT PRIMARY KEY,             -- stable fingerprint or OAuth subject
  trust_tier TEXT DEFAULT 'anonymous'
    CHECK(trust_tier IN ('anonymous','verified_creator','trusted_curator')),
  report_count INTEGER DEFAULT 0,
  accepted_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

ALTER TABLE canonical_packages_v2 ADD COLUMN popularity_score REAL DEFAULT 0;
ALTER TABLE canonical_packages_v2 ADD COLUMN negative_signal_count INTEGER DEFAULT 0;
```

### 4.2 Neural Network / ML Enhancement for Crawl Classification

The current relevance classifier (`src/filter.ts`, 18.5 KB) uses deterministic heuristics: keyword scoring, regex rules, SimHash deduplication, and Fellegi-Sunter entity matching. Known gaps:
- Japanese-language BOOTH packages are underclassified
- Shader packs also sold as "outfits" are ambiguous
- Non-English VPM registries (Korean, Chinese communities) are not yet discovered

**Compliant ML enhancement path:**
1. Use `entities_v2` (43,583 records, `relevance_status` as binary label) as training corpus
2. Train a lightweight binary text classifier (fastText or small BERT fine-tune on title + description + tags)
3. Output: `ml_relevance_score` (0.0–1.0), additive to heuristic filter — deterministic filter retains veto power
4. Model weights and training code live in a **separate `vrc-classifier` repository** to maintain the Zero-Binary Invariant here
5. Crawler loads the serialized ONNX model (~5 MB) at startup, runs inference locally — no external API calls

> [!CAUTION]
> The Anti-AI Sanctity invariant (see `docs/topics/07_topics_to_learn_practice_observe_and_philosophies.md`) prohibits feeding indexed metadata into **generative AI training pipelines**. Discriminative binary classification (is this a VRChat tool?) is legally and contractually distinct from generative training and is compliant. This distinction must be explicitly documented in any ML delegation task.

### 4.3 Package Archival, Deletion, DMCA, and Legal Compliance Design

**Current gap:** No formal lifecycle state beyond `vetted` / `quarantined` / `discarded`. Delisted storefronts have no propagation path to downstream clients.

**Proposed package lifecycle states:**
```
published → updated → delisted        (404, domain gone)
                    → archived        (GitHub repo archived)
                    → paywall_intro   (was free, now paid)
                    → dmca_removed    (processed takedown, metadata purged)
                    → creator_opted_out
```

**DMCA and creator opt-out processing (24/48h SLA):**
1. Validate Schema 4 `CREATOR_OPTOUT_TAKEDOWN` report (bio token or DNS TXT verification)
2. Set `canonical_packages_v2.lifecycle = 'dmca_removed'`
3. Delete all `media_cache_v2` rows for this package, purge WebP from R2
4. Null out `description_ste`, `tags_json`, all storefront URLs in projection
5. Push tombstone record `{id, lifecycle: 'dmca_removed', delisted_at}` to D1 via forced sync watermark advance
6. Schema 1 delta feeds must include tombstone so clients purge local caches

**Audit trail:** Preserve raw DMCA event in `user_reports_v2` permanently — never delete.

**Schema additions needed:**
```sql
ALTER TABLE canonical_packages_v2
  ADD COLUMN lifecycle TEXT DEFAULT 'published'
  CHECK(lifecycle IN ('published','updated','delisted','archived',
                      'paywall_introduced','dmca_removed','creator_opted_out'));
ALTER TABLE canonical_packages_v2 ADD COLUMN lifecycle_updated_at TEXT;
```

### 4.4 Canonical Creation Timestamp Correction

**Current problem:** `original_listing_timestamp` is `MIN(observed published_at)` across fronts — often `NULL` for BOOTH, and based on crawl time rather than true publication.

**Priority ladder for canonical `created_at`:**
1. VPM manifest `published` field (authoritative)
2. GitHub API `created_at` (authoritative, already captured in driver)
3. BOOTH DOM `<div class="item-created-date">` (needs driver verification)
4. HTTP `Last-Modified` header (inferred)
5. `crawled_at` (fallback of last resort — must be flagged as low-confidence)

**Schema addition:**
```sql
ALTER TABLE canonical_packages_v2
  ADD COLUMN created_at_confidence TEXT DEFAULT 'unknown'
  CHECK(created_at_confidence IN ('confirmed','inferred','unknown'));
```

**Action items:** Backfill pass over `entities_v2` to re-extract timestamps from `raw_payload_json` where `listing_published_at IS NULL`.

---

## 5. Dead Code & Optimization Audit

Files **not imported** by any active entry point (`src/index.ts`, `src/status.ts`, `src/sync.ts`, `src/exporter.ts`):

| File | Original Purpose | Recommendation |
|---|---|---|
| `src/generate_uncataloged_doc.ts` | Generated markdown catalog file | **Archive** — superseded by `src/exporter.ts` and Schema 1/2 endpoints |
| `src/purge_pollution.ts` | One-time manual entity cleanup | **Archive** — `relevance_status` in `entities_v2` handles this continuously |
| `src/verify_quarantine.ts` | Manual re-evaluation of quarantined items | **Archive** — Poisson scheduler re-evaluates on every re-crawl |
| `src/clean_pass.ts` | One-time title/author normalization | **Archive** — normalization runs live in `pipeline_sanitize.ts` |
| `src/reharvest_vpm.ts` | One-time VPM re-harvest | **Archive** — VPM driver handles this via `frontier_v2` |
| `src/seed_frontier.ts` | One-time frontier seed script | **Archive** — migration and Poisson scheduler own the frontier |
| `src/cross_reference.ts` | Standalone cross-reference pass | **Verify** — logic may be merged into `pipeline_sanitize.ts`; confirm before archiving |
| `src/ratelimit.ts` | Exported `rateLimiter` shim (0.2 KB) | **Verify** — check if `src/utils/adaptive_limiter.ts` fully replaces it |

**In-file dead code to remove:**
- `src/pipeline_sanitize.ts` L449–L518: The Step 3 archive-1 reconciliation block is permanently `if ("")` dead. Remove (~65 lines).
- `src/index.ts`: `runZeroLossMigration()` called unconditionally on every startup. Gate behind `process.argv.includes('--migrate')` CLI flag.
- `src/db.ts`: Can be reduced to a read-only compatibility shim once the production DB migration is confirmed complete and V2 dual-writes are validated.

---

## 6. Handover Instructions for Next Agent

### Files to read before starting

```
docs/REPORTING_SCHEMAS.md               — Schema 4 spec (input format for server.ts)
src/db_v2.ts                            — Full V2 schema (tables to read/write)
docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md
docs/VRChat Asset Indexing Standards.md — Creator opt-out SLA and verification spec
docs/EDGE_SYNC_AND_SCALE_GUIDE.md       — Cloudflare D1/R2 setup
```

### Implementation order

1. `src/db_v2.ts` additions — `curator_overrides_v2`, `lifecycle` column, `created_at_confidence`
2. `src/server.ts` — Bun HTTP server (§2.2)
3. `src/steering.ts` — Processing loop (§2.3)
4. Dead code archival — move files from §5 to `archive/legacy/src/`, remove pipeline dead block
5. Pull-based R2 report polling integration into `src/steering.ts`

### Verification commands

```powershell
bun test              # Must remain 22+ pass, 0 fail
bun x tsc --noEmit    # Must remain 0 errors
bun run build:all     # All binaries must compile
```

All new server and steering functionality requires test files in `tests/`.
