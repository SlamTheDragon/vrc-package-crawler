# Active Checkpoint — Fleet Idle Backoff, Bounded Jitter, and Clock Alignment (Milestone M-FLEET-CLOCK-JITTER)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Goal: Implement coordinator-directed bounded idle backoff, decorrelated jitter, and clock alignment across crawler nodes and coordinator (resolving R50-C31 and R54-C39B).
- Active Slice: `FLEET-CLOCK-TESTS-AND-VERIFICATION` (Comprehensive tests for backoff scaling, jitter limits, ladder reset, and cross-domain verification).
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Slices mean local commit, completed gates mean push.

## Active Working Theories & Architectural Covenants

1. **Fleet Quota Defense & Idle Pacing (R50-C31 & R54-C39B)**:
   - On empty claim queues, polling every 1,000ms without jitter would consume 864,000 requests/day for 10 nodes, violating Cloudflare Free daily limits (100k requests/day).
   - An adaptive backoff ladder starting at base 5,000ms and scaling up to 60,000ms (1 min) reduces steady-state idle polling to ~14,400 requests/day across 10 nodes (~14.4% of daily quota).
   - Randomizing delays with bounded jitter (±20%) breaks phase-locking across fleet nodes and prevents thundering herd bursts.
2. **Instant Responsiveness on Available Work**:
   - The idle backoff ladder must reset to 0 immediately upon receiving a claimed job (`status === "claimed"`), allowing the node to execute subsequent claims at full speed without delay penalty.
3. **Shutdown Responsiveness**:
   - Sleep intervals must remain responsive to abort/stop signals by sleeping in small increments (e.g., <=100ms) or observing the stop controller, ensuring crawler shutdowns complete within milliseconds even when idle delay is 60s.
4. **Coordinator Pacing Contract**:
   - The coordinator `claim` handler suggests a baseline `retryAfterMs` of 5,000ms (within protocol bounds of 0-300,000ms) when no jobs are eligible.

## Slice Execution Plan (Milestone M-FLEET-CLOCK-JITTER)

- `FLEET-IDLE-BACKOFF-JITTER-DAEMON` [COMPLETED - commit 861945f]: Added `minIdleDelayMs`, `maxIdleDelayMs`, `idleBackoffMultiplier`, `jitterRatio`, `randomFn`, backoff calculation, and jitter application to `src-crawler/src/runner/daemon.ts`.
- `COORDINATOR-EMPTY-DELAY-ALIGNMENT` [COMPLETED]: Aligned coordinator empty `retryAfterMs` default to 5,000ms in `src-worker/src/storage/d1/coordinator.ts` and `local_sqlite.ts`.
- `FLEET-CLOCK-TESTS-AND-VERIFICATION` [IN PROGRESS]: Add deterministic tests for jitter bounds, ladder scaling, ladder reset, and verify crawler and worker suites.

## Verification Evidence & Retained Baselines

- `src-crawler` unit & lifecycle test suite: 148 pass, 0 fail (963 assertions) across 24 files (`bun test --cwd src-crawler`).
- `src-crawler` TypeScript typecheck: clean, 0 errors (`bun run --cwd src-crawler typecheck`).
- `src-worker/packages/network` TypeScript typecheck: clean, 0 errors (`bun run --cwd src-worker/packages/network typecheck`).
- `src-worker` typecheck & typegen: clean, 0 errors (`bun run --cwd src-worker check`).
- `src-worker` unit test suite: 235 pass, 0 fail (2062 assertions) across 19 files (`bun test --cwd src-worker ./test`).
- `src-worker` Vitest workerd runtime test suite: 3 pass, 0 fail (`bun run --cwd src-worker test:workers`).
- `src-worker` coordinator runtime smoke suite: 100% pass across initialization, registration, enqueue, refresh, discovery, and claim races (`bun run --cwd src-worker test:runtime`).
