---
trigger: always_on
description: "Preserve context window fidelity, resist code bloat, and defeat RAG blind spots."
---

# 04 — Preserve context fidelity and resist code bloat

1. **Context budgeting & minimal tool exposure**:
   - Do not dump entire files or multi-page command outputs into the context window. Use bounded line ranges (`view_file` with `StartLine`/`EndLine`) and focused searches (`rg -n`, exact symbols).
   - Indiscriminate context consumption accelerates token compaction, degrades attention density, and causes catastrophic forgetting of early project constraints.

2. **Resist Jevons Paradox & code bloat**:
   - Cheaper code generation must not result in bloated architectures. Never add synthetic wrappers, duplicate helpers, speculative abstractions, or new files when an existing module or language primitive suffices.
   - When resolving defects, actively prefer **simplification, refactoring, and code deletion** over adding compensatory layers. Every new symbol adds maintenance and context tax.

3. **Triangulate against decoupled RAG blind spots**:
   - Never treat an isolated search hit, doc summary, or embedding snippet as self-evident truth. A decoupled chunk lacks AST semantics, call hierarchies, and runtime wiring.
   - Always triangulate retrieved snippets by verifying both directions: caller ↔ callee ↔ live test fixture. When documentation disagrees with live source, descriptive truth (runnable code and tests) takes precedence for runtime behavior, while normative truth (`DIRECTION.md`) governs architectural intent.

4. **Externalize state; never trust conversational memory**:
   - Long conversations inevitably suffer from context compaction and recency bias. Never rely on internal conversational memory across turns for critical decisions, active task ledgers, or dependency maps.
   - Persist active state, gate boundaries, and unresolved questions to durable disk artifacts (`TODO.md`, `docs/scratch/`, or task ledgers). Re-anchor from disk at the beginning of each slice.
