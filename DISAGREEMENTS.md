# Architectural, Factual & Systems Disagreements Audit (DISAGREEMENTS.md)

> **Document Status**: Authoritative Discrepancy Registry, Code-Reality Gap Analysis & Technical Contradiction Audit  
> **Target Repository**: `F:\.repo\.main\vrc-package-crawler` (Version 0 Ground-Truth Baseline)  
> **Audit Date**: September 25, 2026  
> **Governing Baseline**: Phase 1–3 Implementation Baseline, `LEGAL.md` Supremacy, `TODO.md` Roadmap (Commit `09e9dc8` Traceability)  
> **Policy Invariant**: Version 0 codebase: deletion is allowed, deprecation is unnecessary.

---

## Executive Summary & Authoritative Verification Chain

A comprehensive architectural and code-reality audit across all specifications (`LEGAL.md`, `TODO.md`, `AGENT.md`, `DELEGATES.md`, `README.md`, `docs/`), codebase implementations (`src/server/`, `src/crawler/`, `src/drivers/`, `src/sync/`, `src/db.ts`), and test suites reveals critical technical contradictions, non-standardized identifiers, fragile edge behaviors, and factual discrepancies where differing documents or subsystem boundaries claim conflicting truths.

### The Authoritative Verification Chain
To eliminate mock-reality drift, false-positive compliances, and premature production assertions, the repository establishes a strict **Verification Chain**:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                            THE VERIFICATION CHAIN OF TRUTH                                       │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ LEGAL.md ──► TODO.md ──► Implementation ──► Deterministic Tests ──► DISAGREEMENTS.md ──► Resolve/Defer ──► Prod │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Clarification of "Phase 3 Complete"**:  
> In light of this audit, **"Phase 3 Complete" MUST NOT be interpreted as: "The repository is now technically compliant with the legal architecture."**  
> Instead, it signifies: **"Phase 3 implementation was completed and a comprehensive adversarial audit was executed, which successfully uncovered concrete implementation failures, architectural contradictions, and critical edge cases that prevent treating the legal/technical model as verified."**  
> `DISAGREEMENTS.md` is an active gating artifact in the verification chain. Blockers documented herein must be resolved or formally triaged before calling the system production-ready.

This document formally records:
1. **Critical Breaking Points & Edging Behaviors** (Vulnerabilities, silent delisting omissions, and TOCTOU races).
2. **Subsystem Disagreements & Document Contradictions** (Where one document or module directly conflicts with another).
3. **Non-Standardized Architecture, Identifiers & Terminology Dislocation** (Mixed-up identifiers, column semantic misalignments).
4. **Triaged Phased Roadmap**:
   - **Tier 1**: Pre-v1.0 Security & Legal Blockers (Items 1–5: delisting tombstones, DNS rebinding, opt-out matching, export referential integrity, identifier resolution).
   - **Tier 2**: Documentation & Route Invariant Blockers (Items 6–8: endpoint aliasing, single-node perimeter, terms header docs).
   - **Tier 3**: Completeness & Pipeline Scalability (Items 9–10: conditional request coverage, D1 storefront sync).

---

## 1. Critical Breaking Points & Fragile Edge Behaviors

### 1.1 Delta Stream Delisting Amnesia on Full Projection Rebuilds (CRITICAL)
- **Subsystem**: `src/crawler/projection.ts` vs `src/server/index.ts` (`GET /v1/catalog/delta`)
- **The Edging Failure**:
  1. When a creator delists or opts out via `POST /v1/opt-out`, `db.delistCreatorPackages()` sets `canonical_packages.lifecycle = 'delisted'`. If a downstream client queries `GET /v1/catalog/delta`, it receives `{ action: "DELISTED", canonicalId: ... }`.
  2. Every 15 minutes, `runProjection()` executes a full table wipe: `DELETE FROM canonical_packages;`.
  3. During cluster re-projection (`projection.ts#L743`):
     ```typescript
     if (sharedDb.isCreatorOptedOut(c.author)) {
       continue; // The opted-out cluster is skipped entirely!
     }
     ```
  4. Because the cluster is skipped with `continue`, it is **NEVER inserted into `canonical_packages`** with `lifecycle = 'delisted'`. The row simply vanishes from the database.
  5. Subsequent downstream delta polls (`GET /v1/catalog/delta`) query `SELECT rowid, * FROM canonical_packages WHERE rowid > ?`. Because the row was completely dropped rather than retained with `lifecycle = 'delisted'`, the server **NEVER emits a `DELISTED` action** for clients that missed the brief 15-minute window!
