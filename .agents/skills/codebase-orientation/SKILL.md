---
name: codebase-orientation
description: Maps a large codebase, conflicting docs, TODOs, and current source paths before design or refactor work. Use at the start of a gate or after context loss.
---

# Codebase orientation procedure

1. Identify the current user objective and the single active gate. Separate
   owner-approved decisions from proposals, historical delivery claims, and
   measured conformance. Start with `docs/scratch/IMPLEMENTATION_PLAN.md`.
2. Inspect `git status --short`; assume dirty changes belong to the user or
   earlier work until proven otherwise. Do not overwrite them.
3. Use `rg --files` and symbol/reference searches to build a live path map.
   Read entry points, API schemas, adapters, storage, and tests relevant to
   the slice. Compare both call direction and downstream consumers.
4. Document working theories and hypotheses literally in the dedicated task
   tracker file: `docs/scratch/task_tracker.md`. Distinguish between old existing
   code and proposed new paths.
5. Produce a compact truth table: claimed behavior, code evidence, test
   evidence, contradiction/open question, and next smallest check. Cite file
   paths and line numbers. Do not synthesize missing behavior from design
   prose or a search index.
6. Stop discovery when the slice's dependency boundary is understood. Put
   unrelated findings into the implementation plan ledger instead of expanding scope.
