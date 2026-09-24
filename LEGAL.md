# Legal Notices, Operational Covenants, and Terms of Service

**Document Version: 1.1 (Calibrated Public Draft)**  
**Effective Date:** September 24, 2026  
**Governing Law:** Substantive Laws of the Republic of the Philippines  
**Judicial Forum:** Courts of the Republic of the Philippines  

The software, tools, APIs, catalogs, and documentation in this repository (collectively, the "**Project**") are developed by SlamTheDragon, an individual open-source developer ("**Maintainer**"). The Maintainer resides in the Republic of the Philippines. The Maintainer does not operate as a commercial entity.

These Terms govern access to and use of Project-controlled catalog feeds, API endpoints, and exported SQLite database files (`vrc_catalog.db`). Obtaining, reading, compiling, or modifying the source code is governed strictly and exclusively by the **GNU Affero General Public License v3.0** in [LICENSE.md](LICENSE.md). These Terms govern only access to Project catalog feeds, API endpoints, and database distribution files.

---

> [!IMPORTANT]
> **PLEASE READ THESE TERMS CAREFULLY BEFORE ACCESSING OR INTEGRATING PROJECT CATALOG FEEDS.**  
> THESE TERMS CONTAIN LIMITATIONS OF LIABILITY AND RELEASES (SECTION 15). THEY CONTAIN CONSPICUOUS DISCLAIMERS OF WARRANTIES (SECTION 14). THEY SET OUT DOWNSTREAM API AND CATALOG COVENANTS INCLUDING SOURCE STOREFRONT DEEP-LINKING AND ANTI-AI MODEL TRAINING RESTRICTIONS (SECTIONS 10 AND 11). THEY INCLUDE AN INFORMAL DISPUTE RESOLUTION PROCEDURE AND PHILIPPINE FORUM SELECTION (SECTION 16). THE MAINTAINER INTENDS THESE TERMS TO GOVERN ACCESS TO PROJECT-CONTROLLED CATALOG FEEDS, API ENDPOINTS, AND DATABASE EXPORTS. THEIR ENFORCEABILITY DEPENDS ON NOTICE, APPLICABLE CONTRACT LAW, AND VALID CONTRACT FORMATION. IF YOU DO NOT AGREE TO THESE TERMS, DO NOT ACCESS, QUERY, DOWNLOAD, OR REDISTRIBUTE PROJECT-CONTROLLED CATALOGS OR APIS.

---

## 1. Project Scope and Legal Architecture

1.1. **Open-Source Package Discovery Infrastructure.**  
The Project is an open-source search and indexing engine. It discovers, indexes, and organizes metadata about public software packages, tools, and creator listings. It serves community package managers and discovery utilities in the VRChat and Unity developer ecosystems. It functions as a specialized search engine index.

1.2. **Backend Infrastructure Only.**  
The Software operates exclusively as backend infrastructure. It serves REST API endpoints, incremental edge sync feeds, and exported SQLite search catalogs. It does not operate as a store, transaction broker, or payment processor.

1.3. **The Three Legal Layers.**  
The Project distinguishes three distinct legal layers:
- **Layer A (Source Code):** Governed exclusively by the GNU Affero General Public License v3.0 ([LICENSE.md](LICENSE.md)). The Project cannot and does not use these Terms to restrict rights granted by AGPLv3. Downloading, compiling, or running the source code does not bind a user to these catalog terms.
- **Layer B (Project-Created Material):** Database schema design, categorization taxonomy, compilation coordination, and original documentation. The Maintainer claims copyright in original compilation, selection, arrangement, database schema design, categorization taxonomy, and documentation to the extent recognized by applicable law, and supplies access to Project-controlled catalog outputs under these Terms.
- **Layer C (Third-Party Origin Data):** Package names, creator handles, prices, version numbers, storefront URLs, creative marketing text, and trademarks. Third-party materials remain subject to their original creator or platform rights. The Maintainer does not claim property or ownership rights in underlying third-party origin data.

1.4. **Deployment and Network Ownership Model.**  
The Project operates under two distinct deployment structures:
- **(a) The Canonical Network:** When crawler nodes or contributors send discovered metadata to the Maintainer canonical network, that network owns the resulting catalog products. This includes unified projection databases (`vrc_catalog.db`) and search indexes. Access to and redistribution of these canonical network products are governed by these Terms.
- **(b) Independent Networks (AGPLv3):** If an entity uses or modifies this crawler software for an independent network, the GNU Affero General Public License v3.0 (AGPLv3) strictly applies. That operator must obey all AGPLv3 copyleft obligations, including Section 13 for network interaction. The Maintainer claims no ownership over independent databases generated outside the Canonical Network.

1.5. **Terms Precedence.**  
In the event of conflict, mandatory applicable law controls. For source code, AGPLv3 controls all rights granted by that license. Third-party materials remain subject to their applicable licenses. These Terms govern Project-controlled catalog outputs to the extent the Maintainer has legal authority to impose them.

1.6. **No Legal Advice.**  
This document serves technical and transparency purposes only. It does not constitute formal legal advice.

---

## 2. What the Crawler Indexes

2.1. **Factual Metadata.**  
The crawler collects objective facts from public storefront pages. Indexed facts include: package names, reverse-DNS identifiers (`com.author.tool`), semantic version numbers, platform compatibility flags (`Unity 2022`, `PhysBones`), prices, tags, and canonical storefront URLs.

