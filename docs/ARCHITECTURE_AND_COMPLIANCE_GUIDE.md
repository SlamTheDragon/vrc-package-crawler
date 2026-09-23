# Architecture and Legal Compliance Guide for VRChat Asset Discovery Indexers
This guide will define the systems architecture, legal boundaries, and community norms for indexing VRChat assets across digital storefronts.

***

## 1. Executive Summary and Foundational Invariants

Virtual reality (VR) content discovery will require careful balance. Creators will produce 3D avatars, clothing items, shaders, and development tools. These assets will reside across fragmented marketplaces: BOOTH.pm, Gumroad, Jinxxy, itch.io, and GitHub.

A compliant discovery engine will index metadata to help users find tools and assets. The engine will not harvest or mirror proprietary creative files.

To operate within legal bounds and maintain community trust, indexers will obey three foundational invariants:

1. **The Zero-Binary Invariant**: The indexer will never download, cache, or redistribute compiled 3D meshes, textures, `.unitypackage` bundles, `.fbx` models, or executable scripts.
2. **The Metadata-Only Boundary**: The engine will collect only public factual attributes: titles, tags, prices, platform compatibility flags, and store URLs.
3. **The Canonical Traffic Invariant**: All outbound clicks will route users directly to the original creator storefront for transactions.

```mermaid
flowchart TD
    A["Public Storefronts & APIs"] --> B["Polite Fetcher (AIMD & Token Bucket)"]
    B --> C["Metadata Extraction & Parser"]
    C --> D["Entity Resolution & SimHash Deduplication"]
    D --> E["SQLite Observation Lake (WAL Mode)"]
    E --> F["Derived Entity Projections (Clean Catalog)"]
    F --> G["Public Discovery Search Index"]
    G --> H["Direct Outbound Link to Creator Store"]
```

The system will preserve creator economic rights and will direct commercial intent to artists[^1].

---

## 2. Cross-Platform Contractual and Technical Terms

Every commercial storefront will enforce distinct acceptable use policies and security defenses[^2].

| Platform | Contractual Crawling Policy | API Access Model | Perimeter Defense | Policy on Machine Learning Datasets |
| :--- | :--- | :--- | :--- | :--- |
| **Jinxxy** | Prohibited without written consent | Official REST API required | Automated IP throttling and rate caps | Expressly prohibited in all tiers |
| **Gumroad** | Prohibited in Terms of Service | REST API v2 for sellers | Edge rate limits and bot challenges | Restricted by creator licenses |
| **BOOTH.pm** | Article 14 bars unapproved use | Closed: no public read API | Cloudflare Managed Challenges | Prohibited across pixiv services |
| **GitHub** | Scraping web UI banned | High-throughput REST and GraphQL APIs | Strict token rate quotas | User code protected by Terms |
| **itch.io** | Service disruption terms apply | REST API available | CDN challenge gates and throttling | Governed by creator licenses |

### Jinxxy
Jinxxy operates a specialized marketplace for VRChat avatars and accessories. Section 6.7 of the Jinxxy Terms of Service will prohibit automated data collection without written authorization[^3]. Scraping platform HTML pages will trigger rate limits and IP bans.

Jinxxy will require developers to query its official REST API. Developers will register their application and will obey rate limits.

Section 8.3 of the Jinxxy Purchase Agreement will explicitly ban the use of platform assets for artificial intelligence or machine learning training[^4]. Crawling Jinxxy to assemble model training data will constitute a direct contractual breach.

### Gumroad
Gumroad serves creators who sell digital 3D models and Unity tools. The Gumroad Terms of Service will prohibit accessing services via automated scrapers or spiders[^5].

Gumroad supplies a REST API v2. This API supports creator inventory management and order verification. Third-party crawlers that scrape public seller profiles will encounter edge firewalls and IP blocks. Indexers will pace requests and will use official seller tokens where available. Direct image hotlinking will be blocked by signed HMAC tokens and CDN origin checks.

### BOOTH.pm (pixiv Inc.)
BOOTH.pm hosts the largest collection of 3D anime avatars and accessories. Pixiv administers BOOTH under its Master Terms of Use. Article 14 classifies unauthorized reproduction of site content as prohibited conduct[^6]. Pixiv guidelines will ban automated spiders and crawlers.

Pixiv protects BOOTH with Cloudflare Managed Challenges. Automated HTTP requests will encounter browser integrity checks and cryptographic proofs of work. BOOTH does not offer an open read API for third parties.

Indexers that study public metadata will maintain strict serialization, rates below 1 request per 3 to 5 seconds, and respectful User-Agent headers.

