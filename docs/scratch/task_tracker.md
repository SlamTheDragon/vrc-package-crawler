# Active Checkpoint — Trusted App Delegation Authority & Operator Management (Slice R54-C38A1)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: Delegated Creator Removal and Operator Authority Pathways (`G15` / `R54-C38A1`)
- Active Slice: `R54-C38A1` (Enforce trusted app delegation authority check on `/v1/app/claims/intake`, add operator endpoints `/v1/operator/apps` and `/v1/operator/apps/:appId/delegation`, and add SDK client methods)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session (gate push rule disabled).

## Active Working Theories & Architectural Covenants

1. **Trusted Verifier Admission Boundary (Owner Covenant R54-C38A)**:
   - "Only trusted/reviewed applications can receive authority to perform removal on their behalf."
   - Default app registration grants standard consumer permissions (`catalog:read`, `catalog:search`, `demand:feedback`).
   - Delegation permission (`claims:delegate`) requires explicit operator review and grant.
2. **Fail-Closed Claims Intake**:
   - `/v1/app/claims/intake` strictly checks `app.permissions.includes("claims:delegate")`.
   - Applications lacking this permission receive `403 Forbidden` (`Application is not authorized for delegated creator claims`).
3. **Operator App Authority Management**:
   - `GET /v1/operator/apps`: Lists registered applications, metadata, creation/revocation status, and granted permissions with cursor pagination.
   - `POST /v1/operator/apps/:appId/delegation`: Allows operators to grant or revoke `claims:delegate` permission with optional audit reason.
4. **Wire Schemas & SDK Interface**:
   - `OperatorAppRecordSchema`, `OperatorAppListResponseSchema`, `SetAppDelegationRequestSchema`, `SetAppDelegationResponseSchema` defined in `src-package/src/protocol/operator.ts`.
   - `client.operator.apps.list()` and `client.operator.apps.setDelegation()` in `src-package/src/client.ts`.

## Measured Verification Evidence

1. **`src-package`**:
   - 58/58 tests passed (`bun test`). Validated `OperatorAppRecordSchema`, cursor base64url encode/decode, `client.operator.apps.list()`, `client.operator.apps.setDelegation()`, and operator token requirement.
   - Clean build via `bun run build`, synced `dist/` into all `node_modules/vrc-packages-api/dist/`.
2. **`src-worker`**:
   - 252/252 tests passed (`bun test ./test`).
   - Verified `/v1/app/claims/intake` rejects un-reviewed applications lacking `claims:delegate` with 403 Forbidden (`Application is not authorized for delegated creator claims`).
   - Verified `store.setAppDelegation(appId, true)` grants delegation and enables 202 intake.
   - Verified revoking delegation restores 403 rejection.
   - Verified `GET /v1/operator/apps` and `POST /v1/operator/apps/:appId/delegation` with pagination, JSON schema export, case-insensitivity, and error cases (401, 404).
   - `bun run check` cleanly passed (`wrangler types`, `tsc --noEmit`, and `tsc --noEmit -p test/tsconfig.json`).
3. **`src-crawler`**:
   - 158/158 tests passed (`bun test`). Domain suite intact.

## Open Risks & Next Steps

1. Next Slice: `R54-C38B` (Creator Ownership Attestation & Signature Verification Protocol).
2. Commit slice `R54-C38A1` locally (`preview/crawler-network`).