2.2. **Statutory Copyright Basis and Functional Description Limits.**  
Individual factual data elements lack copyright protection under 17 U.S.C. Section 102(b), 37 C.F.R. Section 202.1(a), and Philippine Republic Act No. 8293 Section 175 (*Feist Publications, Inc. v. Rural Telephone Service Co.*, 499 U.S. 340). Underlying creative text, marketing copy, and documentation may retain independent copyright protection.

The crawler extracts short descriptive summaries from publisher metadata fields. Sources include Open Graph (`og:description`) meta tags, JSON-LD structured descriptions, and package manifest fields, or lead text from repository documentation. In *Field v. Google, Inc.* (412 F. Supp. 2d 1106) and *Authors Guild v. Google, Inc.* (804 F.3d 202), courts evaluated search index caching and snippet displays under specific factual records. The Project does not treat these decisions as establishing an affirmative statutory safe harbor or universal fair-use exemption. The Maintainer limits description indexing to short functional summaries as an operational risk-reduction measure. Fair-use assessments remain fact-specific and jurisdiction-dependent.

2.3. **Metadata Provenance Architecture.**  
The database tracks provenance by linking canonical package records to raw immutable entries in the `entities` observation lake and `package_fronts` via source identifiers (`source_ids_json`, `raw_entity_id`), recording origin URLs, platforms, and fetch timestamps. The architecture roadmap specifies extending this schema to granular per-field provenance attributes (`field_name`, `source_url`, `source_platform`, `retrieved_at`, `source_type`, `confidence`, `rights_status`) to maintain an evidentiary audit trail for all catalog entries.

2.4. **Three-State Timestamp Rubric.**  
The Project records creation timestamps under a three-state rubric:
- `confirmed`: Extracted directly from authoritative platform metadata.
- `inferred`: Derived from the earliest verified commit or changelog entry.
- `unknown`: When no upstream publication date exists, the timestamp is NULL. When an upstream publication date is not identified, the publication timestamp field is set to NULL rather than substituting a local crawl timestamp.

2.5. **Indexed Platforms.**  
The Project indexes public listings from BOOTH.pm, Gumroad, Jinxxy, itch.io, GitHub, and community registries (subject to Section 5).

---

## 3. What the Crawler Excludes

3.1. **Binary Package Exclusion Policy.**  
The Project policy strictly excludes downloading, caching, storing, or redistributing proprietary compiled asset packages, 3D meshes, textures, or binaries. Target formats excluded by policy include `.unitypackage`, `.vpmz`, `.zip`, `.tar.gz`, `.rar`, `.7z`, `.fbx`, `.obj`, `.blend`, `.prefab`, `.asset`, and compiled executables. For image ingestion, the software implements a 10 MB socket guardrail aborting transfers exceeding that size. Additional transport-level MIME and size abort guardrails across crawler drivers represent planned architectural safeguards.

3.2. **Exclusion of Non-Public and Personal Data.**  
The crawler does not access authenticated accounts, checkout funnels, private messages, customer order histories, buyer identities, or billing records.

3.3. **Data Minimization Beyond Collection.**  
The crawler excludes creator biographies, personal email addresses, avatars, Discord handles, and private social accounts. This is intended to reduce personal data processing in furtherance of the Project's package discovery purposes.

3.4. **No Platform Management API Extraction.**  
The crawler does not use platform seller management APIs for catalog extraction. It crawls public web pages using polite pacing.

3.5. **Unauthenticated Guest Access.**  
The crawler is designed to operate as an unauthenticated guest. The codebase does not implement session token storage, cookie persistence across crawls, or password-gate bypass mechanisms.

---

## 4. Relationship to Original Creators

4.1. **Mandatory Outbound Storefront Deep-Routing.**  
All search results, API feeds, and database catalogs direct users to the original storefront of the creator. The "**Source Storefront URL**" is the canonical public link where the listing was published. The Project does not process payments or host rival distribution channels.

4.2. **Attribution Policy and Outbound Routing.**  
API responses preserve the Source Storefront URL for listed packages. Downstream client applications displaying Project catalog listings are required under these Terms to present this outbound link.

4.3. **Outbound Link Hygiene.**  
The pipeline strips tracking parameters, session identifiers, and third-party affiliate tokens from outbound links.

4.4. **Creator Delisting Options.**  
Rights holders can request delisting of their packages and metadata at any time. The Project supplies non-scraping verification pathways to honor creator preferences without requiring platform credentials. See Section 9.

---

## 5. Relationship to Storefront Platforms