- **Consequence**: Downstream client desktop caches retain the delisted package indefinitely, directly breaching the creator takedown covenants in `LEGAL.md` §9.5.

### 1.2 DNS Rebinding & TOCTOU Socket Risk in Verification Probes & Streaming Proxy (CRITICAL)
- **Subsystem**: `src/server/index.ts` (`POST /v1/opt-out` & `GET /v1/media/stream`)
- **The Edging Failure**:
  - The anti-SSRF defense uses a classic Time-of-Check to Time-of-Use (TOCTOU) pattern:
    ```typescript
    const lookup = await dns.lookup(parsedUrl.hostname);
    if (isPrivateOrReservedIp(lookup.address)) { return 400; }
    // Separate fetch issues an independent second DNS resolution:
    const resp = await fetch(parsedUrl.href, ...);
    ```
  - An adversary can configure a custom domain with a TTL of 0 seconds returning a benign public IP on the first query, followed by `127.0.0.1`, `169.254.169.254` (cloud metadata service), or internal network IPs on the subsequent `fetch()` query.
- **Consequence**: Full bypass of SSRF protections on `POST /v1/opt-out` and `GET /v1/media/stream`. The HTTP client connects directly to private intranet infrastructure without IP pinning.

### 1.3 `delistCreatorPackages` URL Pattern Omissions (BOOTH & Jinxxy Mismatches)
- **Subsystem**: `src/db.ts` (`delistCreatorPackages#L551-L585`)
- **The Edging Failure**:
  - The query in `delistCreatorPackages` attempts to delist matching packages by author and storefront URLs:
    ```sql
    OR LOWER(url) LIKE ('https://' || ? || '.booth.pm/%') ESCAPE '\'
    OR LOWER(url) LIKE ('https://' || ? || '.gumroad.com/%') ESCAPE '\'
    OR LOWER(url) LIKE ('https://github.com/' || ? || '/%') ESCAPE '\'
    OR LOWER(url) LIKE ('https://' || ? || '.itch.io/%') ESCAPE '\'
    ```
  - **Fatal Defect A (Jinxxy Missing)**: Jinxxy storefront URLs (`https://jinxxy.com/<creator>/...`) are **completely absent** from the query! Jinxxy creators opting out cannot have their packages matched via URL.
  - **Fatal Defect B (BOOTH Item URLs Never Match)**: On BOOTH, items are indexed as `https://booth.pm/ja/items/12345` or `https://booth.pm/en/items/12345`. They **never** match `https://<creator>.booth.pm/%` unless the creator uses a custom shop subdomain.
  - **Fatal Defect C (Display Name vs Vendor ID)**: On BOOTH, `author` in `canonical_packages` is the shop's UTF-8 display name (e.g. `猫屋 (Neko-ya)`). But `cleanVendorId` submitted via bio-token opt-out is the ASCII vendor identifier (e.g. `nekoya`). `LOWER(author) = ?` fails, and `url LIKE 'https://nekoya.booth.pm/%'` fails against `booth.pm/ja/items/12345`.
- **Consequence**: Opt-out succeeds on the API layer (`200 OK`, `packagesDelisted: 0`), but matching packages remain published in the catalog.

### 1.4 Exported Database Dangling Foreign Keys & Empty `media_cache`
- **Subsystem**: `src/sync/exporter.ts` (`exportCatalog`)
- **The Edging Failure**:
  - `src/sync/exporter.ts` creates table `media_cache` in `vrc_catalog.db`:
    ```sql
    CREATE TABLE media_cache (id TEXT PRIMARY KEY, source_url TEXT NOT NULL UNIQUE, ...);
    ```
  - It copies `canonical_packages` and `package_fronts`.
  - **It NEVER copies any rows into `media_cache`!** The table is left with exactly 0 rows.
  - Meanwhile, `canonical_packages.media_id` points to IDs in `media_cache`.
- **Consequence**: Offline SQLite consumers and Tauri desktop applications attempting to perform joins on `media_id = media_cache.id` receive null rows or broken referential integrity.

### 1.5 Cloudflare D1 Synchronization Drops `package_fronts` Completely
- **Subsystem**: `src/sync/index.ts` (`runEdgeSync`)
- **The Edging Failure**:
  - `src/sync/index.ts` queries and pushes **only** `canonical_packages` to Cloudflare D1.
  - Table `package_fronts` (which holds all per-storefront mappings across BOOTH, Gumroad, Jinxxy, Itch, GitHub) is **completely ignored and never synchronized** to Cloudflare D1.
