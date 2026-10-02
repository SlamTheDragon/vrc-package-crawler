# Active slice and recovery checkpoint

## R15-A — repeatable local Worker/D1 smoke

Saved `src-web/tests/coordinator_runtime_smoke.mjs`. Build the crawler Worker first, then run the script with Node. It uses installed Miniflare/workerd, ephemeral credentials, an in-memory fixture module and denied outbound traffic.

Measured success: initialization, node/profile issuance, exactly one concurrent lease, schema-valid heartbeat, accepted result and idempotent replay. The script disposes its runtime and has per-request deadlines. It is a manual smoke, not a new counted Bun unit test or full fleet simulation. No production fixture endpoint exists.

Next R15-B: map and migrate the actual Worker infrastructure into src-web without export compatibility layers. Read both project configs and trace shared protocol/policy dependencies before moving files. Preserve the smoke and all owner edits. Source approvals, publication and creator ownership remain release blockers.

## Owner-comment replies and next migration slice

The ledger now contains explanations for publication classes and proposed ownership, timestamp and feature-restoration methods. It preserves the owner's comments verbatim. Queues is at-least-once, not a replacement for atomic leases. D1 FTS5 is a keyword-search candidate; “Cloudflare index” remains unselected. Initialization/query budgets are critical.

Research commit fccae0a is pushed. Fix commits ffe57b6, 00bc50c and 750d67e are local only. API_ROUTES owner edits remain staged. Owner ledger comments and the additional .gitignore entry remain unstaged and excluded from commits.

Next R15-A: preserve the successful HTTP-only local workerd smoke as a repeatable script, then inventory Worker imports before the approved full move to src-web. The temporary fixture wrapper exists only in the executed harness, not production code. Do not add compatibility export layers. Keep source grants/robots/publication and proof-before-delist gates open.

## R14-C — portable credentials and runtime claim evidence

Capability-token generation now uses native Web Crypto rather than node:crypto. A portable-entropy fixture first failed, then passed. Crawler full suite: 302 pass / 0 fail; SDK: 33 pass / 0 fail. Both typechecks pass. Root remains 2 pass / 2 fail. Browser Worker build passes and shrank from about 1.55 MB to 0.63 MB.

Installed local runtime: Miniflare 5.20261001.0-alpha and workerd 1.20261001.1, using the existing 2024-09-30 compatibility date and nodejs_compat. Its supplied option-conversion API was required. Direct getD1Database hung; task-created helpers were identified and stopped. An in-memory test-only fixture module avoided that proxy. No production fixture route or resource changes were made.

HTTP smoke succeeded: operator/init 200 with autoSeed false, two node registrations 201, source profile 201, then concurrent schema-validated node claims produced exactly [leased, empty]. Outbound requests were blocked and counted zero. Ephemeral credentials were generated in memory and never printed. The runtime disposed successfully.

This proves one local Worker/D1 contention scenario, not remote staging, fleet durability or source permission. Preserve a repeatable runtime smoke before migration. Owner comments now explicitly approve full Worker migration to src-web and ask for Queues/indexing research plus publication, ownership, timestamps and feature-restoration methodology.

Next: record those replies and critical invocation-budget questions in the ledger, preserve owner comments, then move Worker infrastructure in bounded dependency-aware slices. No guessed Queues or search product adoption.

## R14-B — native D1 initialization

The updated goal file addfa15f-0607-4fe4-b975-e1cacc86bb51/goal-objective.md was read in full. It explicitly confirms moving Worker infrastructure into src-web. Current API-only serving remains the latest concrete task direction; future dashboard/auth work is not implemented by that migration.

Static D1 DDL now contains one complete command per line. The mock uses D1's line-oriented exec behavior, and an initialization/reinitialization fixture verifies tables and timestamp columns. The fixture failed before the change. Targeted suite: 21 pass. Full crawler: 301 pass; SDK: 33 pass. Both typechecks and Worker build pass. Root remains 2 pass / 2 fail.

The local workerd/D1 operator/init now succeeds with autoSeed false. The next API step exposed another runtime blocker: capability-token generation imports node:crypto randomBytes, which the browser bundle does not supply. Node registration returns 409. Next slice R14-C replaces that dependency with Web Crypto and adds a portable-entropy regression before repeating the runtime claim race.

The schema has 57 commands plus timestamp alterations. Initialization invocation budgets and a proper migration workflow require review before remote staging. No remote resources changed. Unverified bootstrap grants remain unfixed.

## R14-A — atomic D1 claim reservation

Research cleanup committed and pushed as fccae0a (research clean up). Owner API-route edits remained staged and excluded.

