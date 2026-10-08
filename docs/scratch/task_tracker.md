# Active checkpoint — R57-C57A/B delivery transition

## Active checkpoint — Consolidated Delivery Lifecycle & Architecture (Milestone M-R64) (2026-10-08)

- Implementation & Verification Progress:
  - `R70-CLEANUP-CI-TEST-POLICY`: Implemented, verified & committed locally (`4154ac9`). Cleaned up `VRCP_SKIP_TESTS` from 4 workflows, resolved language server warning, enforced native `continue-on-error: ${{ channel == 'preview' }}` policy.
  - `R64-INTERACTIVE-DELIVERY-ENTRY`: Implemented, verified & committed locally (`ff9fef4`). Added interactive terminal prompts in `scripts/delivery-chain.mjs` for product/channel/bump selection, PAT admin/owner authority verification, dirty worktree check, changelog preparedness self-check (summary, new features, bug fixes, other changes), and unit tests (43/43 passing, including case-insensitivity tests).
  - `R65-FAILURE-RECOVERY-WORKFLOW`: Implemented, verified & committed locally (`623f9bf`). Added categorized failure diagnosis (`diagnoseFailure`), workflow rerun (`rerunWorkflowRun`), delivery tag rollback (`revertDeliveryTag`), automated temporary patch branch lifecycle (`createPatchBranch`, `mergeAndCleanupPatchBranch` for `release/patch/<product>/v<version>`), and interactive terminal recovery menu (`promptInteractiveRecovery`). 21/21 tests passing (including flexible step name matching and patch branch switching).
  - `R66-INTERACTIVE-SETUP-ONBOARDING`: Implemented, verified & committed locally (`8d685b0`). Added interactive onboarding wizard (`interactiveSetup`) in `scripts/setup.mjs` verifying GitHub PAT against `/user` endpoint, prompting for missing optional developer tokens (`CLOUDFLARE_API_TOKEN`), managing `.env` file entries, selecting project targets, and orchestrating full-repo dependency installation. (Note: `DISCORD_STAGING_WEBHOOK` is strictly a CI/CD secret, so it was removed from the local developer prompt). 8/8 tests passing.
  - `R67-LOCAL-BUILD-ORCHESTRATION`: Implemented, verified & committed locally (`b952f67`). Implemented unified root build orchestrator (`scripts/build.mjs`, `bun run build <product> [channel]`) dispatching directly to subproject build scripts across all 7 targets in dependency order (`buildOrder`), managing root environment injection, and aligned with CI build definitions. 4/4 dedicated test cases passing (38 assertions in `tests/build.test.ts`).
  - `R68-INDEPENDENT-SYNC-CHECK`: Implemented, verified & committed locally (`73ed922`). Implemented standalone sync check diagnostic (`checkSync`, `bun run sync:check`) evaluating branch ahead/behind status against origin, comparing local version configs with remote, and reporting drift cleanly. 4/4 tests passing (including CalVer drift detection).
  - `R69-INTERNAL-DEPENDENCY-SYNC`: Implemented, verified & committed locally (`73ed922`). Implemented internal dependency synchronizer (`syncInternalDependencies`, `bun run sync:deps`) updating `vrc-packages-network` across sibling consumers (`src-crawler`, `src-worker`) to match authoritative preview network version manifests. 4/4 tests passing.
  - `PACKAGE-SCRIPTS-REWRITE`: Implemented, verified & committed locally (`331e51c`). Completely rewrote root `package.json` scripts section to remove obsolete dev triggers (`build:dev`, `pack:dev`, `verify:package`, `release:tag`), redundant publication aliases (`deploy:release:worker`, `publish:release:package`, etc.), and individual sub-targets that are handled natively (`setup:*`, `clean:*`, `reset:*`). Configured default interactive mode for `delivery-chain.mjs` and `delivery-recovery.mjs` when called with zero arguments.
  - `M-R64-AUDIT-AND-REMEDIATION` (2026-10-08):
    - Obsolete code removed: Purged dead scripts `publish:release` and `publish:preview` in `src-package/package.json` and `deploy`, `deploy:preview`, `deploy:release` in `src-worker/package.json`. Removed `DISCORD_STAGING_WEBHOOK` prompt from local onboarding wizard (`scripts/setup.mjs`) since staging webhook is strictly a GitHub Actions CI secret.
    - Bad code repaired: Fixed critical test bug in `tests/delivery-chain.test.ts` where unmocked git was creating real commits named "y" on the repository; added `mockCleanGit` fixtures. Fixed `GIT_TERMINAL_PROMPT: 0` and `GCM_INTERACTIVE: Never` across git spawns. Added `semver.valid` checks in `checkSync`.
    - Circular dependency eliminated: Removed downward imports of `delivery-chain.mjs` in foundational modules `versioning.mjs` and `delivery-recovery.mjs`, breaking cyclic coupling and restoring 100% passing tests in `tests/delivery.test.ts` (48/48 pass).
    - Optimizations and standardizations: Case-insensitive arguments in `build.mjs` and `delivery-chain.mjs`; updated `scripts/help.mjs` with comprehensive CLI documentation for all newly provisioned tools.
  - `SCRIPT-PROPAGATION-AND-CONSOLE-PRETTIFICATION` (2026-10-08):
    - Propagated script renames: Added `publish:preview` and `publish:release` forwarders to all 6 subproject `package.json` manifests (`src-crawler`, `src-crawler-client`, `src-package`, `src-web`, `src-worker`, `src-worker/packages/network`) alongside legacy `delivery:*` aliases for full backward compatibility with CI workflows and tests. Preserved root `onboard` alias for `setup.mjs --interactive`.
    - Binary prompt defaults: Implemented `askBinary(ask, query, defaultYes)` supporting explicit `(Y/n)` (default true) and `(y/N)` (default false) notation where pressing Enter adopts the indicated default value. Added unit test in `tests/delivery-chain.test.ts` (44/44 pass).
    - Purged static documentation in `scripts/help.mjs`: Removed 400 lines of static text blocks; implemented a clean, ANSI-styled, hierarchical CLI dispatcher with Unicode glyphs (`◆`, `❯`, `✔`, box drawings).
    - Console response prettification: Added styled headers, clear visual hierarchies, and glyphs across `scripts/help.mjs`, `scripts/setup.mjs`, `scripts/delivery-recovery.mjs`, and `scripts/delivery-chain.mjs`.
  - `FULL-PUBLISH-MIGRATION-AND-CLEANUP` (2026-10-08):
    - Migrated CI/CD preview dispatcher: Updated `.github/workflows/preview-delivery.yml` from legacy `delivery:preview` to canonical `publish:preview`.
    - Restored CI release announcement entry point: Re-added `"release:announce": "bun scripts/release-announcements.mjs"` to root `package.json` required by `.github/workflows/release-announcements.yml`.
    - Purged duplicate scripts: Cleaned up all redundant `delivery:*` scripts from root `package.json` and all 6 subproject `package.json` manifests, standardizing entirely on `publish:*`.
    - Updated governance test assertions: Updated `tests/delivery.test.ts`, `tests/preview-dispatcher.test.ts`, and `tests/delivery-recovery.test.ts` to assert canonical `publish:*` commands. All tests green.
  - `CLI-FRAMEWORK-AND-UNCERTAINTY-CATCHES` (2026-10-08):
    - Adopted `citty` and `@clack/prompts`: Integrated `citty.defineCommand` and `@clack/prompts` across `scripts/build.mjs`, `scripts/setup.mjs`, `scripts/delivery-recovery.mjs`, and `scripts/delivery-chain.mjs`.
    - Built-in `--help` navigation: Every tool (`bun run publish --help`, `bun run build --help`, `bun run setup --help`, `bun run recovery --help`) natively exposes formatted help, flag definitions, and usage parameters.
    - Uncertainty catches & cancellation: Wrapped interactive prompts in `p.isCancel()` checks with graceful cancellation and exit code handling.
    - Preserved test harness compatibility: In headless test mode where `askFn` or mock executions are passed, all scripts preserve test hooks and pass without regressions.
    - Binary option UX: Enhanced `askBinary` and `p.confirm` with explicit `(Y/n)` / `(y/N)` notation and arrows.
    - Reserved help architecture: Emptied `scripts/help.mjs` reserved for the upcoming proposal.
  - `AUDIT-DIAGNOSIS-AND-UI-ENHANCEMENT` (2026-10-08):
    - Audit Diagnosis (`PUBLICATION_PIPELINE_READINESS.md`):
      - Attempt 1.1 `package preview` failure in CI run 37719073408: npm OIDC publish successfully created `vrc-packages-api-preview@2026.10.9-pre`, but the npm edge CDN readback loop timed out after 63 seconds before `latest` alias replicated. Version is confirmed live on npm; rerun of failed jobs resolves green.
      - Attempt 1.2 `release` warnings regarding lack of local Discord webhook: `DISCORD_STAGING_WEBHOOK` is a protected CI/CD secret. Implemented `notifyNative` in `delivery-chain.mjs` (PowerShell toast/balloon notification on Windows + terminal bell `\x07`) to notify developers locally during staging delays without requiring webhook tokens.
    - CLI Visual Enhancement & Loading/Progress Indicators:
      - Artifact progress bar: Added `renderProgressBar(current, total, label)` to `scripts/delivery-chain.mjs`, displaying dynamic ASCII/Unicode progress bars during hosted artifact downloads and hash verification.
      - Boxed Table & Card Views: Added `renderTable` (Unicode multi-column box table) and `renderCardTable` (compact boxed card tables with status badges and next steps) across `scripts/delivery-chain.mjs` and `scripts/delivery-recovery.mjs`. Supported `--json` flag on all commands for tooling backward-compatibility.
      - Per-project Setup Progress: Updated `scripts/setup.mjs` interactive mode to display step-by-step spinners (`[i/n] Installing dependencies for <project> (<dir>)...`) detailing individual installation status per subproject.
  - `GATE-VERIFICATION-PASS`:
    - Full repository test suite (`bun test ./tests`): all targeted test suites passing green across build, delivery, recovery, setup, and sync (86 pass across 5 files, 1,417 assertions).

