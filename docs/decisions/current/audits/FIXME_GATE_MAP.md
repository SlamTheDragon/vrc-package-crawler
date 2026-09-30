# Source FIXME map (Audited 2026-09-30)

This is an audited routing inventory of code-level FIXMEs. Following the comprehensive retirement of obsolete Phase 1–4 prototype files, coupled legacy drivers, and heuristic filter engines, all 28 historical FIXMEs have been addressed.

## Historical FIXME Resolution Status

| Gate | Historical Location | Status | Resolution Summary |
| --- | --- | --- | --- |
| **G0/G5** | `src-crawler/src/crawler/steering.ts:36,55` | ✅ **Retired** | R2 report downloader permanently deleted; report validation and coordinator submission contracts unified in `src/shared/operator_protocol.ts`. |
| **G1/G2** | `src-crawler/src/crawler/projection.ts:146,182` | ✅ **Retired** | Monolithic projection script permanently deleted; canonical projection and identity linking unified in `LocalCoordinatorStore` (`src/worker/local_sqlite.ts`) under G2/G3 and verified in `tests/catalog_projection.test.ts`. |
| **G0/G6** | `src-crawler/src/config.ts:38` | ✅ **Resolved** | Obsolete `targetSaturationScore` removed; pre-production dual-binary configs managed via `src/node/runtime_config.ts` and `src/worker/runtime_config.ts`. |
| **G3** | `src-crawler/src/crawler/index.ts:693,735`; `src/drivers/*` | ✅ **Retired** | Monolithic crawler loop and all 20 coupled driver files permanently deleted; node execution runs 100% on decoupled pure adapters in `src/node/observation_adapter.ts`. |
| **G2/G4** | `src-crawler/src/filter.ts:46,80,148,210,232,282,314,347,369,381,451,488` | ✅ **Retired** | Hardcoded whitelists and keyword filters permanently deleted; taxonomy and evidence classes unified under `docs/decisions/DIRECTION.md` and `src/shared/evidence_class.ts`. |
| **G1** | `src-crawler/src/db/db.ts:692` | ✅ **Resolved** | Deprecated `drainDeadLetterQueue` removed; active callers invoke `drainExpiredRetryQueue`. |
| **G1** | `src-crawler/src/utils/sanitizer.ts:2`, `iana.ts:2`, `image_proxy.ts:7` | ✅ **Resolved** | Investigated and confirmed active core utilities; audit markers cleared. |

## Active In-Tree FIXMEs (2 Remaining)

| Subsystem | Location | Description | Target Milestone |
| --- | --- | --- | --- |
| **Logger** | `src-crawler/src/utils/logger.ts:41` | `// FIXME: combine into one latest.log file` | Pre-v1.0 logging polish |
| **Logger** | `src-crawler/src/utils/logger.ts:85` | `// FIXME: rotation should put the log path in a logs/archive` | Pre-v1.0 logging polish |
