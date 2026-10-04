# Agent entry point — version-0 pre-production

This is the current entry point for agents working in this repository. `DELEGATES.md` is the operational runbook for downstream developers and node operators.

## Read before changing code

1. Read [`docs/scratch/IMPLEMENTATION_PLAN.md`](docs/scratch/IMPLEMENTATION_PLAN.md) for core architectural covenants, gate orders, delivered baselines, and recovered canonical decisions; read [`LEGAL.md`](LEGAL.md) for legal covenants and platform access boundaries.
2. Read [`docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md`](docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md) for proposed iterations, milestone gates, and accepted owner decisions.
3. Read [`docs/scratch/task_tracker.md`](docs/scratch/task_tracker.md) for the active bounded vertical slice before making edits.
4. Follow `.agents/rules/` (`00` through `04`) for authority, bounded slices, review discipline, stop integrity, and context preservation. The owner's correction limits the 2–3-file constraint to `docs/scratch`, not source or test edits.

## Current target and safety boundaries

- **Topology & Communication**: The API-only Cloudflare Worker coordinator lives in `src-worker/src/` and uses D1 storage. Its entry is `worker_entry.ts`, and its tests live in `src-worker/test/`. The separate crawler node lives in `src-crawler/src/`, with entry `main.ts` and functional subfolders. Nodes and downstream applications communicate with the coordinator through versioned HTTP payloads. The consumer SDK lives in `src-package/` (`vrc-packages-api`). The separate `src-web/` Astro site and `src-crawler-client/` Tauri/Svelte shell are starter applications, not integrated operator or node clients. Local Worker tests use Wrangler/workerd and isolated D1. There is no coordinator binary.
- **Leased-Only Ingestion**: Crawler nodes fetch strictly under unexpired coordinator leases (`/v1/node/jobs/claim`). Coordinator loss halts all fetching (fails closed).
- **Source Access Profiles & Robots Preflight**: A queued URL does not authorize fetching. Both manual and automatic jobs require an active, scoped source-access profile and RFC 9309 `robots.txt` compliance before claiming a lease.
- **Credential Protection**: Node credentials use capability-encoded tokens (`vrcp_<token><capability>`) stored strictly as SHA-256 hashes. GitHub tokens serve only scoped API requests. Never expose secrets or hardcode tokens into fixtures or logs.
- **Provenance & Zero Binary Downloads**: Third-party directories serve as discovery leads, not authoritative product records. Zero executable or archive binary crawling (`.zip`, `.unitypackage`).

## Delivery discipline

- Treat each `src-*` folder as an independent project. Never import sibling source or tests through relative paths, aliases or symlinks. Consume reused code only as declared, distributed package dependencies. A `file:../src-*` link does not prove that boundary.
- SDK npm publication is conditionally authorized. Do not publish v0.1.0 until thorough package verification and the owner's complete `docs/source/API_ROUTES.md` review pass. Reconcile each route, method, permission and SDK contract with implementation. This owner-review hold overrides the general deferred-review rule.
- Pick one capability gate and one bounded vertical slice. The 2–3-file constraint applies only to `docs/scratch/`.
- Owner correction, 2026-10-04: implement a capability gate or related gate group before test verification and checkpoint write-ups. Slices are not gates. This supersedes per-slice failing-test and full-suite requirements in older skills/rules.
- Keep changes marked unverified until the gate checkpoint passes. At that checkpoint, run the relevant tests, typechecks and runtime/build checks together. Do not invent smaller gates to justify repeated tests. Keep continuation records concise.
- Keep scratch footprint minimal: maintain strictly 2–3 files in `docs/scratch/` (`IMPLEMENTATION_PLAN.md`, `UNMERGED_IMPLEMENTATION_PLAN.md`, `task_tracker.md`).
- At a pause, record evidence, open risks, and next steps in `docs/scratch/task_tracker.md`.