The D1 coordinator now rechecks job/origin eligibility, selected profile, credential generation, robots snapshot, refresh reservation and pacing inside the transactional write. Only the winning lease updates the origin. Robots deferral also checks eligibility before changing a job.

Four new regression tests first failed, then passed. They cover one-job races, same-origin versus independent origins, expiry/reclaim and stale profile/credential/robots/pacing/refresh evidence. Targeted suite: 20 pass. Full crawler suite: 300 pass before the final pacing/deferral refinement; rerun after the schema slice. SDK: 33 pass. Both typechecks and Worker build pass. Root remains 2 pass / 2 fail.

Local workerd/D1 validation found a separate blocker: operator/init returns 500 because D1 exec treats multiline DDL as separate incomplete commands. The installed Miniflare 5 alpha uses a changed constructor schema; its supplied conversion API starts the runtime. No remote credentials or resources were used. The init failure prevented runtime claim validation.

Next slice R14-B: declare D1-compatible complete schema commands and make the mock reproduce line-oriented exec behavior. Repeat the schema-validated HTTP race after init works. Publication, robots bootstrap and proof-before-delist remain critical and unfixed.

An additional unstaged .gitignore entry appeared during runtime diagnostics. Its ownership is unverified; preserve it and exclude it from agent commits.

## R13 — parity audit and research cleanup

Owner instruction, 2026-10-03: compare prototype 09e9dc8 to current code, organize research, commit/push research clean up, then continue implementation. Author-review pauses are deferred. Put consequential uncertainty in the critical ledger.

Physical baseline: HEAD 3b9d203. Prototype 09e9dc860290dac3ae977e560a0d693d99639646. Owner's staged API_ROUTES.md route edits remain untouched and must stay outside the research commit.

## Delivered research slices

- R13-A: source-backed capability matrix, current baseline and critical risks.
- R13-B: infrastructure and identity essays consolidated into primary-resource tables and failure checks.
- R13-C: legal authority library, jurisdiction/interpretation limits, source-review procedure and LEGAL/code reconciliation queue.
- R13-D: market, desktop, VPM, indexing, dependency and spike notes compacted. Historical observations and source retrieval failures remain explicit.
- Each editing slice changed two or three files. Scratch remains exactly three documents.

Entry point: [research library](../research/topics/04_curriculum_and_core_philosophies.md).
Evidence: [prototype audit](../research/audits/PROTOTYPE_PARITY.md).
Decisions: [critical ledger](IMPLEMENTATION_PLAN.md).

## Measured baseline

- Crawler: 296 pass, 0 fail, 32 files.
- SDK: 33 pass, 0 fail, 4 files.
- Root: 2 pass, 2 fail. Missing src-crawler/config.json causes both failures.
- Both package typechecks pass.
- Hermetic D1-interface diagnostics reproduced duplicate live leases, ignored publishClasses and pending-proof immediate delisting.
- Research-local links resolve. Full documentation checker has seven remaining issues: user .obsidian metadata, three optional Cloudflare skill references and three obsolete context-recovery references.
- Diff whitespace check passes. STE-flavored lint range: 1.02–3.76 findings per 100 words. Tables, URLs and necessary legal qualifiers remain exceptions; no certified-STE claim.
- Historical prototype tests were not run. No source crawl, deployment or remote database change occurred.

## Next bounded slice

R14-A: fix R13-C1 using only the D1 coordinator, its existing test file and this tracker. Add concurrent same-job and same-origin fixtures before conditional reservation. Test expiry/reclaim and distinguish SQLite-backed diagnostics from workerd/D1 proof.

Keep profiles, real robots, publication and creator-proof fixes separate. Do not restore unleased prototype probes, media BLOB caches or fabricated VPM versions.

## Architecture and owner constraints

Current Worker expects DB; src-web binds VRCP_D1 to a generated Svelte Worker. Owner wants API-only src-web and downstream operator/user/app SDK scope. Physical directory is src-package, not src-packages.

The owner reports an existing remote Worker and D1. Do not infer deployed API wiring. Before remote migration, resolve whether the existing Worker is replaced or an API service is separate. Local safe implementation can proceed.

Source drafts and LEGAL are not authority except owner comments. docs/source must describe actual features. Historical G12 fleet/landing-page proposals in UNMERGED_IMPLEMENTATION_PLAN are not a verified baseline.

## Commit boundary

Requested title: research clean up. Include only owned docs/research changes and the research ledger/checkpoint. Preserve staged owner edits. After push, record hash and continue R14-A without claiming the overall goal complete.