- **Consequence**: Cloudflare edge workers, D1 replicas, and downstream edge APIs have zero visibility into multi-platform storefront URLs, pricing tiers, or platform-specific metadata.

---

## 2. Subsystem Disagreements & Document Contradictions

| Topic | Party A Claim | Party B Claim | Reality / Codebase Truth |
| :--- | :--- | :--- | :--- |
| **API Stream Endpoint** | `LEGAL.md` §2.2(b) & `GET /` advertise `/v1/packages/stream` | `README.md` & `src/server/index.ts#L651` implement `/v1/catalog/delta` | Disagreement: Requesting `/v1/packages/stream` yields `404 Not Found`. Endpoint name is completely dislocated. |
| **Telemetry Ingestion Route** | `GET /` & `TODO.md` Task 1.1 advertise `POST /v1/telemetry` | `src/server/index.ts` has **zero** route handler for `/v1/telemetry` | Disagreement: Calling `POST /v1/telemetry` yields `404 Not Found`. Schema 5 has no server receiver. |
| **Multi-Node Edge Ingestion** | `docs/EDGE_SYNC_AND_SCALE_GUIDE.md` §6 mandates Multi-Node Scaling Path (Node A + Node B syncing directly to D1) | `LEGAL.md` §1.4 & `TODO.md` CANON-6 explicitly forbid multi-node D1 sync in v1.0, deferring to Post-v1.0 Worker Gateways | Contradiction: Scale guide instructs operators to run multi-node setups that `LEGAL.md` and security audits explicitly ban due to Cloudflare API token exposure. |
| **Conditional Request Coverage** | `docs/DISCOVERY_RULES.md` §2 asserts "All crawler drivers (BOOTH, GitHub, etc.) maintain stateful freshness metadata... and inject HTTP conditional request headers" | `src/drivers/gumroad.ts`, `jinxxy.ts`, `itch.ts`, `vpm.ts` contain zero ETag or `If-None-Match` logic | Disagreement: Only `BoothDriver` and `GitHubDriver` implement Task 3.3. Storefronts Gumroad, Jinxxy, and Itch still perform full redundant downloads. |
| **Downstream Header Specification** | `TODO.md` Task 1.2 claims `docs/REPORTING_SCHEMAS.md` Section 1 documents `VRC-Packages-Terms-Of-Use` across Schemas 1, 2, 5 | `docs/REPORTING_SCHEMAS.md` Section 1 is purely "Schema Selection Matrix" with zero header documentation | Disagreement: The cascading documentation update was never applied to Section 1 of `REPORTING_SCHEMAS.md`. |
| **Lifecycle State Enum for Opt-Out** | `src/db.ts` defines enum `'creator_opted_out'`; `LEGAL.md` §9.5 mentions `lifecycle = 'creator_opted_out' (or 'delisted')` | `src/db.ts` line 559 (`delistCreatorPackages`) hardcodes `SET lifecycle = 'delisted'` | Disagreement: If any code sets `'creator_opted_out'`, `exporter.ts` (which only filters `'delisted', 'dmca_removed'`) will accidentally export it! |
| **Project Dependency Audit (Schema 3)** | `docs/REPORTING_SCHEMAS.md` Section 4 formalizes Schema 3 specification | Zero tools, endpoints, or CLI scripts exist in `src/` to produce or validate Schema 3 | Disagreement: Purely phantom documentation with no realization in code. |

---

## 3. Non-Standardized Architecture & Terminology Dislocation

### 3.1 Parameter & Column Misalignment in `creator_opt_outs`
- **Method Signature (`src/db.ts#L536`)**:
  ```typescript
  public registerOptOut(creatorName: string, platform: string, pattern: string, reason: string): boolean
  ```
- **Caller Invocations (`src/server/index.ts#L637`)**:
  ```typescript
  targetDb.registerOptOut(cleanVendorId, proofType, escapedVendorRegex, `Automated creator opt-out verified via ${proofType}`);
  ```
- **Dislocation**: `proofType` (`"dns_txt" | "storefront_bio_token" | "signed_commit"`) is passed into the `platform` column of table `creator_opt_outs`! The table column is named `platform`, but stores cryptographic/verification proof types rather than `"booth"`, `"gumroad"`, or `"jinxxy"`.

