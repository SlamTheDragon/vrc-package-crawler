# Active Checkpoint — Consolidate Dispute and Claim Tables into catalog_tickets (Slice R59-C59D)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: G18 (D1 Schema Consolidation, Entity Unification & Table Optimization)
- Active Slice: `R59-C59D` (Consolidate `creator_opt_outs`, `delegated_creator_claims`, and `catalog_reports` into unified `catalog_tickets` table, preserving wire compatibility and read views)
- Status: **Verified (Ready to Commit)**
- Verification Evidence:
  - `src-worker`: `bun test ./test` (267/267 pass, 22 files), `bun run test:runtime` (0 exit code, miniflare workerd D1 smoke passed), `bun run check` (typegen + tsc clean), `bun run build:preview` (clean preview build).
  - `src-crawler`: `bun test` (158/158 pass, 24 files).
  - `src-package`: `bun test` (61/61 pass, 7 files).
- Prior Completed Slices:
  - `R59-C59A`: Consolidated 5 action tables into `operator_audit_log`, verified & committed locally (`34e43dd`).
  - `R59-C59B`: Inlined `owner_user_id` into `registered_apps`, eliminated `user_app_ownership` table, verified & committed locally (`7181166`).
  - `R59-C59C`: Merged `refresh_lease_id` and `refresh_lease_expires_at` into `origin_robots`, eliminated separate lease table, verified & committed locally (`13f925b`).
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session; preview deployment authority granted for workers when live data testing is required.

## Target Architecture & Safety Invariants

1. **Schema Refactoring**:
   - `catalog_tickets`: table consolidating ticket_id, ticket_type ('opt_out','delegated_claim','removal_report'), app_id, target_url, canonical_id, requester_type, requester_id, creator_id, reason, proof_kind, proof_value, contact_email, challenge_token, expires_at, nonce, signature, payload_json, review_status, review_notes, recorded_at.
   - Indexes:
     - `idx_catalog_tickets_nonce`: UNIQUE on (app_id, nonce) WHERE nonce IS NOT NULL
     - `idx_catalog_tickets_review`: on (ticket_type, review_status, recorded_at, ticket_id)
     - `idx_catalog_tickets_canonical`: on (canonical_id)
     - `idx_catalog_tickets_target_url`: on (target_url)
   - Compatibility Views:
     - `creator_opt_outs`: SELECT from `catalog_tickets` WHERE `ticket_type = 'opt_out'`
     - `delegated_creator_claims`: SELECT from `catalog_tickets` WHERE `ticket_type = 'delegated_claim'`
     - `catalog_reports`: SELECT from `catalog_tickets` WHERE `ticket_type = 'removal_report'`

2. **Coordinator Operations**:
   - Update `recordCreatorOptOut`, `listCreatorOptOuts`, `verifyTakedown`, `submitDelegatedClaim`, `listDelegatedClaims`, `verifyDelegatedClaim`, and `recordRemovalReport` in `coordinator.ts` and `local_sqlite.ts`.
   - Preserve existing method contracts and wire endpoints completely.

3. **Storage Parity**:
   - Maintained identically across D1 coordinator engine (`src-worker/src/storage/d1/utils.ts`, `coordinator.ts`) and local SQLite simulation (`src-worker/test/support/local_sqlite.ts`).
