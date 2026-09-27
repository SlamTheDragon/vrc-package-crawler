# Platform Compliance and Legal Status Matrix

This document records the access posture and unresolved policy questions for candidate storefront platforms. It is not a live-source approval or legal opinion. See the dated [source access checkpoint](SOURCE_ACCESS_REVIEW.md) for implementation evidence.

---

## 1. Executive Matrix

The Project evaluates each target platform across five compliance dimensions:
1. **Access Model**: Authentication and protocol requirements.
2. **Contract Position**: Platform terms of service regarding automated extraction.
3. **Robots Exclusion Status**: Operational signals under IETF RFC 9309.
4. **Legal Basis**: Statutory exceptions or fair access principles.
5. **Project Risk Posture**: Calibrated operational stance and safeguards.

| Platform | Access Model | Contract Position | Robots.txt Status | Project Legal Position | Operational Risk Posture |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Gumroad** | Public Web Pages | Search-engine exception in Terms (Section 14(e)), qualification unresolved | Source-specific robots check still required | Do not assume this project qualifies as a public search engine under the clause | **Unresolved; no live seed approved** |
| **BOOTH.pm** | Public Web Pages | [Current guidelines](https://booth.pm/guidelines) conditionally permit information-analysis scraping; common/specific terms and republication require review | Robots paths not independently verified in this review | Japanese Copyright Act Art. 47-5 / 30-4 may be relevant, not blanket authorization | **Unresolved; no live seed approved** |
| **itch.io** | Public Web, documented browse RSS, authenticated account API | [Terms §3](https://itch.io/docs/legal/terms) restrict collecting information about others | [`/search` disallowed](https://itch.io/robots.txt); other paths need run-time check | No general catalog access conclusion | **Unresolved; no live seed approved** |
| **GitHub** | Narrow public REST repository metadata | API terms and information-use restrictions apply | API budgets, not `robots.txt`, govern this endpoint | One-off unauthenticated public metadata smoke only | **Narrow test passed; broader use unresolved** |
| **VRCArena** | Potential bilateral dataset/API federation | Agreement and exact dataset terms not established here | No HTML crawl approved | Research lead only | **Unresolved; no live seed approved** |
| **Jinxxy** | Public marketplace pages; documented Creator API is store-scoped, not a documented cross-creator catalog | Terms §§8.2 and 23 address automated access and systematic directory-building | Public paths are not disallowed in the current robots file; this is not permission | Public-listing discovery mechanism and Jinxxy's interpretation remain unconfirmed | **Contractual risk unresolved; no sustained DOM crawl approved by this review** |
| **Payhip (candidate)** | Public seller/product pages; [API](https://payhip.com/api-reference) is authenticated and account-scoped for coupons/license keys, not public cross-seller product listings | [Platform terms](https://payhip.com/terms) chiefly address creator use; visitor access and individual seller terms need separate review | Not verified in this checkpoint | No general automated product-discovery permission inferred from public pages or the account API | **Research only; no live seed approved** |

---

## 2. Platform Deep-Dives

### 2.1 Gumroad (Gumroad, Inc.)
- **Access Model**: Unauthenticated public storefront pages.
- **Contractual Status**: Gumroad Terms of Service Section 14(e) has a conditional exception for public search engine operators constructing publicly available searchable indices; it excludes caches or archives. This project has not established that it qualifies.
- **Effective Date Note**: The current Gumroad Terms state an effective date of January 1, 2025, and a last update of September 14, 2026. Changes bind existing accounts starting October 14, 2026. The Maintainer reviews terms versions periodically and does not assume universal applicability without qualification.
- **Project Position**: Treat qualification, retention, and publication as unresolved; the legacy crawler being configured for metadata indexing does not approve a live Gumroad run.
- **Safeguards**: 3.0-second baseline request delay, unauthenticated guest access, binary package exclusion policy.

### 2.2 BOOTH.pm (pixiv Inc.)
- **Access Model**: Unauthenticated public HTML listings.
- **Guideline Status**: [BOOTH's guidelines revised July 8, 2026](https://booth.pm/guidelines) allow crawler collection of posted/product information for information analysis aimed at user convenience or healthy creative activity, with restrictions for excessive load, rights harm, or other damage. The pixiv common/BOOTH-specific terms, robots paths and republication rights remain to be reviewed for this use.
- **Statutory Copyright Position**: Japanese Copyright Act Article 30-4 permits data analysis. Article 47-5 permits minor exploitation for computerized information retrieval, on condition that it does not unreasonably prejudice the copyright owner.
- **Contract vs Copyright Separation**: Statutory copyright exceptions do not create affirmative contractual licenses. The Project does not claim that Article 47-5 overrides private contract terms under Japanese law.
- **Safeguards**: Conservative pacing (1.5s baseline, 0.8s to 5.0s adaptive), bounded origin-link metadata, and prompt delisting upon objection. These safeguards are not an access grant.

### 2.3 Jinxxy (Jinxxy Technologies, LLC)
- **Access Model**: Unauthenticated public marketplace/storefront pages exist. The published [Creator API](https://support.jinxxy.com/hc/en-us/articles/28052364650637-How-can-I-access-the-Creator-API) uses creator-dashboard credentials for a creator's own products, customers, licenses, and orders; it is not documented as a cross-creator public discovery API.
- **Contractual Status**: [Terms §§8.2 and 23](https://jinxxy.com/terms-of-service) address automated systems and systematic retrieval for databases/directories. Section 23's API-only rule refers to *all automated access* absent written permission; it is not expressly confined to Creator API editing. No metadata-only or public-listing exception is stated. Jinxxy has not granted this project written permission.
- **Contractual Risk Classification**: **Unresolved Contractual Risk**. The legal effect of public accessibility on website terms is unresolved and jurisdiction-dependent. The Project does not characterize this access as affirmatively authorized.
- **Operational Policy**: The legacy adapter targets public pages, but a sustained DOM crawl should not be treated as approved without confirmed public-discovery API scope or Jinxxy's written interpretation/permission. The [robots file](https://jinxxy.com/robots.txt) has a sitemap and does not disallow public marketplace paths; robots and polite pacing alone do not resolve the terms question. Do not assume that replacing the adapter with the store-scoped Creator API is feasible.
- **Safeguards**: 1.2-second baseline pacing (0.8s to 6.0s adaptive), unauthenticated guest access, prompt delisting response target.

### 2.4 itch.io (itch corp.)
- **Access Model**: Public storefront and [browse-page RSS feeds](https://itch.io/docs/api/overview); the [server API](https://itch.io/docs/api/serverside) requires authentication and is not an unauthenticated cross-publisher catalog endpoint.
- **Contractual Status**: [Terms §3](https://itch.io/docs/legal/terms) restrict collecting information about others, in addition to harmful platform use.
- **Robots Status**: [Published rules](https://itch.io/robots.txt) disallow `/search` for all user agents. Legacy default search seeds and direct product-404 recovery probes were removed; this does not approve other paths.
- **Project Position**: No live itch seed is approved until RSS/product scope, privacy, field retention/publication, and run-time robots checks have a source-specific profile.
- **Safeguards**: Polite rate limits and zero binary caching remain necessary, not sufficient.

### 2.5 GitHub (GitHub, Inc. / Microsoft Corporation)
- **Access Model**: Authenticated and unauthenticated public developer REST and GraphQL APIs.
- **Contractual Status**: GitHub API terms and acceptable-use information restrictions govern API access in addition to documented rate limits.
- **Project Position**: A single public REST repository metadata endpoint (`GET /repos/{owner}/{repo}`) passed an opt-in local smoke. This does not establish a broad catalog-harvesting right or a completed attribution/privacy policy.
- **Safeguards**: The new node applies a 60-second unauthenticated origin floor, reset-header backoff, and zero private-repository or HTML scraping; sustained shared-IP budgeting remains open.

### 2.6 VRCArena (Community Directory)
- **Access Model**: Open community data dumps and bilateral API exchanges.
- **Contractual Status**: No bilateral data agreement or specific import license is established in this review.
- **Project Position**: Avoid HTML DOM scraping against community servers. Treat bilateral API federation or licensed static dataset import as research options, not active ingestion.
- **Safeguards**: Zero DOM scraping, toolchain-only filtering, mutual coordination.

---

## 3. Platform Objection and Cease-and-Desist Policy

If a platform operator submits an objection to indexing, the Maintainer executes this procedure:
1. **Pause Crawling**: Immediately pause crawler queues targeting the platform domain.
2. **Preserve Evidence**: Record the date, sender, and substance of the communication.
3. **Review Basis**: Review applicable terms, `robots.txt` records, and legal grounds.
4. **Determine Action**: Evaluate whether continued indexing has valid legal support.
5. **Resolve**: Either reach a documented operational agreement or permanently exclude the platform from all crawler queues.
