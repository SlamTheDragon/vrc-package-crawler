# Active Checkpoint — Inbound 429 Rate Limiter & Abuse Protection Middleware (Slice R54-C39C)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: G15 Extension (Rate Limiting, Admission Control & Free Quota Protection)
- Active Slice: `R54-C39C` (Implement strict inbound 429 rate limiting on public endpoints and node endpoints, reinforced across all coordinator routes to prevent Cloudflare free quota drainage, returning RFC-compliant `Retry-After` headers and standard error envelopes)
- Status: **Verified** (Slice complete and verified through automated test suites and typechecks)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session; preview deployment authority granted for workers when live data testing is required.

## Delivered Architecture & Safety Invariants

1. **Vulnerability Mitigation**:
   - **Public Endpoints (`GET /v1/app/index*`)**: Enforces IP-based rate limiting (`PUBLIC_CATALOG: 60 req/min`) before executing D1 database queries, preventing cache-busting scrapers from draining D1 read rows.
   - **Node Endpoints (`POST /v1/node/*`)**: Enforces rate limiting on IP + bearer token prefix (`NODE_CLAIM: 30 req/min`, `NODE_HEARTBEAT: 20 req/min`, `NODE_RESULT: 60 req/min`) **before** reading or parsing the 256 KiB request payload, eliminating memory exhaustion vectors from rogue/spinning nodes.
   - **Downstream App Endpoints (`POST /v1/app/*`)**: Rate-limits search (`APP_SEARCH: 120 req/min`), reports (`APP_REPORT: 30 req/min`), claims intake (`APP_CLAIMS_INTAKE: 30 req/min`), and app registration (`APP_REGISTER: 100 req/min`).
   - **Administrative Routes**: Reinforced operator (`1,200 req/min`), moderator (`120 req/min`), and user (`120 req/min`) routes to prevent automated loops from draining Cloudflare quota.

2. **Rate Limiting Engine & Envelope**:
   - `InMemoryRateLimiter`: Tracks sliding windows keyed by IP or principal ID. Self-pruning periodic cleanup keeps memory bounded.
   - Rejections return `429 Too Many Requests`, `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers, along with `{ schemaVersion, code: "rate_limited", error: message }`.
   - Successful requests return standard `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers.

## Verification Evidence

1. **`src-worker` Unit & Integration Tests**:
   - Ran `bun test` in `src-worker`: 267 pass, 0 fail across 22 test files (2,620 expectations passed).
   - `test/rate_limiter.test.ts`: Verified 8 tests covering window decrementing, window expiration, header extraction (`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`), 429 status and envelope validation, and live route rejections on public catalog, node claims, and downstream searches.
2. **Typecheck & Build Conformance**:
   - Ran `bun run check` in `src-worker`: `cf-typegen`, `tsc --noEmit`, and `tsc --noEmit -p test/tsconfig.json` passed with 0 errors.
