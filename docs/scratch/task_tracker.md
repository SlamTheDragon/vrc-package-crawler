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
| SDK | 0.0.1 | 2026.10.1-pre | Both npm channels and five assets per GitHub Release independently verified |
| Network | 0.0.1 | 2026.10.1-pre | Both channels and four assets per GitHub Release verified; release CI 37301273812 |
| Crawler | 0.0.1 | 2026.10.1-pre | Both CI runs passed; independent binary readback in progress after a download timeout |
| Desktop | 0.0.1 | 26.10.1-pre | Both CI runs and five assets per Release independently verified |
| Worker | 0.0.1 build only | 2026.10.1-pre deploy | Both CI bundle receipts independently verified; preview deployed, production skipped |
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

Preview 2026.10.1-pre is now published. Run 37255217168 failed three earlier attempts with ENEEDAUTH.
Former source: 83a05071baaa5c645484cda6dd67977c3261a173. Former tag object: 037249c1b94cb7cf395cf08b7433d80ad8f1fa62.
The owner recreated publishers and confirms the preview-package context.
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
The owner approved exact-lease replacements only while this tag was unpublished. That repair authority no longer applies.
Diagnostic trial 37259707356 used source bb9a9b41f269c8409ccef2b59e875958d9374f02.
Tag moved from 81ca4c7b2028948760d8d2f7be2ecdcc0e5e5418 to a8e4c449019ce29d19e71114f768356d9d707170 after a registry 404.
Its safe CLI summary shows exchange HTTP 201 and token installation, then ENEEDAUTH. OIDC was not skipped.
The SDK project .npmrc has an empty NPM_TOKEN placeholder with higher precedence than OIDC's user-level token.
Repair: publish the checked preview tarball from the repository root, outside that project config. Release staging stays unchanged.
Grouped repair checks passed 46 tests and 566 assertions; syntax and diff checks passed.
Repair source 12d2ed17333f2bead05339712698dedac84cee57 moved tag a8e4c449019ce29d19e71114f768356d9d707170 to c969e54d1a1aeebf2175bede1b0f0af2b3d42c45 after registry 404.
CI 37300054964 published npm, then its immediate readback failed. The tag is now immutable.
Independent memory-only comparison found identical CI/npm archives, SHA-256 78ecd817bfd2a6de91a81779a5e779679d2e14f48d0fd320f6274a59e0f8b8a5.
Exact metadata and latest now both point to 2026.10.1-pre with matching integrity. Theory: registry readback lag; not yet established.
CI 37300054964 attempt 2 passed publication readback and automatic GitHub attachment without republishing or moving the tag.
Independent delivery:check passed all five hosted assets, npm integrity, source run and remote tag binding.
Container rename repair is limited to the two observed patch-0 config digests and source fb9edf66ce1b9954bd672826a3090c735b60632d.
The owner requested retry after auto-review rejection. Broad old-repository acceptance was rejected; exact identities passed review.
Grouped root checks: 72 pass, 2 fail, 838 assertions. All 11 container tests passed, including wrong digest/revision/source/channel cases.
Both failures are unsynchronized local manifests: SDK and consumers remain 0.0.0 while release config is 0.0.1.
CI syncs the selected channel before testing; the preview SDK build passed. Local full-root conformance is not yet passed.
Container syntax and diff checks passed. No patch-1 crawler publication ran yet.

## Remaining product trials

The existing one-command delivery chain allocated and pushed all remaining patch-1 tags from the clean trial checkout.
Network release source dfdc150437bc1dc6e57cd3e5001c5fa66610deab; tag object 95af5b72d4b82a71dae216844bd2aa039c6a95d5.
Network release tarball SHA-256: 586372ad697ae730ec4cf4122c3a2e1b1b334d6feec137839335938dbd7bda56.
Desktop preview source ee996aba25b0a40cfd3d40187abf0db01f623c97; tag object 426580841d81a0b6eb5ff5dd267a2c200db3f8b8.
Crawler preview source 26aa7bdbfadee8e83ab44af1269696b6dccda3c8; tag object c90b7db28ac453e11ac1cac4fc1c697896a74fc7.
Crawler release source deccb1f6fd96b5ccca5655e816ca58406188860a; tag object 3078228c77b68240716a21c9228fd34ba1b351e6.
The owner approved both crawler runs and removed preview's reviewer requirement. Readback confirms its tag policy remains; release stays protected.
Worker preview CI 37301422846 deployed version b709408c-17a8-4ab0-985f-05dd003a80d4 to the existing preview Worker and preview-only D1.
Its bundle SHA-256: 725d1edfc05537a817d65d42df81a5fa3c38fbce86a96dd39cc6ae2a3715c131.
Worker release CI 37301598940 passed build and skipped deployment; bundle SHA-256 f2819114064e354917f4ff52b1217c4a413b16cedf92afcd4c3a5168fa55caea.
Both Worker CI archives passed memory-only receipt/channel/version/source checks. Neither has GitHub Release assets.
Unauthenticated preview initialization returned 401 before storage access. No authorized initialization, schema write or source grant ran.
Desktop preview CI 37301287106 passed and all five assets/source/tag checks passed independently.
Preview MSI SHA-256: c13d477fe68aed792441d6ea225bd49ddd2bc5371d9b820126f0392245d43e08.
Both crawler runs passed publication and attachments. Independent binary readback timed out at 60 seconds.
The checker now permits 180 seconds per file without relaxing its 256 MiB total bound or digest/source checks. Grouped checks passed 30 tests and 324 assertions.
Crawler public binary readback also timed out at 180 seconds. Publication passed, but independent hosted-byte proof remains open; do not claim G14 complete or split/protect branches yet.
Storage snapshot: 0.97 GiB caches and 0.73 GiB CI artifacts. Largest caches are Bun archives; most CI artifacts retain 90 days.
R57-RETENTION and R57-DEPLOYMENT-LINKS record the owner's new concerns. No cache deletion, budget change or retention-policy change ran.
Worker deployment links are explicitly deferred. Future owner target: https://docs.vrcpackages.com. No DNS or deployment URL changes.

## Next actions and safety

Keep the published preview tag fixed. Investigate bounded readback lag handling without weakening exact byte checks.
Complete remaining network, crawler, desktop-preview and Worker patch-1 trials through their existing chains.
Release consumers can use the checked release SDK. Preserve existing network-preview and desktop-release patch-1 deliveries.
Other patch-1 paths, branch split and main protection remain open. Website delivery stays disabled.
The current release command pushes its branch. Protected-main delivery needs a reviewed PR path.
R57-C57B remains behind its requested owner question hook.
No local release builds, D1 writes, source grants or production Worker deployment.
Private attacker research remains unread until pipeline setup finishes.
