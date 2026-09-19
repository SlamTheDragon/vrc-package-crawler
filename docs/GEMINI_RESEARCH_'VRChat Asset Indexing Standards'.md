# **Indexing the VRChat Asset Ecosystem Across Platform Policies, Crawler Protocols, and Creator Norms**

Building a discovery engine or indexing aggregator for the VRChat asset ecosystem requires operating within a tightly constrained intersection of platform contractual terms, perimeter security defenses, and deeply protective creator community norms. Every major digital storefront serving VRChat creators—specifically Jinxxy, Gumroad, itch.io, BOOTH.pm, and GitHub—strictly restricts or explicitly prohibits unauthorized web scraping within its Terms of Service, uniformly requiring developers to rely on official application programming interfaces (APIs) or obtain prior written authorization. Systematically harvesting storefront pages through automated Document Object Model (DOM) crawlers without authorization constitutes a breach of platform acceptable use policies, triggering network-level rate limiting, Cloudflare Managed Challenge blocks, and credential termination.

At the community level, the viability of any indexing tool depends entirely on architectural scope and attribution fidelity. VRChat 3D artists, animators, and tool developers operate in an environment heavily impacted by asset piracy, unauthorized commercial re-use, and non-consensual generative artificial intelligence ingestion. As a result, the ecosystem maintains an operational mental model that strictly separates benevolent *discovery indexing*—the aggregation of product titles, taxonomy tags, compatibility attributes, and canonical storefront outbound links—from predatory *asset scraping* or *avatar ripping*, which entails extracting compiled 3D meshes, textures, sub-components, or raw binaries from client memory or compiled packages.

To operate an asset catalog legitimately without triggering platform sanctions or community boycotts, systems architects must implement an API-first ingestion pipeline, enforce polite crawling intervals of no more than one request per second, omit binary file archives entirely, exclude creative assets from machine learning datasets, and maintain frictionless creator opt-out mechanisms. Projects that adhere to these operational boundaries, such as BOOTHPLORER in bridging Japanese listings to Western audiences, gain broad adoption. Conversely, tools that replicate proprietary meshes, obscure vendor URLs, or scrape data for model training face immediate Digital Millennium Copyright Act (DMCA) takedowns, edge firewall blocks, and permanent reputational blacklisting across virtual reality creator networks.

## **Cross-Platform Data Policies and Legal Constraints**

The platforms that distribute virtual reality avatars, clothing meshes, shaders, and Unity tools maintain distinct legal frameworks, technical defenses, and API provisions governing automated access. Programmatic cataloging requires strict compliance with each vendor's acceptable use standards.

| Platform | Crawling and Scraping Terms | API Provisioning | Technical Anti-Bot Stack | Policy on AI and Machine Learning |
| :---- | :---- | :---- | :---- | :---- |
| Jinxxy | Prohibited without written permission; forbids systematic directory compilation | Official REST API mandatory for third-party tools | Automated behavioral traffic inspection and IP throttling | Expressly prohibited across all user and buyer tiers |
| Gumroad | Prohibited in ToS; forbids bypassing robot-exclusion headers or scraping data | Documented REST API v2 for authorized account access | Edge-level rate limiting and behavioral bot mitigations | Restricted via platform terms and creator license agreements |
| BOOTH.pm (pixiv Inc.) | Article 14 of Master Terms bars unauthorized reproduction; guidelines ban crawlers | Closed platform; no public directory API available | Cloudflare Managed Challenges and browser integrity checks | Prohibited across pixiv services; active filtering enforced |
| GitHub | Scraping web UI banned except for open-access research and archiving | High-throughput REST and GraphQL APIs with access tokens | Strict API rate limiting and programmatic abuse detection | Acceptable Use Policy protects user code against abusive harvesting |
| itch.io | Governed by platform disruption and service load clauses | REST API available for creators and authenticated clients | CDN challenge gates and automated traffic throttling | Subject to platform acceptable use and creator licensing |