5.1. **Search Engine Crawling Operational Model.**  
The Project indexes public metadata using standard web discovery practices:
- **(a) Robots Exclusion Protocol as Operational Signal:** The crawler voluntarily honors `robots.txt` under IETF RFC 9309 as an access preference signal. RFC 9309 states that robots rules are not a form of access authorization. Compliance is an operational practice, not a contractual license. Disregarding robots directives is not characterized as necessarily unlawful, nor does compliance imply affirmative authorization.
- **(b) Unauthenticated Access:** The crawler operates strictly without authentication. Certain U.S. cases have considered the legal significance of authenticated versus unauthenticated data (*Meta Platforms, Inc. v. Bright Data Ltd.*). Those decisions are fact-specific and do not establish a universal authorization to scrape public websites.
- **(c) No Technological Barrier Circumvention:** The crawler respects access perimeters. Security challenges, CAPTCHAs, Turnstile scripts, and rate limits represent immediate technical refusals of access. The crawler stops operations on that host.
- **(d) Platform Objection and Cease-and-Desist Policy:** If a platform operator objects to indexing, the Maintainer executes this procedure: (1) pause crawling on affected domains, (2) preserve evidence of the communication, (3) review applicable terms and legal bases, (4) evaluate whether continued indexing has valid legal support, and (5) either document an agreed operational basis or permanently exclude the platform.
- **(e) Federation Preference:** Where a platform supplies an open dataset or federation API, the Project prefers that mechanism over direct page crawling.

5.2. **Platform-Specific Compliance Positions.**
- **(a) BOOTH.pm (pixiv Inc.):** The crawler accesses public listings using serialized delays (configured with a baseline of 1.5 seconds and an adaptive range of 0.8 to 5.0 seconds per host). Under Japanese Copyright Act Article 30-4 and Article 47-5, data analysis and search indexing are recognized as statutory limitations on copyright, on condition that use does not unreasonably prejudice the copyright owner. However, statutory copyright exceptions do not create affirmative contractual licenses. Pixiv Master Terms Article 14 restricts automated collection under Japanese Civil Code Article 548-2. The Project classifies BOOTH access as an unresolved, jurisdiction-dependent risk.
- **(b) Gumroad (Gumroad, Inc.):** The Project's operational assessment considers Gumroad Terms Section 14(e) (reviewed September 24, 2026, effective January 1, 2025, updated September 14, 2026, with revisions binding existing accounts on October 14, 2026). That clause addresses public search engine operators creating publicly available searchable indices, excluding caches or archives. The Maintainer does not treat this clause as an irrevocable license or statutory safe harbor, and reviews terms versions periodically. The crawler is configured with a 3.0-second serialized delay and is designed to index metadata rather than product binary files.
- **(c) Jinxxy (Jinxxy Technologies, LLC):** Jinxxy Terms (Sections 8.2 and 23, reviewed September 24, 2026) state restrictions on automated access and systematic retrieval without prior written permission. Jinxxy has not granted written permission. The Project classifies Jinxxy access as an **Unresolved Contractual Risk**. The legal effect of website terms on unauthenticated crawlers is fact-specific and jurisdiction-dependent. The Project does not assert that public accessibility automatically overrides terms. The crawler accesses public pages with serialized pacing (1.2 seconds baseline) and maintains a prompt cessation and delisting policy upon objection.
- **(d) itch.io (itch corp.):** The crawler indexes public listings with polite pacing, routing 100 percent of outbound traffic to origin itch.io pages.
- **(e) GitHub (GitHub, Inc. / Microsoft Corporation):** The Project accesses public developer REST and GraphQL APIs within documented token rate limits. Transmitting conditional `If-None-Match` / ETag validation headers represents a planned architectural optimization.
- **(f) VRCArena:** The Project avoids HTML DOM scraping against VRCArena servers to minimize infrastructure burden. It uses bilateral API federation or curated static dataset dumps.

5.3. **Platform Matrix.**  
Detailed platform access terms, robot directives, and risk classifications appear in [PLATFORM-MATRIX.md](docs/PLATFORM-MATRIX.md).

5.4. **Disclaimer of Corporate Affiliation.**  
The Project has no corporate or contractual relationship with any indexed platform. References to platforms serve compatibility and attribution purposes only.

---

## 6. Crawling and Technical Safeguards

6.1. **Robots Exclusion Protocol Compliance (IETF RFC 9309).**  
The crawler voluntarily honors RFC 9309 as an operational signal. The crawler checks `/robots.txt` before fetching URL paths, follows Disallow rules, applies longest prefix matching, and caches directives for 24 hours.

6.2. **Transparent User-Agent Identification.**  
All HTTP requests include an honest User-Agent header identifying the project and contact email:
```http
User-Agent: VRCDiscoveryBot/1.0 (+https://github.com/SlamTheDragon/vrc-package-crawler; slamthedragon@gmail.com)
```

6.3. **Host-Isolated AIMD Rate Limiting.**  
The crawler applies Additive Increase / Multiplicative Decrease (AIMD) rate limiting per hostname with randomized jitter. Configured baseline request delays range from 1.2 to 3.0 seconds depending on the host (e.g., 3.0 seconds for Gumroad, 1.5 seconds for BOOTH and itch.io, 1.2 seconds for Jinxxy). The adaptive limiter backs off upon high latency or HTTP 429 signals up to several seconds.

6.4. **No Circumvention Measures.**  
The Software contains no CAPTCHA-solving modules, residential proxy rotation networks, or browser-fingerprint spoofing scripts. It ceases requests when encountering access challenges or security perimeters.

6.5. **Network Load Minimization.**  
Pacing and connection pooling minimize server load. These measures reduce operational friction with target infrastructure.

6.6. **Logged-Out Session Air-Gap.**  
Operators must not link personal platform accounts to a crawler instance.

---

## 7. Intellectual Property, Metadata, and Visual Search Indexing

