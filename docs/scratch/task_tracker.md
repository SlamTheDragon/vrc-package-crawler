# Active Checkpoint — Headless Crawler Process & Direct .env Consumption (Milestone M-CRAWLER-HEADLESS-ENV)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Goal: Remove CLI tooling and scaffolding from `src-crawler`. The crawler node process starts directly with whatever `.env` / `process.env` it consumes.
- Active Slice: `CRAWLER-REMOVE-CLI-TOOLING` (Streamlining `src-crawler/src/main.ts` and `src-crawler/src/config/runtime_config.ts`).
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Slices mean local commit, completed gates mean push.

## Active Working Theories & Architectural Covenants

1. **Pure Headless Daemon Design**:
   - The crawler node is a headless worker daemon designed for background and containerized execution, not an interactive CLI application.
   - Interactive `init` wizard, `help` menus, and `printSetupGuide` are superfluous CLI tooling that should be removed.
2. **Direct Environment / .env Driven Startup**:
   - The process boots immediately by consuming `.env` / `process.env` (`NODE_ID`, `NODE_TOKEN`, and optional `COORDINATOR_URL`, `NODE_CAPABILITIES`, `NODE_DB_PATH`, `NODE_RUN_ONCE`).
   - If required variables (`NODE_ID`, `NODE_TOKEN`) are missing, fail fast with a concise, actionable error pointing to `.env` configuration.
3. **Preserve Headless Lifecycle Signals**:
   - Keep standard daemon shutdown and lifecycle handling (`SIGINT`, `SIGTERM`, stdin `stop`/`exit`, and stopfile monitoring).

## Slice Execution Plan (Milestone M-CRAWLER-HEADLESS-ENV)

- `CRAWLER-REMOVE-CLI-TOOLING` [VERIFIED]:
  - Removed CLI subcommands (`init`, `help`, `printSetupGuide`) from `src-crawler/src/main.ts`.
  - Removed `initializeNodeConfig` from `src-crawler/src/config/runtime_config.ts`.
  - Streamlined `loadNodeRuntimeConfig` error reporting to instruct configuring `.env` / environment variables (`NODE_ID`, `NODE_TOKEN`, etc.).
  - Updated `src-crawler/tests/node_runtime_config.test.ts` to test direct `.env` configuration.
  - Updated `src-crawler/tests/node_cli_help.test.ts` to assert headless `.env` failure exit (code 1) and `--version` retention.
  - Domain tests verified: `src-crawler` 153/153 pass, `src-worker` 235/235 pass, `src-worker` vitest 3/3 pass, smoke tests 100% pass; TypeScript checks clean.

## Verification Evidence & Retained Baselines

- M-CRAWLER-HEADLESS-ENV verification:
  - `bun test --cwd src-crawler`: 153 pass, 0 fail (1051 expect calls).
  - `bun run --cwd src-crawler typecheck`: Clean (tsc --noEmit).
  - `bun test --cwd src-worker`: 235 pass, 0 fail (2062 expect calls).
  - `bun run --cwd src-worker test:workers`: 3 pass, 0 fail.
  - `bun run --cwd src-worker test:runtime`: Smoke suite passed 100%.
- Retained M-FLEET-CLOCK-JITTER baseline: verified and pushed in commit 532d5b1.
