# Discovery and Re-audit Rules Guide

This guide defines the discovery, relevance scoring, and timestamp rules for the VRChat Package Crawler. Follow these rules to discover, verify, and re-audit packages across all supported platforms.

---

## 1. Foundational Invariants

The discovery engine enforces three architectural rules on all discovered resources:

1. **The Zero-Binary Invariant:** The crawler never downloads, stores, or redistributes compiled 3D meshes, textures, `.unitypackage` bundles, `.fbx` models, or binary scripts.
2. **The Metadata-Only Boundary:** The engine collects only public factual attributes: titles, tags, prices, platform compatibility flags, and store URLs.
3. **The Canonical Traffic Invariant:** Outbound links must route users directly to original creator storefronts for transactions.

---

## 2. Discovery Rules Matrix

The table below details discovery routes, target patterns, and re-crawl policies across all supported platforms:

| Platform | Discovery Channel | Target Queries / Topic Patterns | Ingestion Pacing | Freshness & Re-crawl Policy |
| :--- | :--- | :--- | :--- | :--- |
| **BOOTH.pm** | HTML Categories & Microdata | `VRChat`, `Unity`, `VPM`, `ModularAvatar` | 1.0 Hz (AIMD) | Cho-Garcia-Molina Poisson (24h default) |
| **GitHub** | REST API & Repository Topics | `vpm-package`, `vrchat-tool`, `modular-avatar` | 1.0 Hz (Token Bucket) | Adaptive interval with ETag HTTP 304 backoff |
| **VPM Repos** | `index.json` / `vpm.json` Manifests | Direct community repo URLs, GitHub Pages | 1.0 Hz | SHA-256 manifest hash compare |
| **Gumroad** | Profile & Product Scraping | Tag queries: `vrchat`, `vpm`, `unity-tool` | 1.0 Hz (AIMD) | 24h default interval |
| **Jinxxy** | Official REST API | Public listings: `Tools`, `Utilities` | 1.0 Hz | 24h default interval |
| **itch.io** | Tag Navigation & HTML Parser | Tags: `vrchat`, `unity-tool`, `vrc-shader` | 1.0 Hz | 24h default interval |

---

## 3. Relevance Scoring and Evaluation Rubric

Every candidate entity passes through the `RelevanceFilter` before entering the database. The filter assigns points based on tokens in the title, description, and tags.

### 3.1 Scoring Thresholds

- **Minimum Passing Score:** A candidate must score **>= 15 points** to qualify as an active entity.
- **Immediate Rejection / Quarantine:** Candidates with a score **< 15 points** move to quarantine (`is_quarantined = 1`).

### 3.2 Positive Tool Tokens (+5 to +20 points)

The filter awards positive points to development tools, editor extensions, and technical utilities:

- **Core VPM Tokens (+20 points):** `vpm-package`, `vpm manifest`, `vpm-listing`, `vpm.json`, `index.json`.
- **Framework Tokens (+15 points):** `modular avatar`, `modularavatar`, `vrcfury`, `ndmf`, `aaou`, `anatawa12`.
- **Technical Extensions (+10 points):** `osc bridge`, `face tracking`, `udonsharp`, `udon assembly`, `physbone`, `gesture manager`, `editor script`.
- **Development Utility (+5 points):** `shader`, `blender addon`, `unity editor`, `texture packer`, `mesh optimizer`.

### 3.3 Anti-Tool / Cosmetic Tokens (-5 to -20 points)

The filter subtracts points for standalone non-tool cosmetic assets:

- **Clothing & Apparel (-15 points):** `dress`, `skirt`, `outfit`, `costume`, `shoes`, `boots`, `jacket`, `underwear`.
- **Hair & Makeup (-15 points):** `hair style`, `wig`, `makeup`, `eyeshadow`, `lip gloss`, `face texture`.
- **Raw 3D Models (-10 points):** `3d model only`, `unrigged mesh`, `prop only`.

### 3.4 Discard & Quarantine Guards

The engine flags and quarantines entities that trigger these safety checks:

1. **Skeleton Repository Guard:** Repositories with a description shorter than 20 characters or missing README content enter quarantine with reason `skeleton_repository`.
2. **Dummy Template Guard:** Repositories matching fork skeletons with no commits or releases enter quarantine with reason `empty_or_template`.
3. **Malicious Link Guard:** URLs redirecting to known scam domains, credential harvesters, or fake Nitro links enter quarantine with reason `malicious_or_scam`.

---

## 4. Origin Timestamps vs Local Indexing Timestamps

The engine distinguishes upstream creation dates from local crawler ingestion timestamps.

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
          updated_at:            2026-09-19T02:30:00.000Z (Current pipeline recalculation)
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

### 4.2 Confidence Levels

- **`confirmed`:** The crawler extracted an authoritative creation date from the upstream platform API or DOM metadata (e.g. GitHub `created_at` or BOOTH `item-created-date`).
- **`inferred`:** No direct upstream date existed; the timestamp is inferred from the earliest local observation date across constituent entities.
- **`unknown`:** Neither an upstream date nor an entity observation date was available.

---

## 5. Closed-Loop Steering & Search Patterns

User reports submitted through Schema 4 dynamically adjust crawler discovery behavior:

1. **`discovery_query` Branch:** Enqueues new search seeds into the high-priority queue (`priority = 10`) and registers search terms in `search_patterns`.
2. **`irrelevance` Branch:** Marks the target canonical package as `lifecycle = 'delisted'`, quarantines constituent entities, and registers negative suppression tokens.
3. **Dynamic Boost / Suppress:** The crawler adjusts discovery weights in `search_patterns` to prioritize high-yield creator queries and suppress noisy terms.