7.1. **Factual Metadata vs. Compilation Rights.**  
Individual factual data do not constitute protected expression under 17 U.S.C. Section 102(b) and Philippine RA 8293 Section 175. However, original schema design, categorization taxonomy, and compilation structures may receive copyright protection as compilations under Philippine RA 8293 Section 173.2. Project compilation rights do not grant ownership of underlying third-party facts.

7.2. **Visual Search Indexing and Media Pointers.**  
The visual search pipeline operates under these legal and technical boundaries:
- **(a) Transformative Fair Use Precedents:** In *Kelly v. Arriba Soft Corp.* (336 F.3d 811), the Ninth Circuit held under the specific facts of that case that an image search engine's display of low-resolution thumbnails constituted transformative fair use. In *Authors Guild v. Google, Inc.* (804 F.3d 202), the Second Circuit held that displaying short text snippets to enable book search was transformative and non-substituting under specific facts. The Project does not treat these decisions as establishing universal safe harbors for arbitrary media extraction.
- **(b) The Server Test and Circuit Split:** In *Perfect 10, Inc. v. Amazon.com, Inc.* (508 F.3d 1146), the Ninth Circuit adopted the Server Test. The court held that inline linking to or framing third-party hosted images does not constitute direct copyright infringement of the display right where the image file is not stored on the defendant's server. However, other courts (e.g., *Goldman v. Breitbart News Network, LLC*, 271 F. Supp. 3d 495, and *Nicklen v. Sinclair Broadcast Group, Inc.*, 551 F. Supp. 3d 188 in the Southern District of New York) have rejected the Server Test, holding that embedding or displaying content can infringe display rights regardless of server hosting. The Ninth Circuit itself acknowledged widespread criticism in *Hunley v. Instagram, LLC* (73 F.4th 1060). Because legal rules regarding online media display remain subject to conflicting jurisdictional authority, the Project treats media ingestion and display as an area of ongoing legal uncertainty.
- **(c) Direct Origin Media Pointer Policy (Implementation Lag Asterisk):** The Project policy aims to serve direct source links to original creator media instead of rehosting third-party image files. This direct pointer architecture eliminates server storage and aligns with display-rights jurisprudence. However, the current code implementation lags behind this architectural policy. The crawler currently stores low-resolution WebP thumbnails in the SQLite database (`media_cache.webp_data`) while computing BlurHash and pHash-64 digests. The Maintainer treats local thumbnail storage as an operational risk under jurisdictions that reject the Server Test. The project roadmap and `TODO.md` queue the removal of persistent image caching (CR-19 and CR-21) to complete migration to direct origin URLs. The Maintainer deletes cached media records upon verified delisting requests.

7.3. **Compilation Rights Limits.**  
The Maintainer claims compilation rights in Project schema and taxonomy designs, but disclaims ownership of third-party names, descriptions, or prices.

---

## 8. Data Privacy and Statutory Rights

8.1. **Data Minimization Policy.**  
The Software is configured to collect public listing metadata for package discovery. As an internal data minimization measure, the crawler is designed to exclude buyer identities, payment records, private messages, user biographies, and personal social accounts. Public availability does not by itself determine whether information constitutes personal data or whether privacy obligations apply.

8.2. **Lawful Basis Analysis.**  
Where applicable, the Maintainer may rely on legitimate interests or another lawful basis recognized by applicable privacy law (such as Section 12 of Philippine Republic Act No. 10173 or GDPR Article 6(1)(f)). The Maintainer assesses lawful bases according to the jurisdiction and processing activity, subject to balancing tests against individual rights.

8.3. **Territorial Scope of GDPR.**  
Where GDPR applies to the relevant processing under Article 3 territorial scope, data subjects may exercise rights under Articles 15 through 21, subject to statutory conditions and exemptions.

8.4. **Privacy Channel.**  
Data subjects can submit privacy inquiries or requests to `slamthedragon@gmail.com` with subject `[Privacy Request]`. The Maintainer aims to acknowledge requests within 48 hours.

8.5. **Downstream Telemetry Guidelines (Schema 5).**  
Downstream applications submitting telemetry or curation payloads are instructed not to include user account credentials, personal identifiers, or session tokens. Application-level telemetry schemas are intended to minimize identifiable information, distinguished from standard web server or reverse proxy network logs maintained for security and rate limiting.

8.6. **Jurisdiction Privacy Matrix.**  
- **Philippines (RA 10173):** Legitimate purpose and proportionality under Section 12.
- **EU / EEA (GDPR):** Article 6(1)(f) balancing test where territorial scope applies.
- **Other Regions:** Evaluated under applicable statutory provisions upon notice.

---

## 9. Creator and Rights-Holder Delisting Requests

9.1. **Delisting Requests and Scope.**  
Storefront creators and rights holders can request exclusion of their listings and metadata from the Project catalog. The Project supplies non-scraping verification paths that do not require platform credentials.

9.2. **Designated Delisting Contact.**  
Delisting requests should be sent to:
- **Contact:** SlamTheDragon
- **Email:** `slamthedragon@gmail.com`
- **Subject:** `[Delisting Request] <Storefront or Package Name>`

9.3. **Notice Information.**  
Requests should include:
- Name and contact information.
- Identification of listings or package identifiers.
- Storefront URLs to remove.
- Confirmation of creator or authorized representative status.

