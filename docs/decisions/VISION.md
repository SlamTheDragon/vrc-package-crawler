# VRCP vision and terminology (owner, 2026-10-06)

This file holds the owner's target. Current behavior is in `docs/source/`. When they differ, the gap is work, not a contradiction.
This is version 0. Nothing is "legacy". Purge superseded code instead of wrapping it. Rename anything whose name does not match its function.

## Terms

| Term | Source | Meaning |
| --- | --- | --- |
| **Crawler Node** | `src-crawler/` | Compiled headless binary for a VPS (for example Linux). Configured with a coordinator-issued node ID and token. |
| **Crawler Client** | `src-crawler-client/` | Windows GUI shell. Installs and runs a Crawler Node runtime, and exposes more actions that `vrc-packages-api` provides. |
| **Coordinator** | `src-worker/` | Cloudflare Worker + D1. Directs the network and serves the APIs. |
| **SDK** | `src-package/` (`vrc-packages-api`) | Strongly typed client for `/v1/operator/`, `/v1/app/` and `/v1/user/`. |
| **Web** | `src-web/` | Operator panel, landing page and registry dashboard. Uses Firebase Auth with Cloudflare. |

## Responsibilities

**Crawler Node**
1. Poll the coordinator for job leases.
2. Accept the jobs it is given.
3. Crawl only those jobs.
4. Report each result as success, rate-limited or failure.
5. Never shut down by itself. Survive data loss, interruption and coordinator unavailability (durable outbox, restart recovery). Fetching still stops when there is no valid lease.
6. Log every activity and every crawled URL.

**Coordinator**
1. Node registration and workforce distribution. Decide which capabilities a registrant gets, so that every area has coverage and the areas that need the freshest data get it first. The token encodes the node's accepted website capabilities (`vrcp_<token><capability>`).
2. Job balancing and rate-limit management. No botnet-like behavior.
3. Report ingestion, report management and seeding.
4. Final verdict on canonical identities that are served to downstream clients.
5. Search, configurable content and random-entry selection for registered downstream clients.
6. A reduced search service for unauthenticated clients.

**Crawler Client:** GUI install and supervision of the node runtime, plus additional SDK actions.

**Web:** ToS and legal pages, node binary distribution and registry, downstream application registry, database statistics. It uses the system's API endpoints.

## Target layout

```
.agents/
AGENTS.md  DELEGATES.md  LEGAL.md
docs/      scratch/ (proposals)  research/  source/ (current capabilities)  decisions/
src-package/
src-web/            scratch/
src-crawler-client/
src-crawler/        src/  tests/  scratch/  Dockerfile
src-worker/
```

There must be no build or test artifacts in the repository root.

## Current focus

`src-crawler` and `src-worker`, ready for Cloudflare staging.
Pre-production exit: real data ingestion through the full local system (node → coordinator → D1-compatible store) before online staging.
Owner directions: remove local loopback test scaffolding before staging, and remove import/export layers that only re-export.
