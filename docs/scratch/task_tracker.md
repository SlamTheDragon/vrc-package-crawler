# Active Checkpoint — App Ownership Inlining into registered_apps (Slice R59-C59B)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: G18 (D1 Schema Consolidation, Entity Unification & Table Optimization)
- Active Slice: `R59-C59B` (Inlining app ownership by adding `owner_user_id TEXT REFERENCES registered_users(user_id)` directly to `registered_apps`, replacing `user_app_ownership` junction table with a backward-compatibility view, and optimizing age-verification query joins)
- Status: **In Progress (Unverified)**
- Prior Completed Slices: `R59-C59A` (Consolidated 5 action tables into `operator_audit_log`, verified via 267 worker tests, runtime smoke, 158 crawler tests, 61 package tests, committed locally)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session; preview deployment authority granted for workers when live data testing is required.

## Target Architecture & Safety Invariants

1. **Schema Refactoring**:
   - `registered_apps`: add `owner_user_id TEXT REFERENCES registered_users(user_id)`.
   - Add index `idx_registered_apps_owner` on `registered_apps(owner_user_id)`.
   - Remove standalone `user_app_ownership` table and replace with compatibility view `user_app_ownership AS SELECT app_id, owner_user_id AS user_id FROM registered_apps WHERE owner_user_id IS NOT NULL`.

2. **Coordinator Operations**:
   - `registerApp`: insert `owner_user_id` directly in the single `registered_apps` INSERT statement, eliminating multi-statement batching overhead.
   - `authenticateApp`: replace two-step join (`registered_apps -> user_app_ownership -> registered_users`) with direct single join (`registered_apps -> registered_users ON registered_users.user_id = registered_apps.owner_user_id`).
   - `listUserApps`: query `registered_apps` directly filtered by `owner_user_id = ?` and joined with `registered_users`.

3. **Storage Parity**:
   - Maintained identically across D1 coordinator engine (`src-worker/src/storage/d1/utils.ts`, `coordinator.ts`) and local SQLite simulation (`src-worker/test/support/local_sqlite.ts`).
