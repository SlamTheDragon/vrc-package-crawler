# Task Tracker: Active Slice Tracking

## Active Milestone: Gate G11 — Root Documentation Cleanup, Context Migration & Downstream Delegate Enablement

### Completed Slices in Gate G11
1. **`DOC-S1` (Completed)**:
   - Recovered canonical foundation covenants (CANON-1..6, media proxy policy, bio-token delist, RFC 6648 header standard) into `docs/scratch/IMPLEMENTATION_PLAN.md`.
   - Purged stale 121 KB `TODO.md` from repository root via `git rm`.
2. **`DOC-S2` (Completed)**:
   - Re-anchored `AGENTS.md` to reference live authoritative files and current network topology (Cloudflare D1 coordinator + Dockerized node + `src-package` SDK).
   - Aligned `tests/preprod_layout.test.ts` to assert the clean root set and minimal scratch footprint. Passes 4/4 tests.
3. **`DOC-S3` (Completed)**:
   - Overhauled `DELEGATES.md` with comprehensive downstream developer integration runbook for `vrc-packages-api` (`src-package`), Docker fleet operations, and wire API reference.
4. **`DOC-S4` (Completed)**:
   - Overhauled root `README.md` reflecting true repository layout, Docker/Worker architecture, and 333-test baseline.
   - Patched `LEGAL.md` line references to point to `docs/scratch/IMPLEMENTATION_PLAN.md` and `docs/source/DATABASE_SCHEMAS.md`.

### Verification Status
- Root layout tests: 4/4 pass (`bun test tests/preprod_layout.test.ts`).
- Full test baseline: 333/333 pass across 37 test files.
- TypeScript check: 0 errors across `src-crawler` and `src-package`.
