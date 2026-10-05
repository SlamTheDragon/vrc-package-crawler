# G14 — nine delivery paths and conditional main sign-off

## Authority

The full goal remains active. R57-C57A is open. Use the owner question hook before R57-C57B.
Keep the three scratch files. Preserve owner comments and unrelated edits.
Root delivery allocates only the next configured patch, synchronizes metadata, commits, tags and atomically pushes.
Keep failed tags fixed. Never align unrelated product patches or skip configured versions.
Website CI stays disabled. Worker release builds only, without production deployment or GitHub Release assets.
Worker links remain deferred to docs.vrcpackages.com. Keep isolated preview D1 fbef6ce1-4145-45ae-ae91-5d617a1f2672.
Release SDK keeps owner-approved staging and the v0.1 API-review hold.
The owner creates branches and performs the fresh clone after conditional sign-off. Do not delete this checkout.

## Accepted dependency mapping

| Project, both artifact channels | SDK | Network |
| --- | --- | --- |
| src-crawler | Preview latest, checked against preview config | Single configured YYYY.M.Patch archive |
| src-worker | Preview latest, checked against preview config | Same internal archive |
| src-crawler-client | Release latest, checked against release config | None |
| src-web | Release latest, checked against release config | None. Delivery disabled |

Bun owns installs, package scripts, checks and builds. Manifests and CI pin 1.4.2. Local Bun remains 1.4.1.
Node runs orchestration and compatibility checks. npm owns registry queries, packing, staging and OIDC publication.
SDK aliases remain latest. Existing installations require checked prepare:dev.
Network has a required SDK peer. Changed peer bounds require a checked new archive before consumer delivery.

## Current proof — 2026-10-06

| Delivery path | Version and run | Evidence |
| --- | --- | --- |
| SDK preview | 2026.10.5-pre, 37349103560 attempt 2 | Public npm bytes and five GitHub assets passed. Readback recovery made no second publication |
| SDK release | 0.0.5, 37349119431 | Owner-approved npm publication and GitHub promotion passed. Root checked all five assets and npm integrity |
| Crawler preview | 2026.10.4-pre, 37345238751 | CI passed. Root binary/receipt/checksum readback passed. GHCR manifest/config and latest matched the CI receipt |
| Crawler release | 0.0.4, 37345255800 | Protected publication passed. Root binary/receipt/checksum readback and independent GHCR manifest/config/latest checks passed |
| Desktop preview | 26.10.3-pre, 37345364715 | CI and root installer/receipt/checksum readback passed. Uses release SDK |
| Desktop release | 0.0.3, 37345381229 | Live pre-attachment review wait proved. Owner approval and publication passed. Root installer readback passed |
| Worker preview | 2026.10.5-pre, 37346723325 | Deployment and root Actions bundle readback passed after the isolated tooling repair |
| Worker release | 0.0.4, 37345503423 | Build and root Actions bundle readback passed. Production deployment skipped |
| Internal network | 2026.10.3, 37354313987 | Bun producer and both SDK-5 peer checks passed. All four hosted assets and exact deployment link passed |

Crawler deployment links passed: preview 6865068223 and release 6865131797.
Desktop deployment links passed: preview 6865219211 and release 6865227792.
Each points to its exact tagged Release. These checks do not prove installer execution or image-layer downloads.
Crawler preview image digest: sha256:bc9bd0ffb9021341f7e502cd252cba318f14a07bbfac33a5ed3a337adee8f4fe.
Crawler release image digest: sha256:788d45530b6a1f7b2d3c75c8bb7bf9d070401102c3bb052107cc0ed8fe06e673.
Its labels matched preview SDK 2026.10.3-pre, network 2026.10.2 and source a5d43284dadff1cc7ea6bd9070245416d8fdb9d0.
The six successful consumer/Worker trials used SDK 3 and network 2. They do not prove compatibility with a later SDK.

## Reliability findings and local checkpoint

Accepted cache direction, 2026-10-06: reuse compatible dependency downloads and let GitHub evict caches.
Working theory: tag-scoped caches alone cannot supply successive tags. Trusted default-branch warming supplies reusable entries.
Keys must exclude product version and source revision, but include dependency specifications, OS, architecture and Bun version.
Cache only public dependency downloads. Always run installation and distributed SDK/network checks. Never cache credentials or release outputs.
Replace automatic deletion with read-only usage monitoring. Custom quota changes and artifact/GHCR retention remain outside this decision.
Pinned cold/warm hosted proof passed. Runs 37354148172 and 37354314159 each passed all eight Linux/Windows warming jobs.
Bounded logs prove cold save and subsequent warm hits. Tagged network build 111912730622 also restored the trusted branch cache.

