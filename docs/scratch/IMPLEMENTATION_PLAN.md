# Canonical Implementation Plan Ledger

## Fleet plan — merged owner review

Merged from `UNMERGED_IMPLEMENTATION_PLAN.md` at the owner's request. This table owns FLEET-S1 through S4. Comments authorize only the stated scope. The latest owner instruction requires removal of finished, reviewed history; unresolved comments and decisions remain. Current paths replace proposed paths from before the migration.

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| partial; approved | FLEET-S1 | Local Worker/D1 verification harness | `src-web/package.json`, `src-web/tests/coordinator_runtime_smoke.mjs`, `src-web/wrangler.toml` | Local API/D1 smoke passes initialization, registration, claim race, heartbeat and idempotent submission. It does not prove full fleet or remote staging behavior. | Keep the native runtime harness. Extend it to cover required failure paths and separate node processes before declaring the gate complete. No remote credentials or deployment are required for local checks. | proceed |
| needs decision | FLEET-S2 | Multi-platform initial seeds | `src-web/src/worker/storage/default_seeds.ts`, `src-web/src/worker/storage/d1/coordinator.ts` | VPM community repositories, approved GitHub repositories/releases (including the proposed vrc-get reference) and storefront listings need coordinator-managed seeds, real robots preflight and separate scoped access profiles. Fabricated bootstrap grants and snapshots were removed (R13-C2). Existing stored grants and placeholder candidates still need review. | Research and settle seed policy. Implement approved seed definitions and reviewed profile attachment without treating a public URL or draft LEGAL text as access approval. | needs more thorough decision making |
| deferred CI repair; fleet review open | FLEET-S3 | Docker fleet configuration | `docker-compose.yml` (proposed, absent), `src-crawler/Dockerfile`, `DELEGATES.md` | The node binary and Dockerfile exist, but fleet verification remains absent. Owner reports GitHub Docker CI build errors; exact failures have not been diagnosed. | Defer CI repair to this Docker delivery gate: capture failing logs, reproduce a clean image build, then verify Linux entry and persistence. Review credentials, persistent storage (`/app/data`), shutdown/restart, image trust and host permissions. Then implement fleet compose and environment configuration. Watchtower remains a proposed updater, not a verified safe deployment. Do not add privileged automatic updates without those checks. | review and proceed |
| gated | FLEET-S4 | Multi-platform end-to-end fleet ingestion | `tests/integration/fleet_crawl_simulation.test.ts` (proposed), `src-crawler/src/runner/daemon.ts`, `src-web/src/worker/worker_entry.ts` | Existing tests and native D1 smoke do not prove separate node processes ingest real data across all drivers. | After source-policy and safety prerequisites, exercise concurrent leases, approved real-source fetches, schema-valid receipts and canonical/search projections. | gated necessary completions before this slice |

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G12 | Local Worker verification, Docker fleet and multi-platform ingestion | Partial: native local D1 HTTP smoke and runtime separation pass. Seed policy, safe operator controls, Docker fleet, recovery and real-source ingestion remain open. FLEET-S1 through S4 define the remaining work. | |

## R16 — runtime ownership migration evidence, 2026-10-03

The owner moved the Worker tree and tests. Import repair now places production Worker handlers/D1 in `src-web/src/worker/`, node implementation in functional folders under `src-crawler/src/`, Worker tests under `src-web/tests/worker/`, and cross-runtime tests under `src-web/tests/integration/`. The owner renamed the internal client file to `client/node_client.ts`. Test-only SQLite/config/robots helpers live under `src-web/tests/support/`. The obsolete coordinator CLI and forwarding files were removed, without replacement wrappers. Git history retains the removed implementation.

