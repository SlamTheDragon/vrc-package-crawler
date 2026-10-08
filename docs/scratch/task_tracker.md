# Active Checkpoint — Bounded Multi-Job Transport, Reservations, and Receipts (Milestone G16, Slice R54-C39C)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Milestone: `G16` (Fleet budget and batched lease/recovery lifecycle)
- Active Slice: `R54-C39C` (Bounded multi-job transport, reservations, and receipts)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session (gate push rule disabled).

## Active Working Theories & Architectural Covenants

1. **Bounded Batch Claiming (1..10 Jobs)**:
   - To fit strictly within Cloudflare Workers Free limits (50 D1 statements/subrequests, 10ms CPU), batch claiming is bounded to 1..10 jobs (`maxJobs?: number`).
   - `ClaimResponseSchema` returns `status: "leased"` with `job: CrawlJobSchema` (first job, preserving 100% backward compatibility) and `jobs: CrawlJobSchema[]` (all claimed jobs).
2. **Per-Origin Reservations & Fairness**:
   - RFC 9309 and crawl etiquette dictate that a crawler must never concurrently fetch or monopolize a single origin in a batch.
   - Within a batch claim, the coordinator enforces `reservedOrigins`: at most one job per origin is leased in any single batch.
   - Each job atomically reserves its origin in `origin_leases` and transitions `crawl_jobs` to `'leased'` in D1 batch transactions.
3. **Per-Item Receipt Idempotency & Batch Submission**:
   - Bounded batch result transport allows submitting up to 10 results in a single request (`POST /v1/node/jobs/results`).
   - Each item in the batch receives an explicit individual receipt (`status: "accepted"` or `status: "rejected"` with `terminal: boolean`).
   - Partial batch failures and duplicate replays are isolated per item: an expired lease on item B does not roll back or reject valid item A.
4. **Durable Outbox Batch Flush**:
   - The crawler node's durable SQLite outbox flushes pending items in bounded batches using per-item receipts, classifying terminal rejections to avoid infinite retry loops while applying exponential backoff to transient rejections.

## Slice Execution Plan (Milestone G16, Slice R54-C39C)

- Step 1: Update `src-worker/packages/network/src/protocol/node_protocol.ts` with `maxJobs` on `ClaimRequestSchema`, `jobs` array on `ClaimResponseSchema`, `BatchResultItemSchema`, `BatchResultRequestSchema`, `BatchResultReceiptSchema`, `BatchResultResponseSchema`, and export them in `NODE_API_JSON_SCHEMAS`.
- Step 2: Implement batch claim with per-origin reservation fairness and `submitBatch` with per-item receipts in `src-worker/src/storage/d1/coordinator.ts` and `src-worker/test/support/local_sqlite.ts`.
- Step 3: Implement `/v1/node/jobs/results` endpoint in `src-worker/src/api/handler.ts`.
- Step 4: Implement `claim(maxJobs)` and `submitBatch` in `src-crawler/src/client/node_client.ts`, add `getPendingOutboxEntries(limit)` in `src-crawler/src/storage/local_sqlite.ts`, and integrate batch flushing in `src-crawler/src/runner/daemon.ts`.
- Step 5: Add comprehensive domain unit and integration tests across `src-worker` and `src-crawler`. Run domain test suites and commit locally.

## Verification Evidence & Retained Baselines

- Retained M-CRAWLER-OUTBOX, M-FLEET-CLOCK-JITTER, M-CRAWLER-HEADLESS-ENV baselines.
- Domain test execution passed at checkpoint:
  - `bun test --cwd src-crawler`: 155/155 tests pass across 24 files (1066 expect assertions).
  - `bun run --cwd src-crawler typecheck`: 0 errors.
  - `bun test --cwd src-worker`: 237/237 tests pass across 19 files (2079 expect assertions), including batched claim origin reservations and batched result isolation.
  - `bun run --cwd src-worker test:workers`: 3/3 vitest tests pass.
  - `bun run --cwd src-worker test:runtime`: 100% smoke test pass with local workerd D1 simulation.
  - `bun run --cwd src-worker check`: cf-typegen and dual tsconfig checks passed with 0 errors.
  - `src-worker/packages/network`: tsc build and typecheck passed with 0 errors.
- Verified Status: Slice R54-C39C verified.