### **Jinxxy**

Jinxxy originated as a search and categorization aggregator for VRChat assets before transitioning into a dedicated marketplace. Its operational evolution led to explicit contractual protections against unauthorized data harvesting. Section 6.7 of Jinxxy's Terms of Service bars automated systems, scrapers, bots, spiders, or offline readers from extracting data without prior written authorization. The platform mandates that any third-party tool querying its catalog must interface through its official API, warning that unapproved endpoints or excessive request frequencies will trigger permanent API revocation.

Jinxxy's legal framework explicitly bans the systematic extraction of platform data or content to compile public or private directories, databases, or secondary collections. These operational restrictions are reinforced by strict intellectual property provisions: Section 8.3 of the Jinxxy Purchase Agreement establishes that hosted assets cannot be used for machine learning models or artificial intelligence training, categorizing automated downloading for AI ingestion as a material contractual breach enforceable through automated surveillance and account termination.

### **Gumroad**

Gumroad operates as a primary merchant of record for Western 3D artists producing avatar bases, modular clothing, and dynamic animation controllers. Gumroad’s Terms of Service explicitly prohibit accessing its services through automated devices, spiders, or scrapers designed to systematically download page content, bypass robot exclusion headers, or interfere with system operations.

While Gumroad provides an authorized REST API, the interface is engineered primarily for sellers to automate order fulfillment, inventory management, and license-key validation rather than to expose an open index for third-party catalog aggregation. Crawlers attempting to bypass authenticated API channels by scraping public creator profile pages or marketplace discovery categories trigger edge-level bot defenses, risking immediate domain blocking and account suspension.

### **BOOTH.pm**

Operated by pixiv Inc., BOOTH.pm represents the central economic marketplace for the global VRChat avatar ecosystem, hosting the vast majority of anime-style character models—including standard bases such as Manuka, Shinano, and Kikyo—alongside thousands of compatible clothing items and texture expansions. Pixiv administers BOOTH under its unified Master Terms of Use. Article 14 classifies the reproduction or redistribution of posted information without express rightsholder consent as prohibited conduct. The accompanying pixiv and FANBOX operational guidelines explicitly prohibit the use of automated crawlers, scrapers, or external programs to aggregate platform content.

Pixiv enforces these policies technically through Cloudflare Managed Challenges, intercepting automated HTTP requests and blocking non-browser user agents that fail cryptographic execution challenges. Because BOOTH does not offer a public catalog read API, third-party aggregators attempting to parse BOOTH inventory operate in direct tension with pixiv’s infrastructure protections, facing active IP subnet blocking and potential civil liability under Japanese intellectual property and computer access regulations.

### **GitHub**

GitHub hosts the code-driven foundation of the VRChat technical ecosystem, serving as the central repository infrastructure for the VRChat Package Manager (VPM), custom shaders, UdonSharp libraries, and automated Unity Editor utilities. GitHub’s Acceptable Use Policies explicitly distinguish between official API interactions and automated web scraping. Web scraping is strictly limited to authorized academic researchers producing open-access publications and public digital archivists, while all commercial data collection, user contact harvesting, and server-burdening activities are barred.

For engineering teams indexing VRChat technical tooling, GitHub mandates the use of its REST or GraphQL APIs authenticated with personal access tokens or OAuth applications. Developers must respect per-hour rate-limit quotas, implement client-side caching using conditional HTTP headers (ETag), and parse machine-readable repository manifests (such as package.json or vpm-manifest.json) rather than deploying scraping scripts against repository web pages.

### **itch.io**

Although itch.io focuses primarily on independent video game releases, it hosts specialized VRChat utilities, procedural world engines, and open-source shader libraries. Itch.io operates on an open, DRM-free philosophy that minimizes vendor lock-in, yet its legal terms strictly protect server reliability by barring abusive automation and server-load exhaustion.

