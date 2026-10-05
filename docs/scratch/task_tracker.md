# G14 — delivery proof and conditional main sign-off

## Authority and next boundary

The full goal remains active. Configured versions are authoritative. Each delivery allocates exactly the next patch.
Do not force products to patch 3, skip versions or allocate SDK4 merely to repeat a successful delivery.
A preview delivery bump must queue its appropriate build and deployment/publication chain.
Website delivery stays disabled. Worker release builds only, with no production deployment or GitHub Release assets.
Worker links remain deferred, with https://docs.vrcpackages.com as the future target.
Release SDK publication keeps owner-approved npm staging. The v0.1 API-review hold remains.
Preserve owner changes to README.md, API_ROUTES.md, the canonical ledger and product manifests.

Before sign-off, finish preview installs, single-stream network delivery, bump automation and live delivery links.
Review R57-C57A and R57-C57B. Keep the requested before-C57B question hook.
Read attacker.md.secretresearch after pipeline setup. Map its findings into the ledgers and commit the final intake before pausing.
Do not publish raw private research. The file exists and remains unread.
Pause only after these explicit conditions pass. The owner will create branches and perform the fresh clone.
Do not delete this checkout or create branches on the owner's behalf.

## Completed patch-1 proof

| Product | Release CI | Preview CI | Independent proof |
| --- | --- | --- | --- |
| SDK | 37255187559; promotion 37257987859 | 37300054964 attempt 2 | Both npm identities, archive integrity and five assets per Release passed |
| Network | 37301273812 | 37251743937 | Both historical four-asset Releases passed |
| Crawler | 37301626762 | 37301612185 | Both six-asset Releases passed. Both GHCR config hashes, channel labels and version/latest agreement passed |
| Desktop | 37248173416 | 37301287106 | Both five-asset Releases passed. Historical release SDK dependency remains 0.0.0 |
| Worker | 37301598940, deployment skipped | 37301422846, preview deployed | Both CI bundle hashes, receipts and source identities passed. Unauthenticated initialization returned 401 |
| Website | Disabled | Disabled | Owner excludes delivery |

This table records historical patch-1 proof. Current configured SDK versions are release 0.0.3 and preview 2026.10.3-pre.
Session 52813 completed successfully. The root release checker proved all six crawler assets, source receipts, notes, checksums and remote tag identity.
Release Linux SHA-256: 8fdd8aa72ba1107f208a1a8e38d9af1f20ee9054856551e0de25ca0f8d5bdefe.
Release Windows SHA-256: d354a817e25bcef3d3ed626df48caf5ab5ad49ccf9e8a8f8e1fd7d0ff8aaf174.
Session 1748 completed successfully. It checked preview Windows bytes, receipt, CI source and the unchanged tag.
Preview Windows: 87,480,320 bytes. SHA-256: 442553b3d2c5981d4ef0c7490d8e9467c408793d3f9584e208efed8661ddf745.
Preview Linux: 82,707,936 bytes. SHA-256: 6a77bbf82f5a560576b4945c47f37e47866fdecc5a06561e06c88a6664662d0d.
A separate metadata read reconciled both completed body hashes with all receipts, notes and checksum coverage. Remote tag checks passed before and after.
No proof process remains live. No artifact bytes went to disk, published tag moved, D1 write ran or source grant changed.

## Links and verifier evidence

Crawler deployment 6857540746 now links to the preview tag Release. Deployment 6857634454 links to the release tag Release.
Both were already successful. Only a success-status link was added, with API readback and preserved original job logs.
No new deployment, image, tag or approval rule was created.
Future workflow cards and attachment summaries have exact Release links. Patch-2 CI must exercise them.
SDK cards retain their npm registry URLs.

Streaming/link regressions passed 34 tests, zero failed, 369 assertions. Syntax and diff checks passed.
Binary bounds: less than 2 GiB per file, 4 GiB total and 30 minutes per file.
Metadata bounds: 2 MiB per file. Buffered archives: 256 MiB total and three minutes per file.
The earlier full-root check had two failures from unsynchronized bootstrap manifests. Do not claim full-root conformance from grouped results.

## Immediate implementation tasks

