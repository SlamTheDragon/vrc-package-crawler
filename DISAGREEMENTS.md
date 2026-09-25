# Architectural, Factual & Systems Disagreements Audit (DISAGREEMENTS.md)

> **Document Status**: Authoritative Discrepancy Registry, Code-Reality Gap Analysis & Technical Contradiction Audit  
> **Target Repository**: `F:\.repo\.main\vrc-package-crawler` (Version 0 Ground-Truth Baseline)  
> **Audit Date**: September 25, 2026  
> **Governing Baseline**: Phase 4 Verification Baseline (Commit `9f46b3b` Traceability), `LEGAL.md` Supremacy, `TODO.md` Roadmap  
> **Policy Invariant**: Version 0 codebase: deletion is allowed, deprecation is unnecessary.

---

## Executive Summary & Authoritative Verification Chain

A comprehensive architectural and code-reality audit across all specifications (`LEGAL.md`, `TODO.md`, `AGENT.md`, `DELEGATES.md`, `README.md`, `docs/`), codebase implementations (`src/server/`, `src/crawler/`, `src/drivers/`, `src/sync/`, `src/db.ts`, `src/utils/`), and test suites reveals critical technical contradictions, non-standardized identifiers, fragile edge behaviors, and factual discrepancies where differing documents or subsystem boundaries claim conflicting truths.

### The Authoritative Verification Chain
To eliminate mock-reality drift, false-positive compliances, and premature production assertions, the repository establishes a strict **Verification Chain**:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                            THE VERIFICATION CHAIN OF TRUTH                                       │
│ LEGAL.md ──► TODO.md ──► Implementation ──► Deterministic Tests ──► DISAGREEMENTS.md ──► Resolve/Defer ──► Prod │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Phase 4 Accomplishment & Milestone Sign-Off**:  
> In Phase 4, all **Tier 1 Pre-v1.0 Security & Legal Blockers** (OVERLOOKED-1 through OVERLOOKED-5), **Tier 2 Route & Scale Invariants** (OVERLOOKED-6 through OVERLOOKED-8), and **Tier 3 Pipeline Scalability Blockers** (OVERLOOKED-9, OVERLOOKED-10) were systematically remediated, integrated into the codebase, and verified across **84 deterministic tests across 17 test files (551 assertions)** with zero failures and zero access to production databases.  
> 
> However, an adversarial deep-dive into the post-Phase 4 codebase uncovers **new critical breaking points, fragile edge behaviors, factual discrepancies, and stale/uncalled code** (OVERLOOKED-11 through OVERLOOKED-19) that must be formally triaged before production exposure.

### Document Role: Gap Registry, Not a Parallel Architecture
Per architectural review, **`DISAGREEMENTS.md` is strictly a Discrepancy, Contradiction, and Gap Registry** ("Here are known disagreements between intended behavior, implementation, documentation, and external constraints").  
**It MUST NOT be treated as an independent architectural specification** ("Here is how the system works").  
To prevent documentation sprawl where multiple artifacts independently redefine the system, the project maintains a single core pipeline mental model:

```
VPM Source ──► Discovery ──► Fetch ──► Parse ──► Normalize ──► Store ──► Index/Projection ──► API ──► Consumer
```

All auxiliary modules (legal policy, robots.txt, storefronts, delta sync, media streaming, terms headers) must attach cleanly to this pipeline.

### The Post-TODO Code Freeze & System Simplification Boundary
The repository operates under a strict **Freeze Boundary Workflow**:
```
Current State (Phase 4 Done) ──► Complete Phase 5 (TODO.md) ──► CODE FREEZE ──► Manual System Review ──► Simplification & Deletion Pass
```
Rather than continuously layering new speculative architecture to solve problems caused by prior layers, once `TODO.md` is finished, the codebase enters a hard Code Freeze. A comprehensive manual system review will audit the pipeline from the outside inward, evaluating which subsystems are genuinely necessary and cutting accidental complexity. OVERLOOKED-11 through OVERLOOKED-19 are formally queued for this simplification and stabilization review.

