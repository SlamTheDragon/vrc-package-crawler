# Legal research library and drafting procedure

Reviewed 2026-10-03. This is research, not legal advice or permission to crawl. LEGAL.md is a draft unless the owner explicitly approved a provision. Separate computer access, contract, copyright, privacy, platform policy and publication rights.

## Authorities and limits

| Issue | Source and retrieval status | What to check before drafting |
| --- | --- | --- |
| Philippine personal data | [RA 10173, National Privacy Commission](https://privacy.gov.ph/data-privacy-act/) — retrieved earlier this review; later focused retrieval failed | Sections 11, 12 and 16: processing principles, lawful basis and subject rights. Public handles can identify people. A legitimate-interest assertion needs a purpose, necessity and balancing assessment. |
| Philippine copyright | [RA 8293 original statutory text](https://lawphil.net/statutes/repacts/ra1997/ra_8293_1997.html) — retrieved from Lawphil, not a verified current consolidated edition | Section 175 distinguishes unprotected information from protected expression; collection rights do not clear underlying works. Check amendments and applicable exceptions before relying on this text. |
| Intermediary liability | [RA 8792](https://lawphil.net/statutes/repacts/ra2000/ra_8792_2000.html) — retrieved statutory reproduction | Section 30 has conditions. An index is not automatically immune because it does not host product binaries. |
| US copyright | [Title 17, chapter 1](https://www.copyright.gov/title17/92chap1.html) — retrieved | Check protected expression and section 107 factors for the specific use. A factual field, prose snippet and image are different uses. |
| US access restrictions | [Van Buren, Supreme Court, 2021](https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf), [hiQ, Ninth Circuit, 2022](https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/18/17-16783.pdf) — opinions retrieved | Neither establishes universal scraping permission. Van Buren concerns exceeding authorized access; hiQ concerns a preliminary injunction and CFAA access to public profiles. Other claims and jurisdictions remain relevant. |
| Embedding images | [Hunley, Ninth Circuit, 2023](https://cdn.ca9.uscourts.gov/datastore/opinions/2023/07/17/22-15293.pdf) — opinion retrieved | The opinion applies the Server Test and discusses district-court disagreement. It is not evidence of a circuit split or worldwide immunity. Check subsequent treatment before a current legal conclusion. |
| Logged-out access and contracts | [Meta v. Bright Data, January 23, 2024, filing 181](https://docs.justia.com/cases/federal/district-courts/california/candce/3:2023cv00077/406956/181) — court order reproduced by Justia | A fact-specific contract decision, not a rule that website terms never bind crawlers. Retrieve the docket and later history before applying it. |
| EU personal data | [GDPR official text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng) — retrieved | Assess Article 3 territorial scope, lawful basis, minimization, notices, deletion and transfers. Free service or foreign hosting alone does not exclude coverage. |
| Japan information analysis | [Official translation portal candidate](https://www.japaneselawtranslation.go.jp/en/laws/view/4207) — retrieval failed | Obtain current Japanese Copyright Act text and relevant guidance. Do not assert that Articles 30-4 or 47-5 clear this service from an unavailable translation. |
| Robots | [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) — retrieved | This protocol is not access authorization. A robots allow rule cannot settle contract or reuse rights. |

Do not infer statutory requirements from project preferences. A 24–48 hour service target is not a universal legal deadline. US DMCA designated-agent and safe-harbor conditions need a section-specific applicability review. Avoid saying all indexing platforms must register.

## Source terms: findings, not access grants

| Source | Primary text and reviewed portion | Research disposition |
| --- | --- | --- |
| Jinxxy | [Terms](https://jinxxy.com/terms-of-service), section 23 — retrieved | Automated access is directed to official APIs absent written permission. The text is broader than storefront editing. A creator-scoped API does not establish public cross-store discovery scope. Seek an applicable interface or written interpretation. |
| Gumroad | [Terms](https://gumroad.com/terms), section 14(e) — retrieved | Conditional public-search-engine exception excludes caches/archives. Qualification and publication scope remain unresolved. Record the September 14, 2026 update, stated January 1, 2025 effective date, and October 14 existing-account transition separately. |
| BOOTH | [Japanese guidelines](https://booth.pm/guidelines), scraping section — retrieved | Information-analysis collection is conditionally allowed, with load and rights/damage restrictions. This corrects the old blanket ban; it does not clear republication or all common/specific terms. |
| Payhip | [Terms](https://payhip.com/terms), introduction — retrieved | The reviewed introduction describes a creator business relationship. It does not itself grant this index access or reuse rights. Identify applicable visitor and merchant terms. |
| Sellfy | [Terms](https://sellfy.com/terms/), user obligations — retrieved | Merchant obligations and public visibility do not establish crawler permission. Per-front terms and field reuse remain open. |

Other platform findings are dated candidates in the [platform matrix](PLATFORM-MATRIX.md). Research retrieval is not operational approval, even if bootstrap code currently creates a profile.

## Procedure: code operation to defensible draft

1. Identify the operation and its complete path: URL discovery, request, parsing, retention, identity linking, public projection, consumer export, log or removal.
2. List each field, subject, origin, account/API context, jurisdiction and recipient. Distinguish creator facts, expression, image URLs, contact data and user query/report text.
3. Retrieve primary terms, endpoint documentation, robots, licenses and law. Record canonical URL, clause, language, retrieval date, effective date, account applicability and missing sources. Store only necessary evidence, not a copied product archive.
4. Separate exact text from interpretation. For each conclusion, record factual prerequisites, jurisdiction, procedural posture and subsequent-history check. Escalate material uncertainty to counsel.
5. Define independent fetch, retain and publish permissions, with expiry and revocation. Translate them into a scoped coordinator profile and negative tests. A seed is not approval.
6. Verify enforcement at claim, heartbeat, submission and projection. Test revocation, stale robots, unknown ownership and denied publication. Do not draft a promise from a schema field alone.
7. Write only guarantees supported by code and operations. Mark proposals and unknowns. Keep source permission, project terms and privacy notices distinct.

## LEGAL.md reconciliation queue

| Draft topic | Current evidence or gap | Drafting action |
| --- | --- | --- |
| No accounts or personal information | Users store contact email; reports, search text and logs can carry identifying content | Inventory actual fields and retention; do not claim zero PII from anonymous authentication alone. |
| Creator proof and delisting | Pending unverified requests currently change lifecycle | Separate intake from verification and authorized action. Describe ownership proof only after it exists. |
| Publication restrictions | Empty publishClasses still exposed an item in the diagnostic | Fix public projection before promising rights-gated publication. |
| Media/thumbnail services | Prototype BLOB/proxy implementation is absent from the new path | Do not promise active media routes or blanket Server Test protection. |
| Dates and snippets | Modified timestamps project as publication; current summary bounds differ from the draft | Define truthful field semantics and actual limits. A character limit is not copyright clearance. |
| Anonymous demand | Threshold aggregation is not differential privacy; raw input may identify a person | Review data collection and disclosure separately; remove unsupported privacy labels. |
| Default source clearance | Bootstrap invents allow snapshots and long-lived grants | Replace bootstrap assumptions with reviewed evidence and real preflight. |

The [critical ledger](IMPLEMENTATION_PLAN.md) owns implementation decisions. Legal findings here do not authorize bypassing authentication, CAPTCHA, blocks, private APIs or product licenses.
