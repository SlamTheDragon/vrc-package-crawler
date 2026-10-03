# Canonical Implementation Plan Ledger

## Fleet plan — merged owner review

Merged from `UNMERGED_IMPLEMENTATION_PLAN.md` at the owner's request. This table owns FLEET-S1 through S4. Comments authorize only the stated scope. The owner defers general ledger compaction. Current paths replace proposed paths from before the migration.

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| partial; approved | FLEET-S1 | Local Worker/D1 verification harness | `src-web/package.json`, `src-web/tests/coordinator_runtime_smoke.mjs`, `src-web/wrangler.toml` | Local API/D1 smoke passes initialization, registration, claim race, heartbeat and idempotent submission. It does not prove full fleet or remote staging behavior. | Keep the native runtime harness. Extend it to cover required failure paths and separate node processes before declaring the gate complete. No remote credentials or deployment are required for local checks. | proceed |
| needs decision | FLEET-S2 | Multi-platform initial seeds | `src-web/src/worker/storage/default_seeds.ts`, `src-web/src/worker/storage/d1/coordinator.ts` | VPM community repositories, approved GitHub repositories/releases (including the proposed vrc-get reference) and storefront listings need coordinator-managed seeds, real robots preflight and separate scoped access profiles. Fabricated bootstrap grants and snapshots were removed (R13-C2). Existing stored grants and placeholder candidates still need review. | Research and settle seed policy. Implement approved seed definitions and reviewed profile attachment without treating a public URL or draft LEGAL text as access approval. | needs more thorough decision making |
| approved; pending review checks | FLEET-S3 | Docker fleet configuration | `docker-compose.yml` (proposed, absent), `src-crawler/Dockerfile`, `DELEGATES.md` | The node binary and Dockerfile exist, but a root fleet compose file and verified multi-node deployment do not. | Review credentials, persistent storage (`/app/data`), shutdown/restart, image trust and host permissions. Then implement fleet compose and environment configuration. Watchtower remains a proposed updater, not a verified safe deployment. Do not add privileged automatic updates without those checks. | review and proceed |
| gated | FLEET-S4 | Multi-platform end-to-end fleet ingestion | `tests/integration/fleet_crawl_simulation.test.ts` (proposed), `src-crawler/src/runner/daemon.ts`, `src-web/src/worker/worker_entry.ts` | Existing tests and native D1 smoke do not prove separate node processes ingest real data across all drivers. | After source-policy and safety prerequisites, exercise concurrent leases, approved real-source fetches, schema-valid receipts and canonical/search projections. | gated necessary completions before this slice |

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G12 | Local Worker verification, Docker fleet and multi-platform ingestion | Partial: native local D1 HTTP smoke and runtime separation pass. Seed policy, safe operator controls, Docker fleet, recovery and real-source ingestion remain open. FLEET-S1 through S4 define the remaining work. | |

## R16 — runtime ownership migration evidence, 2026-10-03

The owner moved the Worker tree and tests. Import repair now places production Worker handlers/D1 in `src-web/src/worker/`, node implementation in functional folders under `src-crawler/src/`, Worker tests under `src-web/tests/worker/`, and cross-runtime tests under root `tests/integration/`. The owner renamed the internal client file to `client/node_client.ts`. Test-only SQLite/config/robots helpers live under `src-web/tests/support/`. The obsolete coordinator CLI and forwarding files were removed, without replacement wrappers. Git history retains the removed implementation.

Verification: node 142 pass, Worker/integration 161 pass, SDK 33 pass. Combined functional suite: 336 pass, 0 fail, 37 files. Node, Worker and SDK typechecks pass. Wrangler dry-run and compiled Windows node build pass. The compiled node help works. Native workerd/local D1 smoke passes claim race, heartbeat, submission and idempotent replay with zero external fetches. Root layout: 4 pass, 2 fail for the intentionally deleted identity config and obsolete dual-database assertion. No Linux image, fleet, live-source ingestion or remote deployment was verified.

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| partial; critical | R16-C19 | Retired CLI operations lack Worker HTTP equivalents | Removed CLI at commit `06695cc:src-crawler/src/worker/main.ts`; `src-web/src/worker/api/operator_handler.ts` | Strict initialization and audited manual enqueue now have typed SDK/HTTP contracts. Seed identity and committed suppression/rule conflicts preserve queue/pacing state. Dedicated job_seed_actions records manual actions atomically; audit failures roll back writes. Node revoke, real robots preflight, suppression and issue/evidence inspection remain absent as direct HTTP controls. Native local D1 smoke passes enqueue/repeat and lease/result flow. | Continue remaining typed controls and coordinator-directed robots preflight. Verify native audit rollback and natural expiry boundary separately. No queued URL grants fetching, and no coordinator binary is restored. | |
| critical | R16-C20 | Source/runbook drafts still describe unsupported capabilities | `docs/source/`, `DELEGATES.md`, `README.md` | Runtime paths and local hosting claims were corrected. Remaining drafts include unsupported user lifecycle routes, proof verification, registry availability, update guarantees and stale SDK examples. | Compare every claimed route/feature with current handlers and SDK contracts. Correct measured descriptions without treating proposals as accepted behavior. Preserve owner comments. | |

