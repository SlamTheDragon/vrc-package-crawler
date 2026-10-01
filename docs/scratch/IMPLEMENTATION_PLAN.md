# Canonical Implementation Plan Ledger

> **System Core Covenants & Architecture (Version 0)**:
> 1. **Dual System Topology**: Cloudflare Worker Edge Coordinator (`src-crawler/src/worker/`) deployed to Cloudflare staging with D1 storage, and standalone autonomous Crawler Node (`src-crawler/src/node/`) communicating over HTTPS with online domain. Local coordinator binary is retired.
> 2. **Leased-Only Ingestion**: Nodes fetch strictly under unexpired coordinator leases (`/v1/node/jobs/claim`); coordinator loss halts all node fetching (fails closed).
> 3. **Capability-Encoded Security**: Node tokens (`vrcp_<64-hex><4-hex>`) encode permitted platforms; all tokens are persisted strictly as SHA-256 hashes.
> 4. **Universal Package Model**: All catalog items project into three umbrellas: **Tools**, **Assets**, and **Avatars**, preserving source provenance.
> 5. **Execution & Anti-Bloat Guardrails**: Slices must touch strictly 2–3 files at a time. The `docs/scratch/` directory is strictly maintained at 2–3 files (`UNMERGED_IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PLAN.md`, `task_tracker.md`).
> 6. **Current Audited Baseline**: **327 pass / 0 fail** (294 in `src-crawler`, 33 in `src-package`).
> 7. **Delivered & Accepted Milestones**: G0 (Taxonomy baseline), G1 (Safety & Hermetic baseline), G2 (Versioned evidence & SQLite links), G3 (Pure adapter & leads), G4 (Desktop tools & Avatar taxonomy), G5 (Local coordinator & public catalog API), PKG-01 (Consumer client SDK `src-package`), Scratch Compaction, G6 (Cloudflare Worker Coordinator & D1 Edge Staging - deferred for skeptical review), G7 (Online Domain, Remote Node HTTPS Transport, Docker & Watchtower Auto-Update, Lease Boundaries), G8 (Storefront source access profiles, preflight robots snapshots, default seed jobs, and auto-delist cascading).

---

## Active Implementation Plan Ledger

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| deferred | G9 | Web Operator Panel & self-service landing portal | `src-web/` | Deferred by author decision to focus on coordinator staging and node crawler network. | Keep deferred until coordinator staging and live crawling are fully operational. | |
| pending | G10 | Upstream VPM community registry ingestion via `/v1/app/index` projection | [`src-crawler/src/worker/storage/`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/worker/storage/) | Author directive: no public dumps/exports. Ingestion of upstream community VPM repository indices (e.g. vpm.json manifests) serves strongly-typed `/v1/app/index` and `/v1/app/index/delta` for authorized apps. | Implement background ingestion worker for approved community VPM repos projecting into canonical packages served via typed `/v1/app/index`. | no exports dumps; strictly typed /v1/app/index |

---

## Milestone Gates

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G6 | Cloudflare Worker Coordinator & D1 Edge Staging | Completed: D1 coordinator implemented, standalone coordinator binary retired, wrangler.toml staging configured, dynamic edge D1 init verified, edge bundle 1.54 MB, 320 tests pass. | defer for skeptical review |
| G7 | Online Domain & Remote Crawler Node HTTPS Transport | Completed: HTTPS transport resilience verified, Docker packaging & Watchtower auto-updater configured, GitHub Actions GHCR publish workflow added, fail-closed expired lease guards verified, 326 tests pass. | approved |
| G8 | Live Platform Access Profiles & Storefront Default Seeds | Completed: Storefront profiles (BOOTH, Gumroad, Jinxxy, Sellfy, Payhip), RFC 9309 snapshots, polite seed jobs, Payhip metadata extraction, and automatic delisting cascading on missing source verified, 327 tests pass. | approved |
| G9 | Web Operator Panel (`src-web/`) | Deferred by author decision. | |
| G10 | Upstream VPM Community Registry Ingestion | Manifest schemas and SemVer parsing verified; strictly typed `/v1/app/index` without public dumps. | |
