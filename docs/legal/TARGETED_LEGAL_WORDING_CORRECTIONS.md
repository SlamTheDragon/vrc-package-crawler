# Targeted Legal Wording Corrections for LEGAL.md (Pre-Review Specification)

> **Document Status**: Authoritative Pre-Review Legal Amendment Specification  
> **Prepared For**: Formal Legal & Maintainer Review  
> **Target Document**: [`LEGAL.md`](../../LEGAL.md)  
> **Governing Standards**: `TODO.md` Architecture Baseline (Commit `09e9dc8` & Phase 1–2 Verified Systems State), Philippine Republic Act No. 8293, Republic Act No. 10173, IETF RFC 6648, RFC 8288, RFC 9309, Directive (EU) 2019/790 Art. 4(3)  
> **Effective Date of Proposed Amendments**: Target v1.1 Revision  

---

## Executive Summary & Context

An exhaustive compliance audit of the active codebase against [`LEGAL.md`](../../LEGAL.md) and [`TODO.md`](../../TODO.md) confirms that while the core legal boundaries (Three Legal Layers, unauthenticated guest access, RFC 9309 compliance, anti-AI covenants, zero proprietary binary downloading) are rigorously adhered to, **several specific clauses in [`LEGAL.md`](../../LEGAL.md) have become outdated or desynchronized relative to physical architectural implementations achieved in Phase 1 and Phase 2**.

