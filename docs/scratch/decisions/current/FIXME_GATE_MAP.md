# Source FIXME Map (Audited 2026-10-01, Fully Resolved)

This is an audited routing inventory of code-level FIXMEs. Obsolete Phase 1–4 prototype files, coupled legacy drivers, heuristic filter engines, and legacy crawler files (`src/config.ts`, `src/db/`, `poisson_scheduler.ts`) were permanently retired. Following the OOP daemon refactor and owner purge directive, all historical and active in-tree FIXMEs are resolved.

**Active In-Tree FIXMEs: 0 remaining (100% resolved across tree)**

---

## Resolved In-Tree FIXMEs (All Items Cleared)

| Subsystem | Location | Former Marker | Resolution Summary |
| --- | --- | --- | --- |
| **Node Architecture** | [`src/node/main.ts:20`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/node/daemon.ts) | `// FIXME: CODEBASE NOT OOP-ORIENTED` | ✅ **Resolved**: Encapsulated node execution loop, heartbeat management, task logging, and graceful shutdown inside `CrawlerNodeDaemon` in `src/node/daemon.ts`. `main.ts` drives the daemon cleanly. |
| **Node Identity** | [`src/node/main.ts:19`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/node/main.ts) | `// FIXME: WARNING: Certain hardcoded node identity elements cannot pass pre-production process` | ✅ **Resolved**: Removed silent fallback defaults (`node-1`, `http://127.0.0.1:8787`). `vrc-node init` now requires an explicit `<node-id>` and validates against `NodeIdSchema`. |
| **Node Setup UX** | [`src/node/main.ts:21`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/node/main.ts) | `// FIXME: might be better if there's a walk-through or a simple GUI panel for node setup...` | ✅ **Resolved**: Implemented guided setup walkthrough (`printSetupGuide()`) in `main.ts` invoked when `vrc-node init` or `vrc-node help` runs without arguments, detailing configuration parameters and token registration instructions. |
| **Coordinator Client** | [`src/node/coordinator_client.ts:16`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/node/coordinator_client.ts#L16) | `// FIXME: ORIENT CODEBASE AS IF IT'S WORKING WITH THE TRUE CLOUDFLARE INSTANCE` | ✅ **Resolved**: Formally documented dual-mode endpoint security: production Cloudflare Worker over HTTPS (`https://*`) vs local simulator strictly over loopback HTTP (`http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*`), explicitly blocking non-loopback HTTP to prevent bearer token leakage. Validated with test coverage. |
| **Configuration** | Former `src/config.ts` | `* FIXME: fuse and migrate` | ✅ **Permanently Purged**: `src/config.ts` permanently purged per owner directive. Configuration is 100% migrated to Node runtime config (`src/node/runtime_config.ts`) and Cloudflare Worker runtime config (`src/worker/runtime_config.ts`). |
| **Database** | Former `src/db/db.ts` & `src/db/definitions.ts` | `* FIXME: fuse code into appropriate folders or files` | ✅ **Permanently Purged**: Legacy SQLite `CrawlerDB` (`src/db/db.ts`) and schema definitions (`src/db/definitions.ts`) permanently purged per owner directive. Active system runs on `LocalCoordinatorStore` (`coordinator.db`), `LocalNodeStore` (`node.db`), and Cloudflare D1. |
| **Logger** | [`src/utils/logger.ts:41`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/utils/logger.ts#L40) | `// FIXME: combine into one latest.log file` | ✅ **Resolved**: Unified `latest.log` append stream active and verified in `src/utils/logger.ts`. |
| **Logger** | [`src/utils/logger.ts:85`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/utils/logger.ts#L87) | `// FIXME: rotation should put the log path in a logs/archive` | ✅ **Resolved**: Archive rotation into `logs/archive/` active and verified via `compressLogFile()`. |

---

## Historical Prototype FIXME Resolution Status (All Historical Items Cleared)

| Gate | Historical Location | Status | Resolution Summary |
| --- | --- | --- | --- |
| **G0/G5** | `src-crawler/src/crawler/steering.ts:36,55` | ✅ **Retired** | R2 report downloader permanently deleted. Report validation and coordinator submission contracts unified in `src/shared/operator_protocol.ts`. |
| **G1/G2** | `src-crawler/src/crawler/projection.ts:146,182` | ✅ **Retired** | Monolithic projection script permanently deleted. Canonical projection and identity linking unified in `LocalCoordinatorStore` (`src/worker/local_sqlite.ts`) under G2/G3 and verified in `tests/catalog_projection.test.ts`. |
| **G0/G6** | `src-crawler/src/config.ts:38` | ✅ **Permanently Purged** | Legacy `src/config.ts` deleted. Pre-production dual-binary configs managed via `src/node/runtime_config.ts` and `src/worker/runtime_config.ts`. |
| **G3** | `src-crawler/src/crawler/index.ts:693,735`; `src/drivers/*` (including `drivers/vpm_index/discovery.ts` commented block) | ✅ **Retired** | Monolithic crawler loop and all 20 coupled driver files permanently deleted. Node execution runs 100% on decoupled pure adapters in `src/node/observation_adapter.ts`. |
| **G2/G4** | `src-crawler/src/filter.ts:46,80,148,210,232,282,314,347,369,381,451,488` | ✅ **Retired** | Hardcoded whitelists and keyword filters permanently deleted. Taxonomy and evidence classes unified under `DIRECTION.md` and `src/shared/evidence_class.ts`. |
| **G1** | `src-crawler/src/db/db.ts:692` | ✅ **Permanently Purged** | Legacy `src/db/db.ts` permanently deleted per owner directive. Active callers invoke coordinator and node stores. |
| **G1** | `src-crawler/src/utils/poisson_scheduler.ts` & `tests/poisson_scheduler.test.ts` | ✅ **Permanently Purged** | Legacy Poisson scheduler permanently purged per owner directive. Scheduling, pacing, and backoffs are governed by coordinator leases and DomainCircuitBreaker. |
| **G1** | `src-crawler/src/utils/sanitizer.ts:2`, `iana.ts:2` | ✅ **Resolved** | Investigated and confirmed active core utilities; audit markers cleared. Prototype `image_proxy.ts` and `sharp_worker.ts` permanently retired per CR-19/CR-21. |
