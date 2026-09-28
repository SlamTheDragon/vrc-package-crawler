# Discovery and Re-audit Rules Guide

This guide defines the discovery, relevance scoring, and timestamp rules for the VRChat Package Crawler.

---

## 1. Foundational Invariants

The discovery engine will enforce three architectural rules on all discovered resources:

1. **The Zero-Binary Invariant:** The crawler will not download, store, or redistribute compiled 3D meshes, textures, `.unitypackage` bundles, `.fbx` models, or binary scripts.
2. **The Metadata-Only Boundary:** The engine will collect only public factual attributes: titles, tags, prices, platform compatibility flags, and store URLs.
3. **The Canonical Traffic Invariant:** Outbound links will route users directly to original creator storefronts for transactions.

---

## 2. Discovery Rules Matrix

| Platform | Discovery Channel | Target Queries / Topic Patterns | Ingestion Pacing | Freshness & Re-crawl Policy |
| :--- | :--- | :--- | :--- | :--- |
| **BOOTH.pm** | HTML Categories & Microdata | `VRChat`, `Unity`, `VPM`, `ModularAvatar` | 1.0 Hz (AIMD) | Cho-Garcia-Molina Poisson (24h default) |
| **GitHub** | REST API & Repository Topics | `vpm-package`, `vrchat-tool`, `modular-avatar` | 1.0 Hz (Token Bucket) | Adaptive interval with ETag HTTP 304 backoff |
| **VPM Repos** | `index.json` / `vpm.json` Manifests | Direct community repo URLs, GitHub Pages | 1.0 Hz | SHA-256 manifest hash compare |
| **Gumroad** | Profile & Product Scraping | Tag queries: `vrchat`, `vpm`, `unity-tool` | 1.0 Hz (AIMD) | 24h default interval |
| **Jinxxy** | Official REST API | Public listings: `Tools`, `Utilities` | 1.0 Hz | 24h default interval |
| **itch.io** | Tag Navigation & HTML Parser | Tags: `vrchat`, `unity-tool`, `vrc-shader` | 1.0 Hz | 24h default interval |

### Ecosystem Boundaries & Discovery Policies
- **Open-Web Discovery Policy:** The crawler will not deploy open-web unindexed spiders. Discovery will expand through federated registry seeding and community manifests.
- **VRCArena Policy:** The system will reject automated HTML DOM scraping against VRCArena. Ingestion will occur only through bilateral API federation with a strict toolchain whitelist.
- **Avatar Cosmetics Policy:** Standalone cosmetics will remain excluded to prevent SimHash false merges. If added, cosmetics will require an isolated taxonomy tier with base avatar links.

### Conditional Request Headers & Poisson Re-Crawl Mechanics (Task 3.3)
All crawler drivers (BOOTH, GitHub, etc.) maintain stateful freshness metadata (`etag` and `last_modified`) in the `frontier` table and inject HTTP conditional request headers on subsequent re-crawls:
- `If-None-Match: <stored_etag>`
- `If-Modified-Since: <stored_last_modified>`

**Poisson Scheduling Feedback Loop (Cho-Garcia-Molina Model):**
When the upstream origin responds, the crawler executes `poissonScheduler.adjustAfterFetch(url, isModified, etag, lastModified)`:
1. **Unmodified Resource (`HTTP 304 Not Modified`)**:
   - The driver skips body streaming and DOM parsing completely.
   - The re-crawl interval expands via exponential backoff: $I_{\text{next}} = \min(604800, I_{\text{current}} \times 1.5)$.
   - `frontier.next_fetch_at` is pushed further into the future, saving server and target bandwidth.
2. **Modified Resource (`HTTP 200 OK`)**:
   - If changes are detected, the interval contracts to capture frequent releases: $I_{\text{next}} = \max(3600, \lfloor I_{\text{current}} / 1.5 \rfloor)$.
   - Stored `etag` and `last_modified` headers update in the database.
   - The entity is ingested or re-projected into canonical packages.

---

## 3. Relevance Scoring and Evaluation Rubric

Every candidate entity will pass through the `RelevanceFilter` before entering the database. The filter assigns points based on tokens in the title, description, and tags.

