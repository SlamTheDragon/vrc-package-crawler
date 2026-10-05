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

SDK release 0.0.1 is public on npm and GitHub after owner npm approval.
Source commit: 7c7e252e5360dca453dfc0c3b52df9a9cc97dcb3. Unchanged tag object: 48080f06312224993c45ee83c288edf437a3937d.
Original CI: 37255187559. Controller: 37257969331. Automatic promotion: 37257987859.
The owner approved draft access through contents: write. Checkout does not save that credential.
PATCH without tag_name also detached draft 403316984. The repair recovered its source-bound identity and retained all original assets.
Independent memory-only readback passed five assets, npm integrity and remote tag binding.
Tarball SHA-256: 2ac9b69e77d412743c954c47cf29791f97975885bcc2703e9733391c8ea33843.
The same draft ID became public. No npm stage approval ran in CI.

Preview 2026.10.1-pre remains unpublished. Run 37255217168 failed three attempts with ENEEDAUTH.
Former source: 83a05071baaa5c645484cda6dd67977c3261a173. Former tag object: 037249c1b94cb7cf395cf08b7433d80ad8f1fa62.
The owner recreated publishers and confirms the preview-package context. The authentication cause remains unknown.
Historical preview success used token-backed staging, not OIDC. Do not treat it as direct-publication proof.
A manual diagnostic prints whitelisted identity claims and exchange status, never tokens, headers or response bodies.
Diagnostic 37258369653 ran no steps. Tag-only environment protection rejected main.
The owner approved exact-target replacement. Its leased push and remote readback passed at unchanged version.
New source: 95601f6ea4455c9495e5aa7d5c7282883596b70d. New tag object: 81ca4c7b2028948760d8d2f7be2ecdcc0e5e5418.
SDK source is unchanged. Replacement CI 37258873559 passed build and failed npm publication.
Tag-ref diagnostic 37258947351 passed. npm accepted the OIDC exchange with HTTP 201.
Its owner, repository, workflow and environment claims match the expected publisher. The publisher mapping works in this diagnostic.
Theory: npm CLI's exchange or credential installation differs from the direct diagnostic. Capture only statuses and fixed flags on failure.
Grouped SDK/controller checks passed 46 tests and 562 assertions, including credential-safe failure summaries. Syntax and diff checks passed.
An owner question requests bounded authority for further exact-lease replacements of this unpublished tag during diagnostics.

## Next actions and safety

If publication still fails, run the diagnostic on that permitted tag ref. Keep environment protection and reject token fallback.
Finish preview npm publication and public byte checks before preview consumer trials.
Release consumers can use the checked release SDK. Preserve existing network-preview and desktop-release patch-1 deliveries.
Other patch-1 paths, branch split and main protection remain open. Website delivery stays disabled.
The current release command pushes its branch. Protected-main delivery needs a reviewed PR path.
R57-C57B remains behind its requested owner question hook.
No local release builds, D1 writes, source grants or production Worker deployment.
Private attacker research remains unread until pipeline setup finishes.
