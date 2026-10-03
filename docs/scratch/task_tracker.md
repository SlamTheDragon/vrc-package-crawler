# Active slice and recovery checkpoint

## R22 — audited node revocation

Active R16-C19/R13-C6 slice: POST /v1/operator/nodes/{nodeId}/revoke and SDK operator.nodes.revoke. Reuse node credential audit storage. Revocation and audit must commit atomically, fail for unknown nodes, preserve the first revocation timestamp on repeats and never return credentials. Revoked principals cannot claim, heartbeat or submit. Keep an outstanding origin reservation until its existing expiry to avoid overlapping an already in-flight request. This control cannot retract network bytes already fetched. Replace the unaudited comparator revoke method and its fixture callers, without compatibility wrappers.

## R21 — audited operator enqueue

Active R16-C19/R13-C6 slice: add POST /v1/operator/jobs and SDK operator.jobs.enqueue with strict versioned URL/platform/purpose/delay/reason input. Reuse seedJob safety and transactional writes. A dedicated job_seed_actions table records successful manual queue actions without abusing lead-key audit references. Audit insertion failure must roll back queue/pacing changes. Repeated matching enqueue returns the existing ID, preserves lease/state and records each accepted operator action; it does not force refresh or grant fetching. Test auth, bad input, conflicts, suppression, absent profiles/robots, and audit rollback. No new driver, approval or remote deployment.

R21 delivered locally: SDK schemas/method, authenticated Worker route and transactional audit table exist in D1 and the SQLite comparator. Initial SDK-to-Worker fixture failed at the absent method. Tests now cover successful repeats, zero implicit profiles/robots, empty claims, unauthorized/schema/unsafe/suppressed/conflicting input, existing done-state preservation, and audit failures rolling back new origins/jobs or pacing increases. Targeted Worker/comparator: 45 pass. Full suite: 354 pass / 2 existing identity-config failures, 356 tests, 2461 assertions. Node/SDK/Worker typechecks, Worker dry-run and native workerd/local D1 enqueue/repeat/bootstrap/claim/result/replay pass with zero external requests. API/schema references updated. Native smoke exercises successful audit inserts, not failure rollback. No remote D1 changed. Read/audit inspection endpoint and a force-refresh operation are absent; this route does not claim to supply them. Remaining operator parity: revoke, real robots preflight, suppression and issue/evidence inspection. General ledger compaction remains deferred.

## R20 — seed authority changes between read and write

Active R16-C19 prerequisite: seedJob reads suppression and rule state before its D1 batch. Hypothesis: repeat authority predicates inside every seed write, so a suppression or rule revocation committed before the batch prevents insertion, pacing changes and rule reassignment. Use a deterministic batch interleaving fixture for new and existing jobs. No live source, profile approval or public projection change. Manual enqueue and its audit contract remain next, not delivered by these storage checks.

R20 delivered locally: one reused SQL authority predicate guards job insertion, origin creation/pacing and rule reassignment inside the D1 batch. Post-batch read reports suppression or inactive rules rather than returning an existing ID as success. The initial fixture reproduced a suppressed URL accepted after the precheck. Six interleavings now pass: new/existing jobs with committed suppression, rule disable or expiry-field change before the batch; queue and pacing remain unchanged. Full suite: 351 pass / 2 existing identity-config failures, 353 tests, 2417 assertions. Node/Worker typechecks, Worker dry-run and native workerd/D1 bootstrap/claim/result/replay pass, zero external requests. Native smoke proves the new SQL runs, not the injected revocation races. Natural clock expiry during an in-flight seed still uses the operation timestamp; claim/heartbeat/submission retain independent current authorization checks. No manual HTTP route or audit schema was added. Next: atomically audited manual queue contract, then coordinator-directed real robots preflight; do not bootstrap fake approval to bypass that gate.

## R19 — seed identity conflicts before operator API exposure

