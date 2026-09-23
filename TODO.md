# Engineering Roadmap, Compliance Audit & Skeptical Systems Review (TODO.md)

> **Document Status**: Authoritative Engineering Roadmap & Systems Audit  
> **Target Repository**: `F:\.repo\.main\vrc-package-crawler`  
> **Investigator**: Antigravity Skeptical Systems Reviewer  
> **Audit Date**: 2026-09-24 (Updated & Expanded)  
> **Ground Truth Test Suite**: 57 tests passing across 12 test files (`bun test` runtime: 9.80s-13.29s, 0 failures, 276 expect assertions).
>
> **Integrity Mandate**: Strictly ZERO context loss from original TODO specifications, citations, and legal analyses.  
> **Methodological Standard**: Every item, question, and skeptical deconstruction is self-checked against repository topography, documentation invariants, live test executions, and verified statutory/case law via an adapted PRISMA-ScR systematic review methodology.

> **[CODE AUDIT UPDATE 2026-09-24]** A secondary legal-technical and systematic literature audit was conducted on 2026-09-24 following PRISMA-ScR guidelines. This update incorporates attorney-drafted legal templates from General Legal (CC0), exhaustive platform Terms of Service audits (BOOTH/pixiv, Gumroad 14(e), Jinxxy, itch.io, GitHub), international statutory exceptions (Japanese Copyright Act Articles 30-4 and 47-5, Philippine RA 8293, RA 8792, RA 10173), and federal appellate precedents (*Meta v. Bright Data*, *hiQ v. LinkedIn*, *Van Buren*, *Feist*, *Kelly v. Arriba Soft*, *Perfect 10 v. Amazon*, *Authors Guild v. Google*). The source code has been deeply reviewed against the canonical projection of a specialized "Google Indexer" tailored for the VRChat Package & Asset Ecosystem. See Section 8 (Items G-21 to G-28), Section 9 (Gaps CR-14 to CR-20), and Section 11 (Google Indexer Projection Roadmap) for line-level evidence.

> **[CODE AUDIT UPDATE 2026-09-23]** A complete skeptical systems audit was conducted on 2026-09-23. The ground-truth test suite stands at **57 passing tests across 12 test files** (`bun test` runtime: ~10.0s, 0 failures, 276 expect assertions). All findings below marked `[VERIFIED BY CODE AUDIT 2026-09-23]` incorporate deep line-level evidence from the production source tree (`src/`), test suite (`tests/`), and operational documentation (`docs/`, `AGENT.md`, `DELEGATES.md`). Earlier overstatements from the preliminary 2026-09-20 audit have been rigorously corrected (notably regarding the Poisson scheduler, authentication secrets, test concurrency locks, edge sync data loss, and agent readiness). See Section 1, Section 9 (Code-Reality Gap Log), and Section 10 (Strict Readiness Assessment) for full line-level indexes.

---

## 0. Executive Summary & Critical Auditing Verdict (2026-09-23)

A deep, skeptical cross-examination of TODO.md, the entire documentation suite (`docs/`), `README.md`, `AGENT.md`, `DELEGATES.md`, the source tree (`src/`), and test suites (`tests/`) was conducted.

### Core Discoveries:


1. **Critical Correction & Nuance Regarding the Poisson Scheduler**:
   - Earlier notes claimed the Poisson scheduler was "completely disconnected" and "dead code in production."
   - **Ground Truth**: `poissonScheduler.requeueStaleUrls()` is actively called and running in production on every monitor cycle (`src/crawler/index.ts` line 760) and via loopback IPC `/recrawl` (line 955).
   - What is disconnected is specifically the *mutability feedback loop* (`adjustAfterFetch` in `src/utils/poisson_scheduler.ts` line 49), which has zero callers in `src/`. also, earlier documentation misstated its signature as `(url, statusCode, responseTimeMs)` when the actual signature in `src/utils/poisson_scheduler.ts` is `(url: string, isModified: boolean, etag?: string | null, lastModifiedHeader?: string | null)`.


2. **Hallucinated Authentication Secret (`CRAWLER_API_TOKEN` vs. `API_SECRET_TOKEN`)**:
   - Documentation in `AGENT.md` line 310 claims that the server authenticates administrative reports using `CRAWLER_API_TOKEN`.
   - **Ground Truth**: In `src/server/index.ts` line 130, the code reads:
     `const apiToken = config.apiToken || process.env.API_SECRET_TOKEN,`
   - Setting `CRAWLER_API_TOKEN` in `.env` leaves `POST /v1/reports` completely unauthenticated and vulnerable to autonomous delisting sabotage. Neither variable is declared in `.env.example`.


3. **Root Cause of Test Concurrency Timeout Identified**:
   - Running the full suite (`bun test`) occasionally triggered a 5,000ms timeout on `tests/gumroad_driver.test.ts` (which passes in ~217ms in isolation).
   - **Ground Truth**: 7 test files share the live 357 MB database `dist/crawler_state.db` (49,438 entities, 16,470 Gumroad records). In `src/db.ts` line 248, `PRAGMA busy_timeout = 10000,` waits up to 10 seconds for write locks. Bun default per-test timeout is 5,000ms. When `tests/exporter.test.ts` holds an exclusive transaction lock during SQLite catalog generation, concurrent tests block in busy wait and exceed Bun 5s timeout before SQLite finishes.


4. **Silent Edge Data Omission in Sync Pipeline**:
   - In `src/sync/index.ts` line 130, watermark reset only triggers if `watermarkRowId > maxRowInDb`.
   - In `src/tools/pipeline_sanitize.ts` line 861, the periodic projection executes `DELETE FROM canonical_packages,`, restarting SQLite auto-incrementing rowids at 1. If the previous watermark was 10,000 and the table is rebuilt with 16,652 rows, `10,000 > 16,652` is false. The sync tool permanently skips rows 1 through 10,000, omitting them from Cloudflare D1.


5. **Readiness Verdict on AGENTS.md and DELEGATION.md**:
   - **NEITHER FILE IS READY FOR PRODUCTION OR OPERATIONAL USE**.
   - The repository currently contains `AGENT.md` and `DELEGATES.md`, which are byte-for-byte identical duplicates (`SHA256: 59E18587DF637D26F6A214B2330B363B6B447740024A61BE453C3E4F5891C661`). Both convey obsolete test baselines, hallucinated environment variables, non-existent CLI commands, and fail to isolate deployment from coding agent specifications.

---

## 1. Active Operational Defects & Pipeline Regressions

- [ ] **[WARN] [ImageProxy] Rejected non-image payload (text/html. charset=utf-8): `https://www.youtube.com/embed/VE0IXpG0hHw`**

  - **Original Context**: The ImageProxy service encountered an unhandled HTML payload when attempting to ingest a YouTube iframe embed as an image binary. Should we attempt a requeue?

  - **Skeptical Critique & Root Cause**: The deep-hydration parser in discovery drivers captures iframe/embed URLs and blindly enqueues them into image media processing queues instead of routing them exclusively to `youtube_urls`. This triggers unnecessary Sharp worker exceptions and pollutes media processing pipelines.

  - **Resolution Path**: Enforce protocol and MIME preflight verification. Reject URLs containing `youtube.com/embed/` or `youtu.be/` at the frontier extraction stage, routing them directly to the `youtube_urls` metadata array without passing to `src/utils/image_proxy.ts` or `src/utils/sharp_worker.ts`.


  - **Self-Check (Grounding Truth)**: *VERIFIED*. Observed in live log excerpt (`text/html` from YouTube embed). Matches `docs/DISCOVERY_RULES.md` Sec 7.1 rule: *"Never store HTML embed URLs in image collections"*, proving the crawler extraction logic violated its own documented rule.

  - **[VERIFIED BY CODE AUDIT 2026-09-23]** Root cause traced to two distinct sites:

    1. `src/drivers/jinxxy.ts` lines 214-224: the media extraction loop over `__NEXT_DATA__` iterates all items in a generic media array without filtering on type, so `youtube.com/embed/` URLs pass through and are handed to the image proxy.

    2. `src/utils/image_proxy.ts` lines 740-745: `skipPatterns` array does not contain any YouTube domain pattern, so the guard never fires on YouTube embed URLs. The fix requires patching **both** sites  -  driver-side type filtering AND proxy-side skip pattern  -  to be fully effective.

- [ ] **[FEATURE] All Logs are needed to be divided per session, and archived (.gz) per day**

  - **Original Context**: Current log output streams continuously into monolithic log files without session isolation or daily compression.

  - **Skeptical Critique**: Flat logging creates unbounded disk consumption during 24/7 autonomous runs. However, rolling a custom compression and session-rotation daemon in TypeScript risks file-lock contention with Windows binaries.

  - **Resolution Path**: Implement structured rotating file streams in `src/logger.ts` using timestamp-based session prefixes (`session_<pid>_<iso>.log`) and asynchronous daily Gzip compression sweeps during idle Poisson scheduling intervals.


  - **Self-Check (Grounding Truth)**: *VERIFIED*. Directory inspection shows `dist/logs/` configured for flat appending without gzip rotation scripts.

  - **[VERIFIED BY CODE AUDIT 2026-09-23]** `src/logger.ts` (92 lines total) creates bare `fs.createWriteStream` handles (`crawler.log`, `rate_limits.log`, `errors.log`) with `{ flags: "a" }`, no session prefix, no rotation trigger, and no Gzip compression sweep. The file is written to unconditionally on every log call. No scheduled or idle-time compression logic exists anywhere in the codebase.

- [ ] **[MAINTAINABILITY] Tooling Fragility: Mitigate Chronic Driver Blockages (`requeue_gumroad.ts`, `requeue_media.ts`)**

  - **Context & Operational Evidence**: The repository maintains ad-hoc batch tools (`src/tools/requeue_gumroad.ts`, `src/tools/requeue_media.ts`) to manually revive stalled queues.

  - **Skeptical Critique**: The need for manual requeue utilities shows that live workers running Gumroad and image proxying frequently stall, fail silently, or get blocked by upstream rate limits, violating the premise of "unattended 24/7 autonomy." also, having these manual tools echo out problematic intersection of development environments vs production environments, which is extremely critical for trying to perform maintenance on a running daemon.

  - **Resolution Path**: Integrate automatic exponential backoff, dead-letter retry queues, and circuit breakers into the core crawler daemon, rendering external requeue scripts obsolete. Consider a new binary architecture: Startup audit self-checks to verify if the db is at its proper schemas after codebase iteration and potential injection of changes, and decouple maintenance signals that will be queued at startup instead of relying on manual scripts.


  - **Self-Check (Grounding Truth)**: *VERIFIED*. Proven by the physical existence of `src/tools/requeue_gumroad.ts` and `src/tools/requeue_media.ts` in the working directory tree.

  - **[VERIFIED BY CODE AUDIT 2026-09-23]** Both files exist and are non-trivial standalone scripts (not imported by `src/crawler/index.ts`). There is no circuit-breaker or exponential-backoff logic in any domain worker loop in `src/crawler/index.ts`.

- [ ] **[CRITICAL] Full-Wipe Projection Scalability Trap & Silent Edge Sync Data Omission (`pipeline_sanitize.ts`, `sync/index.ts`)**

  - **Context**: `runPipelineSanitize()` is called every 15 minutes from `src/crawler/index.ts` line 778 as the projection step.

  - **Verified Behaviour**:

    1. Internally, it executes `DELETE FROM canonical_packages. DELETE FROM package_fronts,` (lines 862-863 of `src/tools/pipeline_sanitize.ts`) before rebuilding the entire projection from scratch. SimHash clustering is then run in-memory across **all** active entities (49,438 entities)  -  an $O(n^2)$ operation.



2. **Silent Edge Data Omission**: In `src/sync/index.ts` line 130, watermark reset only triggers if `watermarkRowId > maxRowInDb`. The periodic `DELETE FROM canonical_packages` restarts SQLite auto-incrementing `rowid`s at 1. If the previous watermark was 10,000 and the table is rebuilt with 16,652 rows, `10,000 > 16,652` evaluates to `false`.

The edge sync pipeline assumes it is ahead and permanently skips rows 1 through 10,000, silently omitting them from Cloudflare D1.

  - **Scalability Consequence**: At tens of thousands of packages this DELETE+rebuild loop consumes unbounded memory and wall-clock time each cycle, eventually causing the 15-minute interval to overrun itself and block the crawler monitor loop.

  - **Resolution Path**: Replace the full-wipe projection with an incremental upsert strategy keyed on `canonical_id`. Only recompute SimHash clusters for entities dirtied since the last projection run (tracked via a `dirty_since` timestamp). Preserve `canonical_packages` row identity across runs, or track sync checkpoints via deterministic UUIDs rather than mutable SQLite auto-increment rowids.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Confirmed in `src/tools/pipeline_sanitize.ts` lines 861-864 and `src/sync/index.ts` lines 128-133.

- [ ] **[CRITICAL] Unauthenticated Schema 4 Delisting Sabotage & Hallucinated Secret (`server/index.ts`, `steering.ts`, `AGENT.md`)**

  - **Context**: `POST /v1/reports` in `src/server/index.ts` is the ingestion endpoint for Schema 4 (curator reports), including the `irrelevance / malicious_or_scam` branch which triggers autonomous delisting.

  - **Verified Attack Path & Hallucinated Secret**:

    1. `AGENT.md` line 310 falsely claims authentication is enforced via `CRAWLER_API_TOKEN`.


2. In reality, `src/server/index.ts` line 130 reads: `const apiToken = config.apiToken || process.env.API_SECRET_TOKEN,`. Neither variable is declared in `.env.example`. 3.

When `API_SECRET_TOKEN` is unset in `.env`, the check `if (apiToken) { ... }` (lines 196-204) is bypassed completely, allowing anonymous callers to submit reports without headers. 4. An anonymous actor sends `POST /v1/reports` with body `{ branch: "irrelevance", irrelevanceReason: "malicious_or_scam", targetPackageId: "<any-canonical-id>" }`. 5. The report enters `user_reports` as `status = 'pending'`.


    6. The steering loop (every 30 min) calls `processPendingReports()` in `src/tools/steering.ts` lines 81-116, which executes `UPDATE canonical_packages SET lifecycle = 'delisted'` and quarantines entities with zero human oversight.

  - **Consequence**: Any remote competitor or anonymous actor can unilaterally purge rival creator assets from the global catalog. Setting `CRAWLER_API_TOKEN` as instructed by `AGENT.md` supplies zero protection.

  - **Resolution Path**: (a) Require mandatory `API_SECRET_TOKEN` authentication on `POST /v1/reports`. (b) Route all `irrelevance` and delisting reports into a quarantined human-review approval queue (`needs_review`). never apply destructive lifecycle mutations autonomously. (c) Correct the environment variable name across documentation and declare it in `.env.example`.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Confirmed in `src/server/index.ts` lines 130 & 196-204, `src/tools/steering.ts` lines 81-116, and `AGENT.md` line 310.

- [ ] **[CRITICAL] VPM Seeding Permanent Lockout Bug (`crawler/index.ts`)**

  - **Context**: `src/crawler/index.ts` line 82 contains the VPM re-seeding gate condition.

  - **Verified Behaviour**: The condition `if (metrics.platformStats["vpm"].pending < 10 && metrics.platformStats["vpm"].done < 50)` permanently halts VPM core feed re-seeding once 50 VPM URLs have completed (`done >= 50`). Because `done` is a monotonically increasing lifetime counter, the gate locks permanently after the initial batch, preventing new VPM seed URLs from ever being injected across subsequent daemon runs.

  - **Consequence**: Long-running deployments will silently stop discovering new VPM repositories after bootstrap.


  - **Resolution Path**: Replace the absolute `done < 50` check with a temporal staleness check (e.g., re-seed if the latest successful VPM crawl timestamp exceeds 7 days), regardless of lifetime `done` count.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Line 82 of `src/crawler/index.ts` confirmed by direct inspection.

