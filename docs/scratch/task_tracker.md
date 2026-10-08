# Active checkpoint — Consolidated Delivery Lifecycle & Architecture (Milestone M-R64)

## Active Objective & Bounded Vertical Slice

- Active Goal: Task ledger compaction, rule/guideline conformance, and establishing the root-level test execution policy.
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Milestone Status: Milestone `M-R64` (Unified Delivery Pipeline, Guided Interactive CLI, Onboarding, Recovery, Policy Hardening, and Rolling Help Pager) is fully implemented, verified, and merged into the canonical ledger.
- Next Capability Horizon: Milestone `M-R64` is complete. Next tasks in the unmerged queue relate to `G15` (SDK contract & route review) or `G16` (fleet budget & crawler architecture).

## Milestone M-R64 Verification Evidence & Delivered Baselines

- `R71-HELP-ROLLING-PAGER`: Implemented, verified & committed locally (`cca70bb`). Implemented interactive terminal pager `pageLines` in `scripts/help.mjs` with rolling Enter key (Enter rolls 1 line, Space advances page, q quits, Down arrow rolls 1 line, Ctrl+C exits cleanly), terminal row auto-detection, `--pager`/`--no-pager` CLI flags, non-TTY fallback, and unit tests in `tests/help.test.ts`.
- `R70-CLEANUP-CI-TEST-POLICY`: Implemented, verified & committed locally (`4154ac9`). Cleaned up `VRCP_SKIP_TESTS` from 4 workflows, resolved language server warning, enforced native `continue-on-error: ${{ channel == 'preview' }}` policy.
- `R64-INTERACTIVE-DELIVERY-ENTRY`: Implemented, verified & committed locally (`ff9fef4`). Added interactive terminal prompts in `scripts/delivery-chain.mjs` for product/channel/bump selection, PAT admin/owner authority verification, dirty worktree check, changelog preparedness self-check, and unit tests (43/43 pass).
- `R65-FAILURE-RECOVERY-WORKFLOW`: Implemented, verified & committed locally (`623f9bf`). Added categorized failure diagnosis (`diagnoseFailure`), workflow rerun (`rerunWorkflowRun`), delivery tag rollback (`revertDeliveryTag`), automated temporary patch branch lifecycle (`createPatchBranch`, `mergeAndCleanupPatchBranch` for `release/patch/<product>/v<version>`), and interactive terminal recovery menu (`promptInteractiveRecovery`). 21/21 tests passing.
- `R66-INTERACTIVE-SETUP-ONBOARDING`: Implemented, verified & committed locally (`8d685b0`). Added interactive onboarding wizard (`interactiveSetup`) in `scripts/setup.mjs` verifying GitHub PAT against `/user` endpoint, prompting for missing optional developer tokens, managing `.env`, selecting project targets, and orchestrating full-repo dependency installation. 8/8 tests passing.
- `R67-LOCAL-BUILD-ORCHESTRATION`: Implemented, verified & committed locally (`b952f67`). Implemented unified root build orchestrator (`scripts/build.mjs`, `bun run build <product> [channel]`) dispatching directly to subproject build scripts across all 7 targets in dependency order. 4/4 tests passing.
- `R68-INDEPENDENT-SYNC-CHECK`: Implemented, verified & committed locally (`73ed922`). Implemented standalone sync check diagnostic (`checkSync`, `bun run sync:check`) evaluating branch ahead/behind status against origin, comparing local version configs with remote, and reporting drift cleanly. 4/4 tests passing.
- `R69-INTERNAL-DEPENDENCY-SYNC`: Implemented, verified & committed locally (`73ed922`). Implemented internal dependency synchronizer (`syncInternalDependencies`, `bun run sync:deps`) updating `vrc-packages-network` across sibling consumers (`src-crawler`, `src-worker`) to match authoritative preview network version manifests. 4/4 tests passing.
- `PACKAGE-SCRIPTS-REWRITE`: Implemented, verified & committed locally (`331e51c`). Completely rewrote root `package.json` scripts section to remove obsolete dev triggers and standardize on `publish:*`, `setup:*`, `build`, `sync`, and `recovery`.
- `REMEDIATION-GUIDANCE-AND-ISOLATION-HARDENING`: Implemented, verified & committed locally (`311f860`). Differentiated transient retry (frozen tag) vs code patch fix (tag revert + ahead branch tag), fixed diagnose exit code, hardened dynamic imports.
- `WORKFLOW-FIXME-ASSESSMENT-AND-FIX`: Implemented, verified & committed locally (`12880e4`). Addressed `repository-tests.yml` checkout fetch depth (`fetch-depth: 0`) and recursive submodules (`submodules: recursive`).
- `PUBLISHING-DISCIPLINE-AND-DOCS-UNIVERSALIZATION`: Implemented, verified & committed locally (`4097561`). Converted operational documentation to canonical publishing terminology, universalized `docs/source/PUBLISHING.md` and agent rules under ASD-STE100 guidelines.
- `M-R64 Verification Pass`: Full monorepo governance test suite verified (219/219 passing across 18 files, 1,417 assertions in targeted suites).