R16-C19 trace found seedJob keyed by URL but checked only stored purpose, not platform. D1 changes origin pacing before rejecting purpose conflicts; SQLite rolls back purpose conflicts but accepts a different platform. Hypothesis: insert the candidate atomically, condition all later pacing/rule writes on the stored platform and purpose, then report conflicts. Add repeated and concurrent conflicting seeds and same-contract idempotency fixtures. Queueing still does not grant source access. Manual API needs an audit contract before delivery because operator_actions is tied to source_leads by a required foreign key. Do not misuse lead audit fields as job IDs or add an unaudited endpoint.

R19 delivered locally: D1 batch conditions pacing/rule writes on matching stored platform/purpose; both stores reject platform mismatches. Two initial regressions reproduced accepted wrong-platform seeds and pacing raised by a race loser. After the fix, repeated/conflicting/racing seeds preserve the existing contract, while matching reseeds remain idempotent and can increase pacing. Added SQLite comparator coverage. Full suite: 350 pass / 2 existing identity-config failures, 352 tests, 2399 assertions. Node/Worker typechecks, Worker dry-run, diff whitespace and native workerd/local D1 bootstrap/claim/result/replay pass. External fetches: zero. Native smoke exercises the changed insertion SQL but does not directly reproduce conflicting seed races. No HTTP seed control, new audit table or source grant was added. Next: typed manual-queue operation with an atomic audit record; retain source profiles and real robots as separate claim gates. Suppression/rule revocation races around pre-batch reads remain unproven and require separate fixtures before API exposure.

## R18 — typed initialization boundary

Active R16-C19/R13-C6 slice: Worker init currently catches malformed JSON as an empty request, bypasses bounded readJson and has no SDK method/versioned contract. Hypothesis: reuse bounded parsing and a strict consumer operator schema before initSchema. Preserve valid-request autoSeed default true. Test malformed/unversioned/unknown-field/nonboolean/oversized/wrong-media payloads, auth-before-body, zero database writes, SDK serialization and response validation. No source approvals, deployment or seed policy changes. Author-review pause remains deferred.

R18 delivered locally: strict SDK operator request/response schemas, typed init method and Worker bounded parsing replace silent malformed-body fallback. The first failing fixture reached database exec and returned 500 instead of 400. After the fix, all nine invalid cases return 400/415/413 with zero database operations. Auth precedes body reading. Real SDK-to-Worker fixtures cover autoSeed false/default true and zero profiles/robots. Targeted tests: 44 pass. Full suite: 347 pass / 2 existing identity-config failures, 349 tests, 2384 assertions. Node/SDK/Worker typechecks pass after correcting the Bun fetch mock's preconnect type. Wrangler dry-run and native workerd/local D1 smoke pass with zero external fetches. No remote database changed. Invalid requests have unit coverage; native smoke exercises valid initialization and subsequent lease/result operations, not every malformed case. Storage initialization is not a migration protocol or full operator parity. Manual seeding, revocation, real robots preflight and durable node recovery remain open.

## Research lead — VPM Catalog

Owner supplied kurotu/vpm-catalog. Hypothesis: separate discovery and accepted-list refresh can inform FLEET-S2 without changing source authorization. Read pinned revision 2f6e49561432caa706725751f7e202cecd655c6b: discovery skill/prompt/workflow, listing/archive scripts, release utilities and ignore reasons. Added the comparison to the existing VPM template note and linked it from the ecosystem library. No new scratch file, live crawl, imported seed list or runtime change. Search-provider jobs, yanked/legacy relationships and evidence-based mirror handling remain research candidates. Archive extraction and unrestricted agent execution conflict with current boundaries. Broader canonical-ledger cleanup remains deferred.

Owner-authorized temporary clone: C:\Users\SlamTheDragon\AppData\Local\Temp\vpm-catalog-research-d1d362e8b9fc4cbeb00a15e8e9eee045, same pinned revision. Complete executable-script inventory confirms agent-guided discovery plus known-list refresh, ZIP cache and build-trigger paths. Aggregate endpoint uses serialized manifest length to resolve collisions. No upstream code executed or dependencies installed. Checkout retained for follow-up research. Research prose lint: 1.58 findings per 100 words.

