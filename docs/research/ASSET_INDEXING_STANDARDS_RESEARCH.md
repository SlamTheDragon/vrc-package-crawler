# Indexing the VRChat Asset Ecosystem Across Platform Policies, Crawler Protocols, and Creator Norms

> **Historical research draft, not a current access decision (2026-09-27).** Its claims that all storefronts prohibit crawlers, its BOOTH interpretation, and its API assumptions are superseded by the dated primary-source [source access review](../scratch/current/SOURCE_ACCESS_AND_SAFETY.md) and [platform matrix](markets/PLATFORM-MATRIX.md). Do not use this draft to authorize live requests, retention, or republication.

A discovery engine for the VRChat asset ecosystem must operate within platform terms, perimeter defenses, and creator community norms.

Digital storefronts for VRChat creators restrict or ban unauthorized web scraping in their terms of service. These platforms include Jinxxy, Gumroad, itch.io, BOOTH.pm, and GitHub. They instruct developers to use official APIs or get written permission. Unapproved Document Object Model (DOM) scraping violates acceptable use policies. It causes rate limits, Cloudflare Managed Challenge blocks, and revoked credentials.

Community acceptance depends on architectural scope and accurate attribution. VRChat 3D artists, animators, and tool developers face asset piracy, unauthorized commercial reuse, and generative AI ingestion. The community separates benevolent discovery indexing from harmful asset scraping. Discovery indexing collects product titles, taxonomy tags, compatibility attributes, and canonical outbound links. Asset scraping extracts compiled 3D meshes, textures, sub-components, or raw binaries from client memory or compiled packages.

To operate an asset catalog without sanctions or community boycotts, architects must:
1. Use an API-first ingestion pipeline.
2. Enforce polite crawling intervals of at most one request per second.
3. Omit binary file archives completely.
4. Exclude creative assets from machine learning datasets.
5. Supply self-service creator opt-out mechanisms.

Services that obey these limits gain community adoption. For example, BOOTHPLORER indexes Japanese listings for Western users. Systems that copy proprietary meshes face DMCA takedowns, firewall blocks, and creator blacklists. The same risks apply to tools that hide vendor URLs or scrape data for model training.

## Cross-Platform Data Policies and Legal Constraints

Platforms that distribute avatars, clothing meshes, shaders, and Unity tools maintain distinct legal terms, technical defenses, and API provisions. Automated indexing requires compliance with acceptable use standards.

| Platform | Crawling and Scraping Terms | API Provisioning | Technical Anti-Bot Stack | Policy on AI and Machine Learning |
| :--- | :--- | :--- | :--- | :--- |
| Jinxxy | Prohibited without written permission. Forbids systematic directory compilation. | Official REST API mandatory for third-party tools. | Automated traffic inspection. IP throttling. | Expressly prohibited across all user and buyer tiers. |
| Gumroad | Prohibited in ToS. Forbids bypassing robot exclusion headers. Forbids scraping data. | Documented REST API v2 for authorized account access. | Edge rate limiting. Behavioral bot mitigations. | Restricted through platform terms and creator licenses. |
| BOOTH.pm (pixiv Inc.) | Article 14 of Master Terms bars unauthorized reproduction. Guidelines ban crawlers. | Closed platform. No public directory API exists. | Cloudflare Managed Challenges. Browser integrity checks. | Prohibited across pixiv services. Active filtering enforced. |
| GitHub | Scraping web UI banned except for open-access research and public archiving. | High-throughput REST and GraphQL APIs with access tokens. | Strict API rate limiting. Abuse detection. | Acceptable Use Policy protects code against abusive harvesting. |
| itch.io | Governed by platform disruption clauses and service load clauses. | REST API available for creators and authenticated clients. | CDN challenge gates. Automated traffic throttling. | Subject to platform acceptable use and creator licensing. |

### Jinxxy
Jinxxy started as a search and categorization directory for VRChat assets before becoming a marketplace. Section 6.7 of Jinxxy Terms of Service bars automated systems and scrapers from extracting data without written permission. This prohibition applies to bots, spiders, and offline readers. Third-party tools must use the official API. Unapproved endpoints or excessive request rates trigger API revocation.

The legal terms ban systematic data extraction to compile directories, databases, or secondary collections. Section 8.3 of the Jinxxy Purchase Agreement prohibits using hosted assets for machine learning models or AI training. Automated downloading for AI ingestion violates the contract and leads to account termination.