- Active Working Theories & Architectural Covenants:
  1. Entry Point for Deployment/Release (R64):
     - Interactive terminal prompt answering which package/app to distribute (`package`, `crawler`, `crawler-client`, `worker`, `network`, `web`, `web-search`) and which channel to deploy (`preview` vs `release`).
     - Check executor owner/admin authority using PAT verification (`GH_TOKEN` / `GITHUB_TOKEN`) to enable overriding dangerous parameters.
     - Commit remaining work for a clean tree.
     - Interactive changelog verification evaluating user judgment: "Is the summary written? Were there new features? Bug fixes? Changes made?" with abort on unready state.
     - Evaluate local vs remote version config: if out of date, patch/sync version control config with evidences; verify remote build artifacts/deployed/release page.
     - Prompt for bump type (patch, minor, major for release; CalVer patch for preview).
     - Extract changelog to target directory with bumped version.
     - Automated atomic commit, tag, and push.
     - Transition from local gated protections to remote observation streaming CI progress.
     - Branch enforcement: `preview/*` (or `main`) commits to preview without restriction; `release` requires PR to `main` unless owner `--force`.
     - Staged Discord notifications for 3 products: `crawler`, `crawler-client`, `package` (`vrc-packages-api`).
     - Bounded eager wait for npm stage approval on `vrc-packages-api`, falling back to asynchronous reconciliation.
     - Finalization: apply extracted changelog to GitHub Release, attach build artifacts, emit final Discord announcement.
  2. Failure Points & Guided Recovery (R65):
     - Categorize failure points and suggest actionable fixes on the fly: job rerun, tag/release reversion, recreating tags.
     - Automated temporary patch branch creation: `release/patch/<product>/v<version>` for critical fixes, merged back to work branch, auto-deleted after merge, with prompt to restart local pipeline.
  3. Repository Setup & Onboarding (R66):
     - Download dependencies in one pass across root and all subfolders/submodules.
     - Interactive onboarding wizard (`npx`-style): prompt for `.env` credentials, verify PAT against GitHub API, select target projects.
  4. Local Build Orchestration (R67):
     - Root script navigating to subfolders/submodules to execute local building of files directly, reusable in CI/CD builds for targeted setups.
  5. Independent Sync & Parity Check (R68):
     - Standalone command checking if branch is behind remote and if local version configs are out of date.
  6. Subproject Dependency Synchronization (R69):
     - Synchronize internal package references (e.g. `vrc-packages-network`) across sibling projects.
  7. CI Test Policy Simplification (R70):
     - Eliminate redundant `VRCP_SKIP_TESTS` from workflow `env:` blocks and steps; rely on native `continue-on-error: ${{ channel == 'preview' }}` (release = fails closed; preview = non-blocking).

## Active checkpoint — Live Delivery Pipeline Full-Cycle Trials & Scoped CI Testing Task (2026-10-07)

- Preview Channel Full-Cycle Execution (All 5 Products Verified):
  1. `preview/package` (`vrcp-api/v2026.10.8-pre`):
     - Source commit `92e7ed72389b2968ba0e9e838dd2b653eb37d35e`, tag object `31b535392f85330312068c530ee5490992c9ccc4`.
     - CI run [`37617793757`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37617793757): build passed, npm OIDC publish succeeded, release-assets attached.
     - Terminal workflows: `Discord Announcements` ([`37618851303`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37618851303)) succeeded, `Cache Maintenance` ([`37618851135`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37618851135)) succeeded.
     - Verification: `bun run delivery:check vrcp-api/v2026.10.8-pre` verified all 5 asset digests (`status: release-artifacts-verified`, `artifactsVerified: true`).
  2. `preview/network` (`vrcp-network/v2026.10.6`):
     - Source commit `4bc4d54ef89ca2de6fc623b8d46123e7c8a90936`, tag object `0dcddfa96677201876435bc065dd80607c420a15`.
     - CI run [`37619026716`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37619026716): build, release-assets attach, and deployment-record succeeded.
     - Verification: `bun run delivery:check vrcp-network/v2026.10.6` verified all 4 artifact digests (`status: release-artifacts-verified`, `artifactsVerified: true`).
  3. `preview/crawler` (`vrcp-crawler/v2026.10.8-pre`):
     - Source commit `9662640760b47d1b615a10dbe0d7fa439c041513`, tag object `1bbae471c99395abfd268c9c94df1f87170a1fcc`.
     - CI run [`37619601351`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37619601351): route, build-linux, standalone-windows, publish-container to GHCR, and release-assets attach all succeeded.
     - Terminal workflows: `Discord Announcements` ([`37620152156`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37620152156)) succeeded, `Cache Maintenance` ([`37620152140`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37620152140)) succeeded.
     - Verification: `bun run delivery:check vrcp-crawler/v2026.10.8-pre` verified all 6 assets (Linux binary 82.7MB, Windows binary 87.5MB, receipts, changelog, checksums).
  4. `preview/crawler-client` (`vrcp-crawler-client/v26.10.7-pre`):
     - Source commit `24798f4eac0cea8fb846a54698fb9024731461c3`, tag object `3051e4b10dcb9a9aa982840c02b2aa3d3c9e0e8c`.
     - CI run [`37620460845`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37620460845): Windows Tauri build and release-assets attach-desktop succeeded.
     - Terminal workflows: `Discord Announcements` ([`37621661014`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37621661014)) succeeded, `Cache Maintenance` ([`37621660958`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37621660958)) succeeded.
     - Verification: `bun run delivery:check vrcp-crawler-client/v26.10.7-pre` verified all 5 assets (NSIS setup, WiX MSI, receipt, changelog, checksums).
  5. `preview/worker` (`cloudflare-worker/v2026.10.9-pre`):
     - Source commit `4593b7e5269e275982123ca82a8c835c3a98b154`, tag object `7963205e086c2fbf54adc8d5822e27319aaad92a`.
     - CI run [`37621951240`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37621951240): build and deploy to Cloudflare Preview environment succeeded.
     - Verification: `bun run delivery:check cloudflare-worker/v2026.10.9-pre` verified preview deployment, bundle SHA-256 and 1060537 bytes (`status: preview-deployed-no-release-assets`, `artifactsVerified: true`).

- Release Channel Execution (Single-Pass with Owner Authority):
  1. `release/package` (`vrcp-api/v0.0.7`):
     - Source commit `4e45aa32714e39d00f4f473ee0b259eb74b60301`, tag object `48064b6d4f614199a53143146479c1ac8526a76a`.
     - CI run [`37622479192`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37622479192): build, npm staging, and release-assets attach succeeded.
     - Staged in npm Staged Packages under Stage ID `a46aa633-1dfc-4616-94c1-55cb0b3fc730` awaiting owner manual approval.
  2. `release/crawler` (`vrcp-crawler/v0.0.12`):
     - Source commit `39f21d02633334364a18c7d67b7b82cc84371d30`, tag object `1db6e96b55b1117507aa932630c6ce06a36f4002`.
     - CI run [`37623262673`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37623262673): route, build-linux, standalone-windows, publish-container to GHCR, and release-assets attach all succeeded.
     - Terminal workflows: `Discord Announcements` ([`37623861316`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37623861316)) succeeded, `Cache Maintenance` ([`37623861331`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37623861331)) succeeded.
     - Verification: `bun run delivery:check vrcp-crawler/v0.0.12` verified all 6 assets (Linux binary 82.7MB, Windows binary 87.5MB, receipts, and checksums).
  3. `release/crawler-client` (`vrcp-crawler-client/v0.0.6`):
     - Source commit `04aa843df9e11d029584866840c9c4eb3e8e656e`, tag object `845b6f124885801300cf58437d437cba87f70abc`.
     - CI run [`37624229765`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37624229765): `prepare` step stopped with `Registry SDK channel resolves outside the authoritative version config` because `vrc-packages-api@latest` on npm is currently 0.0.6 while configured release SDK is 0.0.7 (awaiting owner approval of stage `a46aa633-1dfc-4616-94c1-55cb0b3fc730`). Rerun will proceed once approved.
  4. `release/worker` (`cloudflare-worker/v0.0.7`):
     - Source commit `9d626f9717894b505de297925bdcd23c098a328b`, tag object `9e50e4a44865fbd5465aa09cf262b34711ad974c`.
     - CI run [`37624730435`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37624730435): build succeeded, production deploy skipped (build-only).
     - Verification: `bun run delivery:check cloudflare-worker/v0.0.7` verified artifact 11483273679, bundle SHA-256 and 1060529 bytes (`status: release-build-only-no-production-deployment`, `artifactsVerified: true`).

- Queued Task `R60-CI-TEST-SCOPING`:
  - Queued into `UNMERGED_IMPLEMENTATION_PLAN.md` with requirement that tests can never be disabled on release/production routes.

## Active checkpoint — Submodule Setup, Package Script Cleanup, & CLI Help Walkthrough (R63) (2026-10-08)

- Submodule repository integration in setup script:
  - Added `web-search` (`src-web-search`, pointing to submodule `https://github.com/SlamTheDragon/vrc-packages-search`) to `setupProjects` in `scripts/setup.mjs`.
  - Added automatic git submodule initialization via `git submodule update --init --recursive` when submodules require initialization before dependency installation.
  - Added target argument handling in `scripts/setup.mjs` allowing `bun run setup web-search` or `bun run setup:web-search` to target individual projects directly.
- Root package.json scripts cleanup:
  - Removed obsolete and conflicting `"install": "bun run setup"` and `"postinstall": "bun run help"` scripts to avoid unexpected execution loops during package manager operations.
  - Removed legacy, redundant `build:release:*` and `build:preview:*` scripts across products.
  - Added `"setup:web-search": "node scripts/setup.mjs web-search"`.
  - Preserved root governance, delivery, versioning, cleanup, and product-referenced scripts.
- Enhanced CLI help tool (`scripts/help.mjs`):
  - Added comprehensive Quickstart Setup Walkthrough (Step 1: Environment, Step 2: Monorepo Setup & Submodules, Step 3: Verification).
  - Documented all 8 projects and submodules (`package`, `crawler`, `crawler-client`, `worker`, `network`, `web`, `web-search`).
  - Added rich concrete example usage with realistic example values across all commands and topics (`execute`, `setup`, `reconcile`, `delivery`, `recovery`, `cleaning`, `versions`, `testing`).
- Verification evidence:
  - `tests/setup.test.ts`: updated to cover all 8 projects, submodule initialization attempt on missing manifests, and unknown product handling (4/4 tests pass).
  - Root test suite and layout conformance tests verified green.
  - Live command verification: `bun run setup web-search` and `bun run setup:web-search` executed cleanly and installed dependencies non-destructively.

