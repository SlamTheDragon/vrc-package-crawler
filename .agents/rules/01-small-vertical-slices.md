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
   - **2–3 Files Bounding Constraint**: Each slice must touch only 2–3 files at a time. Exceeding 2–3 files signals bloat and triggers compaction into smaller slices.
   - **Minimal Scratch Footprint**: The `docs/scratch/` directory must maintain a minimal footprint of only 2–3 files at a time (e.g., `UNMERGED_IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PLAN.md` and `task_tracker.md`), merging historical items and conformance evidence into the true canonical ledger and pruning legacy docs.

4. **Pause for author review**:
   - Pause execution to allow the author to review the table and fill in comments.
   - Once the author accepts by filling out comments, merge approved items into the master canonical implementation plan ledger.

5. **Execute the slice via the task tracker**:
   - Obtain a single slice from the true implementation plan ledger.
   - Rewrite `docs/scratch/task_tracker.md` specifically for the current slice iteration.
   - Execute related necessary slices taken from canonical implementation plan ledger, verifying boundaries and running targeted tests.

6. **Reconcile and repeat**:
   - Once finished, check the implementation plan ledger and mark completed items as done based on the task tracker.
   - Remove subsequent author comments for that row.
   - Remove rows that were marked completed where author comments indicate acceptance (blank comments remain pending review).
   - Otherwise, check for new author comments on rows marked as done with disapproval signals, then repeat from Step 1 after unmarking and updating their descriptions starting the lifecycle again

With the documents updated, you only have to inform the user about the updates, no need to copy the whole thing into the final chat. If user asks a question in a comment, it is not an answer that is eligible for proceedings, the row must be clarified and requeued.