Shared schema/policy ownership remains explicit: both runtimes still import internal pure contracts from `src-crawler/src/shared/`. These are not a node client published through the consumer SDK. Node schema validation reuses SDK version/schema utilities, so its declared SDK dependency and Docker source copy remain necessary. The sanitizer also imports an opt-in IANA refresh helper. Do not claim complete package independence from physical relocation alone.

## Current owner direction and critical audit — 2026-10-03

Latest owner instruction supersedes historical claims below. Compare prototype `09e9dc8` before architecture migration. Organize research, commit/push `research clean up`, then continue bounded implementation. Author-review pauses are deferred. Specifications and LEGAL are drafts except explicit owner comments. `docs/source` must describe current capabilities. API-only `src-web` is the current serving target. Physical SDK directory is `src-package/`.

Current evidence at HEAD `3b9d203`: crawler 296 pass, SDK 33 pass, root 2 pass / 2 fail (missing crawler config). Both package typechecks pass. Previous 333-pass statement is historical. See [prototype parity audit](../research/audits/PROTOTYPE_PARITY.md).

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| critical | R13-C1 | D1 concurrent claims issue two leases for one job | `src-crawler/src/worker/storage/d1/coordinator.ts:293` | Reproduced with two concurrent claims. Eligibility reads precede unconditional writes. | Add racing D1 regression, conditional atomic reservation and loser handling before fleet runs. |suggestions were made to use cloudflare queues, i dont know if this would give benefits. Another thing is using cloudflare index to speedup other api endpoint queries such as bulk search and whatnot |
| partial; critical | R13-C2 | Bootstrap invents robots success and source approval | `src-web/src/worker/storage/default_seeds.ts`, coordinator `seedInitialJobs` | Fabricated 2099 grants and robots bodies were removed from both initializers. Fresh autoSeed queues candidates only. Reinitialization preserves reviewed/disabled profiles, robots restrictions, live leases and suppression. Previously stored grants and placeholder seed policy remain unresolved. | Keep separate scoped operator approval and real robots preflight. Review old bootstrap-created grants before any existing-database live run. Resolve candidate seed selection under FLEET-S2. Tests: Worker/integration 164 pass; native fresh-bootstrap claims empty without a separate profile. | previous agents working on this reasoned out that this is to initialize the coordinator with boundaries as per "LEGAL" specs, but it might not be fully right. Remain skeptical|
| critical | R13-C3 | Public projection ignores publication classes | coordinator `submit`, `buildCatalogPackage`, catalog methods | Reproduced catalog exposure with `publishClasses: []`. | Add no-publication fixtures. Gate each public field and front by evidence/profile rights. Define revocation behavior separately. | clarify|
| critical | R13-C4 | Unverified notices and unrelated user tokens can delist | `src-crawler/src/worker/api/user_handler.ts`, coordinator `submitDelistRequest` | Reproduced pending unauthenticated proof immediately changes lifecycle. User identity is not target ownership. | Record requests without destructive action until verified ownership/operator verdict. Clarify owner model and privacy/notice retention. | ground methodology|
| critical | R13-C5 | Deployment and API-only hosting ownership | `src-web/wrangler.toml`, `src-crawler/wrangler.toml`, Worker entry | Web serves generated Svelte Worker with VRCP_D1. Coordinator expects DB. Crawler uses placeholder IDs. | After research, migrate API code in bounded slices. Clarify same existing Worker versus a separate API service before remote deployment. No deployed capability inferred from local files. | this is version 0, full migration approved to src-web for worker instance. Keep node in src-crawler|
| critical | R13-C6 | SDK contract and npm delivery not finalized | `src-package/package.json`, `src-package/src/client.ts`, public handler | SDK query sends unsupported filters. Source TS exports have no tested JS/declaration npm artifact. | Preserve operator/user/app consumer scope. Add SDK-to-Worker contract tests, pack/install tests and typed JS output. Clarify public API fields and package naming before release. | accepted |
| critical | R13-C7 | Timestamp semantics drift | adapter `parseObservation`, coordinator `submit`, LEGAL §2.4 | Modification dates project as publication dates. Draft and tests use different confidence rubrics. | Separate observed/created/modified/released times. Ask which public sorting semantics are wanted. Never invent publication dates. | ground methodology|
| critical | R13-C8 | Lost prototype capabilities lack explicit disposition | [parity matrix](../research/audits/PROTOTYPE_PARITY.md) | Media pointers, export, discovery depth, standalone GitHub canonical entries and moderation are partial/absent. | Prioritize each gap against current owner intent. Do not restore BLOB caches, unleased probes, fabricated VPM versions or unsafe steering. | ground methodology and features for editing|
| pending | R13-C9 | Source/profile publication, provisional fronts and recovery need failure tests | D1 projection, node store/runner | Existing tests cover local SQLite extensively but not the full deployed topology. | Add restart/outbox, equal-time deltas, hard-delete tombstones, revoked publication, malformed metadata and false-link tests sequentially. | aproved|
| pending | R13-C10 | Stale governance and config references | root layout tests, `.agents/`, source drafts | Missing config causes two failures. Skill references point to deleted scratch files. | Reconcile intended config, repair live links and remove false completed claims. Keep scratch at three documents. | the config was meant for identity and versioning, purposely deleted in order to trace code and review necesary steps to only provide identity and version config across crawler c|
| critical | R13-C11 | Source clearance and legal promises exceed evidence | LEGAL.md, bootstrap profiles, prior research | Payhip/Sellfy public visibility did not establish access approval; privacy, ownership, media and publication promises differ from code. | Use the legal library's operation/field review. Obtain scoped primary evidence and counsel review where needed. Do not bootstrap clearance from research prose. |vrchat-related products may be indexable as similar aggregators advertise listings from these websites in vrchat market ecosystem|