## Active checkpoint — Dynamic Owner Guard, Monorepo Setup & Local Token Resolution (R62) (2026-10-08)

- Dynamic owner check & admin authority:
  - Made `--force` single-pass release validation in `scripts/delivery-chain.mjs` dynamic: derives repository owner from `git remote get-url origin` (`repositoryFromRemote`) and checks GitHub collaborator admin permissions (`GET /repos/{owner}/{repo}/collaborators/{user}/permission`).
  - Added `loadRootEnv` and `resolveGitHubToken` with fallback to `git credential fill` across `delivery-chain.mjs`, `delivery.mjs`, and `release-announcements.mjs`.
  - Added `.env.example` in root documenting local token configuration.
- Monorepo dependency setup:
  - Implemented `scripts/setup.mjs` supporting `all`, `root`, and all individual subprojects (`crawler`, `crawler-client`, `package`, `web`, `worker`, `network`) using `bun install --no-save --ignore-scripts` without mutating lockfiles.
  - Wired setup scripts in root `package.json` (`setup`, `setup:all`, `setup:root`, and per-project scripts).
  - Documented setup commands in `scripts/help.mjs`.
- Verification evidence:
  - Added unit test suite `tests/setup.test.ts` (3 tests pass).
  - Added token resolution and `.env` test in `tests/delivery-chain.test.ts` (passes).
  - All 199 tests pass across 16 test files.
  - `bun run setup all` and `bun run setup root` executed cleanly.

## Active checkpoint — Root Execute Pipeline, Staging Pings, & Reconciliation (R61) (2026-10-08)

- Verified test suite: All 195 tests pass across 15 files (`bun test ./tests`, 2748 expectations).
- Product checks clean:
  - `src-package`: `tsc --noEmit` clean.
  - `src-crawler`: `tsc --noEmit` clean.
  - `src-crawler-client`: `svelte-check` 0 errors, 0 warnings.
  - `src-worker`: `cf-typegen && tsc --noEmit && tsc --noEmit -p test/tsconfig.json` clean.
- GitHub Actions workflow diagnostics resolved:
  - Declared `VRCP_SKIP_TESTS: ${{ vars.VRCP_SKIP_TESTS || '' }}` in top-level `env:` blocks for `vrc-packages-api.yml`, `cloudflare-worker.yml`, `node-client.yml`, and `node-docker.yml` to eliminate context access warnings.
- Help CLI tool:
  - Added `scripts/help.mjs` and `"help"` script in `package.json` documenting the authoritative execute pipeline, checkpoints, and troubleshooting commands.
- Live release status & reconciliation:
  - `vrc-packages-api@0.0.7` is live and published on npm with `latest: 0.0.7`.
  - GitHub Release for `vrcp-api/v0.0.7` is verified public (`draft: false`) with all 5 assets attached.
  - Rerun of failed jobs on `vrcp-crawler-client/v0.0.6` CI run [`37624229765`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37624229765) dispatched (status: queued).
- Committed and pushed to `main` at `33c7a03`.

## Active checkpoint — Product-Scoped CI Tests and Fail-Closed Test-Skip Flag (R60) (2026-10-07)

- Verified test suite: All 189 tests pass across 15 files (`bun test ./tests`).
- Scoped product checks clean: `src-package` (tsc clean), `src-crawler` (141 tests pass), `src-worker` (235 tests pass + runtime smoke), `src-crawler-client` (svelte-check 0 errors, 0 warnings).
- Fail-closed release enforcement verified on release routes across scripts and workflows. Preview tests continue-on-error.
- Committed and pushed to `main` at `42f856d`.

## Active checkpoint — Delivery Tooling Hardening, Workflow Normalization, & Recovery (2026-10-07)

- Verified test suite: `bun test ./tests` passes completely (184 passed, 0 failed, 2583 expectations across 15 files).
- Changelog strictly typed matching:
  - Exported canonical `changelogIdentifiers` in `scripts/changelog.mjs` distinguishing channels and products.
  - Strictly matches backticked product headings in `CHANGELOG.md` without loose substring fallbacks.
  - Tested in `tests/changelog.test.ts` (3/3 pass) and `tests/release-assets.test.ts` (17/17 pass).
- Release candidate branch naming & automatic cleanup:
  - Renamed release branch pattern from `codex/release/*` to `release/candidate/*` across delivery scripts and test fixtures.
  - Added `.github/workflows/cleanup-candidate-branch.yml` to automatically delete merged candidate branches upon PR close.
- Owner-only `--force` single-pass release:
  - Added `--force` option to `startDelivery` in `scripts/delivery-chain.mjs` restricted locally to repo owner (`SlamTheDragon`) via PAT (`GET /user`).
  - Writes `VRCP-Release-Direct: true` and `VRCP-Release-Base` trailers, commits directly to `main`, and pushes commit and tag atomically without temporary branches or PR ceremony.
  - In `scripts/delivery.mjs`, `checkReleaseSource` verifies owner actor on direct releases and bypasses PR requirements while retaining full metadata validation.
- GitHub Actions workflow name normalization:
  - Normalized all 13 workflow names (`name:`) down into concise, direct descriptive literal functions.
  - Aligned workflow triggers in `cache-maintenance.yml` and `release-announcements.yml`.
- Recovery execution for Crawler 0.0.9:
  - Completed via authorized recipe in `.github/delivery-recoveries.json`, retry run [`37606773009`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37606773009).
  - All jobs (`route`, `build-linux`, `standalone-windows`, `publish-container`, `release-assets / attach`) succeeded.
  - Announcement workflow run [`37607573560`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37607573560) succeeded and posted Discord embed.
  - Delivery verification (`node --env-file=.env scripts/delivery-chain.mjs check vrcp-crawler/v0.0.9`) verified all 6 assets and hashes.
- Single-pass delivery for Crawler 0.0.10:
  - Root `CHANGELOG.md` updated with 0.0.10 release notes under backticked heading.
  - Executed direct release on `main` at commit `075911e49c7f3ffcd71f32a73bf495eb68db2eeb`, created tag `vrcp-crawler/v0.0.10`.
  - Hosted CI run [`37609060480`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37609060480) completed all jobs (`route`, `build-linux`, `standalone-windows`, `publish-container`, `release-assets / attach`).
  - Terminal workflows executed: `Release Announcements` ([`37609773724`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37609773724)) posted Discord embed, `Cache Maintenance` ([`37609773710`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37609773710)) completed.
  - Fully verified via `node --env-file=.env scripts/delivery-chain.mjs check vrcp-crawler/v0.0.10`: returned `"status": "release-artifacts-verified"`, `"artifactsVerified": true` with all 6 asset checksums verified.
- Markdown comment stripping & package script delivery (Crawler 0.0.11):
  - Implemented `stripMarkdownComments` in `scripts/changelog.mjs` to strip HTML/markdown comments (`<!-- ... -->`) upon changelog extraction.
  - Cleans up trailing whitespace and collapses extra blank lines, ensuring extracted per-version files, commit descriptions, release notes, and Discord announcements contain zero markdown comments.
  - Added unit tests in `tests/changelog.test.ts` (186/186 tests passing across 15 files).
  - Added built-in `.env` loading to `scripts/delivery.mjs` and `scripts/delivery-chain.mjs` so root `package.json` scripts (`bun run delivery:release` / `npm run delivery:release`) execute without manual env flags.
  - Executed direct single-pass release via root script: `bun run delivery:release crawler --force --execute`.
  - Validated predecessor publication for `vrcp-crawler/v0.0.10`, committed directly on `main` at `4c20daa10d394b71cc06c5539f3d6f6517302013`, and pushed tag `vrcp-crawler/v0.0.11`.
  - Hosted CI run [`37611314794`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37611314794) completed all jobs (`route`, `build-linux`, `standalone-windows`, `publish-container`, `release-assets / attach`).
  - Terminal workflows completed: `Release Announcements` ([`37611905173`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37611905173)) posted Discord embed, `Cache Maintenance` ([`37611905182`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37611905182)) succeeded.
  - Fully verified via `bun run delivery:check vrcp-crawler/v0.0.11`: returned `"status": "release-artifacts-verified"`, `"artifactsVerified": true` with all 6 asset checksums verified.
- Single-pass delivery for Crawler Client 0.0.5:
  - Aligned `config.versions.json` baseline with published predecessor `vrcp-crawler-client/v0.0.4`.
  - Root `CHANGELOG.md` updated with 0.0.5 release notes under `## VRC Packages Crawler Client - `vrcp-crawler-client``.
  - Validated predecessor publication for `vrcp-crawler-client/v0.0.4` (verified setup.exe, msi, receipt, and changelog hashes).
  - Executed direct release on `main` at commit `b9b99a6b3995a36671aa90684d48636c67c40800`, created tag `vrcp-crawler-client/v0.0.5`.
  - Extracted clean changelog `docs/changelogs/vrcp-crawler-client/release/0.0.5.md` without markdown comments.
  - Hosted CI run [`37613541019`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37613541019):
    - `build`: completed (`success` - built Windows NSIS `-setup.exe` and WiX `.msi` bundles).
    - `release-assets / attach-desktop`: completed (`success` - approved by owner on `vrcp-crawler-client-release`).
  - Terminal workflows completed: `Release Announcements` ([`37614808893`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37614808893)) posted Discord embed, `Cache Maintenance` ([`37614808859`](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37614808859)) succeeded.
  - Fully verified via `bun run delivery:check vrcp-crawler-client/v0.0.5`: returned `"status": "release-artifacts-verified"`, `"artifactsVerified": true` with all asset checksums verified (`setup.exe`, `.msi`, receipt, changelog, checksums).
- Full 9/9 Configured Delivery Path Verification Pass:
  - Executed `bun run delivery:check:all`: full readback proof requested and returned `"verified": true` across all 9 paths:
    1. `preview/package` (`2026.10.7-pre`): `release-artifacts-verified`
    2. `preview/network` (`2026.10.5`): `release-artifacts-verified`
    3. `preview/crawler` (`2026.10.7-pre`): `release-artifacts-verified`
    4. `preview/crawler-client` (`26.10.6-pre`): `release-artifacts-verified`
    5. `preview/worker` (`2026.10.8-pre`): `preview-deployed-no-release-assets`
    6. `release/package` (`0.0.6`): `release-artifacts-verified`
    7. `release/crawler` (`0.0.11`): `release-artifacts-verified`
    8. `release/crawler-client` (`0.0.5`): `release-artifacts-verified`
    9. `release/worker` (`0.0.6`): `release-build-only-no-production-deployment`
  - All binary assets, sha256 checksum receipts, Discord notification embeds, cache maintenance triggers, and changelog markdown comment extractions verified cleanly.