9.4. **Non-Scraping Technical Verification Pathways.**  
The Project architecture specifies three non-scraping verification pathways:
- DNS TXT record (`vrc-opt-out=<vendor-id>`) on the creator domain.
- Signed Git commit from a verified repository account.
- Direct email verification from an official author domain.

9.5. **Automated Delisting Roadmap.**  
The Project architecture prioritizes an automated delisting route (`POST /v1/opt-out`) to validate machine-readable verification proofs without manual overhead. Supported proofs include domain DNS TXT records, signed repository commits, and domain email tokens. Pending complete production rollout of the automated endpoint, delisting requests are processed directly via the designated email contact in Section 9.2.

9.6. **Delisting Response Target and Scope.**  
The Maintainer aims to process verified requests within a voluntary 24 to 48 hour operational target.
- **Within Maintainer Control:** Upon verification, matching records in systems under Maintainer control are updated to `lifecycle = 'delisted'` and excluded from canonical API feeds, future database exports, and active discovery queues.
- **Outside Maintainer Control:** The Maintainer cannot remove or guarantee deletion of records from independent downstream databases, third-party caches, search engines, mirrors, archives, or previously distributed SQLite database files. Downstream operators are requested to honor delisting indicators present in updated feeds.

9.7. **Repeated Valid Delisting and Rights Complaints.**  
If an origin receives repeated valid rights complaints, the Maintainer will permanently suppress that origin from discovery queues.

9.8. **Account-Based Functions Out of Scope.**  
Account-based claims and profile editing belong to external applications. The Project does not supply in-band user authentication.

9.9. **Notice Regarding Statutory Safe Harbors.**  
The Maintainer has not registered a designated agent under 17 U.S.C. Section 512(c)(2). The Maintainer does not represent that the Project qualifies for DMCA statutory safe harbor protections. The Project maintains a voluntary delisting policy. It considers the principles of Section 30 of Philippine Republic Act No. 8792 without asserting statutory immunity.

---

## 10. Downstream Programmatic Catalog and API Covenants

10.1. **Notice and Contractual Intention.**  
The Maintainer intends these Terms to govern access to and redistribution of Maintainer-controlled catalog feeds, API endpoints, and database exports. The Maintainer does not assert that browsing, downloading, or querying automatically creates an enforceable contract in all jurisdictions. Enforceability depends on applicable contract law, reasonable notice, and valid manifestation of assent (*Register.com, Inc. v. Verio, Inc.*). Architectural specifications call for downstream operators and production deployments to configure technical notice via the `X-Catalog-Terms-Of-Use` header:
```http
X-Catalog-Terms-Of-Use: https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md
```
Downstream consumers who do not assent to these terms are requested not to access, query, or redistribute Maintainer-controlled catalog outputs.

10.2. **Mandatory Source Storefront Deep-Linking.**  
Downstream applications must preserve and prominently display direct outbound links to the Source Storefront URL for every listed package.

10.3. **Prohibition of Commercial Interception and Paywalls.**  
Downstream consumers must not strip Source Storefront URLs, insert affiliate tracking tokens, intercept checkout flows, or place factual listings behind paywalls.

10.4. **Description Limits and Functional Snippet Covenant.**  
- **(a) Factual Fields:** Package names, identifiers, version numbers, prices, and canonical storefront URLs may be redistributed under these Terms.
- **(b) Short Functional Summaries:** Downstream applications may display only short functional summaries or lead-text metadata extracted by the Project for package discovery. Downstream applications agree not to redistribute complete creative marketing copy or product lore.
- **(c) Prohibition on Downstream Scraping:** Downstream applications agree not to use Project feeds as an automated staging index to scrape full creative texts or proprietary media from origin storefront platforms.

10.5. **Platform Session Air-Gap Policy.**  
As an operational security covenant, downstream applications integrating Project feeds are prohibited from querying host storefront platforms on behalf of users using automated accounts or passing logged-in user session cookies through Project endpoints.

10.6. **Community Curation Reports (Schema 4).**  
The endpoint `POST /v1/reports` accepts structured curation reports. When configured in production, bearer authentication via `API_SECRET_TOKEN` can restrict administrative submissions. Received reports are placed in a `'pending'` queue to allow verification before lifecycle state changes occur.

10.7. **Database Export Metadata Specification.**  
Architectural specifications require exported SQLite databases (`vrc_catalog.db`) to include a `catalog_metadata` table recording `terms_version`, `terms_url`, `terms_hash`, `export_timestamp`, and license references to supply downstream consumers with in-band notice.

10.8. **Definition of Downstream Recipient.**  
A "**Downstream Recipient**" includes:
- Direct API consumers querying Project HTTP endpoints.
- Distributors who mirror or host exported catalog databases.
- Cached feed redistributors.
- End-user search applications integrating catalog data.

10.9. **Downstream Operator Responsibility.**  
To the extent permitted by applicable law, a downstream operator is responsible for claims arising from its own modification, deployment, redistribution, or misuse of Project outputs, including violations of these Terms.

---

## 11. Restrictive Use Covenants and Anti-AI Terms

11.1. **Community Anti-AI Covenant and API Access Policy.**  
The Maintainer establishes an ethical community covenant and operational access policy for Project-controlled services. Users must not query, scrape, or ingest Maintainer endpoints, metadata feeds, or database files to train generative artificial intelligence models. The Maintainer strictly prohibits automated bots from querying Project APIs to build AI training datasets.

