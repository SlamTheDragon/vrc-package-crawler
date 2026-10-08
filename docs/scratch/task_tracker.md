# Active Checkpoint — Cryptographic Delegation Verification Budget Benchmark (Slice CRYPTO-DELEGATION-BUDGET / R54-C38CPU)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: Cryptographic Delegation & Resource Budget (`R54-C38CPU` / Free-Tier CPU Headroom)
- Active Slice: `CRYPTO-DELEGATION-BUDGET` (Benchmark and verify Web Crypto attestation verification budgets under the Cloudflare Workers 10 ms CPU ceiling)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session (gate push rule disabled).

## Active Working Theories & Architectural Covenants

1. **Cloudflare Free-Tier 10 ms CPU Headroom**:
   - Cloudflare Workers Free limits HTTP requests to 10 ms of CPU time. Waiting on I/O or D1 does not consume CPU, but cryptographic key parsing, payload normalization, signature verification, and replay hashing do.
   - Using native `crypto.subtle` avoids heavy third-party bundle bloat and leverages runtime Web Crypto optimizations.
2. **Symmetric (HMAC-SHA256) vs Asymmetric (ECDSA P-256) Verification Comparison**:
   - HMAC requires shared secret storage in trusted backends and offers near-instant verification (< 0.2 ms).
   - ECDSA P-256 allows verifier private keys to stay outside the coordinator while verifying public keys in Worker, at a minor additional CPU cost (< 1-2 ms).
   - Cold key import vs warm CryptoKey caching must both be evaluated against worst-case 64 KiB envelopes.
3. **Canonical Delegation Envelope & Negative Path Invariants**:
   - The attestation must strictly bind requester (`appId`), action (`creator_ownership_claim`), target front (`frontUrl`), creator identity (`creatorId`), challenge token, expiry timestamp, and unique nonce.
   - Negative paths must fail deterministically: tampered frontUrl, altered creatorId, expired challenge, replay of nonces, and invalid signatures.

## Verification Evidence & Retained Baselines

- Benchmark Measurements (`src-worker/test/crypto_delegation_benchmark.test.ts`):
  - HMAC-SHA256 cold import + verification: ~0.79 ms (well within 10 ms ceiling).
  - ECDSA P-256 cold import + verification: ~0.96 ms (well within 10 ms ceiling).
  - Cached warm key verification loop (100 iterations): ~0.05 ms per verification.
  - Worst-case 64 KiB envelope SHA-256 digest: ~0.48 ms.
  - Whole-handler attestation lifecycle (expiry check + replay detection + verification + receipt creation): ~0.46 ms.
  - Negative paths (tampered targets, expired tokens, replayed nonces, corrupted signatures) rejected deterministically.
- `src-worker` domain test suite: 247/247 tests pass across 20 files (`bun test --cwd src-worker`).
- `src-worker` Vitest worker pool: 3/3 tests pass (`bun run --cwd src-worker test:workers`).
- `src-worker` runtime smoke test: 100% pass (`bun run --cwd src-worker test:runtime`).
- `src-worker` typecheck & cf-typegen: 0 errors (`bun run --cwd src-worker check`).
- `src-crawler` domain test suite: 158/158 tests pass across 24 files (`bun test --cwd src-crawler`).
- `src-crawler` TypeScript typecheck: 0 errors (`bun run --cwd src-crawler typecheck`).
- `src-package` domain test suite: 55/55 tests pass across 7 files (`bun test --cwd src-package`).
- `src-package` TypeScript typecheck: 0 errors (`tsc --noEmit` in `src-package`).
- Checkpoint Status: VERIFIED.
