# Source-access research matrix

Review: 2026-10-03. This matrix records evidence and open questions. It does not authorize a live request, retention or publication. Runtime profiles and bootstrap grants are not legal review.

| Source class | Evidence | Open question / disposition |
| --- | --- | --- |
| VPM listings | [VCC repository format](https://vcc.docs.vrchat.com/vpm/repos/) defines metadata listings | Review each host and license. Public format does not authorize every listing origin. Keep recipe/listing/project-state distinctions. |
| GitHub REST | [Official REST practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api), retrieved this review | Narrow public repository adapter exists. Authentication, account terms, permitted data use and shared budget need scope-specific review. No private repositories or HTML bypass. |
| BOOTH | [Guidelines](https://booth.pm/guidelines), scraping section retrieved, revised July 8, 2026 | Conditional information-analysis collection, subject to load and rights/damage restrictions. Review common/specific terms and republication. Neither blanket ban nor blanket approval is accurate. |
| Gumroad | [Terms](https://gumroad.com/terms), section 14(e) retrieved | Search-index exception is conditional and excludes caches/archives. Determine project qualification and applicable terms version. Keep access, retention and publication unresolved. |
| Jinxxy | [Terms](https://jinxxy.com/terms-of-service), section 23 retrieved | API-only automated access absent written permission. Creator API scope does not prove public catalog coverage. Seek a documented interface or written interpretation before sustained DOM ingestion. |
| itch.io | [Terms](https://itch.io/docs/legal/terms), [API overview](https://itch.io/docs/api/overview), [robots](https://itch.io/robots.txt) — historical review | Earlier review found search restrictions and account-scoped APIs. Recheck RSS/product endpoints and each origin. Do not restore prototype search/404 probes by assumption. |
| Payhip | [Terms](https://payhip.com/terms), introduction retrieved | Creator-facing terms and public product visibility do not establish crawler permission. Review visitor/merchant terms, endpoint scope and publication. Previous “approved” conclusion was unsupported. |
| Sellfy | [Terms](https://sellfy.com/terms/), user obligations retrieved | Public facts and merchant obligations are not an ingestion grant. Review each front and applicable reuse terms. Previous “approved” conclusion was unsupported. |
| Shopify merchant/custom domain | [Ajax product reference](https://shopify.dev/docs/api/ajax/reference/product), [robots customization](https://help.shopify.com/en/manual/promoting-marketing/seo/editing-robots-txt) — historical review | Owner includes this source class. Review merchant identity, interface, terms and robots per origin. Theme API assumptions do not extend to every headless store. |
| Curated list / community directory | [Market leads](ADDITIONAL_MARKET_SOURCE_RESEARCH.md) and [VPM template](VPM_TEMPLATE_RESEARCH.md) | Discovery only. Source lists do not clear destination hosts or establish canonical facts. Owner exclusion of VRCArena DOM crawling remains. |
| Publisher-controlled custom site | Explicit publisher/front relationship needed | Determine actual control and public interface. Branding or matching title is not enough. No broad custom-domain access rule. |

## Required review record

Record origin, exact path/method, interface, bot identity, reviewed clauses, language, retrieval/effective dates, credentials, account context, permissions, field classes, pacing, expiry and reviewer. Link supporting evidence and unresolved limitations.

Separate these decisions:

- Fetch: which public resource the coordinator may lease.
- Retain: which fields and evidence it may store, and for how long.
- Publish: which facts or expression downstream consumers may receive.
- Remove: which verified authority can revoke access or publication, and how consumers receive tombstones.

Robots is an independent operational check, not a rights grant. Retrieve actual snapshots under coordinator preflight authority. A default-enabled driver can remain available while unreviewed URLs stay ineligible.

## Source objection procedure

1. Suspend affected fetch authority.
2. Preserve only necessary evidence of the objection.
3. Check origin, sender authority, applicable terms and requested scope.
4. Decide resumption, narrower permission or exclusion with an auditable verdict.
5. Propagate approved suppression and downstream removal. Test the result.

An unverified complaint must not directly hide another creator's catalog item. The current code violates that separation, as the [audit](PROTOTYPE_PARITY.md) records.

See the [legal research procedure](03_legal_jurisprudence_and_governance.md) before drafting assurances. Fixed historical pacing numbers and bootstrap expiry dates do not establish source clearance.
