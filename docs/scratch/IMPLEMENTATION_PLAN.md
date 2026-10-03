# Canonical Implementation Plan Ledger

## Current topology and next prerequisites

Latest owner split overrides earlier migration targets: API coordinator in `src-worker/src/`, native and contract tests in `src-worker/test/`, headless node in `src-crawler/src/`, static Astro site in `src-web/`, Tauri client in `src-crawler-client/`, consumer SDK in `src-package/`. No coordinator binary or migration wrappers. Review pauses remain deferred. Both new frontends are starters, not delivered dashboards or bundled-node clients.

Owner testing correction, 2026-10-03: implement a capability gate or related gate group before running tests. Do not repeat targeted/full suites after each slice. Track required fixtures and pending checks while implementing. Run them together at the gate checkpoint. Untested changes remain unverified, and no gate is complete until its required evidence passes. This overrides older per-slice red/green requirements without removing tests or weakening runtime safety controls.

The newest Cloudflare log ran from src-worker and failed on 16 unresolved dependencies: eight Zod, four SDK, three SemVer imports and the robots parser. R45 repairs local paths, entry/config and declared Worker dependencies. These repairs do not close isolated distribution. Owner removed and ignored lockfiles. Preserve that choice, recording reproducibility and release risks rather than restoring them.

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| fixed locally; review pending | R47-C26 | Discovery receipt commits before its leads | `src-worker/src/storage/d1/coordinator.ts`, `src-worker/test/coordinator_runtime_smoke.mjs` | Native first/second lead failures reproduced missing leads after committed receipts. Lead writes now share the result batch. Failure preserves lease/reservation and rolls back receipt/events/leads. Exact retry and duplicate replay pass. | Keep native regressions. Automatic promotion remains a separate audited action, without durable retry guarantees. No all-outcome recovery claim. | |
| critical; deferred | R47-C27 | Frontend integration and outbox decisions remain unspecified | `src-web/`, `src-crawler-client/`, `src-crawler/src/runner/` | Starter builds do not establish SDK consumption, browser authenticated CORS/Firebase or supervised desktop node operation. Durable payload retention has no agreed deadline or quota. | Sequence separate SDK/auth/browser and native lifecycle gates. Set outbox retention, identity scope and terminal rejection rules before persistent payload replay. Review starter license metadata and CSP. | |
| fixed locally; review pending | R48-C28 | Node accepted a receipt for the wrong job | `src-crawler/src/client/node_client.ts`, `src-crawler/tests/node_client_result.test.ts` | Schema-valid wrong-job responses previously completed submit. The client now requires matching jobId. Offline fixtures cover matching/malformed/wrong-job receipts, validated requests and identical retry bodies. | Keep the regressions. This does not establish restart-safe submission or change retry/retention policy. | |
| critical; deferred | R49-C29 | Catalog cursor bounds exceed what the encoder supports | `src-package/src/types/package.ts`, `src-package/src/protocol/catalog.ts`, catalog paging | Canonical IDs allow 500 characters. Base64url JSON can exceed the 256-character token limit, and btoa does not encode general Unicode. Generated UUIDs fit, but the DTO accepts more. | Add long/Unicode-ID fixtures before changing ID bounds or cursor encoding. Review catalog/delta/lead cursors together. Do not hide this with truncation. | |
| critical; deferred | R50-C30 | Four-database and authentication capacity plan lacks ownership/consistency decisions | `src-worker/wrangler.toml`, D1 storage, frontend/user contracts | Owner planning scenario separates registry/user databases in production and preview for ten nodes and 1,000 users. Current code has one binding per environment and no Firebase verification. Multiple databases share account quotas. A split changes joins, foreign keys and transaction boundaries. | Use the [corrected primary-source research](../research/topics/01_crawler_systems_and_infrastructure.md#d1-capacity-and-authentication-research). Clarify record ownership, cross-database writes, identity/revocation and environment targets before migration. Do not restore removed bindings or adopt KV auth authority from research alone. | |
| pending measurement | R50-C31 | Idle polling can dominate fleet traffic | `src-crawler/src/runner/daemon.ts`, D1 `claim`/`heartbeat` | Empty claims return a one-second delay. An idealized ten-node idle fleet yields 864,000 claims plus 28,800 heartbeats daily before latency/user traffic. This is arithmetic, not measured usage. Heartbeats write state and claims scan eligibility. | Measure per-operation D1 metadata, invocation queries and CPU. Compare coordinator-directed bounded backoff/jitter against latency requirements. Keep revocation checks and fail-closed leases. Do not equate requests, SQL calls and billed rows. | |

## Fleet plan — merged owner review

Merged from `UNMERGED_IMPLEMENTATION_PLAN.md` at the owner's request. This table owns FLEET-S1 through S4. Comments authorize only the stated scope. The latest owner instruction requires removal of finished, reviewed history; unresolved comments and decisions remain. Current paths replace proposed paths from before the migration.

Owner commented that needs to be internalized:
- coordinator/crawler should be able to distinguish between a furry/human(anime) avatar bases
- nsfw tag, because these areas do offer nsfw assets so it is critical to have this tag to prevent problematic indexing
- currently there are stale/duplicate documentation in docs/source (which should only contain candidate documentation reflecting the capabilities of this codebase). API_ROUTES.md however do remain true.
- [Prototype Parity](F:\.repo\.main\vrc-package-crawler\docs\research\audits\PROTOTYPE_PARITY.md) might need to be formalized into this ledger for some items that need open questions for later-decision making.

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| partial; approved | FLEET-S1 | Local Worker/D1 verification harness | `src-worker/package.json`, `src-worker/test/coordinator_runtime_smoke.mjs`, `src-worker/wrangler.toml` | Local API/D1 smoke passes initialization, registration, claim race, heartbeat and idempotent submission. It does not prove full fleet or remote staging behavior. | Keep the native runtime harness. Extend it to cover required failure paths and separate node processes before declaring the gate complete. No remote credentials or deployment are required for local checks. | proceed |
| needs decision | FLEET-S2 | Multi-platform initial seeds | `src-worker/src/storage/default_seeds.ts`, `src-worker/src/storage/d1/coordinator.ts` | VPM community repositories, approved GitHub repositories/releases (including the proposed vrc-get reference) and storefront listings need coordinator-managed seeds, real robots preflight and separate scoped access profiles. Fabricated bootstrap grants and snapshots were removed (R13-C2). Existing stored grants and placeholder candidates still need review. | Research and settle seed policy. Implement approved seed definitions and reviewed profile attachment without treating a public URL or draft LEGAL text as access approval. | needs more thorough decision making |
| deferred CI repair; fleet review open | FLEET-S3 | Docker fleet configuration | `docker-compose.yml` (proposed, absent), `src-crawler/Dockerfile`, `DELEGATES.md` | The node binary and Dockerfile exist, but fleet verification remains absent. Owner reports GitHub Docker CI build errors; exact failures have not been diagnosed. | Defer CI repair to this Docker delivery gate: capture failing logs, reproduce a clean image build, then verify Linux entry and persistence. Review credentials, persistent storage (`/app/data`), shutdown/restart, image trust and host permissions. Then implement fleet compose and environment configuration. Watchtower remains a proposed updater, not a verified safe deployment. Do not add privileged automatic updates without those checks. | review and proceed |
| gated | FLEET-S4 | Multi-platform end-to-end fleet ingestion | `tests/integration/fleet_crawl_simulation.test.ts` (proposed), `src-crawler/src/runner/daemon.ts`, `src-worker/src/worker_entry.ts` | Existing tests and native D1 smoke do not prove separate node processes ingest real data across all drivers. | After source-policy and safety prerequisites, exercise concurrent leases, approved real-source fetches, schema-valid receipts and canonical/search projections. | gated necessary completions before this slice |

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G12 | Local Worker verification, Docker fleet and multi-platform ingestion | Partial: native local D1 HTTP smoke and runtime separation pass. Seed policy, safe operator controls, Docker fleet, recovery and real-source ingestion remain open. FLEET-S1 through S4 define the remaining work. | |

## R16 — runtime ownership migration evidence, 2026-10-03

Production handlers/D1 now belong to `src-worker/src/`, node code to `src-crawler/src/`, and coordinator/integration tests to `src-worker/test/`. Test-only SQLite/config/robots helpers belong to `src-worker/test/support/`. The retired coordinator CLI remains in Git history only.

Latest measured evidence belongs to [the active tracker](task_tracker.md), not this decision ledger. Local tests/builds do not prove isolated remote builds, Linux images, real-source fleet ingestion or staging.

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| partial; critical | R16-C19 | Retired CLI operations lack Worker HTTP equivalents | Removed CLI at commit `06695cc:src-crawler/src/worker/main.ts`; `src-worker/src/api/operator_handler.ts` | Strict initialization and audited manual enqueue now have typed SDK/HTTP contracts. Seed identity and committed suppression/rule conflicts preserve queue/pacing state. Dedicated job_seed_actions records manual actions atomically; audit failures roll back writes. Audited node revocation has typed SDK/HTTP controls and native D1 verification; cached principals fail claim/heartbeat/submit and origin reservations remain until expiry. D1 refresh reservation/completion/release now pass native races, expiry/replacement, scoped-profile revocation, pacing and snapshot-write rollback. Refresh transport is not wired. Real robots preflight, suppression and issue/evidence inspection remain absent as direct HTTP controls. Native local D1 smoke passes enqueue/repeat and lease/result flow. | Continue remaining typed controls and coordinator-directed robots preflight. Verify native audit rollback and natural expiry boundary separately. No queued URL grants fetching, and no coordinator binary is restored. | |
| critical | R16-C20 | Source/runbook drafts still describe unsupported capabilities | `docs/source/`, `DELEGATES.md`, `README.md` | Runtime paths and local hosting claims were corrected. Remaining drafts include unsupported user lifecycle routes, proof verification, registry availability, update guarantees and stale SDK examples. | Compare every claimed route/feature with current handlers and SDK contracts. Correct measured descriptions without treating proposals as accepted behavior. Preserve owner comments. | |
| critical; deferred transport choice | R24-C21 | Safe robots transport is not portable from node to Worker | `src-crawler/src/client/public_metadata_fetch.ts`, `src-worker/src/worker_entry.ts`, shared robots retrieval | Node transport uses dns.lookup and HTTPS servername. [Worker DNS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/) excludes lookup. [Worker HTTPS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/https/) excludes servername. D1 ownership checks do not establish per-hop egress safety. | Research Worker-native egress guarantees and DNS rebinding defenses versus coordinator-leased node robots tasks. Defer the architectural choice before live fetch wiring. Preserve separate source approval, redirect policy, origin pacing and cancellation. Do not import node transport, weaken checks or treat robots as a grant. | |

Shared schema/policy ownership remains explicit: both runtimes still import internal pure contracts from `src-crawler/src/shared/`. These are not a node client published through the consumer SDK. VPM version helpers now live in the crawler, not the SDK; downstream contracts still use SDK schemas, so the declared SDK dependency and Docker source copy remain necessary. The sanitizer also imports an opt-in IANA refresh helper. Do not claim complete package independence from physical relocation alone.

## Current owner direction and critical audit — 2026-10-03

Latest owner instruction supersedes historical claims below. Prototype comparison at `09e9dc8` and research cleanup are recorded in Git history. Continue bounded implementation. Author-review pauses are deferred. Specifications and LEGAL are drafts except explicit owner comments. `docs/source` must describe current capabilities. API-only `src-worker` is the serving target. Physical SDK directory is `src-package/`.

Feature gaps are grounded in the [prototype parity audit](../research/audits/PROTOTYPE_PARITY.md); current checks live in [the active tracker](task_tracker.md).

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| fixed locally; research open | R13-C1 | D1 claim concurrency and queue/index research | `src-worker/src/storage/d1/coordinator.ts` | Native claim races now preserve one lease. Queue/search product choice is not settled by that result. | Keep the racing regression. Research broker/index choices against measured backlog and query plans before adoption. |suggestions were made to use cloudflare queues, i dont know if this would give benefits. Another thing is using cloudflare index to speedup other api endpoint queries such as bulk search and whatnot |
| partial; critical | R13-C2 | Bootstrap invents robots success and source approval | `src-worker/src/storage/default_seeds.ts`, coordinator `seedInitialJobs` | Fabricated 2099 grants and robots bodies were removed from both initializers. Fresh autoSeed queues candidates only. Reinitialization preserves reviewed/disabled profiles, robots restrictions, live leases and suppression. Previously stored grants and placeholder seed policy remain unresolved. | Keep separate scoped operator approval and real robots preflight. Review old bootstrap-created grants before any existing-database live run. Resolve candidate seed selection under FLEET-S2. Tests: Worker/integration 164 pass; native fresh-bootstrap claims empty without a separate profile. | previous agents working on this reasoned out that this is to initialize the coordinator with boundaries as per "LEGAL" specs, but it might not be fully right. Remain skeptical|
| critical | R13-C3 | Public projection ignores publication classes | coordinator `submit`, `buildCatalogPackage`, catalog methods | Reproduced catalog exposure with `publishClasses: []`. | Add no-publication fixtures. Gate each public field and front by evidence/profile rights. Define revocation behavior separately. | clarify|
| partial; critical | R13-C4 | Unverified notice mutation helpers remain unaudited | `src-worker/src/api/user_handler.ts`, coordinator `submitDelistRequest` | User delist route is retired. Removal reports remain pending. Direct notice helpers and proof verification still need review. User identity is not target ownership. | Preserve non-destructive reports. Audit remaining helpers, then clarify ownership and private notice retention before new moderation controls. | ground methodology|
| fixed locally; deployment gated | R13-C5 | API-only hosting ownership | `src-worker/wrangler.toml`, `src-worker/src/worker_entry.ts` | Latest owner split moved the API to src-worker. Runtime and configuration now use VRCP_D1. Distinct resource IDs remain unchanged. | Keep native binding tests. Verify isolated dependency installation and remote setup before deployment. No deployed capability inferred from local checks. | this is version 0, full migration approved to src-web for worker instance. Keep node in src-crawler|
| partial; critical | R13-C6 | SDK contract and npm delivery not finalized | `src-package/package.json`, `src-package/src/client.ts`, public handler | R49 fixes public index input/output parity: only limit/cursor, default 50, maximum 100, canonical cursor checks and the full strict receipt. Handler-backed pagination and installed Node/declaration/native Worker checks pass. Search/delta behavior is unchanged. Lead defaulting and camel/snake normalization still differ from Worker schemas. Registry release and production artifact consumption remain open. | Preserve operator/user/app consumer scope. Add differential fixtures before replacing internal wrappers. Resolve registry identity/version/license and artifact ownership, then prove isolated service consumption. | accepted |
| critical | R13-C7 | Timestamp semantics drift | adapter `parseObservation`, coordinator `submit`, LEGAL §2.4 | Modification dates project as publication dates. Draft and tests use different confidence rubrics. | Separate observed/created/modified/released times. Ask which public sorting semantics are wanted. Never invent publication dates. | ground methodology|
| critical | R13-C8 | Lost prototype capabilities lack explicit disposition | [parity matrix](../research/audits/PROTOTYPE_PARITY.md) | Media pointers, export, discovery depth, standalone GitHub canonical entries and moderation are partial/absent. | Prioritize each gap against current owner intent. Do not restore BLOB caches, unleased probes, fabricated VPM versions or unsafe steering. | ground methodology and features for editing|
| pending | R13-C9 | Source/profile publication, provisional fronts and recovery need failure tests | D1 projection, node store/runner | Existing tests cover local SQLite extensively but not the full deployed topology. | Add restart/outbox, equal-time deltas, hard-delete tombstones, revoked publication, malformed metadata and false-link tests sequentially. | aproved|
| partial | R13-C10 | Stale governance and config references | root layout tests, `.agents/`, source drafts | Layout fixtures now match the split without restoring deleted config. Existing skill references still point to missing packages and deleted scratch files. Identity/version configuration review remains open. | Reconcile identity constants and remaining skill references without restoring obsolete runtime targets. Keep scratch at three documents. | the config was meant for identity and versioning, purposely deleted in order to trace code and review necesary steps to only provide identity and version config across crawler c|
| critical | R13-C11 | Source clearance and legal promises exceed evidence | LEGAL.md, bootstrap profiles, prior research | Payhip/Sellfy public visibility did not establish access approval; privacy, ownership, media and publication promises differ from code. | Use the legal library's operation/field review. Obtain scoped primary evidence and counsel review where needed. Do not bootstrap clearance from research prose. |vrchat-related products may be indexable as similar aggregators advertise listings from these websites in vrchat market ecosystem|

Research cleanup R13 shipped as `fccae0a`. Implementation remains active. Technical blockers are verified evidence, not permission to redefine the goal as documentation-only.


## Implementation follow-through

## R14 evidence and replies to owner comments — 2026-10-03


The latest goal attachment `addfa15f-0607-4fe4-b975-e1cacc86bb51/goal-objective.md` was read. Owner comment R13-C5 approves full Worker migration to src-web, with the node kept in src-crawler. No compatibility re-export layer is requested. The immediate service target remains API-only; future dashboard/auth work stays separate.

| Status | ID | Evidence / uncertainty | Next action |
| --- | --- | --- | --- |
| fixed locally | R14-C12 | Native D1 exec rejected multiline schema commands. The Bun mock hid this. | Fixed static command formatting and line-oriented fixture. Keep real runtime tests during migration. |
| fixed locally | R14-C13 | Browser Worker bundle could not call node:crypto randomBytes for node credentials. | Web Crypto fixture and real registration now pass. Preserve portable imports; bundle decreased from about 1.55 MB to 0.63 MB. |
| critical | R14-C14 | Initialization has many DDL commands plus alterations; target plan and invocation query accounting are unverified. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) state 50 queries on Free versus 1000 on Paid. Claim candidate scanning can also accumulate queries. | Move schema setup toward supported migrations. Measure request budgets and bound scans. Do not infer Free-plan readiness from the local runtime. |
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
| R13-C5 | Migration approved. Latest owner split places the API in `src-worker` and keeps the node in `src-crawler`. | Entry, handlers, storage, tests and build/config callers now follow that split. No compatibility export wrappers. No remote deployment implied. |
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
| critical | R15-C17 | Node task logs are not a durable result outbox | `src-crawler/src/runner/lease_runner.ts`, `runner/daemon.ts`, `storage/local_sqlite.ts`, `client/node_client.ts` | Submission payload/key remain in memory. Exceptions mark tasks failed. Existing receipts replay after source/lease expiry, but not credential revocation. Success counters are not atomic or repeat-safe. | Reopen the database after lost ACK without fixture-supplied payload. Persist a minimized request before submit, replay directly without heartbeat/refetch, atomically complete the original task once, and scope it to node/coordinator identity. Defer critical TTL/quota and terminal rejection choices. R47 receipt/lead atomicity is a prerequisite. | |
| active; critical | R15-C18 | Isolated Worker build and cross-project dependency ownership | `src-worker/wrangler.toml`, `src-worker/src/`, `src-crawler/src/shared/`, `src-package/` | Latest production.dbb64f2f log confirms 16 unresolved dependency imports after installing Worker dependencies. Worker still imports sibling source. Local sibling installs hide this defect. Distinct D1 IDs and local binding repairs do not prove remote isolation. | Consume approved SDK distribution and settle internal service/package ownership without node-client SDK leakage, then prove clean isolated install/build. Preserve owner no-lockfile policy and record reproducibility risk. Keep dev/staging/prod separate. Do not mark imports external, add aliases or install sibling trees to hide the boundary. No registry/deployment authority implied. | |