Crawlers operating on itch.io must adhere to standard robots exclusion standards and maintain polite request intervals. While itch.io does not enforce the aggressive commercial scraping bans found on dedicated avatar marketplaces, automated access that places undue strain on its infrastructure triggers edge CDN mitigations and automated IP blacklisting. Indexing services must leverage developer API keys for programmatic collection whenever possible.

## **The Semantic Boundary Between Discovery Indexing and Asset Ripping**

Engineers entering the VRChat space must navigate a critical semantic divide. In standard software engineering, "scraping" denotes the programmatic retrieval and extraction of text, metadata, and document markup via HTTP clients. Within the VRChat creator community, however, the terms **"asset scraping"** and **"asset mining"** refer to a severe form of digital asset theft: purchasing a compiled 3D avatar package and utilizing DCC software (Blender, Unity, or mesh extractors) to detach modular sub-components—such as sculpted head bases, custom hair meshes, sculpted jewelry, or shoe meshes—for unauthorized commercial re-use without purchasing separate commercial licenses from the original sculptors.

VRChat commercial distribution licenses uniformly contain clauses explicitly prohibiting this practice. Standard vendor agreements dictate that users may not extract sub-components to bypass vendor paywalls, mandating that secondary creators purchase standalone commercial rights directly from each underlying artist. When a developer publicizes an external "scraper" or "crawling engine" without precise context, the community frequently assumes the software is a tool designed to rip proprietary 3D meshes out of avatar bundles or unprotect Unity packages.

| Ecosystem Activity | Technical Target | Technical Mechanism | Legal and Community Standing |
| :---- | :---- | :---- | :---- |
| Discovery Indexing | Storefront metadata (titles, tags, pricing, canonical URLs) | HTTP crawlers, platform REST APIs, structured DOM parsers | Community-supported if traffic routes to source; governed by platform ToS |
| Asset Mining / Scraping | Compiled 3D meshes, UV maps, armatures, animations | Blender, Unity, AssetRipper, mesh isolation scripts | Prohibited across all creator licenses; constitutes copyright infringement |
| Runtime Avatar Ripping | Client-side memory caches, encrypted Unity AssetBundles | Modified client injection, runtime memory dumping | Criminal copyright infringement; violates VRChat ToS; community blacklisting |
| AI Model Ingestion | High-resolution portfolio images, 3D model geometry | Bulk image crawlers, automated geometry ingest pipelines | Universally opposed by creators; strictly prohibited in platform agreements |

The community's acute sensitivity to automated data collection is rooted in its ongoing battle against "ripper stores"—illicit piracy websites that ingest decrypted Unity AssetBundles directly from local client memory caches, scrape commercial file distribution links, and redistribute pirated packages for free or behind unauthorized paywalls. These piracy rings undermine the livelihood of independent 3D sculptors who rely on direct sales via BOOTH and Gumroad to sustain their production studios.

Legitimate aggregators establish trust by clearly differentiating their architectural footprint from piracy hubs. BOOTHPLORER exemplifies successful discovery indexing within this ecosystem. Indexing more than 128,000 items and approximately 2,000 avatar bases, BOOTHPLORER acts strictly as an English-language directory for BOOTH.pm listings. It hosts zero binary files (.unitypackage, .fbx, .blend), redirects all checkout clicks directly to the vendor's canonical shop page, and honors creator exclusion requests without friction.

In contrast, community platforms such as VRC Arena adopt a strict policy barring automated product scraping entirely. VRC Arena enforces a purely manual, crowd-sourced curation workflow, operating on the principle that automated web crawlers flood discovery platforms with unverified, broken, or copyright-infringing assets. Manual tagging ensures that metadata accurately reflects complex compatibility standards, licensing models, and performance ratings that automated DOM scrapers cannot reliably deduce.

## **Intellectual Property Dynamics, Image Caching, and the Anti-AI Mandate**

Deploying a discovery engine requires evaluating copyright law across multiple jurisdictions—most notably the United States and Japan—governing metadata compilations, textual descriptions, preview image caching, and machine learning restrictions.

