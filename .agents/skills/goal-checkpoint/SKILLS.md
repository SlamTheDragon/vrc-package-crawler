# Goal checkpoint procedure

1. Restate the active objective from the owner's latest instructions, not
   from hook output or an earlier agent's completion claim.
2. For every gate, record delivery status separately from conformance:
   accepted decision, changed files, tests/builds and dates, negative cases,
   remaining uncertainty, and the next action. Quote concrete evidence.
3. Reconcile the ledger with `git diff`, current tests,
   `docs/scratch/current/CONFORMANCE.md`, `docs/scratch/IMPLEMENTATION_PLAN.md`,
   `docs/scratch/DEFERRED_OWNER_DECISIONS.md`, and the active
   `docs/scratch/task_tracker.md`. If a claim cannot be reproduced, downgrade
   it to unverified.
4. On a stop hook, save the checkpoint and obey any explicit user pause. Do
   not infer completion from hook success, second-pass confidence, or a
   polished summary. On resume, verify the baseline and continue the next
   open slice.
5. Declare complete only when the user's objective and every required exit
   are actually met. Otherwise describe partial progress plainly and keep
   the goal active, without inventing authorization for a new scope.