## Distribution release boundary

Owner API correction (R33–R37): app/node collections must be GET-only with ownership-scoped detail GETs. App creation remains the documented `/v1/app/register`, now authenticated for users or configured operators. App ownership is FK-backed and written atomically; old/operator-created records stay unowned. GET `/v1/user/apps` and `/{appId}` return bounded metadata-only views, verified for isolation, pagination, revoked users and secret absence. App collection POST and SDK user.registerApp are retired. Singular `/v1/app/report` accepts pending removal_request records without suppression or demand; plural reporting, user delisting and random sampling are removed. Native D1 and installed SDK checks pass; current measurements belong in task_tracker.md. Node ownership, node GETs and collection POST retirement remain next: verify documented provisioning before changing it. Old direct notice mutation helpers/public schemas and report review controls still require audit. Coordinator-directed claim remains the scheduling boundary; a global node jobs list does not authorize node self-assignment.

Critical R28-C22: internal lease/capability, robots/policy and projection ownership needs a separate package or service-owned boundary. The consumer SDK is not a node-task package. See the [dependency boundary matrix](../research/CRAWLER_DEPENDENCY_RESEARCH.md#worker-and-npm-distribution-boundaries). Defer package placement and release identity for owner review. Do not copy shared code, add forwarding wrappers or change build roots as a substitute for distribution.

R38-C23 fixed locally: a handler-backed SDK test reproduced strict rejection of the extra signalId. The Worker now validates the published reportId receipt, preserving stored signal IDs, demand/issue status 200 and removal status 202. Native HTTP/D1 SDK parsing passes all three types. Report scheduling semantics were not changed; pending removal remains non-destructive.

Critical R39-C24 — deferred owner choice: API_ROUTES documents /v1/operator/nodes as the remaining creation route. Its IssueNodeCredential contract has no ownerUserId; node_credentials has no ownership relation. Should operator issuance explicitly accept a validated user owner, with atomic FK ownership and audit, leaving old/operator-only nodes unowned? No separate user registration route is documented. Do not infer ownership from actor strings or invent a new public route. Node list/detail reads cannot safely identify a user's created entries until this is settled. User collection POST, SDK user.registerNode and its DTOs are now removed. No-write fixtures verify that removed HTTP calls cannot issue, replace or reactivate credentials. Existing operator issuance remains; its upsert/atomic audit behavior needs its own review.

Critical R40-C25 — owner taxonomy concern: src-package retains only the three fixed umbrella values in its taxonomy subpath. R44 removed unused desktop/avatar evidence DTOs and fixed subtypes, with built and installed-package exclusion tests. Owner-marked crawler SemVer helpers were moved back under R41; their SDK exports and direct dependency are removed. No discovered tag dictionary is exported by the SDK. Actual platformTags flow from adapters into coordinator classification; known avatar bases and category matching are hardcoded in Worker domain/classification files. CatalogPackage has no tags field; search tags perform category/name/avatar heuristics rather than matching a published indexed tag collection. No coordinator vocabulary/facet endpoint exists. Separate wire types in SDK from coordinator-owned indexed vocabulary, provenance and classification policy. Confirm the remaining dynamic taxonomy contract before inventing routes or replacing heuristics. Verify storage, projection, filtering and packaged exports together, not merely folder naming.

R43 ownership correction: the unchanged classifiers now belong to src-worker/src/domain/classification, with tests under src-worker/test. The crawler retains only its SemVer helper/tests from this group, without classifier forwarding exports. Dynamic tags, profile settings, furry/human(anime) distinctions and NSFW evidence remain open. The local bundle includes three physical Zod copies. R15-C18 retains clean distribution and bundle verification, with panel setup suggestions in the dependency research checklist. Moving these files does not close either gate.

Owner clarification for R40-C25: keep the three umbrellas tools/assets/avatars. Under them, tag ingestion and profile-driven settings belong to the Worker database, with orthogonal/hierarchical relationships. Canonical packages must retain an attached JSON tag list; dynamic vocabulary must not require SDK releases. The SDK may define the tag wire shape, not the available values. Sequence storage/schema round-trip, provenance-aware aggregation, permitted public projection and real tag filtering. Source access/publication rights are separate from classification profiles. Defer the exact classification-profile settings and hierarchy relation contract rather than inventing them. Existing hardcoded classifiers and source evidence duplicates require review, not blind transfer to the consumer SDK.

Owner proposal, not an accepted rename: consider a dedicated VPM umbrella. VPM is a distribution protocol and can describe Tools, Assets or Avatars; current VPM ingestion already derives purpose umbrella from platformTags. A separate VPM view/facet preserves purpose and multi-front canonical identity. A mutually exclusive VPM umbrella instead requires an explicit precedence rule and coordinated DB/schema/search/delta changes. Do not duplicate a canonical package merely because it has both VPM and storefront fronts. Keep the three existing umbrellas until the owner selects the intended model.

SDK builds now clear only generated dist before compilation. A stale JavaScript/declaration regression failed against the prior build and now passes. Isolated npm tarball installation, ordinary Node, strict declarations and native Worker checks pass after the change. This does not fix production cross-project imports or approve registry publication.

Packed-client fixtures also verify serialized operator requests, strict success responses and HTTP error handling. A reproduced non-JSON error consumed the body twice and hid status; single-read parsing now preserves VrcApiError status/details. These synthetic transport checks do not prove a live coordinator or deployment.

Public auto-queue and operator credential DTOs now have one SDK definition. Rules retain the implemented VPM-only scope and canonical origin/path constraints. Native HTTP tests prove valid rule persistence, malformed-request rejection without new records and SDK response parsing. Operator and user credential responses enforce bounded IDs and nonempty capability lists. Rules still require separate source approval and robots preflight before fetching. Internal token decoding and leases are not SDK features.

Registry publication needs owner confirmation of package identity, release version and license metadata. The SDK has an Apache LICENSE file while repository-wide license covenants describe AGPL. Preserve both pending review. Do not silently relicense code, publish a package or attach an unverified registry identity to Cloudflare Builds.

## Retained architecture and foundation covenants

Historical completed-and-approved DOC-S1–S4 and G7/G8/G10/G11 rows were pruned under the latest owner instruction. Their code remains subject to the open audit above; approval history is not current capability proof.

- Worker coordinator: `src-worker/src/`, D1 storage, API-only local serving. Standalone node: `src-crawler/src/`; HTTPS, versioned payloads, no coordinator binary. Astro site and Tauri shell are separate projects.
- Nodes fetch only under unexpired coordinator leases; coordinator loss stops fetching. A queued URL is not permission. Scoped source profiles and real robots checks remain separate gates.
- Node credentials encode capabilities and persist only as SHA-256 hashes. Catalog umbrellas are Tools, Assets and Avatars, with provenance.
- Owner clarified that the 2–3-file limit concerns `docs/scratch/`, not source surgery. Keep only the canonical ledger, unmerged proposal template and active tracker.
- CANON-1: expand through scoped manifests, publisher links and approved discovery leads; no unindexed open-web crawl.
- CANON-2: cosmetics belong in Assets with base-avatar relationships; do not merge them with unrelated tools.
- CANON-3: community catalogs are discovery leads, not authoritative product records. Historical API/manifest-only access wording needs reconciliation before any DOM crawling; it is not a source grant.
- CANON-4: versioned source evidence and accepted identity links; start fresh rather than silently migrating prototype data.
- CANON-5: anonymous demand aggregation without session tracking or PII; verify implementation before claiming compliance.
- CANON-6: user authentication, private lists and recommendations belong downstream. Historical “stateless and unauthenticated backend” wording does not waive node/app/operator authentication or coordinator persistence.
- Media: origin pointers, no local image BLOB caching or archive/executable crawling. Remote pointers do not establish publication rights or legal immunity.
- Creator removal: scoped proof or recorded operator verdict is the intended boundary. DNS/bio challenge verification remains proposed, not delivered (R13-C4).
- Terms header: `VRC-Packages-Terms-Of-Use`.

## Remaining historical gates

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G6 | Worker/D1 remote staging | Local runtime only. Remote build isolation, query budgets, binding isolation and manual staging remain unverified. | deferred for skeptical review |
| G9 | Operator panel and self-service portal | Deferred; API-only src-worker serves the coordinator. src-web and src-crawler-client are separate starters. Do not infer delivered UI/auth from framework files. | deferred |