To the extent recognized by applicable law, the Maintainer reserves all rights regarding automated extraction for AI model training. This policy aligns with machine-readable reservation frameworks, such as Directive (EU) 2019/790 Article 4(3). Project endpoints and catalog exports communicate machine-readable reservations (`noai`, `noimageai`).

This condition governs Maintainer-controlled services and distributed catalog files. It does not apply to independent operators who run the AGPLv3 source code on private infrastructure. It does not alter or restrict any rights granted under the GNU Affero General Public License v3.0.

11.2. **Downstream Pass-Through Covenant.**  
Downstream distributors must pass this anti-AI training restriction to further downstream recipients of Project catalog feeds.

11.3. **Open-Web Discovery Policy.**  
The Software avoids open-web unindexed crawling. Discovery expands strictly through federated registry seeds, community manifests, and verified package indices.

11.4. **Avatar Cosmetics Taxonomy Isolation.**  
Standalone avatar cosmetics are separated from the primary toolchain catalog to minimize SimHash false merges. Downstream tools must preserve this taxonomy separation.

---

## 12. Independent Operator Covenants

12.1. **Independent Operator Status.**  
Anyone who compiles, deploys, runs, or modifies instances of the Software acts as an independent software operator.

12.2. **Compliance Responsibilities.**  
Each operator assumes sole legal responsibility for:
- Verifying crawler compliance with local, federal, and international laws.
- Obeying target platform terms and acceptable use policies.
- Monitoring network load placed on target hosts.
- Maintaining valid contact details in User-Agent headers.
- Maintaining logged-out guest status.

12.3. **Disclaimer of Maintainer Control.**  
The Maintainer has no control over independent deployments and disclaims liability for independent operator actions.

---

## 13. Disclaimer of Affiliation, Trademarks, and Feedback

13.1. **Independent Non-Commercial Status.**  
At the time of publication, the Project is operated as an independent, non-commercial open-source project. It is not sponsored or endorsed by commercial platforms.

13.2. **Platform Disclaimers.**  
The Project has no corporate relationship with VRChat Inc., Unity Technologies, pixiv Inc., Gumroad, Inc., Jinxxy Technologies, LLC, itch corp., GitHub, Inc., Cloudflare, Inc., or VRCArena.

13.3. **Third-Party Trademarks.**  
All trademarks belong to their respective owners. "VRChat", "Unity", "BOOTH", "pixiv", and "GitHub" are trademarks of their respective holders.

13.4. **Nominative Fair Use and Branding Restriction.**  
Third-party trademarks are referenced strictly to identify compatibility, source platforms, or indexed packages, consistent with nominative fair use principles (see *New Kids on the Block v. News America Publishing, Inc.*, 971 F.2d 302 under U.S. law, and Section 148 of Philippine Republic Act No. 8293). Third-party marks must not be used as Project branding or in any manner implying endorsement or affiliation.

13.5. **Unsolicited Feedback.**  
Feedback submitted regarding the Project may be used freely by the Maintainer without obligation or compensation.

---

## 14. Conspicuous Disclaimers of Warranties

14.1. **"As Is" and "As Available".**  
THE SOFTWARE, TOOLS, APIS, EXPORTED CATALOGS, AND INDEXED METADATA ARE SUPPLIED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITH ALL FAULTS AND DEFECTS. ACCESS AND USE OCCUR AT YOUR SOLE RISK.

14.2. **Exclusion of Implied Warranties.**  
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE MAINTAINER AND CONTRIBUTORS DISCLAIM ALL WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.

14.3. **Storefront and Metadata Disclaimer.**  
WE DO NOT WARRANT THAT APIS WILL OPERATE UNINTERRUPTED OR THAT THIRD-PARTY METADATA WILL BE ACCURATE, COMPLETE, OR CURRENT. TARGET PLATFORM ACCESS POLICIES MAY CHANGE AT ANY TIME.

14.4. **Statutory Rights Reservation.**  
CERTAIN JURISDICTIONS DO NOT ALLOW EXCLUSIONS OF CERTAIN WARRANTIES. PROVISIONS APPLY TO THE MAXIMUM EXTENT PERMITTED UNDER APPLICABLE LAW.

---

## 15. Conspicuous Limitation of Liability

15.1. **Damages Exclusion.**  
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE MAINTAINER OR CONTRIBUTORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, PUNITIVE, OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR BUSINESS INTERRUPTION.

15.2. **Monetary Liability Cap.**  
TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, TOTAL AGGREGATE LIABILITY OF THE MAINTAINER AND CONTRIBUTORS FOR ALL CLAIMS RELATING TO THE PROJECT OR CATALOGS SHALL NOT EXCEED FIFTY UNITED STATES DOLLARS ($50.00 USD) OR THE AMOUNT ACTUALLY PAID BY YOU TO THE MAINTAINER IN THE PRECEDING SIX MONTHS.

15.3. **Carve-Out for Non-Waivable Liabilities.**  
NOTHING IN THESE TERMS LIMITS LIABILITIES THAT CANNOT BE LAWFULLY EXCLUDED UNDER APPLICABLE LAW, INCLUDING GROSS NEGLIGENCE, INTENTIONAL MISCONDUCT, OR NON-WAIVABLE CONSUMER RIGHTS.

