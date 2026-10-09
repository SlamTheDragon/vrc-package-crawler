# Active Checkpoint — Merge Robots Refresh Leases into origin_robots (Slice R59-C59C)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: G18 (D1 Schema Consolidation, Entity Unification & Table Optimization)
- Active Slice: `R59-C59C` (Merge `refresh_lease_id` and `refresh_lease_expires_at` directly into `origin_robots`, eliminating `origin_robots_refresh_leases` table, replacing it with a compatibility view, and removing redundant joins in job claim and candidate queries)
- Status: **In Progress (Unverified)**
- Prior Completed Slices:
  - `R59-C59A`: Consolidated 5 action tables into `operator_audit_log`, verified & committed locally.
  - `R59-C59B`: Inlined `owner_user_id` into `registered_apps`, eliminated `user_app_ownership` table, verified & committed locally.
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session; preview deployment authority granted for workers when live data testing is required.

## Target Architecture & Safety Invariants

1. **Schema Refactoring**:
   - `origin_robots`: add `refresh_lease_id TEXT`, `refresh_lease_expires_at TEXT`.
   - Add index `idx_origin_robots_refresh` on `origin_robots(origin, refresh_lease_expires_at)`.
   - Replace `origin_robots_refresh_leases` table with compatibility view: `origin_robots_refresh_leases AS SELECT origin, refresh_lease_id AS lease_id, refresh_lease_expires_at AS lease_expires_at FROM origin_robots WHERE refresh_lease_id IS NOT NULL`.

2. **Coordinator Operations**:
   - `reserveRobotsRefresh`: upsert lease directly into `origin_robots`.
   - `releaseRobotsRefresh`: clear lease columns on `origin_robots`.
   - `completeRobotsRefresh`: update snapshot fields and clear lease columns in a single row update, eliminating separate DELETE statement.
   - `claim` / job candidate queries: filter on `(r.refresh_lease_expires_at IS NULL OR r.refresh_lease_expires_at <= ?)` directly on `origin_robots`, eliminating the extra LEFT JOIN.

3. **Storage Parity**:
   - Maintained identically across D1 coordinator engine (`src-worker/src/storage/d1/utils.ts`, `coordinator.ts`) and local SQLite simulation (`src-worker/test/support/local_sqlite.ts`).
