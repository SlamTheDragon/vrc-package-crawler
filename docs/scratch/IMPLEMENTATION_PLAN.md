# Canonical Implementation Plan Ledger

> **System Core Covenants & Architecture (Version 0)**:
> 1. **Dual System Topology**: Cloudflare Worker Edge Coordinator (`src-crawler/src/worker/`) deployed to Cloudflare staging with D1 storage, and standalone autonomous Crawler Node (`src-crawler/src/node/`) communicating over HTTPS with online domain. Local coordinator binary is retired.
> 2. **Leased-Only Ingestion**: Nodes fetch strictly under unexpired coordinator leases (`/v1/node/jobs/claim`); coordinator loss halts all node fetching (fails closed).
> 3. **Capability-Encoded Security**: Node tokens (`vrcp_<64-hex><4-hex>`) encode permitted platforms; all tokens are persisted strictly as SHA-256 hashes.
> 4. **Universal Package Model**: All catalog items project into three umbrellas: **Tools**, **Assets**, and **Avatars**, preserving source provenance.
> 5. **Execution & Anti-Bloat Guardrails**: Slices must touch strictly 2–3 files at a time. The `docs/scratch/` directory is strictly maintained at 2–3 files (`UNMERGED_IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PLAN.md`, `task_tracker.md`).
> 6. **Current Audited Baseline**: **333 pass / 0 fail** across 37 test files (4 in root `tests/`, 296 in `src-crawler`, 33 in `src-package`).
> 7. **Delivered & Accepted Milestones**: G0 (Taxonomy baseline), G1 (Safety & Hermetic baseline), G2 (Versioned evidence & SQLite links), G3 (Pure adapter & leads), G4 (Desktop tools & Avatar taxonomy), G5 (Local coordinator & public catalog API), PKG-01 (Consumer client SDK `src-package`), Scratch Compaction, G6 (Cloudflare Worker Coordinator & D1 Edge Staging - deferred for skeptical review), G7 (Online Domain, Remote Node HTTPS Transport, Docker & Watchtower Auto-Update, Lease Boundaries), G8 (Storefront source access profiles, preflight robots snapshots, default seed jobs, and auto-delist cascading), G10 (Upstream VPM registry lead extraction, cross-source storefront verification, timestamp confidence hierarchy, and tag search timestamp ordering), G11 (Root documentation cleanup, context migration, preprod layout conformance, and downstream delegate runbook enablement).
> 8. **Recovered Canonical Foundation Covenants (ex-TODO.md CANON-1..6)**:
>    - **CANON-1 (Discovery Leads)**: VPM expansion uses manifest leads (`index.json`), publisher links, and community aggregator discovery leads (e.g., nexxy, avtr.zip) governed strictly by `robots.txt` preflight. Open-web unindexed crawling is prohibited.
>    - **CANON-2 (Cosmetics Taxonomy Isolation)**: Apparel and cosmetics are strictly segregated into the Assets umbrella with base avatar bindings (e.g., Kikyo, Manuka, Shinano, Selestia) to eliminate SimHash false merges against developer toolchains.
>    - **CANON-3 (Zero Volunteer DOM Scraping)**: Community catalogs without authoritative APIs/manifests (e.g. VRCArena) are excluded from active crawling; evidence relies on direct publisher observations.
>    - **CANON-4 (Provenance & Clean Deduplication)**: Redundant source fields coalesced into versioned source items and accepted identity links; zero stale database migrations.
>    - **CANON-5 (Anonymous Telemetry)**: Downstream telemetry and demand feedback (`/v1/app/demand`) strictly record zero PII and anonymous aggregation without session tracking.
>    - **CANON-6 (Air-Gapped Backend Separation)**: Crawler backend remains stateless and unauthenticated; user authentication, private lists, and recommendations belong exclusively in downstream consumer clients (`src-package`).
>    - **Media Delivery Covenant**: Direct origin CDN URLs (*Perfect 10* Server Test) with zero local image BLOB storage.
>    - **Creator Delisting Covenant**: Unified self-service delisting via DNS TXT or storefront bio-token (`#vrc-opt-out-<vendorId>`) with cryptographic proof.
>    - **Terms Header Standard**: IETF RFC 6648 compliant header `VRC-Packages-Terms-Of-Use`.

---