## Owner handover — start here (2026-10-06)

Owner resumed job execution after this handover. SDK release finalization plan passed on synchronized main.
Execution pushed `vrcp-api/v0.0.6` at PR #13's exact merged commit `2b3c4175f29247721d17f06ef5df917c521f1da6`.
Tag object: `c4375001a753b6f9f2ab2f05d5baa3674b1580d0`. Hosted run `37492006796` passed its build and awaits `vrcp-api-release` approval.
The exact-run approval attempt returned HTTP 403: `Resource not accessible by personal access token`. No protection setting changed.
The GitHub gate subsequently cleared externally. Publication job `112367290717` passed staging-byte checks. Release attachment also passed.
Owner action: approve `vrc-packages-api@0.0.6` in npm Staged Packages, stage `fb038069-2792-45c9-9698-a787692b7cb2`.
CI reports `awaiting-npm-approval`. Do not treat successful staging as public npm publication or completed advancement proof.
Latest readback: all applicable jobs in run `37492006796` completed successfully. Root status reports `publication-not-proved`.
SDK `0.0.6` subsequently became public on npm. Reconciliation run `37493465506` passed on main without republishing or moving the tag.
Root `delivery:check vrcp-api/v0.0.6` passed all five public asset hashes and source/tag/registry proof.
SDK tarball SHA-256: `8df6aa373d7a12a67b21cb943552f785a9b445a2ebd0158e6d2945303d03ca17`.
Root network execution allocated and pushed `2026.10.5`, source `3913fbf6f36b10c292f1c9584dcffaea1f1b217e`, tag object `5ede792e24e2aa1fc57cfb0a72b894f12137d9b1`.
Run `37493750784` passed build and Release attachment. Its deployment-record job still waits. Pending-deployment readback returned no approval entries.
Independent desktop preview execution allocated and pushed `26.10.6-pre`, source `2ec947ac478f4d6f5b0ba2f4db112d6ffe6a1c8b`, tag object `dbbebeed3fc1b98315e3cfd20fc8ab52031f4834`.
Desktop run `37493901597` is building. Both roots retained the configured predecessor proof and generated ordinary immutable tags.
Next: monitor these exact runs. Check network publication, deployment URL and archive consumer proof before allocating crawler/Worker updates.
Network `2026.10.5` subsequently passed all four public artifact hashes. Deployment `6889154932` succeeded and links to its exact tagged Release.
Archive SHA-256: `01e9e39105dc78c06facffec0a2dea42504a3363f2288d55df072b55557e7b4d`. Its SDK peer bounds are `0.0.6 || 2026.10.7-pre`.
Root crawler execution pushed `2026.10.7-pre`, source `46698267f492f3a7d697aa2f6875d6cc866dd701`, tag object `8348c4e8c4c5caa82003c9311aab7524d93be0a7`.
Crawler run `37494341172` passed routing. Linux/container and Windows build jobs are running.
Root Worker execution pushed `2026.10.8-pre`, source `ef741a8c2977aff115ede623497bc843dd890a5a`, tag object `f06ac27eaf83e7dd03f77ca162e37f1c1b3add95`.
Worker run `37494407523` is building for `cloudflare-preview`. Production stays disabled, with no Worker Release assets.
Latest configured previews supersede the older handover table: network `2026.10.5`, crawler `2026.10.7-pre`, desktop `26.10.6-pre`, Worker `2026.10.8-pre`.
Next: monitor these exact consumer runs, check all bytes and channel identities, then prepare the remaining main-only release metadata PRs.
Worker preview `2026.10.8-pre` passed deployed/bundle proof. Artifact `11426194631` contains 1060537 checked bundle bytes.
Bundle SHA-256: `211379507ac3e2e82449700941077ac57915e050568419d87799b0944bc9bd4d`.
Owner merged Worker metadata PR #14. Main synchronized to `2f2d2731f42621c5bd53ca749fff4a85bc6f4a95` before finalization.
Root finalization pushed `cloudflare-worker/v0.0.6`, tag object `8d47b64ac600f0e3e7a00c19264d932b46c65490`, at that exact merged source.
Worker release run `37495038619` is building. Production deployment and Worker Release assets remain disabled.
Crawler preview `37494341172` passed Linux, Windows and container publication. Attachment is running. Desktop preview `37493901597` is still building.
Next: check those exact runs and final artifact/dependency/notification proof. Prepare crawler release `0.0.8` and desktop release `0.0.5` through owner-reviewed metadata PRs.
Owner reconfirmed deletion of all temporary agent branches after verification finishes. Keep cleanup deferred until their required evidence is retained.
Worker release `0.0.6` passed build-only bundle proof: artifact `11426838283`, 1060529 bundle bytes, SHA-256 `a1cce461e8efb40080cbc5cafb0e1093ea87e529f8f03bba2173fb74988f4619`.
Desktop preview `26.10.6-pre` passed all five public asset hashes. Discord check `112378441046` acknowledged message `1557065879794229450`.
Crawler preview workflow completed successfully. Discord check `112377498070` acknowledged message `1557065353656533123`. Full new binary proof remains pending.
Root prepared crawler release `0.0.8` at `383fcdc289ea0d96deed990f1ae847c0f8b4168b`, based on `1859b88b8ef5a0d44ed8f6188dbd98c888b2cd68`.
Its two-file diff changes only `config.versions.json` and `src-crawler/package.json`. Checkout returned to main without merging or tagging.
Owner review link: https://github.com/SlamTheDragon/vrc-packages/compare/main...codex%2Frelease%2Fcrawler%2Fv0.0.8?expand=1 .
Notification gap: SDK release `0.0.6` has no Discord check on its original source. Reconciled attachment run `37493502851` passed.
Recent announcement runs show no matching post-reconciliation run. Cause remains unverified. Do not fake acknowledgement or send an unchecked duplicate webhook.
Next: inspect this terminal-notification gap before main sign-off, then finalize owner-merged crawler metadata and prepare desktop release `0.0.5`.
Crawler preview `2026.10.7-pre` passed all six public hashes. Linux SHA-256: `6c92c308f7ab705264592dbf3cce1bfc82e0592dcde22443a000589b8e4c0b58`.
Windows SHA-256: `552f9e12130afd57d9eb8ec2ac84d4f86994502561571d5c8e3b0ae5b0a7fd94`. Independent preview GHCR readback remains open.
Owner merged crawler metadata PR #15 at `69387f5944a18819be763d80201c0cc7197cc717`. Main synchronized by fast-forward.
Finalization stopped with `Main advanced beyond the reviewed preparation base`. No `0.0.8` tag was pushed and no version was skipped.
The preparation base is `1859b88b8ef5a0d44ed8f6188dbd98c888b2cd68`. Merge first parent is `c23aa8320e19b7f4264f10bb2ffef48582fcf067`.
Git diff between those commits contains only `docs/scratch/task_tracker.md`. A narrow tracker-only exception is awaiting owner approval.
The guard lives in `scripts/delivery.mjs:102`. Do not bypass it or force a tag. Preserve exact owner-merged source and predecessor publication checks.
Fresh root `delivery:check:all` completed: eight configured paths passed full artifact proof. SDK release `0.0.6` alone reports `proof-unavailable`.
The command correctly returned exit 1. Both Worker paths passed their special no-Release proof. No local release artifacts were written.
These checks renew baseline evidence. They do not complete the outstanding next-patch trials, deployment-link review or main sign-off.
Next: inspect that same run, complete its protected publication gate and owner npm stage approval, then check public artifact proof.
Do not repeat finalization or allocate another SDK release. Network advancement still waits for this producer proof.

Main delivery sign-off remains open. No new publication or allocation ran during this handover.
The sections below this handover retain earlier evidence. Their older next steps are not current instructions.

### Current checkout and approvals

- Main is at `2b3c4175f29247721d17f06ef5df917c521f1da6`, the owner-merged SDK release PR #13.
- PR #13 changes only the release config, SDK manifest and network manifest. SDK release now declares `0.0.6`.
- Untracked `docs/changelogs/` files belong to the owner. They were not staged, read or removed for this checkpoint.
- Preview execution commits all nonignored pending files. Inspect that list before execution, especially the new changelog files.
- Preview can run on synchronized main or another synchronized branch. Release allocation and finalization remain main-only.
- Release metadata still needs owner inspection and manual merge. Standing trial approval does not authorize an agent to merge PRs.
- CI reruns remain manual. Keep tag immutability, protected release environments and owner-approved npm release staging.

### Nine-path evidence and remaining advancement

These are recorded runtime proofs, not nine new checks during this handover. A recovery is half-pass until its next patch passes.

| Path | Configured version | Last checked runtime evidence | Next required trial |
| --- | --- | --- | --- |
| API preview | `2026.10.7-pre` | Run `37468577502`: new patch passed after manual failed-job retry. Full root artifact proof passed. | Advancement checked. Retain the readback failure and retry evidence. |
| API release | `0.0.6` | Public predecessor `0.0.5` checked. Owner merged preparation PR #13. | Finalize merged `0.0.6`, complete npm staging approval, then check public bytes and Release. |
| Network, single stream | `2026.10.4` | Recovery `37460124422` passed. Four public hashes and archive consumer resolution checked. | Allocate `2026.10.5` after both SDK channels pass. |
| Crawler preview | `2026.10.6-pre` | Tagged run `37410193664` passed, including binaries, image and attachment. | Allocate `2026.10.7-pre` after the new network archive passes. |
| Crawler release | `0.0.7` | Recovery `37466559953` passed. Six asset hashes, GHCR, deployment link and Discord checked. | Prepare and owner-merge `0.0.8`, then finalize and check the complete chain. |
| Crawler Client preview | `26.10.5-pre` | Recovery `37460312551` passed. Five asset hashes and Discord checked. | Allocate `26.10.6-pre` after release SDK `0.0.6` passes. |
| Crawler Client release | `0.0.4` | Run `37357012826` and protected attachment replay `37454682979` passed. | Prepare and owner-merge `0.0.5`, then finalize and check the complete chain. |
| Worker preview | `2026.10.7-pre` | Run `37406393578` passed deployment and bundle proof with preview-only D1. | Allocate `2026.10.8-pre` after the new network archive passes. |
| Worker release build | `0.0.5` | Run `37357069065` passed build-only checks. Production deployment skipped. | Prepare and owner-merge `0.0.6`, then finalize and check build-only proof. |