### **Legal Status of Metadata Aggregation**

Pure product metadata—including titles, price values, release dates, and technical compatibility tags (such as "PhysBones," "Quest-Compatible," or avatar base compatibility for "Kikyo" or "Manuka")—constitutes non-copyrightable factual data under United States copyright law (*Feist Publications, Inc. v. Rural Telephone Service Co.*). Compiling and presenting factual product specifications in an indexed catalog does not violate statutory copyright protections, provided the underlying extraction does not breach valid, enforceable contractual terms or circumvention statutes.

### **Textual Descriptions and Copyright Infringement**

Unlike metadata, full-length product descriptions, marketing narratives, backstory lore, and installation instructions drafted by creators represent original creative works protected by statutory copyright. Aggregators that copy and mirror complete listing descriptions onto their own domains commit unauthorized reproduction and expose their infrastructure to DMCA takedown actions.

Furthermore, duplicating complete text descriptions dilutes the original creator's organic search engine visibility through duplicate-content indexing penalties. Legitimate discovery services avoid caching full descriptions, choosing instead to parse structured technical specifications, generate brief factual summaries, or present short snippets permissible under fair use doctrines, immediately directing the user to the vendor storefront for comprehensive documentation.

### **Image Caching, Proxies, and Content Delivery Networks**

Displaying preview imagery introduces complex technical and copyright liabilities. Under United States judicial precedent (*Kelly v. Arriba Soft Corp.* and *Perfect 10, Inc. v. Amazon.com, Inc.*), search engines that index and display low-resolution, downscaled image thumbnails to facilitate information discovery qualify for fair use protection. However, caching full-resolution promotional art, high-definition character turnarounds, or video files exceeds this protection, crossing into unauthorized reproduction.

Under Japanese copyright law, which governs works published on BOOTH.pm, discovery catalogs operate under statutory flexibilities established in Article 47-5 of the Japanese Copyright Act. This provision allows search and indexing platforms to reproduce limited excerpts and reduced-size thumbnail images without the copyright holder's prior consent, provided that the reproduction is strictly subordinate to the search function, does not unreasonably prejudice the economic interests of the copyright owner, and points directly to the canonical publication source.

Directly hotlinking to storefront Content Delivery Networks (CDNs) to avoid local caching introduces a separate operational conflict: bandwidth exploitation. Digital storefronts such as BOOTH and Gumroad routinely configure edge firewalls to block external image hotlinking via HTTP Referer validation.

Compliant discovery engines resolve this trade-off by dynamically generating heavily compressed, low-resolution thumbnail proxies stored on their own edge distribution networks. This approach minimizes bandwidth consumption on source platforms, avoids full-resolution copyright infringement, and provides users with visual context necessary for discovery.

### **The Non-Negotiable Ban on Generative Machine Learning**

The virtual reality creator community maintains an absolute, non-negotiable prohibition against scraping creative assets for artificial intelligence model training. The overwhelming majority of 3D sculptors across Jinxxy, Gumroad, and BOOTH have updated their listing licenses to include binding anti-AI restrictions. A representative community licensing clause explicitly states:

"This model, including all textures, assets, and files, may not be used for artificial intelligence training, machine learning datasets, generative AI systems, model training, dataset scraping, or any automated data collection processes".

Storefront operators have embedded these prohibitions directly into their platform policies. Jinxxy’s Terms of Service (Section 6.7.2) and Purchase Agreement (Section 8.3) establish an absolute ban on automated scraping or downloading of content for AI training, applying the restriction universally across all buyers and third parties.

Pixiv has likewise enacted site-wide policy revisions and technical countermeasures to prevent automated scrapers from feeding user art into generative models. Any discovery crawler discovered providing indexed metadata, 2D renders, or 3D geometry to machine learning research pipelines will face immediate legal action, automated perimeter blacklisting, and public exposure across the community.

