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
| SDK preview | 2026.10.4-pre, 37347261867 | Build passed. Publication failed before registry writes: npm is not defined. Version absent |
| SDK release | 0.0.4, 37347280896 | Build passed. Owner environment approval received. Staging failed at the same removed helper. Version absent |
| Crawler preview | 2026.10.4-pre, 37345238751 | CI passed. Root binary/receipt/checksum readback passed. GHCR manifest/config and latest matched the CI receipt |
| Crawler release | 0.0.4, 37345255800 | Protected publication passed. Root binary/receipt/checksum readback and independent GHCR manifest/config/latest checks passed |
| Desktop preview | 26.10.3-pre, 37345364715 | CI and root installer/receipt/checksum readback passed. Uses release SDK |
| Desktop release | 0.0.3, 37345381229 | Live pre-attachment review wait proved. Owner approval and publication passed. Root installer readback passed |
| Worker preview | 2026.10.5-pre, 37346723325 | Deployment and root Actions bundle readback passed after the isolated tooling repair |
| Worker release | 0.0.4, 37345503423 | Build and root Actions bundle readback passed. Production deployment skipped |
| Internal network | 2026.10.2, 37321030222 | Earlier four-asset proof passed. New Bun producer and next SDK peer-bound trial remain |

Crawler deployment links passed: preview 6865068223 and release 6865131797.
Desktop deployment links passed: preview 6865219211 and release 6865227792.
Each points to its exact tagged Release. These checks do not prove installer execution or image-layer downloads.
Crawler preview image digest: sha256:bc9bd0ffb9021341f7e502cd252cba318f14a07bbfac33a5ed3a337adee8f4fe.
Crawler release image digest: sha256:788d45530b6a1f7b2d3c75c8bb7bf9d070401102c3bb052107cc0ed8fe06e673.
Its labels matched preview SDK 2026.10.3-pre, network 2026.10.2 and source a5d43284dadff1cc7ea6bd9070245416d8fdb9d0.
The six successful consumer/Worker trials used SDK 3 and network 2. They do not prove compatibility with a later SDK.

## Reliability findings and local checkpoint

Working theory confirmed: bun --cwd path run script can print help and exit zero.
Commands use bun run --cwd path script. A regression proves actual forwarding, arguments and working directory.
Working theory confirmed: an empty tooling directory permits Bun to select a parent manifest.
Worker CI now creates a private tools manifest from its exact Wrangler pin before installation.
Local installation resolved Wrangler 4.147.0 at the expected path. Worker preview patch 5 passed that hosted path.
Failed Worker preview patch 4 remains fixed and did not replace the previous live preview.

Working theory confirmed: helper tests did not exercise the publication entry point after the Bun rename.
Both SDK publication callbacks referenced the removed npm function. Both now use packageCommand.
A real CLI fixture exercises direct preview publication and release staging, including receipt files and no automatic approval.
Latest root gate: 100 tests passed, zero failed, 1547 assertions. Syntax and whitespace checks passed.
Earlier runtime checkpoint: crawler 137/839 and Worker 235/2051 passed. Worker typechecks/dry run and desktop check passed.
No runtime source changed in the publication repair. Local outputs contain development artifacts only.

Root Worker checks use declared fflate decoding, exact archive/file coverage, source/config receipts and tag rechecks.
Archive and bundle limits are 16 MiB each. Receipts are limited to 2 MiB.
Credentials stay on GitHub API requests, not signed storage requests. No local release files are written.

## Next actions and open risks

1. Publication repair 096512b is pushed. Root automation queued SDK preview 2026.10.5-pre and release 0.0.5.
   Keep failed SDK 4 tags fixed. Release staging still requires GitHub review and separate npm approval.
   Preview run 37349103560 published version 5 but its bounded readback did not converge. Both public version and latest now resolve to 5.
   Keep the published tag fixed. Check its CI/registry bytes before same-source readback recovery. Do not publish again or advance its patch.
   Release run 37349119431 passed its build and awaits protected environment review.
2. After both SDK publications pass, publish the next network archive with their checked peer bounds.
   Current source peer bounds changed, but published network 2 still targets SDK 3. Do not claim clean-install readiness yet.
3. Finish all current producer/consumer dependency proofs. Both crawler GHCR manifest/config/latest checks passed.
   Root binary checks do not independently prove image layers. Branch publication triggers and main protection remain unimplemented.
4. Cache run 37345265811 confirmed HTTP 403 on operation=cap before selection or deletion.
   Existing policy uses an 80% threshold, 60% target and at most 25 old tag-cache IDs, with a conservative 10 GB ceiling.
   It protects branch, PR, recent and active caches and repeats identity checks before deletion.
   Critical R57-RETENTION records the unresolved scoped capacity source. Do not add administrator credentials or guess a cap.
   Prior read-only usage was 1,414,776,479 bytes. No cache deletion ran. Account/artifact/GHCR budgets remain unproved.
5. Complete C57A before the requested owner hook for C57B.
6. After pipeline setup, read attacker.md.secretresearch and commit sanitized findings in the ledgers.
   The input exists and remains unread. Never publish raw private research.
7. Main sign-off and the conditional goal pause require all requested checks and security intake. Conditions are not met.

Push approval is explicit. Checkpoints through da23807 and subsequent root delivery commits are on origin/main.
Do not describe a green run as a guarantee against future credential, dependency or platform failures.
Sign-off requires bounded failure, visible diagnostics and recovery evidence, not confidence.