Website delivery stays disabled. Worker environments get no GitHub Release or downloadable Release assets.
Crawler and Worker consume preview SDK plus the distributed network archive. Desktop and Web consume release SDK.
Targets assume the current UTC month remains October 2026. The root allocator determines the actual calendar version.

### Execute the remaining jobs

Use the repository root. Bun loads the ignored root credential file with `--env-file=.env`.
Do not print credentials or paste them into a command, log, fixture or issue.

1. Inspect `git status --short` and PR #13. Do not prepare API release `0.0.6` a second time.
2. Check the existing release-finalization plan:

   ```sh
   bun --env-file=.env run delivery:finalize package 13 2b3c4175f29247721d17f06ef5df917c521f1da6
   ```

3. Resolve any reported blocker without editing the version configs. Finalization requires a clean checkout that matches origin/main.
4. If the plan passes, repeat that exact command with `--execute`. It pushes the tag, not another version.
5. Follow the returned CI link. Complete the protected GitHub approval and approve the exact npm stage when requested.
6. Check `vrcp-api/v0.0.6` with the command below. A draft Release can await the existing SDK reconciliation workflow.
7. After SDK release proof passes, plan and execute the network preview delivery:

   ```sh
   bun --env-file=.env run delivery:check vrcp-api/v0.0.6
   bun --env-file=.env run delivery:preview network
   bun --env-file=.env run delivery:preview network --execute
   ```

8. Check the resulting network tag before dependent builds. Do not assume a successful tag push proves publication.
9. Allocate consumer previews with `delivery:preview crawler`, `crawler-client` and `worker`. Inspect each plan before adding `--execute`.
10. Prepare consumer releases with `delivery:release crawler`, `crawler-client` and `worker`, then add `--execute` after each plan passes.
11. Inspect and manually merge each returned metadata PR. Synchronize main before its matching finalization.
12. Finalize each release with `delivery:finalize <product> <PR-number> <exact-merged-main-SHA>`, then add `--execute` after its plan passes.
13. Run `delivery:check <returned-tag>` for every chain. Check image identities, artifacts, dependency versions, deployment URLs and applicable Discord acknowledgements.
14. Run the all-path commands below. Record failures, not just successful paths.

   ```sh
   bun --env-file=.env run delivery:diagnose:all
   bun --env-file=.env run delivery:check:all
   bun --env-file=.env run cache:check
   bun run clean all
   bun run reset all
   ```

The last two commands are dry-run plans without execution flags. Do not add deletion flags during delivery proof.
Allocate sequentially in this checkout. Hosted builds can run in parallel after their required producer proofs pass.
Do not run standalone version-sync commands as a substitute for root delivery. They can leave an incomplete metadata transition.
If a preparation head is missing locally, fetch `refs/pull/<PR-number>/head`. Never finalize a PR test-merge SHA.

### Blockers and failure procedures

- Owner approved `docs/changelogs/` and instructed agents to leave it untouched. Do not move, remove or rewrite its contents.
- The checker now allows the owner-approved `changelogs` folder. Its contents remain untouched and subject to ordinary Markdown link checks.
- The documentation gate passed all 374 document link/layout checks and whitespace checks. No other layout rule changed.
- Handover prose lint: 1.13 issues per 100 words. Whitespace checks passed. No product checks ran for this documentation checkpoint.
- SDK `0.0.6` finalization and hosted publication remain pending. A handover diagnostic failed at Git rev-parse before remote proof.
- That diagnostic failure does not prove a publication failure. The tag is not yet locally resolved. Use the finalization plan first.
- The GitHub connector previously refused PR creation with HTTP 403. Open the root executor's comparison link manually if necessary.
- An exact protected-deployment approval request returned HTTP 403. Read/write Actions access does not imply Deployments: write access.
- The owner subsequently approved the crawler gate externally. Check the next gate rather than assuming the local PAT permission changed.
- `delivery:retry <tag>` retries Git delivery only. It does not rerun CI or allocate another version.
- For a CI failure, inspect the failed step and existing outputs first. A manual failed-job rerun must retain the same source and version.
- Stop on different bytes, unknown partial publication, auth, provenance or broken tagged tooling. Do not bump past the failed version.
- `delivery:recover` accepts only exact reviewed identities in `.github/delivery-recoveries.json`. Do not invent a recovery recipe during a retry.
- Never move a published tag, replace published bytes, disable immutability or add a retry suffix to bypass the advancement guard.
- Independent CI config-transition enforcement remains open under critical `R58-CONFIG-TAMPER`. Local allocator guards are not tamper-proof security.
- Non-main preview execution remains a separate runtime proof. Do not claim every-branch delivery solely from a successful main run.
- Preserve provenance and reconciliation inputs during cleanup. Remote workflow-run deletion still needs exact safe targets.
- Final sign-off still needs the nine-path advancement matrix, root entry-point checks and reviewed delivery documentation.
- The owner's fresh clone follows sign-off. Preview D1 initialization and product runtime defects are outside this delivery gate.
- Delete temporary agent branches only after sign-off. Keep responsibility branches and their evergreen tracking PRs.

### Latest retry and retention evidence

- SDK preview `2026.10.7-pre` initially published, but its bounded registry-readback window failed. No automatic publication retry ran.
- Before a manual retry, the public tarball matched the original CI archive: 22633 bytes, SHA-256 `bf9ee3e29aa1c7f53129e29e87ed659025093e5ea43b2b2203e3f7aa116e1d97`.
- Manual rerun of failed job `112286091548` returned HTTP 201. This was not `delivery:recover` or an automatic CI rerun.
- The retry checked the existing package. It changed no source, version, tag or published bytes. Root full proof then passed.
- Deployment `6884970200` succeeded. Discord check `112289622295` acknowledged message `1557019077367832631`.
- Crawler recovery `37466559953` retained tag object `d9788177f481e7317c250e790dd5204ba67c95f0` and source `2e1c6011d1d21c7e7bb3b2a24de9d99575f88030`.
- GHCR `0.0.7` and `latest` matched manifest `sha256:738d07f45716f8a986b2abccfe641eb4dcd4b17ad83b7d4ce0c1726e4380b814`.
- Its historical SDK `2026.10.5-pre` and network `2026.10.3` labels are intentional recovery inputs, not current consumer targets.
- Cache readback measured 2262603737 bytes across 86 caches. Account capacity remains unmeasured. GitHub manages eviction.
- Cleanup and reset dry runs passed. No database, credential, dependency, build output or cache was deleted.
- Sanitized security intake is already in the ledgers. Intake completion does not mean security remediation passed.
- No claim guarantees every future build or publication will pass without failures. Manual diagnosis and immutable evidence remain required.

## Active gate — same-version recovery, then patch-advance proof (2026-10-06)

- Main permits normal source and preview pushes. Release metadata review, operator approvals and immutable tags remain required.
- API readback confirmed main-guard 24553134, immutable-delivery-tags 24553469 and stable-release 24553551 active with the documented controls.
- The advancement guard remains. Recover failed configured versions before another patch. Recovery counts as half a pass.
- Exact recovery identities remain in .github/delivery-recoveries.json. No published bytes or tag objects changed.
- Tooling through 11b340a passed the grouped gate: 81 tests / 1458 assertions. Hosted checks exposed and resolved stale fixtures.
- Network recovery 37460124422 passed. Root proof checked four public hashes. The consumer resolver checked the 26087-byte archive and source receipt.
- Desktop preview recovery 37460312551 passed. Root proof checked five public hashes. Its terminal Discord check acknowledged delivery.
- Repair 8fea87c checks GitHub's commit-level Discord sidecar separately from workflow jobs. Publication and zero-artifact guards remain strict.
- Repair f7044db reads binary proofs in exact 8 MB ranges. It checks every byte against the complete size and SHA-256 digest.
- Live finalization checked all six crawler 0.0.6 assets, including the complete 82707936-byte Linux and 87481344-byte Windows binaries.
- Root finalization pushed crawler 0.0.7 at owner-merged source 2e1c6011d1d21c7e7bb3b2a24de9d99575f88030 from PR #8.
- Tag object: d9788177f481e7317c250e790dd5204ba67c95f0. Actual CI run 37465066520 failed dependency preparation on Linux and Windows.
- Live evidence shows successful routing, skipped container publication/attachment and zero artifacts. Linux passed 158 root tests before preparation failed.
- Cause: the tagged SDK config selects 2026.10.5-pre, but registry latest selects 2026.10.6-pre. The config guard correctly refused it.
- Working theory: authorize that exact preparation-only failure for manual recovery. Existing recovery tooling pins the tagged SDK version.
- The new recipe checks both failed preparation steps and skipped later steps. It retains original source, version, tag and release approvals.
- Independent review tightened cleanup names, ordered step numbers and preparation-only retry checks. The final review found no remaining blocker.
- Final recovery/attachment/announcement checks passed 37 tests / 500 assertions. The earlier long run mixed superseded code with newer fixtures.
- Its 31 unchanged chain cases passed, but its mixed-state recovery failure is not a clean gate result. The final-source recovery rerun passed.
- All 374 document-link checks, syntax and whitespace checks passed. DELIVERY prose score: 1.47 issues per 100 words.
- Checked tooling c6f317f reached main by normal push. The actual root plan passed, then --execute dispatched recovery 37466559953.
- Recovery 37466559953 passed routing, Linux binary/container checks, Windows binary checks, protected publication and attachment.
- Owner granted standing release approvals for these production distribution trials. This does not remove protection rules or authorize automatic CI retries.
- The exact-run approval attempt returned HTTP 403 despite current_user_can_approve=true. GitHub requires repository Deployments: write for review requests.
- The gate subsequently passed externally. Root full proof checked all six public asset hashes and the exact recovery/source/tag identity.
- Linux SHA-256: 78a8318d159ce0a6f03c8d3e750a5429d183cbb4806fa847fd44d1bd2f565abc. Windows: 18a94c43e72141be01269ae8945bc18968900a541f2cbba75fba4b04e8901154.
- Public GHCR 0.0.7 and latest share manifest sha256:738d07f45716f8a986b2abccfe641eb4dcd4b17ad83b7d4ce0c1726e4380b814 and the exact tagged source/SDK/network labels.
- Deployment 6884524554 passed and links to the exact 0.0.7 Release. Discord check 112282424812 acknowledged message 1557014968916779119.
- Tag status retains the original failure until a recovered Release exists. The root recovery command shows the separate attempt and run link.
- Live cache monitoring returned 2262603737 bytes across 86 caches. Account capacity remains unmeasured and eviction remains GitHub-managed.
- Root clean all and reset all produced safe dry-run target plans. No build output, dependency, database, credential or cache was deleted.
- Same-version recoveries are checked. Working theory: exercise root SDK allocation first, then network and consumers after producer publication proof.
- SDK preview plan selects 2026.10.7-pre from configured 2026.10.6-pre without blockers. SDK release will select 0.0.6 with owner metadata review retained.
- Next: execute SDK preview through the root pending-checkpoint/version/tag chain, then prepare the reviewed SDK release. Network peer bounds change with SDK metadata.
- Each of the nine enabled paths needs next-patch chain proof, applicable bytes, dependency identities, deployment links and terminal notifications.
- Check GHCR independently for crawler delivery. Worker release is build-only without production deployment or Release assets. Website remains disabled.
- Non-main preview execution remains a separate runtime proof. D1 initialization and the owner's fresh clone remain outside delivery sign-off.

