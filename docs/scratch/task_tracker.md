# Active Checkpoint — Delegated Creator Attestation Intake & Replay Protection (Slice R54-C38C)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: Cryptographic Delegation & Verified Intake (`G15` / `R54-C38C`)
- Active Slice: `R54-C38C` (Attestation intake schema, coordinator storage, replay protection, and operator review receipts for pending creator claims)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session (gate push rule disabled).

## Active Working Theories & Architectural Covenants

1. **Zero External Fetch and Egress Boundary**:
   - The coordinator never performs storefront network fetches or triggers crawler fleet discovery jobs upon receiving a creator claim.
   - Verified partner applications check creator placement challenges out-of-band; the coordinator ingests signed attestations into `delegated_creator_claims` strictly with `review_status: "pending"`.
2. **Replay Protection and Atomic Idempotency**:
   - Every attestation binds `appId`, `action: "creator_ownership_claim"`, `frontUrl`, `creatorId`, `challengeToken`, `expiresAt`, and a unique `nonce`.
   - `(app_id, nonce)` uniqueness is enforced at the database level.
   - An exact duplicate submission (matching attestation payload and signature) returns the original receipt with HTTP 202 idempotently.
   - A replayed nonce with altered payload or signature fails with HTTP 409 conflict.
   - Expired attestations (`expiresAt < now`) fail with HTTP 400.
   - Submissions where bearer `appId` does not match `attestation.appId` fail with HTTP 403.
3. **Operator Review Receipts**:
   - Staff/operator review routes (`GET /v1/operator/claims` and `POST /v1/operator/claims/{claimId}/verify`) provide keyset-paginated claim auditing and verdict transition receipts without premature catalog destruction.

## Verification Evidence & Retained Baselines

- Baseline: Commit `99f9739` verified `src-package` 55/55 tests and `src-worker` 247/247 tests.
- Slice `R54-C38C` Verification:
  - `src-package`: 56/56 tests passed (`bun test --cwd src-package`), typecheck clean (`tsc --noEmit`), `dist/` built and validated.
  - `src-worker`: 249/249 tests passed (`bun test --cwd src-worker`, 2283 assertions), worker runtime tests passed (`test:workers`, 3/3 vitest), runtime smoke passed (`test:runtime`), full typecheck and bindings clean (`bun run --cwd src-worker check`).
  - `src-crawler`: 158/158 tests passed (`bun test --cwd src-crawler`, 1088 assertions), typecheck clean (`tsc --noEmit`).
  - Replay protection verified: duplicate submission returns 202 idempotently, altered payload/signature returns 409 conflict, expired returns 400, appId mismatch returns 403.
  - Operator audit verified: keyset pagination, status filtering, and verify verdict transitions tested with schema adherence.
  - Documentation updated: `API_ROUTES.md` (§2.2, §2.4, Access Matrix) and `CHANGELOG.md` (Preview channel, ASD-STE100).