### 3.2 Identifier Confusion: `id` vs `canonical_id` vs `target_package_id`
- In `canonical_packages`, `id` is the raw entity string (e.g. `github:owner/repo`), while `canonical_id` is the normalized URL slug (e.g. `owner-repo`).
- In `user_reports`, the column is named `target_package_id`.
- In `src/crawler/steering.ts#L70,L140`, queries execute:
  ```sql
  WHERE canonical_id = ? -- passing report.target_package_id
  ```
- If an API client submits a Schema 4 report using the package's primary `id` (`github:owner/repo`), steering SQL queries silently match 0 rows.

### 3.3 Name vs Title Semantic Inconsistency
- In `canonical_packages`: `name`
- In `entities`: `title`
- In `package_fronts`: `title`
- In `curator_overrides`: `name_override` (Task 1.4 eliminated `title_override`)
- In `user_reports`: `target_package_name`
- In `PackageCluster`: `name`
- In `MinimalEntity`: `title`
- The system continuously shuttles between `name` and `title` without a single unified DTO standard.

---

## 4. Phased Categorization: Roadmap vs Overlooked

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             DEFECT DISPOSITION TAXONOMY                                 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Category 1: Obvious Unvisited Items (Formalized in Future Phases 4, 5, Post-v1.0)        │
│ Category 2: Overlooked Critical Deficiencies (Missing from all existing roadmaps)        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Category 1: Obvious Unvisited Items (Formally Scheduled for Future Phases)

1. **Database Schema Deduplication & In-Place Migration Deprecation (Phase 4, Task 4.1)**:
   - *Status*: Scheduled.
   - *Scope*: Removing legacy redundant URL columns, dropping in-place 357 MB database migrations, establishing ground-canonical DTO models.
2. **Stateless Air-Gap Separation & Telemetry Seeding (Phase 4, Tasks 4.2 & 4.3)**:
   - *Status*: Scheduled.
   - *Scope*: Enforcing no user accounts on crawler backend, building proper Schema 5 telemetry ingestion endpoint (`POST /v1/telemetry`), documenting internal schemas.
3. **Open-Web VPM Feed Discovery Expansion (Phase 5, Task 5.1)**:
   - *Status*: Scheduled.
   - *Scope*: Broadening VPM repository discovery via ALCOM community listings, GitLab/Codeberg manifests without raw HTML spidering.
4. **VRCArena Polite Federation / API Integration (Phase 5, Task 5.2)**:
   - *Status*: Scheduled.
   - *Scope*: Querying VRCArena within `robots.txt` limits with toolchain whitelisting.
5. **Avatar Cosmetics Taxonomy Isolation & Mesh Association (Phase 5, Task 5.3)**:
   - *Status*: Scheduled (Hardest).
   - *Scope*: Base avatar mesh tagging (Kikyo, Manuka, Shinano, Selestia) to prevent SimHash collisions with toolchains.
6. **Decentralized Contributor Ingestion via Cloudflare Worker Gateways (Post-v1.0, Task 5.4)**:
   - *Status*: Scheduled Post-v1.0.
   - *Scope*: Protecting Cloudflare administrative tokens while allowing remote indexer submissions via cryptographic gateways.

---

### Category 2: Triaged Deficiencies & Blocker Classification

The 10 overlooked deficiencies are triaged into three actionable priority tiers. **Tier 1 blockers must NOT be deferred behind generic Phase 4 backlog tasks; they represent active legal, security, and integrity failures.**

#### Tier 1: Pre-v1.0 Security & Legal Blockers (Must Resolve Before Production Exposure)

1. **[OVERLOOKED-1] [LEGAL CONTROL: IMPLEMENTATION FAILURE] Delta Feed Delisting Amnesia Across Projection Wipes**:
   - *Classification*: Direct Legal Breach (`LEGAL.md` §9.5 Takedown Guarantee).
   - *Problem*: Full projection rebuild deletes all canonical packages and skips opted-out creators with `continue`, completely preventing `GET /v1/catalog/delta` from emitting `action: "DELISTED"`. Downstream desktop client caches retain delisted packages indefinitely.
   - *Remediation*: Implement permanent delisting tombstones in projection synthesis so delta streams reliably emit `action: "DELISTED"`.
2. **[OVERLOOKED-2] [SECURITY BLOCKER: TOCTOU DNS REBINDING] SSRF Bypass on Opt-Out & Media Proxy**:
   - *Classification*: Critical Security Vulnerability before Production Exposure.
   - *Problem*: Independent DNS resolution between `dns.lookup` and `fetch()` creates a Time-of-Check to Time-of-Use race, allowing 0-second TTL DNS rebinding against `127.0.0.1` and `169.254.169.254`.
   - *Remediation*: Pin HTTP socket connections directly to the resolved and verified IP address, or use an agent dispatcher with IP-level enforcement.