Research cleanup R13 shipped as `fccae0a`. Implementation remains active. Technical blockers are verified evidence, not permission to redefine the goal as documentation-only.

R13 delivery evidence: the library consolidates twelve existing notes and adds the historical/current audit. All research-local links resolve. The full checker reports seven remaining governance/notes-metadata issues. STE-flavored lint scores range from 1.02 to 3.76 findings per 100 words. Tables, URLs and retained legal qualifiers trigger some findings; the library is not certified STE. Subsequent local fixes and remaining gates are recorded below. No live crawling or deployment occurred in this audit.

## Implementation follow-through

## R14 evidence and replies to owner comments — 2026-10-03

Research cleanup is committed and pushed as `fccae0a`. Three later local commits fix reservation races (`ffe57b6`), native D1 initialization (`00bc50c`) and Worker credential generation (`750d67e`). Current crawler: 302 pass. SDK: 33 pass. Root: 2 pass / 2 fail. Both typechecks pass. Local workerd/D1 HTTP smoke issued one lease and one empty response under concurrent claims, with schema validation and zero outbound requests. This is not remote staging or full fleet proof.

The latest goal attachment `addfa15f-0607-4fe4-b975-e1cacc86bb51/goal-objective.md` was read. Owner comment R13-C5 approves full Worker migration to src-web, with the node kept in src-crawler. No compatibility re-export layer is requested. The immediate service target remains API-only; future dashboard/auth work stays separate.

