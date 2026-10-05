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
| SDK | 0.0.1 | 2026.10.1-pre | Release public, GitHub draft persists. Preview auth still fails |
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

## Live SDK trial checkpoint

Checked baseline f8f9c4ad4264e16acdeaf423c881da633065c5a0 is pushed. The root commands allocated one patch per channel and triggered CI.
Release tag vrcp-api/v0.0.1 binds commit 7c7e252e5360dca453dfc0c3b52df9a9cc97dcb3 and tag object 48080f06312224993c45ee83c288edf437a3937d.
Release CI 37255187559 passed build, staging and five draft attachments. The configured GitHub review was submitted under owner trial authority.
The owner approved stage 42ec4154-e9d6-42ec-a6b6-bb9dc90634df. Public npm exact and latest metadata return 0.0.1 with matching integrity.
Draft-controller run 37256527596 returned dispatched 0. GitHub requires push access to list drafts, but its token has contents: read.
Theory: contents: write lets the controller find this draft and dispatch the byte-checked attachment workflow.
The owner explicitly approved contents: write. The repair also disables saved checkout credentials. No stage approval ran in CI.
Historical commit 24bfec4 introduced the read-only checker. Successful release attachments use contents: write in 7c7e252.
Repair 60cdcd0 passed 14 tests and 155 assertions. Live controller 37257129900 still returned dispatched 0.
The permission correction alone did not prove promotion. Theory: bounded filter counters identify the remaining draft exclusion.
Preview tag vrcp-api/v2026.10.1-pre binds commit 83a05071baaa5c645484cda6dd67977c3261a173 and tag object 037249c1b94cb7cf395cf08b7433d80ad8f1fa62.
Preview CI 37255217168 passed build but direct publication failed with ENEEDAUTH. Attempt 3 failed after the owner recreated trusted publishers.
Preview exact metadata still returns 404. No trial tag was replaced. Release byte readback remains pending.
The OIDC request variables passed the local guard. CLI 11.19.0 was installed. The logs do not expose the failed token-exchange cause.
Theory: check exact trusted-publisher claims and registry settings before choosing a repair. Do not assume owner error or add token fallback.
The screenshot showed lowercase slamthedragon. GitHub reports SlamTheDragon. The owner recreated the entries, but authentication still fails.
The owner confirms the preview entry belongs to vrc-packages-api-preview. Consumer trials wait for their channel SDK.

## Next actions and safety

Finish direct preview SDK publication, remote tag checks and Worker build-only root routing.
Run related tests together. Commit only owned changes.
Use the root commands from a clean temporary checkout for the remaining trials.
Resolve the preview authentication evidence and check owner release promotion. Publish SDK channel versions before consumer trials.
Record exact runs, checked bytes and required manual release promotion.
Do not replace published tags or increment existing patch-1 deliveries.
Then implement the branch split and main protection. The current release command pushes to its branch, so protected-main release routing needs a PR path.
R57-C57B remains behind its requested owner question hook.
No local release builds, D1 writes, source grants or production Worker deployment.
Private attacker research remains unread until pipeline setup finishes.