Local gate checks passed: 82 root regression tests, zero failures, plus syntax and diff checks.
Network verification packed one development archive and checked it against release SDK 0.0.1 and preview SDK 2026.10.1-pre.
Both SDK selections passed separate npm and Bun installs, Node/Bun runtime checks, declarations, shared schema identity, and native Worker checks with zero external fetches.
The hosted network installer checks release assets, checksums, receipts, successful source CI and unchanged remote tags. Its new-stream live proof remains pending.
Network and desktop deployment cards now have exact Release links in workflow configuration. Patch-2 CI must exercise those links.
The final workflow change adds read-only Actions permissions and passes the GitHub token to dependency preparation; remote execution remains pending.
The owner-authorized commit-all checkpoint is 13552cd, pushed to main. Root delivery then queued both SDK patch-2 tags without manual Git steps.
Preview tag vrcp-api/v2026.10.2-pre: commit 3f8117ccdd9c3021a99bb1b79a6793fd4fb793c9, tag object 7593342a92cf0bb0cb06e05bd621716cf2cef2f0, run 37314453807.
Release tag vrcp-api/v0.0.2: commit a066d0f6ef49660b6a259bea1dfbc29db1a4c27b, tag object 301783d8e165eb4c84a5a94e1e1de465d8955c58, run 37314471554.
Both runs failed in root tests before packing or publication: the container workflow test still expected no Actions read permission.
The exact permission assertions are corrected. Root checks also exposed stale network peer bounds after SDK bumps; SDK sync now updates them without a network bump or consumer-channel change.
The direct versioning CLI bump now routes through the same plan/execute commit-tag-push chain. The metadata-only function remains an internal primitive.
Repair gate passed: 84 root tests, zero failures, 968 assertions; versioning syntax and diff checks passed.
Registry and GitHub Release checks returned 404 for both patch-2 identities. No published tag, D1 write or source grant changed.
The owner superseded replacement: failures allocate the next patch. All failed patch-2 tags remain unchanged.
Repair e8d0d38 is committed and pushed. Root commands then queued preview patch 3 at a2765b5774eedb9eff6e4a91633acc7b0b940627 and release patch 3 at a46ef6419b4899e96eddca4eec2f43cff0ba5034.
Preview run 37316086763 passed build and published npm, but its immediate readback failed. Memory-only comparison of original CI artifact 11346989831 proved matching receipt, source and npm SHA-512.
The original run's failed jobs were requeued only to recover its publication receipt and Release attachments. No tag or published bytes changed.
Release run 37316100746 succeeded. The owner approved npm stage bd7387cf-6031-4f54-9e17-26aba754af98.
Registry readback confirms release latest 0.0.3 and preview latest 2026.10.3-pre.
Public release 0.0.3 returned 404 before the existing reconciliation controller dispatch, accepted with HTTP 204. Check its promotion and assets.
Bounded post-publication reads now tolerate absent records and an older latest alias. They reject changed bytes, identity or a newer alias without republishing.
This repair passed 85 root tests, zero failures, 1005 assertions, plus syntax and diff checks. Repair bc51775 is pushed.
Preview run 37316086763 attempt 2 succeeded. Independent root readback proved all five assets, npm integrity, source and unchanged tag.
Desktop preview 26.10.2-pre run 37318551722 completed successfully at ed8a2a69fbab5bc75236bed0f06fd54cd2587bd5. Hosted byte and link checks remain.
Next: queue network 2026.10.2 and desktop release 0.0.2 through the root chain. Their CI can run concurrently.
After hosted network proof, queue both crawler and Worker channels at their next configured patches. Preserve the owner's SDK workflow comment.
Delivered network 2026.10.2 at a6e39b1c116bc1d83ec931136f9298bdfee0359b, run 37321030222. Independent hosted checks passed all four assets.
SDK release 0.0.3 promotion and all five hosted assets passed independent checks. No new SDK bump is needed.
Desktop preview2 passed all five hosted assets. Deployment 6860700578 links to its exact Release. Network deployment 6860981068 does too.
Desktop release2 at 75f32c5cd6a7e7d1c40e3d452f8a020367ec489a runs as 37321046041. Its hosted proof remains pending.
GitHub returned 404 for vrcp-crawler-client-release. Owner approved creation with protection.
The environment now has required reviewers copied from crawler release and the tag-only vrcp-crawler-client/v* rule. Readback passed.
Crawler preview2/release2 runs 37321496040/37321512567 failed before publication. Worker preview2/release2 runs 37321529490/37321546252 failed during preparation.
The Worker logs prove an unsettled top-level await, exit 13. Direct CLI preparation imported the chain while the chain imported the waiting CLI module.
The entry now completes module evaluation before asynchronous command execution. The hosted resolver also accepts branch-valued Release targets.
Remote tag and receipt SHA binding remain mandatory. Regression coverage retains changed-tag rejection and adds branch-target and conflicting-SHA cases.
Repair gate passed 89 root tests, zero failures and 1042 assertions, plus syntax and diff checks. Direct hosted release Worker preparation passed with development-only dependencies.
Desktop release2 CI completed successfully, including attachments and deployment recording. Independent bytes and link checks remain pending.
Keep failed patch-2 tags fixed. After the repair passes live preparation, allocate only the next configured patch for failed consumers.