3. **[OVERLOOKED-3] [COMPLIANCE BLOCKER: FALSE DELISTING CONFIRMATION] Silent Delisting Failure**:
   - *Classification*: False Compliance Signal.
   - *Problem*: `POST /v1/opt-out` returns `200 OK` (successful verification) while delisting exactly 0 packages because `jinxxy.com` is omitted from SQL queries, standard BOOTH URLs (`booth.pm/ja/items/12345`) do not match `*.booth.pm`, and vendor IDs do not match UTF-8 shop display names.
   - *Remediation*: Query `package_fronts` and match storefront URLs by platform item ID and platform URL prefixes.
4. **[OVERLOOKED-4] [EXPORT INTEGRITY: DANGLING MEDIA REFERENCES] Empty `media_cache` in Exported Database**:
   - *Classification*: Referential Integrity & Clean Architecture.
   - *Problem*: `src/sync/exporter.ts` creates table `media_cache` in `vrc_catalog.db` but inserts zero rows, creating dangling `canonical_packages.media_id` references for offline clients.
   - *Remediation*: Complete the pure media pointer migration cleanly: remove the vestigial `media_cache` table from exports and rely exclusively on `media_urls_json` arrays, or populate metadata records without BLOBs.
5. **[OVERLOOKED-5] [MODERATION BLOCKER: IDENTIFIER MISMATCH] Reporting Identifier Dislocation**:
   - *Classification*: Moderation & Curation Control Failure.
   - *Problem*: `canonical_packages.id` (raw entity string e.g. `github:owner/repo`) differs from `canonical_packages.canonical_id` (slug `owner-repo`). Schema 4 reports provide `target_package_id`, but `src/crawler/steering.ts` queries `WHERE canonical_id = ?`, causing reports using primary IDs to silently match 0 rows.
   - *Remediation*: Update steering queries to match against `WHERE canonical_id = ? OR id = ?`.

#### Tier 2: Documentation & Route Invariant Blockers (Contractual Alignment)

6. **[OVERLOOKED-6] Missing Route `/v1/packages/stream` vs `/v1/catalog/delta`**:
   - *Problem*: `GET /` and `LEGAL.md` advertise `/v1/packages/stream`, but the server only implements `/v1/catalog/delta`.
   - *Remediation*: Provide route aliasing in `src/server/index.ts` so `/v1/packages/stream` routes cleanly to `/v1/catalog/delta`.
7. **[OVERLOOKED-7] Multi-Node Scale Guide vs Single-Node Perimeter**:
   - *Problem*: Scale guide previously instructed multi-node D1 pushing, conflicting with `LEGAL.md` §1.4.
   - *Status*: Aligned in documentation; D1 DDL updated to include `package_fronts` and `catalog_metadata`.
8. **[OVERLOOKED-8] Terms Header Invariants & `catalog_metadata` Documentation**:
   - *Problem*: Promised header invariants across Schemas 1, 2, 5 were missing from `REPORTING_SCHEMAS.md`.
   - *Status*: Aligned in documentation (`REPORTING_SCHEMAS.md` Section 1 updated).

#### Tier 3: Completeness & Pipeline Scalability (Phase 4 Engineering)

9. **[OVERLOOKED-9] Gumroad, Jinxxy, Itch Drivers Missing Conditional Request Headers**:
   - *Problem*: Task 3.3 wired only BOOTH and GitHub; remaining storefronts waste bandwidth on full redownloads.
   - *Remediation*: Wire ETag and `If-Modified-Since` into `GumroadDriver`, `JinxxyDriver`, and `ItchDriver`.
10. **[OVERLOOKED-10] Complete Omission of `package_fronts` in Cloudflare Edge Sync**:
    - *Problem*: `vrc-sync.exe` pushes only `canonical_packages`, leaving D1 with zero storefront records.
    - *Remediation*: Synchronize `package_fronts` deltas alongside `canonical_packages` to Cloudflare D1.

---

## 5. Verification & Audit Sign-Off

- **Verification Status**: Complete.
- **Artifact Generated**: `DISAGREEMENTS.md` (Root Workspace).
- **Phase 3 Milestone**: Verified & Marked Complete (Phase 3 implementation completed; adversarial audit executed).
- **Phase 4 Integration**: Tier 1 blockers (Items 1–5) formally prioritized as critical prerequisites in Phase 4 of `TODO.md`. Ready for Phase 4 execution.
