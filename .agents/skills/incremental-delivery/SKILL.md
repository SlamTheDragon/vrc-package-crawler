---
name: incremental-delivery
description: Step-by-step procedural lifecycle for gated, iterative delivery using implementation plan ledgers, task tracker rewrites, and author review pauses.
---

# Incremental delivery procedure

Execute this procedure on every development iteration to enforce the slice and gating lifecycle:

## Step 1: Codebase Understanding & Theory Capture
1. Read targeted documentation contexts in `docs/` and relevant source paths. Do not ingest unbounded files.
2. Document working theories and hypotheses literally in the dedicaated task tracker file: `docs/scratch/task_tracker.md`.
3. Distinguish between old existing code and proposed new code paths.

## Step 2: Prompt Clarification via Question Hooks
1. Identify any ambiguous requirements, architectural trade-offs, or user decisions.
2. Invoke `ask_question` with structured multiple-choice options to clarify intent with the user before drafting implementation plans.

## Step 3: Sequential Gated Dissection & Unmerged Implementation Plan
1. Dissect the prompt into bounded, modular context chunks.
2. Map all related code symbols, including orthogonal dependencies (cross-module services) and hierarchical dependencies (inheritance, parent callers, data schemas).
3. Enforce the **2–3 Files Bounding Constraint**: each slice must touch only 2–3 files at a time. Exceeding 2–3 files signals bloat and triggers compaction into smaller slices.
4. Output the gated plan under an **"Unmerged Implementation Plan"** header in this exact table format:
   **Task Slices**:
   ```markdown
   | status | ID | problem | related-code(s) | reason | solution | author comments |
   | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
   | pending | <slice-id> | <concise problem> | `path/to/file.ts:line` | <root cause / why> | <concrete minimal fix> | |
   ```
   **Milestone Gates**:
   ```markdown
   | ID | milestone | current results | author comments |
   | :--- | :--- | :--- | :--- |
   | <gate-id> | <milestone name> | <verified metrics / current results> | |
   ```
   *Note: The `author comments` column MUST be left empty for user input.*
5. Maintain a **Minimal Scratch Footprint**: keep only 2–3 files in `docs/scratch/` (e.g., `UNMERGED_IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PLAN.md`, and `task_tracker.md`), merging historical items and conformance evidence into the true canonical ledger and pruning legacy docs.

## Step 4: Gating Pause & Merge
1. Pause execution to allow the user to review the table and populate the `author comments` column.
2. Once the author accepts by filling out comments, merge approved items into the master canonical implementation plan ledger (`docs/scratch/IMPLEMENTATION_PLAN.md`).

## Step 5: Slice Extraction & Task Tracker Execution
1. Extract exactly one bounded slice from the true implementation plan ledger.
2. Rewrite `docs/scratch/task_tracker.md` specifically for the current slice iteration.
3. Execute the slice (strictly bounded to 2–3 files), verifying boundaries and running targeted tests.

## Step 6: Reconciliation & Iteration Loop
1. Verify the slice results against test baselines.
2. Update the implementation plan ledger:
   - Mark completed items as done based on the task tracker.
   - Remove subsequent author comments for that row.
   - Remove rows that were marked completed where author comments indicate acceptance (blank comments remain pending review).
   - Otherwise, check for new author comments on rows marked as done with disapproval signals, then repeat from Step 1 after unmarking and updating their descriptions starting the lifecycle again.
