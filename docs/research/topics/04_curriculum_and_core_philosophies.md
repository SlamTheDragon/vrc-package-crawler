# External research library: navigation and evidence rules

Reviewed 2026-10-03. Start with the question under review, not a full curriculum. Research informs a decision; it does not replace owner direction or prove that a feature exists.

## Find the right shelf

| Need | Document | Scope |
| --- | --- | --- |
| Historical capability versus current runtime | [Prototype parity audit](../audits/PROTOTYPE_PARITY.md) | Source-backed comparison of 09e9dc8 and 3b9d203, reproduced defects, keep/research/change decisions. |
| Worker/D1, pacing, recovery and npm | [Infrastructure](01_crawler_systems_and_infrastructure.md) | Primary references, architecture checks and falsifiable tests. |
| Cryptographic delegation and creator removal | [Delegation patterns](05_cryptographic_delegation.md) | Authenticator codes, payment-webhook checks, app attestations, scoped grants and service/package boundaries. Research, not protocol approval. |
| Canonical identity, VPM and classification | [Identity](02_entity_resolution_and_ecosystem.md) | Evidence layers, false-merge corpus and field semantics. |
| Platform terms, statutes and legal drafting | [Legal procedure](03_legal_jurisprudence_and_governance.md) | Authorities, limitations, retrieval procedure and code-to-draft gaps. |
| Candidate storefront access | [Platform matrix](../markets/PLATFORM-MATRIX.md) | Per-source questions; no blanket or bootstrap approval. |
| Nexyy, avtr.zip, Payhip, Shopify and custom domains | [Additional market leads](../markets/ADDITIONAL_MARKET_SOURCE_RESEARCH.md) | Publisher/lead boundaries and dated intake. |
| Apps outside Unity/VPM | [Desktop tools](../markets/DESKTOP_TOOL_DISCOVERY_RESEARCH.md) | Particular VRChat targeting, app/module distinctions and candidate corpus. |
| Listing builders | [VPM template](../markets/VPM_TEMPLATE_RESEARCH.md) | Recipe versus listing/release evidence and bounded historical smoke. |
| Client ecosystem | [vrc-get and ALCOM](../markets/VRC_GET_ECOSYSTEM_RESEARCH.md) | Listings versus local project state; no installer/resolver scope. |
| Asset indexing safeguards | [Asset standards](../ASSET_INDEXING_STANDARDS_RESEARCH.md) | Distilled retention, attribution and removal questions. |
| Package selection | [Dependency review](../CRAWLER_DEPENDENCY_RESEARCH.md) | Existing packages, candidate overlap and lease-safe integration. |
| Earlier experiments | [Spikes](../SPIKES.md) | Historical results and what must be revalidated. |

These shelves are an external-resource library. The [implementation ledger](../../scratch/IMPLEMENTATION_PLAN.md) owns current decisions; [task tracker](../../scratch/task_tracker.md) owns the active slice. Neither a source draft nor a historical research statement can silently override a later owner instruction.

## Evidence labels

- **Retrieved:** the referenced primary material was obtained during the stated review. Record which clause or section was inspected; retrieval alone is not full validation.
- **Historical:** an earlier dated observation or test. Recheck mutable terms, interfaces and code before use.
- **Candidate:** a lead to investigate, not a recommendation or adopted design.
- **Unavailable:** retrieval failed. Keep the gap visible; do not fill it with confident memory.
- **Measured:** an identified fixture or runtime command produced a recorded result. State its limits.

Record publisher, canonical URL, title, language, version/date, reviewed section, conclusion, limitations and next test when adding research. Distinguish the document's effective date from retrieval date. Cite the primary paper, specification, platform documentation or court opinion; discovery lists and commentary can supply leads.

## Review cycle

1. State one invariant and its owner authority.
2. Trace callers through policy, adapter, storage and consumer.
3. Compare current code, historical capability and proposed behavior separately.
4. Check existing packages and platform features before writing a new utility.
5. Add the smallest counterexample; work in a bounded two-to-three-file slice.
6. Run targeted checks, full suites, typechecks and diff review. Retain failures and runtime limits in the checkpoint.
7. Reconcile descriptive docs. Mark ambiguous or consequential questions critical in the ledger.

The owner deferred author-review pauses for this iteration. Continue safe, independent slices while uncertainty stays in the ledger. Do not turn a confident summary, stop-hook recovery or test count into goal completion.

## Consolidation record

The topic documents form a linked resource library instead of repeating legal assurances, algorithm tutorials and unmeasured performance claims. Specialized ecosystem notes keep their dated evidence, while their implementation claims require the current parity audit.

Withdrawn claims include universal similarity thresholds, invented accuracy/load figures, blanket storefront bans or permissions, public-data privacy exemptions, automatic intermediary immunity and a worldwide embedding safe harbor. The previous scratch/current links were obsolete; the current three-file scratch ledger is the decision location.

Historical versions remain in Git. No source-access authorization, code capability or deployment follows from this documentation cleanup.
