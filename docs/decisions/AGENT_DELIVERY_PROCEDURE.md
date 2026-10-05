# Agent delivery procedure

Human steps are in [DELIVERY.md](../source/DELIVERY.md). This file adds only the agent rules.

1. Start every delivery from the root `package.json` scripts. Do not edit `config*.versions.json` by hand.
2. Deliver only products whose behavior changed after a capability gate passes. Do not do ceremonial bumps.
3. Publish producers first: SDK, then network if peer bounds changed, then consumers.
4. Preview: run `delivery:preview <product> --execute` freely for crawler, crawler-client, worker, package and network.
5. Release: run `delivery:release <product> --execute` only for crawler, crawler-client and package. Never approve GitHub environments or npm stages for the owner.
6. Keep failed tags fixed. Use `delivery:retry` or a CI rerun, not a new bump.
7. Record the tag, CI run, `delivery:check` result and open risks in `docs/scratch/task_tracker.md`.