## R17 — bootstrap authorization boundary

Current bootstrap path: Worker /v1/operator/init -> Coordinator.initSchema(autoSeed) -> seedInitialProfiles -> hardcoded profiles, robots bodies and queued jobs. The SQLite comparator repeats the same path. Hypothesis: initialization may queue candidate jobs, but it must not create access approval, publication rights or robots evidence. Remove only those fabricated grants/snapshots and rename the helper to match job seeding. Keep driver availability unchanged. Seed-list selection and placeholder replacement remain FLEET-S2 decisions, not approval to fetch them.

First checks: autoSeed true creates pending jobs but no profiles/robots and cannot claim a lease. Reinitialization must preserve explicit reviewed profiles, including disabled profiles, and recorded robots restrictions. This slice does not migrate or revoke previously stored grants. Do not run a live crawl against an existing database with earlier bootstrap approvals.

R17 delivered locally: removed fabricated profiles/robots constants and renamed both helpers to seedInitialJobs. Candidate seeding skips existing/suppressed jobs and no longer hides insertion failures. Initial regressions failed against nine invented profiles, then passed. New fixtures preserve reviewed/disabled profiles, audit actions, robots denial, active leases and suppression across repeated initialization. Worker/integration: 164 pass. Full suite: 343 pass / 2 existing identity-config failures, 345 tests, 2332 assertions. Node/SDK/Worker typechecks and Worker dry-run pass. Native workerd/D1 smoke validates zero bootstrap profiles and empty claims before separate fixture approval, then normal concurrent leasing/receipt replay, with zero external requests. No deployed D1 or old grants were changed. FLEET-S2 decisions and real robots/operator control paths remain open. General ledger compaction remains deferred.

## Ledger merge requested by owner

Read incremental-delivery and lifecycle rules 01/02. Merge the four FLEET task definitions and G12 into the canonical ledger. Preserve each owner comment and distinguish approved work from unresolved seed decisions and gated fleet testing. Keep UNMERGED_IMPLEMENTATION_PLAN.md as an empty proposal template, not a second active ledger. General canonical-ledger compaction is explicitly deferred. This changes documentation only and does not approve live-source grants or complete any fleet gate.

## R16 — owner moves repaired; next operation-parity gate

This section supersedes the historical handoff and incremental move instructions below. The physical relocation and import repair are now implemented. Production Worker: `src-web/src/worker/`. Node: `src-crawler/src/main.ts` and functional subfolders. Owner rename `client/node_client.ts` is preserved. Worker tests: `src-web/tests/worker/`. Cross-runtime tests: `tests/integration/`. Comparator support: `src-web/tests/support/`. Shared test output/setup: `tests/helpers/`, with Bun preload configurations in each project and root.

Removed the retired coordinator CLI, five forwarding files, Worker barrel and old node barrel. No compatibility wrappers were added. Removed source is recoverable in Git history. No owner database or credentials were changed. Owner staged ledger/API/.gitignore changes remain preserved and mixed documentation is not automatically committed.

Verification: combined functional suites 336 pass, 0 fail, 37 files (node 142; Worker/integration 161; SDK 33). Node/SDK/Worker typechecks pass. API Worker dry-run passes. Windows node compiles and its help works. Native workerd/D1 smoke passes schema validation, one lease under concurrent claim, heartbeat, submission and idempotent replay. Zero external requests. Root layout 4 pass, 2 fail for deleted identity config/obsolete dual-DB expectation. The complete repository is not all green, and this is not full fleet or live-source proof.

Final whole-repository run with shared preload: 340 pass, 2 fail, 342 tests across 38 files, 2312 assertions. Both failures are the same identity-config/layout expectations. The project-local Worker command passes 113 tests across 12 files. Documentation checker is back to seven pre-existing issues. git diff --check passes. All migration changes remain uncommitted, preserving owner-staged documentation for review.

