# Prototype capability audit

Audit date: 2026-10-03. Historical baseline: `09e9dc860290dac3ae977e560a0d693d99639646`. Current baseline: `3b9d203`.

This is a source comparison, not an instruction to restore the prototype. Prototype behavior can conflict with the current leased-only design.
The owner requests an API-only web service and an npm SDK for downstream operator, user, and app clients.
Specifications and LEGAL are drafts. Owner comments control intended changes. Current code controls descriptions of implemented behavior.

## Evidence and limits

- Historical sources came from `git show 09e9dc8:<path>`. The prototype was not executed and its tests were not rerun.
- Current crawler: `bun test` — 296 pass, 0 fail, 32 files.
- Current SDK: `bun test` — 33 pass, 0 fail, 4 files.
- Root: `bun test ./tests` — 2 pass, 2 fail, 1 file. Both failures involve absent `src-crawler/config.json`.
- Crawler and SDK: `bun run typecheck` — both pass.
- Documentation checker: nine issues before cleanup. Two are research links. Others involve `.obsidian` and agent-skill references.
- D1 tests use Bun SQLite in memory. They do not run workerd, real D1, multiple remote nodes, or the deployed service.
- No live source fetch or Cloudflare deployment occurred during this audit. The owner reports an existing Worker and D1 deployment.

The previous ledger's 333-pass claim does not describe this checkout. Passing tests also omit the counterexamples below.

## Top-down comparison

Historical paths below refer to commit `09e9dc8`. Current links point to this checkout.
“Partial” means a subset exists. “Absent” means no executable equivalent was found in the traced entry path.
It does not mean the feature is unwanted. Decisions remain separate from capability evidence.

