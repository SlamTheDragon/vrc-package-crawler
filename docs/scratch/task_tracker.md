# Active slice and checkpoint

## R44 — SDK taxonomy boundary, delivered locally

Theory: DesktopToolSubtypeSchema, DesktopToolEvidenceSchema and AvatarCompatibilitySchema are duplicate coordinator-internal classification definitions. No API wire field references them and no production SDK consumer imports them in the current repository. Keep UmbrellaSchema and its type, as the owner requested. Remove the private duplicates and prove their absence in built JavaScript, declarations and a separately installed tarball. Worker schemas remain unchanged. This does not implement dynamic tags or resolve registry identity/license.

Evidence: built-export regression failed with all three private schemas present, then passed after deletion. SDK: 41 pass/237 assertions. Full suite: 371 pass, 2 existing owner-config/layout failures, 2689 assertions in 40 files. SDK/node/Worker typechecks pass. Offline installed npm consumer passes ordinary Node, strict declaration exclusion, isolated Worker build and native runtime with zero external fetches. Distribution now has 31 files. Consumer retained at C:/Users/SLAMTH~1/AppData/Local/Temp/vrc-sdk-packed-oEYWLK. README lint: 0.76 findings/100 words. No registry or remote changes.

Owner proposal, not approval: rename the API service src-web to src-worker and create a separate static src-web consumer of src-package. Current frontend is starter scaffolding, while Wrangler already targets only the API entry. A rename requires panel build-root and watch-path updates before a main push. Browser integration lacks general authenticated CORS/preflight and user-auth verification. Keep operator secrets out of static assets. Do not rename, purge scaffolding or create deployments until the owner settles the proposal.

## R43 — coordinator classification ownership, delivered locally

Theory: desktop classification, umbrella/category derivation and avatar compatibility are coordinator projection policy, not node fetching. The only production caller is Worker D1 storage; the SQLite comparison fixture is the other caller. Nodes do not call them. Move the unchanged implementations and classifier tests into src-web/src/worker/domain/classification and src-web/tests/worker. Keep crawler SemVer tests in src-crawler; remove obsolete node exports, without forwarding wrappers. First run the relocated tests against absent modules, then verify classifier behavior, storage projection, typechecks and native Worker/D1. This does not settle dynamic profile/hierarchy semantics, add indexed JSON tags, or complete isolated SDK distribution.

Measured: relocated fixtures first failed on absent Worker modules. After migration, targeted checks pass 80 tests/357 assertions. Full suite: 372 pass, the same 2 owner-config/layout failures, 2687 assertions across 40 files. Node and Worker typechecks pass. Native Worker/D1 smoke passes with zero external fetches. Old classifier imports are absent. Algorithms are unchanged and crawler SemVer fixtures remain separate.

Worker dry-run passes at 2596.99 KiB, gzip 414.97 KiB. It includes three physical Zod copies from web/crawler/SDK node_modules, all version 4.6.5. The new web-owned imports expose another copy in the unresolved cross-project bundle. Do not conceal this through aliases. R15-C18 must prove clean dependency ownership, installation and bundle size after actual package consumption.

Owner requested Cloudflare panel setup suggestions. docs/research/CRAWLER_DEPENDENCY_RESEARCH.md now contains a checklist for main-triggered src-web builds, tool pins, registry dependencies, build/runtime secrets and isolated environments. It distinguishes current scripts from pending release prerequisites. Documentation lint: 1.83 findings/100 words (STE-flavored target below 2.5). No panel or remote data changes occurred.

Owner additions require furry/human(anime) base distinction and NSFW tagging. Preserve them as open capabilities: this relocation implements neither. Unknown content must not be silently asserted safe; evidence and moderation semantics need a later slice.

## R42 — owner Cloudflare build log, diagnosed

Inspected src-web/vrc-package-crawler.production.21d89f30-207f-4c95-b23b-56aaf01cf88a.build.log. Web dependency installation and generated Worker type check pass. Wrangler dry-run then fails with 15 sibling-import errors: zod (10), vrc-packages-api (5). Local installs in sibling trees hide this distribution failure. src-web does not declare the SDK; no web lockfile is tracked. Svelte prepare warning is nonfatal due to masked failure. Remote Bun 1.2.15 differs from local 1.4.2. No remote command ran. R15-C18 owns true independent distribution and reproducible build repair. Owner accepts temporary nonstandard staging; future dev/staging/prod isolation remains required.

## R41 — crawler SemVer ownership, delivered

Owner-marked version helpers now live in src-crawler/src/shared/taxonomy/vpm_version.ts using the existing semver package. The SDK source/version export and direct semver/@types dependency are removed; no compatibility wrapper was added. Behavioral fixtures moved to crawler tests. Built and installed SDK tests assert helper absence. SDK taxonomy still exposes schemas; duplicate evidence DTOs/dynamic vocabulary remain separate review work.

## Evidence — 2026-10-03

- New export boundary regression failed before migration, then passed in the full suite.
- Full suite: 372 pass, 2 existing config/layout failures, 2687 assertions, 374 tests in 39 files. Preserve owner-deleted config; do not restore obsolete dual-database behavior.
- SDK, node and Worker typechecks pass. Offline SDK lockfile refresh completed with no network access.
- Worker dry-run: 1826.54 KiB, gzip 295.21 KiB. Native local Worker/D1 smoke passes after relocation with zero external fetches. Existing previews.observability.issue_detection warning remains.
- Offline npm tarball consumer passes ordinary Node, strict declarations, isolated Wrangler/native Worker and removed-export checks. 33 distribution files, zero external fetches; retained consumer C:/Users/SLAMTH~1/AppData/Local/Temp/vrc-sdk-packed-WYDM98.
- No npm publication, remote deployment or remote D1 changes. Preserve dirty owner/earlier changes. Run artifact-cleaning verification sequentially.

## Owner decisions and immediate continuation

R40-C25: keep Tools/Assets/Avatars. Coordinator owns dynamic tag vocabulary/profile settings and attached JSON tag lists for canonical packages; SDK owns wire shapes, not tag values. Current catalog storage/DTO lacks tags and search uses heuristics. Plan storage round-trip, provenance-aware aggregation, permitted projection and real tag filtering. Exact hierarchy/profile contract remains deferred. A separate VPM umbrella is proposed, not approved; do not change enums or duplicate multi-front canonical packages without a precedence decision.

Node GET ownership remains R39-C24: operator provisioning has no user owner field/relation. User collection POST/SDK mutation DTOs are removed; app owned GETs and non-destructive singular removal reporting are delivered. Old direct notice mutation helpers and public delisting schemas still need audit.

R15-C17: acknowledgement-loss/reopen leaves a failed task; captured-wire replay works but no durable outbox stores it. Automatic recovery is absent. Registry identity/license, internal package placement, safe robots transport, source clearance/publication classes, Docker fleet and true real-source ingestion remain open in the canonical ledger. Three scratch files only; review pauses deferred; overall goal active.
