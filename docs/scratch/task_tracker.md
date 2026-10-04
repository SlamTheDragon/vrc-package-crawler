# G14 delivery checkpoint

## Authority and scope

Read the attached objective at each continuation. G14 delivery and G13 dependencies remain the active group.
The owner approves release SDK 0.0.0, preview SDK 2026.10.0-pre, automatic persistent Worker preview and checked release attachments.
New tags use vrcp-api, vrcp-network, cloudflare-worker, vrcp-crawler and vrcp-crawler-client prefixes. Config keys stay unchanged.
The owner retains npm stage approval and requests automatic GitHub Release publication after verified npm publication.
Retain the separate persistent preview Worker. Native Previews are a far-future metrics and resource-isolation review.
Do not approve protected GitHub jobs through saved credentials.
Keep production Worker and website deployment off. Release SDK v0.1, including prereleases, requires the full owner API review.

Version configs govern builds. Explicit preview bumps use the current UTC year/month and increment patch only.
Preview consumers keep vrc-packages-api through npm:vrc-packages-api-preview@latest.
Worker CI checks latest against the config, then installs exact registry bytes. Internal network dependencies remain pinned.
Each src-* project consumes distributed dependencies, not sibling source. Internal registry publication remains unauthorized.
Keep main and product-tag triggers. No automatic branch publication, version bumps or local release outputs.

## Evidence — 2026-10-05

Theory: checked CI assets can attach to existing immutable tags without another build, publication or deployment.
Product workflow → shared attachment job → original source run/tag/config → receipt check → draft uploads → checked publication status.
scripts/release-assets.mjs and tests/release-assets.test.ts exercise this path.
The new tag and draft-check group passed 45 cases/503 assertions, script syntax, unchanged version metadata and diff checks.
Remote checks for this group remain open. Earlier attachment verification passed 43 cases/466 assertions.
Negative cases cover altered bytes, duplicate names, unexpected files, wrong source runs, missing jobs and interrupted upload acknowledgment.
Draft recovery checks existing assets. Published assets cannot be overwritten.
Attachment runs 37237551535/37237553499/37237555591 passed at commit 12b26f1.
SDK release and preview each have five public GitHub Release assets. Worker preview has four.
Each CHANGELOG.md and CHECKSUMS.sha256 is public. All checksum entries match GitHub's uploaded asset digests.

| Channel | SDK source run | Checked public identity |
| --- | --- | --- |
| Release | 37234232443 | vrc-packages-api@0.0.0 |
| Preview | 37234232436 | vrc-packages-api-preview@2026.10.0-pre |

Both SDK runs target 8907ef2cfbade56e4686713076d13dd49f39c709. Owner npm promotion completed.
Public tarballs match their CI stage receipts. Checks used memory only, with no local release files.
Release SHA-256: 8765381936f006fc65fd41de53d4f20389c80127f4245bbdbe929d6b2f821ce8.
Preview SHA-256: 6727198ceb5ed87eeac6ec009ccf12eac56b23c216967abaa4546231e56ed404.

Worker preview source run 37235649307 passed build and deployment at the same commit.
Tag worker/v2026.10.0-pre has annotated object de30960e7fa864aa1002f2be0378a4048b4f0aa1.
Worker: vrc-package-crawler-preview. Version: 4a93db4f-8d7f-493b-9d85-76ead98d4510.
URL: https://vrc-package-crawler-preview.slamthedragon.workers.dev.
Preview D1: fbef6ce1-4145-45ae-ae91-5d617a1f2672. Production D1: 722bdd0d-92ca-445b-9319-da0b27adf7b2.
Unauthenticated operator init returned 401. An unknown path returned 404.
Malformed node claim returned a structured 400 before authentication. This does not prove a valid node request returns 401.
No remote schema initialization, source-access grant or real crawling ran. Initial setup must use autoSeed false.

SDK tag-recovery record: previous release object b69e6776deceffe3b45a9aa5ab49053156ce801c and previous preview object
8b6d64286e396588d3d696b30a8ccd1ea69dee95 pointed to 4d44ae2.
Current release object 0632985b758105e0f503957ede5d7d078ffe2a67 and preview object
4c279cd16b188576df2cee5d109e529ad78513cb point to 8907ef2.
Earlier preview recovery object b6d28f468c26374777a68c57fb9da3d24341b2da pointed to 5817cfe.
Published SDK versions and their tags must not move again.

## Next action and limits

Finish the grouped new-prefix and draft-check gate. Push it without issuing new product tags or version bumps.
Run sdk-release-reconcile.yml manually and retry the historical Worker attachment to check renamed-workflow compatibility.
The hourly draft check reads npm metadata, then dispatches original attachment verification. It never approves npm stages.
Remote operation with no drafts is not proof of a later staged-draft promotion. Keep that live trial open.
Owner setup: cloudflare-preview needs cloudflare-worker/v*. SDK environments need vrcp-api/v*.
Keep the SDK workflow filename, existing secrets and reviewer policy. GitHub trusted-publisher mappings remain unchanged.
SDK GitHub Releases remain drafts until public npm bytes match. Published releases do not change the repository-wide latest pointer.
Website workflow stays disabled. Docker images and Windows installers remain unverified remotely.
The empty docs/CHANGELOG.md stub moved into docs/source/CHANGELOG.md. Preserve the owner's unrelated .gitignore edits.

Q-NPM-OIDC records the trusted-publisher migration. CI still uses NPM_TOKEN for staging and inspection.
No authentication migration or version bump ran. After migration, propose release 0.0.1 and a current-calendar preview patch trial.
Q-DOCKER-CHANNELS queues container preview/release parity after current npm/Worker verification.
Q-ATTACKER-INTAKE remains unread until pipeline setup finishes. Do not publish private research.
Public catalog routes lack rights/age controls. Use synthetic data until those boundaries are settled.
Security, API ownership, source profiles, robots, fleet budgets, schema upgrades and durable recovery gates remain open.
G14 and the full pre-production goal remain incomplete.
