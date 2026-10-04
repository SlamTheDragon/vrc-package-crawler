# G14 Docker delivery checkpoint

## Active gate and owner decisions

Previous turn: progress. Commit 3798ecb made all CI consumers use checked registry SDK bytes.
The owner approved its push, and origin/main now contains it.
Current work: G14 Docker channels, supporting FLEET-S3 and G13.

Owner selects separate GHCR packages: vrcp-crawler-node and vrcp-crawler-node-preview.
Release images use release dependencies. Preview images use preview dependencies.
Version values come from the corresponding root config. No version bump is planned here.
The owner authorizes version-0 test publication in this iteration, after setup and checks pass.
npm owner staging, the v0.1 SDK hold and Worker CI-only artifacts remain unchanged.

## Theory and proposed path

Existing Linux CI checks an image, then rebuilds for publication. Its build job requests registry write permission.
The Dockerfile counts dependency tarballs but does not compare their installed identities with the selected channel.
Theory: publish the checked image without a rebuild, with explicit channel and dependency checks.

Use one read-only Linux build and one separate protected publication job.
The build checks the binary, unprivileged runtime, persistent volume and fail-closed startup without network access.
It saves that exact image with metadata and checksums as a CI-only artifact.
Publication checks the archive before loading, then checks the image identity before registry writes.
Use separate channel approval switches and environments. The old global switch alone must not authorize publication.
Keep container archives out of shared GitHub Release attachment inputs. Standalone binaries remain release assets.
Image immutability, retries and registry receipts need explicit checks, not confidence from metadata tags.
Local checkpoint: root 59/667 and node 137/821 passed with Bun 1.4.2. Node types and script syntax passed.
The CLI fixture exceeded 30 seconds once. Its budget is now 60 seconds, with 15-second subprocess limits.
The repeat took 25.6 seconds. Real installed release dependencies passed the new builder check.
A Bun 1.4.2 Windows development build reports 0.0.0. Release config checks found no changes.
Docker fixtures use synthetic bytes and fake registry responses. Actual Docker and GHCR delivery remain unverified.

## Retained evidence and limits

G13 local checkpoint: root 48/580, node 133/803, types and Windows development binary passed.
Packed network Node/Bun/types/native Worker checks passed against public SDK 0.0.0, with zero external fetches.
Public SDK SHA-256: 8765381936f006fc65fd41de53d4f20389c80127f4245bbdbe929d6b2f821ce8.
The earlier npm node checks used global Bun 1.4.1. The current checkpoint aligns them with pinned CI 1.4.2.

Old Docker failure 37117779544 lacked the SDK. Later branch builds do not prove current tagged delivery.
Local Docker is unavailable. No current Docker execution or crawler publication is proven.
Remote readback checked both crawler environments, each with SlamTheDragon as required reviewer and vrcp-crawler/v* Tag restriction.
The master switch and both dedicated channel switches are true. No npm or Worker protection changed.

SDK 0.0.0 and preview 2026.10.0-pre remain published. Original SDK assets and immutable retries passed.
Worker preview 4a93db4f-8d7f-493b-9d85-76ead98d4510 remains on its separate preview D1.
Production Worker, website delivery, remote schema initialization and real-source grants remain untouched.
No internal network registry publication is authorized.

## Next actions

Finish the diff audit and documentation. Preserve owner edits in the unmerged ledger.
Check crawler environments, approval variables, protections and product-tag restrictions before the authorized version-0 trial.
CI uses separate image packages, one checked build, archive receipts and protected publication without rebuilding.
The global approval switch alone cannot enable publication. Each channel needs its own switch.
Archive and publication receipt artifacts use ci-only-* names, excluded from GitHub Releases.
The earlier approval-service error cleared. Normal reviewed tools work. No approval checks were bypassed.
Accepted Docker and registry-consumer rows are merged into the canonical ledger. The owner's root-chain task is queued as R57-C57A.
Crawler setup passed remote readback. Preserve owner review for the initial publication trial.
Commit d5456e5 is pushed. Version-0 tags started preview CI 37244055542 and release CI 37244055733.
Both runs use that commit. Publication still requires owner review. No image or crawler release is proven yet.
Preview CI passed both standalone binary paths but failed the Docker install step.
Bun treated a bare network tarball as an addition and still resolved the declared network version from npm, which returned 404.
The Docker install now names both file dependencies explicitly. Docker build-record uploads are disabled to keep unrelated files out of release inputs.
The repair checkpoint passed: all root and 137 node tests, node types, script syntax and diff checks.
A clean product-local Bun 1.4.2 install used both actual release tarballs and passed the installed-identity check.
The first identity-check invocation used a wrong script path and failed. The corrected absolute-path invocation passed.
Release CI 37244055733 failed for the same private network lookup. Both Windows builds passed.
Neither trial reached image publication. GitHub checks found neither crawler release nor container package.
The owner approves replacing both failed unpublished tags with exact-target leases, without a version bump.
Old release tag object: f9b91f3d55417ed8f84d9597acd09ca185b91516.
Old preview tag object: 453041770201c42111fc52fc8d1ea5f79024543d.
Both pointed to d5456e5fa289ae3ee3132a79d65478f78260aebc. Keep these IDs as recovery evidence.
Track these run IDs without starting duplicate runs. Root chains remain queued until their delivery paths pass.
Root command wiring follows verified build and deployment paths. Keep that new owner task queued in the canonical ledger.
A later approved SDK trial must check live post-approval GitHub Release publication.
Q-ATTACKER-INTAKE stays unread until pipeline setup finishes. The full goal remains active.
