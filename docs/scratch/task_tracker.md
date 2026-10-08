# Active Checkpoint — Coordinator Fail-Fast Bearer Authentication (Slice COORDINATOR-FAILFAST-AUTH / Q-API-RESOURCE-BUDGET)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: Resource Budget and Admission Defense (`Q-API-RESOURCE-BUDGET` / Node Admission Boundary)
- Active Slice: `COORDINATOR-FAILFAST-AUTH` (Validate node authorization header before body streaming, deserialization, and schema validation)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session (gate push rule disabled).

## Active Working Theories & Architectural Covenants

1. **Admission Defense Before Body Deserialization**:
   - In `src-worker/src/api/handler.ts`, reading up to 256 KiB of JSON, running `JSON.parse`, and validating complex Zod schemas prior to inspecting the `Authorization` header exposed coordinator worker CPU and memory to unauthenticated denial-of-service streams.
   - Validating the `Authorization: Bearer <token>` header upfront ensures unauthenticated requests fail fast with `401 unauthorized` in $O(1)$ time without consuming network body streams or spending CPU cycles on deserialization.
2. **Preservation of Protocol Errors for Authenticated Callers**:
   - Authenticated callers with valid bearer tokens still receive accurate 400 (`bad_json` or `invalid_payload`), 413 (payload too large), and 415 (unsupported media type) errors if their request body is malformed or invalid.
3. **Consistency Across API Boundaries**:
   - Aligns node request handling with existing `operator_handler.ts` and `downstream_handler.ts` patterns where authorization headers are inspected prior to parsing request bodies.

## Slice Execution Plan (COORDINATOR-FAILFAST-AUTH)

- Step 1: In `src-worker/src/api/handler.ts`, move `Authorization` header check to execute immediately after route matching, prior to `readJson(request)`.
- Step 2: Add integration test in `src-worker/test/integration/local_coordinator_protocol.test.ts` verifying that unauthenticated requests with malformed JSON bodies fail fast with 401 instead of 400.
- Step 3: Run domain test suites: `bun test` in `src-worker`, `bun run check` in `src-worker`, `bun run test:runtime` in `src-worker`, `bun run test:workers` in `src-worker`, and `bun test` in `src-crawler`.
- Step 4: Update `CHANGELOG.md` preview section adhering strictly to Rule 05 and ASD-STE100 guidelines. Commit slice locally.

## Verification Evidence & Retained Baselines

- `src-worker` domain test suite: 238/238 tests pass across 19 files (`bun test --cwd src-worker`).
- `src-worker` Vitest worker pool: 3/3 tests pass (`bun run --cwd src-worker test:workers`).
- `src-worker` runtime smoke test: 100% pass (`bun run --cwd src-worker test:runtime`).
- `src-worker` typecheck & cf-typegen: 0 errors (`bun run --cwd src-worker check`).
- `src-crawler` domain test suite: 158/158 tests pass across 24 files (`bun test --cwd src-crawler`).
- `src-crawler` TypeScript typecheck: 0 errors (`bun run --cwd src-crawler typecheck`).
- `src-worker/packages/network`: 0 build and typecheck errors.
- Checkpoint Status: VERIFIED.
