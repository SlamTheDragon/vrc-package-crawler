# Active Checkpoint — Content Rating Moderator Pathways & Review Endpoints (Slice R56-C56C1)

## Active Objective & Bounded Vertical Slice

- Branch: `preview/crawler-network`
- Active Gate: Content Rating Moderation Pathways & Dispute Review (`G17` / `R56-C56C1`)
- Active Slice: `R56-C56C1` (Implement `/v1/moderator/ratings` endpoints for listing and adjusting canonical package content ratings by age-verified moderator staff, define wire protocols and SDK client methods, and enforce strict boundary against prohibited content)
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session (gate push rule disabled).

## Active Working Theories & Architectural Covenants

1. **Separation of Moderation and Ingestion Infrastructure (Owner Covenant R56-C56C)**:
   - Moderation endpoints live under `/v1/moderator/`, completely distinct from node crawler operator controls under `/v1/operator/`.
   - Age-verified volunteer staff ("second hand operators") review indexed items that were marked restricted or reported for false positives/negatives.
2. **Fail-Closed Moderator Authorization**:
   - `/v1/moderator/*` routes authenticate users via Bearer token (`vrcp_usr_<token>`).
   - Callers must have `age_verified === 1` and `is_moderator === 1`.
   - Callers lacking either condition receive `403 Forbidden` (`Moderator authority with verified age required`).
   - Unauthenticated callers receive `401 Unauthorized`.
3. **Rating Review & Adjustment Lifecycle**:
   - `GET /v1/moderator/ratings`: Lists packages with their current `contentRating`, report count, and metadata, supporting filtering by `rating` and cursor-based pagination.
   - `POST /v1/moderator/ratings/:canonicalId`: Allows moderators to adjust a package's `content_rating` (e.g. general, mature, sexual_suggestive, adult_restricted, prohibited) with mandatory reason.
   - Updates `content_rating` and `updated_at` on `canonical_packages`.
   - Prohibited packages remain strictly excluded from public and delta feeds.
4. **Wire Schemas & SDK Interface**:
   - `ModeratorRatingRecordSchema`, `ModeratorRatingListQuerySchema`, `ModeratorRatingListResponseSchema`, `SetRatingAdjustmentRequestSchema`, `SetRatingAdjustmentResponseSchema` defined in `src-package/src/protocol/moderator.ts`.
   - `client.moderator.ratings.list()` and `client.moderator.ratings.adjust()` in `src-package/src/client.ts`.

## Verification Evidence Plan & Results

1. **`src-package` (Verified)**:
   - Wire protocol schemas, base64url cursor encoding/decoding, and SDK `client.moderator.ratings.list()` / `client.moderator.ratings.adjust()` implemented.
   - 60/60 unit tests passing in `src-package/tests/` (protocol.test.ts, client.test.ts, distribution.test.ts, etc.).
   - Clean compilation via `bun run build` and distribution synchronized across monorepo consumers.

2. **`src-worker` (Verified)**:
   - Implemented `handleModeratorRequest` and `createModeratorHandler` in `src-worker/src/api/moderator_handler.ts`.
   - Wired moderator handler into `worker_entry.ts` request pipeline.
   - Enforced fail-closed authentication (`401 Unauthorized` for missing/invalid bearer token) and authorization (`403 Forbidden` for users lacking `is_moderator === 1` or `age_verified === 1`).
   - Implemented `listModeratorRatingsPage` and `adjustPackageRating` on D1 `Coordinator` and SQLite `LocalCoordinatorStore`.
   - Verified audit logging and database reflection on rating changes; verified zero prohibited package leakage on public catalog endpoints.
   - `src-worker/test/moderator_protocol.test.ts`: 4/4 tests pass.
   - Full domain test suite: 256/256 tests pass across 21 files.
   - Worker typecheck: `bun run check` clean (Cloudflare cf-typegen + tsconfig + test/tsconfig).

3. **`src-crawler` (Verified)**:
   - Full domain test suite passes unaffected: 158/158 tests pass across 24 files.

4. **Next Steps**:
   - Commit slice locally: `feat(package,worker): content rating moderator review and adjustment pathways (R56-C56C1)`.