| Capability | Prototype evidence | Current evidence | Reality and recommended next action |
| --- | --- | --- | --- |
| Process roles | `src/crawler/index.ts` ran eight loops with shared DB. Monitor, server, sync and export had separate commands. | [Worker entry](../../../src-worker/src/worker_entry.ts), [node main](../../../src-crawler/src/main.ts), [package scripts](../../../src-crawler/package.json). | Architecture replaced. Keep coordinator-directed leases. Retire the extra coordinator binary only after its operator functions have HTTP equivalents. |
| Job authority | Drivers called `db.queueUrl` and fetched additional URLs inside one task. | [lease runner](../../../src-crawler/src/runner/lease_runner.ts), [claim/submit](../../../src-worker/src/storage/d1/coordinator.ts). | Stronger boundary, but distributed claiming is unsafe under concurrency. Fix before fleet runs. |
| Network pacing | `src/ratelimit.ts`, adaptive limiter and Poisson scheduler supplied local per-host limits. | D1 `origin_leases`, fixed revisit delays, robots refresh reservations. | Replacement is incomplete. A local limiter cannot prove network-wide pacing. Test racing nodes and refresh requests. |
| Node outage handling | Worker loops retried, locks/IPC controlled shutdown. | [daemon](../../../src-crawler/src/runner/daemon.ts), [client](../../../src-crawler/src/client/node_client.ts). | Keeps polling after step errors. Heartbeat failure aborts leased fetch. Durable result replay and restart recovery remain unproven. |
| Local execution history | Frontier stored fetching/done/error state. Monitor showed metrics. | [node store](../../../src-crawler/src/storage/local_sqlite.ts) stores runs and task records. | New telemetry exists. No persisted result outbox was found. Several HTTP metrics stay null because runner passes duration only. |
| Operator control | IPC stop/status/recrawl/project, monitor dashboard and maintenance CLIs. | [operator handler](../../../src-worker/src/api/operator_handler.ts), local CLI, Worker logger. | HTTP profiles/leads/robots/nodes/catalog/takedowns exist. Full former monitor/maintenance behavior is not equivalent. Map needed operations before deletion. |
| BOOTH discovery | Category, search/tag pagination and item extraction in `src/drivers/booth.ts`. | [adapter](../../../src-crawler/src/adapters/observation_adapter.ts): browse leads and product metadata. | Partial. No prototype-scale reseeding/pagination loop. New leads await coordinator approval/rules. Preserve that control. |
| Gumroad discovery | Discover queries, seller portfolios, product pages and cross-links. | Product HTML parsing in `parseObservation`. | Partial. No equivalent Discover query/seller pagination path. Research authorized discovery interfaces rather than copy unleased fetches. |
| Jinxxy discovery | Browse categories/tags, products and sitemap tool scans. | Generic product parser with two-segment path match. | Partial. Default sample URLs are not real verified seeds. Access terms require separate review. |
| itch discovery | Browse feeds, searches, creator fallback and product pages. | Product parser on creator subdomains. Default profile targets central browse path. | Partial/dislocated. The browse profile does not supply an equivalent browse adapter. Do not restore robots-disallowed `/search`. |
| GitHub discovery | Search pagination, creator repositories, README/package probes, release-page links and recovery searches. | `parseGitHubRepository` supports exact public `/repos/{owner}/{repo}` REST metadata only. | Major coverage reduction. Search, README, contents and release evidence need separate scoped jobs and schemas if retained. |
| GitHub canonical catalog | Sanitizer projected accepted repository entities. | D1 links GitHub observations provisionally to existing VPM canonicals. | Standalone repo observations do not automatically create canonical packages. Conflicts with “everything is a package” intent. |
| VPM repository ingestion | Candidate URL probing, standalone manifests, federated listings and highest-version extraction. | Bounded recipe leads, package/repository parsing, SemVer validation, partial-batch diagnostics. | Better payload discipline. URL probing removed. Version policy and release histories need an explicit consumer contract. |
| Curated/community discovery | GitHub curated feeds, community repositories, Awesome VRChat and creator harvesting. | Curated source parser produces leads rather than product observations. | Safer authority boundary. Lost harvesting breadth is a research task, not automatic permission to scan every author domain. |
| New storefronts | No dedicated Shopify/Sellfy/Payhip adapters. | Shopify sitemap leads, Sellfy/custom-domain target policy and HTML product parsing. | Added coverage. Check provider/custom-domain identity and real fixtures. A supported enum alone does not prove ingestion. |
| Seeding | Large static feed/query sets plus repeated local queue injection. | [default seeds](../../../src-worker/src/storage/default_seeds.ts), `seedInitialProfiles`, `seedJob`. | Unsafe bootstrap: sample products, 2099 profiles and invented robots bodies. Separate reviewed access from seed discovery and real robots retrieval. |
| Relevance filter | `src/filter.ts` scored context, creator allowlists and excluded cosmetic assets. | Tags drive umbrellas/categories. Desktop heuristics and avatar compatibility exist. | Changed scope includes assets/avatars. Do not restore cosmetic exclusion. VRChat relevance and publisher claims need falsifiable fixtures. |
| Classification | `src/classifier.ts`, sanitizer classified tool/workflow categories and honored overrides. | [taxonomy](../../../src-worker/src/domain/classification/taxonomy.ts), [avatar compatibility](../../../src-worker/src/domain/classification/avatar_compatibility.ts). | Partial. Tag order can decide category. Generic HTML metadata can lack tags. Unknown must remain distinguishable from verified classification. |
| Duplicate matching | Sanitizer clustered package IDs, repository URLs, titles/authors and SimHash. `EntityMatcher` also existed. | Identity-link tables and explicit/provisional outbound matches. SimHash utility has no production importer. | Partial. Do not treat a utility or evidence enum as an active deduplication pipeline. Calibrate proposals before automatic merges. |
| Identity review | Prototype clustering directly formed catalog rows. | Accepted/provisional/rejected link states. | Improved model, incomplete isolation. Front projection uses provisional links while acceptedLinks output hides them. Audit false-merge exposure. |
| Raw evidence | `entities.raw_json`, quarantine fields, fetch metadata. | Immutable `source_versions`, events, digests, node/lease/profile provenance. | Better version evidence. Normalized observations are not full raw HTTP archives. Retention rules differ from old lake claims. |
| Publication authorization | Prototype facts/snippets were broadly exported. | Profiles store retain/publish classes. Node strips prose without retention permission. | Retention gate exists. D1 catalog ignores publish classes in the audited path. Fix publication independently of fetch permission. |
| Price and availability | BOOTH/Gumroad parsed prices. Other drivers often supplied zero/USD defaults. | Schemas/front tables accept price/currency/availability. Generic HTML parser returns none. | Data path partial. Current tests inject price fields directly. They do not prove live extraction. Never label unknown price as free. |
| Origin timestamps | Created/updated dates and confirmed/inferred/unknown fields. | `originUpdatedAt` feeds `published_at`, confidence confirmed/observed. | Semantic regression: modification is not publication. Missing dates stay null, but sort fallback uses observation time. Clarify before SDK stabilization. |
| Author/provenance output | Catalog exported authors, descriptions, tags, dependencies and platform URLs. | `CatalogPackage` exposes name/category/links/fronts/timestamps. | Reduced consumer projection. Source observations retain more than the API supplies. Decide exact output fields instead of assuming source storage is SDK capability. |
| Media galleries/video pointers | Drivers extracted image and YouTube arrays, sanitizer/export propagated them. | No media/video fields in audited observation/catalog schemas. | Absent. Direct origin pointers fit prior intent, but rights/publication review precedes extraction. |
| Image processing | `image_proxy.ts` fetched bounded images, Sharp/subprocess generated WebP, BlurHash, pHash and cached BLOBs. Server served media. | No Sharp or image pipeline in current entry paths. | Removed intentionally under zero-binary direction. Do not restore image caching/transcoding from prototype. LEGAL still describes absent proxy/hash capabilities. |
| SQLite catalog export | `src/tools/exporter.ts` created canonical/front/media tables and FTS5. Lake export used VACUUM INTO. | No current exporter command or exported catalog build path. | Absent. Decide whether offline catalog distribution remains required. Export had BLOB schema and copied all lifecycle rows, so it is not a safe template. |
| Local-to-edge replication | `src/sync/index.ts` wrote D1 via REST, checkpointed rowids, offered dry-run and local backups. | D1 is coordinator authority. No sync binary. | Architectural replacement, not a missing sync worker. Backup/export/recovery still need proof. Rowid watermarks missed in-place changes. |
| Consumer deltas | `/v1/catalog/delta` returned rowid cursor and payload digest. | `/v1/app/index/delta` uses epoch plus updated-time/ID cursor and delist records. | Improved cursor structure. Hard-delete tombstones, equal-timestamp changes and consumer restart need tests. No immutable change log found. |
| VPM distribution feed | `/index.json`, `/v1/vpm/index.json` generated a default `1.0.0` version. | No equivalent feed handler. Release evidence remains internal. | Removed unsafe generated version. Decide whether this is a discovery API or installable repository, never fabricate versions. |
| Search | Prototype exported FTS5 for local clients. | App-auth search uses SQL LIKE/category filters, random sample route and demand attribution. | Added online search, no FTS equivalence. Anonymous index only permits limit/cursor, not SDK query/filter arguments. |
| Feedback and steering | Server accepted five report branches. Steering applied corrections, tags, discovery queries and destructive flags. | `/v1/app/reports` records feedback and affects workforce allocation. | Reports stored, not a complete moderation workflow. No equivalent per-field curator overrides or review application loop. |
| Delisting | Opt-out table and lifecycle preservation existed. Server did not expose the later draft's proof routes. | `/v1/user/delist`, takedown list and operator verification. | High-risk implementation: pending unverified notices already delist. User token proves identity, not ownership of arbitrary targets. |
| API notice/CORS | Prototype had OPTIONS/CORS and optional report auth. | Some JSON helpers emit CORS. No common OPTIONS or terms-header layer in Worker dispatch. | Browser mutations need real preflight checks. LEGAL notice/header promises are not implemented by these helpers. |
| Consumer SDK | No separate npm SDK at baseline. | [SDK](../../../src-package/src/client.ts) covers operator/user/app. No node polling client exported. | Owner's separation largely exists. Crawler locally duplicates public schemas despite dependency. Publish artifact is TS source and has no tested JS/declaration packing contract. |
| Auth/ownership | Prototype optional admin token, fingerprint-based report throttling. | Hashed node/app/user credentials, capability bitmask, operator secret. | Better credentials. `/v1/app/register` accepts anonymous registration. User ownership of apps/nodes/content is not demonstrated. Decide principal responsibilities. |
| Logging | Prototype terminal monitor and persistent logs. | Structured Worker logs, node archives/rotation and task history. | Preserve useful logging. Bound retention and secret/query redaction. Runtime counters are not full tracing or incident recovery. |
| Packaging/deployment | Bun binaries for crawler/server/monitor/sync/export. | Node Linux build, Docker/Compose, GHCR workflow, two Wrangler configurations. | Packaging exists. Current crawler config uses placeholder D1 IDs. Web binds VRCP_D1 but coordinator expects DB. No tested deployed API wiring. |