### Gumroad
Gumroad acts as a merchant of record for Western 3D artists. These artists sell avatar bases, clothing, and animation controllers. Gumroad Terms of Service prohibit automated access, spiders, and scrapers. The terms ban downloading page content, bypassing robots exclusion headers, and interfering with operations.

Gumroad supplies a REST API v2. This API helps sellers automate order fulfillment, inventory, and license validation. It does not offer an open catalog for third-party aggregators. Scraping creator profiles or marketplace categories triggers edge bot defenses, domain blocks, and account suspension.

### BOOTH.pm
Operated by pixiv Inc., BOOTH.pm is the primary marketplace for anime-style avatar character models. Popular bases include Manuka, Shinano, and Kikyo. The marketplace also sells compatible clothing and texture expansions. Pixiv administers BOOTH under its unified Master Terms of Use.

Article 14 classifies unauthorized reproduction or redistribution of posted information as prohibited conduct. Pixiv and FANBOX operational guidelines ban automated crawlers, scrapers, and external aggregation programs.

Pixiv enforces these rules with Cloudflare Managed Challenges. These challenges block automated HTTP requests and non-browser user agents. Because BOOTH offers no public catalog read API, third-party scraping faces IP subnet blocks. It also risks legal liability under Japanese computer access regulations.

### GitHub
GitHub hosts the code foundation for VRChat technical tooling. It hosts the VRChat Package Manager (VPM), custom shaders, UdonSharp libraries, and Unity Editor utilities. GitHub Acceptable Use Policies distinguish between official API access and web scraping. Web scraping is limited to authorized academic research and public digital archivists. Commercial data collection and user contact harvesting are prohibited.

For VRChat tooling, GitHub requires REST or GraphQL APIs with personal access tokens or OAuth applications. Developers must respect hourly rate limits. They must use HTTP conditional headers (`ETag`) for caching. They must parse machine-readable repository manifests (`package.json`, `vpm-manifest.json`). Do not scrape repository web pages.

### itch.io
Although itch.io focuses on independent video games, it hosts VRChat utilities, procedural world engines, and shader libraries. Itch.io uses an open, DRM-free model, but its legal terms bar abusive automation and server overload.

Crawlers on itch.io must obey robots exclusion standards and maintain polite request intervals. Uncontrolled automation triggers edge CDN mitigations and IP blocks. Indexing services must use developer API keys when possible.

## Boundary Between Discovery Indexing and Asset Ripping

Engineers in the VRChat ecosystem must understand a key semantic distinction. In general software, "scraping" means extracting text and metadata from HTTP markup. In the VRChat community, "asset scraping" and "asset mining" mean digital asset theft.

These terms describe purchasing an avatar package and using DCC tools to detach sub-components for commercial reuse without licenses. Tools used include Blender, Unity, or mesh extractors. Detached sub-components include sculpted head bases, hair, jewelry, or shoes.

VRChat commercial distribution licenses explicitly prohibit this practice. Standard vendor agreements mandate that users must not extract sub-components to bypass paywalls. When a developer announces an external "scraper" without clear explanation, the community often assumes the tool rips meshes from packages.

| Ecosystem Activity | Technical Target | Technical Mechanism | Legal and Community Standing |
| :--- | :--- | :--- | :--- |
| Discovery Indexing | Storefront metadata (titles, tags, pricing, canonical URLs). | HTTP crawlers, platform REST APIs, structured DOM parsers. | Community-supported if traffic routes to source. Governed by platform ToS. |
| Asset Mining or Scraping | Compiled 3D meshes, UV maps, armatures, animations. | Blender, Unity, AssetRipper, mesh isolation scripts. | Prohibited by creator licenses. Constitutes copyright infringement. |
| Runtime Avatar Ripping | Client memory caches, encrypted Unity AssetBundles. | Modified client injection, runtime memory dumping. | Criminal copyright infringement. Violates VRChat ToS. Causes community blacklisting. |
| AI Model Ingestion | High-resolution portfolio images, 3D model geometry. | Bulk image crawlers, automated geometry ingest pipelines. | Opposed by creators. Prohibited in platform agreements. |

Community sensitivity comes from battles against "ripper stores." These piracy sites extract decrypted Unity AssetBundles from client memory caches. They scrape commercial download links and redistribute pirated packages. These piracy rings harm independent sculptors who depend on sales through BOOTH and Gumroad.