This document formally records:
1. **Critical Breaking Points, Fragile Edge Behaviors & Missing Guards** (Active edging points and subtle failure modes).
2. **Critical Highlight: Mock, Stale, Uncalled, and Outdated Code** (Redundant subprocesses, dead enums, stale status filters).
3. **Subsystem Disagreements & Document Contradictions** (Where one document or module directly conflicts with another).
4. **Non-Standardized Architecture, Identifiers & Terminology Dislocation** (Mixed-up identifiers, column semantic misalignments).
5. **Phased Categorization**:
   - **Phase 4 Verification Sign-Off**: OVERLOOKED-1 through OVERLOOKED-10 resolved and verified.
   - **Category 1 (Obvious Unvisited)**: Formally scheduled for Phase 5 (Tasks 5.1–5.3) and Post-v1.0 (Task 5.4).
   - **Category 2 (Newly Triaged Overlooked Deficiencies)**: OVERLOOKED-11 through OVERLOOKED-19 prioritized for subsequent resolution.

---

## 1. Critical Breaking Points, Fragile Edge Behaviors & What Is Missing

### 1.1 [OVERLOOKED-11] [CRITICAL STALE / CPU WASTE] Redundant WebP Transcoding & IPC Overhead in `image_proxy.ts` / `sharp_worker.ts`
- **Subsystem**: `src/utils/image_proxy.ts` & `src/utils/sharp_worker.ts` vs `src/server/index.ts`
- **The Edging Failure**:
  1. In Phase 3 (Task 3.2), `webp_data` BLOB storage was completely eliminated from SQLite `media_cache` to comply with the Ninth Circuit Server Test (*Perfect 10 v. Amazon*) and purge 350 MB of database bloat.
  2. However, in `src/utils/image_proxy.ts#L571-L661`, `ImageProxyService.processAndCacheImage()` still resizes every incoming thumbnail candidate to 480x270 WebP and computes `webpData`.
  3. When running inside compiled standalone executables (`vrc-crawler.exe`), `image_proxy.ts` spawns a standalone child process worker (`src/utils/sharp_worker.ts`) via `bun run`, pipes the image buffer over IPC stdin as base64, has the subprocess transcode to 480x270 WebP, receives `webp_b64` back, decodes it into a Buffer... and then, in line 700, **completely drops `webpData` without writing it anywhere!**
  4. Meanwhile, `src/server/index.ts#L424-L527` implements its own fully independent in-memory streaming proxy (`GET /v1/media/stream?url=...`).
- **Consequence**: Substantial CPU cycles, memory allocations, and subprocess IPC roundtrips are wasted on every crawled image generating WebP buffers that are instantly garbage-collected without ever being stored or served.

### 1.2 [OVERLOOKED-12] [CRITICAL STALE / INVARIANT VIOLATION] Stale Status Filter in `resetFrontierForRecrawl()` Resets Dead-Letter & Blocked Queues
- **Subsystem**: `src/db.ts#L492-L510` (`resetFrontierForRecrawl`)
- **The Edging Failure**:
  - `resetFrontierForRecrawl()` executes:
    ```sql
    UPDATE frontier
    SET status = 'pending', attempts = 0, etag = NULL, last_modified = NULL, next_fetch_at = ?, updated_at = ?
    WHERE status != 'discarded';
    ```
  - In `src/db.ts#L242`, the table CHECK constraint defines:
    ```sql
    CHECK(status IN ('pending', 'fetching', 'done', 'failed', 'blocked', 'dead_letter', 'circuit_broken', 'backoff'))
    ```
  - The status `'discarded'` is **completely non-existent** in the schema! It is a legacy relic from pre-Phase 2 iterations.
  - Because `status != 'discarded'` evaluates to `TRUE` for every single row in `frontier`, invoking a recrawl pass resets `status = 'blocked'` (URLs forbidden by RFC 9309 `robots.txt`) and `status = 'dead_letter'` (URLs that failed max retry attempts) back to `pending`.
- **Consequence**: Violates autonomous dead-letter and politeness invariants; causes the crawler to immediately re-attack blocked endpoints and unrecoverable broken links.