| Status | ID | Evidence / uncertainty | Next action |
| --- | --- | --- | --- |
| fixed locally | R14-C12 | Native D1 exec rejected multiline schema commands. The Bun mock hid this. | Fixed static command formatting and line-oriented fixture. Keep real runtime tests during migration. |
| fixed locally | R14-C13 | Browser Worker bundle could not call node:crypto randomBytes for node credentials. | Web Crypto fixture and real registration now pass. Preserve portable imports; bundle decreased from about 1.55 MB to 0.63 MB. |
| critical | R14-C14 | Initialization has 57 DDL commands plus alterations; target plan and invocation query accounting are unverified. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) state 50 queries on Free versus 1000 on Paid. Claim candidate scanning can also accumulate queries. | Move schema setup toward supported migrations. Measure request budgets and bound scans. Do not infer Free-plan readiness from the local runtime. |
| critical | R14-C15 | “Cloudflare index” does not identify a chosen search product or desired matching semantics. | Compare existing SQL indexes and D1 FTS5 before external/vector search. Label keyword, substring, tag, ranking and pagination requirements. No product adopted. |
| pending | R14-C16 | Direct D1 proxy helper stalled in installed Miniflare 5 alpha. An in-memory fixture Worker allowed HTTP tests. | Preserve a repeatable runtime harness without adding a production fixture route. Evaluate the installed runtime/API before a dependency upgrade. |

### R13-C1: Queues and indexing

[Cloudflare Queues](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) delivers at least once, so duplicate delivery remains possible. It can buffer asynchronous work and retries, but cannot replace source approval, robots, atomic origin reservation or idempotent result storage. Current D1 leases already supply a persistent polling queue. Evaluate a broker only against measured contention/backlog and operational cost, not as a cure for the reproduced SQL race.