Legitimate directories build trust by distinguishing their architecture from piracy sites. BOOTHPLORER shows successful discovery indexing. It indexes over 128,000 items and approximately 2,000 avatar bases as an English directory for BOOTH.pm. It hosts zero binary files (`.unitypackage`, `.fbx`, `.blend`). It redirects checkout clicks to canonical vendor shops, and it honors creator exclusion requests quickly.

In contrast, platforms like VRC Arena ban automated product scraping. VRC Arena uses manual community curation. Manual tagging makes sure that metadata accurately captures complex compatibility, licensing, and performance ratings that automated DOM parsers miss.

## Intellectual Property, Image Caching, and the Anti-AI Mandate

Deploying a discovery engine requires evaluating copyright law across jurisdictions, including the United States and Japan.

### Legal Status of Metadata Aggregation
Pure product metadata is non-copyrightable factual data under US law (*Feist Publications, Inc. v. Rural Telephone Service Co.*). Examples include titles, prices, release dates, and compatibility tags. Compatibility tags include "PhysBones", "Quest-Compatible", and avatar bases like "Kikyo" and "Manuka". Compiling factual product specifications in an index does not violate copyright law if extraction does not breach contracts.

### Textual Descriptions and Copyright Infringement
Unlike metadata, full product descriptions, marketing copy, and installation instructions are original creative works protected by copyright. Aggregators that copy complete listing descriptions onto their domains commit copyright infringement and face DMCA takedowns.

Duplicating full text descriptions also damages creator search rankings through duplicate-content indexing penalties. Discovery services must parse structured technical specifications, generate brief factual summaries, or present short fair-use snippets. They must direct users to vendor storefronts for complete documentation.

### Image Caching, Proxies, and Content Delivery Networks
Displaying preview imagery introduces copyright questions. Under US judicial precedent (*Kelly v. Arriba Soft Corp.* and *Perfect 10, Inc. v. Amazon.com, Inc.*), search engines that index and display low-resolution thumbnails for discovery qualify for fair use protection. Caching full-resolution art or video files exceeds fair use and constitutes unauthorized reproduction.

Under Japanese copyright law, Article 47-5 of the Japanese Copyright Act permits search and indexing platforms to show small thumbnail images without prior consent. The display must remain subordinate to search. It must not harm the economic interests of the copyright owner, and it must link to the original source.

Hotlinking to storefront CDNs causes bandwidth exploitation. Storefronts like BOOTH and Gumroad configure edge firewalls to block external hotlinking through HTTP Referer checks.

Compliant discovery engines generate compressed, low-resolution thumbnail proxies stored on their own edge distribution networks. This practice avoids bandwidth costs on source platforms. It avoids full-resolution copyright infringement, and it gives users necessary visual context.

### Prohibition on Generative Machine Learning
The virtual reality creator community strictly bans scraping creative assets for artificial intelligence model training. Most 3D sculptors across Jinxxy, Gumroad, and BOOTH include anti-AI clauses in their licenses.

Storefront operators embed these bans into platform policies. Jinxxy Terms of Service (Section 6.7.2) and Purchase Agreement (Section 8.3) prohibit scraping or downloading content for AI training across all users. Pixiv enforces policy revisions and technical countermeasures to stop automated scrapers from feeding user art into generative models. Any crawler that supplies indexed data or images to machine learning pipelines will face legal action, perimeter blocks, and community blacklisting.

## Systems Architecture for Compliant and Resilient Web Crawlers

Engineers who design indexing pipelines for the VRChat ecosystem must minimize origin server load. They must maintain operational transparency and obey robots exclusion directives.

| Architectural Dimension | Compliant Discovery Specification | High-Risk Pattern |
| :--- | :--- | :--- |
| User-Agent Identification | Transparent: application name, version, canonical URL, contact email. | Generic or spoofed browser headers (masquerading as Google Chrome). |
| Request Concurrency and Delay | Strict serialization. Rate cap of 1 request/second. Backoff on HTTP 429/503. | Asynchronous scraping. Burst requests exceeding origin network capacity. |
| Robots Exclusion Adherence | Real-time parsing of `/robots.txt`. Strict honoring of Disallow and Crawl-delay rules. | Ignoring robots exclusion. Parsing checkout paths, user carts, or admin portals. |
| Data Extraction Boundary | Public surface metadata, category tags, preview thumbnails, shop URLs. | Scraping compiled binary packages (`.unitypackage`, `.blend`, `.fbx`, `.cs`, AssetBundles). |
| Perimeter Challenge Response | Stop crawl immediately on Cloudflare challenges. Transition to official API. | Automated CAPTCHA solvers, proxy rotators, or browser fingerprint spoofers. |
| Data Retention Lifecycle | Ephemeral caching. Automated re-indexing to purge deleted, unlisted, or restricted items. | Indefinite archival of orphaned listings, private files, or removed products. |