### 1.3 [OVERLOOKED-13] [DATA INTEGRITY / CLIENT SYNC AMNESIA] Delta Feed Missing `projection_epoch` & High-Watermark Cursor Invalidation
- **Subsystem**: `src/server/index.ts` (`GET /v1/catalog/delta`) vs `src/sync/index.ts`
- **The Edging Failure**:
  - In Phase 3, Task 3.4 introduced `projection_epoch` in `sync_checkpoints` so `runEdgeSync` can detect when a database wipe or full projection rebuild resets SQLite rowids to 1, triggering a safe watermark realignment sweep.
  - However, `GET /v1/catalog/delta` and `/v1/packages/stream` return only:
    ```json
    { "cursor": "15000", "nextCursor": "15000", "generatedAt": "...", "deltaCount": 0, "deltas": [] }
    ```
  - **The payload contains zero epoch tracking or total catalog count.**
  - If a server operator resets or rebuilds the canonical database, `rowid` values start again from 1. A downstream desktop client that polled up to `cursor=15000` will submit `?cursor=15000` to the new database (which only has rows 1..1000). The query `WHERE rowid > 15000` returns 0 deltas, and the server reports `nextCursor: "15000"`.
- **Consequence**: Downstream client desktop caches believe they are 100% up to date while missing the entire reconstructed catalog, suffering permanent delta synchronization amnesia.

### 1.4 [OVERLOOKED-14] [SECURITY / COMPLIANCE EDGING] Storefront Bio-Token Opt-Out Probe Unhandled HTTP Redirects (301/302)
- **Subsystem**: `src/server/index.ts` (`POST /v1/opt-out`, `fetchWithPinnedIp`)
- **The Edging Failure**:
  - `fetchWithPinnedIp` enforces cryptographic IP pinning by resolving the domain IP via `dns.lookup`, validating against private IP ranges, and opening a direct socket connection to the pinned IP with `Host` and TLS SNI headers.
  - However, Node's underlying `http`/`https` request does not follow HTTP redirects automatically.
  - If a creator supplies a BOOTH or Jinxxy URL that issues a standard language redirect (e.g. `https://booth.pm/items/12345` -> `https://booth.pm/ja/items/12345` or creator profile subdomains -> custom domains), `fetchWithPinnedIp` receives `HTTP 301 Moved Permanently` or `HTTP 302 Found`.
  - The route handler checks:
    ```typescript
    if (probeResp.status < 200 || probeResp.status >= 300) {
      return new Response(JSON.stringify({ error: `Storefront probe failed: HTTP ${probeResp.status}` }), { status: 400 });
    }
    ```
- **Consequence**: The opt-out endpoint returns `HTTP 400 Bad Request` on valid creator storefront URLs that issue benign redirects, denying creators their verified non-scraping delisting right under `LEGAL.md` §9.4–9.5.

### 1.5 [OVERLOOKED-15] [FACTUAL BREAKAGE / VCC ECOSYSTEM] `GET /v1/vpm/index.json` Hardcoded SemVer `1.0.0`
- **Subsystem**: `src/server/index.ts#L900` (`GET /v1/vpm/index.json`)
- **The Edging Failure**:
  - The VPM repository manifest generator constructs package version entries via:
    ```typescript
    const defaultVersion = "1.0.0";
    packagesObj[pkgId] = {
      versions: {
        [defaultVersion]: {
          name: pkgId,
          version: defaultVersion,
          displayName: p.name,
          ...
        }
      }
    };
    ```
  - **Every single package in the community repository is hardcoded to version `1.0.0`.**
  - Authoritative upstream release versions (e.g. `2.4.1`, `0.8.0`, `1.5.3`) discovered in `entities.raw_json` or GitHub release tags are completely ignored.
- **Consequence**: Package managers (ALCOM and VCC) relying on SemVer ordering cannot determine whether an installed package is outdated. Package update prompts fail completely, or package managers attempt to downgrade modern packages to `1.0.0`.

### 1.6 [OVERLOOKED-16] [NON-STANDARDIZED ARCHITECTURE] String Sentinel `'none'` in `canonical_packages.media_id` Violates Foreign Key Integrity
- **Subsystem**: `src/crawler/projection.ts`, `src/utils/image_proxy.ts`, `src/sync/exporter.ts`
- **The Edging Failure**:
  - When an indexed package has no candidate thumbnail image, `ImageProxyService` executes:
    ```sql
    UPDATE canonical_packages SET media_id = 'none' WHERE canonical_id = ?;
    ```
  - In `src/sync/exporter.ts`, the exported SQLite database defines:
    ```sql
    CREATE TABLE media_cache (id TEXT PRIMARY KEY, source_url TEXT NOT NULL UNIQUE, ...);
    ```
  - `canonical_packages.media_id` logically functions as a foreign key pointing to `media_cache.id`.
  - Storing the literal string `'none'` instead of SQLite `NULL` creates dangling references for packages lacking media. If `PRAGMA foreign_keys = ON;` is enabled, `PRAGMA foreign_key_check` immediately flags foreign key corruption.
