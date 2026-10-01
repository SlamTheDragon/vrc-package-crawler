# Post-Production Code and Architecture Specifications

This directory holds candidate specifications for the accepted post-production architecture, APIs, and subsystems.

## Specification Candidates

| Subsystem | Scope and Role | Specification Link |
|---|---|---|
| **Crawler Network** | Cloudflare Worker coordinator, operator control plane (`/v1/operator/*`), lease arbitration, and catalog projection | [`SPECIFICATION_CRAWLER_NETWORK.md`](SPECIFICATION_CRAWLER_NETWORK.md) |
| **Crawler Client** | Standalone decentralized crawler node (`vrc-node`), local telemetry (`node.db`), egress safety, and observation adapters | [`SPECIFICATION_CRAWLER_CLIENT.md`](SPECIFICATION_CRAWLER_CLIENT.md) |
| **Website and Control Plane** | SvelteKit operator dashboard (`src-web`), public informational portal, creator opt-out tracker, and auth bridge | [`SPECIFICATION_WEBSITE.md`](SPECIFICATION_WEBSITE.md) |

---

*Note: Pre-production working decisions, gate statuses, and open operator questions stay in [`docs/scratch/`](../scratch/).*