## Active Working Theories & Architectural Covenants

1. **Root-Level Test Execution Policy (Owner Instruction 2026-10-08)**:
   - Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified.
   - Product-scoped work runs only its own domain test/typecheck suite (`src-<product>`).
2. **Unified Delivery Entry Point (R64)**:
   - Interactive terminal prompts (`scripts/delivery-chain.mjs`) answering product and channel selection.
   - Authority verification: check executor owner/admin authority via GitHub PAT (`GET /user`).
   - Clean tree checkpoints: prompt to commit dirty worktree before proceeding.
   - Changelog preparedness self-check: verify summary, new features, bug fixes, and changes before bump.
   - Version parity: evaluate local vs remote version configs; prompt for bump type (patch, minor, major for release; CalVer patch for preview).
   - Atomic commit, tag, and push with CI progress streaming.
3. **Failure Points & Guided Recovery (R65)**:
   - Differentiate frozen tag rerun (`recovery rerun <runId>`) for transient failures from code fixes (`recovery revert-tag <tag> --remote` or patch branch).
   - Automated temporary patch branch lifecycle: `release/patch/<product>/v<version>`, auto-merge back to work branch, auto-delete patch branch.
4. **Developer Onboarding & Repository Setup (R66)**:
   - Interactive onboarding wizard (`scripts/setup.mjs`) inspecting `.env`, prompting for missing tokens, verifying PAT against GitHub API, selecting project targets.
   - Non-destructive dependency installation (`--no-save --ignore-scripts`) and automatic submodule initialization.
5. **Local Build Orchestration (R67)**:
   - Unified root runner (`scripts/build.mjs`, `bun run build <product> [channel]`) dispatching to subproject build definitions in dependency order (`buildOrder`).
6. **Independent Sync & Dependency Parity (R68 / R69)**:
   - Standalone sync check (`bun run sync:check`) evaluating branch ahead/behind status and version config drift.
   - Internal dependency synchronizer (`bun run sync:deps`) keeping `vrc-packages-network` references aligned across `src-crawler` and `src-worker`.
7. **Native CI Test Policy (R70)**:
   - Eliminate redundant `VRCP_SKIP_TESTS` variables. Enforce native GitHub Actions `continue-on-error: ${{ channel == 'preview' }}` (release fails closed; preview non-blocking).
8. **Interactive Rolling Terminal Pager (R71)**:
   - `pageLines` in `scripts/help.mjs`: rolling Enter key (1 line), Space (1 page), q (quit), Down arrow (1 line), Ctrl+C (clean exit), non-TTY continuous output fallback.
9. **Branch Layout & Publishing Discipline**:
   - Production `main`, preview feature branches (`preview/*`), temporary patch branches (`release/patch/*`), candidate PRs (`release/candidate/*`).
   - Slices mean local commit, completed gates mean push.
   - Any branch ahead of origin can publish previews without a PR.

## Retained Checked Baselines

Nine delivered paths retain independent artifact, registry, and link proof:

| Product | Preview / single stream: version and run | Release: version and run |
| :--- | :--- | :--- |
| SDK | 2026.10.9-pre / 37719073408 | 0.0.8 / 00474f5; npm latest 0.0.7 |
| Crawler | 2026.10.8-pre / 37619601351 | 0.0.13 / 328198f |
| Desktop | 26.10.7-pre / 37620460845 | 0.0.7 / c95945e |
| Worker | 2026.10.9-pre / 37621951240 | 0.0.7 / 37624730435, build only |
| Network | 2026.10.6 / 37619026716 | No release stream |

## Open Risks & Next Actions

1. **SDK v0.1.0 Hold**: Release v0.1.0 remains held for full owner API review (`docs/source/API_ROUTES.md`). Pre-0.1 releases are authorized with package verification.
2. **Website Delivery**: Astro website delivery remains disabled.
3. **Worker Production Deployment**: Worker release delivery remains build-only (no unverified production deployment).
4. **Next Steps**: Await author direction on next milestone capability gate (e.g. G15 SDK contracts or G16 fleet ingestion lifecycle).