- **Consequence**: Offline SQLite consumers and Tauri desktop applications enforcing foreign key constraints encounter join errors or database constraint exceptions.

### 1.7 [OVERLOOKED-17] [ARCHITECTURAL DISLOCATION] `GET /v1/catalog/delta` Omission of Multi-Storefront Fronts
- **Subsystem**: `src/server/index.ts` (`GET /v1/catalog/delta`)
- **The Edging Failure**:
  - In Phase 4 (Task 4.1), `canonical_packages` was strictly standardized to 2 URL columns (`url` and `vcc_url`), with all multi-storefront mirrors (BOOTH, Gumroad, Jinxxy, Itch) mapped into `package_fronts`.
  - In `runEdgeSync`, both `canonical_packages` and `package_fronts` are replicated to Cloudflare D1.
  - However, in `src/server/index.ts#L858` (`GET /v1/catalog/delta`), the delta feed serializes only:
    ```typescript
    package: {
      name: pkg.name,
      author: pkg.author,
      url: pkg.url,
      isVcc: Boolean(pkg.is_vcc),
      ...
    }
    ```
  - `package_fronts` records are **completely omitted from the delta stream payload**.
- **Consequence**: Downstream API clients querying the delta feed cannot see that a package is available across multiple platforms or inspect per-storefront pricing without issuing separate out-of-band queries.

### 1.8 [OVERLOOKED-18] [SCALABILITY / API RATE LIMITING] Sequential Unbatched Cloudflare D1 Requests for `package_fronts` in `runEdgeSync`
- **Subsystem**: `src/sync/index.ts` (`runEdgeSync`)
- **The Edging Failure**:
  - In `runEdgeSync`, `canonical_packages` are batched into a single SQL statement.
  - However, `package_fronts` are synchronized via an iterative `for (const f of pendingFronts)` loop that issues an independent HTTP POST request to the Cloudflare D1 query API for every single front row:
    ```typescript
    for (const f of pendingFronts) {
      await fetch(url, { method: "POST", body: JSON.stringify({ sql: frontSql, params: frontParams }) });
    }
    ```
- **Consequence**: In a batch of 50 canonical packages with 3 storefronts each (150 fronts), the edge sync worker initiates 150 serial HTTP connections to Cloudflare. This causes connection stalls, risks Cloudflare API rate-limiting (`HTTP 429`), and prolongs sync runtimes from seconds to minutes.

### 1.9 [OVERLOOKED-19] [STALE / DEAD CODE] Dead Status Enum `'needs_review'` in `user_reports`
- **Subsystem**: `src/db.ts#L440` vs `src/crawler/steering.ts#L80-L95`
- **The Edging Failure**:
  - In `src/db.ts#L440`, table `user_reports` defines:
    ```sql
    CHECK(status IN ('pending', 'applied', 'rejected', 'needs_review'))
    ```
  - When a report with `branch = 'irrelevance'` or `'scam'` is processed in `src/crawler/steering.ts`:
    - It sets `canonical_packages.lifecycle = 'needs_review'` (the quarantined buffer).
    - But on `user_reports`, it calls:
      ```typescript
      targetDb.markReportStatus(report.report_id, "applied");
      ```
  - The status `'needs_review'` on `user_reports` is **never assigned by any code in the repository**.
- **Consequence**: Schema confusion where operators querying `SELECT * FROM user_reports WHERE status = 'needs_review'` find 0 rows, even though packages have transitioned into `'needs_review'`.

---

## 2. Critical Highlight: Mock, Stale, Uncalled, and Outdated Code