---

## 6. Procedural Steps: Re-discovery and Re-audit

Follow these steps to schedule or execute full re-discovery and re-audit passes:

### Step 1: Mark All Frontier Items for Re-crawl

Run this command to reset all frontier records to pending:

```powershell
bun -e "import { Database } from 'bun:sqlite'; const db = new Database('dist/crawler_state.db'); db.run(\"UPDATE frontier SET status = 'pending', attempts = 0, next_fetch_at = datetime('now');\"); console.log('Marked all frontier URLs for re-discovery.');"
```

### Step 2: Trigger Live Freshness Sweep via IPC

If the background crawler daemon is running, trigger an immediate re-crawl:

```powershell
.\dist\vrc-monitor.exe recrawl
```

### Step 3: Run the Pipeline Sanitization and Deduplication Tool

Re-audit all active entities against updated relevance filters and rebuild canonical projections:

```powershell
bun run sanitize
```

Expected terminal output:
```text
Clustering 19150 pristine entities across all platforms...
  [4.1] Exact Match Merged: 2450
  [4.2] SimHash Jaro-Winkler Merged: 1042
  [4.3] Storefronts merged: 3492 | Storefronts standalone: 12156
[Step 5/5] Processing qualified discards, checkpointing database, and verifying integrity...
```

---

## 7. Diagnostics and Quarantine Reasons

| Quarantine Reason Code | Root Cause | Resolution Path |
| :--- | :--- | :--- |
| `insufficient_score` | Relevance score fell below 15 points. | Add tool keywords or wait for upstream listing description update. |
| `skeleton_repository` | Description length < 20 characters or dummy README. | Quarantined until creator populates repository documentation. |
| `empty_or_template` | Upstream repository contains no commits or releases. | Quarantined until functional release tag is published. |
| `cosmetics_only` | Listing contains only apparel, hair, or non-functional mesh. | Permanent quarantine. Non-tool assets remain excluded. |
| `malicious_or_scam` | URL matches known phishing or payment redirect pattern. | Permanent quarantine and frontier blacklisting. |

---

## 8. Technical Specifications and Architecture (Reference)

### 8.1 Cho-Garcia-Molina Poisson Adaptive Interval

The scheduler models page modification frequency $\lambda$ as a Poisson process. The update interval $I$ adjusts after each fetch:

$$I_{\text{new}} = \begin{cases} \max(I_{\min}, \lfloor I_{\text{current}} / 1.5 \rfloor) & \text{if HTTP 200 (Modified)} \\ \min(I_{\max}, \lfloor I_{\text{current}} \times 1.5 \rfloor) & \text{if HTTP 304 (Unmodified)} \end{cases}$$

- $I_{\min} = 6 \text{ hours}$
- $I_{\max} = 30 \text{ days}$
- $I_{\text{default}} = 24 \text{ hours}$

---

## 9. Canonical Database Integrity (`dist/crawler_state.db`)

### 9.1 Sole Canonical Database Location
The single authoritative operational SQLite database is located strictly at:
`dist/crawler_state.db`

No operational data is stored in the project root. Both development runtimes (`bun run ...`) and standalone compiled executables (`dist/vrc-*.exe`) resolve `CONFIG.dbPath` directly to `dist/crawler_state.db`.

### 9.2 Invariant Guarantees
1. **Zero Database Ambiguity:** Any database file placed outside `dist/` is an invalid development artifact.
2. **Crash Resilience:** WAL mode (`PRAGMA journal_mode = WAL;`) and synchronous normal (`PRAGMA synchronous = NORMAL;`) ensure zero corruption during unexpected power outages.
3. **Audit Trail Immutability:** The observation lake (`entities`) preserves 100% of discovered entity payloads even when an entity is quarantined or delisted.
4. **Decoupled Storefront Timestamps:** The canonical projection separates authoritative upstream platform dates (`origin_created_at`) from local ingestion timestamps (`created_at`).

---

## 10. Toolset Source Separation and Binary Architecture

Each standalone binary distribution corresponds to a dedicated source directory:

| Executable Output | Dedicated Source Directory | Purpose & Runtime Model |
| :--- | :--- | :--- |
| `dist/vrc-crawler.exe` | `src/crawler/index.ts` | 24/7 background crawling daemon with Mercator host pacing |
| `dist/vrc-crawler-linux` | `src/crawler/index.ts` | Headless Linux background service binary |
| `dist/vrc-monitor.exe` | `src/monitor/index.ts` | Real-time terminal dashboard, IPC control CLI, and metrics |
| `dist/vrc-sync.exe` | `src/sync/index.ts` | Cloudflare D1/R2 high-watermark incremental sync daemon |
| `dist/vrc-server.exe` | `src/server/index.ts` | Headless REST API server (Schemas 1, 2, 4 & WebP media proxy) |

### 10.1 Maintenance Toolset (`src/tools/`)
Offline and scheduled maintenance scripts remain isolated under `src/tools/`:
- `src/tools/pipeline_sanitize.ts`: Deterministic SimHash-64 & Jaro-Winkler canonical clustering and deduplication pass (`bun run sanitize`).
- `src/tools/exporter.ts`: Lightweight standalone catalog exporter with SQLite FTS5 index (`bun run export`).
- `src/tools/steering.ts`: Autonomous Schema 4 feedback puller and curator override applicator (`bun run steering`).
- `src/tools/discover_vpm.ts`: Autonomous discovery of decentralized VPM community index repositories (`bun run discover:vpm`).