## Superseded checkpoint — temporary main preview branch

- The owner superseded this temporary branch policy. The following lines describe the earlier exercise, not the current procedure.
- Working theory: check the configured predecessor's remote publication and artifacts before creating a preview branch or changing version metadata.
- A main invocation will checkpoint pending source on that branch, allocate one patch and push its tag. No direct main push occurs.
- Source/config promotion back to main remains owner-reviewed. A stale main config must stop at remote tag checks, not allocate a skipped patch.
- Recovery 37454376963 passed route, Linux, Windows, container publication and attachment. Full root proof verified all six public artifact hashes.
- SDK preview attachment 37454683571 and desktop preview attachment 37454682893 passed. Protected desktop release attachment 37454682979 also passed.
- All-nine readback passed eight configured channels. Prepared crawler 0.0.7 still has no tag. Its old dependency snapshot needs review before publication.
- Next: implement the allocator boundary, then publish the compatible network producer before parallel node/Worker/desktop preview builds.
- The requested final chat matrix will distinguish live full-chain proof, attachment replay, build-only Worker release and disabled website paths.

## Active gate — immutable-source crawler recovery (2026-10-06)

- Owner approved the recovery attempt and real execution when ready. This supersedes the earlier refusal of reviewed recovery tooling.
- Scope: crawler `0.0.6`, original run `37413527166`, fixed source `995db61` and tag object `41039d1f0020a95eda00cd898654d35c093bde25`.
- Working theory: root manual dispatch can reuse the crawler chain on reviewed main while the product checkout stays at its original tag.
- Local gate passed 130 tests / 1986 assertions across seven grouped suites. Hosted recovery remains unverified.
- Root `delivery:recover` plans by default. Execution requires clean synchronized main and explicit Actions write access.
- The existing crawler workflow retains operator review, Linux/Windows checks, container publication, Release assets and terminal announcement.
- Saved dependency versions and product/config files remain tied to the tag. Receipts distinguish source and repair-tooling commits.
- Release titles and changelog headings take the delivered package manifest name. The grouped attachment checks passed.
- All 374 document link/layout checks and whitespace checks passed. DELIVERY prose score: 1.47 issues per 100 words.
- Owner merged PR #10. Clean main synchronized to 0e1eaf9d43cccbe2ec6e8e11d3686539d20c3268 before recovery.
- Environment readback passed: vrcp-crawler-release allows Branch main and its existing tag rule, with one required reviewer. Preview has no reviewer gate.
- Explicit local PAT reads and Actions dispatch passed. No credential value entered output or source.
- Root recovery plan passed. Approved execution dispatched run 37452937062: https://github.com/SlamTheDragon/vrc-packages/actions/runs/37452937062 .
- Recovery run failed on both runners before product builds. Routing passed. Container publication and Release attachment were skipped.
- Observed cause: archive extraction retained the old tracked web.yml, although reviewed main deleted it. Two workflow-layout assertions failed.
- Working theory: Git restore with no overlay can synchronize only delivery-owned paths, including deletions, while retaining tagged product/config files.
- Next: repair tooling synchronization and add an explicit manual same-version retry that refuses active runs or existing outputs. Promote before hosted execution.
- Owner reconfirmed real publication/deployment authority. Local tests cannot replace hosted chain proof. Existing operator protection remains intact.
- Actual Git synchronization on a disposable checkout removed obsolete web.yml and retained the exact original product/config files and source HEAD.
- Live API readback found zero artifacts and skipped publication/attachment jobs. The root retry checker rejected unchanged tooling as intended.
- Repair adds explicit --retry planning/execution for completed failed, output-free attempts with different reviewed tooling. It never retries automatically.
- Syntax, all 374 document links/layouts and whitespace checks passed. DELIVERY prose score: 1.44 issues per 100 words.
- Regression assertions were updated, but no local unit-test result is claimed for this repair. Hosted publication remains the delivery exit.
- Owner promotion PR #11 is open: https://github.com/SlamTheDragon/vrc-packages/pull/11 . Retain one test branch; do not merge for the owner.
- No version bump, tag replacement or operator approval ran. Tests alone do not pass this gate.
- Real local planning exposed an ESM entry-point cycle. The CLI fix now reaches remote source proof and reports the missing main promotion explicitly.
- The first grouped run found stale workflow/SDK assertions and an in-flight test/module mismatch. The corrected full rerun passed.
- Diagnosis now selects manual actions from observed failure phases. Only the reviewed, unpublished route-failure recipe can rebuild.
- Recovery setup: retain required operator review and add a Branch main rule to vrcp-crawler-release. The local credential needs Actions write.
- No guarantee covers every future failure. Unknown states, changed provenance, truncated evidence and partial publication require manual inspection.
- Checked commits through 18c752d were pushed to codex/delivery-proof. The GitHub connector refused PR creation with HTTP 403.
- Owner promotion link: https://github.com/SlamTheDragon/vrc-packages/compare/main...codex%2Fdelivery-proof?expand=1 . No credential expansion or main bypass ran.

## Current exercise — root commands and nine chains (2026-10-06)

- Owner requires real command and chain exercises before delivery sign-off. Historical green runs do not satisfy this exit alone.
- Main-only releases retain operator approvals. Synchronized branches can publish previews without approval guards. CI reruns remain manual.
- Owner merged PR #9 into main at `4e2ea92`. The checkout fast-forwarded before this exercise.
- All seven old agent branches were ancestors of merged main. Exact-OID remote deletions and local merged-branch deletions passed.
- Local and remote now contain only `main` and `codex/delivery-proof`. No tag or main history changed during cleanup.
- Root preview planning passed. Release planning on the test branch reported its main-only blocker. Website delivery rejected the disabled path.
- The crawler product-folder preview command forwarded to the root and returned the same branch/config plan.
- Root SDK preview execution checked the predecessor and pushed `2026.10.6-pre`. Commit: `979939bcbad09f6f5c7d9902777b3f3d55f098dd`. Tag object: `279a78d7b67a8eb3437fc448f48cd64d02aef78d`.
- Tagged run `37447577498` passed build, publication and Release attachment. Root `delivery:check` returned `release-artifacts-verified` and checked npm integrity against CI bytes. Terminal Discord acknowledgement remains unchecked.
- SDK product-scoped version check passed. The global preview check rejected mixed release/preview manifests. Do not synchronize all products to one channel to hide that result.
- All four product preview forwarders returned root plans. Cleanup/reset commands returned dry-run paths and removed nothing.
- Main declares crawler `0.0.7`, but its tag is absent. Failed `0.0.6` still blocks predecessor proof and finalization.
- Owner wants local troubleshooting scripts that preserve remote operator approvals. The latest recovery approval permits reviewed main tooling for the fixed failed tag.
- Working theory: one test branch can serve preview exercises. Release preparation still creates a separate branch and verifies its exact name.
- Next: finish SDK byte/link proof, exercise remaining product entry points, then repair the one-branch release contract and resolve crawler recovery manually.
- Keep D1 initialization and the owner's later fresh-clone check outside delivery sign-off. The full pre-production goal remains open.

## Active gate — publication-proof advancement (2026-10-06)

- Owner requires proof before another version advance, same-version publication retry, and root troubleshooting hooks.
- Owner reserves broken tagged workflow recovery for manual resolution. Explicit approved recovery can use reviewed main tooling. Never move tags.
- Registry readback: release versions are 0.0.0-stage, 0.0.0, 0.0.1, 0.0.3, 0.0.5. Preview patches are 0, 1, 3, 5. Historical gaps remain unchanged.
- Working theory: root allocation and release finalization must check the configured predecessor with the existing strict publication/artifact verifier before writes.
- Pending crawler 0.0.7 metadata does not authorize skipping failed 0.0.6. Its tag remains absent pending manual resolution and proof.
- Local proof/diagnostic/config-checkpoint gate passed 102 tests / 1638 assertions across the four related suites. The first run hit a default fixture timeout; the corrected full rerun passed with zero failures. All 374 document links/layout checks, syntax and whitespace checks passed.
- Root diagnosis and full proof commands read all nine configured channels. Hosted full checks passed eight: SDK preview/release, network, crawler preview, client preview/release, Worker preview and Worker release build-only. Crawler release 0.0.6 correctly failed the aggregate gate. No CI rerun or publication ran.
- Preview App allocation now requests read-only Actions metadata/archive access through its normal GitHub token. Its App remains contents-write only. The final targeted wiring check passed 1 test / 24 assertions. Procedure and lifecycle rules match manual-only CI reruns.
- Approval-service usage exhaustion rejected one command before execution. Normal review later became available and the command passed without a bypass. Local commits 8792e91 and 7dbe69f plus this checked wiring/evidence checkpoint are ready for owner promotion from codex/publication-proof-advancement. DELIVERY prose score: 1.49. Agent procedure score: 0.95.
- Owner decision: all CI reruns remain manual for now. Do not add automatic Actions POST requests. Keep stage/release approvals and immutable artifacts unchanged.

## Active repair — annotated release checkout (2026-10-06)