[D1 supports FTS5](https://developers.cloudflare.com/d1/sql-api/sql-statements/). SQL indexes help indexed predicates; full-text search has different token/ranking semantics from the current substring LIKE query. Research a labeled search corpus and query plans first. A vector/AI search service is a separate product choice, not implied by “index.”

### R13-C2 and C3: boundaries versus authorization

Driver availability, source grants, robots state and publication are separate controls. A bootstrap can define supported drivers and candidate seeds without approving a source or inventing a robots response. A draft LEGAL boundary is not evidence that a particular origin agreed to access/reuse.

Clarification of the reproduced C3 defect: a profile with `retainClasses: ["normalized_facts"]` and `publishClasses: []` allows internal evidence, not public catalog output. The current projection exposed one item anyway. A profile that permits normalized-fact publication still does not grant creator-prose or media publication. Proposed fix: check each public item/front/field against its contributing evidence and rights, then handle revocation and tombstones consistently. Operator curation needs an explicit provenance/authority path rather than a blanket bypass.

### R13-C4: proposed ownership/removal methodology

Record every request as pending until authority is established. A user token authenticates a person, not ownership of every canonical item. An arbitrary caller-supplied proof string is not verification.

Issue a server-generated, expiring challenge bound to requester, target and proof method. DNS control can establish control of a custom domain, not a merchant's account on booth.pm. For hosted storefronts, verify an exact publisher-controlled page or an appropriate platform account relation under reviewed, leased access. Keep proof material private and separate from catalog evidence. Control of one front does not automatically prove copyright ownership or authorize removal of unrelated fronts.

Bind accepted authority to its scope. Apply suppression only after a verified challenge or recorded operator verdict. Test unrelated users, expired/replayed challenges, changed targets, contested ownership, rejection, active leases and downstream deltas. Keep DNS/storefront evidence mechanisms and retention open until the interface is researched; no DNS or OAuth integration was implemented here.

### R13-C7: proposed timestamp methodology

Keep creation, modification, release and observation as different fields with provenance. GitHub repository creation is not package release; repository update is not publication. An absent upstream date remains unknown. Use server observation/event sequence for synchronization, not a guessed publisher date.

Before changing the public contract, label real source cases and conflicting fronts. Define sortable fields and null handling explicitly. The default discovery ordering and cross-front date selection remain critical owner choices; the existing confidence labels do not justify conflating dates.

### R13-C8: feature-restoration method and editing surfaces

| Capability gap | Proposed retained intent | Safe implementation boundary |
| --- | --- | --- |
| GitHub standalone tools and discovery depth | Canonical packages for relevant first-party tools; richer scoped leads/releases | Explicit API jobs and publisher evidence, no unleased README/URL probes. |
| Storefront discovery and price | Real publisher fronts, truthful per-front facts | Reviewed endpoint fixtures, coordinator paging and unknown price/currency preserved. |
| Media pointers | Useful origin links where publication is allowed | Add bounded typed pointers only after source review. Do not restore BLOB caching or binary downloads. |
| Offline catalog export | Evaluate whether downstream clients need a snapshot | Export publishable facts only, with version/removal semantics. Do not export raw evidence, contact data or old image tables. |
| Moderation and correction | Reports plus auditable operator edits | Pending reports do not mutate trusted facts. Keep source evidence immutable and corrections separately attributed. |
| Classification and identity | Tools, Assets and Avatars with reversible links | Labeled positives/negatives, publisher relationships, no universal similarity threshold or cosmetic exclusion. |
| Source descriptions | Bounded, provenance-bearing useful context | Separate facts from creator expression; no character-count safe-harbor claim. |

These are proposed methods, not approval to restore every prototype feature. Each needs a bounded test/implementation slice and a descriptive docs/source update.

## R15 — reconciliation of owner lifecycle comments

Read both lifecycle ledgers on 2026-10-03. Preserve the author comments above and in the unmerged plan. A request to clarify or ground a method is not acceptance of that method.

| Decision | Accepted scope | Remaining boundary |
| --- | --- | --- |
| R13-C5 | Move the Worker implementation into `src-web`; keep the crawler node in `src-crawler`. | Actual entry, handlers, storage, tests and build/config callers must move together through bounded slices. No compatibility export wrappers. No remote deployment implied. |
| R13-C6 | Finalize downstream operator/user/app SDK contracts and npm delivery. | Do not make the published SDK a node-job client. Preserve separate internal lease schemas. Public contract choices and pack/install checks remain open. |
| R13-C9 | Add the listed negative-path and recovery tests. | An approved test gate is not proof that restart, revocation or delta behavior already works. |
| R13-C10 | Trace config use and retain identity/version constants only. | Do not restore the deleted dual-database root config to satisfy obsolete tests. Separate binary identity constants from launch-time node credentials and paths. |
| FLEET-S1 | Proceed with local Worker/D1 verification. | `06695cc` saves a passing native-runtime HTTP smoke. It does not yet exercise real node processes, all platforms or the eventual `src-web` Wrangler config. |
| FLEET-S3 | Review and proceed with Docker fleet configuration. | First align node entry, non-secret config, persistent storage and shutdown/restart behavior. Review update trust and host permissions before adding an updater. |
| FLEET-S2 / S4 | Seed policy needs more decision work; fleet simulation follows prerequisite gates. | Do not convert sample seed URLs, draft LEGAL text or other aggregators' behavior into source approval. |

### Source viability is not settled by an aggregator

R13-C11 identifies a useful lead: other VRChat aggregators demonstrate market relevance and may point to publisher fronts. This does not establish that indexing is prohibited, or that our exact access, retention and publication operations are permitted. Keep those questions separate. Review the applicable endpoint, terms scope, field classes and evidence under the legal library procedure; obtain a scoped source profile before live work. No new source grant was issued in this iteration.

### Newly traced recovery and migration gaps

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| critical | R15-C17 | Node task logs are not a durable result outbox | `src-crawler/src/node/runner/lease_runner.ts`, `runner/daemon.ts`, `storage/local_sqlite.ts` | The runner generates the submission key in memory. The daemon records success only after acknowledgement and stores only failure text on exceptions. The database contains no payload/key replay queue. Client retries reuse a payload within one call, but restart cannot do so. | Add an acknowledgement-loss/reopen fixture before designing bounded durable replay. Check coordinator receipt lookup, expiry, revoked profiles and retained field classes. Never replay by refetching without a fresh lease. | |
| critical | R15-C18 | Worker migration has live cross-project dependency and deployment-binding risks | `src-crawler/src/worker/worker_entry.ts`, both Wrangler files, `src-crawler/package.json`, `tests/preprod_layout.test.ts`, D1 tests and runtime smoke | The entry depends on Worker handlers/storage plus crawler shared protocols, policies, taxonomy and utilities. Web currently targets a generated Svelte Worker and binds VRCP_D1; the API entry expects DB. Preview and default config name the same D1 ID. | Map inbound/outbound callers per moved module. Test API-only routing and generated binding types locally; preserve the reported deployed resource until its target/isolation is established. Bound each slice to 2–3 files rather than a monorepo-wide replacement. | |

Native runtime smoke was repeated after these comments: one lease, one empty claim, schema-valid heartbeat, accepted result and duplicate receipt. External fetch count remained zero. Publication filtering, fabricated bootstrap grants/robots, proof-before-delist, config reconciliation and durable replay remain open. No overall milestone is declared complete.

## Historical ledger continuation

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
