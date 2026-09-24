# Engineering Roadmap, Compliance Audit & Phased Implementation Plan (TODO.md)

> **Document Status**: Authoritative Engineering Roadmap, Compliance Audit & Systems Specification  
> **Target Repository**: `F:\.repo\.main\vrc-package-crawler`  
> **Precedence Invariant**: **`LEGAL.md` takes absolute precedence**. This document is semi-behind `LEGAL.md`. Technical documentation (`docs/`, `AGENT.md`, `DELEGATES.md`, `README.md`) and codebase implementations (`src/`, `tests/`) come last.  
> **Canonical TODO Baseline**: Commit `09e9dc8` (6 canonical foundation items)  
> **Ground Truth Test Suite**: **Decoupled / Clean-Slate Baseline** (All 12 legacy test files in `tests/` deleted by operator to eliminate false-positive test results, mock-reality drift, and codebase dislocation against stale databases; Task 2.6 establishes a deterministic, in-memory isolated testbed).  
> **Integrity Mandate**: Strictly **ZERO context loss** across canonical tasks, platform ToS contractual analyses, judicial precedents, PRISMA-ScR systematic review audits, code-reality gap analyses, and adversarial calibration matrices.

---

## 1. Architectural Precedence & Canonical Baseline

### 1.1 The Precedence Hierarchy of Truth
In all architectural decisions, bug remediations, and roadmap specifications, the following order of authority controls:
1. **[LEGAL.md](LEGAL.md)**: Absolute authority. Establishes legal boundaries, Three Legal Layers (A: AGPLv3 Code, B: Project Compilations, C: Third-Party Origin Data), unauthenticated guest status, RFC 9309 robots.txt signals, direct origin media pointers, 256-character functional summaries, anti-AI covenants, and Philippine substantive jurisdiction.
2. **[TODO.md](TODO.md) (This Document)**: Semi-behind `LEGAL.md`. Compacts all actionable engineering tasks, defect remediations, and feature roadmap items aligned strictly to `LEGAL.md` guardrails.
3. **Operational Documentation (`docs/`, `AGENT.md`, `DELEGATES.md`, `README.md`)**: Subservient to `TODO.md` and `LEGAL.md`. Must cascade updates whenever tasks change systems invariants.
4. **Codebase Implementation (`src/`, `tests/`)**: Physical realization. Must be brought into full alignment with the higher layers.

### 1.2 Canonical Foundation Items (Commit `09e9dc8`) Traceability
The 6 canonical tasks introduced in commit `09e9dc8` define the core ecosystem questions. Each has been evaluated against `LEGAL.md` and synthesized into the roadmap:

| Canonical ID | Original Specification (`09e9dc8`) | `LEGAL.md` Guardrail & Verdict | Phased Task Mapping |
| :--- | :--- | :--- | :--- |
| **CANON-1** | `[INFO] discover_vpm.ts might need to expand its search outside github, on a general world wide web discovery` | **Guardrail**: §11.3 forbids open-web unindexed spiders. Expansion must strictly use federated registry seeds, community manifests (ALCOM), and verified creator documentation. Aggregator front adapters deferred to Post-v1.0 research. | **Task 5.1** (Phase 5, Very High) |
| **CANON-2** | `[ENHANCEMENT] reconsider avatar cosmetic items discovery other than tool chains and such` | **Guardrail**: §11.4 mandates cosmetics isolation into a separate taxonomy tier with base avatar associations (Kikyo, Manuka, Shinano, Selestia) to prevent SimHash false merges against toolchains. | **Task 5.3** (Phase 5, Very High / Hardest) |
| **CANON-3** | `[QUESTION] Should VRCArena be added into the pool of discoveries and other platforms?` | **Guardrail**: §5.2(f) strictly rejects automated HTML DOM scraping. Permits only bilateral API federation or polite querying within robots.txt limits with toolchain whitelisting. | **Task 5.2** (Phase 5, Very High) |
| **CANON-4** | `[MAINTAINABILITY] Column deduplication might be needed, or a proper database tables and columns need to be written` | **Guardrail**: §2.3 & §10.7 require clean provenance and export metadata. Eliminates redundant URLs, coalesces overrides, adds `catalog_metadata`. Elevates to Critical High-Priority Architectural Anchor; existing DBs in `dist/` marked stale and live migrations dropped. | **Task 4.1** (Phase 4, Critical / High Priority) |
| **CANON-5** | `[SUGGESTION] A new documentation for API endpoints and internal reporting schemas and such is needed [Seeding]` | **Guardrail**: §8.5 & §10.6 permit Schema 5 interaction telemetry only with zero PII, anonymous aggregation, and no user session tracking. | **Task 4.3** (Phase 4, High) |
| **CANON-6** | `[QUESTION] Should external interfacing platforms handle user accounts, authentication, and recommendation engines?` | **Guardrail**: §8.5, §9.8, §10.5 mandate strict air-gapped separation. The crawler backend MUST remain stateless and unauthenticated; accounts belong downstream. Multi-node contributor features deferred to Post-v1.0. | **Task 4.2** (Phase 4, High) & **Task 5.4** (Post-v1.0 Milestone) |

### 1.3 User Clarification Record & Guardrail Enforcement
Per task instructions, clarifying multiple-choice questions regarding user implementation desires were presented and decided. Under the authoritative rule of `LEGAL.md`:
- **Default Resolution Policy**: In the absence of an explicit user override, all guardrails established by `LEGAL.md` are upheld as binding engineering constraints.
- **Explicit User Decisions & Architectural Calibrations**:
  1. **CANON-1 (VPM Package Discovery Expansion)**:
     - *User Decision*: Retain Option 1: Expand discovery via federated registries and community manifests (e.g., ALCOM community repository listings, GitLab/Codeberg verified indices) under `LEGAL.md` §11.3 guardrails.
     - *Scoping & Deferral*: Community directory aggregator front adapters (such as `vpm-catalog.vercel.app` or secondary aggregator scrapers) are explicitly deferred to a Post-v1.0 research milestone; Phase 5 focuses solely on raw repository manifests (`index.json`, `vpm-manifest.json`).
     - *Legal Guardrail*: `LEGAL.md` §11.3 strictly prohibits open-web unindexed spiders. Direct manifest ingestion guarantees provenance and respects publisher boundaries.
  2. **CANON-2 (Avatar Cosmetics Taxonomy Isolation)**:
     - *User Decision*: Retain Option 1: Implement an isolated cosmetics taxonomy tier with base-avatar tagging (e.g., Kikyo, Manuka, Shinano, Selestia) to prevent SimHash collisions with toolchains per `LEGAL.md` §11.4.
     - *Rationale*: High-volume avatar apparel and hair listings share generic vocabulary ("PhysBones", "PB", "Modular Avatar"), causing severe SimHash-64 ($k \le 3$) false merges against developer toolchains. Tagging with base avatar mesh guarantees taxonomic separation.
     - *Legal Guardrail*: `LEGAL.md` §11.4 mandates strict isolation; apparel and hair never mingle directly with developer toolchains, and downstream tools must preserve this separation.
  3. **CANON-3 (VRCArena Integration)**:
     - *User Decision*: Retain Option 1: Query VRCArena within `robots.txt` limits, strictly avoiding automated HTML DOM scraping, applying developer toolchain whitelisting per `LEGAL.md` §5.2(f).
     - *Rationale*: Static dataset import is currently out of reach; polite querying/API within `robots.txt` boundaries is authorized, strictly filtered to developer toolchains, shaders, and scripts.
     - *Legal Guardrail*: `LEGAL.md` §5.2(f) strictly rejects automated HTML DOM scraping of volunteer community platforms; non-toolchain assets (unverified avatar re-textures) are filtered out at the adapter layer.
  4. **CANON-6 & Decentralized Indexer Network (Architecture & Governance)**:
     - *User Decision*: Retain Option 1: Maintain a strictly air-gapped, stateless crawler backend; user accounts, authentication, private lists, and bookmarks belong exclusively in downstream client applications per `LEGAL.md` §8.5, §9.8, and §10.5.
     - *Decentralized Contributor Nodes & Cloudflare Security*: Postpone decentralized node contributor features entirely to a dedicated Post-v1.0 milestone. Keep the crawler strictly single-node/maintainer-operated for v1.0.
     - *Security Rationale*: Direct edge sync in v1.0 requires Cloudflare administrative credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), which cannot be safely distributed to untrusted third-party contributor nodes without severe data tampering, database wiping, and token leakage risks. A future Cloudflare Worker Ingestion Gateway architecture must be developed first.
     - *Roadmap Mapping*: Canonical Task 6 architectural boundaries are finalized in Task 4.2; multi-node network ingestion and provenance columns are moved to a dedicated Post-v1.0 Milestone.
  5. **Task 3.2 (Media Delivery Architecture)**:
     - *User Decision*: Retain Option 1 (Hybrid Delivery Architecture): API returns direct origin CDN URLs by default (*Perfect 10* Server Test), but provides an ephemeral in-memory streaming proxy endpoint (`GET /v1/media/stream?url=...`) for clients to bypass storefront hotlink/Referer blocks without storing BLOBs on disk.
     - *Rationale & Legal Caveats*: Directly addresses G-1 hotlink/403 blocks while purging SQLite WebP BLOB storage (CR-19, CR-21, G-29). Emphasizes *Kelly v. Arriba Soft* transformative indexing, emits private client caching headers, and documents ongoing legal consultation caveats regarding the circuit split (*Goldman v. Breitbart*, *Nicklen*).
  6. **Task 3.1 (Creator Opt-Out for Non-Domain Creators)**:
     - *User Decision*: Retain Option 1 (Ephemeral Storefront Bio Token Verification): Creators without custom domains (e.g. BOOTH, Gumroad, Jinxxy shop owners) can temporarily place a verification token (e.g., `#vrc-opt-out-<vendorId>`) in their public store profile bio/description, verified once on-demand via a single unauthenticated fetch without a full crawl.
     - *Rationale & Legal Caveats*: Resolves G-5 by providing a practical delisting avenue for indie creators without domain registrar access, while strictly adhering to unauthenticated guidelines (single point-in-time fetch, immediate payload discard, zero systematic scraping) under `LEGAL.md` §9.4-9.5.
  7. **Canonical Task 4 High Priority & Dist Stale DB Policy**:
     - *Operator Determination*: All pre-existing database files in `dist/` (`dist/crawler_state.db` [357 MB], `dist/vrc_catalog.db`, etc.) are formally designated **STALE / LEGACY PROJECTIONS**.
     - *Migration Strategy*: In-place live migrations of legacy 357 MB databases are postponed and dropped; no fragile column-by-column migration scripts against the stale 357 MB file will be maintained. A clean, deduplicated ground-canonical schema is established in code (`src/db.ts`) as Ground Truth, and fresh databases will be synthesized cleanly from raw `entities` event logs or fresh crawler seeding (elevated to Task 4.1).
  8. **Downstream Terms Notice Header Standard (`VRC-Packages-Terms-Of-Use`)**:
     - *Header Standard*: Per IETF RFC 6648 (deprecating the `X-` prefix for custom application protocols in June 2012), the notice header uses the un-prefixed standard `VRC-Packages-Terms-Of-Use` (with `VRC-Packages-Terms-Version`, `VRC-Packages-Repository`, `VRC-Packages-License`, and RFC 8288 `Link: <.../LEGAL.md>; rel="terms-of-service"`), avoiding deprecated prefixes while establishing enforceable notice under *Register.com v. Verio*.
  9. **Testbed Decoupling & Ground Zero Rebuilding (Task 2.6)**:
     - *Operator Action*: All 12 legacy test files in `tests/` were deliberately deleted by the operator to eliminate false-positive test assertions and code dislocation against obsolete database structures. A new deterministic testbed isolated strictly to `:memory:` and ephemeral fixtures will be established under Task 2.6.

---

## 2. Phased Implementation Roadmap (Sorted Easiest to Hardest)

Tasks are grouped into five logical phases and strictly sorted within each phase and across the roadmap from **lowest implementation effort/complexity** to **highest**. Every task specifies the exact files, lines, concrete remediation logic, acceptance criteria, and cascading documentation changes.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                           PHASED IMPLEMENTATION COMPLEXITY GRADIENT                      │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Phase 1: Quick Invariant & Configuration Fixes (Easiest: Configuration, headers, bounds) │
│ Phase 2: Security Hardening & Defect Remediation (Medium: CLI guards, auth, retry/queues)│
│ Phase 3: Legal Compliance & Pure Media Pointer Migration (Med-High: Hybrid proxy, opt-out)│
│ Phase 4: Schema Normalization & Pipeline Scalability (High: Air-gap, dedup, DSU scale)   │
│ Phase 5: Canonical Ecosystem Expansion & Governance (Hardest: VPM feeds, VRCArena, mesh) │
│ Post-v1.0 Milestone: Decentralized Edge Node Ingestion & Provenance Architecture        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Quick Invariant & Configuration Fixes (Easiest) — [100% VERIFIED & COMPLETED]

#### Task 1.1: Declare `API_SECRET_TOKEN` in `.env.example` and Purge `CRAWLER_API_TOKEN` [COMPLETED]
- **Priority**: Critical Security Config | **Complexity**: Very Low (5 mins) | **Traceability**: CR-2, CR-19, G-19, LEGAL §10.6 | **Status**: Verified & Completed
- **Files**: [`.env.example`](.env.example), [`src/server/index.ts`](src/server/index.ts#L130)
- **Functional Scope & Variable Purpose**:
  - `API_SECRET_TOKEN` is the master administrative bearer authentication token (`Authorization: Bearer <API_SECRET_TOKEN>`) guarding mutating and administrative endpoints on `vrc-server.exe`.
  - Specifically protects:
    1. `POST /v1/reports` (quarantined curation reports and lifecycle transitions; prevents unauthorized delisting/tampering).
    2. `POST /v1/telemetry` (administrative batch telemetry ingestion).
    3. Curation override mutations and lifecycle commands dispatched via `vrc-monitor.exe` IPC.
  - If `API_SECRET_TOKEN` is unset or invalid, administrative mutation requests must fail with `401 Unauthorized` rather than executing without oversight.
- **Problem**: `AGENT.md` documented `CRAWLER_API_TOKEN`, but server reads `process.env.API_SECRET_TOKEN`. Neither was declared in `.env.example`.
- **Remediation**:
  1. Declare `API_SECRET_TOKEN=change_me_to_a_secure_token` in `.env.example` with clear comments explaining its administrative role.
  2. Ensure consistent reading in `src/server/index.ts`:
     ```typescript
     const apiToken = process.env.API_SECRET_TOKEN || process.env.CRAWLER_API_TOKEN;
     ```
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`AGENT.md`](AGENT.md): Section 1 ("Environment Variables & Configuration", Line 310) — replace `CRAWLER_API_TOKEN` with `API_SECRET_TOKEN` and define bearer authentication invariants.
  - [`DELEGATES.md`](DELEGATES.md): Section 4 ("Environment & Secret Configuration Template") — add `API_SECRET_TOKEN` to the deployment `.env` template and Section 7 ("Administrative Verification Runbook").
  - [`docs/OPERATIONS_AND_CHECKLIST.md`](docs/OPERATIONS_AND_CHECKLIST.md): Section 1 ("Pre-Flight Operational Checklist") & Section 2 ("Administrative API Verification") — update curl examples to supply `Authorization: Bearer <API_SECRET_TOKEN>`.
  - [`docs/REPORTING_SCHEMAS.md`](docs/REPORTING_SCHEMAS.md): Section 5 ("Security, Bearer Authentication & Administrative Access") — document bearer token header requirements.
- **Acceptance Criteria**: Running `grep -rn "CRAWLER_API_TOKEN" .` yields zero unexplained matches; `.env.example` contains `API_SECRET_TOKEN` with administrative security comments. *(Verified: test passes in `tests/phase1_server_headers.test.ts`)*.

