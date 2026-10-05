# G14 — delivery proof and conditional main sign-off

## Authority and next boundary

The full goal remains active. Patch 2 is the final root-to-delivery acceptance trial, not another manual release exercise.
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

Release versions are 0.0.1. Preview versions are 2026.10.1-pre, except desktop 26.10.1-pre.
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

R57-NETWORK-SINGLE: one internal YYYY.M.Patch archive, without -pre or a future release path.
The owner confirms monorepo-only use. A required SDK peer lets the Worker and crawler select their own SDK channel.
Check one packed archive against both verified SDK distributions. Normal wildcard ranges exclude prereleases.
R57-DEV-INSTALL: install current verified hosted archives rather than request an unpublished npm package.
Keep preview SDK aliases and exact resolved versions/checksums. Do not link sibling sources or suppress dependency errors.
The low-level versions:bump currently edits config only. The explicit delivery chain also commits, tags and atomically pushes.
Reconcile that distinction with the owner's bump-means-queue requirement before patch 2.

R57-RETENTION remains open: caches measured 0.97 GiB and CI artifacts 0.73 GiB, with most artifacts retained 90 days.
Confirm budgets and cache caps before unattended branch delivery. No deletion, paid limit increase or retention change ran.
Complete the setup changes, then run patch-2 delivery proofs and private security intake before conditional main sign-off.