### Adherence to Robots Exclusion Protocol
Crawlers must inspect `/robots.txt` before starting any ingestion job. Crawlers must obey all Disallow paths, including checkout flows, user accounts, digital delivery endpoints, and internal search interfaces.

If an operator defines a Crawl-delay directive, the crawler must throttle its request queue to match or exceed that interval. For example, crawlers must block paths for BOOTH.pm follower feeds and transaction histories.

### Transparent User-Agent Header Construction
Spoofing standard browser user agents violates acceptable use standards and triggers security flags.

Discovery crawlers must transmit a descriptive User-Agent header with platform identity, operational version, informational website, and administrative contact email (such as `User-Agent: VRCDiscoveryBot/1.0 (+https://example.org/bot; bot@example.org)`). This information allows origin site reliability engineers to contact operators before applying IP subnet bans.

### Rate Limiting and Backoff Mechanics
Parallel scraping that floods storefronts with concurrent requests degrades service quality. It violates load limits on GitHub, itch.io, and Jinxxy.

Compliant ingestion systems enforce an absolute rate ceiling of **one request per second (1.0 Hz)** per target domain. They apply randomized jitter between 250 milliseconds and 750 milliseconds to distribute traffic evenly. If an origin server returns HTTP 429 Too Many Requests or HTTP 503 Service Unavailable, the crawler must use exponential backoff and double retry intervals until origin health recovers.

### Challenge Interception and Perimeter Integrity
When an automated crawler encounters Cloudflare Managed Challenges, JavaScript challenges, or CAPTCHA barriers, the engineering team must treat this response as an explicit refusal of service.

Using anti-bot evasion tools (such as Puppeteer Stealth, residential proxies, or CAPTCHA solvers) bypasses perimeter access controls. This circumvention increases legal exposure under computer access statutes. When perimeter mitigations intercept traffic, development teams must stop DOM scraping and request official developer credentials or partner access.

## Creator Governance, Attribution, and Operational Opt-Out Standards

Community support requires social and operational governance systems that respect creator autonomy.

### Frictionless Self-Service Opt-Out Systems
Discovery catalogs must give creators an immediate self-service mechanism to remove listings. Platforms must not require protracted legal correspondence to delist stores.

Compliant platforms support streamlined verification workflows:
1. Ask the creator to insert a temporary cryptographic token into their public storefront bio or store description.
2. Require an authenticated OAuth login or confirmation email sent from the verified domain of the storefront.
3. Query the verified profile, validate the security token, and add the creator vendor ID to a global exclusion registry.

Once an opt-out occurs, the database must purge cached metadata, thumbnail proxies, and outbound links for that vendor. Subsequent crawl jobs must skip the creator inventory.

### Notice-and-Takedown Service Level Agreements
In accordance with Title II of the Digital Millennium Copyright Act (DMCA) and international copyright directives, indexing platforms must register a designated DMCA agent with the United States Copyright Office. Platforms must also supply an intellectual property intake form.

Because third parties upload pirated packages to secondary platforms, an automated indexer can ingest infringing listings. Discovery engines must maintain a strict Service Level Agreement (SLA): review and delist infringing URLs within 24 to 48 hours of receiving a verified notice from the copyright holder.

### Attribution Transparency and Traffic Integrity
Discovery engines must direct commercial intent to the creator canonical checkout funnel. Search listings must display direct, un-obfuscated URLs to the original vendor storefront.

Aggregators must avoid harmful commercial practices:
- Do not inject third-party affiliate tracking parameters into outbound links without written consent from the vendor. Unauthorized affiliate tags divert revenue from artists.
- Do not render vendor storefronts inside inline frames (`<iframe>`) or mobile web-views that strip creator branding, obscure domain certificates, or intercept telemetry.
- Do not display advertising banners, third-party product placements, or promotional badges near search results in ways that imply official endorsement or co-ownership of the 3D model.