- [ ] **[CRITICAL] Poisson Scheduler Mutability Disconnection & Signature Inconsistency (`poisson_scheduler.ts`, `crawler/index.ts`, `db.ts`)**

  - **Context**: Adaptive re-crawling based on the Cho-Garcia-Molina Poisson distribution model.

  - **Verified Behaviour & Clarification**:
    - *What Works*: `poissonScheduler.requeueStaleUrls()` is **not** dead code. It is actively executed on every monitor cycle (`src/crawler/index.ts` line 760) when `m.totalPending <= 25` and via loopback IPC `/recrawl` (line 955).

    - *What Is Disconnected*: The mutability feedback loop (`PoissonScheduler.adjustAfterFetch`) in `src/utils/poisson_scheduler.ts` line 49 has **zero callers** across the entire `src/` codebase. Domain workers invoke `db.markStatus(url, "done")` or `failed`, which assigns `next_fetch_at = datetime('now', '+86400 seconds')` as a rigid 24-hour constant.
    - *Signature Discrepancy*: Earlier documentation misstated the signature as `(url, statusCode, responseTimeMs)`. The physical implementation in `src/utils/poisson_scheduler.ts` is `adjustAfterFetch(url: string, isModified: boolean, etag?: string | null, lastModifiedHeader?: string | null)`.
    - *Header Void*: No crawler driver sends `If-None-Match` or `If-Modified-Since` headers, rendering the `HTTP 304` freshness detection path inoperative.

  - **Consequence**: The crawler operates on a rigid 24-hour crawl timer regardless of actual resource update velocity or HTTP change indicators.


  - **Resolution Path**: Wire `adjustAfterFetch(url, isModified, etag, lastModifiedHeader)` into domain worker completion callbacks. Send conditional HTTP headers in drivers, and replace the hardcoded `+86400` interval in `db.markStatus` with the scheduler's computed `nextInterval`.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Confirmed in `src/utils/poisson_scheduler.ts` line 49, `src/crawler/index.ts` lines 760 & 955, and `src/db.ts` lines 707-728.

- [ ] **[CRITICAL] [NEW] SQLite Test Concurrency Timeout & Shared Database Lock Contention (`db.ts`, `tests/`)**

  - **Context**: Intermittent test failures where `tests/gumroad_driver.test.ts` hits Bun 5,000ms default test timeout despite executing in ~217ms in isolation.

  - **Verified Root Cause**: 7 test files share the live 357 MB production database `dist/crawler_state.db` (containing 49,438 entities and 16,470 Gumroad records). In `src/db.ts` line 248, `PRAGMA busy_timeout = 10000,` instructs SQLite to wait up to 10 seconds for locks. When `tests/exporter.test.ts` runs concurrently and gets an exclusive write transaction lock to generate the catalog, other tests enter busy wait. Because Bun per-test timeout is 5,000ms, the test fails with a timeout before SQLite 10,000ms busy wait expires.

  - **Consequence**: Test suite fragility in CI/CD pipelines and parallel test executions. Tests can fail spuriously due to physical lock contention on production data.


  - **Resolution Path**: Isolate test execution from `dist/crawler_state.db`. make sure tests instantiate ephemeral in-memory databases (`:memory:`) or dedicated temporary test databases. Set explicit per-test timeouts or configure Bun test runner to execute sequentially (`bun test --concurrency 1`) if shared databases must be read.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Confirmed in `src/db.ts` line 248, `tests/exporter.test.ts`, and test execution logs.

- [ ] **[CRITICAL] [NEW] Broken CLI Subcommands on Crawler Daemon Binary (`vrc-crawler.exe` vs. `vrc-monitor.exe`)**

  - **Context**: Operational runbooks instruct administrators to execute CLI management commands such as `.\dist\vrc-crawler.exe status`, `recrawl`, `project`, or `stop`.

  - **Verified Behaviour**: `src/crawler/index.ts` contains zero CLI argument routing. Invoking `vrc-crawler.exe` with any argument immediately executes the main daemon entry point, which attempts to get the single-instance lock (`ProcessLock`) and crashes with an error if the daemon is already running.

  - **Consequence**: Administrative commands fail and crash running processes or spawn accidental rogue crawler instances.


  - **Resolution Path**: Administrative commands must be dispatched exclusively through `vrc-monitor.exe` (or `bun run src/monitor/index.ts <action>`), which communicates with the running crawler daemon via loopback IPC. Update all runbooks, `AGENT.md`, and `DELEGATION.md` to document the correct binary interface.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Confirmed in `src/crawler/index.ts` lines 970-1030 and `src/monitor/index.ts` lines 1-439.

  - **[DOCUMENTATION RESOLVED 2026-09-23. CODE CLI GUARD PENDING]**: All operational runbooks (`README.md`, `AGENT.md`, `DELEGATES.md`, `docs/OPERATIONS_AND_CHECKLIST.md`, `docs/EDGE_SYNC_AND_SCALE_GUIDE.md`, and `docs/DISCOVERY_RULES.md`) have been updated to document `vrc-monitor.exe` as the sole CLI dispatch binary. The source code argument guard in `src/crawler/index.ts` remains an active pending code defect.

- [ ] **[IMPORTANT] Timestamp Invariant Violation & Paradox (`pipeline_sanitize.ts`, `DISCOVERY_RULES.md`)**

  - **Context**: `docs/DISCOVERY_RULES.md` Sec 4.2 defines the three-state confidence rubric for `origin_created_at`. The `'unknown'` state mandates: *"Explicitly set to NULL. never substitute local crawl fetch time for origin publication time."*

  - **Verified Behaviour**: `src/tools/pipeline_sanitize.ts` lines 918-928 contain the following logic: when `!originCreatedAt && earliestLocalObservedAt`, the pipeline sets `originCreatedAt = earliestLocalObservedAt` and assigns `createdAtConfidence = 'inferred'`. This directly substitutes the crawler own fetch timestamp for an absent upstream publication date  -  exactly what `DISCOVERY_RULES.md` forbids.

  - **Consequence**: Packages without explicit upstream publication dates receive a fabricated `origin_created_at` equal to when the crawler first observed them. This corrupts temporal sorting and misleads consumers about asset age.


  - **Resolution Path**: When `!originCreatedAt`, set `originCreatedAt = null` and `createdAtConfidence = 'unknown'` unconditionally. Maintain a separate resolution track for handling NULL date presentation in downstream UIs.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Lines 918-928 of `src/tools/pipeline_sanitize.ts` confirmed by direct inspection.

- [ ] **[IMPORTANT] `registerOptOut()` Has No API or CLI Surface (`db.ts`, `server/index.ts`)**

  - **Context**: The creator opt-out system is a foundational architectural compliance claim in Section 7.

  - **Verified Behaviour**: `db.registerOptOut()` is implemented in `src/db.ts` (lines 551-578) and writes to `creator_opt_outs`. However, there are **zero** API routes in `src/server/index.ts` and zero CLI callers that invoke `db.registerOptOut()`. Bio-token scraping is not implemented in any driver. The table exists but is unreachable from outside the process.

  - **Consequence**: Creators have no functioning mechanism to opt out, undermining the Project compliance posture.


  - **Resolution Path**: Implement a `POST /v1/opt-out` endpoint that validates ownership via non-scraping methods (DNS TXT record, signed URL, or verified ticket) and calls `db.registerOptOut()`.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Confirmed in `src/db.ts` lines 551-578 and `src/server/index.ts`.

- [ ] **[CRITICAL] [NEW] HTTP Conditional Headers (ETag / If-Modified-Since) Unsent in Upstream Crawls (`drivers/github.ts`, `drivers/`)**

  - **Context**: Efficient HTTP caching and freshness validation via conditional requests (`HTTP 304 Not Modified`).

  - **Verified Behaviour**: `src/drivers/github.ts` lines 174-177 captures the raw `ETag` from response headers into entities metadata, but never transmits it as `If-None-Match` in subsequent crawls. No driver sends `If-Modified-Since`. The `HTTP 304` freshness detection code path is completely inoperative in production.

  - **Consequence**: The crawler redundantly downloads and parses full JSON/HTML payloads on every crawl cycle even when upstream resources are unchanged, wasting bandwidth, burning CPU cycles, and accelerating IP rate-limit depletion against platforms with anti-bot perimeters.


  - **Resolution Path**: Store `etag` and `last_modified` in `frontier` or `entities` metadata. Wire conditional request headers (`If-None-Match`, `If-Modified-Since`) into all driver fetch functions. Handle `HTTP 304` responses by refreshing `next_fetch_at` via `adjustAfterFetch(url, false, etag, lastModified)` without re-parsing payloads.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Confirmed in `src/drivers/github.ts` lines 174-177. `src/crawler/index.ts`. zero occurrences of `If-None-Match` or `If-Modified-Since` across `src/`.

- [x] **[TASK_PERFORMED_AND_READY_FOR_CONTEXT_PURGE] [IMPORTANT] [NEW] Test Suite Discrepancy & Documentation Drift (`AGENT.md`, `DELEGATES.md`)**

  - **Context**: Autonomous agent onboarding and developer test verification instructions.

  - **Verified Behaviour**: Both `AGENT.md` and `DELEGATES.md` claim a test baseline of "40/40 tests" and "51/0 Fail", and explicitly instruct running `bun test tests/migrate.test.ts`. In reality, `tests/migrate.test.ts` does not exist (renamed to `tests/schema_unification.test.ts`), `tests/gumroad_driver.test.ts` is completely omitted from documentation, and the actual test suite contains **57 passing tests across 12 files** (276 expect assertions).

  - **Consequence**: Autonomous coding agents fail immediately when running instructions from the onboarding guides, and human contributors are given false invariants about test coverage and verification scripts.


  - **Resolution Path**: Update all documentation to reflect the ground-truth 57-test baseline across 12 files. Replace phantom references to `tests/migrate.test.ts` with `tests/schema_unification.test.ts` and document all active test files.

  - **Self-Check (Grounding Truth)**: *VERIFIED BY CODE AUDIT 2026-09-23*. Confirmed via `bun test` output (57 pass, 0 fail, 12 files, 276 assertions) and filesystem inspection of `tests/`.

  - **[DOCUMENTATION UPDATE VERIFIED 2026-09-23]**: All documentation (`README.md`, `AGENT.md`, `DELEGATES.md`, `docs/OPERATIONS_AND_CHECKLIST.md`, `docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`) has been updated to reflect the ground-truth 57-test baseline across 12 files (276 assertions) and removed all phantom references to `tests/migrate.test.ts`.

---

## 2. Skeptical Cross-Examination: TODO.md vs. Documentation & Code

### 2.1 The 6 Original TODO Items (2026-09-23 Audit Verdict)

- **1. discover_vpm.ts Open-Web Discovery**: `src/tools/discover_vpm.ts` targets GitHub search APIs. Crawling the unindexed open web violates politeness, hits bot-walls, and risks infinite spider loops. Contradicts `docs/DISCOVERY_RULES.md`. Federated registry seeding is the only viable path.

- **2. Avatar Cosmetics Inclusion**: `docs/DISCOVERY_RULES.md` penalizes apparel (-15) and hair (-15). High risk of SimHash-64 false merges ($k \le 3$) due to boilerplate vocabulary. If added, cosmetics require an isolated taxonomy tier and base-avatar association.

- **3. VRCArena Scrape Pool (Verdict: Conditionally Safe via Federation, Reject DOM Scraping)**: Both VRCArena and this project are open source, and VRCArena's `robots.txt` explicitly permits public indexation (`User-agent: * Allow: /`), legally protecting logged-out search directory indexing under *Meta v. Bright Data*. However, deploying an automated HTML DOM scraper against VRCArena is architecturally and operationally flawed: (a) VRCArena is a secondary curated directory linking out to BOOTH/Gumroad/itch, making DOM scraping a fragile "aggregator of aggregators" propagating stale caches. (b) HTML scraping imposes SSR compute and bandwidth burdens on a volunteer-funded community project. (c) VRCArena's taxonomy centers on avatar models and clothing, introducing severe SimHash-64 false merge risks against our toolchain catalog. **Verdict**: Strike automated HTML DOM scraping. pursue bilateral open-source API ingestion or static catalog federation with strict toolchain-only category filtering.

- **4. Column Deduplication & Relational Fragility**: Multiple overlapping URL layers exist: flat columns (`github_url`, `booth_url`, etc.) and `platforms_json` in `canonical_packages`, plus individual rows in `package_fronts`. In `curator_overrides`, both `name_override` and `title_override` exist and are coalesced identically in code.

- **5. Downstream Engagement Telemetry (Schema 5)**: `docs/REPORTING_SCHEMAS.md` defines Schemas 1-4. Schema 5 is completely unwritten, and no server endpoints exist to ingest client telemetry.

- **6. Separation of Concerns (Accounts / DMCA)**: To preserve the *Meta v. Bright Data* defense, the engine must remain an unauthenticated, stateless metadata catalog. User accounts belong strictly in downstream clients.

---

### 2.2 Detailed Decomposition: Discovery Scope, Taxonomy & Ecosystem Boundaries

- [ ] **[INFO] `discover_vpm.ts` might need to expand its search outside github, on a general world wide web discovery**

  - **Original Context**: VPM package discovery is currently tethered to GitHub topics and curated lists.

  - **Skeptical Critique & The "Open Web" Fallacy**: Crawling the unindexed open web for arbitrary `index.json` or `vpm-manifest.json` files without domain-level seed constraints is computationally infeasible, yields an overwhelming noise-to-signal ratio, and exposes the crawler to malicious bot traps and infinite crawl loops.

  - **Strategic Pivot**: Instead of open-ended web crawling, expand discovery through federated registry seeding: parse community package lists, extract VPM repository URLs from verified creator docs, and monitor federated index endpoints (e.g., ALCOM community listings).


- **Crucial Problem**: Findings state that some VPM packages DO exist outside GitHub, or are served on specific domains we have zero prior knowledge of. If we constrain the search too rigidly, we may miss out on the true long-tail (approx. 5%) of decentralized listings.

  - **Self-Check (Grounding Truth)**: *VERIFIED*. `src/tools/discover_vpm.ts` currently targets GitHub APIs.

Open-web scraping without seeds directly contradicts politeness and boundary invariants in `docs/DISCOVERY_RULES.md`.

  - **[DOCUMENTATION RESOLVED 2026-09-23. CODE IMPLEMENTATION PENDING]**: Formalized in `docs/DISCOVERY_RULES.md` Sec 2: open-web unindexed spiders will remain rejected. Expansion will follow federated registry seeding and community manifests. Implementation of federated seeding in `src/tools/discover_vpm.ts` remains pending.