### 3.1 Scoring Thresholds
- **Minimum Passing Score:** A candidate must score **>= 15 points** to qualify as an active entity.
- **Immediate Rejection / Quarantine:** Candidates with a score **< 15 points** move to quarantine (`is_quarantined = 1`).

### 3.2 Positive Tool Tokens (+5 to +20 points)
- **Core VPM Tokens (+20 points):** `vpm-package`, `vpm manifest`, `vpm-listing`, `vpm.json`, `index.json`.
- **Framework Tokens (+15 points):** `modular avatar`, `modularavatar`, `vrcfury`, `ndmf`, `aaou`, `anatawa12`.
- **Technical Extensions (+10 points):** `osc bridge`, `face tracking`, `udonsharp`, `udon assembly`, `physbone`, `gesture manager`, `editor script`.
- **Development Utility (+5 points):** `shader`, `blender addon`, `unity editor`, `texture packer`, `mesh optimizer`.

### 3.3 Anti-Tool / Cosmetic Tokens (-5 to -20 points)
- **Clothing & Apparel (-15 points):** `dress`, `skirt`, `outfit`, `costume`, `shoes`, `boots`, `jacket`, `underwear`.
- **Hair & Makeup (-15 points):** `hair style`, `wig`, `makeup`, `eyeshadow`, `lip gloss`, `face texture`.
- **Raw 3D Models (-10 points):** `3d model only`, `unrigged mesh`, `prop only`.

### 3.4 Discard & Quarantine Guards
1. **Skeleton Repository Guard:** Repositories with descriptions shorter than 20 characters enter quarantine with reason `skeleton_repository`.
2. **Dummy Template Guard:** Fork skeletons with no commits or releases enter quarantine with reason `empty_or_template`.
3. **Malicious Link Guard:** URLs redirecting to scam domains or fake Nitro links enter quarantine with reason `malicious_or_scam`.

### 3.5 Description Extraction and Normalization Algorithm

The crawler indexes descriptions to identify software functions. It does not ingest full creative marketing text. The extraction pipeline follows standard information retrieval literature for document summarization (Luhn lead-sentence paradigm; Manning et al., *Introduction to Information Retrieval*).

#### 1. Structured Metadata Resolution (Primary Source)
The crawler resolves descriptions in this priority order:
1. **Package Manifests:** Read the root `description` property from `vpm.json` or `package.json`.
2. **Schema.org / JSON-LD:** Extract the `description` string from structured `SoftwareApplication` or `Product` schemas (used on BOOTH).
3. **Open Graph Protocol (OGP):** Extract the `<meta property="og:description">` tag curated by storefront platforms (Gumroad, Jinxxy, itch.io).

#### 2. Lead-Text Extraction (Fallback for Unstructured Pages)
When structured metadata is absent (e.g., GitHub repository READMEs):
1. Extract the first non-header, non-empty paragraph.
2. Stop the extraction at a natural sentence boundary (`. `, `! `, or `? `) between 100 and 300 characters.
3. Reject arbitrary byte slicing that cuts words in half.

#### 3. Normalization and Trimming Pipeline
Every extracted text snippet passes through these sanitization steps:
1. **Markup Stripping:** Strip HTML tags (`<[^>]+>`) and Markdown image syntax (`!\[.*?\]\(.*?\)`).
2. **Boilerplate Stripping:** Remove platform calls-to-action ("Buy now", "Join Discord", "Follow on Twitter", "Patreon link").
3. **Whitespace Collapsing:** Collapse consecutive whitespace characters into a single space and trim margins.
4. **Functional Scope:** Limit stored text to the functional summary necessary for search indexing.

---

## 4. Origin Timestamps vs Local Indexing Timestamps

The engine will distinguish upstream creation dates from local crawler ingestion timestamps.