Working theory confirmed: bun --cwd path run script can print help and exit zero.
Commands use bun run --cwd path script. A regression proves actual forwarding, arguments and working directory.
Working theory confirmed: an empty tooling directory permits Bun to select a parent manifest.
Worker CI now creates a private tools manifest from its exact Wrangler pin before installation.
Local installation resolved Wrangler 4.147.0 at the expected path. Worker preview patch 5 passed that hosted path.
Failed Worker preview patch 4 remains fixed and did not replace the previous live preview.

Working theory confirmed: helper tests did not exercise the publication entry point after the Bun rename.
Both SDK publication callbacks referenced the removed npm function. Both now use packageCommand.
A real CLI fixture exercises direct preview publication and release staging, including receipt files and no automatic approval.
Latest root gate: 101 tests passed, zero failed, 1643 assertions. Syntax and whitespace checks passed.
The cache warmer refuses a Bun version other than the CI pin. Local Bun 1.4.1 cannot establish pinned cache-warming proof.
Earlier runtime checkpoint: crawler 137/839 and Worker 235/2051 passed. Worker typechecks/dry run and desktop check passed.
No runtime source changed in the publication repair. Local outputs contain development artifacts only.

Root Worker checks use declared fflate decoding, exact archive/file coverage, source/config receipts and tag rechecks.
Archive and bundle limits are 16 MiB each. Receipts are limited to 2 MiB.
Credentials stay on GitHub API requests, not signed storage requests. No local release files are written.

## Next actions and open risks

1. SDK preview 2026.10.5-pre and release 0.0.5 are public and root-checked.
   Release reconciliation 37352706548 passed. Public Release 403971149 retained the original five checked CI assets.
   Release tarball SHA-256: 2f033507c4e3e5f6b79f9b07b35fe4cb14762e8d201d72e38665c035eeb22632.
   Keep failed SDK 4 and published SDK 5 tags fixed.
   The readback repair requests registry revalidation and schedules 63 seconds of read-only retries within a 90-second deadline.
2. Network 2026.10.3 is public with SDK-5 peer bounds. All four assets passed root readback.
   Tag source a0416fd4bef66c87eebc589d421a6f29e7674472 and tag object c7d23fc3a24a686939e46a7cd98390dbfba19371 remain fixed.
   Tarball SHA-256: f52628d85b003b4014964e47af81fa2260ff342628fc8351d7940a4764427287.
   Deployment 6866559308 points to its exact tagged Release.
   Worker/crawler development preparation installed preview SDK 2026.10.5-pre and network 2026.10.3. Both typechecks passed.
   Desktop and website development preparation installed release SDK 0.0.5. Website source retains its declared preview version.
   Calling website release preparation failed closed on that expected metadata mismatch. Preview preparation passed without delivery or web artifacts.
   These are existing-checkout installs, not the owner's future fresh-clone proof.
3. Finish current consumer dependency proofs and the new cache path. Existing six consumer/Worker trials used SDK 3 and network 2.
   Root checks do not independently prove image layers or installer execution. Branch triggers and main protection remain unimplemented.
4. Owner accepts compatible dependency-cache reuse, GitHub-managed eviction and read-only monitoring instead of automatic deletion.
   Cache keys exclude release/source metadata. Tagged jobs restore only. Trusted default-branch warming supplies reusable public downloads.
   Normal installation and SDK/network checks always run. No credentials, node_modules or release outputs enter the cache.
   Live usage API passed: 1,830,379,310 bytes across 77 caches. Capacity is explicitly not measured.
   The earlier cap-query 403 no longer blocks read-only monitoring. No deletion or quota change ran.
   Hosted cold/warm and tagged cache reuse passed. Monitoring run 37354471371 passed with Actions read.
   Later usage read: 1,844,706,464 bytes across 78 caches. Counts are a point-in-time observation, not a quota guarantee.
   Bun executable caching remains action-managed and also showed cache hits. Compiled targets are not cached.
   Artifact, GHCR and account budget proof remains separate.
5. Complete C57A before the requested owner hook for C57B.
6. After pipeline setup, read attacker.md.secretresearch and commit sanitized findings in the ledgers.
   The input exists and remains unread. Never publish raw private research.
7. Main sign-off and the conditional goal pause require all requested checks and security intake. Conditions are not met.

Push approval is explicit. Checkpoints through da23807 and subsequent root delivery commits are on origin/main.
Do not describe a green run as a guarantee against future credential, dependency or platform failures.
Sign-off requires bounded failure, visible diagnostics and recovery evidence, not confidence.