## Active Implementation Plan Ledger

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| done | DOC-S1 | Legacy `TODO.md` context recovery & root purge | [`docs/scratch/IMPLEMENTATION_PLAN.md`](file:///f:/.repo/.main/vrc-package-crawler/docs/scratch/IMPLEMENTATION_PLAN.md), [`TODO.md`](file:///f:/.repo/.main/vrc-package-crawler/TODO.md) | `TODO.md` (121 KB) contains stale single-process Phase 1–4 code patches alongside authoritative canonical foundation items (CANON-1..6, cosmetics taxonomy, bio-token delist, media streaming proxy). | Recover active canonical foundation covenants and architectural decisions into `docs/scratch/IMPLEMENTATION_PLAN.md`, then delete `TODO.md` from the repository root. | approved |
| done | DOC-S2 | Re-anchor agent instructions & align layout conformance test | [`AGENTS.md`](file:///f:/.repo/.main/vrc-package-crawler/AGENTS.md), [`tests/preprod_layout.test.ts`](file:///f:/.repo/.main/vrc-package-crawler/tests/preprod_layout.test.ts) | `AGENTS.md` points to deleted files (`DIRECTION.md`, `CONFORMANCE.md`, `AGENT_PHASE4.md`) and pre-refactor binary model; `tests/preprod_layout.test.ts` fails by asserting deleted scratch files (`DIRECTION.md`, `DEFERRED_OWNER_DECISIONS.md`). | Update `AGENTS.md` to reference live authoritative files and current network topology (Cloudflare D1 coordinator + Dockerized node); update `tests/preprod_layout.test.ts` to assert the standard clean root set (`AGENTS.md`, `DELEGATES.md`, `LEGAL.md`, `LICENSE.md`, `README.md`, `install.sh`) and minimal scratch files. | approved |
| done | DOC-S3 | Overhaul `DELEGATES.md` for downstream users & `src-package` SDK | [`DELEGATES.md`](file:///f:/.repo/.main/vrc-package-crawler/DELEGATES.md) | Author directive (A2): `DELEGATES.md` is meant for downstream users to take leverage upon, but currently describes the retired local two-binary loopback stack without referencing `src-package`. | Rewrite `DELEGATES.md` to guide downstream developers integrating `src-package` (app tokens `vrcp_app_`, user tokens `vrcp_usr_`, catalog indexing, delta sync, and takedown/report submission) and interacting with the remote coordinator. | approved |
| done | DOC-S4 | Overhaul root `README.md` & patch `LEGAL.md` links | [`README.md`](file:///f:/.repo/.main/vrc-package-crawler/README.md), [`LEGAL.md`](file:///f:/.repo/.main/vrc-package-crawler/LEGAL.md) | `README.md` references retired local binaries, deleted smoke scripts, stale 161 test count, and dead scratch links; `LEGAL.md` references deleted `docs/scratch/current/CONFORMANCE.md`. | Rewrite `README.md` to present the true repository layout (`src-crawler`, `src-package`, `src-web`), Docker/Worker deployment, and current test baseline (333 tests); patch `LEGAL.md` cross-references to point to `docs/scratch/IMPLEMENTATION_PLAN.md` and `docs/source/DATABASE_SCHEMAS.md`. | approved |
| deferred | G9 | Web Operator Panel & self-service landing portal | `src-web/` | Deferred by author decision to focus on coordinator staging and node crawler network. | Keep deferred until coordinator staging and live crawling are fully operational. | deferred |

---

## Milestone Gates

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G6 | Cloudflare Worker Coordinator & D1 Edge Staging | Completed in code (bundle 1.54 MB, D1 coordinator verified). Kept deferred per author decision A3 until manual staging test. | deferred for skeptical review |
| G7 | Online Domain & Remote Crawler Node HTTPS Transport | Completed: HTTPS transport resilience verified, Docker packaging & Watchtower auto-updater configured, GitHub Actions GHCR publish workflow added, fail-closed expired lease guards verified, 326 tests pass. | approved |
| G8 | Live Platform Access Profiles & Storefront Default Seeds | Completed: Storefront profiles (BOOTH, Gumroad, Jinxxy, Sellfy, Payhip), RFC 9309 snapshots, polite seed jobs, Payhip metadata extraction, and automatic delisting cascading on missing source verified, 327 tests pass. | approved |
| G9 | Web Operator Panel (`src-web/`) | Deferred by author decision A4 until Gate G10 is complete and node crawler network is active. | deferred |
| G10 | Upstream VPM Community Registry Ingestion & Cross-Source Verification | Completed: Multi-platform manifest lead decomposition, cross-source storefront/repository verification linking, timestamp confidence hierarchy ('confirmed', 'inferred', 'observed'), and bulk tag timestamp search ordering verified across 329 tests. | approved |
| G11 | Root Documentation Cleanup, Context Migration & Downstream Delegate Enablement | Completed: Recovered canonical foundation covenants (CANON-1..6) and purged stale 121 KB TODO.md; re-anchored AGENTS.md and preprod layout tests (4/4 pass); overhauled DELEGATES.md downstream developer runbook; overhauled README.md and patched LEGAL.md links. 333 tests pass / 0 fail. | approved |
