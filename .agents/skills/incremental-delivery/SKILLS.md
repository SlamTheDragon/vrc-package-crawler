# Incremental delivery procedure

1. Name the gate, owner decision, observable acceptance condition, and one
   vertical slice. State explicit non-goals; defer unrelated defects.
2. Establish baseline behavior and the nearest negative test. Map every
   boundary the slice crosses: input schema, coordinator policy, lease,
   node, parser, storage, projection, API, consumer.
3. Compare reuse options before coding: existing module, maintained package,
   deletion/simplification, or small local implementation. Check package
   behavior, maintenance, license, runtime fit, and failure modes. Avoid both
   wholesale crawler frameworks and reinvention by default.
4. Change the minimum production path and its tests. Preserve runnable
   local coordinator and standalone node entry points. Do not call a mock-only
   path complete.
5. Run focused tests; inspect the diff; run typecheck/build and relevant
   integration or local simulation. Record exactly what was and was not
   exercised. Update conformance/docs only after evidence exists.
6. Close only this slice if its exit passes. Re-read open work before choosing
   the next slice; never turn the whole roadmap into one implementation batch.