Deploying an asset discovery engine in the VRChat ecosystem requires aligning software architecture with platform terms and community ethics. General web scraping is prohibited across Jinxxy, Gumroad, and BOOTH. But discovery aggregators succeed when they use authenticated APIs, obey robots exclusion standards, and index only surface metadata and compressed thumbnail proxies.

By isolating systems from binary 3D model distribution, banning machine learning dataset compilation, routing commercial traffic to canonical vendor storefronts, and giving creators opt-out controls, discovery platforms can index assets while maintaining creator trust.

## Works Cited

1. Jinxxy Terms of Service, https://jinxxy.com/terms-of-service
2. Gumroad Terms of Service Agreement, https://gumroad.com/terms
3. FANBOX measures to prevent unauthorized reposting of content, https://official-en.fanbox.cc/posts/8280575
4. Vickie | PC & Quest by squishymoon - Jinxxy, https://jinxxy.com/squishymoon_/VICKIEVALENTINES
5. Jinxxy Purchase Agreement, https://jinxxy.com/purchase-agreement
6. What is the deal with the gosno system? : r/VRchat - Reddit, https://www.reddit.com/r/VRchat/comments/1v8vnrk/what_is_the_deal_with_the_gosno_system/
7. Mitsuki (PC, ARKit VRCFT, GoGo Loco) by BlackJax - Jinxxy, https://jinxxy.com/BlackJax/Mitsuki
8. Roxi (PC, ARKit VRCFT, GoGo Loco) by BlackJax - Jinxxy, https://jinxxy.com/BlackJax/Roxi
9. BOOTHPLORER, https://boothplorer.com/
10. A guide on how to check 3D assets on Booth - note, https://note.com/potatovr/n/n14f11fd53be5
11. Terms of Service - HONEYLAB, https://honeylab.store/terms
12. Introducing Jinxxy Marketplace - Indexing for VRChat Avatar / Assets, https://www.reddit.com/r/VRchat/comments/qsc7ws/introducing_jinxxy_marketplace_indexing_for/
13. How to Make Money on VRChat: Creator Economy Guide (2026), https://generalistprogrammer.com/tutorials/vrchat-creator-economy-complete-money-making-guide
14. I Tracked Gumroad Hidden Signals - And Built GumRadar - Girff, https://girff.medium.com/i-tracked-gumroads-hidden-signals-and-built-gumradar-to-make-them-visible-9cc4faff8b3c
15. Service Master Terms of Use | pixiv Inc., https://policies.pixiv.net/
16. Is it wrong or illegal to make many requests, https://www.reddit.com/r/learnprogramming/comments/q89h9u/is_it_wrong_or_illegal_or_whatever_i_call_it_to/
17. vrchat-community/vpm-listing-curated - GitHub, https://github.com/vrchat-community/vpm-listing-curated
18. kurotu VPM Packages - VCC Listing, https://kurotu.github.io/vpm-repos/
19. Terms of Service - shellreps, https://shellreps.com/terms.html
20. How do I refund games? : r/itchio - Reddit, https://www.reddit.com/r/itchio/comments/1qec4k7/how_do_i_refund_games/
21. BlackJaxVR Avatar Head (ARKit Face Tracking) by BlackJax - Jinxxy, https://jinxxy.com/BlackJax/AvatarHead
22. Execute a query | The VRCArena Project, https://www.vrcarena.com/query/song
23. View tag face tracking | The VRCArena Project, https://www.vrcarena.com/tags/face%20tracking
24. Can I use images from pixiv? - Legal Answers - Avvo, https://www.avvo.com/legal-answers/can-i-use-images-from-pixiv--6016988.html
25. Collection Feature Guidelines - pixiv Help Center, https://www.pixiv.help/hc/en-us/articles/49141385024793-Collection-Feature-Guidelines
26. Vipes Bluesky profile, https://bsky.app/profile/vipes.bsky.social
27. Leah, The Huckleberry Cow | PC Only by squishymoon - Jinxxy, https://jinxxy.com/squishymoon_/LEAHHUCKLEBERRY
28. The Shia Bunnia by Shiapra - Jinxxy, https://jinxxy.com/Shiapra/bunnia
29. pixiv to tackle the issue of AI art misuse, https://automaton-media.com/en/nongaming-news/20230511-18820/
30. Scrapy or Selenium - Medium, https://medium.com/@amit25173/scrapy-or-selenium-1ec1b36d8fb8
