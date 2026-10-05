# G14 — release-channel announcements after C57B/security intake

## Authority and boundary

The full goal remains active. R57-C57A delivery checks passed on 2026-10-06.
The owner answered the requested hook: Proceed with C57B and security intake.
Milestone rules and sanitized research passed this documentation checkpoint.
Keep exactly three scratch files and preserve owner comments.
Root delivery allocates the next configured patch, synchronizes metadata, commits, tags and atomically pushes.
Failed and published tags remain fixed. Do not align unrelated product patches or skip configured versions.
Release SDK keeps owner-approved staging and the v0.1 API-review hold.
Website CI stays disabled. Worker release builds only, without production deployment or GitHub Release assets.
Worker links remain deferred to docs.vrcpackages.com. Preview D1 remains fbef6ce1-4145-45ae-ae91-5d617a1f2672.
The owner creates responsibility branches and performs the future fresh clone. Do not delete this checkout.

## Current nine-path proof

| Path | Configured version | Successful source run | Independent check |
| --- | --- | --- | --- |
| SDK preview | 2026.10.5-pre | 37349103560 attempt 2 | Public npm integrity and all five Release assets |
| SDK release | 0.0.5 | 37349119431 | Public npm integrity and all five Release assets. Reconciliation 37352706548 passed |
| Crawler preview | 2026.10.5-pre | 37356931567 | Six binary/receipt/note/checksum assets and GHCR manifest/config/latest |
| Crawler release | 0.0.5 | 37356959435 | Same six-asset and GHCR checks after protected review |
| Desktop preview | 26.10.4-pre | 37356987065 | Both installers and all five Release assets |
| Desktop release | 0.0.4 | 37357012826 | Same five-asset check after protected pre-attachment review |
| Worker preview | 2026.10.6-pre | 37357039766 | Preview deployed. Actions bundle, source/config receipt and tag passed |
| Worker release | 0.0.5 | 37357069065 | Actions bundle and receipt passed. Deployment job skipped |
| Internal network | 2026.10.3 | 37354313987 | Four assets, SDK-5 peers and exact deployment link |

Six root commands each allocated one patch, committed, tagged and atomically pushed without manual metadata repairs.
All six resulting CI runs passed. No new SDK or network publication was needed.
An initial Worker status query failed without a mutation. Later exact-run and archive checks passed. No rerun or bump followed that observation.

## Dependency and runtime evidence

| Project, both artifact channels | SDK | Network |
| --- | --- | --- |
| src-crawler | Preview latest, checked as 2026.10.5-pre | 2026.10.3 |
| src-worker | Same preview SDK | Same network archive |
| src-crawler-client | Release latest, checked as 0.0.5 | None |
| src-web | Same release SDK | None. Delivery disabled |

All four existing-checkout development installations passed their assigned distributed dependency checks.
Worker/crawler typechecks passed. Source manifests keep latest SDK aliases and exact network archive URLs.
Network peer bounds accept release SDK 0.0.5 and preview SDK 2026.10.5-pre.
The six current hosted consumers use those dependencies, not the previous SDK-3/network-2 pair.

Hosted Bun 1.4.2 logs confirm root 101/1643, crawler 137/839 and Worker 235/2051, with zero failures.
CI also passed product typechecks, native Worker checks, container runtime checks and desktop builds.
Local Bun remains 1.4.1. Do not call local checks a pinned-Bun proof.
No local release outputs were created.

Crawler preview digest: sha256:96ae31a95754d31e60b263313a6e615e1d64ab4d461e9d6a85b297e6c3b4846f.
Crawler release digest: sha256:42667113605ab4ddfcdfbb3f3c46c206c7dc8d7381590572e536972502846263.
Publication receipt artifacts: preview 11365640465 and release 11364802945.
Independent checks matched image config hashes, source/dependency labels, non-root runtime settings and latest.
No independent image-layer download or installer execution ran.

Worker preview artifact 11365565369: bundle SHA-256 a5eaa2de3e04dbcc79959cbb7026396e15a86354a74b07d7ceadd9eef2154bbf.
Worker release artifact 11364987275: bundle SHA-256 fc9835e3feb0df2797a89dcb5f9f2b8cf8cfc917f1aa449f0776edf3e473759c.
Checks bound the archive and receipt to the immutable tag, source and Wrangler configuration.
Credentials stayed on GitHub API requests, not signed storage requests.

## Deployment links and caches

All seven distributed-product cards passed live success/link checks.
SDK preview/release records 6865810902/6865701447 point to their npm package pages.
Crawler preview/release records 6867000946/6867055010 point to their exact tagged Releases.
Desktop preview/release records 6867156773/6867147869 do the same.
Network record 6866559308 points to vrcp-network/v2026.10.3.

