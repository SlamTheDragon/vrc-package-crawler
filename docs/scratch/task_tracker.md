# Active Checkpoint — Registered App Intensive-Use Candidate Tracking & Review (Slice R54-C38A2)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: Delegated Creator Removal & Operator/Moderator Authority (`G15 extension` / `R54-C38A2`)
- Active Slice: `R54-C38A2` (Implement registered application usage intensity tracking and classification candidate flagging in coordinator storage, expose candidate filtering and review endpoints under `/v1/operator/apps` and `/v1/moderator/apps`, and define SDK wire contracts and client methods)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session; preview deployment authority granted for workers when live data testing is required.

## Active Working Theories & Architectural Covenants

1. **Intensive Usage Tracking & Auto-Flagging Invariant (Author Directive R54-C38A1 feedback)**:
   - When registered downstream applications call authenticated `/v1/app/*` endpoints (`/v1/app/report`, `/v1/app/claims/intake`, `/v1/app/index/search`), the coordinator increments `request_count` and updates `last_active_at` on `registered_apps`.
   - When an application's request volume reaches or exceeds the intensive-usage threshold (`INTENSIVE_APP_THRESHOLD = 50`), the coordinator automatically updates `candidate_status` to `'review_pending'` (if previously `'none'`) and appends candidate flags (`"intensive_usage"`, `"high_frequency_api"`).
   - Unregistered or revoked applications cannot generate candidate signals.

2. **Dual Operator and Moderator Review Pathways**:
   - Operators review and manage registered applications via `GET /v1/operator/apps` (filtered by `candidateStatus`) and `POST /v1/operator/apps/:appId/candidate-review`.
   - Age-verified staff moderators review candidates via `GET /v1/moderator/apps` and `POST /v1/moderator/apps/:appId/candidate-review`.
   - Candidate review permits transitions between `'none'`, `'reviewed'`, and `'trusted'`.
   - Setting candidate status to `'trusted'` (or setting `grantDelegation: true`) automatically enables trusted delegation permissions (`claims:delegate`), allowing the application to submit delegated creator ownership claims.

3. **Wire Schemas & SDK Interface**:
   - `CandidateStatusSchema`: `"none" | "review_pending" | "reviewed" | "trusted"`.
   - `OperatorAppRecordSchema`: includes `requestCount`, `lastActiveAt`, `candidateStatus`, `candidateFlags`.
   - `OperatorAppListQuerySchema`: supports optional `candidateStatus` filter.
   - `ReviewAppCandidateRequestSchema` and `ReviewAppCandidateResponseSchema` defined in `src-package/src/protocol/operator.ts` (and mirrored in `moderator.ts`).
   - SDK client methods:
     - `client.operator.apps.list(query)`
     - `client.operator.apps.reviewCandidate(appId, body)`
     - `client.moderator.apps.list(query)`
     - `client.moderator.apps.reviewCandidate(appId, body)`

## Verification Evidence Plan & Results

1. **`src-package`**:
   - Added candidate status schemas (`CandidateStatusSchema`), review request/response schemas (`ReviewAppCandidateRequestSchema`, `ReviewAppCandidateResponseSchema`), and updated `OperatorAppRecordSchema` and `OperatorAppListQuerySchema`.
   - Added SDK methods `client.operator.apps.reviewCandidate`, `client.moderator.apps.list`, `client.moderator.apps.reviewCandidate`.
   - Protocol and client unit tests: 61/61 pass (`bun test`).
   - Package build: `bun run build` completed clean; `dist/` synchronized to `node_modules/vrc-packages-api/dist/`.

2. **`src-worker`**:
   - Added `request_count`, `last_active_at`, `candidate_status`, and `candidate_flags_json` columns and `idx_registered_apps_candidate` index to `registered_apps` in D1 (`utils.ts`) and SQLite (`local_sqlite.ts`).
   - Implemented `recordAppActivity(appId)` in `CoordinatorStorage` and `LocalCoordinatorStore`, automatically called in `handleDownstreamRequest` upon successful app authentication. Automatically transitions status to `'review_pending'` and appends `['intensive_usage', 'high_frequency_api']` when request volume reaches or exceeds 50.
   - Updated `listOperatorAppsPage` to support `candidateStatus` filtering and return candidate metrics.
   - Implemented `reviewAppCandidate` in `CoordinatorStorage` and `LocalCoordinatorStore` for status updates, delegation toggling, and audit tracking.
   - Wired `POST /v1/operator/apps/:appId/candidate-review` in `operator_handler.ts`.
   - Wired `GET /v1/moderator/apps` and `POST /v1/moderator/apps/:appId/candidate-review` in `moderator_handler.ts` gated by verified age and moderator authority.
   - Integration tests in `downstream_client_protocol.test.ts`, `operator_control_api.test.ts`, and `moderator_protocol.test.ts`: 259/259 pass (`bun test`).
   - Typecheck and wrangler types: `bun run check` completed clean with 0 errors.

3. **`src-crawler`**:
   - Crawler domain test suite: 158/158 pass (`bun test`).

## Slice Status

- Status: Verified (Local Commit Pending)
- Next Steps: Commit slice locally as `feat(package,worker): registered app intensive-use candidate tracking and operator-moderator review (R54-C38A2)`.