```
Upstream Storefront (BOOTH, GitHub, Gumroad)
       |
       |  origin_created_at: 2021-03-15T00:00:00.000Z (Authoritative Upstream Date)
       |  origin_updated_at: 2024-06-20T12:00:00.000Z
       v
Local Observation Lake (entities table)
       |
       |  observed_at: 2026-09-18T10:00:00.000Z (Exact HTTP fetch time)
       |  created_at:  2026-09-18T10:00:00.000Z (Row insertion time)
       v
Derived Projection (canonical_packages table)
          origin_created_at:     2021-03-15T00:00:00.000Z (Preserved Upstream Date)
          origin_updated_at:     2024-06-20T12:00:00.000Z
          created_at_confidence: 'confirmed' (or 'inferred' / 'unknown')
          created_at:            2026-09-18T10:00:00.000Z (Original local index time)
          updated_at:            2026-09-19T02:30:00.000Z (Current projection recalculation)
```

### 4.1 Timestamp Field Definitions
| Field Name | Storage Location | Invariant & Source |
| :--- | :--- | :--- |
| `origin_created_at` | `canonical_packages`, `entities`, `package_fronts` | Upstream platform creation date. Nullable. |
| `origin_updated_at` | `canonical_packages`, `entities`, `package_fronts` | Upstream platform last update date. Nullable. |
| `created_at_confidence` | `canonical_packages` | `'confirmed'`, `'inferred'`, or `'unknown'`. |
| `observed_at` | `entities` | The exact UTC timestamp when the crawler fetched the HTTP payload. |
| `created_at` | `canonical_packages`, `entities`, `package_fronts` | Local indexing timestamp. Preserved across pipeline rebuilds. |
| `updated_at` | `canonical_packages`, `entities`, `package_fronts` | Local record modification timestamp. Updated on every recalculation. |

### 4.2 Confidence Levels & Strict Invariant
- **`confirmed`:** The crawler extracted an authoritative date from the upstream platform API or DOM metadata.
- **`inferred`:** Derived from the earliest verified commit or changelog entry.
- **`unknown`:** Neither an upstream date nor a verified commit date was available.

> [!IMPORTANT]
> The engine will explicitly set `origin_created_at = NULL` and `created_at_confidence = 'unknown'` when no upstream publication date exists. The pipeline will never substitute local crawl fetch times for missing upstream publication dates.

---

## 5. Two-Stage Discovery Lifecycle: Shallow Ingestion vs Deep Hydration

```
[Search API / Storefront Browse]
              |
              |  Stage 1: Provisional Ingestion (Immediate)
              v
[Entities Lake (Shallow Entity)] -----> [Frontier Queue (Priority = 10)]
              |                                        |
              |                                        |  Stage 2: Deep Hydration (Polite)
              |                                        v
              +<------------------------------ [Product Detail & Gallery Crawl]
              |
              v
[Canonical Aggregation & Deduplication]
```

### 5.1 Stage 1: Shallow Search and Listing Ingestion
Search queries and creator storefront lists return basic product cards.
1. The driver will create an `EntityRecord` in the `entities` table.
2. The entity will capture product name, author, price, and primary thumbnail.
3. The driver will queue the clean product URL into the `frontier` table with elevated `priority = 10`.

### 5.2 Stage 2: Deep Product Page and README Hydration
1. The driver will fetch the full HTML payload with domain pacing.
2. The parser will extract the full image gallery, GIFs, and video clips.
3. The driver will resolve vanity slugs and normalize invariant IDs.
4. The parser will extract embedded YouTube showcase and tutorial links.
5. The pipeline will project rich media into canonical packages.

---

## 6. Slug Normalization & Canonical Alias Reconciliation

| Platform | URL Pattern Variants | Authoritative Entity ID | Canonical URL Resolution |
| :--- | :--- | :--- | :--- |
| **Gumroad** | `/l/{permalink}` vs `/l/{vanity_slug}` | `gumroad:{permalink}` | Stores vanity URL in `url`. Adds permalink to `external_links`. |
| **BOOTH** | `booth.pm/ja/items/{id}` vs `{shop}.booth.pm/items/{id}` | `booth:{id}` | Normalizes to `https://booth.pm/ja/items/{id}`. |
| **Jinxxy** | `/p/{short_code}` vs `/{creator}/{product_slug}` | `jinxxy:{creator}/{product_slug}` | Follows HTTP redirects to extract clean path segments. |
| **itch.io** | `{creator}.itch.io/{slug}` vs custom domains | `itch:{creator}/{slug}` | Follows HTTP redirects to resolve canonical storefront host. |
| **GitHub** | `github.com/{old_owner}/{repo}` | `github:{owner}/{repo}` | Follows HTTP 301 redirects to target canonical repository. |

