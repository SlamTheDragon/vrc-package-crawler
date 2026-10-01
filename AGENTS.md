# Agent entry point — version-0 pre-production

This is the current entry point for agents working in this repository. [`docs/scratch/history/AGENT_PHASE4.md`](docs/scratch/history/AGENT_PHASE4.md) is the archived Phase-4 contract with known stale binary, database and test-count claims; consult it for history, not as a current conformance assertion. `DELEGATES.md` is the operational handoff/runbook. Do not copy stale claims forward.

## Read before changing code

1. Read `docs/scratch/decisions/DIRECTION.md` for owner intent and accepted decisions, especially §1.4–1.5; read `docs/scratch/decisions/IMPLEMENTATION_PLAN.md` for gate order, `TODO.md` for historical and remaining work, and `LEGAL.md` for target covenants. None alone proves runtime behavior.
2. Read `docs/scratch/decisions/current/CONFORMANCE.md` and `docs/scratch/decisions/current/PIPELINE_RESPONSIBILITY_MAP.md` for the current evidence-backed boundary map. Verify claims against the live code path and tests. Record unresolved owner choices in `docs/scratch/decisions/DEFERRED_OWNER_DECISIONS.md` rather than deciding for the owner.
3. Use `.agents/rules/` and the relevant `.agents/skills/` for orientation, incremental delivery, checkpointing and reliability review. A stop hook, summary or green test suite is not permission to declare the owner's goal complete.

## Current target and safety boundaries

- The pre-production target is two separate binaries, configs and local databases: coordinator and crawler node communicate through validated versioned API payloads over localhost while ingesting only reviewed real sources. Cloudflare account setup is not required. The worker/coordinator and node come before `src-web/`.
- The owner requires `.agents/`, `scratch/`, `src-web/`, `src-crawler/`, `worker/`, `node/`, and organized `docs/` as the destination layout. Preserve runnable entry points while moving one tested code path at a time. Do not create a monorepo or duplicate dependency trees merely to satisfy the directory diagram.
- A queued URL, selected driver capability, auto-queue rule or robots allowance does not authorize a live content fetch. Both manual and automatic jobs need a separate, active, scoped source-access profile before robots preflight and a lease. Nodes fetch only coordinator-leased jobs; coordinator loss stops new fetches. Preserve origin-wide pacing and the exact access checks at claim, heartbeat and submission.
- Never expose or copy credentials from `bin/`, logs, databases or environment files into output or test fixtures. The existing GitHub token may only serve its intended scoped GitHub use; it is not a coordinator registration key or Cloudflare credential. Unknown nodes do not self-register until the trust model is decided.
- Treat third-party directories as discovery leads, not authoritative product records. Preserve source provenance and ambiguous identities. Do not promote creator prose or media to public output merely because a fetch was permitted.

## Delivery discipline

- Pick one capability gate and one bounded vertical slice. Map every touched code path and preservation invariant, add a failing fixture, implement the smallest change, then run targeted tests, full tests, typecheck, applicable builds and process smoke. Report what those checks do *not* prove.
- Before a codebase-wide move or new package, check existing libraries, measured need, Worker portability, license, security and maintenance impact. Document a rejected dependency as well as an adopted one when the decision is material.
- Keep tests isolated from `bin/crawler_state.db` and any live user database. Real-source smokes are opt-in, source-reviewed, bounded and visibly separate from offline tests.
- At a pause, stop hook or context reset, record changed files, observed evidence, open risks, unanswered owner choices and the next smallest safe slice. Never convert a confident continuation summary into a completion claim.
