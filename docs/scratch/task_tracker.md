# Completed Checkpoint — Content Rating Vocabulary & Downstream Metadata Delivery (Gate G17 / R56-C56B)

## Completed Objective & Bounded Vertical Slices

- Branch: `preview/crawler-network`
- Active Gate: Content Rating Vocabulary & Downstream Metadata Delivery (`G17` / `R56-C56B`)
  - `R56-C56B1`: SDK Taxonomy & Wire Schemas (`src-package`) — Completed & Verified.
  - `R56-C56B2`: Coordinator D1 Storage & Delivery Gating (`src-worker`) — Completed & Verified.
- Owner Instruction (2026-10-08): Never run root level tests (`bun test ./tests`) unless root level tooling (`scripts/`, `tests/`, `package.json`, root configs) is modified. Product-scoped work runs only its own domain test/typecheck suite.
- Session Constraint: Commits remain local for this session (gate push rule disabled).

## Active Working Theories & Architectural Covenants

1. **Classification vs Authorization Separation**:
   - The crawler index is a search engine and library, not an age-gating enforcement point.
   - Content ratings are descriptive metadata attached per API delivery to downstream applications.
   - Downstream applications remain responsible for how they interpret, filter, or present content based on local user settings or laws.
2. **Scaled Rating Taxonomy**:
   - The vocabulary uses six standardized levels:
     - `general`: Safe for all audiences. Default fallback for untagged / legacy items.
     - `mature`: Mild suggestive themes, mild violence, or non-explicit mature assets.
     - `sexual_suggestive`: Pin-ups, cleavage, provocative outfits without exposed genitalia or explicit sexual acts.
     - `adult_restricted`: Explicit 18+ sexual content, nude avatars, or genitalia models.
     - `unknown_restricted`: Disputed, reported, or unverified items held in restricted status pending review.
     - `prohibited`: Illegal, non-consensual, or malicious content barred from public catalog delivery.
3. **Fail-Closed Delivery Boundaries**:
   - Public unauthenticated endpoints (`GET /v1/app/index`, `GET /v1/app/index/delta`) serve strictly `general` rated packages; non-general items are filtered at storage query layer.
   - Prohibited content is barred unconditionally from all downstream endpoints across the entire system.
   - Downstream applications without an age-verified owner receive strictly `general` content via `/v1/app/index/search`; querying rated content returns empty results immediately.
   - Applications owned by age-verified users (`registered_users.age_verified = 1`) may access mature and adult restricted items.
4. **Future User Auth & Verification Architecture (Owner Clarification 2026-10-09)**:
   - Account registration envisions using Firebase Auth for multi-provider linking (GitHub, Gumroad, Ko-fi, Jinxxy).
   - Age verification status will use the unofficial VRChat API (`https://vrchat.community/reference/get-current-user` - `ageVerificationStatus: "18+"`, `ageVerified: boolean`).
   - Stored in SQLite/D1 `registered_users.age_verified` flag, checked on downstream application authentication.

## Verification Evidence & Retained Baselines

- **`src-package` Suite**:
  - `taxonomy.test.ts`: Verified 6 scaled content rating values and rejection of unapproved strings.
  - `protocol.test.ts`: Verified `CatalogPackageSchema` parsing with default `contentRating: "general"` and `CatalogSearchRequestSchema` optional `rating` filter.
  - All 57/57 tests passing. Clean `tsc --noEmit` and clean build in `dist/`.
- **`src-worker` Suite**:
  - `public_catalog_protocol.test.ts`: Verified public `/v1/app/index` and `/v1/app/index/delta` never disclose mature, adult, or prohibited packages.
  - `downstream_client_protocol.test.ts`: Verified `/v1/app/index/search` enforces age rating boundaries based on user age verification status.
  - `d1_coordinator_store.test.ts`: PRAGMA verification of `content_rating` in `canonical_packages` and `age_verified` in `registered_users`.
  - All 251/251 tests passing. Clean `bun run check` (typecheck & wrangler types).
- **`src-crawler` Suite**:
  - All 158/158 tests passing.
- **Cross-Package Synchronization**:
  - `dist` synchronized across subprojects to support local consumption without direct source coupling.
