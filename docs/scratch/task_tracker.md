# G14 crawler publication checkpoint

## Active gate and accepted direction

Current work: G14 Docker delivery, with FLEET-S3 and G13 dependency checks.
Owner selects separate GHCR packages: vrcp-crawler-node and vrcp-crawler-node-preview.
Each channel uses its configured SDK/network dependencies. Version-0 publication trials are authorized.
No version bump occurred. npm owner staging, the SDK v0.1 hold and Worker CI-only assets stay unchanged.
Both crawler environments require SlamTheDragon review and allow only vrcp-crawler/v* Tag refs.
The master and both channel switches are true. Protection and switch readback passed.

## Working theory and current code

The old workflow rebuilt after checking its image. The Linux job also requested registry write access.
Theory: one checked image can pass to a separate protected publication job without a rebuild.
CI now saves that image with archive hash, image ID, commit, channel and dependency identities.
Publication checks archive bytes before registry login, then checks loaded identity and registry readback.
CI refuses changed version bytes and backward latest movement. Other authorized registry writers remain outside this policy.
CI-only container archives and receipts do not enter GitHub Release inputs. Docker build-record uploads are disabled.

## Checkpoint evidence

Delivery implementation: d5456e5. CI-discovered install repair: fb9edf66ce1b9954bd672826a3090c735b60632d.
Local root and 137 node tests passed with Bun 1.4.2, plus node types, script syntax and diff checks.
The CLI fixture exceeded 30 seconds once. Its budget is 60 seconds, with 15-second subprocess limits.
A clean product-local Bun install used actual release SDK/network tarballs and passed installed-identity checks.
An initial diagnostic used the wrong script path and failed. The corrected absolute-path check passed.
The Windows development binary reports 0.0.0. Local Docker is unavailable.

Initial preview CI 37244055542 and release CI 37244055733 passed Windows and Linux contract checks but failed Docker installation.
Bun still queried npm for the private network dependency after receiving its bare tarball. npm returned 404.
The Dockerfile now names both file dependencies explicitly. Neither failed trial reached registry publication or release creation.
The owner approved replacing both failed unpublished tags. Exact-target leases passed, with versions unchanged.
Old release tag object: f9b91f3d55417ed8f84d9597acd09ca185b91516.
Old preview tag object: 453041770201c42111fc52fc8d1ea5f79024543d.
Both old tags pointed to d5456e5fa289ae3ee3132a79d65478f78260aebc. Retain these IDs for recovery.

Corrected preview CI 37244482335 uses fb9edf6 and passed both standalone binaries and the actual Docker image.
Checks passed for preview dependency identity, version/help, non-root runtime, persistent config and missing-token exit with networking disabled.
Its artifact inventory contains Linux binary, Windows binary and the CI-only container archive. No build record is present.
The publish-container job waits for owner approval in vrcp-crawler-preview. Do not approve on the owner's behalf.
Corrected release CI 37244482532 uses the same commit and waits behind preview under the shared concurrency group.

## Open exits and next actions

After owner approval, inspect archive loading, GHCR publication receipt/digest and automatic binary release attachments.
Then inspect the queued release-channel trial. Track these exact runs. Do not start duplicate trials or move successful published tags.
Config persistence is not durable result recovery, full fleet restart or real-source ingestion proof.
GHCR access, Compose credentials, shutdown/restart, Watchtower privileges and durable recovery remain open.
Accepted Docker/registry rows are merged into the canonical ledger. Owner table formatting and branch comments are preserved.
R57-C57A queues root delivery chains and separate human/agent procedures after individual delivery paths pass.
Future responsibility branches and push-triggered previews remain deferred. No current branch-trigger policy changed.
Live npm draft promotion, OIDC, installer delivery and external network distribution remain separate checks.
The private attacker research stays unread until pipeline setup finishes. Production Worker, website and remote schema/source grants remain untouched.
The full goal remains active. Publication waits for owner review, not for agent confidence.
