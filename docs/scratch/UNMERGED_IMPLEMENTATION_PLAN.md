# Unmerged Implementation Plan

### Task Slices

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| pending | G10-S1 | Upstream VPM multi-package repository manifest ingestion & canonical projection in D1 | [`src-crawler/src/worker/storage/d1/coordinator.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/worker/storage/d1/coordinator.ts), [`src-crawler/tests/d1_coordinator_store.test.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/tests/d1_coordinator_store.test.ts) | Upstream community VPM repository indices (`vpm.json` manifests containing multiple packages and version releases) must reliably project all constituent packages into `canonical_packages` with SemVer history while preserving strict typed schema contracts. | Verify and extend D1 coordinator multi-package manifest projection into `canonical_packages` with `vpm_id`, `umbrella: "tools"`, and version links. | |
| pending | G10-S2 | Strongly-typed downstream SDK client delta synchronization without data dumps | [`src-package/src/client.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-package/src/client.ts), [`src-package/tests/client.test.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-package/tests/client.test.ts) | Downstream client applications need continuous typed sync of canonical packages via `/v1/app/index` and `/v1/app/index/delta` using `vrc-packages-api` SDK, enforcing the author mandate of zero public raw data dumps. | Verify and test `VrcPackagesClient` delta paging, cursor continuation, and search against edge worker coordinator schema. | |

---

### Milestone Gates

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G10 | Upstream VPM Community Registry Ingestion | Multi-package VPM manifest parsers implemented; D1 storage and consumer SDK ready for verification. | |
