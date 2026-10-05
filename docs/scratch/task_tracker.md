# G14 — delivery proof and conditional main sign-off

## Authority

The goal remains active. R57-C57A is the current delivery gate. R57-C57B requires the owner's question hook before work starts.
Configured versions are authoritative. Allocate only the next patch through the root chain. Keep failed tags fixed.
Website CI stays disabled. Worker release builds only, without production deployment or GitHub Release assets.
Worker links remain deferred to the future docs.vrcpackages.com target.
Release SDK publication retains owner-approved npm staging and the v0.1 API-review hold.
The owner will create branches and perform the fresh clone after conditional sign-off. Do not delete this checkout.

## Accepted dependency and tool mapping

| Project, both artifact channels | SDK | Network |
| --- | --- | --- |
| src-crawler | Preview latest, checked against preview config | Single configured YYYY.M.Patch archive |
| src-worker | Preview latest, checked against preview config | Same internal archive |
| src-crawler-client | Release latest, checked against release config | None |
| src-web | Release latest, checked against release config | None. Remote delivery disabled |

Bun owns installs, package scripts, checks and builds. Manifests and CI pin Bun 1.4.2.
The installed local Bun is 1.4.1. Node runs orchestration and compatibility checks.
npm remains the registry, packing, staging and trusted-publication interface.
Network uses a required SDK peer. Changed peer bounds require a new checked archive before consumer delivery.

## Latest gate checkpoint — 2026-10-06

Working theory: changing package manager syntax can silently skip checks even when the process exits successfully.
The live check confirmed that `bun --cwd path run script` printed help and exited zero on local Bun.
Commands now use `bun run --cwd path script`. An execution regression checks every product forwarding script.
The test preserves product arguments and proves that the root command executes.

- Root: 93 tests passed, zero failed, 1397 assertions.
- Crawler: typecheck passed. 137 tests passed, zero failed, 839 assertions.
- Worker: generated types and typechecks passed. 235 tests passed, zero failed, 2051 assertions.
- Worker preview dry run passed with isolated preview D1 fbef6ce1-4145-45ae-ae91-5d617a1f2672. No remote deploy or D1 write ran.
- Desktop: Svelte check passed with zero errors and warnings.
- Checked development preparation passed for Worker/crawler with preview SDK 2026.10.3-pre and network 2026.10.2.
- Desktop preparation passed with release SDK 0.0.3 despite its preview artifact channel.
- Metadata sync selected existing preview versions without allocating patches. Development outputs stay product-local.

## Hosted delivery baseline

These checks predate the new Bun command order and fixed project dependency mapping. Do not treat them as current-channel proof.

| Product | Delivered proof | Remaining check |
| --- | --- | --- |
| SDK 3 | Preview run 37316086763 attempt 2 and release run 37316100746. Both npm identities and five assets passed independent checks | New Bun producer workflow trial |
| Network 2026.10.2 | Run 37321030222. All four hosted assets passed. Deployment 6860981068 links to its exact Release | New producer workflow trial if changed peer bounds need publication |
| Desktop 2 | Preview run 37318551722 and release run 37321046041. Five assets per channel passed. Deployment links passed | New preview trial with release SDK. Protected attachment job needs hosted review proof |
| Worker 3 | Preview run 37322988392 deployed. Release run 37323008883 passed build and skipped deployment. Root checker passed both bundle archives | New mapping/Bun workflow trial |
| Crawler 3 | Preview run 37323027639 and release run 37323046478 failed at container dependency checks, before publication | Repaired guard is committed in ff6720f. Next actual trials allocate patch 4 |

Network tag object: 8bcb75d5587409966722580923dbb23f40fd9a62.
Desktop release tag object: 1c44d936b1f3b28ca7f3c948395330df78da238a.
SDK release latest is 0.0.3. SDK preview latest is 2026.10.3-pre.
Exact-version selectors reject changed registry identity or bytes. Existing installations require prepare:dev after publication.

## Open delivery risks and next actions

