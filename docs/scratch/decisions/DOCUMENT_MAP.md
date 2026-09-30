# Documentation map

The owner requires exactly four top-level documentation categories. No prose document lives directly in `docs/`. This map is a navigation aid, not evidence that a projected capability runs.

| Location | Role | Current entry points |
| --- | --- | --- |
| `docs/scratch/decisions/` | Owner decisions, active implementation work, measured conformance, current contracts and audits | [Direction](DIRECTION.md), [plan](plans/IMPLEMENTATION_PLAN.md), [question queue](DEFERRED_OWNER_DECISIONS.md), [current code-path map](current/CODE_PATH_INVENTORY.md), [pipeline map](current/PIPELINE_RESPONSIBILITY_MAP.md), [conformance](current/status/CONFORMANCE.md), [discrepancies](current/audits/DISAGREEMENTS.md) |
| `docs/research/` | Primary-source and technical research that informs, but does not itself approve, implementation or live source access | [Market-source research](../../research/markets/ADDITIONAL_MARKET_SOURCE_RESEARCH.md), [dependency research](../../research/dependencies/CRAWLER_DEPENDENCY_RESEARCH.md), [spikes](../../research/spikes/ROBOTS_PACKAGE_SPIKE.md) |
| `docs/scratch/` | Historical drafts and proposals retained for traceability; not current instructions or final architecture | [Archived Phase-4 agent contract](../history/AGENT_PHASE4.md) |
| `docs/source/` | Reserved for **final accepted post-production architecture and code references**. Current work and decisions do not belong here | [Candidate specifications](../../source/README.md) ([crawler-network](../../source/crawler-network/SPECIFICATION.md), [crawler-client](../../source/crawler-client/SPECIFICATION.md), [website](../../source/website/SPECIFICATION.md)) |

The root retains the goal-specified `AGENTS.md`, `DELEGATES.md`, `TODO.md`, and `LEGAL.md`, plus the conventional repository `README.md` and `LICENSE.md`. `AGENTS.md` points to the active decision and conformance records. The runnable package is presently under `src-crawler/`; separate `worker/`, `node/`, and `src-web/` delivery boundaries remain part of the owner-required destination structure, not a claim that the migration is complete.

Before calling a gate complete, compare the decision, executable path, tests, compiled process smoke, and [conformance ledger](current/status/CONFORMANCE.md). The root `TODO.md` contains historical phase claims and is not runtime proof. A linked research or scratch file does not promote its assumptions into accepted policy.
