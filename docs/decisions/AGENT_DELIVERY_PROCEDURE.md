# Agent delivery procedure

Human steps are in [DELIVERY.md](../source/DELIVERY.md). This file adds only the agent rules.

1. Start every delivery from the root `package.json` scripts. Do not edit `config*.versions.json` by hand.
2. Deliver only products whose behavior changed after a capability gate passes. Do not do ceremonial bumps.
3. Publish producers first: SDK, then network if peer bounds changed, then consumers.
4. Preview: use `delivery:preview <product> --execute` for crawler, crawler-client, worker, package and network on a synchronized branch.
   Stop for stale version config or tag history. Do not skip patches or treat a queue entry as checked publication.
   The preview App calls this same executor. Ordinary pushes do not allocate a version.
5. Release: use `delivery:release <product> --execute` only for crawler, crawler-client and package from main after reviewed promotion.
   Do not bypass main protection. The reviewed version-PR and final-tag path remains open.
   Never approve GitHub environments or npm stages for the owner. Keep SDK v0.1.0 held for the full owner API review.
6. Keep failed tags fixed. Use `delivery:retry` or a CI rerun, not a new bump.
   Do not rerun App allocation. Inspect the original tag and recover its delivery instead.
7. Record the tag, CI run, `delivery:check` result and open risks in `docs/scratch/task_tracker.md`.
8. Treat R58 as clarification of R57-C57A/B. Local checks do not prove App setup, live branch delivery or main sign-off.