Pursuant to the ground-truth audit protocol, the following items are formally registered as **Critical Mock, Stale, Uncalled, and Outdated Code**. *(Note: Code targeted by Phase 5—specifically open-web VPM manifest discovery, VRCArena adapters, and avatar cosmetics taxonomy isolation—is formally excluded from this deprecation registry, as it belongs to the Phase 5 roadmap).*

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              CRITICAL MOCK, STALE & OUTDATED CODE REGISTRY                             │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. SharpSubprocess Worker & Discarded WebP Buffers (src/utils/image_proxy.ts, sharp_worker.ts)       │
│ 2. Phantom 'status != discarded' in Frontier Reset (src/db.ts#L508)                                    │
│ 3. Dead 'needs_review' Status Enum in user_reports (src/db.ts#L440)                                   │
│ 4. Stale 357 MB Database & WAL Leftovers in bin/ (bin/crawler_state.db)                                 │
│ 5. Direct 302 Redirect to Hotlink-Blocked Storefront CDNs (src/server/index.ts#L530-L540)             │
│ 6. In-Code Mock Fetch Injection Hook in Production Transport (src/server/index.ts#L35)                │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **`SharpSubprocess` Worker & Discarded WebP Buffers (`src/utils/image_proxy.ts`, `src/utils/sharp_worker.ts`)**:
   - Spawns a child process worker via `bun run` to transcode images into 480x270 WebP and return `webp_b64`.
   - `media_cache` has no `webp_data` column. The resulting `webpData` buffer is instantly dropped.
   - The entire subprocess architecture and WebP transcoding logic in `image_proxy.ts` is stale, redundant dead code.
2. **Phantom `'discarded'` Status in `resetFrontierForRecrawl()` (`src/db.ts#L508`)**:
   - `WHERE status != 'discarded'` relies on a status value that has never existed in the table CHECK constraints.
   - Causes indiscriminate wipes of dead-letter and robots.txt blocked records.
3. **Dead `'needs_review'` Enum in `user_reports` (`src/db.ts#L440`)**:
   - Defined in the CHECK constraint, but never written by `src/crawler/steering.ts`.
4. **Stale 357 MB Database in `bin/` (`bin/crawler_state.db`)**:
   - A legacy, pre-Phase 3 database containing obsolete WebP BLOBs resides in `bin/` (357 MB), creating operator confusion against the canonical runtime database in `dist/`.
5. **Direct 302 Redirect to Hotlink-Blocked Storefront CDNs (`src/server/index.ts#L530-L540`)**:
   - `GET /v1/media/:id` and `/v1/thumbs/:id` issue a 302 redirect directly to `row.source_url`.
   - For Pixiv (`*.pximg.net`), Gumroad, or Itch CDNs that mandate `Referer` headers or block hotlinking, redirecting the user's browser produces immediate `HTTP 403 Forbidden` errors. This route is outdated and fails to redirect to or utilize the ephemeral proxy `/v1/media/stream?url=...`.
6. **In-Code Mock Fetch Hook in Production Transport (`src/server/index.ts#L35`)**:
   - Production socket security code (`fetchWithPinnedIp`) checks `if ((globalThis.fetch as any).__isMocked)`.
   - Testing shims reside directly within core network security transport modules rather than being injected via dependency injection or isolated test harnesses.

---

## 3. Subsystem Disagreements & Document Contradictions

| Topic | Party A Claim | Party B Claim | Reality / Codebase Truth |
| :--- | :--- | :--- | :--- |
| **API Gateway Version Identifier** | `package.json` declares `"version": "1.0.0"`; `GET /` reports `"version": "1.1.0"` | `src/server/index.ts#L416` (`GET /v1/health`) reports `"version": "2.0.0"` | Disagreement: Three conflicting version strings are reported across the API gateway endpoints. |
| **Schema 2 Manifest SemVer** | `docs/REPORTING_SCHEMAS.md` §3 specifies multi-version SemVer maps (`versions: { "1.0.0": ..., "1.1.0": ... }`) | `src/server/index.ts#L900` hardcodes `defaultVersion = "1.0.0"` for all VPM packages | Disagreement: Schema 2 manifest in code ignores true upstream versions and hardcodes `1.0.0`. |
| **Project Dependency Audit (Schema 3)** | `docs/REPORTING_SCHEMAS.md` Section 4 formalizes Schema 3 specification | Zero tools, endpoints, or CLI scripts exist in `src/` to produce or validate Schema 3 | Disagreement: Purely phantom documentation with no realization in code. |
| **Media Cache Thumbnail Delivery** | `README.md` & `AGENT.md` advertise `/v1/thumbs/:id.webp` as functional thumbnail routes | `src/server/index.ts#L536` issues 302 redirect directly to origin CDN, breaking on Pixiv/Gumroad hotlink protection | Contradiction: Redirects client to 403 hotlink blocks rather than serving in-memory WebP streams. |
| **FTS5 Search Fields in Exported Catalog** | `docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md` §2.1 asserts FTS index includes `category, subcategory, primary_platform` | `src/sync/exporter.ts#L225` indexes only `name, author, description, tags` | Disagreement: FTS5 virtual table definition in exporter omits category and platform columns. |
| **Frontier Re-crawl Reset Scope** | `src/db.ts#L494` docstring asserts `resetFrontierForRecrawl()` "Preserves 'discarded' entries" | `frontier.status` CHECK constraint has no `'discarded'` state; resets blocked and dead-letter queues | Disagreement: Code comment and WHERE clause describe non-existent status, wiping fault-tolerance state. |

---

## 4. Non-Standardized Architecture, Identifiers & Terminology Dislocation

### 4.1 Identifier Confusion: `id` vs `canonical_id` vs `target_package_id` vs `platform_item_id`
- In `canonical_packages`: `id` is the raw entity string (`github:owner/repo`, `booth:12345`), while `canonical_id` is the normalized URL slug (`owner-repo`).
- In `package_fronts`: `id` is `front_<canonical_id>_<platform>_<hash>`, while `platform_item_id` is the numeric item ID or repository path.
- In `user_reports`: the column is named `target_package_id`. While Phase 4 (OVERLOOKED-5) resolved steering queries via `WHERE canonical_id = ? OR id = ?`, the external API payload schema remains ambiguous regarding which identifier clients should submit.

### 4.2 Name vs Title Semantic Inconsistency
- `canonical_packages.name`
- `entities.title`
- `package_fronts.title`
- `curator_overrides.name_override` (Task 1.4 eliminated `title_override`)
- `user_reports.target_package_name`
- `PackageCluster.name`
- `MinimalEntity.title`
- The system continuously oscillates between `name` and `title` without a single unified DTO standard.

### 4.3 Creator Vendor ID vs UTF-8 Display Name
- In BOOTH storefront listings, `author` in `canonical_packages` is often the shop's UTF-8 display name (e.g. `猫屋 (Neko-ya)`).
- However, `cleanVendorId` submitted via bio-token opt-out is the ASCII vendor identifier (e.g. `nekoya`).
- While Phase 4 (OVERLOOKED-3) added regex matching against `package_fronts.url` and `authors_json`, `canonical_packages.author` and `package_fronts.author` continue to store disparate string formats without canonical normalization.

### 4.4 Table Prefix Proliferation
- `package_fronts.id`: `front_<canonical_id>_<platform>_<hash>`
- `media_cache.id`: `media_<timestamp>_<random>`
- `creator_opt_outs.id`: `optout_<timestamp>_<random>`
- `search_patterns.id`: `sp_<timestamp>_<random>`
- `user_reports.report_id`: UUID or string without standardized prefix
- No central utility governs entity identifier generation, causing fragmented ad-hoc ID formatting across modules.

---

## 5. Phased Categorization: Roadmap vs Overlooked

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             DEFECT DISPOSITION TAXONOMY                                 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Category 1: Obvious Unvisited Items (Formalized in Phase 5 & Post-v1.0)                  │
│ Category 2: Newly Triaged Overlooked Deficiencies (OVERLOOKED-11 through OVERLOOKED-19) │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Category 1: Obvious Unvisited Items (Formally Scheduled for Future Phases)

1. **Open-Web VPM Feed Discovery Expansion (Phase 5, Task 5.1)**:
   - *Status*: Scheduled.
   - *Scope*: Broadening VPM repository discovery via ALCOM community listings, GitLab/Codeberg manifests without raw HTML spidering.
2. **VRCArena Bilateral Federation Adapter (Phase 5, Task 5.2)**:
   - *Status*: Scheduled.
   - *Scope*: Querying VRCArena within `robots.txt` limits with toolchain whitelisting.
3. **Avatar Cosmetics Taxonomy Isolation & Mesh Association (Phase 5, Task 5.3)**:
   - *Status*: Scheduled (Hardest).
   - *Scope*: Base avatar mesh tagging (Kikyo, Manuka, Shinano, Selestia) to prevent SimHash collisions with toolchains.
4. **Decentralized Contributor Ingestion via Cloudflare Worker Gateways (Post-v1.0, Task 5.4)**:
   - *Status*: Scheduled Post-v1.0.
   - *Scope*: Protecting Cloudflare administrative tokens while allowing remote indexer submissions via cryptographic gateways.

---

### Category 2: Newly Triaged Overlooked Deficiencies & Blocker Classification

The 9 newly uncovered post-Phase 4 deficiencies are triaged into three actionable priority tiers:

#### Tier 1: Post-Phase 4 High-Priority Deficiencies
1. **[OVERLOOKED-11] Purge Stale WebP Transcoding & Subprocess IPC in `image_proxy.ts` / `sharp_worker.ts`**:
   - Eliminate redundant 480x270 WebP resizing, base64 IPC encoding, and subprocess spawns during crawl ingestion. Retain pure BlurHash, pHash-64, and dimension extraction.
2. **[OVERLOOKED-12] Fix Stale Status Check in `resetFrontierForRecrawl()`**:
   - Replace `WHERE status != 'discarded'` with `WHERE status NOT IN ('blocked', 'dead_letter')` to preserve robots.txt exclusions and dead-letter queue history during manual recrawl triggers.
3. **[OVERLOOKED-13] Expose `projection_epoch` and Total Packages in `GET /v1/catalog/delta`**:
   - Return `projectionEpoch` and `totalCanonicalPackages` in delta stream headers/payloads to enable downstream clients to detect database resets and invalidate stale cursors.
4. **[OVERLOOKED-14] Storefront Bio-Token Opt-Out Probe Redirect Support**:
   - Update `fetchWithPinnedIp` or probe handler to follow up to 3 redirects while re-validating pinned IP constraints on every hop.

#### Tier 2: Protocol & Schema Alignment Deficiencies
5. **[OVERLOOKED-15] Restore SemVer Version Extraction in `GET /v1/vpm/index.json`**:
   - Extract real SemVer strings from `entities.raw_json` or release tags rather than hardcoding `1.0.0`.
6. **[OVERLOOKED-16] Replace `'none'` Sentinel in `canonical_packages.media_id` with SQLite `NULL`**:
   - Standardize `media_id` to `NULL` when no media exists, satisfying `PRAGMA foreign_key_check`.
7. **[OVERLOOKED-17] Include Storefront Fronts Array in `GET /v1/catalog/delta`**:
   - Embed active storefront URLs and platform pricing from `package_fronts` into the delta package object.

#### Tier 3: Edge & Pipeline Optimization
8. **[OVERLOOKED-18] Batch Cloudflare D1 Sync for `package_fronts`**:
   - Group `package_fronts` into batched multi-row SQL INSERT statements in `runEdgeSync` to eliminate serial HTTP roundtrip latency.
9. **[OVERLOOKED-19] Align `user_reports.status` Enum with Quarantine Invariants**:
   - Set `user_reports.status = 'needs_review'` when processing quarantine reports, matching the schema CHECK constraint.

---

## 6. Verification & Phase 4 Sign-Off

- **Phase 4 Milestone**: **100% Verified & Finished**.
  - All Tier 1 Pre-v1.0 Security & Legal Blockers (**OVERLOOKED-1 through OVERLOOKED-5**), Tier 2 Route Invariants (**OVERLOOKED-6 through OVERLOOKED-8**), and Tier 3 Scalability Blockers (**OVERLOOKED-9, OVERLOOKED-10**) are completely resolved and verified.
  - Deterministic testbed verified at **84 passing tests across 17 files (551 assertions)** with zero failures.
- **`LEGAL.md` Assessment**:
  - The 9 targeted legal amendments originally defined in `docs/legal/TARGETED_LEGAL_WORDING_CORRECTIONS.md` are fully integrated into `LEGAL.md` and remain active governing covenants.
  - The amendment draft specification file `docs/legal/TARGETED_LEGAL_WORDING_CORRECTIONS.md` was already purged from git in Phase 3. The remaining records in `docs/legal/decisions/` remain relevant platform evaluation records under RFC 9309.
- **Transition Status**: Phase 4 is formally signed off and closed. Ready for Phase 5.