Wrangler still warns about unsupported previews.observability.issue_detection. Preview shares the configured D1 identifier and is not approved for writes. Linux/Docker/restart tests remain open. Migration links were repaired; seven pre-existing governance/optional-skill issues remain. STE-flavored lint: README 2.27, network draft 2.77, node draft 1.57 findings per 100 words. Network draft exceeds the writing target and still contains candidate claims, not certified implementation truth.

Next active gate: R13-C2/R16-C19, safe coordinator bootstrap and operator parity. The retired CLI exposed manual seeding, node revocation, robots refresh, suppression and evidence inspection without corresponding Worker routes. Do not mistake file migration for preserving these capabilities. Trace D1 methods, add failing HTTP/schema fixtures and implement accepted typed/audited controls sequentially. Source-policy choices stay deferred in the master ledger. The durable node result outbox (R15-C17) remains a separate approved recovery slice.

## R15 — lifecycle-comment reconciliation

Owner comments read on 2026-10-03 in both lifecycle ledgers. The owner approved full Worker migration to src-web, downstream SDK contract work, negative-path/recovery tests and local Worker/D1 verification. Docker fleet work requires review first. Seed selection remains undecided; full fleet simulation follows prerequisite gates.

Config is for identity/version constants only. Do not restore the deleted dual-database config to make the root tests green. Requests to clarify publication or ground ownership, timestamps and restoration methods are not acceptance of the proposed methods.

The master ledger preserves owner comments and records these distinctions under R15. The unmerged plan retains its comments and separates local smoke evidence from full fleet readiness. Scratch contains exactly three documents.

## Verified baseline and commits

- Research cleanup fccae0a is pushed. It compacts twelve notes and adds the source-backed 09e9dc8/current parity audit.
- Local-only ffe57b6: atomic D1 reservation, same-job/origin races, expiry and stale authority regressions.
- Local-only 00bc50c: line-oriented native D1 schema initialization.
- Local-only 750d67e: portable Web Crypto credentials. Worker bundle decreased from about 1.55 MB to 0.63 MB.
- Local-only 06695cc: repeatable local workerd/D1 HTTP smoke.
- Latest full suites: crawler 302 pass, SDK 33 pass; both typechecks and Worker build pass. Root remains 2 pass / 2 fail because its deleted config assertions are obsolete, not because identity config has been implemented.
- Native HTTP smoke repeated after owner comments: init, two node registrations, source profile, exactly one concurrent lease, schema-valid heartbeat, accepted result and idempotent replay. External fetches: zero. Runtime disposed.
- Installed runtime: Miniflare 5.20261001.0-alpha / workerd 1.20261001.1. Direct D1 proxy helpers stalled; the saved harness uses an in-memory test-only fixture module instead.

Run the smoke after building: in src-crawler, bun run build:worker; from the repository root, node src-web/tests/coordinator_runtime_smoke.mjs. The bundle location and compatibility settings still belong to the old crawler Worker config. No production fixture route, deployment or source crawl was created.

## Traced contract and working theories

Current chain: worker/worker_entry.ts -> Worker API handlers -> storage/d1/coordinator.ts -> shared protocol/policy/taxonomy -> catalog projection. Node main -> daemon -> lease_runner -> CoordinatorClient serializes versioned HTTP payloads.

Migration hypothesis: moving the entry alone is insufficient. Crawler package build, Wrangler, root layout tests, D1 tests and saved smoke refer to its current location. Web Wrangler targets a generated Svelte Worker with VRCP_D1; the coordinator expects DB. Binding/types and executable routing must be verified together. Do not add compatibility exports or infer preview database isolation from its name.

Recovery finding R15-C17: LocalNodeStore contains task/run logs but no result payload or idempotency-key outbox. The lease runner generates a key in memory, submits, then returns; the daemon records success only after acknowledgement. Client retries reuse the request within one call, not across restart. Durable replay requires expiry/revocation/retention tests and must not trigger unleased refetching.

## Immediate next bounded slice

