# Identity and ecosystem resource library

Reviewed 2026-10-03. Identity means a supported relationship between source records, not a similar title. See the [parity audit](../audits/PROTOTYPE_PARITY.md) for current behavior.

| Question | Primary resource | Practical boundary and test |
| --- | --- | --- |
| What is a VPM repository? | [VCC repositories](https://vcc.docs.vrchat.com/vpm/repos/) and [packages](https://vcc.docs.vrchat.com/vpm/packages/) — retrieved | Distinguish listing, release manifest, builder recipe and project-local state. Retain declared IDs, version strings, dependencies and source URL separately. A download URL is not binary validation. |
| What happens outside a listing? | [vrc-get source](https://github.com/vrc-get/vrc-get/tree/master/vrc-get-vpm) — historical source review in the [ecosystem note](../markets/VRC_GET_ECOSYSTEM_RESEARCH.md) | ALCOM is an application, not a registry. Compare malformed-entry, prerelease and yanked-release behavior without implementing a resolver. |
| Does a builder recipe prove a release? | [VRChat listing template](https://github.com/vrchat-community/template-package-listing) — historical review in the [template note](../markets/VPM_TEMPLATE_RESEARCH.md) | Follow explicit listing leads. Do not infer package identity from recipe labels, ZIP filenames or map order. |
| Can text similarity prove identity? | [Detecting Near-Duplicates for Web Crawling](https://research.google/pubs/detecting-near-duplicates-for-web-crawling/) — publication record retrieved, full paper not reviewed here | SimHash can propose candidates. It does not prove ownership, product equivalence or safe cross-category merges. Calibrate thresholds on a labeled corpus; no universal Hamming-distance rule. |
| What makes a desktop tool relevant? | [VRChat OSC documentation](https://docs.vrchat.com/docs/osc-overview) — historical reference; [desktop intake](../markets/DESKTOP_TOOL_DISCOVERY_RESEARCH.md) | Require publisher evidence of particular VRChat targeting. Keep apps, modules, avatar setups and generic utilities distinct. The owner selected a Tools category tag, not a new source platform. |
| Is a merchant domain authoritative? | [Shopify Ajax product API](https://shopify.dev/docs/api/ajax/reference/product), [merchant robots settings](https://help.shopify.com/en/manual/promoting-marketing/seo/editing-robots-txt) — historical review in [market leads](../markets/ADDITIONAL_MARKET_SOURCE_RESEARCH.md) | Separate domain, front, merchant and creator. Theme APIs are not universal headless-store interfaces. Require per-origin access review and explicit relationship evidence. |

## Keep three evidence layers separate

1. Discovery leads identify candidate URLs or credited authors. A community index cannot establish canonical product facts.
2. First-party observations record what a reviewed publisher/front actually states, with source version and field provenance.
3. Accepted identity links connect records. Keep provisional candidates reversible and out of authoritative public fields until reviewed.

Two products in one GitHub repository need not be one package. Matching package IDs across repositories can conflict. A base avatar and an add-on are related, not equivalent. Reused images and author names are insufficient merge evidence.

## Corpus and projection checks

Use labeled positive, negative and ambiguous pairs across Tools, Assets and Avatars. Include multiple fronts, app/module pairs, forks, mirrors, same-name creators, renamed domains, base-avatar dependencies and conflicting VPM releases. Report false merges separately from missed links. Keep unknown evidence unknown.

Preserve source creation, modification, release and observation timestamps separately. Neither a repository update nor a storefront modification proves initial publication. Likewise, missing price means unknown, not free; currency and locale belong to the observed front.

Public projection must honor publication rights, suppression and accepted links. The audit reproduced exposure despite an empty publication class list. This must be fixed before describing provenance as a complete rights control.

## Corrections to the previous tutorial

The former fixed similarity thresholds, asserted accuracy and directory-size estimates were not measured here. Its claims that the current runtime uses all proposed matching algorithms are withdrawn. Classification keywords and source branding are candidate evidence, not proof of category, control or safety.

Current code, prototype behavior and projected improvements are compared in the audit. Specialized market notes remain dated research: their old paths, counts and smoke results must not be treated as current test results.