### GitHub
GitHub hosts open-source VRChat tools, shaders, and VRChat Package Manager (VPM) repositories. GitHub Terms of Service will prohibit scraping the web interface for commercial purposes[^7].

GitHub supplies high-throughput REST and GraphQL APIs. Authenticated requests will permit 5,000 requests per hour with personal access tokens. Developers will pass personal access tokens, handle HTTP 304 cache validation with ETag headers, and download raw manifests (`package.json`) from `raw.githubusercontent.com`.

### itch.io
Itch.io hosts indie tools, shaders, and procedural worlds. Itch.io permits open distribution but will enforce server stability rules[^8]. Crawlers will respect `robots.txt` directives and will avoid server strain. Aggressive automated requests will trigger CDN rate limits.

---

## 3. Statutory Legal Foundations and Judicial Precedents

```mermaid
graph LR
    subgraph Legal Precedents
        A["Feist v. Rural (1991)"] --> D["Factual Metadata is Public"]
        B["Meta v. Bright Data (2024)"] --> E["Public Logged-Off Data Access"]
        C["Japan Copyright Art. 47-5"] --> F["Search Thumbnails & Snippets"]
    end
    D & E & F --> G["Compliant Discovery Engine"]
```

### The Non-Copyrightability of Factual Metadata
Under United States copyright law, pure product specifications are non-copyrightable facts. In *Feist Publications, Inc. v. Rural Telephone Service Co.*, the Supreme Court ruled that facts lack original authorship[^9].

Product titles, prices, release dates, and compatibility tags (such as "PhysBones", "Quest", or "Kikyo compatible") are objective facts. Indexing factual metadata will not violate copyright law.

Creative text descriptions, marketing copy, and lore remain protected by copyright. Discovery engines will not mirror full descriptions. Engines will extract structured tags and will display short summaries that link to the source. Downstream feeds will truncate descriptions to prevent tortious interference claims.

### The Computer Fraud and Abuse Act (CFAA)
In *hiQ Labs, Inc. v. LinkedIn Corp.*, the Ninth Circuit confirmed that accessing public web data does not breach the CFAA[^10]. The court ruled that when a website is open to the public, automated access does not bypass an authorization gate. The Supreme Court reinforced this principle in *Van Buren v. United States*[^11].

In *Meta Platforms, Inc. v. Bright Data Ltd.* (2024), the court granted summary judgment for Bright Data[^12]. The court ruled that platform terms prohibiting automated access do not bind users who collect public data without logging into user accounts.

These rulings protect the collection of public metadata. But crawlers will never bypass authentication gates, exploit software bugs, or overwhelm origin servers.

### Thumbnail Caching Under US and Japanese Law
Displaying preview imagery will require careful copyright compliance:
- In the United States, *Kelly v. Arriba Soft Corp.* and *Perfect 10, Inc. v. Amazon.com, Inc.* established that low-resolution search thumbnails qualify as fair use[^13],[^14].
- In Japan, Article 47-5 of the Copyright Act provides a statutory exception for search and indexing engines[^15]. Search engines can show small thumbnails and text excerpts incidental to information retrieval.

However, Article 47-5 contains a proviso barring actions that unreasonably prejudice the economic interests of the copyright holder. Pixiv Master Terms ban automated data extraction. US fair use doctrines will not apply within Japanese jurisdiction. Discovery engines will maintain conservative, human-paced request rates (3 to 5 second delays) on `booth.pm`. Direct hotlinking will fail due to referer verification and CDN HMAC tokens. The engine will deploy an ephemeral in-memory proxy that streams downscaled buffers without persistent R2 storage.

---

## 4. Creator Norms, Asset Ripping, and the Anti-AI Mandate

Engineers will understand the community distinction between discovery indexing and asset ripping:

```mermaid
flowchart TD
    subgraph Malicious Actions
        M1["Asset Ripping / Mining"] --> M2["Rip 3D Meshes from Unity Packages"]
        M3["Runtime Memory Dumping"] --> M4["Extract Decrypted Client Cache"]
        M5["AI Ingestion"] --> M6["Train Generative 3D Models"]
    end
    subgraph Legitimate Discovery
        L1["Discovery Indexing"] --> L2["Extract Public Metadata"]
        L3["Thumbnail Proxy"] --> L4["Serve Low-Res Scaled Image"]
        L5["Direct Link"] --> L6["Send Buyer to Artist Store"]
    end
```

### The Semantic Boundary: Indexing Versus Ripping
In software engineering, "scraping" means reading text via HTTP requests. In the VRChat community, "scraping" or "ripping" describes the theft of 3D assets:
- **Asset Ripping**: Extracting compiled 3D meshes, textures, and armatures from `.unitypackage` archives to bypass commercial license fees.
- **Runtime Dumping**: Intercepting decrypted assets directly from VRChat client RAM.
- **Discovery Indexing**: Cataloging public product listings to direct commercial buyers to the vendor.