Owner correction: migrate ALL related Worker code and tests, then flatten node implementation to src-crawler/src with functional subfolders. Node-only tests stay with the node; tests using both runtime implementations move to root tests/integration. Production Worker handlers/storage stay in src-web/src/worker. The Bun SQLite comparator, its config/robots service and old CLI are test/scratch-only, not the deployed Worker or a coordinator binary. Shared pure contracts remain explicit and require a neutral ownership decision; do not silently publish node-job contracts through the consumer SDK.

The earlier broad script was rejected BEFORE execution and removed. The owner then explicitly clarified that the 2–3-file constraint applies to docs/scratch, NOT source/test edits. Proceed with the full mechanical source/test relocation using validated targets, refusing overwrites and preserving owner edits. Scratch remains exactly three documents. No forwarding wrappers. Full suites/build/types/native smoke must pass before calling the structural gate delivered.

R15-B1 evidence: D1 import fixture first failed at the absent projected entry, then passed all 21 tests after the actual entry moved to src-web. Browser bundle passes. Composite crawler typecheck exposed TS6307 for the moved entry; explicitly include the temporary cross-project Worker boundary rather than hiding it with a wrapper or compiler suppression. Existing handlers/storage remain in crawler for later bounded moves.

R15-B2 fixture: root layout checks the new real entry, rejects the old entry and asserts API-only Wrangler routing, DB naming and non-remote local binding. It should fail against the current Svelte/static-assets config before cutover. The two pre-existing identity-config failures remain separate.

R15-B1: change the existing D1 integration test to import the projected src-web entry and observe the missing-module failure. Then move the actual entry with apply_patch (old/new paths plus crawler build manifest: three paths). Keep its existing handlers/storage imports explicit across projects temporarily; do not add a forwarding entry. Recheck D1 tests, crawler typecheck/build and native smoke. The root entry-path assertion and old crawler Wrangler path will be corrected in the next cutover slice, not hidden.

R15-B2: update the root layout assertion and src-web API-only Wrangler configuration, then remove the obsolete crawler Wrangler config. Generate binding types from the installed CLI and repeat the runtime smoke using src-web compatibility settings. No remote deployment or D1 mutation is authorized by this local cutover.

Independent approved follow-up: add an acknowledgement-loss/reopen fixture for the node before implementing any outbox. No restart-resilience claim is justified yet.

## Open release risks and owner control

Fabricated bootstrap grants/robots, ignored publication classes and proof-before-delist are unfixed. D1 invocation budgets, search semantics, timestamps, discarded prototype features and scoped source clearance remain ledger items. Other aggregators provide relevance/publisher leads, not automatic authorization or proof that indexing is unlawful.

Research-local links resolve; the full docs checker has seven known governance/metadata issues. Do not remove user .obsidian data. No historical prototype execution or remote staging proof was obtained.

Preserve mixed owner edits to IMPLEMENTATION_PLAN, UNMERGED_IMPLEMENTATION_PLAN, API_ROUTES and the unverified .gitignore addition. API_ROUTES has both staged and unstaged owner edits. Never blanket stage or commit these files. The latest ledger reconciliation is intentionally uncommitted alongside owner comments.

The goal remains active. User-review pauses are deferred by owner instruction; no gate or overall goal is completed by test counts or agent confidence.

## Owner bulk-move handoff — 2026-10-03

This checkpoint supersedes the earlier incremental relocation instructions above. The owner will perform these physical moves; the agent will then repair imports, retire obsolete files and verify the complete tree. Do not overwrite existing destination files. Paths below are relative to the repository root. Create missing destination folders.

Already relocated: src-web/src/worker/worker_entry.ts, src-web/src/worker/storage/d1/{coordinator,definitions,utils}.ts, and src-crawler/src/main.ts. Leave them in place.