- The owner's ignored root `.env` supplies a read credential. Explicit `bun --env-file=.env run` passed authenticated PR reads and finalization.
- Finalization from clean main pushed crawler `0.0.6` at owner-merged PR #5 commit `995db61`; tag object `41039d1f0020a95eda00cd898654d35c093bde25` remains fixed.
- Run `37413527166` failed route before builds/publication. Checkout fetched the annotated tag, then replaced its local ref with the peeled commit. Strict proof rejected it.
- Working theory: explicit checkout ref suppresses the action's default commit/ref fallback. All release-capable callers and reusable attachments need this selection; proof checks remain unchanged.
- Repair commit `2af92d5` passed 97 grouped delivery, chain, attachment and provenance tests with 1598 assertions. All 374 document links/layout checks and whitespace checks passed. DELIVERY prose score: 1.50 issues per 100 words.
- Explicit refs preserve annotations in all ten release-capable checkout steps. Existing proof, approval and immutability checks remain unchanged. Upstream checkout input/ref helpers confirm the observed fallback.
- Hosted repair remains unverified. Push `codex/annotated-release-checkout` for owner promotion, then use the next root-configured crawler patch. Never move the failed `0.0.6` tag. Main sign-off remains guarded.

## Authority and active slice

- Owner update, 2026-10-06: R58 clarifies R57-C57A/B. It is not a separate roadmap.
- Preview uses the root allocator on synchronized branches. The preview-only GitHub App is accepted.
- Releases require main after manually reviewed promotion. Keep release reviews and npm owner staging.
- Keep long-lived responsibility branches and separate evergreen tracking PRs. Never merge tracking PRs or delete branches.
- Closed unmerged PRs can reopen. Merged promotion PRs cannot reopen.
- Only root scripts change the authoritative version configs. Commit each slice locally and push the checked gate checkpoint.
- Preserve SDK v0.1 owner review. Website delivery stays disabled. Worker release builds only, without GitHub Release assets.
- The full goal remains active. The owner creates branches and clones again after conditional sign-off.

Working theory: one root allocator can serve local and App-triggered previews without duplicate version logic.
The prior direct main commit/tag push could not satisfy reviewed-main protection.

Active output gate: lazy logger construction and idle CLI preservation are checked on codex/node-logger-output.
Construction now computes paths only. The first write starts files, timers and hooks. Unused close/rotation preserves existing logs.
Session-only logging preserves an existing latest.log. Active severity streams, rotation and shutdown fixtures passed.
Grouped path checks passed 141 tests / 874 assertions, types and a development binary build on 2026-10-06.
Source defaults use src-crawler/logs. Bun standalone mode selects absolute per-user storage, never the executable or launch directory.
Explicit overrides retain priority. Docker pins /app/data/logs. Relative platform state variables use absolute user-home fallbacks.
The compiled Windows logger fixture writes and closes successfully while cwd stays empty. Linux/macOS and container runs remain pending.
R58-ROOT-LOGS has local path proof, not tagged delivery proof. Existing owner logs remain untouched. No delivery bump ran.
The owner merged initializer PR #1 into main at 4a89ca2. Hosted initialization remains unverified.
Main ruleset 24553134 is active: default-branch PR requirement, zero required approvals, deletion/force-push denial and no bypass actors.
The owner merged lifecycle PR #2 into main at 9df1d19. These task branches are not the final responsibility-branch split.
Each slice stays a local commit. A checked gate permits a task-branch push, not a direct main write or agent merge.
Supply an owner comparison link if PR creation is unavailable. Do not expand permissions or disable protection.
The owner merged logger PR #3 into main at 6574094. Tagged cross-platform proof remains pending.
Ruleset readback: immutable-delivery-tags 24553469 blocks all tag updates/deletions, with no bypass actors.
Stable-release 24553551 now restricts creation only, with a RepositoryRole 5 admin bypass and all four preview exclusions.
The owner applied the correction. Main and immutable-tag bypass lists remain separate and must stay empty.
No settings changed through this agent. No open PR or recorded preview initializer run was visible in the latest readback.
Public unauthenticated environment readback succeeded on 2026-10-06. The connector's unsupported endpoint is not a GitHub access denial.
Owner corrections now permit Branch main and Worker tags in cloudflare-preview. Desktop preview and network have their product tag restrictions.
SDK, crawler and desktop release environments require owner review. Existing SDK/crawler/Worker environments use their product v* tag rules.
Select an existing product tag as the workflow ref for SDK OIDC diagnostics and desktop asset recovery. An input tag does not change that ref.
These are metadata checks, not hosted recovery proof or permission to change settings. No screenshot is needed for this readback.
Lifecycle writing scores: agent procedure 1.07, Delivery 1.54 issues per 100 words.
The repository-wide link/layout check failed on 10 existing findings outside the changed links. Do not record a full docs pass.
Findings include stale recovery-skill references, upstream skill links, CONTRIBUTING.md and a removed node protocol path. Repair separately before final sign-off.
This merge preserves the initializer, lifecycle and checked logger evidence. Its conflict repair changes only this checkpoint.
Main sign-off remains open. Delete temporary task branches only after sign-off and merged-work checks. Keep future responsibility branches.
The root allocator delivered non-main crawler preview 2026.10.6-pre from synchronized codex/node-logger-output.
Commit 2d27ce6 changed only preview-crawler and its manifest. Tag object: 08ac88eaafe73dc9e7637fa089e30f94751385ca.
Run 37410193664 passed Linux, Windows, container publication, Release attachment and its terminal Discord announcement job.
Linux exercised the changed logger: 141 tests / 874 assertions. Root delivery:check returned release-artifacts-verified.
Original CI bytes matched both binaries, receipts, checksums and changelog. Linux binary SHA-256: 750dbfa9f586b2c1cffefbfdcf8915e2148c9355ef1ee4e451a264c63e737988.
Windows binary SHA-256: 86c2edae5dafac639e0a9bb0c9347b2b6c5ebe2438059838cd2dd24934174562.
Release identity: https://github.com/SlamTheDragon/vrc-packages/releases/tag/vrcp-crawler/v2026.10.6-pre.
This is non-main delivery proof, not Worker schema initialization, stable release promotion or full goal completion.
Active initialization slice: a root command uses the distributed preview SDK for explicit autoSeed false, then a catalog read.
Plan by default. Execution requires the dedicated main-ref manual workflow and the existing cloudflare-preview secret scope.
Use one fixed approved preview origin. Reject redirects and bound time/body size. Never print server errors or operator credentials.
No version allocation, rebuild, seeding, source approval or production action belongs to this command.
The owner must permit Branch main in cloudflare-preview for this manual initialization workflow. Tag delivery rules remain.
Implementation 6b95629 and the ESM repair passed 13 related tests / 142 assertions, syntax and whitespace checks.
Published preview SDK 2026.10.5-pre passed explicit-false DTO, authenticated init, unauthenticated catalog and malformed-response checks with injected offline transport.
The first distribution check caught require.resolve selecting unsupported CommonJS exports. Bun now resolves the ESM package.
Both root and product planning commands passed without network calls. No initializer executed remotely.
Use a promotion branch and manual PR merge for these changes. Do not push them directly to main during protection setup.
The owner created and merged initializer PR #1 after the connector rejected PR creation with 403.
Owner next action: allow the manual initializer's main ref in cloudflare-preview, then run the guarded initializer.
Do not expand the preview App's permissions to resolve this connector limitation. No main, tag or D1 write ran.

Active release slice: prepare one config-derived metadata commit on a dedicated promotion branch, without a tag or main write.
After manual review/merge, finalize only its exact merged main commit with a tag-only push and the same saved version.
Reuse versionFiles and immutable-tag checks. Independent proof helpers must bind the PR, review, base/head and merged config transition.
The related local delivery gate passed. Hosted transition and repository protection remain open.
Hosted App authentication and main-branch allocation passed. Non-main allocation remains unverified.
Owner permits a manual owner-reviewed merge without a second reviewer. Check the owner merge identity, not a self-approval.
The API cannot prove human inspection. Hosted no-bump diagnostic 37406552782 passed with both mutation steps skipped.
Owner selects all nonignored pending files for preview checkpoints. Release still requires clean main.
Working theory: print the paths, reject stale branches and pending ignored index entries, then commit and push before allocating a patch.
Partial push recovery, path races and unrelated tags under push.followTags passed. Never unstage owner files or skip a patch.
New CI ingress checks use the original run actor and exact reviewed metadata. Historical exceptions bind exact tag/object/commit pairs.
Tag-selected code requires external main/tag/workflow protection. It cannot police old workflows. This remains a sign-off boundary.

## Documentation and cleanup checkpoint — 2026-10-06

Working theory: repair live references without recreating removed documents or changing architecture.
Eight stale links now point to existing files or official documentation. CONTRIBUTING uses current root Bun delivery procedures.
The owner approved root CONTRIBUTING.md and ignored docs/.obsidian as narrow layout exceptions.
The checker permits only that root document and that exact ignored metadata directory. Other layout restrictions remain.
CONTRIBUTING prose lint: 1.66 issues per 100 words. Whitespace checks passed.
The full link/layout check passed for 374 documents. Whitespace checks passed.
The supplied validator passed for both repaired skills through isolated uv with PyYAML. Project dependencies stayed unchanged.
Workflow inventory found 13 files. Product delivery, reusable asset attachment, announcements, reconciliation, initialization and cache support have current roles.
The disabled website workflow still contained a tag trigger and build/attachment scaffold. No current caller requires that scaffold.
Removed web.yml and changed the boundary test to require its absence. Local website development remains available.
Other 12 workflows retain current roles. Remote run deletion remains deferred without exact retention evidence.
Website cleanup passed 72 related delivery/assets/provenance tests and 1275 assertions. Git preserves the removed workflow for recovery.
The first check found four stale workflow fixtures. Corrected those fixtures while retaining every enabled-product check.
The full link/layout check passed 374 documents. Whitespace checks passed. No product bump or publication belongs to this deferred-workflow cleanup.
Delivery prose lint: 1.56 issues per 100 words. Canonical owner correction supersedes older sign-off prerequisites without closing runtime work.
Owner added workflow/run/code cleanup to sign-off. Inventory first, preserve delivery and security evidence, then assess exact deletion targets.
Authenticated ruleset readback confirmed admin creation bypass only in stable-release. Immutable tags keep an empty bypass list.
No version bump, publication, deployment or settings change belongs to this documentation gate.
The owner logs marker remains untracked and untouched. Main sign-off and hosted initialization remain open.

## Owner correction — delivery sign-off boundary

