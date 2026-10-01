---
trigger: always_on
description: "Mitigate the 3 pillars of AI failure (quadratic context limits, sparse attention, decoupled RAG) and resist Jevons Paradox code bloat."
---

# 04 — Preserve context fidelity, bridge sparse attention, and resist code bloat

1. **Pillar 1 Mitigation: Context budgeting & bounded tool exposure ($O(n^2)$ scaling)**:
   - Do not dump entire files or multi-page command outputs into the context window. Use bounded line ranges (`view_file` with `StartLine`/`EndLine`) and focused searches (`rg -n`, exact symbols).
   - Indiscriminate context consumption accelerates quadratic token compaction, degrades attention density, and causes catastrophic forgetting of early project constraints.

2. **Pillar 2 Mitigation: Bridge sparse attention & verify cross-module connections**:
   - Transformer attention is sparse over long contexts; do not assume the model will implicitly track distant callers, shared state lifetimes, or lifecycle boundaries.
   - Trace cross-boundary invariants deterministically: verify inbound callers, outbound dependencies, and shared schema contracts explicitly before modifying shared symbols.
   - Enforce integration boundaries with executable cross-module tests rather than assuming isolated function correctness implies system coherence.

3. **Pillar 3 Mitigation: Triangulate against decoupled RAG & indexing blind spots**:
   - Never treat an isolated search hit, doc summary, or embedding snippet as self-evident truth. A decoupled chunk lacks AST semantics, call hierarchies, and runtime wiring.
   - Always triangulate retrieved snippets by verifying both directions: caller ↔ callee ↔ live test fixture. When documentation disagrees with live source, descriptive truth (runnable code and tests) takes precedence for runtime behavior, while normative truth (`DIRECTION.md`) governs architectural intent.

4. **Economic Trap Mitigation: Resist Jevons Paradox & software bloat**:
   - Cheaper code generation must not result in bloated architectures. Never add synthetic wrappers, duplicate helpers, speculative abstractions, or new files when an existing module or language primitive suffices.
   - When resolving defects, actively prefer **simplification, refactoring, and code deletion** over adding compensatory layers. Every new symbol adds maintenance and context tax.

5. **Operational Discipline: Externalize state; never trust conversational memory**:
   - Long conversations inevitably suffer from context compaction and recency bias. Never rely on internal conversational memory across turns for critical decisions, active task ledgers, or dependency maps.
   - Persist active state, gate boundaries, and unresolved questions to durable disk artifacts (`TODO.md`, `docs/scratch/`, or task ledgers). Re-anchor from disk at the beginning of each slice.