15.4. **Essential Allocation of Risk.**  
THE DISCLAIMERS AND LIMITATIONS OF LIABILITY REFLECT A FAIR ALLOCATION OF RISK SUITABLE FOR NON-COMMERCIAL OPEN-SOURCE CATALOG DISTRIBUTION.

---

## 16. Dispute Resolution and Choice of Forum

16.1. **Informal Negotiation Period.**  
Before initiating formal legal proceedings, parties agree to attempt informal resolution in good faith for thirty (30) days by delivering written notice to `slamthedragon@gmail.com`.

16.2. **Exceptions to Negotiation.**  
The informal negotiation requirement does not apply to statutory limitation deadlines, regulatory complaints, emergency privacy requests, preservation orders, copyright delisting notices, or urgent applications for equitable relief.

16.3. **No Commercial Arbitration Mandate.**  
These Terms do not mandate binding commercial arbitration. Institutional arbitration imposes disproportionate financial burdens on an individual open-source developer.

16.4. **Governing Law.**  
These Terms are governed by and construed in accordance with the substantive laws of the Republic of the Philippines (including Republic Act No. 8293, Republic Act No. 8792, Republic Act No. 10173, and Republic Act No. 386 Civil Code Article 1306), without regard to conflict of law principles.

16.5. **Forum Selection.**  
Subject to mandatory statutory rights under applicable local laws, legal proceedings arising out of these Terms or Project catalog outputs must be brought in courts of competent jurisdiction located in the Republic of the Philippines.

16.6. **Equitable Relief.**  
Either party may seek emergency injunctive or equitable relief in any court of competent jurisdiction to protect intellectual property or confidential information.

---

## 17. Consumer and Regional Regulatory Notices

17.1. **California Consumer Notice (Cal. Civ. Code § 1789.3).**  
California residents can contact the Maintainer at `slamthedragon@gmail.com`. The Complaint Assistance Unit of the California Department of Consumer Affairs may be contacted at 1625 North Market Blvd., Sacramento, CA 95834, or (800) 952-5210.

17.2. **Regional Privacy Disclosures.**  
Residents of California, Virginia, Colorado, Connecticut, and other states possess statutory rights regarding personal data. The Project does not sell personal data or engage in behavioral profiling. Eligible residents can submit requests under Section 8.4.

---

## 18. Miscellaneous Provisions

18.1. **Survival.**  
Provisions regarding intellectual property, disclaimers, limitations of liability, dispute resolution, and covenants survive termination of access.

18.2. **Severability.**  
If any provision is held invalid or unenforceable under applicable law, it shall be reformed to the minimum extent necessary, and remaining provisions remain in effect.

18.3. **Terms Modifications and Catalog Versioning.**  
The Maintainer may update these Terms by posting revisions with an updated Effective Date. Exported catalogs are specified to record `terms_version` and `terms_hash` in the `catalog_metadata` table. Enforceability of modifications depends on reasonable notice and applicable contract law.

18.4. **Terms Precedence.**  
In the event of conflict:
1. Mandatory applicable law controls.
2. For source code, AGPLv3 controls all rights granted by that license.
3. Third-party materials remain subject to applicable platform or creator terms.
4. These Catalog Terms govern Project-controlled catalog outputs to the extent authorized by law.

18.5. **Entire Agreement.**  
These Terms constitute the entire agreement between the Maintainer and users regarding Project-controlled catalog outputs, superseding prior communications on that subject.

18.6. **Official Maintainer Contact.**  
- **Maintainer:** SlamTheDragon
- **Email:** `slamthedragon@gmail.com`
- **Repository:** `https://github.com/SlamTheDragon/vrc-package-crawler`

---

## Appendix A: Table of Authorities and Statutory Compendium

### 1. Factual Metadata and Compilation Copyright
- *Feist Publications, Inc. v. Rural Telephone Service Co.*, 499 U.S. 340 (1991). Raw facts lack original creative authorship. Only original selection and arrangement receive compilation protection.
- 17 U.S.C. Section 102(b). Copyright protection does not extend to ideas, procedures, systems, methods of operation, or raw facts.
- 37 C.F.R. Section 202.1(a). Words and short phrases such as names, titles, and slogans, or mere listing of ingredients or contents, are not subject to copyright.
- Republic Act No. 8293, Section 175 (Phil.). Copyright does not subsist in ideas, systems, methods, or mere data of itself.
- Republic Act No. 8293, Section 173.2 (Phil.). Collections of data that by reason of selection and arrangement constitute intellectual creations receive compilation copyright.
- *Field v. Google, Inc.*, 412 F. Supp. 2d 1106 (D. Nev. 2006). Evaluated search engine caching and indexing previews as transformative fair use where the system allowed users to assess relevance and honored standard technical exclusion signals.
- *Authors Guild v. Google, Inc.*, 804 F.3d 202 (2d Cir. 2015). Held that displaying limited search snippets of scanned books constituted transformative fair use because snippets did not provide a market substitute for the expressive work.