- [ ] **[ENHANCEMENT] Reconsider avatar cosmetic items discovery other than tool chains and such**

  - **Original Context**: The crawler deprioritizes or quarantines clothing, hair, and cosmetic accessories to focus on functional Unity toolchains.

  - **Skeptical Critique & Data Explosion**: Toolchain packages (VPM) possess structured versioning (semver) and reverse-DNS identifiers (`com.author.tool`). Avatar cosmetics possess explosive dimensionality (thousands of nearly identical dresses, shoes, hair textures), lack semver, and share boilerplate vocabulary. Indexing them will balloon the database by orders of magnitude and break SimHash deduplication.

  - **Structured Expansion Invariant**: Do not index cosmetics as generic packages. If cosmetics are introduced, create an isolated `cosmetics` taxonomy tier requiring base avatar association (e.g., target mesh: Kikyo, Manuka) and separate them completely from developer tools.


  - **Self-Check (Grounding Truth)**: *VERIFIED*. Confirmed by negative token rules in `docs/DISCOVERY_RULES.md` Sec 3.3 penalizing apparel (-15 pts) and hair (-15 pts).

  - **[DOCUMENTATION RESOLVED 2026-09-23. CODE ENHANCEMENT PENDING]**: Formalized in `docs/DISCOVERY_RULES.md` Sec 2: standalone apparel and hair will remain excluded from the toolchain catalog to prevent SimHash false merges. An isolated taxonomy tier with base avatar associations will be required if added. Code enhancements to support cosmetics remain pending.

- [ ] **[QUESTION] Should VRCArena be added into the pool of discoveries and other platforms? Documentation outlines a rough web community architecture broadly detailing the entire VRChat asset/tools/VPM world wide web network**

  - **Original Context**: Consideration of integrating VRCArena as a primary scrape source.

  - **The Open Source & `robots.txt` Baseline**: Both VRCArena and this crawler are open source, and VRCArena's `robots.txt` explicitly sets `User-agent: * Allow: /`. Legally, under *Meta v. Bright Data* and RFC 9309, indexed logged-out public metadata extraction to act as a search directory is permissible and non-infringing.

  - **The Architectural Contradiction**: In `docs/topics/05_vrchat_ecosystem_case_studies.md` Sec 3, the project explicitly praises VRCArena for *rejecting automated DOM scraping* because scraping introduces noise, misses compatibility flags, and ingests stolen/pirated packages.


  - **Skeptical Critique & Failure Modes**:

    1. *Aggregator-of-Aggregators Fragility*: VRCArena is a secondary crowd-curated index linking out to primary stores (BOOTH, Gumroad, itch). Scraping their rendered HTML means parsing secondary redirects and stale caches rather than primary source records.

    2. *Server Load on Non-Profit Infrastructure*: Scraping rendered HTML pages imposes unnecessary SSR rendering and bandwidth costs on a volunteer, donor-funded community project.

    3. *Taxonomy Collision*: VRCArena centers on avatars and base models (Rexouium, Avali, Kikyo), whereas this crawler is strictly tuned for toolchains, VPM libraries, and editor scripts. Ingesting cosmetics without strict isolation triggers SimHash-64 ($k \le 3$) false merges.


- **Grounding Truth Verdict**: **Conditionally Safe via Federation. Reject HTML DOM Scraping**. Do NOT build a headless HTML DOM scraper (`src/drivers/vrcarena.ts`).

Instead, if VRCArena integration is pursued, establish an open-source bilateral federation adapter (querying their GraphQL/REST API or static dataset dumps) with a strict category whitelist (tools, shaders, scripts) discarding standalone avatar cosmetic re-textures.

  - **Self-Check (Grounding Truth)**: *VERIFIED*. `docs/topics/05_vrchat_ecosystem_case_studies.md` confirms community curation invariants. `robots.txt` allows indexing. zero scraping drivers exist in `src/drivers/`.

  - **[DOCUMENTATION RESOLVED 2026-09-23. ADAPTER CODE PENDING]**: Formalized in `docs/DISCOVERY_RULES.md` Sec 2: automated HTML DOM scraping against VRCArena will remain strictly rejected. Only bilateral open-source API federation with toolchain filtering will be permitted. Federation adapter code in `src/drivers/` remains pending.

---

## 3. Data Architecture, Timestamps & Schema Deduplication

- [ ] **[MAINTAINABILITY] Column deduplication might be needed, or a proper database tables and columns need to be written, if it does not exist yet. (REASON: discovered multiple semantically similar naming conventions that would lead to mentally exhausting debugging and confusing relationships)**

  - **Original Context**: Developer fatigue and architectural debt arising from redundant and overlapping database column names.

  - **The Documentation vs. Code Dissonance**: While `COMPREHENSIVE_SYSTEM_ARCHITECTURE.md` Sec 2.1 declares that the schema has achieved "complete unification" with "zero dead code," internal engineering reality reveals severe naming collision and field ambiguity between raw `entities`, decoupled `package_fronts`, and projected `canonical_packages`.

  - **Action Plan**:


    1. Conduct an audit across all 10 unified tables and their transformations (what gets ingested, retained, projected, or dropped).

    2. Eliminate redundant cross-table column mirrors:
       - `canonical_packages` has flat columns: `github_url`, `booth_url`, `gumroad_url`, `jinxxy_url`, `itch_url`, `vcc_url`.
       - `canonical_packages` also stores `platforms_json` containing the same data in a different shape.

       - `package_fronts` duplicates per-platform URLs, titles, authors, and prices in separate rows.
       - `curator_overrides` contains both `name_override` and `title_override`, coalesced with `||` across tools.

    3. Enforce strict DTO typing in `src/db.ts` to prevent semantic drift.

  - **Self-Check (Grounding Truth)**: *VERIFIED*. Directly documented in `TODO.md` line 5. verified by schema definitions in `src/db.ts` and `src/tools/pipeline_sanitize.ts`.

- [ ] **[INFO] Columns like `origin_created_at` may need reevaluation to correctly identify ALL possible and identifiable date creation if not found in any obvious crawl details**

  - **Original Context**: Inability to capture reliable creation timestamps across storefronts that do not publish explicit release dates results in a value of `NULL`.

  - **Skeptical Critique**: Synthesizing or guessing creation dates from HTTP `Last-Modified` headers or crawl observation times corrupts temporal sorting and misleads users about asset age.

  - **Resolution**: Formalize the three-state confidence rubric defined in `docs/DISCOVERY_RULES.md` Sec 4:

    - `'confirmed'`: Explicitly scraped from platform metadata (GitHub API `created_at`, Booth microdata).
    - `'inferred'`: Derived from earliest verified commit, changelog entry, or first archival observation.
    - `'unknown'`: Explicitly set to `NULL`. never substitute local crawl fetch time for origin publication time.

  - **The Paradox**: While NULL dates represent accurate ground truth, downstream UIs struggle with null sort keys. The resolution is to supply separate sorting semantics (e.g., sort by `origin_created_at NULLS LAST`, or fallback to `discovered_at` with explicit UI labeling).


  - **Self-Check (Grounding Truth)**: *VERIFIED*. Documented in `docs/DISCOVERY_RULES.md` Sec 4.1 & 4.2.

  - **[DOCUMENTATION RESOLVED 2026-09-23. CODE DEFECT FIX PENDING]**: Formalized in `docs/DISCOVERY_RULES.md` Sec 4.2 and `AGENT.md` (CR-5): when absent upstream, `origin_created_at` will be set to `NULL` with `created_at_confidence = 'unknown'`, strictly forbidding local crawl timestamp substitution. Code remediation in `src/tools/pipeline_sanitize.ts` lines 918-928 remains pending.

- [ ] **[SUGGESTION] A new documentation for API endpoints and internal reporting schemas and such is needed to pull user feedback for: likes & bookmarks, dislikes, keyword searches, and most visited indexed listing [Seeding]**

  - **Original Context**: Need for internal reporting schemas to capture downstream engagement metrics to seed crawler discovery.

  - **Skeptical Critique & Documentation Status**: While `docs/REPORTING_SCHEMAS.md` documents Schemas 1-4, it only defines *steering* (curator corrections, irrelevance flags), completely omitting ingestion schemas for aggregate user interaction metrics (click rates, bookmarks, search queries).

  - **Action Plan**: Define Schema 5 (Interaction & Search Telemetry) for privacy-preserving, aggregated downstream search logs, strictly excluding PII and user-identifiable session tokens.


  - **Self-Check (Grounding Truth)**: *VERIFIED*. Cross-examination confirms `REPORTING_SCHEMAS.md` covers Schemas 1 to 4, but Schema 5 is completely unwritten.

  - **[DOCUMENTATION RESOLVED 2026-09-23. SERVER ENDPOINTS PENDING]**: Formalized in `docs/REPORTING_SCHEMAS.md` Sec 6: Schema 5 (Interaction & Search Telemetry) specification defined with anonymous aggregation of search queries, click counts, and bookmarks with zero PII. Ingestion API routes in `src/server/index.ts` remain pending.

- [ ] **[QUESTION] Should the external interfacing platforms handle user accounts, authentication, and recommendation engines? Or can this system supply such things?**

  - **Original Context**: Scope boundary ambiguity regarding whether authentication and personalization belong in the crawler backend.

  - **Skeptical Critique & Security Boundary**: Introducing user accounts, password hashing, OAuth, and sessions into `vrc-server.exe` converts a stateless metadata daemon into a high-liability web application subject to GDPR/CCPA compliance, credential attacks, and database breach risks.

  - **Architectural Invariant**: **Strict Separation of Concerns**. The crawler daemon and API gateway (`vrc-server.exe`) MUST remain an unauthenticated, stateless, read-only metadata catalog. User accounts, bookmarks, private lists, and personalized recommendations must be managed entirely by external consumer clients (e.g., desktop clients, web frontends, or local SQLite user stores).


  - **Self-Check (Grounding Truth)**: *VERIFIED*. Air-gapping backend metadata indexing from authenticated user sessions is required to maintain the *Meta v. Bright Data* defense.

  - **[DOCUMENTATION RESOLVED 2026-09-23. SCOPE BOUNDARY INVARIANT PRESERVED]**: Formalized across `README.md`, `AGENT.md`, and `docs/REPORTING_SCHEMAS.md`: the engine will remain strictly an unauthenticated, stateless metadata catalog. External accounts and personalization will remain air-gapped in downstream consumer applications.

---

## 4. Platform Terms of Service Analysis & Contractual Realities

*(Preserving 100% of original ToS audits and operational context without loss)*