---

## 7. Media Gallery and Video Extraction Standards

### 7.1 Multi-Format Media Collection Rules
- **Preview Images and GIFs:** Collect preview images up to 20 items per listing.
- **Direct MP4 Previews:** Store direct video links in `video_urls`. Add poster images to `media_urls`.
- **YouTube Embed URLs:** Extract YouTube video IDs from embed frames. Store canonical watch links in `youtube_urls`. Add preview thumbnails to `media_urls`. Never store HTML embed URLs in image collections. Filter embed URLs before passing to `ImageProxyService`.
- **GitHub README Media:** Extract image links from repository documentation. Exclude CI build badges and shield icons.

### 7.2 Image Quality Guardrails
1. **Dimension Floor:** Skip images with reported width or height below 200 pixels.
2. **Icon and Avatar Filter:** Exclude URLs containing `/user-profile/`, `/avatar/`, `/icon`, `/favicon`, or `/logo`.
3. **Badge Filter:** Exclude domain patterns matching `shields.io`, `badge`, `travis-ci`, or `codecov`.

---

## 8. Closed-Loop Steering & Search Patterns

User reports submitted through Schema 4 will adjust crawler behavior:
1. **`discovery_query` Branch:** Enqueues search seeds into the high-priority queue (`priority = 10`) and registers search terms in `search_patterns`.
2. **`irrelevance` Branch:** Marks the target package for human review (`needs_review`) and registers negative suppression tokens.
3. **Dynamic Boost / Suppress:** Adjusts discovery weights in `search_patterns` to prioritize high-yield queries.

---

## 9. Procedural Steps: Re-discovery and Re-audit

1. **Mark Frontier Items for Re-crawl:**
   ```powershell
   bun -e "import { Database } from 'bun:sqlite'; const db = new Database('dist/crawler_state.db'); db.run(\"UPDATE frontier SET status = 'pending', attempts = 0, next_fetch_at = datetime('now');\"); console.log('Marked all frontier URLs for re-discovery.');"
   ```

2. **Trigger Freshness Sweep via IPC:**
   ```powershell
   .\dist\vrc-monitor.exe recrawl
   ```

3. **Run Pipeline Sanitization and Deduplication:**
   ```powershell
   bun run sanitize
   ```

---

## 10. Diagnostics and Quarantine Reasons

| Quarantine Reason Code | Root Cause | Resolution Path |
| :--- | :--- | :--- |
| `insufficient_score` | Relevance score fell below 15 points. | Add tool keywords or wait for upstream listing update. |
| `skeleton_repository` | Description length < 20 characters or dummy README. | Quarantined until creator populates documentation. |
| `empty_or_template` | Repository contains no commits or releases. | Quarantined until functional release tag is published. |
| `cosmetics_only` | Listing contains only apparel, hair, or non-functional mesh. | Permanent quarantine. Non-tool assets remain excluded. |
| `malicious_or_scam` | URL matches known phishing or payment redirect pattern. | Permanent quarantine and frontier blacklisting. |

---

## 11. Technical Specifications and Architecture (Reference)

### 11.1 Cho-Garcia-Molina Poisson Adaptive Interval
The scheduler models page modification frequency $\lambda$ as a Poisson process:

$$I_{\text{new}} = \begin{cases} \max(I_{\min}, \lfloor I_{\text{current}} / 1.5 \rfloor) & \text{if HTTP 200 (Modified)} \\ \min(I_{\max}, \lfloor I_{\text{current}} \times 1.5 \rfloor) & \text{if HTTP 304 (Unmodified)} \end{cases}$$

- $I_{\min} = 6 \text{ hours}$
- $I_{\max} = 30 \text{ days}$
- $I_{\text{default}} = 24 \text{ hours}$

---

## 12. Canonical Database Integrity (`dist/crawler_state.db`)

The single authoritative operational database will reside at:
`dist/crawler_state.db`

No operational data will reside in the project root. Runtimes will resolve `CONFIG.dbPath` directly to `dist/crawler_state.db`.
