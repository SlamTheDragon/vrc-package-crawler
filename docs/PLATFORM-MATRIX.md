# Platform Compliance and Legal Status Matrix

This document records the access posture, contractual terms, and risk ratings for indexed storefront platforms.

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
| **Gumroad** | Public Web Pages | Search-engine exception in Terms (Section 14(e)) | Followed (`Allow: /`) | Search engine exception in terms (subject to periodic review) | **Low Risk (Conditional)** |
| **BOOTH.pm** | Public Web Pages | Master Terms prohibit commercial extraction | Followed (Paced) | Japanese Copyright Act Art. 47-5 / 30-4 (contractual position unresolved) | **Medium Risk (Jurisdiction-Dependent)** |
| **itch.io** | Public Web & API | Terms prohibit server degradation | Followed (`Allow: /`) | Public directory indexing | **Low Risk (Developer Friendly)** |
| **GitHub** | Official REST / GraphQL | Acceptable Use Policy allows API use | Followed (API limits) | Public developer API within rate limits | **Minimal Risk (API First)** |
| **VRCArena** | Static Data / API | Open community directory | Followed (`Allow: /`) | Bilateral open data federation | **Minimal Risk (Federated)** |
| **Jinxxy** | Public Web Pages | Sections 8.2 and 23 prohibit scraping | Followed (Paced) | Unauthenticated indexing (unresolved contractual risk under ToS) | **High Risk (Unresolved Contract Risk)** |

---

## 2. Platform Deep-Dives

### 2.1 Gumroad (Gumroad, Inc.)
- **Access Model**: Unauthenticated public storefront pages.
- **Contractual Status**: Gumroad Terms of Service Section 14(e) grants public search engine operators permission to spider materials for publicly available searchable indices. The permission excludes caches or archives.
- **Effective Date Note**: The current Gumroad Terms state an effective date of January 1, 2025, and a last update of September 14, 2026. Changes bind existing accounts starting October 14, 2026. The Maintainer reviews terms versions periodically and does not assume universal applicability without qualification.
- **Project Position**: The Project's operational assessment considers the search engine clause. The crawler is configured for metadata indexing rather than product binary downloads.
- **Safeguards**: 3.0-second baseline request delay, unauthenticated guest access, binary package exclusion policy.

### 2.2 BOOTH.pm (pixiv Inc.)
- **Access Model**: Unauthenticated public HTML listings.
- **Contractual Status**: pixiv Master Terms Article 14 restricts unauthorized automated collection and server burden. Standard form contract rules apply under Japanese Civil Code Article 548-2.
- **Statutory Copyright Position**: Japanese Copyright Act Article 30-4 permits data analysis. Article 47-5 permits minor exploitation for computerized information retrieval, on condition that it does not unreasonably prejudice the copyright owner.
- **Contract vs Copyright Separation**: Statutory copyright exceptions do not create affirmative contractual licenses. The Project does not claim that Article 47-5 overrides private contract terms under Japanese law.
- **Safeguards**: Conservative pacing (1.5s baseline, 0.8s to 5.0s adaptive), pure origin URL pointer model (local WebP BLOB caching deprecated and purged), and prompt delisting upon objection.

### 2.3 Jinxxy (Jinxxy Technologies, LLC)
- **Access Model**: Unauthenticated public storefront pages.
- **Contractual Status**: Jinxxy Terms of Service Sections 8.2 and 23 prohibit automated access, spiders, and systematic retrieval without prior written permission. Jinxxy has not granted written permission.
- **Contractual Risk Classification**: **Unresolved Contractual Risk**. The legal effect of public accessibility on website terms is unresolved and jurisdiction-dependent. The Project does not characterize this access as affirmatively authorized.
- **Operational Policy**: The crawler accesses only public pages. It follows `robots.txt` preferences and polite pacing. The Project maintains an immediate cessation policy upon platform objection or `robots.txt` disallowance.
- **Safeguards**: 1.2-second baseline pacing (0.8s to 6.0s adaptive), unauthenticated guest access, prompt delisting response target.

### 2.4 itch.io (itch corp.)
- **Access Model**: Unauthenticated public storefronts and official developer REST endpoints.
- **Contractual Status**: Terms of Service restrict actions that impair platform operations. The platform supports independent developer integrations.
- **Project Position**: The crawler indexes public tools and assets, routing 100 percent of outbound traffic to itch.io storefronts.
- **Safeguards**: Polite rate limits, official API preference where available, zero binary caching.

### 2.5 GitHub (GitHub, Inc. / Microsoft Corporation)
- **Access Model**: Authenticated and unauthenticated public developer REST and GraphQL APIs.
- **Contractual Status**: GitHub Acceptable Use Policy permits API consumption within documented rate limits.
- **Project Position**: Follows developer terms. Enforces active conditional HTTP headers (`ETag`, `If-None-Match`, `If-Modified-Since`) to minimize bandwidth and server load.
- **Safeguards**: Exponential backoff on rate limits, zero scraping of private repositories.

### 2.6 VRCArena (Community Directory)
- **Access Model**: Open community data dumps and bilateral API exchanges.
- **Contractual Status**: Permissive open-source community directory.
- **Project Position**: The crawler avoids HTML DOM scraping against community servers. It relies exclusively on bilateral API federation or static dataset imports with category whitelisting.
- **Safeguards**: Zero DOM scraping, toolchain-only filtering, mutual coordination.

---

## 3. Platform Objection and Cease-and-Desist Policy

If a platform operator submits an objection to indexing, the Maintainer executes this procedure:
1. **Pause Crawling**: Immediately pause crawler queues targeting the platform domain.
2. **Preserve Evidence**: Record the date, sender, and substance of the communication.
3. **Review Basis**: Review applicable terms, `robots.txt` records, and legal grounds.
4. **Determine Action**: Evaluate whether continued indexing has valid legal support.
5. **Resolve**: Either reach a documented operational agreement or permanently exclude the platform from all crawler queues.