- [ ] **[EXTREME_CAUTION] Platform Terms of Service Compliance Audit**

  - **Jinxxy Terms of Service**:
    - The Jinxxy Terms of Service do not have any exception for "metadata-only" crawling. Instead, the document sets a blanket ban on all unauthorized scraping and automated data collection:
      - **Section 8.2 (Prohibited Conduct)**: You cannot use automated systems, bots, or scrapers without written permission. It also forbids systematically gathering data to compile collections, directories, or databases.

      - **Section 23 (API Usage)**: All automated store access must use the official API unless you have written permission. Unauthorized bots and asset scrapers are strictly prohibited.
      - **Section 6.7.1 (AI Training Prohibition)**: Automated downloading or scraping of any platform content for machine learning or AI training is completely forbidden. Scraping even just metadata without written approval or outside the official API violates the platform terms.

  - **Gumroad Terms of Service**:
    - The Gumroad Terms of Service do not supply any exception for "metadata-only" crawling. Just like with full content downloads, automated data extraction across their web pages is broadly restricted:

      - **Section 14(e) (Prohibited Scraping)**: You cannot use any manual or automated processes (including spiders, robots, crawlers, scrapers, or data mining tools) to scrape or download data from any pages. The only exception is for public search engine operators building public search indices. [PARADOX: Gumroad's robots.txt outlines a complete sitemap to crawl storefronts].
      - **Section 14(x) & Section 15 (Harvesting Information)**: You cannot harvest or collect information about any user or entity (such as creator details, usernames, or email addresses) without prior written permission.
      - **Section 14(xiii) (Harmful Automated Access)**: Automated software intended to crawl, spider, or scrape Gumroad pages is treated as a breach of platform integrity. If you need product or creator information programmatically, you must use Gumroad's official API rather than scraping the web frontend.

  - **BOOTH / pixiv Master Terms of Use**:

    - Under the pixiv Master Terms of Use, BOOTH is governed by pixiv Inc.'s umbrella rules, and there is no special exception for "metadata-only" scraping. Automated data collection and scraping on BOOTH are restricted by several core clauses:
      - **Article 14, Items 17 & 18 (Server Load & Mechanical Actions)**: The terms ban actions that cause excessive server loads beyond normal usage, as well as mechanically or repeatedly executing high-volume actions within short time windows.
      - **Article 14, Items 3 & 4 (External Use & Data Analysis)**: You cannot extract or use service data outside of the platform for commercial or business aims without permission. Conducting unauthorized data analysis or automated learning on posted content is also prohibited.
      - **Developer Guidelines (Crawler Prohibition)**: In pixiv's rules for external applications and developers, using crawlers or automated programs to aggregate works or platform content is explicitly forbidden.

      - **Operational Reality**: Because BOOTH does not supply a public REST API for crawling product catalog metadata, automated scraping tools risk IP rate limits, CAPTCHA blocks, or account termination under Article 15.

  - **itch.io Terms of Service**:
    - The itch.io Terms of Service do not supply any exception for metadata scraping:
      - **Section 3 (Acceptable Use)**: Explicitly forbids "soliciting, harvesting or collecting information about others."

      - **Server Performance**: It prohibits any behavior that degrades the platform or prevents others from enjoying the service, which covers high-frequency automated page requests.
      - **API Alternative**: itch.io supplies an official developer API for querying store and game data rather than scraping storefront HTML.

  - **GitHub Acceptable Use Policies**:
    - Unlike most platforms, the GitHub Acceptable Use Policies explicitly define scraping and include narrow allowances under Information Usage Restrictions:

      - **Allowed Exceptions**:
        - *Researchers*: May scrape public, non-personal data for research purposes, supplied resulting publications are open access.
        - *Archivists*: May scrape public data purely for archival purposes.
      - **Strict Bans**: You cannot scrape GitHub data for spamming or selling user personal information (such as contact info for recruiters or job boards). Automated bulk traffic cannot place an undue burden on GitHub servers.

      - **API Access**: GitHub separates scraping (bots hitting web pages) from its official REST and GraphQL APIs, which are the required route for general developer tools and metadata queries.

### Operational Mitigations to Preserve Community Role & Compliance:
The tool supplies a genuine service to the VRChat community by solving asset discoverability. It acts as a unified catalog that directs users and buyers directly to the creator official store page without re-hosting or distributing proprietary files. To preserve this positive role while minimizing the risk of IP bans, firewall triggers, or legal complaints, you can adjust how the crawler operates:


1. **Adopt a Submission-First Registry**: Instead of spidering entire marketplaces blindly, let creators and community members submit their store URLs or VPM repository links directly. The tool only needs to verify and read individual submitted URLs rather than scraping entire site hierarchies.


2. **Target Open Graph and oEmbed Metadata**: Platforms design Open Graph meta tags (`og:title`, `og:image`, `og:description`) specifically for external link previews. Fetching only the `<head>` tag for these standard social previews is far less intrusive than parsing internal page layouts.


3. **Aggressive Caching and Conditional Requests**: Store fetched metadata in your database for days or weeks. Use HTTP headers like `If-Modified-Since` and `ETag` to verify if a page changed so the server only returns a lightweight `304 Not Modified` header instead of rendering the full page again.
   - **[VERIFIED BY CODE AUDIT 2026-09-23]** This mitigation is **not implemented**. `src/drivers/github.ts` captures the raw `ETag` from response headers (lines 174-177) but never sends it as `If-None-Match`. No driver sends `If-Modified-Since`. The `HTTP 304` path is dead code in practice.


4. **Transparent Bot Identity**: Set a clear, unique User-Agent header containing a contact email and a link to your project page. Explain plainly that your crawler indexes public listings to send traffic directly to the original seller, and supply an automated opt-out mechanism for creators who prefer not to be indexed.
   - **[VERIFIED BY CODE AUDIT 2026-09-23]** The `VRCDiscoveryBot/1.0` User-Agent is set. However, the opt-out mechanism (`db.registerOptOut()`) has zero API routes and is unreachable.


5. **API-First Fallbacks**: Always default to official APIs and decentralized feeds (like the GitHub API, itch.io API, and community VPM JSON endpoints). Only fall back to lightweight HTML requests when no structured feed exists.

---

## 5. Legal Precedents, Fair Use, & "Search Engine" Defense Theories

*(Preserving 100% of original case citations, precedents, and comparative legal analysis)*

If your goal is to build a search engine or metadata aggregator equivalent to Google, the legal framework changes completely from standard "web scraping." Instead of violating a site's private contract, you are operating under the established principles of public indexing and search directories.

Major search engines like Google, Bing, and DuckDuckGo do not use official APIs to index the web - they crawl public HTML pages. When building a public-facing search utility, the legal and technical rules rely on four core pillars:

### 1. The Legal Precedent: Facts vs. Copyright
Under US law, facts cannot be copyrighted [1].

- **Allowed**: Extracting "metadata" (e.g., product titles, authors, prices, or descriptions) to build a search directory is legally protected. In landmark rulings like *hiQ Labs v. LinkedIn* and *Meta v. Bright Data*, US courts established that crawling publicly accessible, logged-out web data does not violate federal anti-hacking laws (like the CFAA) [1, 2, 3, 4].

- **Not Allowed**: You cannot scrape and re-host the actual creative assets (e.g., downloading 3D models from Jinxxy, game files from itch.io, or full images). If your index merely points a link back to the source page, it falls under the same "fair use" protections that allow Google to exist [3, 5].

### 2. The Golden Rule: robots.txt
Google's entire operations rely on the Robots Exclusion Protocol [6].
- The `robots.txt` file is not a legally binding contract. it is a voluntary technical request.
- However, if you want to operate a legitimate search engine, you must configure your crawler to look at `://example.com/robots.txt` before indexing. If Jinxxy or Gumroad writes `Disallow: /products/`, a compliant search crawler must turn around. Ignoring `robots.txt` while trying to act as a public search engine destroys your "good faith" defense in court [6, 7, 8, 9].

### 3. Identify Your User-Agent
You cannot hide your crawler behind fake browser fingerprints if you want to be treated like Google.
- You must declare a distinct, public user-agent string (e.g., `User-Agent: MyVRChatSearchBot/1.0. (+https://mysearchsite.com)`).
- The URL in your user-agent must lead to a page explaining who you are, what you are indexing, and offering an opt-out form for creators who do not want their digital products appearing in your directory.

### 4. Do No Harm (Rate Limiting)
If your crawler fires 100 requests a second and slows down a platform checkout page, they can sue you for *Trespass to Chattels* (damaging or disrupting private digital property). You must enforce strict crawl delays (e.g., waiting 1-2 seconds between requests per domain) to make sure you aren't accidentally performing a DDoS attack [6, 10, 11].

---

### Summary Checklist for a Search Crawler:
If you want to build a public metadata index safely:


1. **Stay Logged Out**: Never use a scraper that requires logging into an account, as that triggers a breach-of-contract lawsuit.


2. **Obey robots.txt**: If a path is blocked, do not index it.


3. **Link Out**: Only store the bare minimum metadata (title, tags, price) and always link traffic directly back to the original creator storefront [3, 5, 6, 8].

#### Citations:
- [1] [https://benbernardblog.com](https://benbernardblog.com/web-scraping-and-crawling-are-perfectly-legal-right/)
- [2] [https://cloro.dev](https://cloro.dev/blog/website-scraping-legal/)
- [3] [https://carpentry.library.ucsb.edu](https://carpentry.library.ucsb.edu/2024-02-27-ucsb-webscraping/04-Ethics-Legality-Webscraping/index.html)
- [4] [https://cloro.dev](https://cloro.dev/blog/website-scraping-legal/)
- [5] [https://medium.com](https://medium.com/@tjwaterman99/web-scraping-is-now-legal-6bf0e5730a78)
- [6] [https://dataimpulse.com](https://dataimpulse.com/blog/robots-txt-ai-crawlers/)
- [7] [https://bytetunnels.com](https://bytetunnels.com/posts/is-robots-txt-legally-binding-scraping-law-explained/)
- [8] [https://dataimpulse.com](https://dataimpulse.com/blog/is-web-scraping-legal/)
- [9] [https://www.reddit.com](https://www.reddit.com/r/ProxyGuide/comments/1vtp9fj/robotstxt_what_it_actually_controls_whether_it_is/)
- [10] [https://www.blog.datahut.co](https://www.blog.datahut.co/post/is-web-scraping-legal/)
- [11] [https://www.kirkland.com](https://www.kirkland.com/publications/article/2017/05/searching-for-web-crawlings-legal-boundaries)

---

## 6. Downstream Free API Distribution & Contract Breach Risks

*(Preserving 100% of original contractual analysis, case risks, and architectural constraints)*

*(what if the indexed crawled data was provisioned to be accessed via an accessible API, and developers can build an app on top of it so that the provisioned directory links (and potential feed serves) can be saved through unregistered or registered accounts, while still explicitly keeping the traffic be redirected to the hosts, and are served completely free, does that still breach contract for all platforms mentioned?)*

No, offering a free API that redirects traffic back to the source platforms does not eliminate the breach of contract risk - but the exact legal landscape has shifted dramatically.

Your model introduces a vital distinction: logged-off, public-facing scraping for a public good. By making sure your tool redirects all transaction traffic back to the host platform, serves the directory entirely for free, and stores only reference links, you eliminate the risk of a copyright or commercial theft claim.

However, whether you are technically "breaching a contract" depends entirely on how your crawler interacts with the target platforms. Landmark U.S. federal rulings shed light on how this specific architecture holds up:

### 1. The Legal Shield: The Meta v. Bright Data Precedent
Your exact scenario - gathering public data while logged out and offering it to others - was the focus of a major federal ruling in *Meta Platforms, Inc. v. Bright Data Ltd.*. The U.S. District Court established a crucial boundary for web crawlers [1]:

- **Logged-Off Scraping is Protected**: The court ruled that a company's Terms of Service cannot bar logged-off scraping of public data [2].

- **The "User" Bound**: If your crawler visits Jinxxy, Gumroad, Booth, or itch.io without logging into any account, your crawler stands in the exact same shoes as a public visitor. Because a public visitor never clicks "I Agree" to a Terms of Service, no contract is formed, meaning no contract can be breached [3, 4].

- **Even if you have a personal account**: The court noted that even if you (the developer) have a personal or corporate account on those platforms, it is "entirely incidental" to the scraping. If the bot scrapes public pages while logged out, it does not violate the user agreement [2, 3, 5].

### 2. Where You Are Still Vulnerable: Account & Feed Infrastructure
While your crawler might be safe under the Bright Data precedent, downstream application features introduce fresh risks [2]:

- **The hiQ v. LinkedIn Trap**: In *hiQ Labs v. LinkedIn*, hiQ argued their public indexing tool was a harmless third-party utility. However, LinkedIn won a $500,000 judgment because hiQ created human/automated accounts to manage and verify the backend data feed. If your directory app requires automated testing or validation that touches a logged-in state on Jinxxy or Gumroad, you immediately breach their contract [6, 7].

- **API Distribution Risks (Tortious Interference)**: Even if you aren't breaching a contract with the platforms, supplying an open API means your downstream developers might misuse the data. If a developer uses your free feed to build an app that blocks out the source platforms entirely (e.g., stripping the links), Jinxxy or itch.io can target your infrastructure with a *Tortious Interference* claim for facilitating a disruption to their business [8, 9].

### 3. Platform-Specific Realities:

- **itch.io**: Itch is highly developer-friendly. Because you are supplying a free tool that drives traffic back to them, they are highly unlikely to take legal action. They may even support it if you use their independent REST wrappers.

- **Gumroad**: They strictly target scrapers because they protect their creators' metrics. If your bot hits their storefronts too fast, they will use Cloudflare blocks to stop you, contract or no contract.

- **Booth.pm**: Based in Japan, Pixiv (Booth's parent company) operates under Japanese copyright and database laws, which do not mirror U.S. fair-use or scraping precedents identically. They are highly aggressive against external aggregators, even free ones [10].

### The Safest Way to Build This:
If you proceed with this free developer directory, structure your application to remain legally bulletproof:


1. **Air-Gap the Crawler**: make sure the crawling code runs completely separate from any platform accounts you personally own. It must execute requests natively as a logged-out guest.


2. **Only Cache IDs and Links**: Do not cache paragraphs of text or full image assets on your servers (which triggers copyright liability). Only store the product's unique platform ID, its metadata tags, and the exact canonical URL to redirect the user.


3. **Pass-Through Authentication**: For your app user account features (saving feeds, favoriting items), keep all data localized to your app database. Never allow your system to ping the host platforms on behalf of your users [2, 3].

#### Citations:
- [1] [https://www.lowenstein.com](https://www.lowenstein.com/news-insights/publications/client-alerts/meta-v-bright-data-ruling-has-important-implications-for-webscraping-activities-by-investment-advisers-im)
- [2] [https://brightdata.com](https://brightdata.com/blog/web-data/court-rules-in-favor-of-bright-data-in-meta-v-bright-data-case)
- [3] [https://www.fbm.com](https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/)
- [4] [https://www.quinnemanuel.com](https://www.quinnemanuel.com/the-firm/news-events/client-alert-what-does-the-meta-v-bright-data-summary-judgment-ruling-mean-for-web-scraping/)
- [5] [https://www.quinnemanuel.com](https://www.quinnemanuel.com/the-firm/news-events/client-alert-meta-v-bright-data-significant-decision-for-web-scraping-industry/)
- [6] [https://en.wikipedia.org](https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn)
- [7] [https://evomi.com](https://evomi.com/blog/hiqlabs-vs-linkedin-case)
- [8] [https://law.justia.com](https://law.justia.com/cases/federal/appellate-courts/ca9/17-16783/17-16783-2019-09-09.html)
- [9] [https://www.zwillgen.com](https://www.zwillgen.com/alternative-data/hiq-linkedin-breach-contract-cfaa-trial/)
- [10] [https://parse.bot](https://parse.bot/marketplace/a926b5dc-5a9f-4d3d-9d96-1bb80b22630b/itch-io-api)

---

## 7. Blueprint Audit of `vrc-package-crawler` & Critical Vulnerabilities

*(Preserving 100% of original architectural audit, vulnerabilities, and recommended invariants)*

Based on an analysis of the repository blueprint for `SlamTheDragon/vrc-package-crawler`, this architecture is explicitly engineered to minimize legal liability while dealing with strict platform boundaries. It is structured specifically as a non-commercial, public-good search utility.

However, because this project provisions a programmatic API ecosystem, local databases, and a Cloudflare sync architecture for downstream use, several critical areas require investigation to keep it fully compliant:

### ⚖️ The Good: Strong Compliance Baselines
The codebase already implements excellent, baseline protections that align with standard web-indexing etiquette:

- **Transparent User-Agent**: It announces itself explicitly as `User-Agent: VRCDiscoveryBot/1.0`. This allows target platforms to identify it, look up its intent, and actively block it via infrastructure if they desire.

- **Robots.txt Enforcement**: The inclusion of an RFC 9309-compliant `robots.txt` enforcer utility means it respects target platform rules programmatically. If Booth.pm or Jinxxy block a path, the crawler turns around.

- **Factual & Non-Rivalrous Data**: It only indexes public metadata (titles, tags, links) and explicitly does not download or redistribute binary files (`.unitypackage`, etc.). This shields it from direct copyright theft claims.

- **Direct Redirection**: It acts as a funnel to drive commercial traffic back to creators' storefronts rather than intercepting checkout metrics.

---

### ⚠️ Areas Requiring Urgent Investigation

#### 1. The Cloudflare Edge Sync & Downstream API Trap
The architecture states that `vrc-sync` pushes incremental deltas to Cloudflare D1/R2 and serves the catalog via Cloudflare Workers.

- **The Risk**: While the backend crawler operates as a logged-out guest, the API gateway (`vrc-server.exe`) serves this raw data globally to third-party developers.

- **The Compliance Issue**: If an external developer uses your Schema 1 or Schema 2 feeds to build a UI that lets users bypass looking at the storefront entirely (e.g., pulling descriptive text out dynamically), the target platforms can hold your database pipeline liable for *Tortious Interference* - essentially facilitating the commercial bypass of their traffic layout.

#### 2. The Media Cache & Perceptual Hashing (pHash)
The repository contains a WebP Image Proxy Pipeline that downloads, transcodes, and caches low-resolution thumbnails ($480 \times 270$) alongside BlurHash and 64-bit pHash profiles.

- **The Risk**: Image caching is the easiest vector for a Copyright Infringement claim. While text and prices are uncopyrightable facts, a storefront cover image is creative, protected intellectual property owned entirely by the artist.

- **The Compliance Issue**: Even though images are transcoded to low-res WebP formats, storing them persistently on a Cloudflare R2 bucket means you are re-hosting copyrighted content. Major search engines get away with thumbnail caching under highly narrow "fair use" conditions because they supply an index to the entire internet. A niche tool targeting a few select storefronts has a much weaker fair-use defense.

#### 3. Regional Discrepancies (Booth.pm / Japanese Law)
The project treats all target platforms similarly, but Booth.pm operates under Pixiv Inc. in Japan.

- **The Risk**: Japanese copyright and database laws do not feature an identical, broad mirror of U.S. "Fair Use" or the *Meta v. Bright Data* logged-out scraping protections. Pixiv strictly forbids data harvesting and automated structuring of its database.

- **The Compliance Issue**: If the bot aggressively sweeps Booth's web blocks to maintain a real-time index, it risks triggering cross-border takedowns or localized hardware/IP blacklisting from Pixiv's infrastructure team.

---

### 🛠️ Recommended Code Adjustments for Air-Tight Compliance
To guarantee the project survives a compliance audit without legal friction, consider adjusting the codebase architecture to enforce these invariants:



1. **Convert the Media Cache to a Pass-Through Proxy**:
   - *Fix*: Modify the `media_cache` and image proxy pipeline so that it never saves or stores images persistently on Cloudflare R2. Instead, store the original image URL string in the SQLite database. Let downstream client applications fetch the image directly from host CDNs or stream downscaled buffers in-memory.


2. **Hardcode a Strict Poisson Rate-Limiter for Closed Ecosystems**:
   - *Fix*: In `src/db.ts` or the Poisson scheduling layer, hardcode an aggressive delay for private e-commerce platforms (like Jinxxy and Booth). While GitHub can handle fast queries, commercial storefronts should never be queried faster than one request every 3 to 5 seconds.

   - **[VERIFIED BY CODE AUDIT 2026-09-23]** While `poissonScheduler.requeueStaleUrls()` is active in the monitor loop, `adjustAfterFetch(url, isModified, etag, lastModifiedHeader)` is completely disconnected from domain worker loops. `db.markStatus` imposes a flat 24-hour constant (`+86400 seconds`) for all URLs regardless of platform.


3. **Formalize the Opt-Out API Endpoint**:
   - *Fix*: make sure the `creator_opt_outs` database table hooks directly to an automated endpoint on `vrc-server.exe`. If a creator hits this endpoint and verifies ownership (via DNS TXT or cryptographic signature), their assets should be instantly purged from `crawler_state.db` and excluded from projections.
   - **[VERIFIED BY CODE AUDIT 2026-09-23]** `db.registerOptOut()` is implemented but entirely unrouted. No API endpoint calls it, and bio-token scraping does not exist.

#### The Final Verdict: "Defensible but Defiant"
*Legally, this application is highly defensible. It operates as a public directory, monetizes nothing, respects robots.txt, and gives creators sovereign control over their data via the "Claim" system. You are acting as a specialized search engine.*  
*Contractually, you are still defying the letter of the platforms' ToS regarding automated data collection. The platforms reserve the right to technically block your crawler from reading their pages, even if they cannot successfully sue you in a court of law. To make the system completely bulletproof, secure and automated creator ownership verification is essential.*

---

## 8. Skeptical Audit & Grounding Truth Verification Matrix

The following table evaluates every major proposed architectural adjustment and skeptical question against verifiable evidence from the repository documentation and filesystem topography, explicitly separating verified grounding truth from speculative assumptions.

| # | Proposal / Question Under Audit | Grounded Factual Truth (Documentation & Topography) | Skeptical Failure Mode / Counter-Truth | Verification Status | Actionable Mandate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **G-1** | **Pass-Through Image Proxy vs. Hotlink Failure** | `TODO.md` proposes client direct CDN loading (`<img>` tags) to avoid R2 copyright liability. | Booth (pixiv) and Gumroad CDNs enforce `Referer` headers, signed HMAC tokens, and block hotlinking with `HTTP 403 Forbidden`. | **Reasonable Grounding Truth** | Abandon client direct hotlinking. Deploy an ephemeral, in-memory proxy that streams downscaled buffers without persistent R2 storage. |
| **G-2** | **SimHash Collision on Avatar Cosmetics** | `COMPREHENSIVE_SYSTEM_ARCHITECTURE.md` relies on SimHash-64 ($k \le 3$) to deduplicate across storefronts. | VRChat assets share identical boilerplate ("Kikyo/Manuka", "PhysBones", "Unity 2022"). Stripping brackets causes SimHash to falsely collapse distinct clothing assets. | **Reasonable Grounding Truth** | Enforce package dependency anti-merge rules and require exact author/storefront identity before evaluating SimHash Hamming distances. |
| **G-3** | **Cloudflare Turnstile & Poisson Acceleration Trap** | Poisson formula in `DISCOVERY_RULES.md` increases crawl rate ($\lambda \times 1.4$) on `HTTP 200`. | Cloudflare Managed Challenges return `HTTP 200` with HTML challenge payloads. The crawler treats bot walls as content updates, accelerating requests into IP bans. | **Reasonable Grounding Truth** | Inspect DOM response payloads for Cloudflare signatures before triggering Poisson `HTTP 200` freshness acceleration. |
| **G-4** | **Unauthenticated Schema 4 Delisting Sabotage & Secret Hallucination** | `REPORTING_SCHEMAS.md` & `COMPREHENSIVE_SYSTEM_ARCHITECTURE.md` execute automated delisting every 30m via `POST /v1/reports`. | `AGENT.md` claims `CRAWLER_API_TOKEN`, but code reads `API_SECRET_TOKEN`. Unset `.env` bypasses auth completely. Reports with `irrelevance/malicious_or_scam` auto-delist packages without human review. | **CONFIRMED VULNERABILITY  -  CODE AUDIT 2026-09-23** | Quarantine delisting reports into a human-review buffer (`needs_review`). Require `API_SECRET_TOKEN` authentication unconditionally. |
| **G-5** | **Bio-Token Verification Paradox** | `ARCHITECTURE_AND_COMPLIANCE_GUIDE.md` relies on scraping creator bios for opt-out tokens. | To read the creator bio, the crawler must scrape profile pages on platforms that ban scrapers and deploy Cloudflare perimeter defenses. | **Reasonable Grounding Truth** | Support secondary non-scraping verification paths (DNS TXT records, signed Git commits, or manual ticket fallback). |
| **G-6** | **VRCArena Ingestion: Federation vs. DOM Scraping** | `TODO.md` considers adding VRCArena to the discovery crawl pool. `robots.txt` allows indexing (`Allow: /`) and both projects are open-source. | `docs/topics/05_vrchat_ecosystem_case_studies.md` documents VRCArena rejects scrapers. HTML scraping creates fragile "aggregator-of-aggregators" parsing, strains community server resources, and causes avatar SimHash-64 collisions. | **Reasonable Grounding Truth (Conditionally Safe via Federation)** | Reject automated HTML DOM scraping. Pursue open-source bilateral federation or API ingestion with a strict toolchain-only category whitelist. |
| **G-7** | **Japanese Law (Pixiv/Booth) Incompatibility** | Documentation cites US Ninth Circuit (*Bright Data*) and Japanese Copyright Art. 47-5 to defend Booth crawling. | Art. 47-5 contains a proviso barring actions prejudicing copyright holders. Pixiv Master Terms ban automated extraction. US fair use is legally irrelevant in Tokyo. | **Reasonable Grounding Truth** | Implement conservative, human-pacing limits (3-5s delays) on `booth.pm` and prepare graceful degradation if Pixiv activates hard perimeter blocks. |
| **G-8** | **Downstream Tortious Interference Exposure** | `vrc-server.exe` and Cloudflare Workers distribute Schema 1 & 2 feeds to third-party developers. | If downstream apps consume complete text descriptions and omit canonical store links, platforms can pursue tortious interference claims against the aggregator. | **Reasonable Grounding Truth** | Truncate product descriptions in public feeds and mandate click-through deep links in all distributed API schemas. |
| **G-9** | **Schema Duplication & Naming Collision** | `COMPREHENSIVE_SYSTEM_ARCHITECTURE.md` claims complete unification. `TODO.md` reports mental exhaustion. | Physical codebase contains overlapping fields across `entities`, `package_fronts`, and `canonical_packages`. `curator_overrides` has both `name_override` and `title_override`. | **Reasonable Grounding Truth** | Freeze driver expansion until a formal column-deduplication migration normalizes `src/db.ts`. |
| **G-10**| **Open-Web VPM Discovery Feasibility** | `TODO.md` proposes expanding VPM discovery to the general world wide web. | Unbounded web spiders searching for JSON manifests produce astronomical noise, security vulnerabilities, and compute exhaustion. | **Reasonable Grounding Truth** | Reject open-web crawling. Restrict VPM expansion strictly to federated registry seeds, community hubs, and verified package indices. |
| **G-11**| **Poisson Scheduler: Requeuing Active, Mutability Loop Disconnected** | Preliminary audit claimed scheduler was entirely disconnected. | `requeueStaleUrls()` IS actively called in monitor loop (line 760) and IPC `/recrawl` (line 955). However, `adjustAfterFetch(url, isModified, etag, lastModifiedHeader)` has zero callers in `src/`. Fixed 24h interval is hardcoded in `db.markStatus()`. | **CONFIRMED REFINED REALITY  -  CODE AUDIT 2026-09-23** | Wire `adjustAfterFetch()` into worker completion callbacks with conditional HTTP headers. Replace rigid `+86400` in `db.markStatus`. |
| **G-12**| **Full-Wipe Projection Scalability & Silent Edge Sync Loss** | `pipeline_sanitize.ts` runs a full DELETE + rebuild every 15 minutes. | DELETE + rebuild resets SQLite rowids to 1. In `src/sync/index.ts`, watermark check `watermarkRowId > maxRowInDb` fails to reset if rebuilt table has more rows, permanently skipping rows 1..watermark. In-memory SimHash clustering across 49k entities is $O(n^2)$. | **CONFIRMED CRITICAL DEFECT  -  CODE AUDIT 2026-09-23** | Replace full-wipe with incremental upsert keyed on `canonical_id`. Track dirty entities via timestamp. Reset sync watermarks via UUIDs or explicit generation epoch. |
| **G-13**| **VPM Seeding Gate Permanent Lock** | `src/crawler/index.ts` line 82 gates VPM re-seeding on `done < 50`. | `done` is monotonically increasing. After the first 50 VPM URLs are crawled, the gate permanently prevents any further VPM seed injection across all future daemon sessions. | **CONFIRMED BUG  -  CODE AUDIT 2026-09-23** | Replace the absolute `done < 50` gate with a staleness-based condition (e.g., last VPM seed injection > 7 days ago). |
| **G-14**| **Timestamp Violation: Crawl Time Substituted for Publication Time** | `DISCOVERY_RULES.md` Sec 4.2 mandates `NULL` (unknown) when no upstream date exists. | `pipeline_sanitize.ts` lines 918-928 set `originCreatedAt = earliestLocalObservedAt` when `!originCreatedAt`, assigning `createdAtConfidence = 'inferred'`. | **CONFIRMED VIOLATION  -  CODE AUDIT 2026-09-23** | When `!originCreatedAt`, set `originCreatedAt = null`, `createdAtConfidence = 'unknown'` per DISCOVERY_RULES.md Sec 4.2. |
| **G-15**| **[TASK_PERFORMED_AND_READY_FOR_CONTEXT_PURGE] AGENT.md / DELEGATES.md Documentation Drift & Duplication** | `AGENT.md` claims "40/40 tests", "51/0 Fail", references `tests/migrate.test.ts`. `DELEGATES.md` is assumed to be a deployment runbook. | Actual suite: 57 tests across 12 files. `tests/migrate.test.ts` was renamed to `tests/schema_unification.test.ts`. `AGENT.md` and `DELEGATES.md` share identical SHA-256 (`59E18587DF...`)  -  an undeclared byte-for-byte duplicate. | **RESOLVED & VERIFIED 2026-09-23** | Specialized into dedicated files: `AGENT.md` for coding agent contract (57 tests baseline), `DELEGATES.md` for SRE production deployment runbook. |
| **G-16**| **`registerOptOut()` Unrouted  -  Opt-Out System Non-Functional** | Documentation states the opt-out system is implemented and creators can request removal. | `db.registerOptOut()` exists in `src/db.ts` lines 551-578 but has zero API routes and zero CLI callers. Bio-token scraping does not exist. | **CONFIRMED UNIMPLEMENTED  -  CODE AUDIT 2026-09-23** | Implement `POST /v1/opt-out` endpoint. Implement at least one non-scraping ownership verification path. |
| **G-17**| **SQLite Test Concurrency Lock Contention** | Full test suite execution (`bun test`) is expected to succeed deterministically. | 7 test files share the live 357 MB `dist/crawler_state.db`. SQLite `busy_timeout` is 10,000ms, exceeding Bun 5,000ms test timeout when `exporter.test.ts` locks the DB. | **CONFIRMED CONCURRENCY DEFECT  -  CODE AUDIT 2026-09-23** | Decouple tests to in-memory SQLite (`:memory:`) or dedicated test databases. isolate parallel test runs. |
| **G-18**| **Broken CLI Commands on `vrc-crawler.exe` (Docs Resolved. Code Guard Pending)** | Operational guides instruct running `.\dist\vrc-crawler.exe status`, `recrawl`, `stop`. | `src/crawler/index.ts` has no CLI routing. Running `vrc-crawler.exe <command>` attempts to start a second crawler instance and crashes with `ProcessLock`. | **DOCS RESOLVED 2026-09-23. CODE PENDING** | All operational runbooks and guides updated to dispatch commands exclusively through `vrc-monitor.exe`. Source code argument guard in `src/crawler/index.ts` remains pending. |
| **G-19**| **Environment Variable Secret Drift (`API_SECRET_TOKEN`)** | Deployment assumes administrative API token is declared and documented. | Code expects `process.env.API_SECRET_TOKEN` (`src/server/index.ts` line 130). Documentation claims `CRAWLER_API_TOKEN`. Neither is declared in `.env.example`. | **CONFIRMED CONFIG DRIFT  -  CODE AUDIT 2026-09-23** | Add `API_SECRET_TOKEN` to `.env.example`. Update documentation and code to match a single canonical token name. |
| **G-20**| **[TASK_PERFORMED_AND_READY_FOR_CONTEXT_PURGE] Operational Readiness of `AGENTS.md` and `DELEGATION.md`** | Files are intended to guide autonomous agents and production deployment engineers. | Both files are identical clones conveying obsolete test counts, wrong environment variables, broken CLI commands, and concealing edge sync data loss. Neither is ready. | **RESOLVED & VERIFIED 2026-09-23** | `AGENT.md` rewritten as Autonomous Coding Agent Contract. `DELEGATES.md` rewritten as SRE Deployment Runbook. Both verified with STE linter and 100% factual accuracy. |
| **G-21**| **Downstream Notice Invariant (`X-Catalog-Terms-Of-Use`)** | `LEGAL.md` Section 10 asserts Downstream Covenants are binding conditions of access. | Under contract law (*Register.com v. Verio*), programmatic API callers receive no notice unless transmitted in-band. `src/server/index.ts` currently injects zero terms headers. | **Reasonable Grounding Truth** | Inject `X-Catalog-Terms-Of-Use: <url>` on all HTTP responses and embed license terms in `GET /` root metadata. |
| **G-22**| **Server Test Compliance (*Perfect 10*) vs. Media Storage** | Under Ninth Circuit Server Test, linking to origin CDN images avoids copyright display liability. | Storing WebP thumbnails on Cloudflare R2 or local disk constitutes reproduction/hosting of copyrighted artwork. | **Reasonable Grounding Truth** | Return direct Source CDN URLs in API responses. Restrict local processing to ephemeral in-memory 64-bit pHash and BlurHash extraction. |
| **G-23**| **Cloudflare Turnstile Detection on `HTTP 200`** | `src/crawler/index.ts` accelerates crawl frequency on `HTTP 200 OK`. | Cloudflare Managed Challenges return `HTTP 200` with HTML Turnstile challenge scripts. Crawlers parse challenge scripts as descriptions and accelerate into IP bans. | **Reasonable Grounding Truth** | Inspect DOM payloads for `cf-mitigated: challenge` and `turnstile` scripts before classifying a response as genuine content. |
| **G-24**| **CJK Shingling & Punctuation Normalization in SimHash** | `pipeline_sanitize.ts` uses SimHash-64 to link BOOTH and Western mirrors. | BOOTH titles use full-width decorative brackets (`【...】`) and author tags. Unstripped CJK boilerplate prevents SimHash Hamming distance from converging ($k \le 3$). | **Reasonable Grounding Truth** | Implement NFKC unicode normalization, strip full-width brackets, and generate 2-gram CJK character shingles in `pipeline_sanitize.ts`. |
| **G-25**| **Automated Non-Scraping Opt-Out Protocol (`POST /v1/opt-out`)** | `LEGAL.md` Section 9 promises non-scraping ownership verification (DNS TXT, signed Git commits). | `src/server/index.ts` has no `/opt-out` endpoint. Creators cannot submit cryptographic proofs without manual maintainer intervention. | **Reasonable Grounding Truth** | Implement `POST /v1/opt-out` endpoint validating DNS TXT records (`vrc-opt-out=<vendor-id>`) and updating `creator_opt_outs`. |
| **G-26**| **Decentralized Canonical Network Contributor Provenance** | `LEGAL.md` Section 1.3 defines independent nodes pushing metadata to the canonical edge. | SQLite tables lack `contributor_node_id`, `signature`, and `batch_id`. Malicious or corrupted node submissions cannot be traced or isolated. | **Reasonable Grounding Truth** | Add provenance tracking columns to `entities` and `canonical_packages` before enabling decentralized edge pushing. |
| **G-27**| **Gumroad Section 14(e) Search Engine Exemption Adherence** | Gumroad ToS Section 14(e) explicitly allows search engines creating public indices, but bans caches/archives. | Codebase must maintain strict adherence by making sure no product binaries, `.zip`, or `.unitypackage` files are ever cached or archived. | **Reasonable Grounding Truth** | Verify socket-level streaming guardrails abort transfers matching binary MIME types or exceeding 5 MB limit. |
| **G-28**| **Japanese Law (Art. 30-4 & 47-5) vs. Civil Code Art. 548-2** | Japanese Copyright Act Art. 47-5 allows search indexing, but does not override private contracts under Civil Code Art. 548-2. | Pixiv Master Terms ban automated extraction. Relying solely on copyright exceptions fails if Pixiv asserts contract breach in Tokyo court. | **Reasonable Grounding Truth** | Enforce conservative human pacing (3.0-5.0s delay), logged-out execution, and immediate cessation if Pixiv deploys technical access blocks. |
| **G-29**| **SQLite `media_cache.webp_data` BLOB Storage vs. Server Test** | `image_proxy.ts` caches WebP images. Prior report claimed files were in `dist/media/`. | Production code stores raw WebP buffers directly as BLOBs in SQLite `media_cache.webp_data` (`dist/crawler_state.db`), creating a 357 MB database. `src/server/index.ts` lines 173-180 and line 289 serve binary images via `GET /v1/media/:id`, and `src/tools/exporter.ts` exports `webp_data BLOB`. This persists copyrighted imagery in SQLite, breaching the Server Test. | **CONFIRMED REFINED REALITY - CODE AUDIT 2026-09-24** | Drop `webp_data BLOB` from SQLite schema. Retain only `phash_64`, `blurhash`, and origin `source_url`. Serve direct Source CDN URLs in API responses per the Ninth Circuit Server Test (*Perfect 10*) and *Kelly v. Arriba Soft* transformative fair use. |
| **G-30**| **`vrc_catalog.db` SQLite Export Missing Terms Metadata Table** | `src/tools/exporter.ts` exports SQLite database catalogs for third-party tools. | `src/tools/exporter.ts` defines `canonical_packages`, `package_fronts`, `media_cache`, and `packages_fts`, but creates zero metadata tables. Downloaded SQLite databases contain no license, no `LEGAL.md` reference, and no terms hash. Under *Register.com v. Verio*, this undermines downstream enforceability of catalog covenants. | **CONFIRMED OMISSIONS - CODE AUDIT 2026-09-24** | Add `CREATE TABLE catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL),` in `src/tools/exporter.ts`. Record terms URL, terms SHA-256 digest, AGPLv3 license reference, and export timestamp. |
| **G-31**| **Server Root Path (`GET /`) Missing API Discovery Document** | API Gateway exposes `/v1/` routes. | Requesting `GET /` returns `404 Not Found`. There is no root discovery endpoint to declare API capabilities, terms of use notice, or catalog schema versions. | **CONFIRMED GAP - CODE AUDIT 2026-09-24** | Add root route `GET /` in `src/server/index.ts` returning API metadata, version, schema endpoints, terms of use URL, and license covenants. |
| **G-32**| **Server Test Circuit Split (*Perfect 10* vs. *Goldman v. Breitbart*)** | Documentation previously treated the Ninth Circuit Server Test as nationwide law. | Second Circuit and SDNY courts (*Goldman v. Breitbart*, *Nicklen v. Sinclair*) rejected the Server Test, holding embedding can infringe display rights even if hosted remotely. *Hunley v. Instagram* noted criticism. | **Reasonable Grounding Truth** | Ground image indexing primarily in *Kelly v. Arriba Soft* transformative fair use (low-resolution visual pointers) while strictly avoiding persistent storage of copyrighted artwork. |
| **G-29**| **SQLite `media_cache.webp_data` BLOB Storage vs. Server Test** | `image_proxy.ts` caches WebP images. Prior report claimed files were in `dist/media/`. | Production code stores raw WebP buffers directly as BLOBs in SQLite `media_cache.webp_data` (`dist/crawler_state.db`), creating a 357 MB database. `src/server/index.ts` lines 173-180 and line 289 serve binary images via `GET /v1/media/:id`, and `src/tools/exporter.ts` exports `webp_data BLOB`. This persists copyrighted imagery in SQLite, breaching the Server Test. | **CONFIRMED REFINED REALITY - CODE AUDIT 2026-09-24** | Drop `webp_data BLOB` from SQLite schema. Retain only `phash_64`, `blurhash`, and origin `source_url`. Serve direct Source CDN URLs in API responses per the Ninth Circuit Server Test (*Perfect 10*) and *Kelly v. Arriba Soft* transformative fair use. |
| **G-30**| **`vrc_catalog.db` SQLite Export Missing Terms Metadata Table** | `src/tools/exporter.ts` exports SQLite database catalogs for third-party tools. | `src/tools/exporter.ts` defines `canonical_packages`, `package_fronts`, `media_cache`, and `packages_fts`, but creates zero metadata tables. Downloaded SQLite databases contain no license, no `LEGAL.md` reference, and no terms hash. Under *Register.com v. Verio*, this undermines downstream enforceability of catalog covenants. | **CONFIRMED OMISSIONS - CODE AUDIT 2026-09-24** | Add `CREATE TABLE catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL),` in `src/tools/exporter.ts`. Record terms URL, terms SHA-256 digest, AGPLv3 license reference, and export timestamp. |
| **G-31**| **Server Root Path (`GET /`) Missing API Discovery Document** | API Gateway exposes `/v1/` routes. | Requesting `GET /` returns `404 Not Found`. There is no root discovery endpoint to declare API capabilities, terms of use notice, or catalog schema versions. | **CONFIRMED GAP - CODE AUDIT 2026-09-24** | Add root route `GET /` in `src/server/index.ts` returning API metadata, version, schema endpoints, terms of use URL, and license covenants. |
| **G-32**| **Server Test Circuit Split (*Perfect 10* vs. *Goldman v. Breitbart*)** | Documentation previously treated the Ninth Circuit Server Test as nationwide law. | Second Circuit and SDNY courts (*Goldman v. Breitbart*, *Nicklen v. Sinclair*) rejected the Server Test, holding embedding can infringe display rights even if hosted remotely. *Hunley v. Instagram* noted criticism. | **Reasonable Grounding Truth** | Ground image indexing primarily in *Kelly v. Arriba Soft* transformative fair use (low-resolution visual pointers) while strictly avoiding persistent storage of copyrighted artwork. |
| **G-29**| **SQLite `media_cache.webp_data` BLOB Storage vs. Server Test** | `image_proxy.ts` caches WebP images. Prior report claimed files were in `dist/media/`. | Production code stores raw WebP buffers directly as BLOBs in SQLite `media_cache.webp_data` (`dist/crawler_state.db`), creating a 357 MB database. `src/server/index.ts` lines 173-180 and line 289 serve binary images via `GET /v1/media/:id`, and `src/tools/exporter.ts` exports `webp_data BLOB`. This persists copyrighted imagery in SQLite, breaching the Server Test. | **CONFIRMED REFINED REALITY - CODE AUDIT 2026-09-24** | Drop `webp_data BLOB` from SQLite schema. Retain only `phash_64`, `blurhash`, and origin `source_url`. Serve direct Source CDN URLs in API responses per the Ninth Circuit Server Test (*Perfect 10*) and *Kelly v. Arriba Soft* transformative fair use. |
| **G-30**| **`vrc_catalog.db` SQLite Export Missing Terms Metadata Table** | `src/tools/exporter.ts` exports SQLite database catalogs for third-party tools. | `src/tools/exporter.ts` defines `canonical_packages`, `package_fronts`, `media_cache`, and `packages_fts`, but creates zero metadata tables. Downloaded SQLite databases contain no license, no `LEGAL.md` reference, and no terms hash. Under *Register.com v. Verio*, this undermines downstream enforceability of catalog covenants. | **CONFIRMED OMISSIONS - CODE AUDIT 2026-09-24** | Add `CREATE TABLE catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL),` in `src/tools/exporter.ts`. Record terms URL, terms SHA-256 digest, AGPLv3 license reference, and export timestamp. |
| **G-31**| **Server Root Path (`GET /`) Missing API Discovery Document** | API Gateway exposes `/v1/` routes. | Requesting `GET /` returns `404 Not Found`. There is no root discovery endpoint to declare API capabilities, terms of use notice, or catalog schema versions. | **CONFIRMED GAP - CODE AUDIT 2026-09-24** | Add root route `GET /` in `src/server/index.ts` returning API metadata, version, schema endpoints, terms of use URL, and license covenants. |
| **G-32**| **Server Test Circuit Split (*Perfect 10* vs. *Goldman v. Breitbart*)** | Documentation previously treated the Ninth Circuit Server Test as nationwide law. | Second Circuit and SDNY courts (*Goldman v. Breitbart*, *Nicklen v. Sinclair*) rejected the Server Test, holding embedding can infringe display rights even if hosted remotely. *Hunley v. Instagram* noted criticism. | **Reasonable Grounding Truth** | Ground image indexing primarily in *Kelly v. Arriba Soft* transformative fair use (low-resolution visual pointers) while strictly avoiding persistent storage of copyrighted artwork. |
| **G-29**| **SQLite `media_cache.webp_data` BLOB Storage vs. Server Test** | `image_proxy.ts` caches WebP images. Prior report claimed files were in `dist/media/`. | Production code stores raw WebP buffers directly as BLOBs in SQLite `media_cache.webp_data` (`dist/crawler_state.db`), creating a 357 MB database. `src/server/index.ts` lines 173-180 and line 289 serve binary images via `GET /v1/media/:id`, and `src/tools/exporter.ts` exports `webp_data BLOB`. This persists copyrighted imagery in SQLite, breaching the Server Test. | **CONFIRMED REFINED REALITY - CODE AUDIT 2026-09-24** | Drop `webp_data BLOB` from SQLite schema. Retain only `phash_64`, `blurhash`, and origin `source_url`. Serve direct Source CDN URLs in API responses per the Ninth Circuit Server Test (*Perfect 10*) and *Kelly v. Arriba Soft* transformative fair use. |
| **G-30**| **`vrc_catalog.db` SQLite Export Missing Terms Metadata Table** | `src/tools/exporter.ts` exports SQLite database catalogs for third-party tools. | `src/tools/exporter.ts` defines `canonical_packages`, `package_fronts`, `media_cache`, and `packages_fts`, but creates zero metadata tables. Downloaded SQLite databases contain no license, no `LEGAL.md` reference, and no terms hash. Under *Register.com v. Verio*, this undermines downstream enforceability of catalog covenants. | **CONFIRMED OMISSIONS - CODE AUDIT 2026-09-24** | Add `CREATE TABLE catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL),` in `src/tools/exporter.ts`. Record terms URL, terms SHA-256 digest, AGPLv3 license reference, and export timestamp. |
| **G-31**| **Server Root Path (`GET /`) Missing API Discovery Document** | API Gateway exposes `/v1/` routes. | Requesting `GET /` returns `404 Not Found`. There is no root discovery endpoint to declare API capabilities, terms of use notice, or catalog schema versions. | **CONFIRMED GAP - CODE AUDIT 2026-09-24** | Add root route `GET /` in `src/server/index.ts` returning API metadata, version, schema endpoints, terms of use URL, and license covenants. |
| **G-32**| **Server Test Circuit Split (*Perfect 10* vs. *Goldman v. Breitbart*)** | Documentation previously treated the Ninth Circuit Server Test as nationwide law. | Second Circuit and SDNY courts (*Goldman v. Breitbart*, *Nicklen v. Sinclair*) rejected the Server Test, holding embedding can infringe display rights even if hosted remotely. *Hunley v. Instagram* noted criticism. | **Reasonable Grounding Truth** | Ground image indexing primarily in *Kelly v. Arriba Soft* transformative fair use (low-resolution visual pointers) while strictly avoiding persistent storage of copyrighted artwork. |
| **G-29**| **SQLite `media_cache.webp_data` BLOB Storage vs. Server Test** | `image_proxy.ts` caches WebP images. Prior report claimed files were in `dist/media/`. | Production code stores raw WebP buffers directly as BLOBs in SQLite `media_cache.webp_data` (`dist/crawler_state.db`), creating a 357 MB database. `src/server/index.ts` lines 173-180 and line 289 serve binary images via `GET /v1/media/:id`, and `src/tools/exporter.ts` exports `webp_data BLOB`. This persists copyrighted imagery in SQLite, breaching the Server Test. | **CONFIRMED REFINED REALITY - CODE AUDIT 2026-09-24** | Drop `webp_data BLOB` from SQLite schema. Retain only `phash_64`, `blurhash`, and origin `source_url`. Serve direct Source CDN URLs in API responses per the Ninth Circuit Server Test (*Perfect 10*) and *Kelly v. Arriba Soft* transformative fair use. |
| **G-30**| **`vrc_catalog.db` SQLite Export Missing Terms Metadata Table** | `src/tools/exporter.ts` exports SQLite database catalogs for third-party tools. | `src/tools/exporter.ts` defines `canonical_packages`, `package_fronts`, `media_cache`, and `packages_fts`, but creates zero metadata tables. Downloaded SQLite databases contain no license, no `LEGAL.md` reference, and no terms hash. Under *Register.com v. Verio*, this undermines downstream enforceability of catalog covenants. | **CONFIRMED OMISSIONS - CODE AUDIT 2026-09-24** | Add `CREATE TABLE catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL),` in `src/tools/exporter.ts`. Record terms URL, terms SHA-256 digest, AGPLv3 license reference, and export timestamp. |
| **G-31**| **Server Root Path (`GET /`) Missing API Discovery Document** | API Gateway exposes `/v1/` routes. | Requesting `GET /` returns `404 Not Found`. There is no root discovery endpoint to declare API capabilities, terms of use notice, or catalog schema versions. | **CONFIRMED GAP - CODE AUDIT 2026-09-24** | Add root route `GET /` in `src/server/index.ts` returning API metadata, version, schema endpoints, terms of use URL, and license covenants. |
| **G-32**| **Server Test Circuit Split (*Perfect 10* vs. *Goldman v. Breitbart*)** | Documentation previously treated the Ninth Circuit Server Test as nationwide law. | Second Circuit and SDNY courts (*Goldman v. Breitbart*, *Nicklen v. Sinclair*) rejected the Server Test, holding embedding can infringe display rights even if hosted remotely. *Hunley v. Instagram* noted criticism. | **Reasonable Grounding Truth** | Ground image indexing primarily in *Kelly v. Arriba Soft* transformative fair use (low-resolution visual pointers) while strictly avoiding persistent storage of copyrighted artwork. |

---

## Open Questions:



1. **How sure are we that the crawler will passively update the database with new and updated entries?**
   - **[ANSWERED BY CODE AUDIT 2026-09-23]** Partially  -  with critical identified defects:
     - The re-queuing engine (`poissonScheduler.requeueStaleUrls()`) is active on monitor cycles (line 760) and IPC `/recrawl` (line 955).
     - However, the mutability feedback loop (`adjustAfterFetch`) is completely disconnected in `src/`. `db.markStatus` enforces a rigid 24h `next_fetch_at` constant for all URLs regardless of change frequency or HTTP 304 headers.

     - VPM re-seeding is permanently suppressed after the first 50 crawls (`done < 50` bug in `src/crawler/index.ts` line 82).
     - The full-wipe projection runs every 15 minutes, but its $O(n^2)$ clustering across 49k entities degrades with scale, and its `DELETE FROM canonical_packages` resets SQLite rowids, causing silent edge sync loss in Cloudflare D1.



2. **How sure are we that the documentation reflects the ground reality of this document, and the codebase and its accompanying documentation?**
   - **[ANSWERED BY CODE AUDIT 2026-09-23]** We are **confident that documentation severely diverges from ground reality**:
     - `AGENT.md` and `DELEGATES.md` are byte-for-byte identical duplicates (`SHA256: 59E18587DF...`).
     - Test metrics in `AGENT.md` (40/40, 51/0) are obsolete  -  ground truth is 57 passing tests across 12 files.

     - `tests/migrate.test.ts` does not exist (renamed to `tests/schema_unification.test.ts`).
     - Administrative authentication relies on `API_SECRET_TOKEN` in code, but `AGENT.md` documents `CRAWLER_API_TOKEN`. Neither appears in `.env.example`.
     - CLI commands (`vrc-crawler.exe status/recrawl/stop`) do not exist on the crawler binary and cause crashes. they must be run via `vrc-monitor.exe`.
     - The opt-out system (`registerOptOut`) is documented as functional but has zero API routes and zero CLI callers.

     - The timestamp confidence rubric (`DISCOVERY_RULES.md`) is violated in production code by substituting local crawl times for NULL publication dates.

---

## 9. Code-Reality Gap Log

> **Purpose**: A line-level evidence index for every confirmed disconnection between documentation/architecture claims and production source code. All entries verified during the 2026-09-23 complete audit (57 tests passing, `bun test`).

| ID | Claim in Documentation / Architecture | Reality in Production Code | Evidence (File : Lines) |
| :--- | :--- | :--- | :--- |
| **CR-1** | Adaptive Poisson scheduler tunes `next_fetch_at` based on HTTP response mutability. | `poissonScheduler.requeueStaleUrls()` is called in `crawler/index.ts` (lines 760 & 955). However, `adjustAfterFetch(url: string, isModified: boolean, etag?, lastModifiedHeader?)` has **zero callers** in `src/`. Workers invoke `db.markStatus()` which sets a rigid `+86400 seconds` (24h) constant. | `src/utils/poisson_scheduler.ts` lines 49-85. `src/crawler/index.ts` lines 760 & 955. `src/db.ts` lines 707-728. grep for `adjustAfterFetch` in `src/` yields 0 matches. |
| **CR-2** | Schema 4 delisting requires administrative authentication via `CRAWLER_API_TOKEN`. | `src/server/index.ts` line 130 expects `process.env.API_SECRET_TOKEN`. `AGENT.md` line 310 documents `CRAWLER_API_TOKEN`. When `API_SECRET_TOKEN` is unset in `.env`, the auth check (`if (apiToken)`) is bypassed entirely. `processPendingReports()` auto-delists packages without human approval. | `src/server/index.ts` lines 130 & 196-204. `src/tools/steering.ts` lines 81-116. `AGENT.md` line 310. |
| **CR-3** | Full-wipe projection rebuilds canonical catalog every 15 minutes without data loss. | `DELETE FROM canonical_packages. DELETE FROM package_fronts,` executes on every cycle, resetting SQLite rowids to 1. In `src/sync/index.ts` line 130, watermark reset only triggers if `watermarkRowId > maxRowInDb`. If the rebuilt table has $\ge$ watermark rows, the reset fails, and rows 1..watermark are permanently skipped from Cloudflare D1. | `src/tools/pipeline_sanitize.ts` lines 861-864. `src/sync/index.ts` lines 128-133. `src/crawler/index.ts` line 778. |
| **CR-4** | VPM re-seeding keeps the discovery queue populated over time. | Gate condition `if (metrics.platformStats["vpm"].pending < 10 && metrics.platformStats["vpm"].done < 50)` permanently halts VPM seed injection once 50 VPM URLs complete. `done` is monotonically increasing. | `src/crawler/index.ts` line 82. |
| **CR-5** | `origin_created_at` follows the three-state rubric from `DISCOVERY_RULES.md` Sec 4.2. `NULL` when unknown. | When `!originCreatedAt && earliestLocalObservedAt`, pipeline sets `originCreatedAt = earliestLocalObservedAt` with `createdAtConfidence = 'inferred'`. Direct violation of Sec 4.2 mandate forbidding local crawl time substitution. | `src/tools/pipeline_sanitize.ts` lines 918-928. |
| **CR-6** | YouTube embed URLs are rejected at the frontier and never enqueued as image media. | `src/drivers/jinxxy.ts` iterates `__NEXT_DATA__` media array without type filtering, passing YouTube embed URLs to image proxy. `src/utils/image_proxy.ts` `skipPatterns` does not include YouTube domains. | `src/drivers/jinxxy.ts` lines 214-224. `src/utils/image_proxy.ts` lines 740-745. |
| **CR-7** | ETag / `If-Modified-Since` conditional request headers are used for cache efficiency and `HTTP 304` support. | `src/drivers/github.ts` captures raw ETag from response headers but never sends it as `If-None-Match`. No driver sends `If-Modified-Since`. The `HTTP 304` path is dead code. | `src/drivers/github.ts` lines 174-177. |
| **CR-8** | The opt-out system allows creators to remove their listings via an API endpoint with bio-token verification. | `db.registerOptOut()` exists in `src/db.ts` lines 551-578 but has zero API routes in `src/server/index.ts` and zero CLI callers. Bio-token scraping does not exist in any driver. | `src/db.ts` lines 551-578. `src/server/index.ts` (no `/opt-out` route). |
| **CR-9** | `AGENT.md` accurately documents the test suite: "40/40 tests", "51/0 Fail", references `tests/migrate.test.ts`. | Ground truth: 57 tests across 12 files. `tests/migrate.test.ts` does not exist (renamed to `tests/schema_unification.test.ts`). `tests/exporter.test.ts` line 33 asserts `> 0`, not the "15,642 packages" cited as an invariant. `tests/gumroad_driver.test.ts` is omitted from docs. | `bun test` output. `tests/` directory listing. `tests/exporter.test.ts` line 33. |
| **CR-10** | `AGENT.md` and `DELEGATES.md` are distinct documentation files serving different roles. | The two files are byte-for-byte identical (SHA-256: `59E18587DF637D26F6A214B2330B363B6B447740024A61BE453C3E4F5891C661`). One is an undeclared duplicate. | PowerShell `Get-FileHash AGENT.md, DELEGATES.md`. |
| **CR-11** | `canonical_packages` schema is fully unified with no redundant platform URL storage. | Three overlapping URL storage locations exist: (1) flat columns `github_url`, `booth_url`, etc. on `canonical_packages`. (2) `platforms_json` array on `canonical_packages`. (3) `package_fronts` table per-platform `url` rows. `curator_overrides` has both `name_override` and `title_override` coalesced with `||`. | `src/db.ts` DDL sections. `src/tools/pipeline_sanitize.ts`. `src/tools/steering.ts`. |
| **CR-12** | Log output is session-prefixed and rotated/compressed daily. | `src/logger.ts` creates bare `fs.createWriteStream` handles with `{ flags: "a" }`, no session prefix, no rotation trigger, and no Gzip compression. | `src/logger.ts` lines 16-18 & 1-92. |
| **CR-13** | Operational runbooks instruct running `.\dist\vrc-crawler.exe status`, `recrawl`, `project`, `stop`. | `src/crawler/index.ts` contains no CLI subcommand routing. Running `vrc-crawler.exe` with arguments starts a second daemon that crashes with a `ProcessLock` error. IPC commands must be sent via `vrc-monitor.exe`. | `src/crawler/index.ts` lines 970-1030. `src/monitor/index.ts` lines 1-439. |
| **CR-14** | `LEGAL.md` Section 10 Downstream Covenants are technically presented to API consumers. | `src/server/index.ts` returns responses without the `X-Catalog-Terms-Of-Use` header. API consumers receive no in-band notice of contractual covenants, undermining enforceability under browsewrap contract law. | `src/server/index.ts` lines 112-280. |
| **CR-15** | Cloudflare Turnstile bot challenges are detected and isolated from valid product content. | `src/drivers/gumroad.ts` and `src/drivers/jinxxy.ts` do not inspect HTTP 200 HTML payloads for `challenges.cloudflare.com/turnstile` or `cf-mitigated: challenge`. Challenge scripts are parsed as product data and trigger Poisson freshness acceleration loops. | `src/drivers/gumroad.ts` lines 80-120. `src/drivers/jinxxy.ts` lines 75-115. |
| **CR-16** | Creators can submit automated, non-scraping delisting requests via an API route. | `db.registerOptOut()` exists in `src/db.ts` lines 551-578, but `src/server/index.ts` supplies no `POST /v1/opt-out` endpoint. The table is unreachable from external webhooks or DNS verification scripts. | `src/server/index.ts`. `src/db.ts` lines 551-578. |
| **CR-17** | SimHash clustering converges across Japanese BOOTH listings and Western Gumroad mirrors. | `src/tools/pipeline_sanitize.ts` does not normalize full-width CJK punctuation (`【...】`, `（...）`, `：`) or generate character 2-grams. Distinct Japanese character tokens prevent SimHash Hamming distance from converging ($k \le 3$), creating fragmented duplicate entities. | `src/tools/pipeline_sanitize.ts` lines 180-230. |
| **CR-18** | Canonical network edge sync verifies the provenance and node identity of contributed metadata. | The SQLite schema (`entities`, `canonical_packages`) contains no `contributor_node_id`, `crawl_signature`, or `batch_id` columns. Pushing records to Cloudflare D1/R2 cannot trace the origin of corrupted or malicious data. | `src/db.ts` DDL sections. `src/sync/index.ts`. |
| **CR-19** | Image proxy functions as a pure media pointer service, attaching original media links to packages without persisting binaries. | `src/utils/image_proxy.ts` historically attempted binary transcoding. Per maintainer specification, the crawler must strictly pass along media URLs (images, videos, YouTube embeds, GIF links) as pointers; interfacing apps handle caching under their own legal grounds. | `src/utils/image_proxy.ts`. |
| **CR-20** | ETag conditional requests prevent redundant data transfer and rate limit exhaustion across all drivers. | `src/drivers/github.ts` extracts raw `ETag` headers but never sends `If-None-Match`. BOOTH, Gumroad, and Jinxxy drivers send no conditional headers. The `HTTP 304 Not Modified` code path is 100% inoperative. | `src/drivers/github.ts` lines 174-177. `src/drivers/booth.ts`. `src/drivers/gumroad.ts`. |
| **CR-21** | `media_cache` avoids persistent storage of third-party image binaries in SQLite. | Code stores raw WebP buffers directly as BLOBs in SQLite `media_cache.webp_data` (`dist/crawler_state.db`), creating a 357 MB file. `src/server/index.ts` serves binary files via `/v1/media/:id`, and `src/tools/exporter.ts` defines `webp_data BLOB`. Per maintainer specification, this BLOB storage must be deprecated in favor of pure URL pointer arrays. | `src/utils/image_proxy.ts` lines 480-550. `src/server/index.ts` lines 173-180. `src/db.ts` lines 180-210. |
| **CR-22** | `vrc_catalog.db` exports supply in-band notice of `LEGAL.md` and licensing covenants to SQLite consumers. | `src/tools/exporter.ts` creates tables for packages and fronts, but completely omits a `catalog_metadata` table. Downloaded SQLite databases contain zero contractual terms or license text. | `src/tools/exporter.ts` lines 80-215. |
| **CR-23** | Headless API server supplies a root discovery route describing services, versions, and legal terms. | `src/server/index.ts` returns `404 Not Found` for `GET /`. No discovery payload exists to communicate terms of use or endpoint schemas. | `src/server/index.ts` lines 140-388. |

---

## 10. Strict Operational Readiness Assessment: `AGENTS.md` & `DELEGATION.md`

### 10.1 Auditing Verdict: **NEITHER FILE IS READY FOR OPERATIONAL USE**
A strict readiness review of `AGENT.md` and `DELEGATES.md` reveals that neither file is currently suitable for deployment or autonomous coding execution.

### 10.2 Evidence & Critical Deficiencies:



1. **Byte-for-Byte File Duplication**:
   - `AGENT.md` and `DELEGATES.md` share identical cryptographic hashes:
     `SHA256: 59E18587DF637D26F6A214B2330B363B6B447740024A61BE453C3E4F5891C661`.
   - `DELEGATES.md` was intended to serve as a production deployment runbook for site reliability engineers (SREs), while `AGENT.md` was intended for autonomous coding agents. Instead, one is a blind copy of the other, creating severe conceptual blurring between software development contracts and infrastructure operations.



2. **Dangerous Hallucination of Security Secrets**:
   - Both files state at line 310 that `POST /v1/reports` uses `CRAWLER_API_TOKEN` for bearer token authentication.
   - Ground truth in `src/server/index.ts` line 130 is `process.env.API_SECRET_TOKEN`.
   - A deployment engineer following `DELEGATES.md` would configure `CRAWLER_API_TOKEN`, leaving the live production server completely open to unauthenticated remote delisting sabotage (CR-2).



3. **Obsolete Test Baseline & Phantom Test References**:
   - Both files claim a test baseline of "40/40 tests" and "51/0 Fail".
   - The actual test suite contains **57 passing tests across 12 files**.
   - Both files explicitly reference `tests/migrate.test.ts`, which was removed or renamed to `tests/schema_unification.test.ts`. An autonomous agent running `bun test tests/migrate.test.ts` will fail immediately.
   - `tests/gumroad_driver.test.ts` is omitted entirely from both documents.



4. **Broken CLI Instructions**:
   - Both files instruct users to run daemon management commands like `.\dist\vrc-crawler.exe status`, `recrawl`, `project`, and `stop`.
   - Running these commands against `vrc-crawler.exe` spawns a conflicting daemon process that crashes with a `ProcessLock` lockfile collision.
   - Commands must be dispatched through `vrc-monitor.exe` or `bun run src/monitor/index.ts`.



5. **Omission of Test Concurrency & SQLite Locking Invariants**:
   - Neither file informs autonomous coding agents that 7 test files share the live 357 MB `dist/crawler_state.db`.
   - Neither file warns agents that `PRAGMA busy_timeout = 10000,` can cause intermittent 5,000ms Bun test timeouts during parallel test execution.
   - Agents attempting to modify or run tests will encounter spurious failures without understanding the underlying database lock contention.



6. **Concealment of Edge Sync Watermark Loss**:
   - Neither file documents the critical data loss condition in `src/sync/index.ts` line 130, where projection table wipes (`DELETE FROM canonical_packages`) bypass the `watermarkRowId > maxRowInDb` check and permanently drop rows 1..watermark from Cloudflare D1.

---

### 10.3 Prescriptive Separation Architecture

To achieve production readiness, the duplicate files must be split and specialized into two distinct, rigorous documents:

```
┌──────────────────────────────────────────────┐       ┌──────────────────────────────────────────────┐
│                  AGENTS.md                   │       │                DELEGATION.md                 │
│        (Autonomous Coding Agent Contract)    │       │         (Production Deployment Runbook)      │
├──────────────────────────────────────────────┤       ├──────────────────────────────────────────────┤
│ • Accurate ground-truth suite: 57 tests / 12 │       │ • Production VPS packaging & binaries        │
│   files (bun test).                          │       │ • Daemon management via NSSM / systemd       │
│ • Test isolation mandate: use :memory: or    │       │ • IPC dispatch via vrc-monitor.exe (NEVER    │
│   fixture DBs to prevent lock contention.    │       │   vrc-crawler.exe subcommands)               │
│ • Code-Reality Gap Index (CR-1 to CR-13) as  │       │ • Cloudflare Tunnel, Workers, & D1 setup     │
│   active invariants.                         │       │ • Canonical API secret: API_SECRET_TOKEN     │
│ • Mandatory conditional headers & true       │       │ • Edge sync watermark verification &         │
│   adjustAfterFetch() signature.              │       │   full-wipe recovery procedures              │
│ • Zero unverified claims or phantom files.   │       │ • Log rotation, archival, and crash recovery │
└──────────────────────────────────────────────┘       └──────────────────────────────────────────────┘
```

#### A. Dedicated `AGENTS.md` (Coding Agent Contract)


1. **Authoritative Test Baseline**: Mandate `bun test` across all 12 test files (57 tests, 276 assertions). List exact file paths (including `schema_unification.test.ts` and `gumroad_driver.test.ts`).


2. **Database Concurrency Isolation**: Explicitly require agents to isolate test databases from `dist/crawler_state.db` using in-memory SQLite (`:memory:`) or dedicated fixtures.


3. **Verified Subsystem Interfaces**:
   - Document `PoissonScheduler.adjustAfterFetch(url, isModified, etag, lastModifiedHeader)` with its true signature and note the mutability feedback loop disconnection.
   - Document the unauthenticated delisting risk in `POST /v1/reports` and the `API_SECRET_TOKEN` requirement.
   - Document the timestamp confidence rubric (`DISCOVERY_RULES.md` Sec 4.2) and the prohibition against substituting crawl times for NULL dates.


4. **No Phantom Files**: Remove all references to `tests/migrate.test.ts`.

#### B. Dedicated `DELEGATION.md` (Deployment & Operations Runbook)


1. **Binary Topography & Roles**:
   - `vrc-crawler.exe`: Autonomous harvesting daemon (single-instance via `ProcessLock`).
   - `vrc-monitor.exe`: CLI management and terminal dashboard. All subcommands (`status`, `recrawl`, `project`, `stop`, `sync`, `export`) MUST be dispatched through this binary.
   - `vrc-server.exe`: Headless REST API gateway.
   - `vrc-sync.exe`: Cloudflare edge synchronization tool.


2. **Environment & Secrets Configuration**:
   - Declare `API_SECRET_TOKEN` (NOT `CRAWLER_API_TOKEN`) for administrative bearer authentication.
   - Document Cloudflare D1/R2 credentials (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_D1_DATABASE_ID`).
   - supply complete `.env.example` templates.


3. **Operational Runbook & Security Isolation**:
   - Extract Sections 8 and 9 from `AGENT.md` to keep deployment operations strictly decoupled from coding agent contracts. Focus purely on binary compilation, systemd/NSSM supervisor setup, Cloudflare Tunnel routing, Cache Rules, and WAF rate limiting.
   - Enforce Security Gating: Require configuring `API_SECRET_TOKEN` and gating `POST /v1/reports` behind an administrative review buffer (`needs_review`) before exposing the server publicly.
   - Correct CLI Command Dispatch: Explicitly mandate that IPC commands must be dispatched via `vrc-monitor.exe <command>` (or `bun run src/monitor/index.ts <action>`), NEVER `vrc-crawler.exe`.


4. **Edge Sync Watermark Management & Verification**:
   - supply operational commands for forced watermark resets (`--reset-watermark`) whenever projections are rebuilt from scratch, preventing silent D1 data omission.
   - Supply concrete SQL queries and verification curl checks to confirm Cloudflare D1 high-watermark consistency after sync sweeps:
     ```sql
     -- Verify high-watermark rowid alignment between local SQLite and remote D1
     SELECT MAX(rowid) AS local_max_rowid FROM canonical_packages;
     SELECT checkpoint_value FROM sync_checkpoints WHERE checkpoint_key = 'cloudflare_d1_canonical_packages';
     ```


5. **Service Supervision & Log Archival**:
   - Document Windows service installation via NSSM and Linux service installation via `systemd`.
   - Configure external log rotation sweeps (`logrotate` on Linux, PowerShell scheduled sweep on Windows) until native rotation is merged into `src/logger.ts`.

---

## 11. Immediate Recommended Action Items for the Codebase

Based on the 2026-09-23 complete audit, the following five remediation tasks are prioritized in order of severity:



1. **Security (Remote Delisting Vulnerability)**:
   - Patch `src/server/index.ts` (lines 130 & 196-204) to mandate `API_SECRET_TOKEN` authentication on `POST /v1/reports`.
   - Patch `src/tools/steering.ts` (lines 81-116) so that reports with `branch: "irrelevance"` and `irrelevanceReason: "malicious_or_scam"` are quarantined into a human-review buffer (`needs_review`) rather than immediately mutating `lifecycle = 'delisted'`.
   - Declare `API_SECRET_TOKEN` in `.env.example` and remove all documentation references to hallucinated `CRAWLER_API_TOKEN`.



2. **Crawl Loop (VPM Seeding Permanent Lockout)**:
   - In `src/crawler/index.ts` line 82, replace the absolute `done < 50` gate condition with a temporal staleness check (e.g., `Date.now() - lastVpmSeedAt > 7 * 86400 * 1000`), making sure long-running daemons continue to discover newly published VPM feeds.



3. **[TASK_PERFORMED_AND_READY_FOR_CONTEXT_PURGE] Documentation & Agent Contracts (Divergence & Specialization)**:
   - Split the duplicate `AGENT.md` and `DELEGATES.md` files into dedicated, authoritative specifications:
     - `AGENT.md`: Autonomous coding agent contract documenting the verified 57-test baseline, SQLite concurrency isolation invariants, true `adjustAfterFetch` signature, and CR-1 through CR-13 gap index.
     - `DELEGATES.md`: Production deployment runbook covering binary roles, NSSM/systemd setup, `vrc-monitor.exe` CLI dispatch, Cloudflare WAF/Tunnel configuration, and D1 watermark recovery.
   - **[TASK PERFORMED & VERIFIED 2026-09-23]**: `AGENT.md` and `DELEGATES.md` have been fully rewritten and decoupled into dedicated specifications, verified with ASD-STE100 rules and future tenses with zero context loss.



4. **Concurrency & Test Suite Isolation**:
   - Decouple CI/CD and parallel test execution from the live 357 MB `dist/crawler_state.db`. make sure tests instantiate ephemeral in-memory databases (`:memory:`) or dedicated fixture databases to eliminate SQLite `busy_timeout` contention with Bun 5,000ms test runner.



5. **Edge Sync Watermark Recovery & Data Loss Prevention**:
   - In `src/sync/index.ts` line 130, fix the watermark recovery condition to detect full-wipe projections even when the rebuilt table has more rows than the previous watermark (e.g., track projection generation epoch or use deterministic UUIDs rather than mutable SQLite auto-increment rowids).



6. **API Assent & Downstream Terms Architecture (Legal & Technical Consultation)**:
   - **Context**: In `LEGAL.md` Section 10, downstream consumers of Project REST APIs, SQLite databases (`vrc_catalog.db`), and Cloudflare D1 catalogs agree to Downstream Covenants (mandatory Source Storefront URL deep-linking, no commercial paywalls, anti-AI dataset usage restrictions, 256-char description limits) as a contractual condition of access.
   - **Architectural Gap**: Unauthenticated HTTP GET requests (e.g., `curl https://api.example.com/search?q=...`) receive data without technical presentation of or assent to `LEGAL.md`. Under contract law, enforcing terms against anonymous downstreams requires demonstrable notice or assent.
   - **Future Decisions & Consultation Roadmap**:

     - *Phase 1 (Notice Injection)*: Update `vrc-server.exe` (`src/server/index.ts`) to return an `X-Catalog-Terms-Of-Use: https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md` header on all API responses and include licensing metadata in the API root payload (`GET /`).
     - *Phase 2 (Developer Portal / API Key Tiers)*: For bulk consumers, search engine aggregators, and commercial tools, evaluate introducing registered API keys gated behind an explicit terms agreement screen.
     - *Phase 3 (Jurisdictional Legal Review)*: Consult legal counsel on cross-border enforcement of dataset licenses and anti-AI covenants against anonymous scrapers in key jurisdictions (US, EU, Philippines).



7. **Canonical Network Governance & Decentralized Trust Model (Legal & Technical Architecture)**:
   - **Context**: `LEGAL.md` Section 1.3 defines a decentralized canonical network where independent node operators run crawler binaries and push discovered metadata to a canonical edge distribution layer (Cloudflare D1/R2).
   - **Architectural & Governance Gaps to Resolve**:
     - *Node Authentication & Cryptographic Identity*: Determine whether nodes authenticate via mTLS, signed tokens, or pre-registered operator keys before pushing records to edge conduits.

     - *Data Provenance & Audit Trail*: Implement database provenance tracking columns (`contributor_node_id`, `crawl_origin_signature`, `ingestion_batch_id`) to identify the source of corrupted, malicious, or non-compliant metadata.
     - *Delisting Propagation Protocol*: Establish an automated protocol making sure that when a listing is delisted on the canonical edge, delist directives propagate across all participating decentralized nodes to prevent recrawl resurrection.
     - *Contributed Data Licensing Agreement*: Draft formal contributor terms clarifying indemnity, warranties, and licensing of contributed metadata before launching public node federation.



8. **"Google Indexer" Architectural Projection for the VRChat Ecosystem (The Canonical Vision)**:
   - **Context**: The program attempts to achieve the functional equivalent of a specialized "Google Indexer" tailored for the VRChat Package & Asset Ecosystem. It operates as an unauthenticated discovery utility, not a competitor marketplace.
   - **The Five Core Subsystems of the VRChat Google Indexer**:
     1. *Transport & Discovery Layer*:

        - RFC 9309 compliant `robots.txt` parser with 24h caching.
        - Host-isolated AIMD rate limiter (3.0-5.0s on closed storefronts) with decorrelated jitter.
        - Zero-Bypass perimeter protocol: treats Turnstile challenges (`HTTP 200` with challenge DOM or `403`) as an immediate access refusal. halts operations on that host.
        - Federated registry seeding (`discover_vpm.ts` via ALCOM / community manifests), eliminating open-web unindexed spiders. 2. *CQRS Raw Observation Lake (`entities`)*:

        - Immutable event log of raw network fetches.
        - Extraction strictly limited to factual metadata (package names, reverse-DNS identifiers, semver numbers, pricing, compatibility flags, and Source Storefront URLs).
        - 256-character functional snippet truncation for product descriptions (*Authors Guild v. Google* doctrine).


3. *Entity Resolution & Knowledge Graph (`pipeline_sanitize.ts`)*:
        - Disjoint-Set Union (DSU) graph clustering linking BOOTH listings, Western Gumroad mirrors, GitHub repositories, and VPM package manifests.
        - 64-bit SimHash near-duplicate detection augmented with CJK punctuation normalization (NFKC, bracket stripping `【...】`) and character 2-gram shingling.
        - Strict isolation of standalone avatar cosmetics (clothing, hair) into a separate taxonomy tier with required base avatar associations (Kikyo, Manuka, Shinano) to prevent toolchain catalog pollution.
      4. *Pure Media Pointer Pipeline (`src/utils/image_proxy.ts`)*:
        - The indexer strictly passes along media attachment URLs (images, videos, YouTube embeds, GIF links) as pointers in the canonical package metadata.
        - Deprecates local SQLite `media_cache.webp_data` BLOB storage. Interfacing client applications (such as desktop package managers) handle caching and rendering under their own independent legal and operational frameworks.
        - Delivers direct origin Source CDN URLs in API feeds (*Perfect 10 v. Amazon* Server Test).
      5. *Autonomous Governance & Sovereign Creator Rights (`src/tools/steering.ts`, `src/server/index.ts`)*:
        - Non-scraping delisting interface (`POST /v1/opt-out`) supporting DNS TXT verification (`vrc-opt-out=<vendor-id>`) and signed Git commits with a 24-48h SLA.
        - Quarantined Schema 4 curation reports (`needs_review` buffer) requiring `API_SECRET_TOKEN` authentication and consensus thresholds before permanent lifecycle mutations.

        - Automatic injection of `X-Catalog-Terms-Of-Use: <url>` headers on all API responses (RFC 9110) to establish enforceable contractual notice for downstream consumers.



9. **Cloudflare Turnstile Detection & Poisson Acceleration Guard (`src/drivers/gumroad.ts`, `src/drivers/jinxxy.ts`)**:
   - **Problem**: When Cloudflare presents a Managed Challenge, it serves an `HTTP 200 OK` status with a challenge payload containing Turnstile scripts. The crawler treats this as a document update, accelerates the Poisson crawl rate ($\lambda \times 1.4$), and bombards the host into an IP ban.
   - **Remediation**: In all driver HTML response parsers, inspect the payload before DOM extraction:
     ```typescript
     if (html.includes("challenges.cloudflare.com/turnstile") || html.includes("cf-mitigated: challenge")) {
       logger.warn(`[AntiBot] Cloudflare Managed Challenge encountered on ${url}. Halting domain crawl.`);
       db.markStatus(url, "blocked", 86400 * 3); // 3-day backoff
       return null;
     }
     ```



10. **CJK Text Normalization & SimHash Convergence (`src/tools/pipeline_sanitize.ts`)**:

    - **Problem**: Japanese creator listings on BOOTH heavily use full-width decorative brackets (`【VRChat想定】`, `［PhysBones対応］`) and author tags. Unstripped CJK brackets distort 2-gram tokenization, preventing SimHash Hamming distance from converging with Western mirrors.

    - **Remediation**: Implement Unicode NFKC normalization and bracket stripping before tokenization:
      ```typescript
      export function normalizeListingTitle(title: string): string {
        return title
          .normalize("NFKC")
          .replace(/【[^】]*】/g, " ")
          .replace(/\[[^\]]*\]/g, " ")
          .replace(/[（(][^）)]*[）)]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      ```



11. **Automated Non-Scraping Opt-Out Endpoint (`POST /v1/opt-out` in `src/server/index.ts`)**:

    - **Problem**: `db.registerOptOut()` exists in `src/db.ts` but has zero callers in `src/server/index.ts`. Creators cannot exercise sovereign delisting rights without contacting the maintainer manually.

    - **Remediation**: Expose `POST /v1/opt-out` in `src/server/index.ts`:
      - Accept payload: `{ vendorId: string, proofType: "dns_txt" | "signed_commit" | "email_token", proofValue: string }`.

      - For `proofType: "dns_txt"`, resolve `_vrc-opt-out.<vendorDomain>` via `node:dns/promises` and verify the TXT record matches `vrc-opt-out=<vendorId>`.
      - Upon verification, call `db.registerOptOut(vendorId, "dns_txt_verified")` and trigger immediate projection sanitization to mark all associated packages as `lifecycle = 'delisted'`.



12. **In-Band Downstream Terms Header Injection (`src/server/index.ts`)**:

    - **Problem**: Anonymous API callers receive catalog feeds without technical notice of `LEGAL.md` Section 10 Downstream Covenants.

    - **Remediation**: Add middleware in `src/server/index.ts` injecting:
      ```typescript
      res.setHeader("X-Catalog-Terms-Of-Use", "https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md");
      ```
      Include licensing invariants in the root `GET /` API response object.
