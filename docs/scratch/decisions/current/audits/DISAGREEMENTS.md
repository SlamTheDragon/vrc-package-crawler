# Architectural Disagreements Audit

> **Document role:** Gap and defect registry — not an architecture specification. See `CONFORMANCE.md` for current evidence and `DIRECTION.md` for owner decisions.
> **Audit date:** 2026-09-25 (Phase 4 baseline). Updated 2026-09-30 after `refactor(v0)` purge.
> **Policy:** Version 0; deletion is preferred over deprecation.

---

## 1. Status of OVERLOOKED items after `refactor(v0)`

Commit `refactor(v0)` permanently deleted `src/utils/image_proxy.ts`, `sharp_worker.ts`, `src/crawler/projection.ts`, `src/crawler/steering.ts`, `src/crawler/index.ts`, `src/server/index.ts`, `src/sync/index.ts`, `src/db.ts` (legacy CrawlerDB), and all `src/drivers/*`. This resolves or closes the following items **as code defects** — the underlying design questions remain open (see `DIRECTION.md`).

| ID | Title | Resolution |
| --- | --- | --- |
| OVERLOOKED-11 | Stale WebP transcoding and subprocess IPC in `image_proxy.ts`/`sharp_worker.ts` | **Closed** — both files deleted; `sharp` removed from `package.json`; `observation_adapter.ts` records origin URLs only |
| OVERLOOKED-12 | `resetFrontierForRecrawl()` wipes dead-letter/blocked states | **Closed** — `src/db.ts` (CrawlerDB) deleted; new coordinator uses explicit status transitions in `local_sqlite.ts` |
| OVERLOOKED-13 | Delta feed missing `projection_epoch`, causing client cursor amnesia | **Closed as legacy** — `src/server/index.ts` deleted; coordinator catalog API uses keyset cursor pagination, not rowid watermarks |
| OVERLOOKED-14 | Opt-out probe drops HTTP redirects | **Closed as legacy** — `src/server/index.ts` deleted; opt-out flow is now operator-controlled lifecycle state change, not a live probe |
| OVERLOOKED-15 | VPM manifest hardcodes `1.0.0` for all packages | **Closed as legacy** — `/v1/vpm/index.json` returns HTTP 410; real VPM release evidence is stored in `source_versions` per `local_sqlite.ts` |
| OVERLOOKED-16 | `canonical_packages.media_id = 'none'` sentinel violates FK integrity | **Closed as legacy** — legacy `canonical_packages` table with `media_id` deleted; new coordinator schema uses `source_items`/`source_versions` without that column |
| OVERLOOKED-17 | Delta feed omits `package_fronts` multi-storefront data | **Closed as legacy** — `src/server/index.ts` delta feed deleted; multi-platform fronts are operator `GET /v1/operator/catalog` records in `source_items` |
| OVERLOOKED-18 | Sequential unbatched D1 writes for `package_fronts` | **Closed as legacy** — `src/sync/index.ts` deleted; no D1 sync in v0 pre-production |
| OVERLOOKED-19 | Dead `'needs_review'` status enum in `user_reports` | **Closed as legacy** — `src/db.ts` legacy schema deleted; new coordinator uses `operator_actions` audit log without that enum |

---

## 2. Subsystem disagreements (still current)

Items that survive the purge and remain active discrepancies between documentation and code reality:

| Topic | Claim A | Claim B | Reality |
| :--- | :--- | :--- | :--- |
| API version identifier | `package.json` declares `"version": "1.0.0"` | `GET /v1/health` historically reported `"version": "2.0.0"` | Legacy server deleted; `src-crawler/config.json` is now the version source of truth. API version vocabulary not yet established (O-11) |
| VPM manifest SemVer | `REPORTING_SCHEMAS.md` §3 specifies multi-version maps | Code hardcoded `1.0.0` for all packages | Legacy server deleted and endpoint returns 410; real versions are stored in `source_versions` but not publicly projected (G4 open) |
| Tier-2 description boundary | Internal 1024-char summaries allowed | Public descriptions limited to 256 code points in legacy exporter | 256-char limit has no legal basis (A-09); description retention policy is an open owner decision |
| FTS5 search fields in exported catalog | `COMPREHENSIVE_SYSTEM_ARCHITECTURE.md` §2.1 asserts FTS includes `category`, `subcategory`, `primary_platform` | Legacy `exporter.ts` indexed only `name`, `author`, `description`, `tags` | Legacy exporter deleted; FTS design in future public catalog is not yet specified |

---

## 3. Non-standardized identifiers (still current)

These are open vocabulary issues in `src-crawler/src/shared/` and the coordinator schema:

- **`id` vs `canonical_id` vs `sourceItemKey` vs `platform_item_id`:** coordinator uses `sourceItemKey` as the primary key in `source_items`; `canonical_packages` uses `id` as its pk; `identity_links` connects them. The public API and any downstream consumer need a stable documented vocabulary. See D-04, D-05.
- **`name` vs `title`:** `source_items` uses `name`; `CatalogPackageSchema` uses `name`; legacy tables used `title`. Standardize on one term before public projection. See Q-06.
- **Creator identity:** vendor ID vs UTF-8 display name mismatch is not resolved in the coordinator schema — `source_items.name` may store display text while operator identity matching uses URLs. See D-04.

---

## 4. Active breaking points (code still present)

Items referencing **live code** that have not yet been resolved:

| ID | Location | Issue | Severity | Args |
| --- | --- | --- | --- | --- |
| NEW-01 | `src/config.ts:38` (`targetSaturationScore`) | Stale concept; heartbeat saturation measures queue completion, not ecosystem coverage | Low | P-07 |
| NEW-02 | `src/shared/node_protocol.ts` (`PlatformSchema`) | 11 platforms declared; curated/sellfy/custom_domain/vrchat adapters are offline-only — no approved source profiles | Medium | A-02, G3 |
| NEW-03 | `src/worker/local_sqlite.ts` | `submitResult()` curated outcome routing added but curated metadata observations have no defined schema path | Medium | G3 |
| NEW-04 | `src/node/observation_adapter.ts` | `parseCuratedDiscoveryLeads` accepts any HTTPS URL from HTML/Markdown; expansion policy (domain allowlist, depth) is unspecified | Medium | C-05, P-04 |

---

## 5. Items formally scheduled for future gates

| Item | Gate | Scope |
| --- | --- | --- |
| Open-web VPM feed discovery (ALCOM, GitLab, Codeberg) | G3 | No HTML spidering |
| VRCArena bilateral federation adapter | G3 | Bilateral data agreement required first |
| Avatar cosmetics taxonomy isolation and mesh association | G4/G5 | After ontology decision D-08/D-09 |
| Decentralized contributor ingestion via Worker gateways | Post-v1.0 | Node registration trust model (TOPOLOGY-02) first |

---

> User comment: Would probably merge this file into `DIRECTION.md`, though this was an agent artifact that needs to be carefully assessed before deletion.