Crawler PR #5 was owner-merged at 995db61. The finalizer plan accepted its exact metadata and main identity.
Execution stopped before tag creation: anonymous GitHub API quota reached zero. No explicit shell read credential was present.
The provider reset header was 2026-10-06T04:33:07Z. This is throttling, not a proven ruleset or permissions denial.
The reader now distinguishes exhausted quota/429 from other failures and prints only a bounded reset time, never provider bodies.
Diagnostic repair passed 72 related delivery/provenance/assets tests and 1277 assertions. Link/layout checks passed 374 documents.
Delivery prose lint: 1.52 issues per 100 words. Never extract stored credentials or bypass proof.
The failed finalization ran from clean main at 995db61, not the metadata preparation branch. No release tag was created or pushed.
Retry the same crawler 0.0.6 finalization after the quota resets. Do not allocate another patch or change permissions from this throttle response.

Preview D1 initialization and catalog reads belong to later runtime/ingestion gates, not delivery sign-off.
The owner creates responsibility branches and checks a fresh clone after sign-off. That check is not a prerequisite.
The nine-path baseline and merged documentation gate passed. Protected release-promotion proof and scoped workflow cleanup remain.
Root release preparation pushed metadata commit 226dbab for crawler 0.0.6 on codex/release/crawler/v0.0.6.
Only the release-crawler config and product manifest changed. No tag or publication ran. The connector cannot create PRs (403).
Owner must create and manually merge that promotion before exact merged-main finalization and protected publication.
PR #4 was owner-merged at e8f1bfb. Existing task branches remain until sign-off and merged-work checks permit their deletion.

## Current state and checked contract

Local implementation checkpoints: 9ad6d94, f9aaa1f, d452345, e6fb556 and 7c4cbc2.
Owner vision/UI commit 39c509b is preserved. Its desktop runtime was not built in this root gate.
Human procedures are in docs/source/DELIVERY.md. Agent procedures are in docs/decisions/AGENT_DELIVERY_PROCEDURE.md.
Keep three scratch files and preserve owner-comment cells.

Preview: root plan → optional pending checkpoint/push → configured patch → metadata sync → commit/tag → atomic push.
Release: clean main → metadata branch/PR → owner merge → exact merged-main proof → tag-only push.
Product scripts forward to root. Native hooks stay separate to prevent re-entry.

- Synchronized feature-branch previews pass. Stale remote tags or main configs stop allocation before writes.
- Missing main objects fail closed. Planning does not fetch, skip patches or change saved versions.
- Non-main release start and unpublished retry fail. Lost acknowledgments retry the same tag. Different remote tags never move.
- SDK, crawler-image and Worker previews no longer need opt-in variables. Release switches, reviews, staging and byte checks remain.
- The branch-only App dispatcher serializes each product and calls root preview delivery.
- It requests current-repository Contents write permission, not merge or release approval.
- Ordinary pushes do not allocate versions. Missing App credentials stop before allocation.

Final grouped root checks on 2026-10-06 passed 151 tests and 2271 assertions, with zero failures (413.98 seconds).
The first run found one stale installer fixture. It now tests preview filename handling without weakening release proof.
Script syntax, workflow YAML parsing and whitespace checks passed.
Disposable Git remotes covered pending paths, staged-file races, ignored index denial, freshness and lost acknowledgments.
Release fixtures covered merge/squash/rebase, owner identity, generated metadata, renamed annotations and tag-only pushes.
Original-run checks reject App actors, wrong workflows, foreign source and forged historical tags. All 22 frozen pairs matched origin.
Workflow checks covered full history, read scopes, App routing, product forwarding and approval conditions.
Root entries stayed unchanged, including pre-existing logs. Scratch keeps three files. The canonical ledger keeps two tables.
Local Bun is 1.4.1. Hosted delivery pins 1.4.2. Hosted proof is recorded separately below.
Crawler leases, source access and D1 code did not change. Their runtime tests were not repeated.

No real version bump, tag change, publication, deployment, protection or branch creation ran in the local gate.
The owner subsequently ran the dispatcher. The first run allocated a real Worker patch because the diagnostic checkbox was unchecked.

Hosted evidence, 2026-10-06:

- Allocator 37406357833 passed App authentication and normal allocation on main. Its no-write step was skipped.
- Commit e6bc3cee changed only preview-worker 6 → 7 and the Worker manifest. Other configured product versions stayed unchanged.
- Tag cloudflare-worker/v2026.10.7-pre points to e6bc3cee. Tag object: 14c1a59ef2559c9db87b360e3a511fac5b54948b.
- Tagged Worker run 37406393578 passed build, root tests, Worker tests/types/native checks and deployment without rebuilding.
- Artifact 11387007401 contains only worker_entry.js and its receipt. Archive SHA-256: 7f65bbd53162280c66a2377569b1a2d86dc3c9b5bb66bf251cc073d60d5f766a.
- Bundle SHA-256: 2d4a6d324ef388efb86e1f5b717ea7727882c194d9c4a3f99d518219ee1d089e. Receipt matches product, version, channel, commit and tracked Wrangler config hash.
- Deploy logs report preview D1 fbef6ce1-4145-45ae-ae91-5d617a1f2672 and Worker version 40f7f884-af95-4b7e-86cf-ae1087bd6217.
- Corrected diagnostic 37406552782 passed App authentication and planning. Commit identity and allocation steps were skipped.
- Remote main and Worker tag remained unchanged after the diagnostic. The clean local checkout fast-forwarded to e6bc3cee.
- A GET to /health returned the expected unknown-route 404. That path is not a health endpoint and proves no D1 behavior.
- The implemented GET /v1/app/index?limit=1 returned 500, internal_error: D1 has no canonical_packages table.
- Delivery passed, but catalog runtime readiness did not. Initialize only the preview schema with autoSeed false, then repeat the read-only catalog check.
- No remote schema, seed, source profile or credential changed during this check. Do not print the operator secret.

## Retained checked baseline

Setup/output gate 0f2c384 is pushed:

- Root 112/1802, crawler 137/839 and Worker 235/2062 passed.
- Worker passed from root and product directories. Native D1 race/replay/revocation checks passed with zero external fetches.
- SDK 54/621 and strict installed Node/native Worker checks passed.
- One 23-file network archive passed npm/Bun/types/native checks with both SDK channels.
- Root entries and producer manifests stayed unchanged. Packed consumers use product-local private manifests and isolated compiler configuration.
- Disposable root setup → reset --apply → setup passed. This is not a full product fresh-clone proof.
- Cleanup fixtures passed repeatability, link/type rejection and state preservation. Checkout cleanup ran as plans only.

Nine delivered paths retain independent artifact, registry and link proof:

| Product | Preview / single stream: version and run | Release: version and run |
| --- | --- | --- |
| SDK | 2026.10.5-pre / 37349103560 attempt 2 | 0.0.5 / 37349119431; promotion 37352706548 |
| Crawler | 2026.10.5-pre / 37356931567 | 0.0.5 / 37356959435 |
| Desktop | 26.10.4-pre / 37356987065 | 0.0.4 / 37357012826 |
| Worker | 2026.10.7-pre / 37406393578 | 0.0.5 / 37357069065, build only |
| Network | 2026.10.3 / 37354313987 | No release stream |

Crawler/Worker use preview SDK and network. Desktop/web use release SDK. Network accepts both.
Seven distributed-product deployment links passed. Worker links remain deferred to docs.vrcpackages.com.

## Cleanup, security and notification boundaries

- Clean removes named generated outputs. Reset removes selected node_modules, including root and nested network.
- Both plan by default. --apply checks paths/types/links. Concurrent changes can still cause partial deletion without recovery copies.
- Preserve node databases/logs/credentials, local D1, shared Bun downloads and published identities.
- Latest cache observation: 2262603737 bytes across 86 entries. Account capacity is unknown.
- Tagged jobs restore compatible public downloads. Trusted main warming jobs save them. GitHub manages eviction.
- Most artifacts inherit repository retention. Container archives and announcement receipts use 14 days.
- Keep SDK artifacts during staging. Broader artifact/GHCR budgets remain open.
- C57B and sanitized security intake are committed. Raw input stays ignored. Findings are queued, not remediated.
- Announcement gate 209d5be passed locally. No synthetic, historical or live Discord message ran.
- Live acknowledgement waits for the next normal delivery, not a ceremonial bump.

## Open sign-off exits and next actions

1. Keep the checked App diagnostic and main preview evidence. Prove synchronized non-main delivery at a relevant capability milestone.
   Preview schema initialization belongs to the later ingestion gate, not delivery sign-off.
2. Check hosted release provenance and external main/tag/workflow protection. Contents write does not restrict the App to preview tags.
3. Preserve the checked all-nonignored checkpoint, ignored-file and same-version recovery guards.
4. Settle recovery refs. Environment rules match the workflow ref, not its input tag.
5. Main preview allocation, tag CI and original bytes passed. Non-main policy and distributed-product links remain separate checks.
6. Check main/tag protection before sign-off. The owner checks a fresh clone afterward. Never bypass release reviews.
7. Keep the checked local logger path gate. Prove tagged crawler delivery when source/protection gates permit its next configured patch.

Earlier metadata showed unprotected main. Latest read on 2026-10-06 confirms active main-guard ruleset 24553134, without bypass actors.
Desktop preview/network lacked selected-ref restrictions. No settings changed.
The shell has no gh executable. Credential extraction was rejected and not retried.

Parallel reviews found pending-run cancellation, repeated App allocation and stale-main retry gaps.
Repair bec2930 preserves pending delivery/attachment runs, rejects allocator reruns before App auth, and shares the main freshness check.
The reviewer checked the repair diff. Final grouped checks passed. No hosted trial ran.
Queue capacity is 100. Channel groups use the current -pre convention. Historical suffixless preview acceptance remains a caveat.

Independent reviews found followTags leakage and inconsistent retained-annotation headers. Both repairs passed grouped checks.
The reviewers hit their usage limit afterward. Their findings are evidence, not a complete threat-model proof.
Metadata-PR preparation and merged-main tag-only finalization now reuse version, source-run and immutable-tag helpers.
Tag routing, CI and artifact recovery check original source proof. Old tag-selected workflows still require external policy.
Never use a pre-merge test SHA, direct main push, App release allocation or automatic promotion merge.
Both owner-triggered App runs passed. No explicit local API write credential or dispatch-capable connector is available.
Do not resume unrelated feature work or declare the full goal complete.