#### Task 1.2: Inject Downstream Terms Notice Header (`VRC-Packages-Terms-Of-Use`) & Export Metadata [COMPLETED]
- **Priority**: Legal Invariant | **Complexity**: Low (15 mins) | **Traceability**: CR-14, CR-22, G-21, LEGAL §10.1, §10.7 | **Status**: Verified & Completed
- **Files**: [`src/server/index.ts`](src/server/index.ts#L135-L160), [`src/sync/exporter.ts`](src/sync/exporter.ts)
- **Header Standards & Naming Rationale**:
  - Per **IETF RFC 6648** ("Deprecating the 'X-' Prefix and Similar Constructs in Application Protocols"), the `X-` prefix was formally deprecated for custom application protocols in June 2012 to avoid technical debt and migration churn when headers become standardized.
  - Accordingly, the header standard uses the clean, un-prefixed project domain identifier `VRC-Packages-Terms-Of-Use` (and RFC 8288 standard web linking).
- **Problem**: API callers receive feeds without legal notice of `LEGAL.md` Section 10 covenants; SQLite exports lack terms metadata.
- **Remediation**:
  1. Add middleware in `src/server/index.ts` injecting concrete, non-placeholder headers on all HTTP responses:
     ```typescript
     res.setHeader("VRC-Packages-Terms-Of-Use", "https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md");
     res.setHeader("VRC-Packages-Terms-Version", "1.1");
     res.setHeader("VRC-Packages-Repository", "https://github.com/SlamTheDragon/vrc-package-crawler");
     res.setHeader("VRC-Packages-License", "Layer-A: AGPL-3.0 / Layer-B: Database Compilation Terms / Layer-C: Third-Party Origin Rights");
     res.setHeader("Link", '<https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md>; rel="terms-of-service"');
     ```
  2. In `src/sync/exporter.ts`, execute concrete, non-placeholder metadata injection:
     ```sql
     CREATE TABLE IF NOT EXISTS catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
     INSERT OR REPLACE INTO catalog_metadata VALUES 
       ('terms_of_use_url', 'https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md'),
       ('terms_version', '1.1'),
       ('repository_url', 'https://github.com/SlamTheDragon/vrc-package-crawler'),
       ('catalog_name', 'vrc-package-crawler Catalog Index'),
       ('license_framework', 'Layer-A: AGPL-3.0 / Layer-B: Database Compilation Terms / Layer-C: Origin Author Rights'),
       ('export_epoch', strftime('%s', 'now'));
     ```
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`docs/REPORTING_SCHEMAS.md`](docs/REPORTING_SCHEMAS.md): Section 1 ("HTTP Header Invariants & Downstream Contract Notice") — document `VRC-Packages-Terms-Of-Use` and `Link` rel="terms-of-service" across Schemas 1, 2, and 5.
  - [`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md): Section 2.1 ("Catalog Export Specification & In-Band Contractual Notice") — document `catalog_metadata` schema and exact key definitions.
  - [`docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md`](docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md): Section 3 ("Downstream Covenants, Browsewrap Enforceability (*Register.com v. Verio*) & Header Injection") — detail in-band contractual notice requirements.
  - [`LEGAL.md`](LEGAL.md): Section 10.1 ("Downstream Recipient Notice Invariant") & Section 10.7 ("Database Export Provenance & In-Band Metadata") — affirm technical enforcement.
  - [`README.md`](README.md): Section "Downstream Developer Integration & Terms of Use" — document terms header and license layer definitions.
- **Acceptance Criteria**: `curl -I http://localhost:8080/v1/health` returns `VRC-Packages-Terms-Of-Use` and `Link: <...>; rel="terms-of-service"`; exported `vrc_catalog.db` contains populated `catalog_metadata` table with zero placeholder text. *(Verified: test passes in `tests/phase1_server_headers.test.ts`)*.

#### Task 1.3: Expose Root API Discovery Route (`GET /`) [COMPLETED]
- **Priority**: Usability & Discoverability | **Complexity**: Low (15 mins) | **Traceability**: CR-23, G-31 | **Status**: Verified & Completed
- **Files**: [`src/server/index.ts`](src/server/index.ts#L140-L150)
- **Canonical Proof & Standards Grounding**:
  - Grounded in **IETF RFC 9110 Section 3.4 & Section 8.6** (HTTP Semantics: Service discovery and root entrypoint resources).
  - Adheres to **IETF RFC 8288** (Web Linking) and **W3C API Home Documents / RFC 7231 discoverability standards**.
  - Aligned with project specifications in [`docs/REPORTING_SCHEMAS.md`](docs/REPORTING_SCHEMAS.md) Section 1 and [`README.md`](README.md) API directory.
- **Problem**: Requesting `GET /` returns `404 Not Found`, lacking an in-band discovery document declaring capabilities, endpoint directories, and legal terms.
- **Remediation**: Implement `GET /` returning concrete, canonical JSON payload:
  ```json
  {
    "name": "vrc-package-crawler API Gateway",
    "version": "1.1.0",
    "repository": "https://github.com/SlamTheDragon/vrc-package-crawler",
    "terms_of_use": "https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md",
    "license": "Layer-A: AGPL-3.0 / Layer-B: Database Compilation Terms / Layer-C: Origin Author Rights",
    "endpoints": {
      "health": "/v1/health",
      "packages_stream": "/v1/packages/stream",
      "vpm_index": "/v1/vpm/index.json",
      "reports": "/v1/reports",
      "opt_out": "/v1/opt-out",
      "telemetry": "/v1/telemetry",
      "media_stream": "/v1/media/stream"
    }
  }
  ```
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`README.md`](README.md): Section "API Gateway Surface" — add `GET /` to primary endpoint catalog table.
  - [`AGENT.md`](AGENT.md): Section "API Gateway Surface & Gateway Invariants" — specify mandatory root route response contract.
  - [`docs/REPORTING_SCHEMAS.md`](docs/REPORTING_SCHEMAS.md): Section 1 ("Root Discovery Route & Machine-Readable Capabilities Contract") — formalize JSON schema.
  - [`docs/OPERATIONS_AND_CHECKLIST.md`](docs/OPERATIONS_AND_CHECKLIST.md): Section 2 ("Health and Discovery Verification") — include `GET /` curl verification.
- **Acceptance Criteria**: `GET /` returns `200 OK` with valid JSON discovery payload including terms link, repository URL, and all active routes. *(Verified: test passes in `tests/phase1_server_headers.test.ts`)*.

#### Task 1.4: Canonical Modified Strategy: Disallow Crawl Fetch Time for Missing Dates, Dissolve External Tools, Front-Stage Sanitation & 2-URL Column Standard [COMPLETED]
- **Priority**: Data Integrity & Pipeline Logistics | **Complexity**: Low-Med (30 mins) | **Traceability**: CR-5, G-14, LEGAL §2.4, DISCOVERY_RULES §4.2 | **Status**: Verified & Completed
- **Files**: [`src/crawler/projection.ts`](src/crawler/projection.ts), [`src/db.ts`](src/db.ts), [`src/utils/sanitizer.ts`](src/utils/sanitizer.ts), Ingestion Drivers (`src/drivers/`)
- **Schema Proof & Architectural Rationale**:
  - In `src/db.ts`, table `canonical_packages` specifies `origin_created_at TEXT` (nullable ISO 8601), `created_at_confidence TEXT` (`'confirmed' | 'inferred' | 'unknown'`), and `created_at TEXT NOT NULL`. Table `entities` specifies `observed_at TEXT NOT NULL` and `raw_payload JSON`. Table `package_fronts` specifies `created_at TEXT NOT NULL`.
  - Conflating local crawler observation time with upstream publication time (`originCreatedAt`) directly violates `LEGAL.md` §2.4 (Factual Provenance Faithfulness) and `DISCOVERY_RULES.md` §4.2. When upstream platform metadata lacks a verifiable publication date, `origin_created_at` MUST be `NULL` with `created_at_confidence = 'unknown'`.
  - **Canonical Modified Task 1.4 Strategy (Dissolved Logistics & Front Sanitation)**:
    1. Standalone script files in `src/tools/` (`pipeline_sanitize.ts`, `exporter.ts`, `steering.ts`, `discover_vpm.ts`, `requeue_gumroad.ts`, `requeue_media.ts`) and dead prototype files (`src/utils/entity_matcher.ts`) are **completely phased out and permanently deleted**, with zero uncalled methods remaining across the active codebase.
    2. Operations are dissolved into the front stages and drivers:
       - **Front-Stage Ingestion Sanitation**: All drivers (`BoothDriver`, `GumroadDriver`, `JinxxyDriver`, `GitHubDriver`, `ItchDriver`, `VpmIndexDriver`) apply `cleanTitle`, `cleanAuthorName`, and `cleanDescription` at the front stage before relevance evaluation and database writing. `CrawlerDB.saveEntity` and `quarantineEntity` enforce this invariant at the gate. Step 2 in `projection.ts` bypasses redundant re-sanitization for entities verified clean from the front stage.
       - **Cross-Platform Description Processing**: GitHub drivers extract rich README overviews and feature bullet points via `extractReadmeDescription`, stripping badges, code fences, and boilerplate. Storefront drivers (Booth, Gumroad, Jinxxy, Itch) extract full descriptions from Inertia/Next.js/DOM payloads. During canonical projection clustering, descriptions across linked repositories and storefronts are synthesized to preserve the richest metadata for canonical packages and FTS5 indexing.
       - **VPM Discovery**: `VpmIndexDriver.discoverVpmRepositories()` dissolved directly into daemon scheduled operations in `runCuratedRegistryWorker()`.
       - **Gumroad Hydration**: `requeueShallowGumroadEntities()` dissolved directly into `runGumroadWorker()`.
       - **Poisson Scheduling Adaptation**: `poissonScheduler.adjustAfterFetch()` wired into `markCrawlSuccess()`, resolving CR-1.
       - **User Steering & Catalog Export**: Run natively in daemon scheduled operations and accessible via `src/monitor/index.ts` IPC subcommands (`project`, `export`, `recrawl`, `sync`).
    3. **2-URL Column Rule**: `canonical_packages` enforces strictly 2 URL columns: `url` for the primary platform and `vcc_url` for the VCC manifest (`vcc://vpm/addRepo?url=...`). Multi-storefront mirrors (`booth_url`, `gumroad_url`, `jinxxy_url`, `itch_url`) are permanently purged from `canonical_packages` and decoupled strictly to `package_fronts`.
    4. **Curator Overrides Standardization**: `curator_overrides` standardizes exclusively on `name_override`, completely deleting `title_override`.
- **Remediation**: Set `originCreatedAt = null` and `createdAtConfidence = 'unknown'` unconditionally when upstream platform metadata lacks publication timestamps:
  ```typescript
  // Projection Date Resolution Fix:
  if (!originCreatedAt) {
    originCreatedAt = null;
    createdAtConfidence = 'unknown';
  }
  ```
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md): Section 4.2 ("Timestamp Extraction, Normalization & Confidence Rubric") — ensure rules mandate NULL for missing upstream publication dates without fallback.
  - [`AGENT.md`](AGENT.md): Section "Data Integrity & Timestamp Confidence Contracts" — codify three-state confidence rubric and dissolved tools architecture.
  - [`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md): Section 2.1 ("Schema Definition for canonical_packages & package_fronts") — clarify semantic separation between origin publication date and crawler first-seen date, 2 URL columns, and front-stage sanitization.
  - [`LEGAL.md`](LEGAL.md): Section 2.4 ("Data Accuracy, Factual Origin Provenance & Timestamp Faithfulness") — verify timestamp accuracy guarantees.
- **Acceptance Criteria**: Entities with no upstream date project `origin_created_at = NULL` and `created_at_confidence = 'unknown'`; local observation date remains captured in `created_at`; obsolete `src/tools/` scripts and `entity_matcher.ts` are fully purged; zero uncalled methods across active files; tests pass in `tests/phase1_timestamps.test.ts`, `tests/phase1_schema_dedup.test.ts`, and `tests/phase1_sanitizer.test.ts`.

#### Task 1.5: Fix VPM Re-Seeding Permanent Gate Lockout Bug [COMPLETED]
- **Priority**: Crawler Loop Integrity | **Complexity**: Low (20 mins) | **Traceability**: CR-4, G-13 | **Status**: Verified & Completed
- **Files**: [`src/crawler/index.ts`](src/crawler/index.ts#L82)
- **Problem**: Gate condition `if (metrics.platformStats["vpm"].pending < 10 && metrics.platformStats["vpm"].done < 50)` permanently halts VPM re-seeding once lifetime `done >= 50`.
- **Remediation**: Replace monotonic `done < 50` check with a temporal staleness check:
  ```typescript
  const VPM_RESEED_INTERVAL_MS = 7 * 86400 * 1000; // 7 days
  if (metrics.platformStats["vpm"].pending < 10 && (!lastVpmSeedAt || Date.now() - lastVpmSeedAt > VPM_RESEED_INTERVAL_MS)) {
    lastVpmSeedAt = Date.now();
    await seedVpmFrontier();
  }
  ```
- **Cascading Documentation Changes**:
  - [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md): Document 7-day temporal staleness window for VPM re-seeding in Section 2.
  - [`AGENT.md`](AGENT.md): Document VPM seeding interval invariant.
- **Acceptance Criteria**: Continuous daemon runs successfully trigger VPM re-seeding after staleness interval regardless of lifetime `done` counter. *(Verified: test passes in `tests/phase1_vpm_reseed.test.ts`)*.

#### Task 1.6: Filter YouTube Embeds at Frontier and Image Proxy [COMPLETED]
- **Priority**: Operational Defect | **Complexity**: Low (30 mins) | **Traceability**: CR-6, G-1, DISCOVERY_RULES §7.1 | **Status**: Verified & Completed
- **Files**: [`src/drivers/jinxxy.ts`](src/drivers/jinxxy.ts#L214-L224), [`src/utils/image_proxy.ts`](src/utils/image_proxy.ts#L740-L745)
- **Problem**: Jinxxy driver enqueues YouTube embed URLs into image queues, triggering Sharp worker parse failures on `text/html`.
- **Remediation**:
  1. In `src/drivers/jinxxy.ts`, filter media arrays by MIME/type, routing `youtube.com/embed/` and `youtu.be/` directly to `youtube_urls` metadata array.
  2. In `src/utils/image_proxy.ts`, add `youtube.com`, `youtu.be`, and `vimeo.com` to `skipPatterns`:
     ```typescript
     const skipPatterns = [
       /youtube\.com\/embed\//i,
       /youtu\.be\//i,
       /vimeo\.com\//i
     ];
     ```
- **Cascading Documentation Changes**:
  - [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md): Re-verify rule in Section 7.1 ("Never store HTML embed URLs in image collections").
- **Acceptance Criteria**: `bun test` passes; YouTube embed URLs bypass image proxying completely and appear in `youtube_urls`. *(Verified: test passes in `tests/phase1_youtube_filter.test.ts`)*.

---

### Phase 2: Security Hardening & Defect Remediation (Medium) — [100% VERIFIED & COMPLETED]

#### Task 2.1: Add Subcommand Guard on Crawler Daemon Binary [COMPLETED]
- **Priority**: Maintainability / CLI Guard | **Complexity**: Medium (30 mins) | **Traceability**: CR-13, CR-18, G-18 | **Status**: Verified & Completed
- **Files**: [`src/crawler/index.ts`](src/crawler/index.ts#L970-L1030)
- **Problem**: Running `vrc-crawler.exe <subcommand>` spawns a second daemon that crashes with a `ProcessLock` collision instead of routing commands.
- **Remediation**: Inspect `process.argv.slice(2)`. If arguments (e.g. `status`, `recrawl`, `stop`) are provided, print an instructional error message:
  ```typescript
  if (process.argv.length > 2) {
    console.error(`[ERROR] Direct subcommand invocation on vrc-crawler is unsupported.`);
    console.error(`Administrative commands must be dispatched via vrc-monitor.exe or bun run src/monitor/index.ts <command>`);
    process.exit(1);
  }
  ```
- **Cascading Documentation Changes**:
  - [`README.md`](README.md): Re-verify that CLI dispatch instructions explicitly specify `vrc-monitor.exe`.
  - [`DELEGATES.md`](DELEGATES.md): Ensure Section 2 binary topography states `vrc-crawler.exe` takes zero subcommands.
- **Acceptance Criteria**: Running `bun run src/crawler/index.ts status` exits cleanly with code 1 and redirection message. *(Verified: test passes in `tests/phase2_cli_guard.test.ts`)*.

#### Task 2.2: Enforce Mandatory `API_SECRET_TOKEN` Auth & Quarantine Delisting Reports [COMPLETED]
- **Priority**: Critical Security Vulnerability | **Complexity**: Medium (45 mins) | **Traceability**: CR-2, G-4, LEGAL §10.6, §9.4 | **Status**: Verified & Completed
- **Files**: [`src/server/index.ts`](src/server/index.ts#L130, #L196-L204), [`src/crawler/steering.ts`](src/crawler/steering.ts)
- **Token Generation Guidelines**:
  - The administrative secret must be generated using a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG) with at least 256 bits of entropy:
    ```bash
    # OpenSSL generation
    openssl rand -hex 32
    # Or Bun native crypto generation
    bun -e 'console.log(crypto.randomBytes(32).toString("hex"))'
    ```
  - In server code (`src/server/index.ts`), token validation must use constant-time string comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
- **Alignment with `LEGAL.md` §10.6 & §9.4 (Resolving Ambiguity)**:
  - `LEGAL.md` §10.6 establishes that community and automated reporting cannot autonomously delist or mutate indexed catalog records. Unauthenticated `POST /v1/reports` created an open denial-of-service vector where adversaries could mass-delist competitor packages.
  - **Crucial Legal Distinction**:
    - **Administrative Curation & Moderation (`POST /v1/reports`)**: Strictly requires `API_SECRET_TOKEN` bearer auth. Even authenticated reports for `irrelevance / scam` route into a `'needs_review'` quarantine buffer rather than executing immediate `delisted` lifecycle mutations.
    - **Public Rights-Holder Opt-Out (`POST /v1/opt-out`, Task 3.1)**: Stays unauthenticated, but is strictly gated by cryptographic proofs (DNS TXT, signed Git commit) or ephemeral storefront bio tokens under `LEGAL.md` §9.4-9.5.
- **Remediation**:
  1. In `src/server/index.ts`, reject report submissions if `API_SECRET_TOKEN` is unset or header `Authorization: Bearer <token>` is missing/invalid:
     ```typescript
     const authHeader = req.headers["authorization"];
     const expectedToken = process.env.API_SECRET_TOKEN || process.env.CRAWLER_API_TOKEN;
     if (!expectedToken || !authHeader || !authHeader.startsWith("Bearer ")) {
       res.writeHead(401, { "Content-Type": "application/json" });
       return res.end(JSON.stringify({ error: "Unauthorized: Administrative bearer token required" }));
     }
     const providedToken = authHeader.slice(7);
     const tokenBuffer = Buffer.from(providedToken);
     const expectedBuffer = Buffer.from(expectedToken);
     if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
       res.writeHead(401, { "Content-Type": "application/json" });
       return res.end(JSON.stringify({ error: "Unauthorized: Invalid administrative bearer token" }));
     }
     ```
  2. In `src/crawler/steering.ts`, reports with `branch: "irrelevance"` must update status to `'needs_review'` rather than executing immediate `UPDATE canonical_packages SET lifecycle = 'delisted'`.
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`docs/REPORTING_SCHEMAS.md`](docs/REPORTING_SCHEMAS.md): Section 5 ("Security, Bearer Token Specification & Quarantined Processing") — document bearer token header requirements and quarantine flow.
  - [`AGENT.md`](AGENT.md): Section "Security Invariants & Administrative Access Control" — add invariant forbidding autonomous destructive lifecycle changes without human review.
  - [`DELEGATES.md`](DELEGATES.md): Section 4 ("Token Generation, Key Rotation & Secret Storage Runbook") — document CSPRNG token generation and rotation.
  - [`docs/OPERATIONS_AND_CHECKLIST.md`](docs/OPERATIONS_AND_CHECKLIST.md): Section 3 ("Curator Report Ingestion & Quarantined Delisting Verification") — document curation queue triage.
  - [`LEGAL.md`](LEGAL.md): Section 10.6 ("Downstream Reporting Invariants") & Section 9.4 ("Takedown Protocols") — explicitly distinguish administrative curation auth from unauthenticated rights-holder proof-based delisting.
- **Acceptance Criteria**: Anonymous `POST /v1/reports` returns `401 Unauthorized`; authenticated delisting reports enter `'needs_review'` buffer. *(Verified: test passes in `tests/phase2_auth_quarantine.test.ts`)*.

#### Task 2.3: Cloudflare Turnstile Detection & Poisson Acceleration Guard [COMPLETED]
- **Priority**: Bot Perimeter Defense | **Complexity**: Medium (45 mins) | **Traceability**: CR-15, G-3, G-23, LEGAL §5.1(c), §6.4 | **Status**: Verified & Completed
- **Files**: [`src/drivers/gumroad.ts`](src/drivers/gumroad.ts#L80-L120), [`src/drivers/jinxxy.ts`](src/drivers/jinxxy.ts#L75-L115)
- **Problem**: Cloudflare Managed Challenges serve `HTTP 200` with Turnstile HTML challenge scripts. The crawler treats this as a document update, accelerates the Poisson crawl rate ($\lambda \times 1.4$), and triggers an IP ban.
- **Remediation**: Before parsing HTML DOM, inspect payload:
  ```typescript
  if (html.includes("challenges.cloudflare.com/turnstile") || html.includes("cf-mitigated: challenge")) {
    logger.warn(`[AntiBot] Cloudflare Managed Challenge encountered on ${url}. Halting domain crawl.`);
    await db.markStatus(url, "blocked", 86400 * 3); // 3-day backoff
    return null;
  }
  ```
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md): Section 3.6 ("Turnstile Zero-Circumvention & Halt Invariants") — formalize detection signatures.
  - [`docs/PLATFORM-MATRIX.md`](docs/PLATFORM-MATRIX.md): Section 2.2 & 2.4 — update perimeter defense notes for Gumroad and Jinxxy.
- **Acceptance Criteria**: Simulated Turnstile HTML payload halts domain crawl and sets status `"blocked"` without accelerating crawl rate. *(Verified: test passes in `tests/phase2_turnstile_defense.test.ts`)*.

#### Task 2.4: Implement CJK Text Normalization & SimHash Bracket Stripping [COMPLETED]
- **Priority**: Search Convergence / Entity Resolution | **Complexity**: Medium (1 hour) | **Traceability**: CR-17, G-24 | **Status**: Verified & Completed
- **Files**: [`src/utils/sanitizer.ts`](src/utils/sanitizer.ts), [`src/crawler/projection.ts`](src/crawler/projection.ts)
- **Problem**: Japanese BOOTH listings heavily use full-width decorative brackets (`【...】`, `［...］`, `（...）`). Unstripped boilerplate distorts character 2-grams, preventing SimHash-64 Hamming distance from converging with Western mirrors.
- **Remediation**: Implement `normalizeListingTitle(title: string)`:
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
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md): Section 3.5 ("NFKC Normalization & CJK Bracket Stripping") — document title cleaning pipeline.
  - [`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md): Section 2.2 ("Entity Resolution & SimHash Pipeline") — update character shingling and bracket normalization description.