R57-NETWORK-SINGLE: one internal YYYY.M.Patch archive, without -pre or a future release path.
The owner confirms monorepo-only use. A required SDK peer lets the Worker and crawler select their own SDK channel.
Check one packed archive against both verified SDK distributions. Normal wildcard ranges exclude prereleases.
R57-DEV-INSTALL: install current verified hosted archives rather than request an unpublished npm package.
Keep preview SDK aliases and exact resolved versions/checksums. Do not link sibling sources or suppress dependency errors.
The root versions:bump command now selects the delivery chain: planning is read-only; --execute bumps, synchronizes, commits, tags and atomically pushes.
A network bump updates both consumer archive URLs while preserving their runtime versions and SDK channels.
The configured suffix-free network archive is not yet published. Do not claim fresh-clone installation or main sign-off before patch-2 live proofs pass.

R57-RETENTION remains open: latest readback measured 63 caches / 1,304,427,315 bytes and 55 CI artifacts / 787,333,938 bytes, with no expired artifacts listed.
Repository readback confirmed a 10 GB cache cap. Bun executable caches account for 847,109,183 bytes across 23 entries.
Account budgets remain unverified. The infrastructure shelf proposes future retention controls and a workload calculation. No deletion, paid limit increase or retention change ran.
The cache maintenance gate passed 89 root tests, zero failures and 1040 assertions, plus syntax and diff checks.
Root cache:check plans only. cache:prune executes bounded cache-ID deletion after a canonical completed push workflow.
The threshold is 80% of the measured cap, with a conservative 10 GB ceiling. The target is 60%, with at most 25 selected IDs.
Only old product-tag caches qualify. Branch, PR, active-run and recently accessed caches remain protected.
Each deletion repeats identity and active-run checks. Incomplete metadata or permissions stop further deletion.
A concurrent new run can still cause a rebuildable cache miss. CI artifacts, Release assets, npm versions and GHCR images are not targets.
Live read-only measurement: 1,414,776,479 bytes against 10 GB. No cache was selected or deleted. Remote execution remains unproved.
Remote maintenance run 37321180703 failed in cache:prune after successful setup. Its current error summary hides the HTTP status.
A numeric-only diagnostic now exposes an API status without credentials, URLs or response bodies. Remote diagnosis remains open.
Diagnostic run 37323059939 returned HTTP 403 with the scoped workflow token. Do not add administrator credentials or bypass the failure.
GitHub documents Actions read for the cap endpoint, but actual workflow-token access still contradicts that expectation. Isolate the exact rejected endpoint next.
Repair 42894c6 is pushed. Root delivery allocated Worker preview3/release3 at f6643285b479ed10e1b1bcd89f60679b94d1953b / 18e697b92b70220f4b4ee4b83b81ee9af53dae64.
Worker preview3 run 37322988392 passed build and deployed. Worker release3 run 37323008883 is building. Independent bundle proof remains pending.
Root delivery allocated crawler preview3/release3 at 9b913b5f0acc11edcea6fb11eb0d859f8cf0a320 / ea09ade856463d443fcaa5860acc4c9c2add8677.
Desktop release2 passed all five independently read assets. Deployment 6861168659 links to the exact Release.
The desktop release environment is now protected. Do not claim its earlier trial proved a future owner-review wait.
R57-C57A remains open for remaining consumer checks, protected-environment behavior, clean preview installs and cache execution. Do not advance C57B yet.
Complete the setup changes, then run remaining configured delivery proofs and private security intake before conditional main sign-off.
