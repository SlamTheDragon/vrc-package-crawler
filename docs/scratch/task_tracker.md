# G14 distribution and installer checkpoint

## Active gate and authority

G14 covers delivery paths, with G13 dependency isolation. The full goal remains active.
Owner approves current and subsequent crawler publication trials. Both protected environment approvals were submitted under that grant.
npm keeps separate owner staging review. SDK v0.1 still requires the complete owner API review.
Owner selects desktop preview YY.M.Patch-pre, currently 26.10.0-pre. Release desktop patch trial is 0.0.1.
Other products keep their configured formats. Explicit preview bumps use the UTC calendar and increment patch only.
Builds read saved config. No branch-push publication, production Worker or website activation is authorized by this checkpoint.
Check both artifact channels for each enabled distributed product. Cloudflare has no GitHub Release assets.
Finish R57-C57A delivery chains after individual proof. Use a question hook before R57-C57B.

## Working theories and changed paths

One checked Docker image passes to protected publication without rebuilding.
CI receipts bind archive bytes, image ID, source commit, channel and SDK/network identities.
Independent registry readback checks version/latest config digests and labels.

Installer 0.0.0 exposed a different boundary: GitHub replaced filename spaces with dots after receipt stamping.
Theory: normalize output names before stamping, then reject server-renamed uploads before publishing the draft.
scripts/release-assets.mjs now does this. Collision checks precede renames and prevent overwrites.
The published 0.0.0 assets stay untouched. New release/preview CI trials must check names and bytes strictly.

## Checked evidence

Root gate: 63 tests, 690 assertions passed with Bun 1.4.2. Svelte found zero errors and warnings.
Release metadata check, desktop preview routing and diff checks passed. No local release installers were built.
Fixtures cover short-year/month rollover, pre retention, MSI patch overflow without writes, config-owned Cargo sync and filename collisions.

Crawler preview CI 37244482335 and release CI 37244482532 succeeded at fb9edf66ce1b9954bd672826a3090c735b60632d.
Both built Linux/Windows binaries and tested the actual image with matching channel dependencies.
Non-root startup, config persistence and missing-token failure passed without networking.
Each GitHub Release has six assets. Memory-only downloads match digests, receipts, source commit, notes and checksums.
Preview binary hashes: Linux 3e123d513bd7e24025a7060f0093611617834655ee057188a977cd7c6e421951, Windows 5cd14deb1304954c4a4cefce3215cc57376748d985c2c8398699503b22efdaa3.
Release binary hashes: Linux b0945f2d16f630546205472cdd2f91264be6349e6608b844a73dab8ce038f8cf, Windows 12006c122a757b52959343248217a4a0dbf264eb0dd4f81787dd3c3388c986b0.
GHCR preview manifest: sha256:6af2b893a100639f31d0a01929e1aefbadb0ab8a950a419c7e8fa1ccb768e24f.
GHCR release manifest: sha256:5f3db18b98868fb356fed96ba49bb3b05a25d125deea24ea127c73cbdfbdbe82.
Independent anonymous registry readback matched both publication receipts, latest/version image IDs and dependency labels.

Network preview CI 37245068853 and release CI 37245377275 passed at d0a9119.
Each has four checked public assets. Preview attachment-only retry 37246014865 retained the original four digests.
The network private flag blocks npm publication, not public GitHub downloads. External registry policy remains open.
Current rechecks passed both SDK registry/Release channels and both network Release channels, including tarball receipts, notes and checksums.

Desktop release CI 37245553485 passed at d0a9119 with five unsigned installer assets.
All bytes match after the explicit historical space-to-dot mapping. The filename contract is not conformant.
Initial asset diagnostics mishandled nested arrays. The corrected per-asset checks exposed the real filename mismatch.
MSI SHA-256: 4b7877dbca4aa1e55bbb80613868e080d3a7e63298971bf3dcd935799005821a.
NSIS SHA-256: fb1690bfb0215a17160cba425ad37c664b0d1a2db536bfcf3548313adbbf4f26.
Preview 26.10.0-pre and corrected release 0.0.1 tags have not run yet.

## Recovery and next actions

Initial unpublished crawler runs 37244055542/37244055733 failed Bun's bare network-tarball resolution.
Explicit named file dependencies fixed it. Owner-authorized exact-target tag replacements passed without a version bump.
Old release tag object: f9b91f3d55417ed8f84d9597acd09ca185b91516.
Old preview tag object: 453041770201c42111fc52fc8d1ea5f79024543d.
Both pointed to d5456e5fa289ae3ee3132a79d65478f78260aebc. Published replacement tags must not move.

Next: commit the installer/config fix, push new desktop release/preview tags, and check exact CI runs and assets.
SDK, network and crawler channel rechecks passed. Retain strict names, bytes and source provenance in the desktop trials.
Then implement R57-C57A root chains and separate human/agent procedures. Do not start R57-C57B before the requested question hook.
OIDC, live npm draft promotion, installation identity/coexistence, updater safety and fleet recovery remain separate open exits.
Config persistence is not durable result recovery or real-source fleet proof.
Private attacker research stays unread until pipeline setup finishes. No remote D1/schema/source grants changed.