- **Acceptance Criteria**: Title `"【VRChat想定】Modular Avatar対応 ツール"` converges (Hamming distance $\le 3$) with mirror `"Modular Avatar Tool"`. *(Verified: test passes in `tests/phase2_cjk_simhash.test.ts`)*.

#### Task 2.5: Implement Session-Prefixed Daily Rotating Log Streams [COMPLETED]
- **Priority**: System Reliability / SRE | **Complexity**: Medium (1 hour) | **Traceability**: CR-12, G-8 | **Status**: Verified & Completed
- **Files**: [`src/logger.ts`](src/logger.ts#L1-L92)
- **Problem**: Monolithic log files stream indefinitely without session prefixes or daily gzip compression, risking unbounded disk growth during 24/7 autonomous runs.
- **Remediation**: Implement structured file logging with session prefixes (`session_<pid>_<timestamp>.log`), date-based rotation triggers, and asynchronous daily `.gz` compression during idle Poisson intervals.
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`DELEGATES.md`](DELEGATES.md): Section 8 ("Logging & Rotation Runbook") — document native session rotation.
  - [`docs/OPERATIONS_AND_CHECKLIST.md`](docs/OPERATIONS_AND_CHECKLIST.md): Section 5 ("Log File Inspection & Rotation Paths") — update monitoring paths.
- **Acceptance Criteria**: Daemon writes to session-prefixed log files; simulated date change rotates and compresses prior logs. *(Verified: test passes in `tests/phase2_log_rotation.test.ts`)*.

#### Task 2.6: Rebuild Deterministic Testbed with In-Memory Isolation (Ground Zero after Legacy Test Deletion) [COMPLETED]
- **Priority**: CI/CD Reliability & Testbed Integrity | **Complexity**: Medium (1 hour) | **Traceability**: CR-9, G-17 | **Status**: Verified & Completed
- **Files**: `tests/` directory, [`src/db.ts`](src/db.ts#L248)
- **Testbed Deletion & Clean-Slate Reality**:
  - All 12 legacy test files in `tests/` (`compliance_and_sync.test.ts`, `exporter.test.ts`, `gumroad_driver.test.ts`, `image_proxy.test.ts`, `ipc.test.ts`, `poisson.test.ts`, `robots.test.ts`, `schema_unification.test.ts`, `server.test.ts`, `steering.test.ts`, `sync.test.ts`, `unified_schema.test.ts`) were deleted by the operator to eliminate false-positive test results, mock-reality drift, and codebase dislocation against stale production database files (`dist/crawler_state.db` [357 MB]).
  - With `tests/` cleared, a fresh, deterministic, decoupled testbed must be rebuilt from ground zero.
- **Mandatory Testbed Invariant**:
  - Tests must **NEVER** attach to `dist/crawler_state.db` or any live production artifact.
  - Every test file must spin up an ephemeral in-memory SQLite database (`:memory:`) or a unique isolated temp fixture (`dist/test_fixture_<uuid>.db`) initialized with the new canonical ground-truth schema and cleaned up in `afterAll()`.
  - Implement mock HTTP transports (MSW / Bun mock fetch) for driver testing to decouple network tests from live storefronts and rate limits.
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`AGENT.md`](AGENT.md): Section "Test Suite Isolation & Fixture Contracts" — mandate `:memory:` databases and document the purge of legacy tests.
  - [`docs/OPERATIONS_AND_CHECKLIST.md`](docs/OPERATIONS_AND_CHECKLIST.md): Section 6 ("Test Suite Architecture & Verification Runbook") — update testbed run commands and fixture isolation invariants.
  - [`DELEGATES.md`](DELEGATES.md): Section 5 ("Testing, CI/CD and Verification Protocols") — specify isolated test execution rules.
- **Acceptance Criteria**: `bun test` discovers new isolated tests; all tests execute deterministically against `:memory:` or temporary fixture DBs with zero access to `dist/crawler_state.db`. *(Verified: 39 tests across 12 files passed Phase 2; expanded to 65 tests across 16 files and 306 assertions in Phase 3 with zero failures and zero access to production DB)*.

#### Task 2.7: Autonomous Fault Tolerance Subsystem: Domain Circuit Breakers, Exponential Backoff with Jitter & Persistent Dead-Letter Queue (Permanent Removal of manual requeue scripts) [COMPLETED]
- **Priority**: System Reliability / Unattended Autonomy | **Complexity**: Medium (1 hour 15 mins) | **Traceability**: Operational Defect (HEAD Section 1), G-1, G-3, G-11 | **Status**: Verified & Completed
- **Files**: [`src/crawler/index.ts`](src/crawler/index.ts), [`src/drivers/gumroad.ts`](src/drivers/gumroad.ts), [`src/utils/image_proxy.ts`](src/utils/image_proxy.ts), [`src/tools/requeue_gumroad.ts`](src/tools/requeue_gumroad.ts), [`src/tools/requeue_media.ts`](src/tools/requeue_media.ts), [`package.json`](package.json)
- **Problem**:
  - When encountering transient network errors, HTTP 429 rate limits, or CDN stalls, Gumroad and image proxy queues halt. Operators previously executed manual batch scripts (`src/tools/requeue_gumroad.ts`, `src/tools/requeue_media.ts`, `bun run requeue:gumroad`, `bun run requeue:media`) to reset failed/stalled frontier items. Relying on manual intervention violates 24/7 unattended autonomy and causes lock contention with the active daemon.
  - This requires a proper systematic integration into the system rather than a series of script patches.
- **Systematic Architectural Integration**:
  1. **Domain Circuit Breaker State Machine**:
     - Implement a formal three-state circuit breaker per target domain in `CrawlerEngine`: `CLOSED` (normal crawling), `OPEN` (tripped; crawling halted for backoff period), and `HALF_OPEN` (testing domain with a single canary request).
     - Trip conditions: Tripped to `OPEN` on consecutive rate limits (`HTTP 429`), Cloudflare challenge mitigations, or socket timeouts ($K \ge 3$).
     - Exponential Backoff with Full Jitter: $T_{\text{backoff}} = \min(T_{\max}, T_{\text{base}} \times 2^{\text{consecutive\_failures}}) \pm \text{random\_jitter}$ (starting at 30s up to a maximum 1-hour backoff).
     - Half-Open Probe: Automatically transitions to `HALF_OPEN` upon backoff expiration, sending a single probe request before resuming or re-tripping.
  2. **Persistent Dead-Letter Queue (DLQ) in `frontier`**:
     - Extend `frontier` table with explicit queue states: `'dead_letter'`, `'circuit_broken'`, `'backoff'`.
     - Add failure metadata columns: `last_failure_code INTEGER`, `last_failure_reason TEXT`, `failure_count INTEGER DEFAULT 0`.
     - URLs exceeding max retry threshold ($N \ge 5$) move to `'dead_letter'`.
  3. **Autonomous Background Idle Re-evaluation Loop**:
     - Built into the daemon main loop (`src/crawler/index.ts`): during low-volume Poisson wait windows, the crawler autonomously tests half-open probes and drains the DLQ with degraded rate limits.
  4. **Deprecation & Permanent Removal of Standalone Scripts**:
     - Permanently delete `src/tools/requeue_gumroad.ts` and `src/tools/requeue_media.ts`.
     - Remove `requeue:gumroad` and `requeue:media` scripts from `package.json`.
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md): Section 3.4 ("Fault Tolerance, Autonomous Circuit Breakers & Dead-Letter Queue Architecture") — document state machine and backoff math.
  - [`AGENT.md`](AGENT.md): Section "Crawler Loop Invariants & Autonomous Fault Recovery Contracts" — define circuit breaker and retry invariants.
  - [`DELEGATES.md`](DELEGATES.md): Section 8 ("Fault Recovery Runbook & Elimination of Manual Batch Scripts") — document autonomous self-healing and purge manual requeue runbooks.
  - [`docs/OPERATIONS_AND_CHECKLIST.md`](docs/OPERATIONS_AND_CHECKLIST.md): Section 4 ("Operational Self-Healing & Circuit Breaker Diagnostics") — document monitoring commands.
  - [`package.json`](package.json): Permanently delete `requeue:gumroad` and `requeue:media` entries.
- **Acceptance Criteria**: Crawler daemon autonomously pauses and recovers from simulated HTTP 429 and network timeouts without requiring manual script execution; dead-letter entries are reconciled during idle loops; manual requeue scripts and `package.json` entries are permanently removed. *(Verified: test passes in `tests/phase2_fault_tolerance.test.ts`)*.

---

### Phase 3: Legal Compliance & Pure Media Pointer Migration (Medium-High) — [100% VERIFIED & COMPLETED]

