# Agent entry point — version-0 pre-production

This is the current entry point for agents working in this repository. `DELEGATES.md` is the operational runbook for downstream developers and node operators.

## Read before changing code

1. Read [`docs/scratch/IMPLEMENTATION_PLAN.md`](docs/scratch/IMPLEMENTATION_PLAN.md) for core architectural covenants, gate orders, delivered baselines, and recovered canonical decisions; read [`LEGAL.md`](LEGAL.md) for legal covenants and platform access boundaries.
2. Read [`docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md`](docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md) for proposed iterations, milestone gates, and accepted owner decisions.
3. Read [`docs/scratch/task_tracker.md`](docs/scratch/task_tracker.md) for the active bounded vertical slice before making edits.
4. Follow `.agents/rules/` (`00` through `04`) for authority, vertical slicing (2–3 files constraint), review discipline, stop integrity, and anti-bloat context preservation.

## Current target and safety boundaries

- **Topology & Communication**: The system operates as a Cloudflare Worker Edge Coordinator (`src-crawler/src/worker/`) backed by Cloudflare D1 storage, communicating over HTTPS with autonomous, containerized Crawler Nodes (`src-crawler/src/node/`) and downstream consumer applications via the typed client SDK (`src-package/`, `vrc-packages-api`).
- **Leased-Only Ingestion**: Crawler nodes fetch strictly under unexpired coordinator leases (`/v1/node/jobs/claim`). Coordinator loss halts all fetching (fails closed).
- **Source Access Profiles & Robots Preflight**: A queued URL does not authorize fetching. Both manual and automatic jobs require an active, scoped source-access profile and RFC 9309 `robots.txt` compliance before claiming a lease.
- **Credential Protection**: Node credentials use capability-encoded tokens (`vrcp_<token><capability>`) stored strictly as SHA-256 hashes. GitHub tokens serve only scoped API requests. Never expose secrets or hardcode tokens into fixtures or logs.
- **Provenance & Zero Binary Downloads**: Third-party directories serve as discovery leads, not authoritative product records. Zero executable or archive binary crawling (`.zip`, `.unitypackage`).

## Delivery discipline

- Pick one capability gate and one bounded vertical slice touching strictly 2–3 files.
- Add failing fixtures, implement minimal changes, run targeted and full test suites, typecheck (`tsc --noEmit`), and verify diffs.
- Keep scratch footprint minimal: maintain strictly 2–3 files in `docs/scratch/` (`IMPLEMENTATION_PLAN.md`, `UNMERGED_IMPLEMENTATION_PLAN.md`, `task_tracker.md`).
- At a pause, record evidence, open risks, and next steps in `docs/scratch/task_tracker.md`.
