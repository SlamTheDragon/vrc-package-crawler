# G13 registry-consumer checkpoint

## Active gate and authority

The previous goal turn made progress: SDK release assets and immutable retries passed, and Worker bundles became CI-only.
Read the attached objective on continuation. Current work addresses G13 runtime dependency ownership, supporting G14 Docker delivery.
Each src-* project consumes distributed dependencies, not sibling source. SDK publication and consumer preparation are separate operations.
Theory: every CI consumer must install the config-checked published SDK, rather than silently rebuilding same-version source.
Local preparation can still build development tarballs. Local outputs remain development-only.

No version bump, tag push, registry publication, Worker deployment, schema write or source grant is authorized by this audit.

## Dependency boundary and checkpoint

Before this change, only Worker CI checked registry SDK bytes.
Crawler, network, desktop and website CI rebuilt SDK source. Their workflows also ran producer checks without producer setup.
All CI consumers now use packRegistrySDK, preserving canonical imports and exact config checks.
The SDK producer keeps its source build and owner-approved stage workflow.
Consumer workflows retain their own checks, without redundant SDK producer tests.
The Dockerfile rejects missing or multiple SDK/network tarballs before installation.

Grouped local checkpoint: root 48 tests/580 assertions and crawler 133 tests/803 assertions passed.
Node types, delivery script syntax, release config and Windows development binary checks passed. The binary reports 0.0.0.
Executable CLI fixtures check five consumers in both channels, wrong latest rejection, producer separation and local source builds.
The network's packed distribution passed Node, Bun, declarations and native Worker checks against the published SDK. It made zero external fetches.

Downloaded SDK 0.0.0 SHA-256: 8765381936f006fc65fd41de53d4f20389c80127f4245bbdbe929d6b2f821ce8.
That dependency input stays under the network project's development artifacts. No release artifact was authored locally.
Root fixtures used Bun 1.4.2. npm crawler checks resolved global Bun 1.4.1, unlike CI's pinned 1.4.2.
Clean tagged consumer CI and Docker execution remain unverified. No consumer tag was pushed.

## Delivery evidence retained

Public npm release: vrc-packages-api@0.0.0. Preview: vrc-packages-api-preview@2026.10.0-pre.
SDK runs 37234232443/37234232436 used 8907ef2 and owner promotion. Public bytes match their CI stage receipts.
SDK releases have five assets each, including checked notes and checksums.
Attachment retries 37239255957/37239258107 passed at bf6badd without replacing original assets.

Empty-draft workflow run 37238419166 passed.
That empty-draft check does not prove a live post-approval draft promotion.

Persistent Worker preview run 37235649307 passed.
Worker: vrc-package-crawler-preview. Version: 4a93db4f-8d7f-493b-9d85-76ead98d4510.
Preview D1: fbef6ce1-4145-45ae-ae91-5d617a1f2672. Production remains unchanged.
Worker bundles stay Actions-only. Native Previews remain a far-future review.

No remote schema initialization, source-access profile or real-source fleet ran.

## Docker findings and next actions

Old Docker failure 37117779544 at 7d40039 could not resolve vrc-packages-api.
Four later branch-based runs passed. None verifies the current product-tag workflow.
VRCP_CONTAINER_PUBLISH_APPROVED is true. No dedicated crawler preview/release environments exist.
The current Linux job requests packages: write even for builds, logs in before testing and rebuilds the image before publishing.
Local Docker is unavailable. Do not treat the old successful runs as current delivery proof.

Critical question: separate preview/release GHCR packages or one image with channel tags? Defer the choice until owner input.
No crawler tags will be pushed while those publication controls remain unsettled.
Docker's documented single-platform archive handoff can move the tested image between isolated jobs without a rebuild.

Owner setup remains: cloudflare-preview needs cloudflare-worker/v*. SDK environments need vrcp-api/v*.
Retain npm owner stage approval, release v0.1 API review, existing secrets, SDK trusted-publisher filename and immutable historical tags.
Website delivery stays disabled. Internal network registry publication remains unauthorized.

After this dependency gate, continue the Docker channel gate and a later approved SDK promotion trial.
Q-ATTACKER-INTAKE remains unread until pipeline setup finishes.
Security, rights/age controls, source access, fleet budgets and durable recovery remain open. The full goal is not complete.
