# Post-Production Code & Architecture Specifications

This directory contains candidate specifications for the accepted post-production architecture, APIs, and subsystems.

## Specification Candidates

| Subsystem | Scope & Role | Specification Link |
|---|---|---|
| **Crawler Network** | Cloudflare Worker coordinator, operator control plane (`/v1/operator/*`), lease arbitration, and catalog projection | [`crawler-network/SPECIFICATION.md`](crawler-network/SPECIFICATION.md) |
| **Crawler Client** | Standalone decentralized crawler node (`vrc-node`), local telemetry (`node.db`), egress safety, and observation adapters | [`crawler-client/SPECIFICATION.md`](crawler-client/SPECIFICATION.md) |
| **Website & Control Plane** | SvelteKit operator dashboard (`src-web`), public informational portal, creator opt-out tracker, and auth bridge | [`website/SPECIFICATION.md`](website/SPECIFICATION.md) |

---

*Note: Pre-production working decisions, gate statuses, and open operator questions continue to reside in [`docs/scratch/decisions/`](../scratch/decisions/).*