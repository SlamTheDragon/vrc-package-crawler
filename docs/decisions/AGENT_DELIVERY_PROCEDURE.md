# Agent delivery procedure

Human steps are in [DELIVERY.md](../source/DELIVERY.md). This file adds only the agent rules.

1. Start every delivery from the root `package.json` scripts. Do not edit `config*.versions.json` by hand.
   Main is protected. Commit each slice on a task branch. Push only checked gate commits to that branch.
   Open a promotion PR and wait for the owner's manual inspection and merge.
   If PR creation fails, supply a comparison link. Do not expand permissions, bypass rules or merge for the owner.
   Fetch and inspect merged main before a release operation. A gate pass is not permission to write directly to main.
2. Deliver only products whose behavior changed after a capability gate passes. Do not do ceremonial bumps.
3. Publish producers first: SDK, then network if peer bounds changed, then consumers.
4. Preview: use `delivery:preview <product> --execute` for crawler, crawler-client, worker, package and network on a synchronized branch.
   Stop for stale version config or tag history. Do not skip patches or treat a queue entry as checked publication.
   The preview App calls this same executor. Ordinary pushes do not allocate a version.
   Preview execution checkpoints all nonignored pending files before the version commit. Inspect its printed paths.
   Do not force-add ignored files. Release still requires clean main and never checkpoints pending files.
   A failed pending push retains its commit. Use its exact same-branch recovery command before retrying allocation.
5. Release: prepare a version PR with `delivery:release <product> --execute` from clean main after reviewed product promotion.
   The owner inspects and merges it. Finalize its exact merged commit with `delivery:finalize <product> <PR> <SHA> --execute`.
   Do not bypass main protection, merge PRs, write directly to main or allocate releases with the preview App.
   Owner review can use the owner's manual merge. Do not invent a second-reviewer requirement.
   CI and artifact recovery check the original tag-push actor and exact PR metadata. They do not prove human inspection.
   Protect main, release tags and workflow changes. Tag-selected code alone cannot enforce those repository controls.
   Local source/recovery fixtures passed. Hosted App authentication and main preview delivery passed.
   Main ruleset 24553134 is active with no bypass actors. Non-main delivery, stable-tag protection and reviewed release promotion remain open.
   Never approve GitHub environments or npm stages for the owner. Keep SDK v0.1.0 held for the full owner API review.
6. Keep failed tags fixed. `delivery:retry` retries Git pushes only. CI reruns remain manual by owner decision.
   Require publication and artifact proof for the configured predecessor before another allocation or release tag finalization.
   Use root `delivery:diagnose:all` for statuses and `delivery:check:all` for the nine configured proofs.
   Preview checkpoints reject pending edits to either version config. Preserve those edits for owner inspection, not automatic staging.
   Broken tagged workflows require manual resolution. Do not replace their tooling or move their tags.
   Recover a failed preparation push with `delivery:retry-preparation` on its retained clean branch.
   Do not rerun App allocation. Inspect the original tag and recover its delivery instead.
7. Record the tag, CI run, `delivery:check` result and open risks in `docs/scratch/task_tracker.md`.
8. Treat R58 as clarification of R57-C57A/B. Hosted diagnostic 37406552782 passed without allocation.
   Hosted Worker preview 2026.10.7-pre passed original byte and delivery checks. This does not prove non-main or release promotion.
   Preview schema initialization and final main sign-off remain open.
   Use `diagnose-only` before normal App allocation. Do not consume a patch for an authentication check.