Owner accepts compatible download reuse, GitHub-managed eviction and read-only monitoring, not automatic cache deletion.
Cold 37354148172 and warm 37354314159 each passed eight Linux/Windows warming jobs.
Current tagged crawler jobs 111921724857/111921724752 and Worker job 111921973709 show exact dependency-cache hits.
Installations and distributed-contract checks still ran. Normal tagged jobs restore without saving dependency caches.
Keys include dependency specifications, group, OS, architecture and Bun, but exclude product version and source revision.
The warmer checks actual Bun 1.4.2. No credentials, node_modules, compiled targets, D1 state or release outputs enter these caches.
Bun executable caching remains action-managed. Monitoring 37354471371 passed with Actions read.
Latest recorded usage: 1,844,706,464 bytes across 78 caches. Capacity is not measured.
Artifact, GHCR and account budgets remain separate. No deletion or quota change ran.

## Current documentation gate

DELIVERY.md now describes current commands, dependency mapping, environment rules, staging, immutable retries and cache behavior.
Obsolete OIDC/MSI pending claims and historical tag-replacement grants were removed.
Human procedures remain separate from AGENT_DELIVERY_PROCEDURE.md.
Documentation lint: DELIVERY 1.15 issues per 100 words. Whitespace checks passed.

Rules and the separate agent procedure select changed products after grouped capability checks.
They preserve root delivery chains, immutable tags, dependency channels and release approvals.
Removed orientation paths were replaced with the canonical ledgers. Source/test edits are not subject to the scratch-file limit.

The private research was read in full. Its raw file remains ignored and must not enter commits or artifacts.
Sanitized findings and a trust-boundary diagram are in API_CONTRACT_REVIEW.md.
The crypto shelf and C38 proposals now require manual operator/staff review, not automatic removal.
Confirmed code gaps: unenforced app permissions, node body parsing before bearer checks, and unredacted exception/URL diagnostics.
No limiter appears in inspected API code/bindings. Dashboard protections are unknown.
Bound SQL parameters and lease/profile/robots/replay checks exist. No successful injection or poisoning exploit was demonstrated.
Q-API-RESOURCE-BUDGET and Q-NODE-OBSERVATION-TRUST queue the remaining audits. Diagnostics extend existing R53-C37/Q-SDK-ERRORS.
Bot impersonation stays with the identity/source-access gates. No identity evasion or outbound credential disclosure is approved.

No runtime code, source access, protocol, credential or infrastructure setting changed in this gate.
No ceremonial version bump or publication is needed. Static research is not an exercised security guarantee.
Checks passed: relative links, owner-comment preservation, private-input exclusion, three-file scratch footprint and whitespace.
Documentation lint: agent procedure 1.10, API audit 1.89, crypto shelf 2.02 and tracker 1.72 issues per 100 words.
The sanitized checkpoint is committed. Product-local output and branch/main checks follow below.
The owner creates branches and performs the fresh clone after conditional sign-off. Website delivery stays disabled.
Legal/age/creator-rights decisions and source-access profiles remain separate from delivery success.

Push approval is explicit. The nine-path proof is committed as 92200c2 and the owner hook as 7d60cae.
The full goal is not complete. A green run cannot guarantee future credential, dependency or platform behavior.

## Active release-announcement slice

C57B and sanitized intake are committed and pushed as 8543802. The slice-commit/gate-push amendment is 1302681.
Owner requests Discord embeds for API, crawler and client, after final green delivery, with separate release and preview destinations.
Both webhook values are encrypted in repository Actions secrets DISCORD_RELEASE_WEBHOOK and DISCORD_PREVIEW_WEBHOOK.
Neither value enters source or artifacts.
Implementation is unverified: terminal workflow, bounded receipt, public release/source/tag checks, embed/button and persistent duplicate guard.
Draft, Worker, network and website paths stay silent. No live Discord message or historical backfill ran.
At the grouped gate checkpoint, run root tests and script/YAML checks. Hosted notification proof waits for the next normal release.

Post-C57B output inspection: root tests passed 101/1643 on local Bun 1.4.1, with no new or removed root entries.
Crawler fixtures use product dist/tests. Worker helpers use product dist/tests; two older fixtures still use OS temporary storage.
SDK distribution fixtures rebuild product dist. Root synthetic repositories and release/cache fixtures use scoped OS temporary folders.
Hosted outputs stay under the relevant product or runner temporary storage.
Remote main is unprotected; only main exists, and no rulesets are configured. Preview push automation is not active.
Protected-main promotion must reconcile the current root chain's direct branch push before conditional sign-off.
