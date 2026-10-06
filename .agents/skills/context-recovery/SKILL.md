---
name: context-recovery
description: Strict 5-step recovery procedure to salvage agent context, purge poisoned memory, defeat RAG blind spots, and re-anchor to ground truth. Use after context compaction, long turns, or detected confusion.
---

# Context recovery procedure

Execute this procedure whenever conversational context feels degraded, after a context compaction notice, when resuming after an interruption, or when observing conflicting claims between docs and code.

1. **Purge conversational assumptions & check physical state**:
   - Discard unverified conversational memory regarding current code state.
   - Run `git status --short` and `git diff --stat` to identify the exact physical changes on disk. Any uncommitted work is treated as ground state.

2. **Re-anchor from canonical normative & descriptive anchors**:
   - Read owner terminology in [`docs/decisions/VISION.md`](../../../docs/decisions/VISION.md) and gate constraints in [`docs/scratch/IMPLEMENTATION_PLAN.md`](../../../docs/scratch/IMPLEMENTATION_PLAN.md).
   - Read measured evidence in [`docs/scratch/task_tracker.md`](../../../docs/scratch/task_tracker.md) and open questions in [`docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md`](../../../docs/scratch/UNMERGED_IMPLEMENTATION_PLAN.md).
   - Never extrapolate requirements beyond what is explicitly accepted by the owner.

3. **Triangulate code boundaries (AST over RAG)**:
   - When investigating a subsystem, do not rely on broad text search alone.
   - Trace the complete vertical chain using targeted symbol lookups:
     `Entry Point / CLI` → `Coordinator Lease / Policy` → `Node Driver / Adapter` → `Storage / SQLite` → `Projection / Consumer`.
   - For every symbol touched, verify both:
     - **Inbound**: who calls or imports this symbol?
     - **Outbound**: what contracts or invariants does this symbol depend on?

4. **Execute an anti-bloat audit**:
   - Before proposing or writing changes, inspect the diff for accidental duplication:
     - Did we recreate a utility that already exists in `src/`?
     - Did we write custom logic where an existing dependency or stdlib call should be used?
     - Can this requirement be solved by deleting or simplifying code rather than adding wrappers?

5. **Emit a ground-truth checkpoint**:
   - State in 3–5 bullet points:
     - **Active Gate & Slice**: exact invariant being verified.
     - **Physical Baseline**: files modified and clean baseline status.
     - **Triangulated Contract**: verified caller/callee boundary with file paths and line numbers.
     - **Immediate Next Step**: the smallest falsifiable test or change.
