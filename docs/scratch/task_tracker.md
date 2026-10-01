# Task Tracker: Active Slice Tracking

## Active Slice: G8 Complete — Storefront Profiles, Default Seeds, and Retention/Auto-Delisting Reconciliation

- **Slice IDs Completed**:
  - `G8-S1`: Storefront Legal Research Documentation & Default Source Access Profiles / Robots Snapshots
  - `G8-S2`: Scoped Storefront Seed Jobs & Multi-Platform Adapter Extraction Verification
  - `G8-S3`: Internal Data Retention vs Downstream Trimmed Description & Auto-Delisting Enforcement
- **Touched Files**:
  1. [`docs/research/markets/PLATFORM-MATRIX.md`](file:///f:/.repo/.main/vrc-package-crawler/docs/research/markets/PLATFORM-MATRIX.md)
  2. [`src-crawler/src/worker/storage/default_seeds.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/worker/storage/default_seeds.ts)
  3. [`src-crawler/tests/node_observation_adapter.test.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/tests/node_observation_adapter.test.ts)
  4. [`src-crawler/src/worker/storage/d1/coordinator.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/worker/storage/d1/coordinator.ts)
  5. [`src-crawler/src/worker/storage/local_sqlite.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/worker/storage/local_sqlite.ts)
  6. [`src-crawler/tests/d1_coordinator_store.test.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/tests/d1_coordinator_store.test.ts)
- **Status**: **Completed & Verified** (327 pass / 0 fail)

---

## Working Theories & Verification Results
1. **Legal & Terms Evaluation (Payhip & Sellfy)**:
   - Researched and documented in `PLATFORM-MATRIX.md` with fair use and discoverability boundaries.
   - Configured `sellfy` and `custom_domain` (Payhip) source access profiles in `default_seeds.ts`.
2. **Preflight Robots Snapshots & Polite Seed Jobs**:
   - RFC 9309 snapshots added for `booth.pm`, `gumroad.com`, `jinxxy.com`, `sellfy.com`, and `payhip.com`.
   - Seed jobs configured for BOOTH, Gumroad, Jinxxy, Sellfy, and Payhip with polite pacing (1.5s–3.0s).
   - End-to-end extraction verified across all storefronts in `node_observation_adapter.test.ts` (24 pass).
3. **Internal Rich Retention & Downstream Trimming with Auto-Delist**:
   - Coordinator data lake retains full observation payloads in `source_versions` indefinitely until missing.
   - Downstream clients receive `CatalogPackage` with canonical metadata and links without raw copyright-infringing text dumps.
   - When a source item returns `gone`, `source_items.gone_at` is set, `package_fronts.availability` transitions to `'delisted'`, and canonical packages with all fronts delisted transition to `lifecycle = 'delisted'` (verified in `d1_coordinator_store.test.ts`).

---

## Verification Evidence
- [x] Update `docs/research/markets/PLATFORM-MATRIX.md` with Payhip & Sellfy legal posture and operational safeguards.
- [x] Add `payhip` and `sellfy` source access profiles to `DEFAULT_SOURCE_ACCESS_PROFILES` in `default_seeds.ts`.
- [x] Add default robots snapshots for `booth.pm`, `gumroad.com`, `jinxxy.com`, `sellfy.com`, and `payhip.com` to `DEFAULT_ROBOTS_SNAPSHOTS` in `default_seeds.ts`.
- [x] Add polite default seed jobs for BOOTH, Gumroad, Jinxxy, Sellfy, and Payhip to `DEFAULT_SEED_JOBS` in `default_seeds.ts`.
- [x] Verify Payhip metadata extraction in `node_observation_adapter.test.ts`.
- [x] Implement cascading auto-delist in `d1/coordinator.ts` and `local_sqlite.ts` on `outcome.kind === "gone"`.
- [x] Verify auto-delist cascading in `d1_coordinator_store.test.ts`.
- [x] Run full test suites (`bun test` in `src-crawler` [294 pass] and `src-package` [33 pass] = 327 pass).
- [x] Clean TypeScript check (`tsc --noEmit` across both packages).
