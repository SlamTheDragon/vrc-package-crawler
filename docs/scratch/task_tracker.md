# Active Checkpoint — Crawler Node Durable Outbox & Envelope Bounds (Milestone M-CRAWLER-OUTBOX)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Goal: Implement durable result outbox, crash-restart recovery, and envelope safeguards for Crawler Node and Coordinator integration.
- Active Slice: `FLEET-OUTBOX-TESTS-AND-VERIFICATION` (Completed - gate verification across crawler, network, and worker suites).
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Slices mean local commit, completed gates mean push.

## Active Working Theories & Architectural Covenants

1. **Durable Outbox Invariant (VISION.md §5 & R15-C17 / R54-C39D)**:
   - Crawler nodes must never discard crawled metadata outcomes on submission failure or network partition.
   - Outcome payloads and their generated `idempotencyKey` must be staged durably into SQLite WAL before any coordinator HTTP submission.
   - On coordinator communication failure, the outbox record retains `pending` status with backoff and retry scheduling.
   - On coordinator success (HTTP 200 with matching `jobId`), the outbox record transitions to `sent` and the task transitions to `completed`.
   - On terminal rejection (e.g., expired lease, non-retryable 4xx), the outbox record transitions to `dead` to prevent indefinite retries.
2. **Crash-Restart Recovery Lifecycle**:
   - When `CrawlerNodeDaemon` starts up, it flushes unacknowledged pending outbox records to the coordinator before or alongside claiming new leases.
   - Replaying identical `idempotencyKey` and `jobId` ensures coordinator D1 idempotent deduplication.
3. **Outbox Quota and TTL Boundaries**:
   - The local store must enforce a max pending outbox capacity (e.g., 1,000 entries) and a maximum outbox TTL (e.g., 24 hours / 86,400s) to prevent unbounded local disk growth during prolonged partitions.
4. **Envelope Bounds & Streaming Defense (Q-NODE-ENVELOPE)**:
   - `CrawlJobSchema` enforces explicit length ceilings on wire fields: `url` (max 2,048), `origin` (max 255), `etag` (max 256), `lastModified` (max 128).
   - `CoordinatorClient.post` enforces a strict 2 MiB response byte cap and cancels oversized response bodies before JSON deserialization.

## Slice Execution Plan (Milestone M-CRAWLER-OUTBOX)

- `CRAWLER-OUTBOX-SCHEMA` [COMPLETED - commit 9fa818a]: Added `node_outbox` table, indices, staging, delivery status tracking, and pruning to `src-crawler/src/storage/local_sqlite.ts`.
- `NODE-ENVELOPE-BOUNDS` [COMPLETED - commit 4b3feb3]: Added wire field ceilings to `CrawlJobSchema` in `vrc-packages-network` and 2 MiB streaming cap to `CoordinatorClient.post` in `src-crawler`.
- `CRAWLER-OUTBOX-DAEMON-RECOVERY` [COMPLETED - commit 7f5bbfc]: Integrated outbox staging and restart flushing into `src-crawler/src/runner/lease_runner.ts` and `src-crawler/src/runner/daemon.ts`.
- `FLEET-OUTBOX-TESTS-AND-VERIFICATION` [COMPLETED]: Verified local sqlite tests, lifecycle tests, coordinator client tests, daemon crash-restart recovery, and coordinator runtime smoke suite.

## Verification Evidence & Retained Baselines

- `src-crawler` unit & lifecycle test suite: 148 pass, 0 fail (963 assertions) across 24 files (`bun test --cwd src-crawler`).
- `src-crawler` TypeScript typecheck: clean, 0 errors (`bun run --cwd src-crawler typecheck`).
- `src-worker/packages/network` TypeScript typecheck: clean, 0 errors (`bun run --cwd src-worker/packages/network typecheck`).
- `src-worker` typecheck & typegen: clean, 0 errors (`bun run --cwd src-worker check`).
- `src-worker` unit test suite: 235 pass, 0 fail (2062 assertions) across 19 files (`bun test --cwd src-worker ./test`).
- `src-worker` Vitest workerd runtime test suite: 3 pass, 0 fail (`bun run --cwd src-worker test:workers`).
- `src-worker` coordinator runtime smoke suite: 100% pass across initialization, registration, enqueue, refresh, discovery, and claim races (`bun run --cwd src-worker test:runtime`).