## Reproduced counterexamples

These checks ran without network access with Bun 1.4.2 and an in-memory SQLite D1 adapter.
The adapter mirrors `createMockD1Database` in [the D1 tests](../../../src-worker/test/d1_coordinator_store.test.ts).
No credential was printed.

| Check | Setup | Observed output | Consequence |
| --- | --- | --- | --- |
| Concurrent claims | One due VPM job, one allowed origin, two registered nodes. Call both `claim` operations with `Promise.all`. | `statuses: ["leased", "leased"], sameJob: true` | Two nodes receive distinct live leases for one job. Transactional batch does not serialize preceding eligibility reads. |
| Publication denied | Retain normalized facts, set `publishClasses: []`, submit complete VPM observation. Call the store method used by public catalog. | `publicCatalogCount: 1` | Private evidence enters the public catalog path. Fetch/retention approval cannot substitute for publication approval. |
| Unverified creator notice | Submit DNS-proof text `not-verified` for a canonical item as unauthenticated creator. | `lifecycle: "delisted", reviewStatus: "pending"` | Proof text is recorded, not verified before destructive change. An anonymous actor can suppress another creator. |

Additional source-confirmed risks: claim writes lack a compare-and-swap predicate at coordinator lines 360–365.
Default robots constants enter storage through `seedInitialProfiles` at lines 103–107.
Publication fields are persisted but not checked in `buildCatalogPackage` or catalog list methods.
Delisting mutates queues/catalogs in `submitDelistRequest` before operator `verifyTakedown`.
These facts supersede broad previous gate-completion claims. Each fix needs a regression test on the D1 path and later workerd coverage.

## Decision matrix

| Keep | Research or clarify | Change before staging |
| --- | --- | --- |
| Worker/D1 authority, separate node process, typed leases, hashed credentials, bounded metadata fetches, provenance, lead quarantine | Publication fields, public search limits, ownership model, SDK package name/build, release history, offline exports, media pointers | Atomic claims, real robots retrieval, publication enforcement, proof-before-delist, API wiring, stale baseline/config checks |
| Assets/avatars alongside tools, scoped source profiles, zero archive downloads | Authorized discovery depth for GitHub/storefronts and author leads | Preserve uncertainty in prices/dates/classification. Do not convert matching labels into verified facts. |

Moving folders alone will not fix these defects. Migration must preserve the tested lease, provenance and policy boundaries.
Use the [critical ledger](IMPLEMENTATION_PLAN.md) for decisions and the [resource library](04_curriculum_and_core_philosophies.md) for external evidence.