### 2. Visual Search Indexing and Server Doctrines
- *Kelly v. Arriba Soft Corp.*, 336 F.3d 811 (9th Cir. 2003). Held, under specific factual circumstances, that an image search engine's display of low-resolution thumbnail images constituted transformative fair use under 17 U.S.C. § 107 because thumbnails served as functional search locators rather than artistic substitutes. The decision did not establish a blanket rule for all thumbnail creation or caching.
- *Perfect 10, Inc. v. Amazon.com, Inc.*, 508 F.3d 1146 (9th Cir. 2007). Established the Server Test within the Ninth Circuit, holding that inline linking to or framing third-party photographic images does not constitute direct copyright infringement of the display right where the images are not stored on the defendant's server. This doctrine is subject to a recognized circuit split.
- *Goldman v. Breitbart News Network, LLC*, 271 F. Supp. 3d 495 (S.D.N.Y. 2018). Rejected the Server Test, holding embedding can infringe display rights even when content is hosted remotely.
- *Nicklen v. Sinclair Broadcast Group, Inc.*, 551 F. Supp. 3d 188 (S.D.N.Y. 2021). Reaffirmed rejection of the Server Test for web embeds.
- *Hunley v. Instagram, LLC*, 73 F.4th 1060 (9th Cir. 2023). Maintained the Server Test in the Ninth Circuit, acknowledging criticism from other jurisdictions.

### 3. Computer Access Law and Public Web Data
- *Van Buren v. United States*, 593 U.S. 374 (2021). Interpreted the Computer Fraud and Abuse Act (18 U.S.C. § 1030(a)(2)) under a gates-up versus gates-down framework, holding that liability attaches to accessing areas where technical barriers block access, not to misusing information within permitted areas. The decision addressed database misuse by an authorized user and did not directly evaluate automated web crawlers.
- *hiQ Labs, Inc. v. LinkedIn Corp.*, 31 F.4th 1180 (9th Cir. 2022). Held, on preliminary injunction review in the Ninth Circuit, that accessing publicly available web data without bypassing technical access barriers does not constitute access without authorization under the CFAA. The court did not decide common-law breach of contract or state law claims.

### 4. Contractual Enforceability and Web Scraping
- *Meta Platforms, Inc. v. Bright Data Ltd.*, No. 3:23-cv-00077-EMC, 2024 WL 245903 (N.D. Cal. Jan. 23, 2024). Summary judgment holding that Meta failed to establish breach of contract where the scraper collected public data while logged off, under the specific wording of Meta's Terms of Service and record evidence. The decision is fact- and contract-specific and does not establish a universal authorization to scrape public websites.
- *Register.com, Inc. v. Verio, Inc.*, 356 F.3d 393 (2d Cir. 2004). Held that repeated automated queries submitted with actual knowledge of terms of use can form an enforceable contract where the user proceeds after receiving clear notice of the conditions.
- *Southwest Airlines Co. v. Kiwi.com, Inc.*, No. 3:21-cv-00098, 2021 WL 4952481 (N.D. Tex. Oct. 25, 2021). Enforced website terms against a ticket aggregator that had actual notice of terms via cease-and-desist correspondence and repeatedly checked affirmative agreement boxes during transactions.

### 5. Statutory Exceptions in Japan
- Copyright Act of Japan, Act No. 48 of 1970, Article 30-4. Permits exploitation for information analysis where use does not intend enjoyment of creative expression, on condition that use does not unreasonably prejudice the copyright owner. It is a copyright limitation, not a defense to breach of contract.
- Copyright Act of Japan, Act No. 48 of 1970, Article 47-5. Permits minor exploitation for computerized information retrieval, on condition that use does not unreasonably prejudice the copyright owner. It does not confer an affirmative contractual license.
- Civil Code of Japan, Act No. 89 of 1896, Article 548-2. Governs incorporation and enforceability of Standard Form Contracts.

### 6. Technical Standards
- IETF RFC 9309, *Robots Exclusion Protocol* (Sept. 2022). Formalizes robots.txt syntax and caching rules. Affirms that robots rules represent operator preferences, not legal access authorization.
- IETF RFC 9110, *HTTP Semantics* (June 2022). Defines HTTP header fields and status codes.

### 7. Online Intermediaries and Privacy Frameworks
- 17 U.S.C. Section 512(d). DMCA statutory limitation on liability for information location tools, conditioned on compliance with statutory prerequisites including designated agent registration under Section 512(c)(2). Not asserted as an established safe harbor.
- Republic Act No. 8792, Section 30 (Phil.). Electronic Commerce Act provisions regarding network service providers and directories. Referenced as policy guidance rather than established statutory immunity.
- Republic Act No. 10173, Section 12 (Phil.). Data Privacy Act processing criteria for personal information, including legitimate interests under Section 12(f), subject to balancing tests.
- Regulation (EU) 2016/679 (GDPR), Articles 3, 6(1)(f), and 15-21. Governs territorial scope, legitimate interests lawful basis, and data-subject rights, applicable where territorial scope criteria under Article 3 are satisfied.

### 8. Trademarks and Nominative Fair Use
- *New Kids on the Block v. News America Publishing, Inc.*, 971 F.2d 302 (9th Cir. 1992). Formulated the nominative fair use test under U.S. trademark law, permitting reference to a third-party mark where: (1) the product or service is not readily identifiable without use of the mark, (2) only so much of the mark is used as is reasonably necessary, and (3) user does nothing suggesting sponsorship or endorsement.
- Republic Act No. 8293, Section 148 (Phil.). Establishes that trademark registration does not entitle the owner to prohibit third-party bona fide use of indications for purely informative or identification purposes.
