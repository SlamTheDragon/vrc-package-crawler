# Active slice and checkpoint

## R40 — coordinator-owned tags and taxonomy boundary

Owner direction: keep Tools, Assets and Avatars; tags below them belong to Worker profile settings and ingestion, with attached JSON tag lists on canonical packages. SDK owns wire shapes, not indexed vocabulary. Current canonical storage/public DTO lacks tags; search tags use category/name/avatar heuristics. Hardcoded classifiers live in crawler shared modules imported by Worker; SDK has duplicate evidence DTOs and crawler SemVer helpers with owner move-back FIXMEs.

Latest owner proposal: a separate VPM umbrella is under consideration, not approved. Compare an orthogonal distribution facet/section with a mutually exclusive umbrella and explicit precedence. Preserve multi-front canonical identity. R40-C25 in IMPLEMENTATION_PLAN.md retains the direction and unresolved hierarchy/profile contract.

## Delivered API slices — R38/R39

- Actual handler-backed SDK regression reproduced rejection of extra signalId. Report responses now validate published reportId receipts; demand/issue remain 200, removal remains 202. Stored demand IDs and scheduling behavior are unchanged.
- User node collection POST, SDK registerNode and obsolete registration DTOs are removed. Regression verifies no credential issuance, replacement, reactivation or audit writes. Operator provisioning remains.
- App owned list/detail GETs remain delivered; collection POST is absent. Pending removal reports do not suppress or establish ownership. Random sampling and user delisting remain absent.

## Evidence — 2026-10-03

- Targeted user/downstream/SDK: 32 pass, 196 assertions before obsolete DTO fixture removal.
- Final full suite: 371 pass, 2 existing config/layout failures, 2674 assertions, 373 tests in 39 files. Do not restore owner-deleted dual-database config to make tests green.
- SDK/node/Worker typechecks pass. Worker dry-run: 1827.06 KiB, gzip 295.18 KiB. Existing previews.observability.issue_detection warning remains.
- Native built Worker/D1 checks pass SDK parsing of report HTTP receipts for all three types and retired user-node HTTP dispatch, plus previous lease, robots, revocation and ownership checks; zero external fetches. A concurrent SDK clean-build interrupted one native attempt; sequential rebuild/retry passed. Run artifact-cleaning verification sequentially.
- Final offline packed consumer passes Node, declarations, Wrangler build and native Worker; registerNode is absent. 35 files, zero external fetches. Retained consumer: C:/Users/SLAMTH~1/AppData/Local/Temp/vrc-sdk-packed-uqFLeT.
- No registry publication, remote deployment or remote D1 changes. Preserve dirty owner/earlier changes.

## Deferred boundaries and continuation

Node ownership GETs remain unresolved under R39-C24: documented operator issuance has no user owner field/relation. Do not infer owners from audit actors or invent a registration route. Operator issuance upsert and atomic audit need review. Old direct notice mutation helpers and public delisting schemas still need audit.

R15-C17: acknowledgement-loss/reopen leaves a failed task; captured payload replay works but no durable outbox stores it. Automatic recovery is absent. Cloudflare Builds isolation, internal package ownership/license, safe robots transport, source clearance/publication classes, Docker fleet and true real-source ingestion remain open in the canonical ledger. Three scratch files only; review pauses deferred; overall goal active.
