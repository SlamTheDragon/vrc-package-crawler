# Unmerged Implementation Plan

### Task Slices

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| pending | FLEET-S1 | Wrangler Staging Simulation & Automated D1 Verification Harness | [`src-crawler/package.json`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/package.json), [`src-crawler/tests/worker_staging.test.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/tests/worker_staging.test.ts) | Staging deployment currently lacks an automated verification harness validating the Worker coordinator against local D1 simulation bindings without requiring remote Cloudflare credentials. | Implement automated staging verification test harness validating Worker bundle endpoints, D1 table initialization, and lease flow under simulated staging environment. | |
| pending | FLEET-S2 | Multi-Platform Default Seeds & Initial Fleet Seeding | [`src-crawler/src/worker/seeds.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/worker/seeds.ts), [`src-crawler/src/worker/storage/d1/coordinator.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/worker/storage/d1/coordinator.ts) | Coordinator needs multi-platform initial seeds covering VPM community repositories, approved GitHub repository releases (`vrc-get`), and verified storefront listings per user direction. | Implement default multi-platform seed definitions and coordinator initialization helper ensuring polite robots preflight and profile attachment for VPM, GitHub, and storefront targets. | |
| pending | FLEET-S3 | Docker Fleet Compose Configuration & Node Clustering | [`docker-compose.yml`](file:///f:/.repo/.main/vrc-package-crawler/docker-compose.yml), [`DELEGATES.md`](file:///f:/.repo/.main/vrc-package-crawler/DELEGATES.md) | Docker deployment for crawler nodes lacks a root `docker-compose.yml` configured for multi-node clustering, Watchtower auto-updating, and container environment linking. | Create canonical `docker-compose.yml` supporting containerized crawler nodes, volume persistence (`/app/data`), Watchtower auto-updates, and environment variable configuration. | |
| pending | FLEET-S4 | End-to-End Fleet Multi-Platform Crawl Simulation | [`src-crawler/tests/fleet_crawl_simulation.test.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/tests/fleet_crawl_simulation.test.ts), [`src-crawler/src/node/runner.ts`](file:///f:/.repo/.main/vrc-package-crawler/src-crawler/src/node/runner.ts) | Need an end-to-end integration test verifying that autonomous nodes claim leases from the coordinator, fetch multi-platform seeds (VPM, GitHub, storefront), and submit valid observation receipts. | Create comprehensive fleet crawl integration test asserting multi-node concurrent leasing, multi-platform job execution, receipt submission, and canonical catalog search projection. | |

---

### Milestone Gates

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G12 | Wrangler Staging Simulation, Docker Crawler Fleet Provisioning & Multi-Platform Ingestion | Planned: Slices FLEET-S1 through FLEET-S4 covering Wrangler staging test harness, multi-platform seeds (VPM/GitHub/storefronts), docker-compose cluster configuration, and end-to-end fleet crawl simulation. | |
