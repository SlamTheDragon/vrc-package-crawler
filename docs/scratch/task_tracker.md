# G14 — R57-C57A per-product patch-1 proof

## Authority and active boundary

The full goal remains active. The owner now requires release and preview patch-1 proof for every enabled product.
Website CI stays disabled. It emits no preview or production artifacts.
Worker release tags build only. Production deployment and Worker GitHub Release assets remain disabled.
Release SDK publication keeps owner-approved staging and the v0.1 API-review hold.
Preview SDK publication is direct through its trusted publisher.
After proof, create website-preview, crawler-client-preview, api-package-preview and worker-preview.
Every API preview branch push must publish. Allocate its patch before the source commit.
Main keeps release responsibility and requires reviewed promotion PRs. Do not delete main.
Preserve staged owner README edits.

## Working theories and source boundaries

Root delivery commands call version allocation, a config-only commit, an annotated product tag and an atomic non-forced push.
Tagged CI builds the selected channel dependencies and owns release artifacts.
Independent public checks compare exact tag, source run, receipts, notes, checksums and registry bytes.
Theory: reuse those paths for per-product proof rather than create a second CI controller.
The remote-tag check binds the remote object before and after public artifact checks. The first grouped root pass passed.
Theory: direct preview OIDC publication can preserve checked tarball bytes without npm staging inspection.
Release staging remains separate. The owner renamed the repository to SlamTheDragon/vrc-packages.
Git origin, SDK repository.url and repository contact links now use the new name. Cloudflare names and D1 bindings stay unchanged.
All five delivery environments and their reviewer rules remain present. The owner reports updated npm trusted publishers.
Historical note checks accept only this exact previous name and the same CI run. Published assets stay unchanged.
The grouped root check passed 72 tests and 813 assertions, including rename and remote-ref negative cases.
Branch automation waits for the patch-1 proof. Cross-branch dependency-version updates must retain the config check.

## Proof inventory

| Product | Release target | Preview target | Current proof |
| --- | --- | --- | --- |
| SDK | 0.0.1 | 2026.10.1-pre | Pending new paths and publication |
| Network | 0.0.1 | 2026.10.1-pre | Preview CI 37251743937 passed at 0117444f525dd5e83648d212a43fa4b1397a32ad |
| Crawler | 0.0.1 | 2026.10.1-pre | Pending binaries, separate GHCR images and assets |
| Desktop | 0.0.1 | 26.10.1-pre | Release CI 37248173416 passed at 120819946c199a2f3000ac89d0cf1ce6322f89b3 |
| Worker | 0.0.1 build only | 2026.10.1-pre deploy | Pending CI bundle checks and preview readback |
| Website | Disabled | Disabled | Owner excludes delivery |

Published patch-1 identities stay unchanged. Historical desktop release used SDK 0.0.0.
Network preview tarball SHA-256: b824c1dc35447ae956684de1c20caaaf7d810161b6d062ed709d38075660e356.
Latest grouped root pass: 72 tests and 813 assertions passed. Syntax and diff checks passed.
Both existing patch-1 deliveries passed live memory-only readback under the new repository name, including remote tag-object checks.
Both patch-0 crawler image channels and SDK registry artifacts passed earlier checks. They do not satisfy the new patch-1 exit.

## Next actions and safety

Finish direct preview SDK publication, remote tag checks and Worker build-only root routing.
Run related tests together. Commit only owned changes.
Use the root commands from a clean temporary checkout for the remaining trials.
Prove the reported npm setup with SDK trials. Publish SDK channel versions before consumer trials.
Record exact runs, checked bytes and required manual release promotion.
Do not replace published tags or increment existing patch-1 deliveries.
Then implement the branch split and main protection. R57-C57B remains behind its requested owner question hook.
No local release builds, D1 writes, source grants or production Worker deployment.
Private attacker research remains unread until pipeline setup finishes.