| Move from | Move to | Scope |
| --- | --- | --- |
| src-crawler/src/worker/api/ | src-web/src/worker/api/ | All five handler files |
| src-crawler/src/worker/worker_logger.ts | src-web/src/worker/worker_logger.ts | Worker logging |
| src-crawler/src/worker/storage/default_seeds.ts | src-web/src/worker/storage/default_seeds.ts | Worker seed definitions |
| src-crawler/src/worker/storage/local_sqlite.ts | src-web/tests/support/local_sqlite.ts | Test-only SQLite comparator |
| src-crawler/src/worker/config/runtime_config.ts | src-web/tests/support/runtime_config.ts | Prototype test support |
| src-crawler/src/worker/services/robots_refresh_service.ts | src-web/tests/support/robots_refresh_service.ts | Prototype test support |
| src-crawler/src/node/adapters/ | src-crawler/src/adapters/ | Entire folder |
| src-crawler/src/node/client/ | src-crawler/src/client/ | Entire folder |
| src-crawler/src/node/config/ | src-crawler/src/config/ | Entire folder |
| src-crawler/src/node/runner/ | src-crawler/src/runner/ | Entire folder |
| src-crawler/src/node/storage/ | src-crawler/src/storage/ | Entire folder |
| src-crawler/tests/helpers/source_access_fixture.ts | src-web/tests/helpers/source_access_fixture.ts | Worker fixture |
| src-crawler/tests/helpers/test_directory.ts | tests/helpers/test_directory.ts | Shared test-directory helper |

Move these twelve files from src-crawler/tests/ to src-web/tests/worker/:

- catalog_projection.test.ts
- coordinator_runtime_config.test.ts
- d1_coordinator_store.test.ts
- downstream_client_protocol.test.ts
- identity_links.test.ts
- operator_control_api.test.ts
- public_catalog_protocol.test.ts
- robots_refresh_service.test.ts
- source_access_profile.test.ts
- user_protocol.test.ts
- worker_logger.test.ts
- workforce_distribution.test.ts

Move these four cross-runtime files from src-crawler/tests/ to tests/integration/:

- local_coordinator_protocol.test.ts
- node_daemon.test.ts
- node_lease_runner.test.ts
- shopify_sitemap_discovery.test.ts

Leave all other tests, helpers/test_setup.ts, shared/, utils/, src-crawler/src/index.ts and src-crawler/src/node/index.ts untouched. Leave the old Worker CLI, barrels and forwarding files for the agent to remove after caller relinking. Do not move node/index.ts onto the existing root index.ts. Do not move the whole Worker folder into src-web: production and test-only implementations have different destinations.

Current state is an intermediate migration, not a clean build: prepared node exports point to the projected folders, while test imports still refer to old paths. Earlier passing test counts are baseline evidence only. After the owner moves the files, repair imports and package/test configuration, remove obsolete runtime paths without wrappers, then run targeted/full suites, both runtime typechecks, Worker dry-run build and native local D1 HTTP smoke. No deployment or remote D1 operation is part of this handoff.

Handoff dependency check: the listed files remain at their original locations. Production handlers/D1 use shared schemas, source policy, robots identity, taxonomy and sanitizer; sanitizer also imports IanaRegistry. No node runner/client/store import was found in this boundary. IanaRegistry.init has an opt-in network refresh, so it is not an unconditionally pure helper; verify call sites before relocating shared ownership. Shared node_protocol imports vpm_version, which imports vrc-packages-api. Catalog/downstream/operator schemas also use the SDK. The agent's attempted crawler dependency removal and Docker SDK-source removal were premature and have been reversed. SDK reuse does not authorize publishing the internal node leasing client. Physical moves remain assigned to the owner; no move was executed in this follow-up.

Dependency correction verification: node observation adapter, node runtime config and capability-token suites pass 47 tests with 282 assertions. git diff --check passes. This does not prove a fresh dependency install, Docker image or completed migration; those checks remain pending.

Independent node-entry slice: help hardcodes five capabilities while PlatformSchema currently defines ten, and directs operators to the retired vrc-coordinator binary. Hypothesis: derive the displayed capability list from PlatformSchema and direct registration through the existing authenticated Worker operator endpoint. Do not change capability grants, authentication or default coordinator URL in this wording fix. Add a subprocess help regression before implementation. Owner bulk moves are now in progress; do not edit files in transit.