Legitimate discovery platforms will host zero 3D geometry and zero binary archives.

### The Absolute Anti-AI Mandate
VRChat creators broadly reject generative machine learning ingestion[^16]. Storefront licenses contain explicit anti-AI clauses. Creators forbid using their geometry, textures, or renders in training sets.

A discovery indexer will never feed harvested images or descriptions into artificial intelligence pipelines. Breaching this norm will destroy community goodwill and will trigger legal action.

### Frictionless Self-Service Opt-Out Systems
Indexers will supply creators with reliable tools to remove listings:
1. **The Bio-Token Scraping Limitation**: Scraper-based bio verification is inoperative because creator storefront profiles sit behind Cloudflare bot perimeters.
2. **Non-Scraping Ownership Verification**: The platform will support secondary non-scraping verification paths. Creators can verify ownership via DNS TXT records, signed Git commits, or manual ticket fallbacks.
3. **Dedicated Ingestion Endpoint**: The backend will expose a dedicated `POST /v1/opt-out` endpoint to record removal requests into `creator_opt_outs`.
4. **Instant Delisting**: The database will mark entities with `lifecycle = 'delisted'` and will drop public index projection rows.

Notice-and-takedown requests will be resolved within 24 to 48 hours.

---

## 5. Systems Architecture for Compliant Crawling

Compliant discovery pipelines will use polite request dispatchers, rate limits, and structured storage.

### Standalone Binary Roles and Process Management
The crawler topography will split operational roles across specialized binaries:
- `vrc-crawler.exe`: Autonomous harvesting daemon enforced by a single-instance `ProcessLock`. It will not accept administrative CLI subcommands.
- `vrc-monitor.exe`: Administrative CLI tool and live dashboard. Administrators will dispatch all IPC commands (`status`, `recrawl`, `project`, `stop`, `sync`, `export`) through this interface.
- `vrc-server.exe`: Read-only REST API gateway authenticated by canonical `API_SECRET_TOKEN`.
- `vrc-sync.exe`: Cloudflare edge synchronization utility.

### The Mercator Two-Level Queue Architecture
To prevent rate-limit bans, the engine will implement two-level priority and politeness queues[^17].
1. **Priority Queues (F-Queues)**: Order discovery by graph depth and content relevance.
2. **Politeness Queues (B-Queues)**: Group URLs strictly by target host (`booth.pm`, `gumroad.com`, `api.github.com`).
3. **Host Min-Heap**: Workers will pop requests from a host queue only when that host is ready.

$$\Delta \tau_{\text{host}} = \max(\text{min\_delay}, \text{retry\_after}) + \text{jitter}$$

For storefronts without explicit delay directives, the minimum delay will be 1,000 milliseconds (1.0 Hz). For BOOTH, the delay will be 3,000 to 5,000 milliseconds.

### Adaptive Poisson Freshness and Conditional Headers
The engine will maintain index freshness using a Poisson change model. The daemon will invoke `requeueStaleUrls()` on monitor loops. Upstream drivers will transmit `If-None-Match` and `If-Modified-Since` conditional headers. On response completion, workers will call `adjustAfterFetch(url, isModified, etag, lastModifiedHeader)` to adapt revisit intervals. The engine will inspect HTML responses to avoid treating Cloudflare challenge pages (`HTTP 200`) as content updates.

### RFC 9309 Robots Exclusion Protocol
The crawler will check `/robots.txt` before fetching any URL path[^18]. The parser will honor all `Disallow` rules. It will skip user carts, checkout funnels, and private account pages.

### Transparent Identification
The crawler will send a transparent `User-Agent` string:
```http
User-Agent: VRCDiscoveryBot/1.0 (+https://github.com/SlamTheDragon/vrc-package-crawler; slamthedragon@gmail.com)
```
This header will identify the project and will provide administrators a direct contact email.

### Multi-Platform Entity Resolution and Anti-Merge Rules
Software tools often exist on multiple storefronts simultaneously. The indexer will resolve duplicates using a three-tier hierarchy[^19], [^20]:
1. **Primary Anchor**: Invariant reverse-DNS package identifier (such as `com.vrchat.tool`).
2. **Secondary Anchor**: Canonical Git repository URL (`github.com/author/repo`).
3. **Tertiary Anchor**: 64-bit SimHash document fingerprints and Jaro-Winkler title similarity.

