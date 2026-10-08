# Active Checkpoint — SDK Bounded Response Reading & Query Log Redaction (Slice SDK-BOUNDED-ENVELOPE-AND-LOG-REDACTION / Q-SDK-ERRORS)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: Resource Budget and Admission Defense (`Q-SDK-ERRORS` / Bounded Transport Ceilings)
- Active Slice: `SDK-BOUNDED-ENVELOPE-AND-LOG-REDACTION` (Streaming byte ceilings on SDK responses and query parameter redaction in Worker error logs)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session (gate push rule disabled).

## Active Working Theories & Architectural Covenants

1. **Bounded Response Stream Consumption in SDK**:
   - `src-package/src/client.ts` previously read response bodies into memory via standard unconstrained `response.text()` / `response.json()`. A misconfigured or malicious coordinator/endpoint returning multi-megabyte payloads risked client-side memory exhaustion.
   - Enforcing streaming chunked reading with byte ceilings (`MAX_SDK_ERROR_BYTES = 64 KiB`, `MAX_SDK_SUCCESS_BYTES = 4 MiB`) and early stream cancellation via `reader.cancel()` prevents unbounded allocations while unwrapping typed errors cleanly.
2. **Log Privacy and Query Parameter Suppression**:
   - In `src-worker/src/worker_entry.ts`, top-level 404 and unhandled exception logging previously emitted the raw `request.url`.
   - Logging `{ path: url.pathname }` instead of `request.url` prevents sensitive query strings (such as tokens, session secrets, or search keywords) from leaking into Cloudflare logs and Logpush streams.

## Verification Evidence & Retained Baselines

- `src-package` domain test suite: 55/55 tests pass across 7 files (`bun test --cwd src-package`).
- `src-package` TypeScript typecheck: 0 errors (`tsc --noEmit` in `src-package`).
- `src-worker` domain test suite: 238/238 tests pass across 19 files (`bun test --cwd src-worker`).
- `src-worker` Vitest worker pool: 3/3 tests pass (`bun run --cwd src-worker test:workers`).
- `src-worker` runtime smoke test: 100% pass (`bun run --cwd src-worker test:runtime`).
- `src-worker` typecheck & cf-typegen: 0 errors (`bun run --cwd src-worker check`).
- `src-crawler` domain test suite: 158/158 tests pass across 24 files (`bun test --cwd src-crawler`).
- `src-crawler` TypeScript typecheck: 0 errors (`bun run --cwd src-crawler typecheck`).
- Checkpoint Status: VERIFIED.