Latest measured evidence belongs to [the active tracker](task_tracker.md), not this decision ledger. Local tests/builds do not prove isolated remote builds, Linux images, real-source fleet ingestion or staging.

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| partial; critical | R16-C19 | Retired CLI operations lack Worker HTTP equivalents | Removed CLI at commit `06695cc:src-crawler/src/worker/main.ts`; `src-web/src/worker/api/operator_handler.ts` | Strict initialization and audited manual enqueue now have typed SDK/HTTP contracts. Seed identity and committed suppression/rule conflicts preserve queue/pacing state. Dedicated job_seed_actions records manual actions atomically; audit failures roll back writes. Audited node revocation has typed SDK/HTTP controls and native D1 verification; cached principals fail claim/heartbeat/submit and origin reservations remain until expiry. D1 refresh reservation/completion/release now pass native races, expiry/replacement, scoped-profile revocation, pacing and snapshot-write rollback. Refresh transport is not wired. Real robots preflight, suppression and issue/evidence inspection remain absent as direct HTTP controls. Native local D1 smoke passes enqueue/repeat and lease/result flow. | Continue remaining typed controls and coordinator-directed robots preflight. Verify native audit rollback and natural expiry boundary separately. No queued URL grants fetching, and no coordinator binary is restored. | |
| critical | R16-C20 | Source/runbook drafts still describe unsupported capabilities | `docs/source/`, `DELEGATES.md`, `README.md` | Runtime paths and local hosting claims were corrected. Remaining drafts include unsupported user lifecycle routes, proof verification, registry availability, update guarantees and stale SDK examples. | Compare every claimed route/feature with current handlers and SDK contracts. Correct measured descriptions without treating proposals as accepted behavior. Preserve owner comments. | |
| critical; deferred transport choice | R24-C21 | Safe robots transport is not portable from node to Worker | `src-crawler/src/client/public_metadata_fetch.ts`, `src-web/src/worker/worker_entry.ts`, shared robots retrieval | Node transport uses dns.lookup and HTTPS servername. [Worker DNS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/) excludes lookup. [Worker HTTPS](https://developers.cloudflare.com/workers/runtime-apis/nodejs/https/) excludes servername. D1 ownership checks do not establish per-hop egress safety. | Research Worker-native egress guarantees and DNS rebinding defenses versus coordinator-leased node robots tasks. Defer the architectural choice before live fetch wiring. Preserve separate source approval, redirect policy, origin pacing and cancellation. Do not import node transport, weaken checks or treat robots as a grant. | |

Shared schema/policy ownership remains explicit: both runtimes still import internal pure contracts from `src-crawler/src/shared/`. These are not a node client published through the consumer SDK. Node schema validation reuses SDK version/schema utilities, so its declared SDK dependency and Docker source copy remain necessary. The sanitizer also imports an opt-in IANA refresh helper. Do not claim complete package independence from physical relocation alone.

## Current owner direction and critical audit — 2026-10-03

Latest owner instruction supersedes historical claims below. Compare prototype `09e9dc8` before architecture migration. Organize research, commit/push `research clean up`, then continue bounded implementation. Author-review pauses are deferred. Specifications and LEGAL are drafts except explicit owner comments. `docs/source` must describe current capabilities. API-only `src-web` is the current serving target. Physical SDK directory is `src-package/`.

Feature gaps are grounded in the [prototype parity audit](../research/audits/PROTOTYPE_PARITY.md); current checks live in [the active tracker](task_tracker.md).

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| critical | R13-C1 | D1 concurrent claims issue two leases for one job | `src-crawler/src/worker/storage/d1/coordinator.ts:293` | Reproduced with two concurrent claims. Eligibility reads precede unconditional writes. | Add racing D1 regression, conditional atomic reservation and loser handling before fleet runs. |suggestions were made to use cloudflare queues, i dont know if this would give benefits. Another thing is using cloudflare index to speedup other api endpoint queries such as bulk search and whatnot |
| partial; critical | R13-C2 | Bootstrap invents robots success and source approval | `src-web/src/worker/storage/default_seeds.ts`, coordinator `seedInitialJobs` | Fabricated 2099 grants and robots bodies were removed from both initializers. Fresh autoSeed queues candidates only. Reinitialization preserves reviewed/disabled profiles, robots restrictions, live leases and suppression. Previously stored grants and placeholder seed policy remain unresolved. | Keep separate scoped operator approval and real robots preflight. Review old bootstrap-created grants before any existing-database live run. Resolve candidate seed selection under FLEET-S2. Tests: Worker/integration 164 pass; native fresh-bootstrap claims empty without a separate profile. | previous agents working on this reasoned out that this is to initialize the coordinator with boundaries as per "LEGAL" specs, but it might not be fully right. Remain skeptical|
| critical | R13-C3 | Public projection ignores publication classes | coordinator `submit`, `buildCatalogPackage`, catalog methods | Reproduced catalog exposure with `publishClasses: []`. | Add no-publication fixtures. Gate each public field and front by evidence/profile rights. Define revocation behavior separately. | clarify|
| critical | R13-C4 | Unverified notices and unrelated user tokens can delist | `src-crawler/src/worker/api/user_handler.ts`, coordinator `submitDelistRequest` | Reproduced pending unauthenticated proof immediately changes lifecycle. User identity is not target ownership. | Record requests without destructive action until verified ownership/operator verdict. Clarify owner model and privacy/notice retention. | ground methodology|
| critical | R13-C5 | Deployment and API-only hosting ownership | `src-web/wrangler.toml`, `src-crawler/wrangler.toml`, Worker entry | Web serves generated Svelte Worker with VRCP_D1. Coordinator expects DB. Crawler uses placeholder IDs. | After research, migrate API code in bounded slices. Clarify same existing Worker versus a separate API service before remote deployment. No deployed capability inferred from local files. | this is version 0, full migration approved to src-web for worker instance. Keep node in src-crawler|
| critical | R13-C6 | SDK contract and npm delivery not finalized | `src-package/package.json`, `src-package/src/client.ts`, public handler | SDK query sends unsupported filters. Exports target built ESM/declarations. Packed install, Node subpaths, strict declarations, isolated Wrangler build and native Worker execution pass. Lead cursors require the Worker wire fields. Public source-profile path/query/evidence checks now have one SDK definition. Coordinator policy retains private-IP origin denial and operational lease matching. Registry release and production artifact consumption remain open. | Preserve operator/user/app consumer scope. Keep typed JS/declaration output and packed-consumer checks. Audit remaining public schemas. Resolve registry identity/version/license, then consume approved distributions. | accepted |
| critical | R13-C7 | Timestamp semantics drift | adapter `parseObservation`, coordinator `submit`, LEGAL §2.4 | Modification dates project as publication dates. Draft and tests use different confidence rubrics. | Separate observed/created/modified/released times. Ask which public sorting semantics are wanted. Never invent publication dates. | ground methodology|
| critical | R13-C8 | Lost prototype capabilities lack explicit disposition | [parity matrix](../research/audits/PROTOTYPE_PARITY.md) | Media pointers, export, discovery depth, standalone GitHub canonical entries and moderation are partial/absent. | Prioritize each gap against current owner intent. Do not restore BLOB caches, unleased probes, fabricated VPM versions or unsafe steering. | ground methodology and features for editing|
| pending | R13-C9 | Source/profile publication, provisional fronts and recovery need failure tests | D1 projection, node store/runner | Existing tests cover local SQLite extensively but not the full deployed topology. | Add restart/outbox, equal-time deltas, hard-delete tombstones, revoked publication, malformed metadata and false-link tests sequentially. | aproved|
| pending | R13-C10 | Stale governance and config references | root layout tests, `.agents/`, source drafts | Missing config causes two failures. Skill references point to deleted scratch files. | Reconcile intended config, repair live links and remove false completed claims. Keep scratch at three documents. | the config was meant for identity and versioning, purposely deleted in order to trace code and review necesary steps to only provide identity and version config across crawler c|
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
| critical | R15-C17 | Node task logs are not a durable result outbox | `src-crawler/src/runner/lease_runner.ts`, `runner/daemon.ts`, `storage/local_sqlite.ts` | The runner generates the submission key in memory. The daemon records success only after acknowledgement and stores only failure text on exceptions. The database contains no payload/key replay queue. Client retries reuse a payload within one call, but restart cannot do so. | Add an acknowledgement-loss/reopen fixture before designing bounded durable replay. Check coordinator receipt lookup, expiry, revoked profiles and retained field classes. Never replay by refetching without a fresh lease. | |
| active; critical | R15-C18 | Isolated Worker build and cross-project dependency ownership | `src-web/wrangler.toml`, `src-web/src/worker/`, `src-crawler/src/shared/`, `src-package/` | Owner reports Cloudflare Builds (not GitHub) cannot build cross-folder imports with different dependency roots. Owner now prioritizes true npm distribution rather than path patches. Local build success does not refute this. API-only entry/DB binding now work locally; preview and default still name the same D1 ID. | Finalize the SDK artifact and independent package consumption before Worker staging. Obtain failing logs and build-root settings; map shared dependencies, settle ownership without node-client SDK leakage, then prove a clean isolated install/build and binding isolation. Do not deploy or restore wrappers to hide it. | |


## Distribution release boundary

Owner API correction (R33–R37): app/node collections must be GET-only with ownership-scoped detail GETs. App creation remains the documented `/v1/app/register`, now authenticated for users or configured operators. App ownership is FK-backed and written atomically; old/operator-created records stay unowned. GET `/v1/user/apps` and `/{appId}` return bounded metadata-only views, verified for isolation, pagination, revoked users and secret absence. App collection POST and SDK user.registerApp are retired. Singular `/v1/app/report` accepts pending removal_request records without suppression or demand; plural reporting, user delisting and random sampling are removed. Native D1 and installed SDK checks pass; current measurements belong in task_tracker.md. Node ownership, node GETs and collection POST retirement remain next: verify documented provisioning before changing it. Old direct notice mutation helpers/public schemas and report review controls still require audit. Coordinator-directed claim remains the scheduling boundary; a global node jobs list does not authorize node self-assignment.

Critical R28-C22: internal lease/capability, robots/policy and projection ownership needs a separate package or service-owned boundary. The consumer SDK is not a node-task package. See the [dependency boundary matrix](../research/CRAWLER_DEPENDENCY_RESEARCH.md#worker-and-npm-distribution-boundaries). Defer package placement and release identity for owner review. Do not copy shared code, add forwarding wrappers or change build roots as a substitute for distribution.

R38-C23 fixed locally: a handler-backed SDK test reproduced strict rejection of the extra signalId. The Worker now validates the published reportId receipt, preserving stored signal IDs, demand/issue status 200 and removal status 202. Native HTTP/D1 SDK parsing passes all three types. Report scheduling semantics were not changed; pending removal remains non-destructive.

Critical R39-C24 — deferred owner choice: API_ROUTES documents /v1/operator/nodes as the remaining creation route. Its IssueNodeCredential contract has no ownerUserId; node_credentials has no ownership relation. Should operator issuance explicitly accept a validated user owner, with atomic FK ownership and audit, leaving old/operator-only nodes unowned? No separate user registration route is documented. Do not infer ownership from actor strings or invent a new public route. Node list/detail reads cannot safely identify a user's created entries until this is settled. User collection POST, SDK user.registerNode and its DTOs are now removed. No-write fixtures verify that removed HTTP calls cannot issue, replace or reactivate credentials. Existing operator issuance remains; its upsert/atomic audit behavior needs its own review.

Critical R40-C25 — owner taxonomy concern: src-package exports fixed umbrella/desktop subtype enums, duplicated desktop/avatar evidence DTOs and crawler-specific SemVer helpers (owner FIXME says move back). No discovered tag dictionary is exported by the SDK. Actual platformTags flow from adapters into coordinator classification; known avatar bases and category matching are hardcoded in crawler shared files imported by the Worker. CatalogPackage has no tags field; search tags perform category/name/avatar heuristics rather than matching a published indexed tag collection. No coordinator vocabulary/facet endpoint exists. Separate wire types in SDK from coordinator-owned indexed vocabulary, provenance and classification policy. Confirm intended dynamic taxonomy boundary before inventing routes or migrating classifiers. Verify storage, projection, filtering and packaged exports together, not merely folder naming.

Owner clarification for R40-C25: keep the three umbrellas tools/assets/avatars. Under them, tag ingestion and profile-driven settings belong to the Worker database, with orthogonal/hierarchical relationships. Canonical packages must retain an attached JSON tag list; dynamic vocabulary must not require SDK releases. The SDK may define the tag wire shape, not the available values. Sequence storage/schema round-trip, provenance-aware aggregation, permitted public projection and real tag filtering. Source access/publication rights are separate from classification profiles. Defer the exact classification-profile settings and hierarchy relation contract rather than inventing them. Existing hardcoded classifiers and source evidence duplicates require review, not blind transfer to the consumer SDK.

Owner proposal, not an accepted rename: consider a dedicated VPM umbrella. VPM is a distribution protocol and can describe Tools, Assets or Avatars; current VPM ingestion already derives purpose umbrella from platformTags. A separate VPM view/facet preserves purpose and multi-front canonical identity. A mutually exclusive VPM umbrella instead requires an explicit precedence rule and coordinated DB/schema/search/delta changes. Do not duplicate a canonical package merely because it has both VPM and storefront fronts. Keep the three existing umbrellas until the owner selects the intended model.

SDK builds now clear only generated dist before compilation. A stale JavaScript/declaration regression failed against the prior build and now passes. Isolated npm tarball installation, ordinary Node, strict declarations and native Worker checks pass after the change. This does not fix production cross-project imports or approve registry publication.

Packed-client fixtures also verify serialized operator requests, strict success responses and HTTP error handling. A reproduced non-JSON error consumed the body twice and hid status; single-read parsing now preserves VrcApiError status/details. These synthetic transport checks do not prove a live coordinator or deployment.

Public auto-queue and operator credential DTOs now have one SDK definition. Rules retain the implemented VPM-only scope and canonical origin/path constraints. Native HTTP tests prove valid rule persistence, malformed-request rejection without new records and SDK response parsing. Operator and user credential responses enforce bounded IDs and nonempty capability lists. Rules still require separate source approval and robots preflight before fetching. Internal token decoding and leases are not SDK features.

Registry publication needs owner confirmation of package identity, release version and license metadata. The SDK has an Apache LICENSE file while repository-wide license covenants describe AGPL. Preserve both pending review. Do not silently relicense code, publish a package or attach an unverified registry identity to Cloudflare Builds.

## Retained architecture and foundation covenants

Historical completed-and-approved DOC-S1–S4 and G7/G8/G10/G11 rows were pruned under the latest owner instruction. Their code remains subject to the open audit above; approval history is not current capability proof.

- Worker coordinator: `src-web/src/worker/`, D1 storage, API-only local serving. Standalone node: `src-crawler/src/`; HTTPS, versioned payloads, no coordinator binary.
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
| G9 | Operator panel and self-service portal | Deferred; API-only src-web is the current target. Do not infer delivered UI/auth from framework files. | deferred |