Avatar cosmetics will be excluded from generic toolchain clustering. Cosmetics share identical boilerplate vocabulary and will cause SimHash false merges. Cosmetics will require an isolated taxonomy tier with base avatar associations.

### Timestamp Confidence Rubric
The engine will record creation dates using a strict three-state confidence rubric:
- `'confirmed'`: Directly extracted from upstream platform timestamps.
- `'inferred'`: Derived from earliest release tag or commit history.
- `'unknown'`: Explicitly set to `NULL`. The engine will never substitute local crawl fetch times for missing origin publication dates.

### Media Extraction and YouTube Filtering
Storefront parsers will filter media links before forwarding to image processing pipelines. Embed URLs matching `youtube.com/embed/` or `youtu.be/` will route directly to `youtube_urls` metadata arrays. They will never pass to the Sharp worker or image proxy service.

### Discovery Scope and Ecosystem Boundaries
The engine will enforce strict discovery boundaries:
- **VRCArena**: Automated HTML DOM scraping will remain prohibited. Only bilateral API federation or static dataset ingestion with toolchain filtering will be permitted.
- **Open-Web Discovery**: Unindexed open-web spiders searching for arbitrary manifests will remain prohibited. The engine will expand discovery strictly through federated registry seeding and community manifests.

***

## References

[^1]: BOOTHPLORER, "A directory for VRChat assets on BOOTH," boothplorer.com, 2024. [Online]. Available: https://boothplorer.com

[^2]: VRChat Creator Community, "Indexing the VRChat Asset Ecosystem Across Platform Policies, Crawler Protocols, and Creator Norms," Technical Guidance Specification, 2024.

[^3]: Jinxxy, "Jinxxy Terms of Service," Section 6.7, 2024. [Online]. Available: https://jinxxy.com/terms-of-service

[^4]: Jinxxy, "Jinxxy Purchase Agreement," Section 8.3, 2024. [Online]. Available: https://jinxxy.com/purchase-agreement

[^5]: Gumroad, "Gumroad Terms of Service Agreement," 2024. [Online]. Available: https://gumroad.com/terms

[^6]: pixiv Inc., "pixiv Master Terms of Use," Article 14, 2024. [Online]. Available: https://policies.pixiv.net

[^7]: GitHub, "GitHub Acceptable Use Policies," 2024. [Online]. Available: https://docs.github.com/en/site-policy/acceptable-use-policies

[^8]: itch.io, "Terms of Service," 2024. [Online]. Available: https://itch.io/docs/legal/terms

[^9]: U.S. Supreme Court, *Feist Publications, Inc. v. Rural Telephone Service Co.*, 499 U.S. 340, 1991.

[^10]: U.S. Court of Appeals for the Ninth Circuit, *hiQ Labs, Inc. v. LinkedIn Corp.*, 31 F.4th 1180, 2022.

[^11]: U.S. Supreme Court, *Van Buren v. United States*, 141 S. Ct. 1638, 2021.

[^12]: U.S. District Court for the Northern District of California, *Meta Platforms, Inc. v. Bright Data Ltd.*, Case No. 3:23-cv-00077-EMC, Jan. 23, 2024.

[^13]: U.S. Court of Appeals for the Ninth Circuit, *Kelly v. Arriba Soft Corp.*, 336 F.3d 811, 2003.

[^14]: U.S. Court of Appeals for the Ninth Circuit, *Perfect 10, Inc. v. Amazon.com, Inc.*, 508 F.3d 1146, 2007.

[^15]: Agency for Cultural Affairs of Japan, "Copyright Act of Japan," Article 47-5, amended 2018.

[^16]: Automaton Media, "pixiv to tackle the issue of AI art misuse, imitation, data collection," May 2023. [Online]. Available: https://automaton-media.com/en/nongaming-news/20230511-18820/

[^17]: A. Heydon and M. Najork, "Mercator: A scalable, extensible Web crawler," *World Wide Web*, vol. 2, no. 4, pp. 219-229, Dec. 1999.

[^18]: M. Koster, G. Illyes, H. Zeller, and L. Sassman, "Robots Exclusion Protocol," IETF Standards Track RFC 9309, Sep. 2022. [Online]. Available: https://www.rfc-editor.org/info/rfc9309

[^19]: I. P. Fellegi and A. B. Sunter, "A Theory for Record Linkage," *Journal of the American Statistical Association*, vol. 64, no. 328, pp. 1183-1210, Dec. 1969.

[^20]: G. S. Manku, A. Jain, and A. Das Sarma, "Detecting Near-Duplicates for Web Crawling," in *Proc. 16th Int. Conf. World Wide Web (WWW)*, Banff, Alberta, Canada, 2007, pp. 141-150.
