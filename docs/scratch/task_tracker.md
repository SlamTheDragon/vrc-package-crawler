# Active Checkpoint — D1 Action Table Consolidation into Unified Operator Audit Log (Slice R59-C59A)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: G18 (D1 Schema Consolidation, Entity Unification & Table Optimization)
- Active Slice: `R59-C59A` (Consolidate the five redundant action tables `node_credential_actions`, `operator_actions`, `job_seed_actions`, `operator_rule_actions`, and `source_access_profile_actions` into a single unified `operator_audit_log` table: `action_id, entity_type CHECK IN ('node','lead','job','rule','profile'), entity_id, actor, action, reason, occurred_at`, update coordinator audit queries and migration scripts, and verify backward-compatible API contracts)
- Status: **In Progress (Unverified)**
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session; preview deployment authority granted for workers when live data testing is required.

## Target Architecture & Safety Invariants

1. **Unified Schema**:
   - `operator_audit_log`: `(action_id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL CHECK(entity_type IN ('node','lead','job','rule','profile')), entity_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL)`.
   - Index: `idx_operator_audit_log_entity` on `(entity_type, entity_id, occurred_at)`.
   - Index: `idx_operator_audit_log_occurred` on `(occurred_at DESC, action_id DESC)`.
   - Backwards-compatibility views: `node_credential_actions`, `operator_actions`, `job_seed_actions`, `operator_rule_actions`, `source_access_profile_actions` mapped over `operator_audit_log`.

2. **Coordinator Operations**:
   - Node token issuance/revocation writes `operator_audit_log` with `entity_type='node'`, `entity_id=node_id`.
   - Lead approvals/rejections write `operator_audit_log` with `entity_type='lead'`, `entity_id=lead_key`.
   - Job seeds write `operator_audit_log` with `entity_type='job'`, `entity_id=job_id`, `action='seed'`.
   - Auto-queue rule creations/disables write `operator_audit_log` with `entity_type='rule'`, `entity_id=rule_id`.
   - Source access profile creations/disables write `operator_audit_log` with `entity_type='profile'`, `entity_id=profile_id`.

3. **Storage Parity**:
   - Maintained identically across D1 coordinator engine (`src-worker/src/storage/d1/utils.ts`, `coordinator.ts`) and local SQLite simulation (`src-worker/test/support/local_sqlite.ts`).
