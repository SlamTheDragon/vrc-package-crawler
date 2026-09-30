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
| **G1** | `src-crawler/src/utils/sanitizer.ts:2`, `iana.ts:2` | ✅ **Resolved** | Investigated and confirmed active core utilities; audit markers cleared. Prototype `image_proxy.ts` and `sharp_worker.ts` permanently retired per CR-19/CR-21. |

## Active In-Tree FIXMEs (8 Audited Items across 5 Files)

| Subsystem | Location | Verbatim Marker | Mapped Architecture Item / Intent | Target Milestone |
| --- | --- | --- | --- | --- |
| **Configuration** | [`src/config.ts:5`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/config.ts#L5) | `* FIXME: fuse and migrate` | Tracked in **CFG-01**. Legacy prototype constants file retained only for `CrawlerDB` Gate 1 regression tests. Fuse into `runtime_config.ts`. | Pre-v1.0 cleanup |
| **Database** | [`src/db/db.ts:10`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/db/db.ts#L10) | `* FIXME: fuse code into appropriate folders or files` | Legacy prototype `CrawlerDB` code consolidation; active pre-prod runtime uses `LocalCoordinatorStore` (`coordinator.db`) and `LocalNodeStore` (`node.db`). | Post-Gate-1 retirement |
| **Coordinator Client** | [`src/node/coordinator_client.ts:16`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/node/coordinator_client.ts#L16) | `// FIXME: ORIENT CODEBASE AS IF IT'S WORKING WITH THE TRUE CLOUDFLARE INSTANCE` | Tracked in **CF-01**. Orient coordinator client connection logic for seamless dual-mode: local loopback simulation vs remote production Cloudflare Worker over HTTPS. | G5/G6 Cloudflare transition |
| **Node Identity** | [`src/node/main.ts:19`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/node/main.ts#L19) | `// FIXME: WARNING: Certain hardcoded node identity elements cannot pass pre-production process` | Hardcoded defaults (`node-1`, `http://127.0.0.1:8787`) in CLI fallback should be cleanly driven by `node.config.json` and operator registration. | Pre-v1.0 hardening |
| **Node Architecture** | [`src/node/main.ts:20`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/node/main.ts#L20) | `// FIXME: CODEBASE NOT OOP-ORIENTED` | Architectural critique regarding class encapsulation of the node execution loop (`NodeDaemon` / `CrawlerNode` service object). | Refactoring pass |
| **Node Setup UX** | [`src/node/main.ts:21`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/node/main.ts#L21) | `// FIXME: might be better if there's a walk-through or a simple GUI panel for node setup...` | Tracked in **NODE-01**. Interactive node setup walkthrough or lightweight operator GUI panel for decentralized node operators. | Decentralized release |
| **Logger** | [`src/utils/logger.ts:41`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/utils/logger.ts#L41) | `// FIXME: combine into one latest.log file` | Tracked in **LOG-01**. Maintain a unified, continuous `latest.log` pointer in `logs/` alongside session-partitioned files. | Operational logging polish |
| **Logger** | [`src/utils/logger.ts:85`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/utils/logger.ts#L85) | `// FIXME: rotation should put the log path in a logs/archive` | Tracked in **LOG-01**. On daily rotation, move compressed `.gz` log files into a dedicated `logs/archive/` subfolder. | Operational logging polish |