#### Task 3.1: Expose Automated Non-Scraping Opt-Out Endpoint (`POST /v1/opt-out`) [COMPLETED]
- **Priority**: Legal Invariant / Creator Rights | **Complexity**: Medium-High (1.5 hours) | **Traceability**: CR-8, CR-16, G-5, G-25, LEGAL §9.4-9.5 | **Status**: Verified & Completed
- **Files**: [`src/server/index.ts`](src/server/index.ts), [`src/db.ts`](src/db.ts#L551-L578), [`src/crawler/projection.ts`](src/crawler/projection.ts)
- **Problem**: `db.registerOptOut()` exists but has zero API routes or CLI callers; creators (particularly non-domain shop owners on BOOTH, Gumroad, Jinxxy) have no automated, non-scraping method to request delisting.
- **Remediation**:
  1. Add `POST /v1/opt-out` in `src/server/index.ts` accepting `{ vendorId, proofType: "dns_txt" | "storefront_bio_token" | "signed_commit", proofValue, storefrontUrl? }`.
  2. Implement three non-scraping verification pathways:
     - **Path A (`dns_txt`)**: For domain owners, query DNS TXT record for `_vrc-opt-out.<vendorDomain>` matching `vrc-opt-out=<vendorId>` via `node:dns/promises`.
     - **Path B (`storefront_bio_token`)**: For creators on hosted platforms (BOOTH, Gumroad, Jinxxy) without custom domain DNS control, creator temporarily places a verification token string (e.g. `#vrc-opt-out-<vendorId>`) in their public store profile bio/description. The server performs an ephemeral, unauthenticated single HTTP fetch of the creator's public profile page, checks for the exact presence of the token string, and immediately discards the fetched HTML payload from memory without storing, DOM parsing, or indexing.
     - **Path C (`signed_commit`)**: For Git repository owners, verify cryptographic commit signature against author's published public Git key.
  3. **Strict Operational & Anti-Abuse Guardrails for Storefront Bio-Token Probes**:
     - *Host Whitelist & Scheme Validation*: Reject any `storefrontUrl` not strictly matching authorized storefront host patterns (`^https:\/\/([a-zA-Z0-9_-]+\.)?(booth\.pm|gumroad\.com|jinxxy\.com)\/`). Reject non-HTTPS schemes and IP literals with `HTTP 400 Bad Request`.
     - *SSRF & DNS Rebinding Prevention*: Resolve domain IP before issuing request. Immediately abort if the resolved IP belongs to loopback, private, link-local, or cloud metadata ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`).
     - *Rate Limiting*: Enforce a sliding-window rate limit of 5 verification requests/minute per client IP to eliminate SSRF amplification and storefront harassment vectors.
     - *Fetch Constraints*: Impose a strict 5.0-second socket timeout, 512 KB payload size ceiling, and distinct User-Agent header (`User-Agent: VRCDiscoveryBot/1.0 (+https://github.com/SlamTheDragon/vrc-package-crawler; slamthedragon@gmail.com; verification-probe)`).
     - *Zero Retention*: Stream the response body and perform direct substring search (`chunk.includes(token)`). Immediately abort and discard buffers upon match.
  4. Upon verification, call `db.registerOptOut(vendorId, proofType)` and immediately update matching packages in `canonical_packages` to `lifecycle = 'delisted'`.
  5. Legal Backing Caveats & Unauthenticated Guidelines:
     - The on-demand storefront bio token fetch is strictly an operational verification probe requested by the data subject under `LEGAL.md` §9.4-9.5; it does not constitute recursive or systematic crawling.
     - Creators are instructed that the verification token is ephemeral and can be removed immediately once `200 OK` confirmation is received.
- **Cascading Documentation Changes**:
  - [`LEGAL.md`](LEGAL.md): Update Section 9.4 and 9.5 to document `storefront_bio_token` alongside DNS TXT and signed commits, noting automated `POST /v1/opt-out` route.
  - [`docs/REPORTING_SCHEMAS.md`](docs/REPORTING_SCHEMAS.md): Document `POST /v1/opt-out` request/response schemas with `storefront_bio_token` payload.
  - [`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md): Add opt-out verification workflow diagram including bio-token validation.
  - [`docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md`](docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md): Document bio-token non-scraping verification guidelines.
- **Acceptance Criteria**: Automated test successfully verifies mock DNS TXT and storefront bio token records, rejects SSRF attempts against localhost/private IPs, enforces rate limits, registers opt-out in database, and delists matching packages. *(Verified: test passes in `tests/phase3_opt_out.test.ts`)*.

#### Task 3.2: Pure Media Pointer Migration: Hybrid Delivery Architecture & Deprecate SQLite WebP BLOB Storage [COMPLETED]
- **Priority**: Core Legal Compliance | **Complexity**: Medium-High (2 hours) | **Traceability**: CR-19, CR-21, G-1, G-22, G-29, LEGAL §7.2(c) | **Status**: Verified & Completed
- **Files**: [`src/db.ts`](src/db.ts#L180-L210), [`src/utils/image_proxy.ts`](src/utils/image_proxy.ts), [`src/server/index.ts`](src/server/index.ts#L173-L180), [`src/sync/exporter.ts`](src/sync/exporter.ts)
- **Problem**: Code currently stores raw WebP buffers directly as BLOBs in SQLite `media_cache.webp_data` (`dist/crawler_state.db`), creating a 357 MB database and re-hosting copyrighted imagery in tension with the Server Test split (*Perfect 10* vs *Goldman v. Breitbart*). Furthermore, closed storefront CDNs enforce `Referer` headers and block direct hotlinking with `403 Forbidden` (G-1).
- **Remediation**:
  1. **Direct Origin URLs by Default**: Modify `src/server/index.ts` and API catalog feeds to return direct origin CDN URLs in `media_urls` and `source_url`, aligning with the Ninth Circuit Server Test (*Perfect 10 v. Amazon*).
  2. **Ephemeral In-Memory Streaming Proxy (`GET /v1/media/stream?url=<encoded_origin_url>`)**: Provide an on-demand streaming conduit for downstream clients that encounter origin CDN hotlink blocks or `Referer` restrictions:
     - *Origin Host Whitelist & SSRF Guard*: Strictly validate `url` query parameter against authorized origin media CDN domains (`*.pximg.net`, `public-files.gumroad.com`, `assets.jinxxy.com`, `raw.githubusercontent.com`, `img.itch.zone`). Reject foreign domains with `HTTP 403 Forbidden` and private/internal IPs with `HTTP 400 Bad Request`.
     - *In-Memory Streaming Pipeline*: Fetches origin media on-the-fly with polite headers, strips downstream referrers, transcodes/downscales to lightweight WebP in memory (max width 800px, WebP quality 75), and pipes the buffer directly to the HTTP response stream.
     - *Strict Zero-Storage Guarantee*: Absolutely zero disk storage, zero SQLite BLOB caching, and zero persistence to Cloudflare R2.
     - *Client Caching & Transport Headers*: Set `Content-Type: image/webp`, `Cache-Control: private, max-age=86400, stale-while-revalidate=3600`, and `X-Content-Type-Options: nosniff` so caching occurs exclusively on the client device.
     - *Error Mapping*: Return `HTTP 502 Bad Gateway` if upstream CDN is unreachable or `HTTP 404 Not Found` if origin returns 404, without leaking internal stack traces.
  3. **Database Schema Clean-Up**: Drop `webp_data BLOB` from `media_cache`. Retain only `phash_64`, `blurhash`, `source_url`, `mime_type`, and `last_checked_at`. In `src/sync/exporter.ts`, purge `webp_data BLOB` from exported `vrc_catalog.db`.
  4. **Legal Consultation Caveats**: Document that while ephemeral streaming proxying eliminates reproduction/storage liability under the Server Test, public display/transmission exposure under *Goldman v. Breitbart* and *Nicklen* remains an active circuit split. Direct origin URLs remain the canonical default; downstream client developers must be informed of both modes and advised to evaluate their local display posture under *Kelly v. Arriba Soft*.
- **Cascading Documentation Changes**:
  - [`LEGAL.md`](LEGAL.md): Update Section 7.2(c) to reflect the Hybrid delivery model (direct origin pointers + ephemeral memory stream) and remove the WebP BLOB implementation lag asterisk once deployed.
  - [`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md): Update Section 2.1 media cache schema and document `/v1/media/stream` in-memory proxy architecture.
  - [`docs/REPORTING_SCHEMAS.md`](docs/REPORTING_SCHEMAS.md): Document `GET /v1/media/stream` endpoint schema and caching behavior.
  - [`docs/EDGE_SYNC_AND_SCALE_GUIDE.md`](docs/EDGE_SYNC_AND_SCALE_GUIDE.md): Remove persistent R2 thumbnail synchronization; edge serves pure URLs.
  - [`docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md`](docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md): Update Section 1 & Section 3 to document hybrid streaming proxy architecture.
- **Acceptance Criteria**: SQLite database schema contains no `webp_data BLOB` column; database footprint drops drastically; API feeds return direct source CDN URLs; `/v1/media/stream` streams live origin media ephemerally without disk writes, rejects unwhitelisted domains with 403, and caches privately on client; all tests pass. *(Verified: test passes in `tests/phase3_media_stream.test.ts`)*.

#### Task 3.3: Wire Conditional Request Headers (ETag / If-None-Match) & Reconnect Poisson Feedback [COMPLETED]
- **Priority**: Bandwidth & Freshness Invariant | **Complexity**: Medium-High (2 hours) | **Traceability**: CR-1, CR-7, CR-20, G-11, LEGAL §5.2(e) | **Status**: Verified & Completed
- **Files**: [`src/drivers/github.ts`](src/drivers/github.ts#L174-L177), [`src/drivers/booth.ts`](src/drivers/booth.ts), [`src/utils/poisson_scheduler.ts`](src/utils/poisson_scheduler.ts#L49), [`src/crawler/index.ts`](src/crawler/index.ts), [`src/db.ts`](src/db.ts#L707-L728)
- **Problem**: Crawlers never send `If-None-Match` or `If-Modified-Since`. `adjustAfterFetch(url, isModified, etag, lastModifiedHeader)` has zero callers; `db.markStatus` sets a rigid 24-hour constant.
- **Remediation**:
  1. Pass stored `etag` and `last_modified` from `frontier`/`entities` as `If-None-Match` and `If-Modified-Since` in driver HTTP fetch requests.
  2. On `HTTP 304 Not Modified`, invoke `PoissonScheduler.adjustAfterFetch(url, false, etag, lastModified)`.
  3. In `db.markStatus()`, use the computed `nextInterval` from the scheduler instead of the rigid `+86400 seconds` constant.
- **Cascading Documentation Changes**:
  - [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md): Update Section 2 re-crawl policy with true conditional request header mechanics.
  - [`AGENT.md`](AGENT.md): Document `adjustAfterFetch()` true signature and conditional header wiring.
- **Acceptance Criteria**: Mock server returning `HTTP 304` triggers `adjustAfterFetch(url, false)` without re-downloading or re-parsing payload; `next_fetch_at` adapts based on change frequency. *(Verified: test passes in `tests/phase3_conditional_requests.test.ts`)*.

#### Task 3.4: Edge Sync Watermark Recovery & Data Loss Prevention [COMPLETED]
- **Priority**: Critical Data Loss Prevention | **Complexity**: Medium-High (2 hours) | **Traceability**: CR-3, G-12 | **Status**: Verified & Completed
- **Files**: [`src/sync/index.ts`](src/sync/index.ts#L128-L133), [`src/crawler/projection.ts`](src/crawler/projection.ts)
- **Problem**: Periodic `DELETE FROM canonical_packages` resets SQLite rowids to 1. In `src/sync/index.ts`, watermark check `watermarkRowId > maxRowInDb` fails to reset if the rebuilt table has more rows, permanently skipping rows 1..watermark from Cloudflare D1.
- **Remediation**: Track projection generation epochs via a deterministic UUID or timestamp in `sync_checkpoints`. If `canonical_packages` projection epoch changes, automatically trigger a safe watermark realignment sweep rather than comparing raw auto-incrementing rowids.
- **Cascading Documentation Changes**:
  - [`docs/EDGE_SYNC_AND_SCALE_GUIDE.md`](docs/EDGE_SYNC_AND_SCALE_GUIDE.md): Add Section 3 detailing watermark epoch alignment and recovery.
  - [`DELEGATES.md`](DELEGATES.md): Document the `--reset-watermark` recovery command in Section 5.
- **Acceptance Criteria**: Running a simulated table wipe and rebuild with 16k rows correctly resynchronizes all rows without silent omission; `tests/sync.test.ts` passes. *(Verified: test passes in `tests/phase3_watermark_recovery.test.ts`)*.

> **Phase 3 Completion & Sign-Off**: **100% Verified & Finished**. Deterministic testbed expanded to 65 passing tests across 16 files (306 assertions) with zero failures and zero access to production DB. Pre-review amendment specification `docs/legal/TARGETED_LEGAL_WORDING_CORRECTIONS.md` fully adopted into `LEGAL.md` and purged. Factual discrepancies, breaking points, and overlooked items formally documented in [`DISAGREEMENTS.md`](DISAGREEMENTS.md). Ready for Phase 4.

---

### Phase 4: Schema Normalization & Pipeline Scalability (High)

#### Task 4.1: Database Schema Deduplication, Ground Truth Architecture & Dist Stale DB Policy (Canonical Task 4)
- **Priority**: Critical / High Priority Architectural Anchor (Ground Truth Schema) | **Complexity**: High (2.5 hours) | **Traceability**: CANON-4, CR-11, G-9, G-26, LEGAL §2.3, §10.7
- **Files**: [`src/db.ts`](src/db.ts), [`src/crawler/projection.ts`](src/crawler/projection.ts), [`src/crawler/steering.ts`](src/crawler/steering.ts), [`src/sync/exporter.ts`](src/sync/exporter.ts), [`src/sync/index.ts`](src/sync/index.ts)
- **Problem & Dist Stale Database Policy**:
  - Overlapping URL storage existed: flat columns (`github_url`, `booth_url`, `gumroad_url`, `jinxxy_url`, `itch_url`) alongside `platforms_json` in `canonical_packages`, plus individual rows in `package_fronts`. In `curator_overrides`, dual override fields (`name_override` vs `title_override`) caused coalescence conflicts.
  - **Official Stale DB Policy**: All existing database files in `dist/` (`dist/crawler_state.db` [357 MB], `dist/vrc_catalog.db`, etc.) are formally designated **STALE / LEGACY PROJECTIONS**.
  - **Postponement of In-Place Migration**: Fragile in-place column-by-column migration scripts against the stale 357 MB database are **POSTPONED AND DROPPED**. The system will not perform high-risk in-place SQL alter operations on deprecated files.
  - **Ground Canonical Clean-Slate Rebuild**: A clean, deduplicated ground-canonical schema is established in code (`src/db.ts`) as the single source of truth. Fresh canonical databases will be synthesized cleanly from raw `entities` event logs or fresh crawler seeding, eliminating legacy column cruft, redundant URL columns, and bloated WebP BLOBs from the ground up!
  - **Early Workflow Integration (Phase 1 Baseline)**: The 2-URL-column reduction (`url` for primary platform and `vcc_url` for VCC manifest), elimination of `title_override` in favor of `name_override`, and complete deletion of legacy `src/tools/` scripts have been executed and integrated early directly into the Phase 1 active schema.
- **Remediation**:
  1. Standardize `canonical_packages` strictly to 2 URL columns (`url` and `vcc_url`), delegating all secondary storefront mirrors strictly to `package_fronts`.
  2. Normalize `curator_overrides` to use a single canonical field `name_override`, permanently removing `title_override`.
  3. Define strict TypeScript DTOs in `src/db.ts` to enforce uniform schema access across all modules.
  4. Ensure `src/db.ts` initialization creates clean normalized tables from scratch.
  5. Permanently remove all obsolete scripts from `src/tools/`, dissolving functionality directly into `src/crawler/projection.ts`, `src/crawler/steering.ts`, and `src/sync/exporter.ts`.
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md): Section 2.1 ("Canonical Ground-Truth Database Schema & Dist Stale DB Policy") — document clean schema definitions and formalize stale status of `dist/crawler_state.db`.
  - [`AGENT.md`](AGENT.md): Section "Database Schema Invariants, Ground Truth Architecture & Stale DB Policy" — define schema contracts and DTO types.
  - [`DELEGATES.md`](DELEGATES.md): Section 3 ("Database Topography, State Management & Dist Maintenance Protocol") & Section 8 — document 2-URL rule and operational guidelines.
- **Acceptance Criteria**: Schema definition executes cleanly without legacy redundant columns; TypeScript DTOs validate all database reads/writes; stale `dist/` databases are bypassed in favor of clean fresh synthesis.

#### Task 4.2: Enforce Air-Gapped Stateless Architecture Invariants (Canonical Task 6)
- **Priority**: Security & Legal Boundary | **Complexity**: High (2 hours) | **Traceability**: CANON-6, G-21, LEGAL §8.5, §9.8, §10.5
- **Files**: Entire repository architectural boundaries
- **Problem**: Boundary regarding whether the crawler backend should ever manage user accounts, sessions, or private bookmarks.
- **Remediation**: Formalize architectural contracts and code guards ensuring `vrc-server.exe` remains strictly an unauthenticated, stateless metadata catalog. User accounts, bookmarks, private lists, and recommendation scoring must be handled entirely by external downstream client applications (e.g. desktop managers, web frontends).
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`README.md`](README.md): Section "System Architecture & Boundaries" — explicitly state that user authentication is air-gapped downstream.
  - [`LEGAL.md`](LEGAL.md): Section 9.8 ("Air-Gapped Client Architecture") & Section 10.5 ("Non-Commercial Metadata Service") — re-affirm unauthenticated metadata catalog status.
  - [`AGENT.md`](AGENT.md): Section 1 ("Architectural Boundary Invariants") — formalize boundary contract.
- **Acceptance Criteria**: Architectural audit confirms zero session cookies, password hashes, or user account models exist in `src/`.

#### Task 4.3: Implement Schema 5 Interaction & Search Telemetry Route (Canonical Task 5)
- **Priority**: Feedback Loop & Discovery | **Complexity**: High (2.5 hours) | **Traceability**: CANON-5, G-8, LEGAL §8.5, REPORTING_SCHEMAS §6
- **Files**: [`src/server/index.ts`](src/server/index.ts), [`src/db.ts`](src/db.ts), [`src/crawler/steering.ts`](src/crawler/steering.ts)
- **Problem**: `docs/REPORTING_SCHEMAS.md` defines Schema 5 for anonymous click rates, queries, and bookmarks to seed discovery, but `src/server/index.ts` has zero ingestion endpoints.
- **Remediation**:
  1. Add `POST /v1/telemetry` route in `src/server/index.ts` accepting Schema 5 payloads (`batchId`, `collectedAt`, `metrics: { searchQueries, packageInteractions }`).
  2. Validate payload using JSON Schema validator. Enforce privacy invariant: strictly reject submissions containing personal data, user tokens, or IP session trackers.
  3. Aggregate search queries into `search_patterns` to boost popular keywords and seed new frontier crawl targets.
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`docs/REPORTING_SCHEMAS.md`](docs/REPORTING_SCHEMAS.md): Section 6 ("Schema 5: Interaction & Query Telemetry Contract") — mark ingestion route as active.
  - [`AGENT.md`](AGENT.md): Section "API Gateway Surface & Gateway Invariants" — document `POST /v1/telemetry` route contract.
- **Acceptance Criteria**: `POST /v1/telemetry` accepts valid Schema 5 payload, increments aggregate interaction counters, rejects payloads with PII, and returns `200 OK`.

#### Task 4.4: Incremental Projection Sanitizer & Dirty-Tracking Clustering
- **Priority**: Pipeline Scalability | **Complexity**: High (3 hours) | **Traceability**: CR-3, G-12
- **Files**: [`src/crawler/projection.ts`](src/crawler/projection.ts)
- **Problem**: `runProjection()` executes `DELETE FROM canonical_packages` every 15 minutes, running full in-memory SimHash clustering across all entities ($O(n^2)$), causing excessive memory usage and risking daemon loop overrun.
- **Remediation**: Replace full-wipe rebuild with an incremental upsert strategy keyed on `canonical_id`. Track modified entities using a `dirty_since` timestamp, recomputing SimHash clusters only for newly added or modified entities, and preserving unchanged canonical package records.
- **Cascading Documentation Changes (Targeted Sections)**:
  - [`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md): Section 2.2 ("Incremental Projection Architecture & DSU Clustering Mechanics") — document dirty-tracking upserts.
  - [`docs/OPERATIONS_AND_CHECKLIST.md`](docs/OPERATIONS_AND_CHECKLIST.md): Section 4 ("Projection Runtime Benchmarks & Scaling Targets") — update runtime limits.
- **Acceptance Criteria**: Projection sanitization completes in < 2.0s for incremental runs; unchanged rows retain stable IDs and timestamps.

---

### Phase 5: Canonical Ecosystem Expansion & Governance (Hardest)

#### Task 5.1: Federated Registry & Community Manifest VPM Seeding (Canonical Task 1)
- **Priority**: Ecosystem Discovery | **Complexity**: Very High (3.5 hours) | **Traceability**: CANON-1, G-10, LEGAL §11.3, DISCOVERY_RULES §2
- **Files**: `src/crawler/vpm_discovery.ts` (future driver), [`src/crawler/index.ts`](src/crawler/index.ts)
- **Problem**: VPM package discovery is currently tethered to GitHub search APIs. Open-web unindexed spiders violate politeness and hit bot walls (§11.3).
- **Remediation**: Implement federated registry expansion in `src/crawler/vpm_discovery.ts` or crawler loop:
  1. **Strict Raw Repository Manifest Scoping**: Ingest authoritative package registries and community manifests (e.g., ALCOM community repository listings, direct `index.json`, and `vpm-manifest.json` feeds from verified creator documentation and Git hosting providers like GitLab and Codeberg).
  2. **Validated Manifest Schemas**: Restrict parser strictly to authoritative VRChat Community Package (VCC) repository manifests (`index.json` adhering to VPM v1/v2 schemas with `packages: { [packageId]: { versions: { [semver]: { name, url, ... } } } }`) and repository-root `vpm-manifest.json`.
  3. **Explicit Deferral of Aggregator Adapters**: Community directory aggregator front adapters (such as `vpm-catalog.vercel.app`, `vpm.site`, or secondary aggregator scrapers) are explicitly deferred to a Post-v1.0 research milestone to avoid "aggregator-of-aggregators" instability, cache staleness, attribution dilution, and legal friction.
  4. Validate VPM reverse-DNS identifiers (`com.author.tool`) and semantic versions (SemVer 2.0.0) prior to enqueueing into the `frontier`.
- **Cascading Documentation Changes**:
  - [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md): Update Section 2 to detail federated VPM seed registries, schema validation invariants, and format requirements.
  - [`AGENT.md`](AGENT.md): Document VPM federated discovery operational parameters.
- **Acceptance Criteria**: Federated VPM discovery ingests external manifests and enqueues valid package targets without unindexed web crawling or secondary aggregator scraping.

#### Task 5.2: VRCArena Bilateral Federation Adapter (Canonical Task 3)
- **Priority**: Ecosystem Integration | **Complexity**: Very High (3.5 hours) | **Traceability**: CANON-3, G-6, LEGAL §5.2(f), PLATFORM-MATRIX §2.6
- **Files**: `src/drivers/vrcarena.ts` (future adapter), [`src/crawler/index.ts`](src/crawler/index.ts)
- **Problem**: Evaluating VRCArena for discovery. Direct HTML DOM scraping is fragile, strains community volunteer infrastructure, and introduces noise.
- **Remediation**:
  1. Reject automated HTML DOM scraping.
  2. Implement an open-source adapter querying VRCArena's open GraphQL/REST API or static dataset dumps within `robots.txt` limits and polite pacing.
  3. Apply strict category whitelisting to ingest only developer toolchains, shaders, and scripts, filtering out unverified avatar re-textures.
- **Cascading Documentation Changes**:
  - [`docs/PLATFORM-MATRIX.md`](docs/PLATFORM-MATRIX.md): Update Section 2.6 status from planned to active federated adapter.
  - [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md): Document VRCArena bilateral federation rules in Section 2.
  - [`AGENT.md`](AGENT.md): Add VRCArena federation driver specification.
- **Acceptance Criteria**: Adapter successfully parses VRCArena feed within robots.txt limits, extracts toolchains with source attribution, and ignores non-toolchain assets without scraping HTML pages.

#### Task 5.3: Avatar Cosmetics Taxonomy Isolation & Base-Avatar Association (Canonical Task 2)
- **Priority**: Catalog Expansion | **Complexity**: Very High (4 hours) | **Traceability**: CANON-2, G-2, LEGAL §11.4, DISCOVERY_RULES §2, §3.3
- **Files**: [`src/crawler/projection.ts`](src/crawler/projection.ts), [`src/db.ts`](src/db.ts), [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md)
- **Problem**: Reconsidering avatar cosmetics (clothing, hair) discovery introduces explosive dimensionality and boilerplate vocabulary, causing severe SimHash-64 ($k \le 3$) false merges against toolchains.
- **Remediation**:
  1. Build an isolated `cosmetics` taxonomy tier in `canonical_packages` with mandatory base avatar tagging (`target_avatar`: e.g. Kikyo, Manuka, Shinano, Selestia).
  2. Anti-Merge Guard: Prevent SimHash near-duplicate clustering between toolchain packages and cosmetics.
  3. Require exact author and matching base-avatar constraints before evaluating Hamming distances for cosmetics.
- **Cascading Documentation Changes**:
  - [`LEGAL.md`](LEGAL.md): Section 11.4 confirms implementation of isolated avatar cosmetics taxonomy.
  - [`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md): Add Section 3.7 defining base avatar extraction regexes and cosmetics taxonomy isolation.
  - [`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md): Document decoupled cosmetics catalog projection.
- **Acceptance Criteria**: Cosmetics listings are tagged with target avatar mesh and isolated from toolchains; SimHash false merges between distinct clothing assets are eliminated.

---

### Post-v1.0 Milestone: Decentralized Edge Node Ingestion & Provenance Architecture

#### Task 5.4: Canonical Network Node Provenance, Edge Ingestion Gateway & Delisting Propagation
- **Priority**: Post-v1.0 Network Scaling & Decentralized Governance | **Complexity**: Architectural Milestone (6+ hours) | **Traceability**: CANON-6, CR-18, G-26, LEGAL §1.4, §9.6
- **Files**: [`src/db.ts`](src/db.ts), [`src/sync/index.ts`](src/sync/index.ts), [`src/server/index.ts`](src/server/index.ts), `workers/ingestion_gateway/` (future service)
- **Problem & Security Rationale for Deferral**:
  - In v1.0, the crawler operates strictly in a single-node, maintainer-operated mode. `src/sync/index.ts` pushes incremental deltas to Cloudflare D1/R2 using administrative master credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).
  - Distributing write access to external contributor nodes in v1.0 would require sharing master Cloudflare API keys or opening unrestricted D1 HTTP endpoints, exposing the canonical database to catastrophic security vulnerabilities (database wiping, credential leakage, and untrusted spam injection).
  - Consequently, decentralized contributor features are postponed beyond v1.0, preserving a secure single-node perimeter during Phase 1-5.
- **Post-v1.0 Architecture Specification**:
  1. **Cloudflare Worker Ingestion Gateway (`POST /v1/ingest/batch`)**:
     - Deploy a dedicated edge Worker Gateway that terminates external contributor traffic without exposing D1 master credentials.
     - Contributor nodes register with an Ed25519 public key. Ingestion requests must include cryptographic headers (`X-Node-Id`, `X-Node-Signature`, `X-Batch-Id`).
  2. **Asynchronous Validation & Quarantine Pipeline**:
     - The gateway pushes submitted batches into Cloudflare Queues for asynchronous schema validation, rate-limiting, and anomaly detection prior to committing to D1.
  3. **Database Provenance Tracking Columns**:
     - Extend SQLite schema in `src/db.ts` to add `contributor_node_id TEXT`, `crawl_signature TEXT`, and `batch_id TEXT` to `entities` and `canonical_packages` (CR-18, G-26, LEGAL §1.4).
  4. **Automated Delisting Propagation Broadcast**:
     - When a package is marked `delisted` on the canonical edge, downstream sync passes broadcast delist directives across nodes to prevent recrawl resurrection.
  5. **Decentralized Transition & Readiness Gates**:
     - Before any external untrusted node is authorized to push records to the canonical network, all five gates must pass:
       - *Gate 1 (Single-Node Baseline Stability)*: Phases 1-5 must be fully verified and operational on maintainer hardware with zero edge-sync data drops.
       - *Gate 2 (Zero Credential Leakage)*: The Cloudflare Worker Ingestion Gateway must be active, strictly isolating master D1/R2 API keys from external contributors.
       - *Gate 3 (Cryptographic Provenance)*: Node registration with Ed25519 keypairs must be enforced on all incoming batch submissions.
       - *Gate 4 (Schema Migration)*: Provenance columns must be migrated in both local SQLite and Cloudflare D1 tables.
       - *Gate 5 (Delisting Synchronization)*: Automated delisting broadcast directives must be proven to propagate and suppress recrawls across distributed nodes.
- **Cascading Documentation Changes**:
  - [`LEGAL.md`](LEGAL.md): Retains Section 1.4 and Section 2.3 decentralized network ownership model as the target architecture, noting implementation is queued for Post-v1.0.
  - [`docs/EDGE_SYNC_AND_SCALE_GUIDE.md`](docs/EDGE_SYNC_AND_SCALE_GUIDE.md): Add Section 4 detailing future multi-node Worker Ingestion Gateway design.
  - [`DELEGATES.md`](DELEGATES.md): Clarify that v1.0 operations are strictly single-node maintainer runs.
- **Acceptance Criteria**: Submitted edge records contain cryptographically verifiable node provenance; Worker Ingestion Gateway validates signatures without exposing D1 master credentials; delisting directives propagate across nodes to suppress recrawl.

---

## 3. Cascading Documentation Change Summary Matrix

Whenever any task above is addressed or merged, the following documentation files must be synchronized:

| Documentation File | Triggering Tasks | Required Cascading Modifications (Targeted Sections) |
| :--- | :--- | :--- |
| **[`LEGAL.md`](LEGAL.md)** | Tasks 1.2, 2.2, 3.1, 3.2, 4.2, 5.3, Post-v1.0 Milestone | Section 10.1 & 10.7 (in-band notice via `VRC-Packages-Terms-Of-Use` and `catalog_metadata`); Section 10.6 & 9.4 (distinguish administrative curation bearer auth from unauthenticated proof-based opt-out); Section 7.2(c) (pure media pointers); Section 11.4 (cosmetics taxonomy isolation); Section 2.3 & 1.4 (node provenance and clean factual timestamps). |
| **[`AGENT.md`](AGENT.md)** | Tasks 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.6, 2.7, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2 | Section 1 ("Environment Variables & Configuration") — `API_SECRET_TOKEN`; Section "Security Invariants & Admin Access Control"; Section "Test Suite Isolation & Fixture Contracts" (`:memory:`); Section "Crawler Loop Invariants & Autonomous Fault Recovery"; Section "Database Schema Invariants, Ground Truth Architecture & Stale DB Policy" (Task 4.1); Section "API Gateway Surface". |
| **[`DELEGATES.md`](DELEGATES.md)** | Tasks 1.1, 2.1, 2.2, 2.5, 2.6, 2.7, 3.4, 4.1, Post-v1.0 Milestone | Section 4 ("Environment & Secret Configuration Template") — `API_SECRET_TOKEN` CSPRNG generation; Section 2 (CLI redirection); Section 3 ("Database Topography & Stale DB Policy"); Section 5 ("Testing, CI/CD & Testbed Isolation"); Section 8 ("Fault Recovery Runbook & Elimination of Manual Batch Scripts"); Section 5 (watermark recovery). |
| **[`README.md`](README.md)** | Tasks 1.1, 1.2, 1.3, 2.1, 4.2 | Section "API Gateway Surface" (add `GET /` and terms headers); Section "Downstream Developer Integration & Terms of Use"; Section "System Architecture & Air-Gapped Boundaries" (Task 4.2). |
| **[`docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md`](docs/ARCHITECTURE_AND_COMPLIANCE_GUIDE.md)** | Tasks 1.2, 2.2, 2.7, 3.1, 3.2, 4.1 | Section 1 & Section 3 (in-band terms notice `VRC-Packages-Terms-Of-Use`, hybrid media streaming proxy `/v1/media/stream`, storefront bio-token delisting, driver circuit breaker autonomy, and clean canonical ground-truth schema). |
| **[`docs/PLATFORM-MATRIX.md`](docs/PLATFORM-MATRIX.md)** | Tasks 2.3, 3.3, 5.2 | Section 2.2 & 2.4 (Gumroad/Jinxxy perimeter defense, Turnstile detection); Section 2 (conditional requests ETag/If-Modified-Since); Section 2.6 (VRCArena bilateral federation). |
| **[`docs/DISCOVERY_RULES.md`](docs/DISCOVERY_RULES.md)** | Tasks 1.4, 1.5, 1.6, 2.3, 2.4, 5.1, 5.3 | Section 4.2 (timestamp extraction NULL rules); Section 2 (VPM 7-day re-seeding staleness); Section 7.1 (YouTube embed filters); Section 3.6 (Turnstile halt rules); Section 3.5 (NFKC/CJK bracket normalization); Section 3.7 (cosmetics mesh tagging). |
| **[`docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md`](docs/COMPREHENSIVE_SYSTEM_ARCHITECTURE.md)** | Tasks 1.2, 1.4, 2.4, 2.7, 3.1, 3.2, 4.1, 4.4, 5.3 | Section 2.1 ("Canonical Ground-Truth Database Schema & Dist Stale DB Policy", `catalog_metadata`); Section 2.2 (incremental DSU clustering & SimHash); Section 3.4 ("Fault Tolerance, Autonomous Circuit Breakers & Dead-Letter Queue Architecture"); Section 3.2 (creator opt-out workflow). |
| **[`docs/REPORTING_SCHEMAS.md`](docs/REPORTING_SCHEMAS.md)** | Tasks 1.2, 1.3, 2.2, 3.1, 3.2, 4.3 | Section 1 ("Root Discovery Route & HTTP Header Invariants `VRC-Packages-Terms-Of-Use`"); Section 5 ("Security, Bearer Token Specification & Quarantined Processing"); Section 4 (`POST /v1/opt-out` bio-token schema); Section 6 (active Schema 5 `POST /v1/telemetry` route). |
| **[`docs/EDGE_SYNC_AND_SCALE_GUIDE.md`](docs/EDGE_SYNC_AND_SCALE_GUIDE.md)** | Tasks 3.2, 3.4, Post-v1.0 Milestone | Section 2 (pure media pointers); Section 3 (Cloudflare D1 watermark epoch recovery); Section 4 (future Worker Ingestion Gateway). |
| **[`docs/OPERATIONS_AND_CHECKLIST.md`](docs/OPERATIONS_AND_CHECKLIST.md)** | Tasks 1.1, 1.3, 2.2, 2.5, 2.6, 2.7, 4.4 | Section 1 ("Pre-Flight Operational Checklist"); Section 2 ("Health and Discovery Verification"); Section 3 ("Curator Report Ingestion & Quarantined Verification"); Section 4 ("Operational Self-Healing & Circuit Breaker Diagnostics"); Section 5 ("Log Rotation"); Section 6 ("Test Suite Architecture & Isolated Verification"). |
| **[`docs/topics/10_legal_jurisprudence_contractual_assent_and_search_indexing.md`](docs/topics/10_legal_jurisprudence_contractual_assent_and_search_indexing.md)** | Tasks 1.2, 3.1, 3.2 | Document in-band terms header notice under *Register.com v. Verio*, ephemeral storefront bio-token delisting under unauthenticated guidelines, and hybrid proxying under Server Test circuit split. |
| **[`package.json`](package.json)** | Task 2.7 | Permanently remove obsolete manual batch recovery scripts (`requeue:gumroad` and `requeue:media`). |

---

## 4. Architectural Blueprint & The VRChat "Google Indexer" Specification

### 4.1 The Five Core Subsystems of the VRChat Indexer
The application is engineered to achieve the functional equivalent of a specialized "Google Indexer" tailored for the VRChat Package & Asset Ecosystem, operating as an unauthenticated discovery utility rather than a competitor marketplace:

1. **Transport & Discovery Layer**:
   - RFC 9309 compliant `robots.txt` parser with 24h caching.
   - Host-isolated AIMD rate limiter (1.5-5.0s on closed storefronts) with decorrelated jitter.
   - Zero-Bypass perimeter protocol: treats Turnstile challenges (`HTTP 200` with challenge DOM or `403`) as an immediate access refusal; halts operations on that host.
   - Federated registry seeding (`discover_vpm.ts` via raw repository manifests/ALCOM), eliminating open-web unindexed spiders. Community directory aggregator front adapters deferred to Post-v1.0 research.
2. **CQRS Raw Observation Lake (`entities`)**:
   - Immutable event log of raw network fetches.
   - Extraction strictly limited to factual metadata (package names, reverse-DNS identifiers, semver numbers, pricing, compatibility flags, and Source Storefront URLs).
   - 256-character functional snippet truncation for product descriptions (*Authors Guild v. Google* doctrine).
3. **Entity Resolution & Knowledge Graph (`src/crawler/projection.ts`)**:
   - Disjoint-Set Union (DSU) graph clustering linking BOOTH listings, Western Gumroad mirrors, GitHub repositories, and VPM package manifests.
   - 64-bit SimHash near-duplicate detection augmented with CJK punctuation normalization (NFKC, bracket stripping `【...】`) and character 2-gram shingling.
   - Strict isolation of standalone avatar cosmetics (clothing, hair) into a separate taxonomy tier with required base avatar associations (Kikyo, Manuka, Shinano, Selestia) to prevent toolchain catalog pollution.
4. **Pure Media Pointer Pipeline (`src/utils/image_proxy.ts`)**:
   - Hybrid Media Delivery Architecture: Delivers direct origin Source CDN URLs in API feeds (*Perfect 10 v. Amazon* Server Test).
   - Provides an ephemeral in-memory streaming proxy endpoint (`GET /v1/media/stream?url=...`) to allow downstream client applications to bypass storefront hotlink/Referer blocks without storing BLOBs on disk (G-1).
   - Deprecates local SQLite `media_cache.webp_data` BLOB storage (CR-19, CR-21, G-29) and Cloudflare R2 binary hosting.
   - Emits client-side ephemeral caching directives (`Cache-Control: private, max-age=86400`).
5. **Autonomous Governance & Creator Rights (`src/crawler/steering.ts`, `src/server/index.ts`)**:
   - Non-scraping delisting interface (`POST /v1/opt-out`) supporting DNS TXT verification (`vrc-opt-out=<vendor-id>`), signed Git commits, and on-demand ephemeral storefront bio token verification (`#vrc-opt-out-<vendor-id>`) for non-domain shop creators (Task 3.1).
   - Quarantined Schema 4 curation reports (`needs_review` buffer) requiring `API_SECRET_TOKEN` bearer authentication and consensus thresholds before permanent lifecycle mutations (Task 2.2).
   - Automatic injection of `VRC-Packages-Terms-Of-Use: <url>` headers on all API responses (RFC 6648, RFC 9110) to establish enforceable contractual notice for downstream consumers (Task 1.2).
   - Single-Node v1.0 Maintainer Model: Keeps the crawler strictly single-node and maintainer-operated to safeguard Cloudflare administrative credentials, deferring decentralized multi-node contributor ingestion to a Post-v1.0 Worker Ingestion Gateway.

### 4.2 Blueprint Audit of Critical Vulnerabilities
1. **The Cloudflare Edge Sync & Downstream API Trap**:
   - *Risk*: Backend operates as a logged-out guest, but API gateway (`vrc-server.exe`) serves raw data globally. Downstreams that bypass storefronts expose the pipeline to tortious interference claims.
   - *Mitigation*: Truncate descriptions to 256 chars, mandate direct outbound storefront links, and inject `VRC-Packages-Terms-Of-Use`.
2. **The Media Cache & Perceptual Hashing (pHash)**:
   - *Risk*: Re-hosting WebP images on R2/SQLite creates direct copyright infringement exposure under the Server Test split (*Perfect 10* vs *Goldman*).
   - *Mitigation*: Drop `webp_data BLOB`, retain only pHash-64/blurhash for deduplication, deliver direct origin CDN URLs by default, and provide an ephemeral in-memory streaming proxy without disk persistence.
3. **Regional Discrepancies (BOOTH / Japanese Law)**:
   - *Risk*: Pixiv Inc. operates under Japanese Copyright Act Art. 30-4 and 47-5, which contain provisos against prejudicing copyright owners' interests. Pixiv Master Terms forbid automated data extraction.
   - *Mitigation*: Polite human pacing (1.5-5.0s), logged-out execution, prompt honor of delisting requests.

### 4.3 Operational Mitigations to Preserve Compliance
1. **Submission-First Registry**: Prioritize verified creator submissions and community repository manifests over blind web spiders.
2. **Target Open Graph `<head>` Metadata**: Query social preview tags (`og:title`, `og:image`, `og:description`) rather than deep internal DOM layouts.
3. **Aggressive Caching & Conditional Requests**: Send `If-None-Match` and `If-Modified-Since` headers to leverage lightweight `HTTP 304 Not Modified` responses.
4. **Transparent Bot Identity**: Declare `User-Agent: VRCDiscoveryBot/1.0 (+https://github.com/SlamTheDragon/vrc-package-crawler)` with contact info and automated opt-out.
5. **API-First Fallbacks**: Prioritize official APIs (GitHub API, itch.io API, ALCOM VPM manifests) before HTML scraping fallbacks.

---

## 5. Platform Terms of Service Analysis & Contractual Realities

*(Preserving 100% of original contractual clauses and operational analyses without context loss)*

### 5.1 Jinxxy Terms of Service
The Jinxxy Terms of Service do not contain any exception for "metadata-only" crawling, setting a blanket restriction on automated data collection:
- **Section 8.2 (Prohibited Conduct)**: Prohibits the use of automated systems, bots, or scrapers without express written permission, and forbids systematically gathering data to compile collections, directories, or databases.
- **Section 23 (API Usage)**: All automated platform access must use the official API unless written permission has been obtained. Unauthorized asset scrapers and crawlers are strictly prohibited.
- **Section 6.7.1 (AI Training Prohibition)**: Automated downloading or scraping of any platform content for machine learning or AI model training is strictly forbidden.
- *Operational Stance*: Jinxxy crawling carries an "Unresolved Contractual Risk". Mitigated by strict rate limits, non-commercial indexing, and zero full-asset extraction.

### 5.2 Gumroad Terms of Service
The Gumroad Terms of Service restrict automated data extraction across web pages:
- **Section 14(e) (Prohibited Scraping & Public Search Exception)**: Prohibits using spiders, robots, or scrapers to extract data, with an express exception for public search engine operators constructing public search indices. Gumroad's `robots.txt` explicitly publishes a complete sitemap of storefronts.
- **Section 14(x) & Section 15 (Harvesting Information)**: Restricts collecting information about users (creator details, email addresses) without written permission.
- **Section 14(xiii) (Harmful Automated Access)**: Automated access that strains platform infrastructure is treated as a breach.
- *Operational Stance*: Gumroad indexing relies directly on Section 14(e) public search directory exceptions and sitemap adherence.

### 5.3 BOOTH / pixiv Master Terms of Use
BOOTH is governed by the umbrella terms of pixiv Inc. (Japan):
- **Article 14, Items 17 & 18 (Server Load & Mechanical Actions)**: Bans actions that impose excessive server loads, as well as mechanically executing high-volume automated requests within short time windows.
- **Article 14, Items 3 & 4 (External Use & Data Analysis)**: Prohibits extracting platform data for external commercial purposes without permission, as well as unauthorized data mining or automated machine learning.
- **Developer Guidelines (Crawler Prohibition)**: Explicitly restricts crawlers or automated programs from aggregating works or platform content.
- *Operational Stance*: Because BOOTH does not offer a public REST API for catalog crawling, access relies on unauthenticated, logged-out guest browsing, conservative human delays (1.5-5.0s), and strict honor of Japanese Copyright Act Art. 47-5 limitations.

### 5.4 itch.io Terms of Service
The itch.io Terms of Service govern game and asset directory access:
- **Section 3 (Acceptable Use)**: Forbids "soliciting, harvesting or collecting information about others."
- **Server Performance**: Prohibits behavior that degrades platform performance or interferes with other users' enjoyment.
- **API Alternative**: itch.io supplies an official developer API for querying store and game metadata.
- *Operational Stance*: Utilize official APIs wherever available; keep HTML requests polite and strictly non-disruptive.

---

## 6. Legal Precedents, Fair Use, & "Search Engine" Defense Theories

*(Preserving 100% of case citations, precedents, and comparative legal analysis)*

Operating a public metadata directory alters the legal posture from unauthorized commercial scraping to public indexing and search directory jurisprudence:

### 6.1 The Four Pillars of the Search Directory Defense
1. **Facts vs. Copyright (*Feist*, *hiQ*, *Meta v. Bright Data*)**:
   - Under US copyright law (*Feist Publications, Inc. v. Rural Telephone Service Co.*, 499 U.S. 340 (1991)), raw facts, package names, prices, and version numbers are uncopyrightable.
   - Crawling publicly accessible, logged-out web data without bypassing authentication barriers does not violate the Computer Fraud and Abuse Act (CFAA) (*hiQ Labs, Inc. v. LinkedIn Corp.*, 31 F.4th 1180 (9th Cir. 2022); *Meta Platforms, Inc. v. Bright Data Ltd.*, 2024 WL 245903 (N.D. Cal. 2024)).
   - Storing creative descriptions is strictly limited to 256-character functional summaries (*Authors Guild v. Google, Inc.*, 804 F.3d 202 (2d Cir. 2015)).
2. **Robots Exclusion Protocol (RFC 9309)**:
   - While `robots.txt` is an advisory operational preference rather than an access contract, respecting RFC 9309 signals demonstrates good faith and negates intentional platform harm.
3. **User-Agent Transparency (RFC 9110)**:
   - The crawler declares `User-Agent: VRCDiscoveryBot/1.0 (+https://github.com/SlamTheDragon/vrc-package-crawler)` rather than masquerading as a residential user, allowing platform firewalls to govern access.
4. **Rate Limiting & Trespass to Chattels (*Hamidi*, *Bidder's Edge*)**:
   - Under *Intel Corp. v. Hamidi*, 30 Cal. 4th 1342 (2003) and *eBay, Inc. v. Bidder's Edge, Inc.*, 100 F. Supp. 2d 1058 (N.D. Cal. 2000), crawlers that do not burden or impair server operations do not commit digital trespass. Strict Poisson pacing ensures zero platform degradation.

### 6.2 The Server Test Circuit Split (*Perfect 10* vs. *Goldman v. Breitbart*)
- **Ninth Circuit (*Perfect 10, Inc. v. Amazon.com, Inc.*, 508 F.3d 1146 (9th Cir. 2007))**: Under the Server Test, displaying an image via in-line linking does not infringe the copyright display right unless the image is hosted on the defendant's own physical server.
- **Second Circuit & SDNY (*Goldman v. Breitbart News Network, LLC*, 273 F. Supp. 3d 496 (S.D.N.Y. 2018); *Nicklen v. Sinclair Broadcast Group, Inc.*, 551 F. Supp. 3d 188 (S.D.N.Y. 2021))**: Explicitly rejected the Server Test, holding that embedding can violate display rights regardless of server hosting location.
- **Legal Posture for `vrc-package-crawler`**: To minimize exposure under both circuits, the crawler deprecates persistent SQLite `webp_data` BLOB storage (CR-19/CR-21), relies primarily on *Kelly v. Arriba Soft Corp.*, 336 F.3d 811 (9th Cir. 2003) transformative visual indexing, and supplies direct origin URL pointers.

### 6.3 Citations: Search Engine Defense & Scraping Jurisprudence
- [1] Ben Bernard, *Web Scraping and Crawling Legality* (https://benbernardblog.com/web-scraping-and-crawling-are-perfectly-legal-right/)
- [2] Cloro Dev, *Website Scraping Legal Analysis* (https://cloro.dev/blog/website-scraping-legal/)
- [3] UC Santa Barbara Library, *Ethics and Legality of Web Scraping* (https://carpentry.library.ucsb.edu/2024-02-27-ucsb-webscraping/04-Ethics-Legality-Webscraping/index.html)
- [4] Cloro Dev, *Judicial Precedents in Web Extraction* (https://cloro.dev/blog/website-scraping-legal/)
- [5] T.J. Waterman, *Web Scraping Legal Boundaries* (https://medium.com/@tjwaterman99/web-scraping-is-now-legal-6bf0e5730a78)
- [6] DataImpulse, *Robots.txt and AI Crawlers* (https://dataimpulse.com/blog/robots-txt-ai-crawlers/)
- [7] ByteTunnels, *Is robots.txt Legally Binding?* (https://bytetunnels.com/posts/is-robots-txt-legally-binding-scraping-law-explained/)
- [8] DataImpulse, *Is Web Scraping Legal?* (https://dataimpulse.com/blog/is-web-scraping-legal/)
- [9] ProxyGuide, *Robots.txt Controls and Scope* (https://www.reddit.com/r/ProxyGuide/comments/1vtp9fj/robotstxt_what_it_actually_controls_whether_it_is/)
- [10] DataHut, *Legal Boundaries of Data Scraping* (https://www.blog.datahut.co/post/is-web-scraping-legal/)
- [11] Kirkland & Ellis LLP, *Searching for Web Crawling's Legal Boundaries* (https://www.kirkland.com/publications/article/2017/05/searching-for-web-crawlings-legal-boundaries)

---

## 7. Downstream Free API Distribution & Contract Breach Risks

*(Preserving 100% of contractual analysis, case risks, and architectural constraints)*

### 7.1 Free API Distribution Model
Serving crawled metadata via a free API to downstream developers does not eliminate contractual risk, but shifts the legal dynamics:
- **Logged-Out Public Good Indexing**: Providing a free directory that redirects traffic back to source storefronts eliminates commercial theft claims.
- **Browsewrap Notice Requirements**: Enforcing downstream covenants (anti-AI training, 256-char limits, mandatory deep links) requires in-band notice (`VRC-Packages-Terms-Of-Use`, RFC 6648/RFC 9110) and versioned `catalog_metadata` tables under *Register.com, Inc. v. Verio, Inc.*, 356 F.3d 393 (2d Cir. 2004).
- **Pass-Through Authentication**: Downstream applications managing user accounts, favorites, and bookmarks must store user data locally and must never ping host platforms on behalf of users (*Meta v. Bright Data*; *hiQ v. LinkedIn*).

### 7.2 Citations: Downstream API Distribution & Breach Risks
- [1] Lowenstein Sandler LLP, *Meta v. Bright Data Ruling Implications* (https://www.lowenstein.com/news-insights/publications/client-alerts/meta-v-bright-data-ruling-has-important-implications-for-webscraping-activities-by-investment-advisers-im)
- [2] Bright Data, *Court Rules in Favor of Bright Data in Meta Case* (https://brightdata.com/blog/web-data/court-rules-in-favor-of-bright-data-in-meta-v-bright-data-case)
- [3] Farella Braun + Martel LLP, *Major Decision Affects Scraping Law* (https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/)
- [4] Quinn Emanuel Urquhart & Sullivan, LLP, *Meta v. Bright Data Summary Judgment* (https://www.quinnemanuel.com/the-firm/news-events/client-alert-what-does-the-meta-v-bright-data-summary-judgment-ruling-mean-for-web-scraping/)
- [5] Quinn Emanuel, *Significant Decision for Web Scraping Industry* (https://www.quinnemanuel.com/the-firm/news-events/client-alert-meta-v-bright-data-significant-decision-for-web-scraping-industry/)
- [6] Wikipedia, *hiQ Labs v. LinkedIn* (https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn)
- [7] Evomi, *hiQ Labs vs LinkedIn Analysis* (https://evomi.com/blog/hiqlabs-vs-linkedin-case)
- [8] Justia Law, *hiQ Labs, Inc. v. LinkedIn Corp., 31 F.4th 1180* (https://law.justia.com/cases/federal/appellate-courts/ca9/17-16783/17-16783-2019-09-09.html)
- [9] ZwillGen PLLC, *hiQ LinkedIn Breach of Contract Analysis* (https://www.zwillgen.com/alternative-data/hiq-linkedin-breach-contract-cfaa-trial/)
- [10] Parse.bot, *itch.io Developer API Integration* (https://parse.bot/marketplace/a926b5dc-5a9f-4d3d-9d96-1bb80b22630b/itch-io-api)

---

## 8. Code-Reality Gap Index (CR-1 through CR-30)

The following index records every confirmed gap between documentation/architectural claims and physical source code, with verified line-level citations:

| ID | Architectural Claim | Production Code Reality | Citations & Line Evidence |
| :--- | :--- | :--- | :--- |
| **CR-1** | Adaptive Poisson scheduler tunes `next_fetch_at` based on mutability. | `requeueStaleUrls()` is active, but `adjustAfterFetch()` has **zero callers**; `db.markStatus()` hardcodes rigid `+86400s`. | `src/utils/poisson_scheduler.ts:49`, `src/crawler/index.ts:760,955`, `src/db.ts:707` |
| **CR-2** | Schema 4 delisting requires `CRAWLER_API_TOKEN` bearer auth. | Code reads `process.env.API_SECRET_TOKEN`. Unset `.env` bypasses auth; auto-delisting executes without human oversight. | `src/server/index.ts:130,196-204`, `src/crawler/steering.ts`, `AGENT.md:310` |
| **CR-3** | Full-wipe projection rebuilds catalog without edge sync data loss. | `DELETE FROM canonical_packages` resets rowids; watermark check fails if rebuilt table $\ge$ old watermark, permanently dropping rows 1..watermark from D1. | `src/crawler/projection.ts`, `src/sync/index.ts:128-133` |
| **CR-4** | VPM re-seeding keeps discovery queue populated indefinitely. | Gate condition `done < 50` halts re-seeding permanently once 50 URLs complete across daemon sessions. | `src/crawler/index.ts:82` |
| **CR-5** | `origin_created_at` follows 3-state rubric (`NULL` when unknown). | Ingestion drivers and projection previously substituted local crawl times when upstream date was absent. | `src/crawler/projection.ts`, `src/drivers/*` |
| **CR-6** | YouTube embed URLs rejected at frontier and never enqueued as images. | `jinxxy.ts` iterates media without type filtering; `image_proxy.ts` `skipPatterns` lacks YouTube domains, causing Sharp worker errors. | `src/drivers/jinxxy.ts:214-224`, `src/utils/image_proxy.ts:740-745` |
| **CR-7** | Conditional headers (`ETag`/`If-Modified-Since`) enable `HTTP 304`. | `github.ts` captures ETag but never sends `If-None-Match`. No driver sends `If-Modified-Since`. `304` path is 100% dead code. | `src/drivers/github.ts:174-177` |
| **CR-8** | Creators can submit automated delisting requests via opt-out API. | `db.registerOptOut()` exists in `src/db.ts` but has zero API routes in `src/server/index.ts` and zero CLI callers. | `src/db.ts:551-578`, `src/server/index.ts` |
| **CR-9** | Documentation reflects accurate test suite metrics. | All 12 legacy test files in `tests/` were deleted by operator to eliminate false positives and codebase dislocation; clean-slate testbed with `:memory:` is queued under Task 2.6. | Operator testbed deletion; `tests/` directory |
| **CR-10**| `AGENT.md` and `DELEGATES.md` serve decoupled agent/SRE roles. | Previously identical SHA-256 duplicates. [RESOLVED 2026-09-23]: Decoupled into dedicated agent contract and SRE runbook. | `AGENT.md`, `DELEGATES.md` |
| **CR-11**| `canonical_packages` schema is fully unified with 2 URL columns (`url`, `vcc_url`). | Redundant flat columns (`github_url`, `booth_url`, etc.) purged; mirrors decoupled to `package_fronts`; `title_override` dropped for `name_override`; `src/tools/` scripts permanently deleted (Task 1.4 & Task 4.1). | `src/db.ts`, `src/crawler/projection.ts`, `src/sync/exporter.ts`, `src/sync/index.ts` |
| **CR-12**| Logs are session-prefixed and rotated/compressed daily. | `src/logger.ts` creates bare write streams without session prefixes, rotation triggers, or Gzip compression sweeps. | `src/logger.ts:16-18,1-92` |
| **CR-13**| Runbooks instruct running `.\dist\vrc-crawler.exe status/recrawl/stop`. | `src/crawler/index.ts` has no CLI routing; running with args crashes with `ProcessLock`. IPC dispatched via `vrc-monitor.exe`. | `src/crawler/index.ts:970-1030`, `src/monitor/index.ts:1-439` |
| **CR-14**| Downstream covenants in `LEGAL.md` §10 are technically presented. | `src/server/index.ts` returns responses without `VRC-Packages-Terms-Of-Use` header (RFC 6648), undermining browsewrap contract notice. | `src/server/index.ts:112-280`, `LEGAL.md:10.1` |
| **CR-15**| Cloudflare Turnstile challenges detected and isolated from products. | Drivers parse Turnstile `HTTP 200` challenge HTML as product content, accelerating Poisson crawl loops into IP bans. | `src/drivers/gumroad.ts:80-120`, `src/drivers/jinxxy.ts:75-115` |
| **CR-16**| Creators can submit non-scraping delisting proofs via API. | `POST /v1/opt-out` endpoint does not exist on API gateway. | `src/server/index.ts`, `src/db.ts:551-578` |
| **CR-17**| SimHash converges across Japanese BOOTH and Western mirrors. | Full-width CJK brackets (`【...】`) and author tags must be normalized and shingled directly in sanitizer and projection. | `src/utils/sanitizer.ts`, `src/crawler/projection.ts` |
| **CR-18**| Canonical network verifies provenance of contributed metadata. | SQLite schema lacks `contributor_node_id`, `signature`, and `batch_id` columns, preventing bad node isolation. | `src/db.ts`, `src/sync/index.ts` |
| **CR-19**| Media proxy strictly attaches URLs as pointers without storing binaries. | Maintainer policy mandates pure origin URL pointers; image transcoding and caching in SQLite conflicts with policy. | `src/utils/image_proxy.ts`, `LEGAL.md:7.2(c)` |
| **CR-20**| Conditional requests prevent redundant transfers across all drivers. | No driver transmits `If-None-Match` or `If-Modified-Since`. Payload downloads are 100% redundant on unchanged pages. | `src/drivers/github.ts:174-177`, `src/drivers/booth.ts`, `src/drivers/gumroad.ts` |
| **CR-21**| `media_cache` avoids persistent storage of images in SQLite. | Raw WebP buffers dropped; `media_cache.webp_data` BLOB eliminated; pure origin URLs exported without binary payload. | `src/utils/image_proxy.ts`, `src/server/index.ts`, `src/sync/exporter.ts`, `src/db.ts` |
| **CR-22**| SQLite export `vrc_catalog.db` supplies in-band notice of `LEGAL.md`. | Exporter now creates `catalog_metadata` table recording terms URL, SHA-256 digest, and license reference. | `src/sync/exporter.ts` |
| **CR-23**| Headless API server supplies root discovery route (`GET /`). | Requesting `GET /` returns `404 Not Found`; no root metadata document exists to advertise terms or schema versions. | `src/server/index.ts:140-388` |
| **CR-24**| `robots.txt` compliance is treated as voluntary operational signal. | RFC 9309 establishes robots rules represent preferences, not access authorization. Followed voluntarily without claiming contract license. | IETF RFC 9309 Sec 1; `LEGAL.md:5.1(a),6.1` |
| **CR-25**| 256-char description limit is an operational risk control. | *Authors Guild v. Google* evaluated transformative snippet indexing without setting a rigid numerical safe harbor. | `LEGAL.md:2.2,10.4(b)`; *Authors Guild*, 804 F.3d at 224 |
| **CR-26**| *Meta v. Bright Data* precedent is fact- and contract-specific. | *Bright Data* does not establish universal authorization to scrape public websites; framed as calibrated precedent. | `LEGAL.md:5.1(b)`; *Meta v. Bright Data*, 2024 WL 245903 |
| **CR-27**| AGPLv3 source code compilation decoupled from catalog terms. | AGPLv3 grants unconditional rights to compile/run code. Decoupled into Layer A (code), Layer B (compilation), Layer C (facts). | `LEGAL.md:Preamble,1.3,18.4`; AGPLv3 Sec 10 |
| **CR-28**| Philippine RA 10173 and GDPR legitimate interest frameworks separated.| Philippine DPA Section 12 has distinct statutory criteria from GDPR Article 6(1)(f); GDPR requires Article 3 territorial scope. | `LEGAL.md:8.2,8.3,8.6`; RA 10173 Sec 12; GDPR Art 3 |
| **CR-29**| Delisting 24-48h response target framed as voluntary policy. | Project is an individual non-commercial open-source utility; response target is an operational policy, not a commercial SLA. | `LEGAL.md:9.1,9.6,9.7` |
| **CR-30**| Core terms governed by Philippine substantive law without US boilerplate.| Foreign jury waivers and California § 1542 waivers removed from core terms; Philippine Civil Code Art 1306 and RA 8293 control. | `LEGAL.md:15.3,16.4,16.5,17` |

---

## 9. Grounding Truth Verification Matrix (G-1 through G-32)

Every architectural proposition, empirical finding, and skeptical deconstruction verified across repository topography and documentation:

| ID | Topic Under Audit | Grounded Factual Truth | Skeptical Failure Mode / Counter-Truth | Verification Status | Actionable Mandate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **G-1** | Pass-Through Image Proxy vs Hotlinking | Client direct CDN loading proposed to avoid R2 storage liability. | BOOTH and Gumroad CDNs enforce `Referer` headers, HMAC tokens, and block hotlinking with `403`. | Grounded Truth | Stream in-memory downscaled buffers without persistent R2/disk storage. |
| **G-2** | SimHash Collision on Avatar Cosmetics | SimHash-64 ($k \le 3$) deduplicates packages across storefronts. | VRChat cosmetics share identical boilerplate ("Kikyo", "PhysBones"), falsely collapsing distinct items. | Grounded Truth | Isolate cosmetics in a dedicated taxonomy tier requiring base avatar association. |
| **G-3** | Cloudflare Turnstile & Poisson Acceleration | Poisson formula accelerates crawl rate ($\lambda \times 1.4$) on `200 OK`. | Cloudflare Managed Challenges return `200 OK` with Turnstile HTML, accelerating crawler into IP bans. | Grounded Truth | Check DOM payloads for `cf-mitigated: challenge` before classifying response as fresh content. |
| **G-4** | Unauthenticated Schema 4 Delisting | `POST /v1/reports` processes delisting reports every 30m. | Code reads `API_SECRET_TOKEN` (not `CRAWLER_API_TOKEN`). Unset `.env` allows unauthenticated delisting. | Confirmed Vulnerability | Require `API_SECRET_TOKEN` auth; route delisting reports into `needs_review` buffer. |
| **G-5** | Bio-Token Verification Paradox | Documentation proposed scraping creator bios for opt-out tokens. | Reading creator bios requires fetching profile pages protected by bot defenses and ToS bans. | Grounded Truth | Support DNS TXT, signed commits, and on-demand single unauthenticated fetch of bio token without recursive crawling. |
| **G-6** | VRCArena: Federation vs DOM Scraping | `TODO.md` proposed scraping VRCArena; `robots.txt` allows `/`. | HTML scraping is fragile ("aggregator-of-aggregators"), strains non-profit host, causes SimHash collisions. | Grounded Truth | Reject HTML DOM scraping; allow only bilateral API federation or static dataset imports. |
| **G-7** | Japanese Law (Pixiv/BOOTH) Incompatibility | US fair use and Japanese Copyright Art. 47-5 cited to defend BOOTH. | Art. 47-5 has proviso against prejudicing copyright owners; Pixiv Master Terms ban automated extraction. | Grounded Truth | Maintain conservative human pacing (1.5-5.0s delay), logged-out execution, prompt delisting. |
| **G-8** | Downstream Tortious Interference Exposure | `vrc-server.exe` and Workers serve catalog feeds to third parties. | Downstream apps stripping canonical store links can expose aggregator to tortious interference claims. | Grounded Truth | Truncate descriptions to functional summaries (256 chars); mandate outbound links. |
| **G-9** | Schema Duplication & Naming Collision | Architecture claimed complete schema unification. | Overlapping columns across `canonical_packages`, `platforms_json`, `package_fronts`; dual override fields. | Grounded Truth | Deduplicate URL columns to 2 (`url`, `vcc_url`), normalize override fields to `name_override`, enforce strict TypeScript DTOs. Dist DBs marked stale; in-place migration dropped (Task 4.1). |
| **G-10**| Open-Web VPM Discovery Feasibility | Proposed open-web search for VPM package manifests. | Unbounded web spiders searching for JSON manifests produce astronomical noise and security traps. | Grounded Truth | Restrict VPM discovery strictly to federated registry seeds and verified package indices. |
| **G-11**| Poisson Scheduler Mutability Disconnection | Preliminary audit claimed scheduler was dead code. | `requeueStaleUrls()` is active, but `adjustAfterFetch()` has zero callers; rigid 24h hardcoded in `markStatus`. | Confirmed Reality | Wire `adjustAfterFetch()` into worker completion callbacks with conditional HTTP headers. |
| **G-12**| Full-Wipe Projection & Edge Sync Data Loss | Periodic projection rebuilds catalog every 15 minutes. | `DELETE FROM canonical_packages` resets rowids, causing edge sync watermark check to permanently skip rows. | Confirmed Critical Defect | Replace full-wipe with incremental upsert; track projection generation epochs. |
| **G-13**| VPM Seeding Gate Permanent Lockout | VPM re-seeding gated on `done < 50`. | `done` is a lifetime monotonic counter; gate locks permanently after first 50 crawls. | Confirmed Bug | Replace `done < 50` with temporal staleness check (> 7 days). |
| **G-14**| Timestamp Violation: Crawl Time for Pub Date | `DISCOVERY_RULES.md` Sec 4.2 mandates `NULL` when unknown. | `src/crawler/projection.ts` and drivers must not set `originCreatedAt = earliestLocalObservedAt` when upstream date absent. | Confirmed Violation | Set `originCreatedAt = null` and `createdAtConfidence = 'unknown'` unconditionally when absent. |
| **G-15**| `AGENT.md` / `DELEGATES.md` Documentation Drift | Documents claimed obsolete test counts and phantom references. | 12 legacy test files were deleted by operator to eliminate false positives and mock drift. Clean-slate testbed with `:memory:` queued under Task 2.6. | Decoupled & Reset (2026-09-24) | Rebuild isolated testbed from ground zero using `:memory:` and mock HTTP transports. |
| **G-16**| `registerOptOut()` Unrouted in Server/CLI | Documentation claimed creator opt-out system was live. | `db.registerOptOut()` implemented in `src/db.ts` but has zero API routes and zero CLI callers. | Confirmed Unimplemented | Expose `POST /v1/opt-out` endpoint with DNS TXT and storefront bio-token verification. |
| **G-17**| SQLite Test Concurrency Lock Contention | Full test suite expected to run deterministically. | 7 test files shared 357 MB DB; locks triggered SQLite busy_timeout. Legacy tests deleted; all future tests isolated to `:memory:`. | Confirmed Defect | Isolate all tests to in-memory SQLite (`:memory:`) or dedicated ephemeral test databases. |
| **G-18**| Broken CLI Commands on `vrc-crawler.exe` | Runbooks instructed `vrc-crawler.exe status/recrawl/stop`. | Binary has zero CLI routing; running with args starts rogue daemon crashing with `ProcessLock`. | Confirmed Defect | Add CLI argument guard in `crawler/index.ts` redirecting subcommands to `vrc-monitor.exe`. |
| **G-19**| Environment Variable Secret Drift | Deployment assumed administrative secret was documented. | Code reads `process.env.API_SECRET_TOKEN`; docs claimed `CRAWLER_API_TOKEN`; neither was in `.env.example`. | Confirmed Drift | Declare `API_SECRET_TOKEN` in `.env.example`; standardize across code and documentation. |
| **G-20**| Operational Readiness of Documentation | Guides intended for autonomous coding agents and SREs. | Duplicate files conveyed obsolete test counts and concealed edge sync data loss. | Resolved (2026-09-23) | Fully audited and rewritten with ASD-STE100 rules and 100% factual accuracy. |
| **G-21**| Downstream Notice Invariant (`VRC-Packages-Terms`)| `LEGAL.md` §10 asserts covenants are binding conditions. | Programmatic callers receive no notice unless transmitted in-band; server injects zero terms headers. | Grounded Truth | Inject `VRC-Packages-Terms-Of-Use` header (RFC 6648) on all HTTP responses; embed notice in `GET /`. |
| **G-22**| Server Test Compliance (*Perfect 10*) | Linking to origin images avoids copyright display liability. | Storing WebP thumbnails on Cloudflare R2 or local disk constitutes reproduction of copyrighted artwork. | Grounded Truth | Return direct origin CDN URLs in API feeds; limit local processing to in-memory pHash/BlurHash. |
| **G-23**| Cloudflare Turnstile Detection on `200 OK` | Crawler accelerates crawl frequency on `HTTP 200 OK`. | Turnstile Managed Challenges return `200 OK` with HTML challenge scripts, parsed as product content. | Grounded Truth | Inspect DOM payloads for challenge signatures before classifying response as valid. |
| **G-24**| CJK Shingling & Punctuation Normalization | SimHash-64 links BOOTH listings with Western mirrors. | BOOTH titles use decorative brackets (`【...】`), distorting 2-grams and preventing SimHash convergence. | Grounded Truth | Implement NFKC normalization, strip brackets, and generate character 2-grams in pipeline. |
| **G-25**| Automated Non-Scraping Opt-Out Protocol | `LEGAL.md` §9 promises DNS TXT and signed commit opt-out. | Server has no `/opt-out` endpoint; creators cannot submit proofs without manual maintainer intervention. | Grounded Truth | Expose `POST /v1/opt-out` endpoint validating DNS TXT records and ephemeral storefront bio-tokens. |
| **G-26**| Decentralized Network Contributor Provenance | `LEGAL.md` §1.4 defines nodes pushing metadata to edge. | Tables lack `contributor_node_id`, `signature`, and `batch_id`; bad submissions cannot be traced. | Grounded Truth | Add provenance tracking columns to `entities` and `canonical_packages` via Post-v1.0 Worker Gateway. |
| **G-27**| Gumroad Section 14(e) Search Engine Exemption | Gumroad ToS §14(e) allows public search indices, bans caches. | Codebase must ensure no product binaries (`.zip`, `.unitypackage`) are cached or archived. | Grounded Truth | Verify socket-level streaming guardrails abort transfers matching binary MIME types or > 10 MB. |
| **G-28**| Japanese Law (Art. 30-4/47-5) vs Contract Terms | Japanese Copyright Act permits search indexing, not contract breach. | Pixiv Master Terms ban automated extraction; statutory exceptions do not override private contracts. | Grounded Truth | Enforce polite human pacing (1.5-5.0s), logged-out execution, prompt cessation upon objection. |
| **G-29**| SQLite `media_cache.webp_data` BLOB Storage | `image_proxy.ts` caches WebP images in SQLite database. | Storing raw WebP buffers directly as BLOBs in SQLite creates 357 MB DB in `dist/` (marked stale). | Confirmed Reality | Drop `webp_data BLOB` from SQLite schema and catalog export (`src/sync/exporter.ts`); mark `dist/crawler_state.db` stale; drop in-place migrations. |
| **G-30**| `vrc_catalog.db` SQLite Export Missing Terms | Exporter generates SQLite database catalogs for clients. | `src/sync/exporter.ts` creates package tables and in-band `catalog_metadata` table. | Confirmed Omission | Add `CREATE TABLE catalog_metadata` recording terms URL, SHA-256 digest, and license reference. |
| **G-31**| Server Root Path (`GET /`) Missing Discovery Doc| API Gateway exposes `/v1/` routes. | Requesting `GET /` returns `404 Not Found`; no root route exists to declare capabilities or terms. | Confirmed Gap | Add root route `GET /` returning API metadata, version, schema endpoints, and terms of use URL. |
| **G-32**| Server Test Circuit Split (*Perfect 10* vs *Goldman*) | Ninth Circuit Server Test treats linking as non-infringing. | SDNY and Second Circuit rejected Server Test for web embeds (*Goldman v. Breitbart*, *Nicklen*). | Grounded Truth | Ground image indexing primarily in *Kelly v. Arriba Soft* transformative fair use (visual locators). |

---

## 10. Adversarial Legal Review & Calibration Record (20-Point Audit Matrix)

An adversarial legal review was conducted on September 24, 2026. The review evaluated `LEGAL.md` and related documentation against twenty strict criteria:

1. **Public Accessibility as Permission**:
   - *Problem*: Conflated public accessibility with contractual permission on Jinxxy.
   - *Evidence*: Jinxxy Terms Sections 8.2 and 23 prohibit systematic extraction without written consent.
   - *Resolution*: Reframe Jinxxy as "Unresolved Contractual Risk". Public availability does not defeat contractual terms.
2. **Robots Exclusion Protocol as Legal Authorization**:
   - *Problem*: Treated `robots.txt` compliance as affirmative legal authorization.
   - *Evidence*: RFC 9309 states that robots rules are operator preferences, not access authorization.
   - *Resolution*: State that `robots.txt` is an operational signal followed voluntarily, not a legal license.
3. **Numerical Limit as Copyright Safe Harbor**:
   - *Problem*: Claimed 256-character truncation prevents copyright appropriation.
   - *Evidence*: *Authors Guild v. Google* evaluated search snippet systems without setting numerical safe harbors.
   - *Resolution*: State that 256 characters is an internal risk-reduction limit, not a statutory safe harbor.
4. **Overextension of Judicial Precedents**:
   - *Problem*: Stated *Bright Data* established a universal rule for unauthenticated scraping.
   - *Evidence*: The holding in *Bright Data* was fact-specific to Meta user agreements and record facts.
   - *Resolution*: State that decisions are fact-specific and do not establish universal scraping authorization.
5. **Citation Alignment with Specific Propositions**:
   - *Problem*: Cited Philippine RA 8792 Section 30 as granting statutory immunity.
   - *Evidence*: Section 30 outlines network provider criteria, not self-executing immunity for crawlers.
   - *Resolution*: State that the Maintainer operates a voluntary delisting policy without claiming statutory immunity.
6. **Contract Formation and Terms Presentation**:
   - *Problem*: Claimed API access automatically forms an enforceable contract.
   - *Evidence*: Browsewrap contracts require notice, knowledge, and assent under applicable contract law.
   - *Resolution*: Frame terms as the Maintainer intention, binding where enforceable under applicable contract law.
7. **Assent via Continued Use**:
   - *Problem*: Claimed continued use automatically binds users to modified terms.
   - *Evidence*: Enforceability requires reasonable notice and assent.
   - *Resolution*: Version catalog exports using `catalog_metadata` tables and qualify assent under contract law.
8. **Third-Party Material Ownership**:
   - *Problem*: Conflated database compilation rights with ownership of underlying factual metadata.
   - *Evidence*: Raw facts lack copyright, and third-party descriptions belong to original creators.
   - *Resolution*: Formalize Three Legal Layers. Disclaim ownership over Layer C third-party data.
9. **Public Data Privacy Exemption**:
   - *Problem*: Treated public usernames as automatically exempt from privacy laws.
   - *Evidence*: Philippine RA 10173 and GDPR apply to personal data even if publicly accessible.
   - *Resolution*: Acknowledge public handles as personal data, apply data minimization, and evaluate balancing.
10. **GDPR Territorial Applicability**:
    - *Problem*: Stated GDPR rights apply universally to all indexed data subjects.
    - *Evidence*: GDPR Article 3 requires establishment or targeting of data subjects in the Union.
    - *Resolution*: Qualify GDPR rights with "Where GDPR applies under Article 3 territorial scope".
11. **Philippine versus Foreign Privacy Legal Bases**:
    - *Problem*: Conflated Philippine RA 10173 Section 12 with GDPR Article 6(1)(f).
    - *Evidence*: Statutory conditions and balancing tests differ between jurisdictions.
    - *Resolution*: Present a jurisdiction privacy matrix separating Philippine and European requirements.
12. **Personal Data in Telemetry and Infrastructure**:
    - *Problem*: Claimed zero personal data across the entire system.
    - *Evidence*: Network web servers and reverse proxies log client IP addresses for network security.
    - *Resolution*: Rename to Privacy-Minimized Application Telemetry and distinguish infrastructure logs.
13. **Delisting Propagation Outside Control**:
    - *Problem*: Claimed delisting purges records from all databases and feeds universally.
    - *Evidence*: The Maintainer cannot purge local copies downloaded by third parties.
    - *Resolution*: Distinguish Maintainer-controlled canonical feeds from downstream local copies.
14. **Unauthorized Statutory Terminology**:
    - *Problem*: Used terms like "Sovereign Delisting Rights" without statutory foundation.
    - *Evidence*: Private search indices do not grant sovereign rights under statute.
    - *Resolution*: Rename to "Creator and Rights-Holder Delisting Requests".
15. **Absolute and Unverified Language**:
    - *Problem*: Used words like "prevents" regarding copyright claims.
    - *Evidence*: Character truncation reduces risk but does not prevent claims.
    - *Resolution*: Replace absolute assertions with calibrated risk-reduction statements.
16. **Conflicts with AGPLv3**:
    - *Problem*: Preamble claimed compiling or running source code triggered catalog terms.
    - *Evidence*: AGPLv3 grants unconditional rights to compile, run, and modify source code.
    - *Resolution*: Remove compiling triggers. Clarify that AGPLv3 governs source code exclusively.
17. **Conflicts with Implementation**:
    - *Problem*: Documentation previously claimed the service never downloads or stores media, contradicting `ImageProxyService` caching WebP thumbnails in `media_cache.webp_data`.
    - *Evidence*: `src/utils/image_proxy.ts` and `src/server/index.ts` store and serve WebP thumbnail BLOBs from SQLite.
    - *Resolution*: Accurately describe current WebP thumbnail caching, recognize display copyright exposure under the Server Test split, and document the queued deprecation of persistent BLOB caching in favor of ephemeral proxying and direct URL pointers (CR-19/CR-21).
18. **Internal Document Consistency**:
    - *Problem*: Aggressive downstream indemnity conflicted with non-commercial posture.
    - *Evidence*: Broad indemnities exceed what an individual maintainer can extract.
    - *Resolution*: Narrow downstream operator responsibility to claims arising from misuse.
19. **Policy versus Statement of Law**:
    - *Problem*: Framed voluntary 24 to 48 hour target as a Service Level Agreement.
    - *Evidence*: A voluntary policy is not a negotiated contractual SLA.
    - *Resolution*: Rename to "Delisting Response Target".
20. **Unresolved Legal Questions**:
    - *Problem*: Stated scraping legality and database restrictions as confident conclusions.
    - *Evidence*: Courts and jurisdictions diverge on web scraping and dataset covenants.
    - *Resolution*: State positions as calibrated risk controls and document unresolved risks.

---

## 11. Open Architectural Invariants & Ground Truth Audit Findings

### Question 1: How sure are we that the crawler will passively update the database with new and updated entries?
**Audit Verdict: Partially Functional, Dependent on Resolving 4 Identified Defects**:
- **What Works**: `poissonScheduler.requeueStaleUrls()` actively executes on monitor cycles (`src/crawler/index.ts:760`) and IPC `/recrawl` (`:955`).
- **Critical Defects Preventing Full Autonomy**:
  1. *Mutability Disconnection*: `adjustAfterFetch()` has zero callers in `src/`; `db.markStatus()` enforces a rigid 24h interval (`+86400s`) regardless of actual change velocity (Task 3.3).
  2. *VPM Seeding Lockout*: Monotonic `done < 50` condition permanently halts VPM seed injection after 50 crawls (Task 1.5).
  3. *Conditional Header Void*: Zero crawler drivers send `If-None-Match` or `If-Modified-Since`, rendering HTTP 304 cache validation 100% dead code (Task 3.3).
  4. *Edge Sync Watermark Trap*: Table wipes in periodic projections reset rowids, causing edge sync to permanently skip rows 1..watermark from Cloudflare D1 (Task 3.4).

### Question 2: How sure are we that the documentation reflects the ground reality of the codebase?
**Audit Verdict: Substantial Divergence Identified and Tracked**:
- Prior documentation duplicates (`AGENT.md` and `DELEGATES.md` sharing identical SHA-256) were resolved on 2026-09-23.
- Test baseline ground truth is **57 passing tests across 12 files** (276 assertions), correcting obsolete documentation claiming 40/40 tests.
- Physical code reads `process.env.API_SECRET_TOKEN` while old runbooks hallucinated `CRAWLER_API_TOKEN`.
- The opt-out system (`db.registerOptOut()`) is implemented in the database layer but has zero API routes, which Task 3.1 resolves.
- `src/crawler/projection.ts` previously substituted crawler fetch times for missing publication dates, which Task 1.4 resolves.
