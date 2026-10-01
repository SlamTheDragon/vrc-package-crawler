# Post-Production Code and Architecture Specifications

This directory holds candidate specifications for the accepted post-production architecture, APIs, and subsystems.

## Specification Candidates

| Subsystem | Scope and Role | Specification Link |
|---|---|---|
| **Crawler Network (Coordinator)** | Cloudflare Worker coordinator, workforce distribution, capability tokens, anti-bot origin pacing, report ingestion, downstream search/sampling, and canonical catalog projection | [`SPECIFICATION_CRAWLER_NETWORK.md`](SPECIFICATION_CRAWLER_NETWORK.md) |
| **Crawler Node & Crawler Client** | Headless VPS/Linux daemon (`vrc-node`), local telemetry (`node.db`), and Windows desktop GUI shell (`src-crawler-client`) bundling Crawler Node | [`SPECIFICATION_CRAWLER_CLIENT.md`](SPECIFICATION_CRAWLER_CLIENT.md) |
| **Web Platform & Operator Panel** | SvelteKit landing page (`src-web`), ToS/Legal, node binary distribution, downstream application registry, DB statistics, and Firebase Auth bridge | [`SPECIFICATION_WEBSITE.md`](SPECIFICATION_WEBSITE.md) |

---

*Note: Pre-production working decisions, gate statuses, and open operator questions stay in [`docs/scratch/`](../scratch/).*
