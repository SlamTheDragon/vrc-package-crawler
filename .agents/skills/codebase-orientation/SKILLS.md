# Codebase orientation procedure

1. Identify the current user objective and the single active gate. Separate
   owner-approved decisions from proposals, historical delivery claims, and
   measured conformance. Start with `docs/decisions/DIRECTION.md`,
   `docs/decisions/IMPLEMENTATION_PLAN.md`, `TODO.md`,
   `docs/decisions/current/CONFORMANCE.md`, and `docs/decisions/DEFERRED_OWNER_DECISIONS.md`.
2. Inspect `git status --short`; assume dirty changes belong to the user or
   earlier work until proven otherwise. Do not overwrite them.
3. Use `rg --files` and symbol/reference searches to build a live path map.
   Read entry points, API schemas, adapters, storage, and tests relevant to
   the slice. Compare both call direction and downstream consumers.
4. Produce a compact truth table: claimed behavior, code evidence, test
   evidence, contradiction/open question, and next smallest check. Cite file
   paths and line numbers. Do not synthesize missing behavior from design
   prose or a search index.
5. Stop discovery when the slice's dependency boundary is understood. Put
   unrelated findings into the task ledger instead of expanding scope.
