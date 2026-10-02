# Active slice and recovery checkpoint

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
