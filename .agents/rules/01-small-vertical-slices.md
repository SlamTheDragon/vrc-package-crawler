---
trigger: always_on
description: "Bound large-codebase changes to one evidence-backed vertical slice at a time."
---

# 01 — Sequence the work

1. Before coding, state one gate, one behavioral invariant, and the smallest
   user-visible or protocol-visible slice that can test it. A broad roadmap
   is not permission to implement every row in one pass.
2. Trace both directions: caller → contract → callee → persisted state →
   consumer, and reverse references to the touched symbol/schema. Search the
   live tree; do not trust a retrieval index or summary alone.
3. Record baseline tests and existing dirty files. Touch only the slice's
   necessary paths; preserve unrelated user work. Prefer deleting duplicate
   machinery or using a researched dependency over adding another abstraction.
4. Implement one slice, verify it, review its diff, update its conformance
   evidence, then explicitly choose the next slice. A failed gate remains
   open even if an adjacent gate passes. Never batch independent gate exits
   behind one confident final paragraph.
