# Active Checkpoint — Outbox Durable Recovery, Quota Flow Control, and Late-Result Policies (Milestone G16, Slice R54-C39D)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Milestone: `G16` (Fleet budget and batched lease/recovery lifecycle)
- Active Slice: `R54-C39D` (Durable outbox recovery, quota exhaustion flow control, TTL pruning, and coordinator late-result policies)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session (gate push rule disabled).

## Active Working Theories & Architectural Covenants

1. **Prior Receipt Replay vs First Late Result**:
   - The coordinator strictly distinguishes between an exact replay of a previously accepted submission (`job_results` match on `lease_id`, `node_id`, `idempotency_key`, and digest) and a first-time submission whose lease has already expired (`job.lease_expires_at <= now`).
   - Prior receipt replays return `{ status: "accepted", duplicate: true }` regardless of whether the lease interval has elapsed, guaranteeing at-least-once delivery idempotency without false failure.
   - First-time submissions arriving after lease expiration must fail closed with terminal rejection (`status: "rejected"`, `terminal: true`, `code: "lease_expired"`), preventing race conditions with reassigned leases or overwritten fresher records.
2. **Outbox Quota Exhaustion Flow Control**:
   - If the crawler's durable outbox reaches `maxPendingOutboxQuota`, claiming new leases from the coordinator wastes fleet lease budgets and risks unpersisted fetch drops.
   - The daemon must check `getPendingOutboxCount()` prior to claiming new jobs. If full, it initiates an emergency flush and pruning pass. If still saturated, it pauses claiming and enters an idle backoff delay until the outbox drains.
3. **Durable Crash Recovery on Startup**:
   - In-flight entries marked `'submitting'` during an abrupt process termination (SIGKILL, crash) must be recovered on daemon initialization (`recoverInterruptedOutboxEntries()`), ensuring zero orphaned or lost work items.
   - Stored `idempotency_key` and outcome payloads are preserved exactly across crashes.
4. **Periodic Outbox Pruning & TTL Lifecycle**:
   - A configurable periodic interval (`outboxPruneIntervalMs`, default 1 hour) ensures long-running crawler nodes periodically prune dead/sent records and expire abandoned pending entries beyond `outboxTtlMs` (default 24 hours).

## Slice Execution Plan (Milestone G16, Slice R54-C39D)

- Step 1: In `src-crawler/src/storage/local_sqlite.ts`, add `getPendingOutboxCount()` and `recoverInterruptedOutboxEntries()`. Enhance `pruneOutbox` to support emergency pruning when quota is reached.
- Step 2: In `src-crawler/src/runner/daemon.ts`, add outbox quota preflight flow control before `claim()`, periodic background outbox pruning, and startup outbox recovery.
- Step 3: In `src-worker/src/storage/d1/coordinator.ts` and `src-worker/test/support/local_sqlite.ts`, ensure `submitBatch` precisely tags expired leases with `code: "lease_expired"` and `terminal: true`.
- Step 4: Add comprehensive domain unit and integration tests:
  - In `src-crawler/tests/node_daemon.test.ts`: test quota pausing, startup recovery of `'submitting'` entries, and periodic TTL pruning.
  - In `src-worker/test/integration/local_coordinator_protocol.test.ts`: test prior replay post-expiry vs first late submission rejection (`code: "lease_expired"`).
- Step 5: Update `CHANGELOG.md` preview section adhering strictly to Rule 05 and ASD-STE100 guidelines. Run domain checks and commit locally.

## Verification Evidence & Retained Baselines

- Retained M-CRAWLER-OUTBOX, M-FLEET-CLOCK-JITTER, M-CRAWLER-HEADLESS-ENV, and R54-C39C baselines.
- `src-crawler` domain test suite: 158/158 tests pass across 24 files (`bun test --cwd src-crawler`).
- `src-crawler` TypeScript typecheck: 0 errors (`bun run --cwd src-crawler typecheck`).
- `src-worker` domain test suite: 238/238 tests pass across 19 files (`bun test --cwd src-worker`).
- `src-worker` Vitest worker pool: 3/3 tests pass (`bun run --cwd src-worker test:workers`).
- `src-worker` runtime smoke test: 100% pass (`bun run --cwd src-worker test:runtime`).
- `src-worker` typecheck & typegen: 0 errors (`bun run --cwd src-worker check`).
- `src-worker/packages/network`: 0 build and typecheck errors.
- Checkpoint Status: VERIFIED.