Specifically:
1. **The "Implementation Lag Asterisk" in §7.2(c) is obsolete**: The physical SQLite schema ([`src/db.ts`](../../src/db.ts#L378-L389)) and export pipeline ([`src/sync/exporter.ts`](../../src/sync/exporter.ts)) have already purged the `webp_data BLOB` column from `media_cache`, operating exclusively on pure origin CDN URLs, BlurHash, and 64-bit DCT perceptual hash (pHash) digests. [`LEGAL.md`](../../LEGAL.md) §7.2(c) still erroneously states that the software stores WebP thumbnails in SQLite.
2. **Missing Storefront Bio-Token Delisting Pathway (§9.4–9.5)**: [`LEGAL.md`](../../LEGAL.md) currently restricts non-scraping delisting proofs to custom domain DNS TXT records and signed Git commits. Over 90% of indie VRChat creators publish on hosted platforms (BOOTH, Gumroad, Jinxxy) and do not own a custom DNS domain or sign Git commits. The Task 3.1 ephemeral storefront bio token pathway (`#vrc-opt-out-<vendorId>`) must be formalized.
3. **Response Header Standardization (RFC 6648 & RFC 8288 in §10.1)**: [`LEGAL.md`](../../LEGAL.md) references legacy non-standard header formats (`VRC-Packages-Catalog-Terms-Version: 1.1`, `VRC-Packages-Catalog-Terms-Digest`), whereas the physical gateway ([`src/server/index.ts`](../../src/server/index.ts#L152-L164)) injects standardized un-prefixed headers (`VRC-Packages-Terms-Of-Use`, `VRC-Packages-Terms-Version`, `VRC-Packages-Repository`, `VRC-Packages-License`, and RFC 8288 `Link: <...>; rel="terms-of-service"`).
4. **Mandatory Administrative Bearer Authentication vs. Public Opt-Out (§10.6 & §9.4)**: [`LEGAL.md`](../../LEGAL.md) describes bearer authentication as optional/conditional, leaving ambiguity regarding mass-delisting vectors on `POST /v1/reports`. The code now strictly enforces `API_SECRET_TOKEN` bearer authentication via `crypto.timingSafeEqual` and routes community reports into a `'needs_review'` quarantine buffer.
5. **Decentralized Node Governance & Single-Node v1.0 Perimeter (§1.4 & §2.3)**: [`LEGAL.md`](../../LEGAL.md) describes multi-node network contributors as active. Under `TODO.md` CANON-6 and Task 5.4, contributor node ingestion is formally deferred to Post-v1.0 to protect Cloudflare administrative credentials (`CLOUDFLARE_API_TOKEN`). The single-node maintainer operational perimeter must be explicitly stated.
6. **Description Enrichment vs. 256-Character Functional Snippet Covenants (§2.2 & §10.4)**: The relationship between multi-source clustering description synthesis (up to 2,500 characters for FTS5 internal indexing) and downstream search snippet delivery ($\le 256$ characters under *Authors Guild v. Google*) requires precise legal boundary language.

The targeted corrections below provide exact line-by-line redlines and calibrated statutory rationale for formal legal adoption into `LEGAL.md` v1.1.

---

## 1. Targeted Redline Amendments

### Amendment 1: Single-Node Maintainer Operational Model (Sections 1.4 & 2.3)

#### Current Text ([`LEGAL.md#L34-L38`](../../LEGAL.md#L34-L38)):
```markdown
1.4. **Deployment and Network Ownership Model.**  
The Project operates under two distinct deployment structures:
- **(a) The Canonical Network:** When crawler nodes or contributors send discovered metadata to the Maintainer canonical network, that network owns the resulting catalog products. This includes unified projection databases (`vrc_catalog.db`) and search indexes. Access to and redistribution of these canonical network products are governed by these Terms.
- **(b) Independent Networks (AGPLv3):** If an entity uses or modifies this crawler software for an independent network, the GNU Affero General Public License v3.0 (AGPLv3) strictly applies. That operator must obey all AGPLv3 copyleft obligations, including Section 13 for network interaction. The Maintainer claims no ownership over independent databases generated outside the Canonical Network.
```

#### Proposed Calibrated Text:
```markdown
1.4. **Deployment and Network Ownership Model.**  
The Project operates under two distinct deployment structures:
- **(a) The Canonical Network (v1.0 Single-Node Architecture):** In version 1.0, the Canonical Network operates exclusively as a single-node, maintainer-operated deployment. To protect administrative infrastructure keys and eliminate edge database tampering, third-party contributor node ingestion is formally deferred to a Post-v1.0 Milestone governed by cryptographic Worker Ingestion Gateways. The Maintainer owns and publishes the resulting catalog products, including canonical projection databases (`vrc_catalog.db`) and search indexes. Access to and redistribution of these canonical network products are governed by these Terms.
- **(b) Independent Networks (AGPLv3):** If an entity uses or modifies this crawler software for an independent network, the GNU Affero General Public License v3.0 (AGPLv3) strictly applies. That operator must obey all AGPLv3 copyleft obligations, including Section 13 for network interaction. The Maintainer claims no ownership over independent databases generated outside the Canonical Network.
```

*Legal & Technical Rationale*: Protects against implied representations that third-party untrusted nodes are currently authorized to push directly to Cloudflare D1/R2 without authentication.

---

### Amendment 2: Functional Description Limits and Indexing Scope (Sections 2.2 & 10.4)

#### Current Text ([`LEGAL.md#L55`](../../LEGAL.md#L55)):
```markdown
The Maintainer limits description indexing to short functional summaries as an operational risk-reduction measure. Fair-use assessments remain fact-specific and jurisdiction-dependent.
```

#### Proposed Calibrated Text:
```markdown
2.2. **Statutory Copyright Basis, Functional Description Limits, and Dual-Tier Indexing Architecture.**  
Individual factual data elements lack copyright protection under 17 U.S.C. Section 102(b), 37 C.F.R. Section 202.1(a), and Philippine Republic Act No. 8293 Section 175 (*Feist Publications, Inc. v. Rural Telephone Service Co.*, 499 U.S. 340). Underlying creative text, marketing copy, and documentation retain independent copyright protection.

To harmonize full-text search indexing with copyright fair-use boundaries (*Authors Guild v. Google, Inc.*, 804 F.3d 202; *Field v. Google, Inc.*, 412 F. Supp. 2d 1106), the Project implements a strict **Dual-Tier Description Architecture**:
- **(a) Internal Knowledge Graph Ingestion (Tier 1):** For internal semantic classification, entity resolution, and SQLite FTS5 search indexing, the pipeline may parse technical overview text (e.g. repository README feature lists, compatibility requirements) truncated to a technical operational limit (up to 2,500 characters), discarding unformatted markup, images, and marketing badges.
- **(b) Downstream Syndication and Public Snippets (Tier 2):** In all downstream API catalog feeds (`/v1/packages/stream`), public search views, and distributed SQLite search catalogs (`vrc_catalog.db`), descriptions are strictly truncated to short functional summaries (maximum 256 characters) or lead metadata. Downstream consumers agree under Section 10.4 not to expand, cache, or redistribute full creative marketing copy extracted from origin storefronts.
```

*Legal & Technical Rationale*: Eliminates the discrepancy between internal clustering extraction ([`src/crawler/projection.ts#L458,L637`](../../src/crawler/projection.ts#L458)) and the downstream snippet fair-use covenant under the Second Circuit's *Authors Guild v. Google* non-substituting snippet precedent.

---

### Amendment 3: Three-State Provenance and Factual Null Dates (Section 2.4)

#### Current Text ([`LEGAL.md#L60-L65`](../../LEGAL.md#L60-L65)):
```markdown
2.4. **Three-State Timestamp Rubric.**  
The Project records creation timestamps under a three-state rubric:
- `confirmed`: Extracted directly from authoritative platform metadata.
- `inferred`: Derived from the earliest verified commit or changelog entry.
- `unknown`: When no upstream publication date exists, the timestamp is NULL. When an upstream publication date is not identified, the publication timestamp field is set to NULL rather than substituting a local crawl timestamp.
```

#### Proposed Calibrated Text:
```markdown
2.4. **Three-State Timestamp Rubric and Provenance Faithfulness.**  
To prevent factual distortion and preserve historical origin provenance under Philippine RA 8293 Section 175, the Project strictly records publication timestamps under a three-state rubric:
- `confirmed`: Extracted directly from authoritative platform metadata fields (e.g. BOOTH `item-created-date`, GitHub repository `created_at`, VPM package release timestamps).
- `inferred`: Derived from earliest verified commit histories or release tag changelogs.
- `unknown`: When upstream platform metadata lacks an explicit publication timestamp, `origin_created_at` MUST be recorded as `NULL` with `created_at_confidence = 'unknown'`. Under no circumstances does the pipeline substitute local crawler observation or fetch timestamps (`created_at`, `observed_at`) for upstream creation dates.
```

*Legal & Technical Rationale*: Reinforces the Task 1.4 invariant in [`src/crawler/projection.ts`](../../src/crawler/projection.ts) that local crawler observation time cannot be masqueraded as the upstream author's creation date.

---

### Amendment 4: Pure Media Pointer Architecture & Purge of WebP BLOB Asterisk (Section 7.2(c))

#### Current Text ([`LEGAL.md#L166-L167`](../../LEGAL.md#L166-L167)):
```markdown
- **(c) Direct Origin Media Pointer Policy (Implementation Lag Asterisk):** The Project policy aims to serve direct source links to original creator media instead of rehosting third-party image files. This direct pointer architecture eliminates server storage and aligns with display-rights jurisprudence. However, the current code implementation lags behind this architectural policy. The crawler currently stores low-resolution WebP thumbnails in the SQLite database (`media_cache.webp_data`) while computing BlurHash and pHash-64 digests. The Maintainer treats local thumbnail storage as an operational risk under jurisdictions that reject the Server Test. The project roadmap and `TODO.md` queue the removal of persistent image caching (CR-19 and CR-21) to complete migration to direct origin URLs. The Maintainer deletes cached media records upon verified delisting requests.
```

#### Proposed Calibrated Text:
```markdown
- **(c) Direct Origin Media Pointer Architecture and Hybrid Delivery:** In strict compliance with the Ninth Circuit Server Test (*Perfect 10, Inc. v. Amazon.com, Inc.*, 508 F.3d 1146), the Project operates on a pure direct origin media pointer model.
  - **Zero Persistent BLOB Storage**: The database schema (`media_cache` in `src/db.ts`) and exported SQLite catalogs (`vrc_catalog.db`) store zero WebP binary BLOBs and zero raw image payloads. Persistent thumbnail caching has been completely purged from the architecture. The database retains solely mathematical perceptual fingerprints (BlurHash strings, 64-bit DCT pHash digests), content-type metadata, and direct outbound origin CDN URLs (`media_urls_json`).
  - **Hybrid Delivery & Ephemeral In-Memory Proxying**: API feeds and database distributions return direct origin CDN links by default. To accommodate downstream client applications blocked by closed storefront CDN hotlink protections or mandatory `Referer` headers (e.g. Pixiv `pximg.net`), the Project architecture provides an ephemeral in-memory streaming gateway (`GET /v1/media/stream?url=...`). This conduit strictly transcodes media in transient volatile memory without storing image bytes on disk, without SQLite BLOB writes, and without cloud object rehosting, emitting client-side private caching directives (`Cache-Control: private, max-age=86400`).
  - **Jurisdictional Notice Regarding Display Rights**: While pure origin pointers eliminate server reproduction liability under the Server Test, legal display exposure under jurisdictions that have criticized or rejected the Server Test (e.g. *Goldman v. Breitbart News Network, LLC*, 271 F. Supp. 3d 495; *Nicklen v. Sinclair Broadcast Group, Inc.*, 551 F. Supp. 3d 188; *Hunley v. Instagram, LLC*, 73 F.4th 1060) remains subject to active judicial debate. Downstream developers must independently evaluate their media presentation model under *Kelly v. Arriba Soft Corp.* (336 F.3d 811) transformative fair-use guidelines.
```

*Legal & Technical Rationale*: Eliminates the outdated "implementation lag asterisk" since [`src/db.ts`](../../src/db.ts) and [`src/sync/exporter.ts`](../../src/sync/exporter.ts) have already purged the `webp_data` BLOB column, accurately aligning legal representations with physical software reality.

---

### Amendment 5: Non-Scraping Delisting Pathways & Storefront Bio Tokens (Sections 9.4–9.5)

#### Current Text ([`LEGAL.md#L215-L223`](../../LEGAL.md#L215-L223)):
```markdown
9.4. **Non-Scraping Technical Verification Pathways.**  
The Project architecture specifies three non-scraping verification pathways:
- DNS TXT record (`vrc-opt-out=<vendor-id>`) on the creator domain.
- Signed Git commit from a verified repository account.
- Direct email verification from an official author domain.

9.5. **Automated Delisting Roadmap.**  
The Project architecture prioritizes an automated delisting route (`POST /v1/opt-out`) to validate machine-readable verification proofs without manual overhead. Supported proofs include domain DNS TXT records, signed repository commits, and domain email tokens. Pending complete production rollout of the automated endpoint, delisting requests are processed directly via the designated email contact in Section 9.2.
```

#### Proposed Calibrated Text:
```markdown
9.4. **Non-Scraping Technical Verification Pathways.**  
The Project provides four non-scraping verification pathways to validate delisting requests without requiring commercial platform credentials:
- **(a) Domain DNS TXT Record (`dns_txt`)**: For creators operating custom domains, querying a DNS TXT record for `_vrc-opt-out.<creatorDomain>` matching `vrc-opt-out=<vendorId>` via standard resolver lookup.
- **(b) Ephemeral Storefront Bio Token (`storefront_bio_token`)**: For independent creators hosting storefronts on third-party multi-tenant platforms (BOOTH, Gumroad, Jinxxy) without custom domain DNS access, the creator temporarily places a non-destructive verification string (e.g. `#vrc-opt-out-<vendorId>`) in their public store profile bio/description. The automated endpoint performs a single, ephemeral unauthenticated HTTP fetch of the public profile, verifies substring presence, immediately aborts and discards the fetched HTML payload from volatile memory without parsing, storing, or indexing, and processes the delisting. Creators may remove the token immediately upon receiving confirmation.
- **(c) Cryptographically Signed Git Commit (`signed_commit`)**: For repository maintainers, verifying a cryptographic commit signature against the published public PGP/SSH key of the creator.
- **(d) Direct Email Verification**: Verification messages sent directly from an authoritative creator domain to `slamthedragon@gmail.com`.

9.5. **Automated Delisting Gateway (`POST /v1/opt-out`).**  
The endpoint `POST /v1/opt-out` provides an automated machine-readable delisting interface. Verification requests are protected by strict anti-abuse guardrails, including hostname whitelisting (`booth.pm`, `gumroad.com`, `jinxxy.com`), comprehensive Server-Side Request Forgery (SSRF) and DNS rebinding blocks against private/loopback IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`), strict payload size limits (512 KB), and client IP rate limiting. Upon successful cryptographic or bio-token validation, matching records are immediately transitioned to `lifecycle = 'creator_opted_out'` (or `'delisted'`) and suppressed from all active discovery queues, API feeds, and subsequent database distributions.
```

*Legal & Technical Rationale*: Resolves the accessibility gap for non-domain storefront creators while formalizing the SSRF and rate-limiting safeguards that protect target platforms during bio-token verification.

---

### Amendment 6: Downstream Contractual Notice & RFC Standards (Section 10.1)

#### Current Text ([`LEGAL.md#L245-L250`](../../LEGAL.md#L245-L250)):
```markdown
Architectural specifications call for Maintainer-controlled API endpoints and production deployments to configure technical notice through HTTP response headers:
```http
VRC-Packages-Terms-Of-Use: https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md
VRC-Packages-Catalog-Terms-Version: 1.1
VRC-Packages-Catalog-Terms-Digest: <sha256-digest>
```
```

#### Proposed Calibrated Text:
```markdown
10.1. **Downstream Notice and Technical Contractual Headers (IETF RFC 6648 & RFC 8288).**  
API and catalog access terms constitute binding conditions of access and redistribution for Project-controlled feeds, exports, and catalog databases. In adherence to IETF RFC 6648 (deprecating the `X-` prefix for custom application protocols) and IETF RFC 8288 (Web Linking), Maintainer-controlled API endpoints inject conspicuous, machine-readable contractual notice on all HTTP responses:
```http
VRC-Packages-Terms-Of-Use: https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md
VRC-Packages-Terms-Version: 1.1
VRC-Packages-Repository: https://github.com/SlamTheDragon/vrc-package-crawler
VRC-Packages-License: Layer-A: AGPL-3.0 / Layer-B: Database Compilation Terms / Layer-C: Third-Party Origin Rights
Link: <https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md>; rel="terms-of-service"
X-Robots-Tag: noai, noimageai
```
Under *Register.com, Inc. v. Verio, Inc.* (356 F.3d 393), repeated automated or programmatic consumption of API endpoints and feeds following conspicuous notice of terms establishes an enforceable contractual relationship governing downstream data utilization.
```

*Legal & Technical Rationale*: Standardizes on the physical response headers implemented in Task 1.2 and tested in [`tests/phase1_server_headers.test.ts`](../../tests/phase1_server_headers.test.ts).

---

### Amendment 7: Administrative Curation Authentication vs. Rights-Holder Opt-Out (Section 10.6)

#### Current Text ([`LEGAL.md#L267-L269`](../../LEGAL.md#L267-L269)):
```markdown
10.6. **Community Curation Reports (Schema 4).**  
The endpoint `POST /v1/reports` accepts structured curation reports. When configured in production, bearer authentication via `API_SECRET_TOKEN` can restrict administrative submissions. Received reports are placed in a `'pending'` queue to allow verification before lifecycle state changes occur.
```

#### Proposed Calibrated Text:
```markdown
10.6. **Community Curation Reports, Bearer Authentication, and Quarantined Processing.**  
The endpoint `POST /v1/reports` accepts structured curation and moderation reports (Schema 4). To prevent unauthorized competitor sabotage, automated delisting denial-of-service attacks, and catalog poisoning:
- **Mandatory Bearer Authentication**: Submissions to `POST /v1/reports` strictly require administrative bearer authentication (`Authorization: Bearer <API_SECRET_TOKEN>`). Requests lacking a valid token generated with at least 256 bits of CSPRNG entropy are rejected with `HTTP 401 Unauthorized`. Token verification uses constant-time string comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
- **Quarantined Delisting Buffer**: In accordance with the anti-tampering covenant, community reports asserting `irrelevance` or `scam` do not trigger autonomous delisting. Instead, the reported package transitions to an administrative `'needs_review'` quarantine buffer, pending human curator evaluation before any permanent lifecycle mutation (`'delisted'`) may occur.
- **Strict Separation from Creator Opt-Out**: Administrative curation under this Section is distinct from verified rights-holder delisting under Section 9. Rights holders need not possess administrative bearer credentials and may delist their packages directly via `POST /v1/opt-out` using non-scraping proof pathways.
```

*Legal & Technical Rationale*: Harmonizes the legal document with the security hardening implemented in Task 2.2 and verified in [`tests/phase2_auth_quarantine.test.ts`](../../tests/phase2_auth_quarantine.test.ts).

---

### Amendment 8: Database Export Metadata Table Standard (Section 10.7)

#### Current Text ([`LEGAL.md#L270-L272`](../../LEGAL.md#L270-L272)):
```markdown
10.7. **Database Export Metadata Specification.**  
Architectural specifications require exported SQLite databases (`vrc_catalog.db`) to include a `catalog_metadata` table recording `terms_version`, `terms_url`, `terms_hash`, `export_timestamp`, and license references to supply downstream consumers with in-band notice.
```

#### Proposed Calibrated Text:
```markdown
10.7. **Database Export Metadata Specification and In-Band Contractual Notice.**  
To ensure that all downstream offline consumers and application redistributors receive unambiguous legal notice regardless of delivery method, all exported SQLite databases (`vrc_catalog.db`) incorporate a mandatory `catalog_metadata` table:
```sql
CREATE TABLE IF NOT EXISTS catalog_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
Populated metadata attributes strictly declare:
- `terms_of_use_url`: Direct URL to the authoritative `LEGAL.md`.
- `terms_version`: Document schema version (e.g. `1.1`).
- `repository_url`: Authoritative source repository link.
- `catalog_name`: `vrc-package-crawler Catalog Index`.
- `license_framework`: Three Legal Layers breakdown (Layer-A: AGPL-3.0 / Layer-B: Database Compilation Terms / Layer-C: Origin Author Rights).
- `export_epoch`: Unix timestamp of defragmented compilation.

Downstream redistributors are prohibited from dropping, modifying, or nullifying the `catalog_metadata` table when mirroring or distributing catalog databases.
```

*Legal & Technical Rationale*: Matches the exact schema and data injected by [`src/sync/exporter.ts#L82-L96`](../../src/sync/exporter.ts#L82-L96) and verified in [`tests/phase1_schema_dedup.test.ts`](../../tests/phase1_schema_dedup.test.ts).

---

### Amendment 9: Avatar Cosmetics Taxonomy Isolation (Section 11.4)

#### Current Text ([`LEGAL.md#L300-L302`](../../LEGAL.md#L300-L302)):
```markdown
11.4. **Avatar Cosmetics Taxonomy Isolation.**  
Standalone avatar cosmetics are separated from the primary toolchain catalog to minimize SimHash false merges. Downstream tools must preserve this taxonomy separation.
```

#### Proposed Calibrated Text:
```markdown
11.4. **Avatar Cosmetics Taxonomy Isolation and Base-Avatar Association.**  
To prevent SimHash locality-sensitive clustering collisions between high-volume avatar apparel/hair listings and developer toolchains sharing generic terminology ("PhysBones", "Modular Avatar"), standalone avatar cosmetics are partitioned into a strictly isolated taxonomy tier.
- **Base Avatar Tagging**: Cosmetics listings must be tagged with their target base avatar 3D mesh (e.g., Kikyo, Manuka, Shinano, Selestia).
- **Anti-Merge Guard**: The entity resolution engine prohibits near-duplicate clustering between toolchains and cosmetic items. Near-duplicate evaluations for cosmetics require identical author credentials and matching base-avatar constraints before Hamming distance evaluation.
- **Downstream Preservation Covenant**: Downstream consumers and search applications integrating Project feeds agree to preserve this taxonomy separation and avoid presenting unvetted cosmetic assets as verified developer toolchains.
```

*Legal & Technical Rationale*: Codifies the Task 5.3 / CANON-2 architectural decisions into binding downstream categorization covenants.

---

## 2. Summary Comparison Matrix

| Section in `LEGAL.md` | Pre-Review Status | Identified Discrepancy | Proposed Resolution |
| :--- | :--- | :--- | :--- |
| **§1.4 & §2.3** | Outdated | Mentions multi-node external contributor ingestion as active | Calibrate to v1.0 Single-Node Maintainer perimeter; defer contributor sync to Post-v1.0 Worker Gateway |
| **§2.2 & §10.4** | Ambiguous | Description limits conflated between indexing and display | Formulate Dual-Tier Description Architecture: Tier 1 (internal indexing $\le 2500$ chars) vs Tier 2 (downstream display $\le 256$ chars) |
| **§2.4** | Incomplete | Did not explicitly forbid local crawl time as creation date fallback | Mandate `NULL` origin date and `'unknown'` confidence when upstream platform date is absent |
| **§7.2(c)** | **Critically Outdated** | Contains "Implementation Lag Asterisk" asserting SQLite stores WebP BLOBs | **Purge lag asterisk completely**; affirm pure origin pointers and ephemeral in-memory streaming proxy |
| **§9.4–9.5** | Incomplete | Restricts opt-out to DNS TXT / Git commits; omits hosted store creators | Add Ephemeral Storefront Bio Token Verification pathway with SSRF / rate-limiting guardrails |
| **§10.1** | Outdated | Specifies non-standard / legacy headers | Standardize on implemented headers (`VRC-Packages-Terms-Of-Use`, RFC 8288 `Link`) |
| **§10.6** | Ambiguous | Bearer auth described as optional; risk of mass delisting | Mandate CSPRNG `API_SECRET_TOKEN` bearer auth and `'needs_review'` quarantine buffer |
| **§10.7** | Generic | General description of export metadata | Formulate exact SQL schema of `catalog_metadata` table |
| **§11.4** | Minimal | Single-sentence note on cosmetics | Detail base avatar mesh tagging and SimHash anti-collision constraints |

---

## 3. Next Steps & Legal Review Handoff

This document is prepared as a clean, self-contained reference for counsel and the Maintainer. Once approved during legal review, these amendments will be merged directly into [`LEGAL.md`](../../LEGAL.md) as Version 1.1.
