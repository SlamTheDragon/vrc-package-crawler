# G14 — R57-C57A delivery checkpoint

## Authority and active boundary

The full goal remains active. The owner requires patch-1 proof for each enabled product and channel.
Main remains the delivery branch until proof and owner review permit the responsibility split.
Website CI stays disabled. Worker release builds only, with no production deployment or GitHub Release assets.
Release SDK publication keeps owner-approved npm staging. The v0.1 API-review hold remains.
Published tags and assets are immutable. No local release artifacts, source grants or D1 writes ran.
Preserve owner edits to README.md, API_ROUTES.md and the changed product manifests.

## Working theory and current slice

Theory: stream binary hashes to support larger builds without proportional memory use.
Keep package bytes for npm integrity checks. Retain receipt, source, remote-tag, checksum and hosted-digest checks.
Binary limits: less than 2 GiB per file, 4 GiB total, 30 minutes per file.
Buffered limits: 2 MiB per metadata file, 256 MiB total, three minutes per file.
The previous preview Linux download passed after 988.97 seconds. Slow transfer, not missing publication, explains that timeout.
This does not prove the remaining crawler assets or make every future link fit the deadline.

The next related slice adds exact Release links to crawler deployment cards and attachment summaries.
SDK cards retain their npm registry URLs. Pending drafts are labeled as pending publication.
Worker links remain deferred. Future owner target: https://docs.vrcpackages.com. No DNS or route changes.

## Patch-1 proof inventory

| Product | Release CI | Preview CI | Independent proof |
| --- | --- | --- | --- |
| SDK | 37255187559; promotion 37257987859 | 37300054964 attempt 2 | Both npm identities, archive integrity and five assets per Release passed |
| Network | 37301273812 | 37251743937 | Both four-asset Releases passed |
| Crawler | 37301626762 | 37301612185 | Both GHCR config hashes, channel labels and version/latest agreement passed. Preview Linux bytes passed. Other hosted binary checks remain open |
| Desktop | 37248173416 | 37301287106 | Both five-asset Releases passed. Historical release SDK dependency remains 0.0.0 |
| Worker | 37301598940, deployment skipped | 37301422846, preview deployed | Both CI bundle hashes, receipts and source identities passed. Unauthenticated initialization returned 401 |
| Website | Disabled | Disabled | Owner excludes delivery |

Release versions are 0.0.1. Preview versions are 2026.10.1-pre, except desktop 26.10.1-pre.
Both crawler publication and attachment CI runs passed. Independent binary proof is separate from those CI results.
Preview Linux: 82,707,936 bytes. SHA-256: 6a77bbf82f5a560576b4945c47f37e47866fdecc5a06561e06c88a6664662d0d.
Crawler config hashes: release e9770496ab3492834c51c62fe1b7151916bfa3f096e0ac2f60831824e11e40f2, preview d155f5779701a977fdbeda6d0599894520f81a2b1263034eff5807229a583402.
The preview environment has no required reviewer. Its tag restriction remains. Release protection is unchanged.

## Repair evidence and verification

SDK preview OIDC exchange succeeded, but its project .npmrc shadowed the exchanged credential.
Publishing the checked archive from the root fixed that conflict. Release staging remains unchanged.
The published preview tag object is c969e54d1a1aeebf2175bede1b0f0af2b3d42c45 at source 12d2ed17333f2bead05339712698dedac84cee57.
Earlier owner-authorized tag replacements remain recorded in Git and the delivery checkpoint commits. No published tag moved.
Immediate npm readback failed once. Later CI/npm byte comparison and same-source retry passed without republishing.

Grouped streaming/link checks: 34 tests passed, zero failed, 369 assertions. Both script syntax checks and diff checks passed.
Negative cases include excess size, truncated or empty bodies, corruption, missing digests, unavailable downloads and invalid receipt/platform coverage.
Checks also reject injected summary targets, Worker releases, duplicate binary inputs and unexpected package digest inputs.
Live verification of new deployment links remains pending. Existing deployment cards do not change retroactively.
Earlier full-root check: 72 passed, two failed because local bootstrap manifests were not synchronized with release config.
Current grouped results do not claim full-root conformance or installer execution.

## Open risks and next actions

Complete remaining crawler hosted-byte checks without moving tags or rebuilding published outputs.
Check new Release links on the next authorized product delivery. Do not create a patch solely to change old deployment cards.
R57-RETENTION remains open: measured caches 0.97 GiB and CI artifacts 0.73 GiB, with most artifacts retained 90 days.
Confirm account budgets and cache cap before unattended branches. No storage deletion, paid limit increase or retention change ran.
Keep R57-C57A open until proof and owner review pass. Then prepare responsibility branches and reviewed main promotions.
R57-C57B requires the requested owner question hook. Private attacker research waits until pipeline setup finishes.

## New owner queue

R57-NETWORK-SINGLE replaces future network release/preview delivery with one rapid YYYY.M.Patch stream, without -pre.
Preserve old published identities. Other products retain their channel rules.
Critical coupling: node_protocol.ts imports the SDK credential schema. Review how one archive can serve both consumer channels safely.
R57-DEV-INSTALL then selects verified hosted tarballs for local installs. Bare bun install currently requests an unpublished npm package and fails.
The SDK preview alias already uses latest. Network latest must resolve through checked GitHub assets, not npm.

Research now identifies only one SDK import in the network protocol: the node-ID rule from IssueNodeCredentialSchema.
Both published patch-1 SDK sources contain the same rule. This does not prove packed compatibility.
The infrastructure research shelf records a consumer-supplied peer candidate and required npm/Bun dual-channel checks.
Ordinary * and >=0.0.0 ranges exclude the preview prerelease. Do not hide compatibility gaps with force or legacy-peer-deps.
The network README now distinguishes published GitHub archives from the absent npm package and queued single-stream migration.

Active readback: exec session 52813 runs delivery:check for vrcp-crawler/v0.0.1 with streaming hashes and bounded deadlines.
The session was still live at its latest poll. No success or failure result exists yet.
Resume by polling this exact handle. Do not restart merely because an observation timed out.
