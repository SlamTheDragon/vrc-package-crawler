---
trigger: always_on
description: "Enforce the slice and gating iterative lifecycle using unmerged/canonical implementation plan ledgers and dedicated task tracking."
---

# 01 — Sequence the work (Iterative Slice & Gating Lifecycle)

Every task must strictly adhere to the following sequence of rules:

1. **Understand the codebase**:
   - Read targeted documentation contexts before editing code.
   - Note down working theories for relevant changes literally in the dedicated task tracker file (`docs/scratch/task_tracker.md`).

2. **Clarify prompt using question hooks**:
   - Clarify underspecified requirements, ambiguities, or architectural trade-offs with the user via `ask_question`.

3. **Produce sequential gated iterations (Unmerged Implementation Plan)**:
   - Dissect the user prompt into smaller context chunks.
   - Tie related code and its underlying orthogonal or hierarchical class/entity dependencies.
   - Output a tabled ledger under an **"Unmerged Implementation Plan"** header using this exact schema:
      task slices:
     `| status | ID | problem | related-code(s) | reason | solution | author comments |`
     additionlly, milestone gates should be documented below that the first table will reference
     `| ID | milestone | current results | author comments |`
     *(The author comments column must be left blank for user input).*
   - **Scratch constraint**: Keep exactly the three canonical files in `docs/scratch/`. This constraint does not limit source or test files.
   - Select one capability gate or related gate group. Keep source changes within its complete dependency boundary.
   - **Minimal Scratch Footprint**: The `docs/scratch/` directory must maintain a minimal footprint of only 2–3 files at a time and one folder (e.g., `UNMERGED_IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PLAN.md` and `task_tracker.md`), merging historical items and conformance evidence into the true canonical ledger and pruning legacy docs.

4. **Pause for author review**:
   - Defer routine review pauses within the owner's granted lifecycle authority. Preserve explicit owner holds and critical undecided contracts.
   - Once the author accepts by filling out comments, merge approved items into the master canonical implementation plan ledger.

5. **Execute the slice via the task tracker**:
   - Obtain a single slice from the true implementation plan ledger.
   - Rewrite `docs/scratch/task_tracker.md` specifically for the current slice iteration.
   - Commit locally each implemented slice as a scoped checkpoint. Keep its status unverified until the capability gate checks pass.
   - Preserve unrelated owner edits. Commit only the slice's files unless the owner explicitly requests a combined checkpoint.
   - Implement the capability gate or related gate group before running its checks and checkpoint write-ups.
   - Keep incomplete changes marked unverified. Run the relevant tests, typechecks and runtime/build checks together at that checkpoint.
   - When the gate passes, commit its evidence and push the checked commits to the task branch.
   - Owner update, 2026-10-06: normal source and preview commits may push to synchronized main. Preview allocation stays on the current branch and does not require a promotion PR.
   - If a connector cannot create the PR, supply a comparison link. Do not expand credentials or bypass protection to finish the gate.
   - Never disable rulesets, add a bypass, force-push main or merge for the owner. A gate pass authorizes a branch push, not a merge.
   - After promotion, fetch and inspect the merged main commit before release preparation or tag-only finalization.
   - A slice commit alone does not authorize a tag, publication or deployment. Preserve protected-main and product release approvals.

6. **Practice delivery at capability milestones (R57-C57B)**:
   - After the gate checks pass, select only the products whose delivered behavior or contracts changed.
   - Use each selected product's root delivery chain. It allocates the next configured patch, synchronizes metadata, commits, tags and pushes.
   - Check dependency producers first. An SDK peer change needs a checked network archive before dependent crawler or Worker delivery.
   - Keep artifact channels separate from SDK channels. Crawler/Worker use preview SDK. Desktop/web use release SDK. Network has one archive stream.
   - Use preview for iterative verification. Release publication retains its owner approvals. Do not approve protected jobs or npm stages for the owner.
   - Keep SDK v0.1.0 held for full owner API review. Keep website delivery disabled and Worker release build-only.
   - Check the tagged CI run, original artifact bytes, receipts, registry identities and deployment links before recording delivery as verified.
   - Keep failed and published tags fixed. Require publication/artifact proof for the configured predecessor before another bump or release tag finalization.
   - CI reruns remain manual. Broken tagged workflows require manual resolution. Never bump unrelated products to align versions.
   - Do not publish a product for a documentation-only gate, an unchanged runtime, or an unresolved safety boundary. Record the reason.
   - Record the run/tag, dependency versions, checks and remaining uncertainty. A successful deployment does not complete the full goal.
   - Follow [the agent delivery procedure](../../docs/decisions/AGENT_DELIVERY_PROCEDURE.md). Human commands are in [DELIVERY.md](../../docs/source/DELIVERY.md).

7. **Reconcile and repeat**:
   - Once finished, check the implementation plan ledger and mark completed items as done based on the task tracker.
   - Remove subsequent author comments for that row.
   - Remove rows that were marked completed where author comments indicate acceptance (blank comments remain pending review).
   - Otherwise, check for new author comments on rows marked as done with disapproval signals, then repeat from Step 1 after unmarking and updating their descriptions starting the lifecycle again

With the documents updated, you only have to inform the user about the updates, no need to copy the whole thing into the final chat. If user asks a question in a comment, it is not an answer that is eligible for proceedings, the row must be clarified and requeued.