## **Systems Architecture for Compliant and Resilient Web Crawlers**

Engineers designing indexing pipelines for the VRChat ecosystem must build infrastructure that minimizes origin server strain, maintains operational transparency, and strictly honors robots exclusion directives.

| Architectural Dimension | Compliant Discovery Specification | High-Risk and Non-Compliant Pattern |
| :---- | :---- | :---- |
| User-Agent Identification | Fully transparent: application name, version, canonical URL, operational contact email | Generic or spoofed consumer browser headers (e.g., masquerading as Google Chrome) |
| Request Concurrency and Delay | Strict serialization; rate cap of 1 request/second; dynamic backoff on HTTP 429/503 | Multi-threaded asynchronous scraping; burst requests exceeding origin network capacity |
| Robots Exclusion Adherence | Real-time parsing of /robots.txt; strict honoring of Disallow and Crawl-delay rules | Ignoring robots exclusion; parsing checkout paths, user carts, or authenticated portals |
| Data Extraction Boundary | Public surface metadata, category tags, low-resolution preview thumbnails, shop URLs | Scraping compiled binary packages (.unitypackage, .blend, .fbx, .cs scripts, AssetBundles) |
| Perimeter Challenge Response | Immediate crawl termination upon encountering Cloudflare challenges; transition to API | Deploying automated CAPTCHA solvers, proxy rotators, or browser fingerprint spoofers |
| Data Retention Lifecycle | Ephemeral caching; automated re-indexing to purge deleted, unlisted, or restricted items | Indefinite archival of orphaned listings, private files, or creator-removed products |

### **Adherence to Robots Exclusion Protocol**

Crawlers must inspect the /robots.txt manifest of each target platform before initiating any ingestion job. Crawlers must strictly comply with all Disallow paths—specifically avoiding checkout funnels, user administrative consoles, private digital delivery endpoints, and internal dynamic search interfaces.

If an operator defines an explicit Crawl-delay directive, the ingestion engine must throttle its request queue to match or exceed that interval. For example, parsing BOOTH.pm paths identified as user follower feeds or transaction histories is explicitly prohibited and must be blocked within crawler dispatch routers.

### **Transparent User-Agent Header Construction**

Hiding bot activity by spoofing standard consumer browser user agents (such as emitting generic Google Chrome, Mozilla Firefox, or Safari headers) violates acceptable use standards and immediately triggers perimeter security flags.