Root-chain trials are now pushed: crawler preview/release 4, desktop preview/release 3, and Worker preview/release 4.
Crawler preview run 37345238751 passed publication and root hosted binary readback. Container readback and deployment links still need independent checks.
Worker preview run 37345486644 built successfully but failed before deployment because the expected pinned Wrangler CLI was absent.
Working theory: Bun searches parent manifests when the generated tools directory has no package.json, so the executable installs outside the expected directory.
Repair the tool manifest before installation. Derive its exact Wrangler pin from the Worker manifest and check the executable before deployment.
The repair passed 99 root tests, zero failures and 1537 assertions. Local Bun installed Wrangler 4.147.0 at the exact isolated path.
Keep failed Worker patch 4 fixed. The next actual preview trial must allocate patch 5.
Cache run 37345265811 confirmed HTTP 403 on operation=cap, before selection or deletion. Do not add administrator credentials or guess an unmeasured cap.
Crawler preview deployment 6865068223 links to its exact patch-4 Release. Desktop preview run 37345364715 passed CI and attachment.
Crawler release run 37345255800 and desktop release run 37345381229 passed builds and await owner environment review.
The desktop guard now proves a live pre-attachment wait. The owner question hooks contain both exact run links.
Worker release run 37345503423 passed build and skipped production deployment. Its archive still needs root byte readback.

1. Finish the final diff, documentation and clean-checkout checkpoint. Preserve the owner's README changes.
2. Run changed delivery paths through root commands. Do not force all products to the same patch.
3. Desktop release protection now gates attachment itself, with the exact Release URL on that job.
   The shared steps use a YAML alias, without a second post-publication review job. Manual retries select the same environment.
   Working theory: a later deployment-record guard cannot protect earlier published assets. Root 94/1453 passed, including tagged and manual routing.
   Preview remains automatic. Release uses the existing protected environment. Hosted review behavior remains unverified.
4. Worker bundle proof passed in memory without writing release files. Archive digests, file coverage, source receipts, configuration and unchanged tags matched.
   Preview artifact 11350297918: bundle SHA-256 3317b7412ad2399556a9a4bae31275da2775e37aef92d3fc28a2f1bfe47af453, 1,060,537 bytes.
   Release artifact 11350498030: bundle SHA-256 2bc610a6ce3bb9b85cb863489d2b0ba9115aa524f4360e67d47b5e140ec42e0c, 1,060,529 bytes.
   This used Python's standard ZIP reader and the existing receipt contract.
   Root delivery:check now passed both exact archives with declared fflate decoding and the existing receipt contract.
   Root gate: 98 tests passed, zero failed, 1524 assertions. Negative cases include expired/ambiguous artifacts, changed receipts, moved tags, unsafe redirects, ZIP sizes and duplicate names.
   The archive and bundle budgets are 16 MiB each. Receipts are limited to 2 MiB. Credentials stay off signed storage requests.
   Source-access profiles, leases and catalog behavior did not change. Their runtime tests are outside this root-verifier change.
5. Diagnose cache maintenance with its fixed operation/status output. Run 37323059939 returned 403. Do not add administrator credentials.
   Read-only local usage was 1,414,776,479 bytes against 10 GB. No cache deletion ran.
   The policy selects at most 25 old tag-cache IDs at 80% usage toward 60%. It protects branch, PR, recent and active caches.
   Artifact, Release, npm and GHCR data are not deletion targets. Account storage budgets remain unverified.
   Read-only inspection of latest cache run 37323388985 found no operation diagnostic. The new diagnostic still needs hosted execution.
6. Complete C57A before the requested owner hook for C57B. Branch automation and main protection remain unimplemented.
7. After pipeline setup, read attacker.md.secretresearch. Commit sanitized findings in the ledgers before sign-off.
   The private file exists and remains unread. Never publish the raw input.

The final sign-off and pause conditions are not met.

The owner approved the push. Checkpoints through a43614a are now on origin/main.
The new verifier passed local tests and live readback without deployment or release-file writes.
Commit and push this checkpoint before the next configured delivery trials. Preserve the owner's README edit unchanged.
The goal remains active, not complete or paused.