Discovery crawlers must transmit a descriptive, transparent User-Agent string detailing the platform identity, operational version, informational website, and direct administrative contact email (e.g., User-Agent: VRChatDiscoveryIndex/2.4 (+https://example-index.org/crawler-info; bot-ops@example-index.org)). This enables origin site reliability engineers to identify the source of traffic surges and contact the operator directly prior to executing firewall-level IP subnet bans.

### **Rate Limiting and Backoff Mechanics**

High-concurrency scraping routines that bombard storefronts with simultaneous parallel requests degrade service quality and violate server-load provisions across GitHub, itch.io, and Jinxxy.

Compliant ingestion systems must enforce an absolute rate ceiling—typically restricted to **one request per second (1.0 Hz)** per target domain—while implementing randomized jitter between 250 milliseconds and 750 milliseconds to distribute network traffic evenly. If an origin server responds with an HTTP 429 \[span\_136\](start\_span)\[span\_136\](end\_span)\[span\_140\](start\_span)\[span\_140\](end\_span)Too Many Requests or 503 Service Unavailable status code, the crawler must automatically initiate exponential backoff, progressively doubling retry wait intervals until origin health is verified.

### **Challenge Interception and Perimeter Integrity**

When an automated crawler encounters Cloudflare Managed Challenges, perimeter JavaScript challenges, or CAPTCHA barriers on platforms like BOOTH.pm, the engineering team must treat this as an explicit technical refusal of service.

Deploying anti-bot evasion frameworks—such as Puppeteer Stealth plugins, residential proxy networks, or automated CAPTCHA-solving farms—constitutes a deliberate circumvention of perimeter access controls. Such practices elevate the operator's legal exposure from a simple terms-of-service breach to actionable claims under statutory computer access laws. When perimeter mitigations intercept automated traffic, development teams must abandon raw DOM scraping and apply for official developer credentials or enterprise partner access.

## **Creator Governance, Attribution Integrity, and Operational Opt-Out Standards**

The technical capability to index an asset storefront does not guarantee community support. Long-term viability within the VRChat developer ecosystem requires implementing comprehensive social and operational governance systems that respect creator autonomy.

### **Frictionless Self-Service Opt-Out Systems**

Every discovery index must provide creators with an immediate, self-service mechanism to remove their listings from the catalog. Discovery platforms must never require creators to engage in protracted legal correspondence to delist their stores.

Compliant platforms provide streamlined identity verification workflows, such as:

> 1. Prompting the creator to temporarily insert a unique cryptographic token into their public storefront bio or store description.  
> 2. Requiring an authenticated OAuth login or confirmation email dispatched directly from the verified domain associated with the storefront.  
> 3. Automatically querying the verified profile, validating the security token, and permanently adding the creator’s vendor ID to a global exclusion registry.

Once an opt-out is executed, the platform's database must immediately purge all cached metadata, low-resolution thumbnail proxies, and outbound links associated with the vendor, ensuring that subsequent crawling routines skip the creator's inventory entirely.

### **Rapid Notice-and-Takedown Service Level Agreements**

In accordance with Title II of the Digital Millennium Copyright Act and international copyright directives, indexing platforms must register a designated DMCA agent with the United States Copyright Office and display an accessible intellectual property claim intake form.

Because the VRChat marketplace is heavily targeted by unauthorized third parties re-uploading pirated packages onto secondary platforms, an automated indexer will inevitably ingest infringing listings. Discovery engines must commit to a strict operational Service Level Agreement (SLA), reviewing and delisting infringing URLs within 24 to 48 hours of receiving a verified notice from the original copyright holder.

### **Attribution Transparency and Traffic Integrity**

Discovery engines must operate exclusively as traffic multipliers for independent artists, directing all commercial intent straight to the creator's canonical checkout funnel. Search listings must prominently display direct, un-obfuscated URLs leading to the original vendor storefront.

Aggregators must avoid predatory commercial practices, including:

> * Ingesting or injecting third-party affiliate tracking parameters into outbound links without the express written consent of the vendor, as unauthorized affiliate tagging diverts earned revenue from the artist.  
> * Rendering vendor storefronts inside inline HTML frames (\<iframe\>) or proprietary mobile app web-views that strip creator branding, obscure domain security certificates, or intercept customer telemetry.  
> * Running aggressive advertising banners, third-party product placements, or promotional badges in close proximity to search results in a manner that falsely implies official endorsement, sponsorship, or co-ownership of the 3D model.

Successfully deploying an asset discovery engine within the VRChat creator ecosystem requires aligning software architecture with strict platform terms and community ethics. While general web scraping is legally prohibited across Jinxxy, Gumroad, and BOOTH, discovery aggregators succeed when they transition to authenticated APIs, respect robots exclusion standards, and index only surface metadata and compressed thumbnail proxies.

By completely isolating their systems from binary 3D model distribution, enforcing an absolute ban on machine learning dataset compilation, directing all commercial traffic to canonical vendor storefronts, and providing instantaneous creator opt-out controls, discovery platforms can solve the critical problem of ecosystem fragmentation while maintaining the trust of the 3D artists who sustain it.

#### **Works cited**

1\. Jinxxy Terms of Service, https://jinxxy.com/terms-of-service 2\. Gumroad Terms of Service Agreement, https://gumroad.com/terms 3\. FANBOX's measures to prevent unauthorized reposting of content, https://official-en.fanbox.cc/posts/8280575 4\. Vickie | PC & Quest by squishymoon\_ \- Jinxxy, https://jinxxy.com/squishymoon\_/VICKIEVALENTINES 5\. Jinxxy Purchase Agreement, https://jinxxy.com/purchase-agreement 6\. What is the deal with the gosno system? : r/VRchat \- Reddit, https://www.reddit.com/r/VRchat/comments/1v8vnrk/what\_is\_the\_deal\_with\_the\_gosno\_system/ 7\. Mitsuki (PC, ARKit VRCFT, GoGo Loco) by BlackJax \- Jinxxy, https://jinxxy.com/BlackJax/Mitsuki 8\. Roxi (PC, ARKit VRCFT, GoGo Loco) by BlackJax \- Jinxxy, https://jinxxy.com/BlackJax/Roxi 9\. BOOTHPLORER, https://boothplorer.com/ 10\. A guide on how to check 3D assets on Booth｜ぽてと旅録 \- note, https://note.com/potatovr/n/n14f11fd53be5 11\. Terms of Service \- HONEYLAB, https://honeylab.store/terms 12\. Introducing Jinxxy Marketplace \- Indexing for VRChat Avatar / Assets, https://www.reddit.com/r/VRchat/comments/qsc7ws/introducing\_jinxxy\_marketplace\_indexing\_for/ 13\. How to Make Money on VRChat: Creator Economy Guide (2026), https://generalistprogrammer.com/tutorials/vrchat-creator-economy-complete-money-making-guide 14\. I Tracked Gumroad's Hidden Signals — And Built GumRadar ... \- Girff, https://girff.medium.com/i-tracked-gumroads-hidden-signals-and-built-gumradar-to-make-them-visible-9cc4faff8b3c 15\. Service Master Terms of Use | pixiv Inc., https://policies.pixiv.net/ 16\. Is it wrong or illegal or whatever I call it to make A LOT of requests to, https://www.reddit.com/r/learnprogramming/comments/q89h9u/is\_it\_wrong\_or\_illegal\_or\_whatever\_i\_call\_it\_to/ 17\. vrchat-community/vpm-listing-curated \- GitHub, https://github.com/vrchat-community/vpm-listing-curated 18\. kurotu VPM Packages \- VCC Listing, https://kurotu.github.io/vpm-repos/ 19\. Terms of Service \- shellreps, https://shellreps.com/terms.html 20\. how do i refund games? : r/itchio \- Reddit, https://www.reddit.com/r/itchio/comments/1qec4k7/how\_do\_i\_refund\_games/ 21\. BlackJaxVR's Avatar Head (ARKit Face Tracking) by BlackJax \- Jinxxy, https://jinxxy.com/BlackJax/AvatarHead 22\. Execute a query | The VRCArena Project, https://www.vrcarena.com/query/song 23\. View tag face tracking | The VRCArena Project, https://www.vrcarena.com/tags/face%20tracking 24\. Can I use images from pixiv? \- Legal Answers \- Avvo, https://www.avvo.com/legal-answers/can-i-use-images-from-pixiv--6016988.html 25\. Collection Feature Guidelines – pixiv Help Center, https://www.pixiv.help/hc/en-us/articles/49141385024793-Collection-Feature-Guidelines 26\. Vipes ( 🌩️ ) (@vipes.bsky.social) — Bluesky, https://bsky.app/profile/vipes.bsky.social 27\. Leah, The Huckleberry Cow | PC Only by squishymoon\_ \- Jinxxy, https://jinxxy.com/squishymoon\_/LEAHHUCKLEBERRY 28\. The Shia Bunnia by Shiapra \- Jinxxy, https://jinxxy.com/Shiapra/bunnia 29\. pixiv to tackle the issue of AI art misuse, imitation, data collection, https://automaton-media.com/en/nongaming-news/20230511-18820/ 30\. Scrapy or Selenium \- Medium, https://medium.com/@amit25173/scrapy-or-selenium-1ec1b36d8fb8
