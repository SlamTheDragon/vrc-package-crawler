# G14 — R57-C57A root delivery chain

## Authority and active boundary

The full goal remains active. Both artifact channels for enabled distributed products are checked.
The owner authorizes current and subsequent delivery trials. npm keeps separate owner staging review and the SDK v0.1 API-review hold.
Desktop preview remains 26.10.0-pre. Only MSI receives numeric 26.10.0. Other product formats stay unchanged.
Website delivery stays deferred. Production Worker deployment is disabled. Cloudflare has no GitHub Release assets.
Finish R57-C57A and ask the requested question hook before R57-C57B. No dedicated desktop notification tool is available.

## Ground truth and working theory

R57-C57A now has root plan/execute/status/check/retry commands.
Theory: standard Git atomic pushes and existing product workflows can supply the chain without a new CI controller.
The dry-run reports dirty worktrees, divergent origin and existing tags. Execution commits only the selected config patch.
CI owns manifest sync, channel dependencies, builds, publication and attachments. npm approval stays manual.
Exact retries retain the original tag/version. Public artifact checks reuse receipt validation in memory.
Human procedures are in DELIVERY.md and CONTRIBUTING.md. The separate agent procedure is in docs/decisions/AGENT_DELIVERY.md.
Owner README edits remain untouched. The ledger retains the owner's PER RESPONSIBILITY and each-preview-channel wording.

## Grouped gate evidence

Root: 69 tests, 747 assertions passed. Release metadata, syntax and diff checks passed.
The first run hit default five-second test timeouts during real temporary Git operations.
Explicit fixture timeouts fixed that harness failure. No check or approval was removed.
Fixtures cover config-only commits, atomic pushes, lost push ACK, dirty/divergent/existing-tag refusal and malformed public artifacts.
The root checker passed the existing desktop preview and network preview Releases with no local artifact writes.
Docs lint issues per 100 words: DELIVERY 1.30, agent procedure 0.80, CONTRIBUTING 1.47.

SDK release/preview registry and Release bytes passed current rechecks.
Network release 37245377275 and preview 37245068853 have four checked assets each. Retry 37246014865 retained preview bytes.
Crawler release 37244482532 and preview 37244482335 have six checked assets each and independently checked GHCR channels.
Preview GHCR manifest: sha256:6af2b893a100639f31d0a01929e1aefbadb0ab8a950a419c7e8fa1ccb768e24f.
Release GHCR manifest: sha256:5f3db18b98868fb356fed96ba49bb3b05a25d125deea24ea127c73cbdfbdbe82.
Desktop release 0.0.1 run 37248173416 passed five strict assets at 1208199.
Repaired preview run 37249187889 passed five strict assets at b8c8edc5656be389d0e8edab4b14882af5728cf7.
Preview MSI SHA-256: fec1738e0f1ba3d1943ce1ccb49fc78db44fa1f1c9ba36225615f72a9d349922.
Preview NSIS SHA-256: 67df435c67dae990fdacdd40868b44d1bfeac0f829aa87bb3dbd16199ad1cec4.
Original desktop 0.0.0 remains immutable with its known hosted filename mismatch.
SDK deployment environments now link channel npm pages. Staging success does not prove approved publication.

## Recovery and next action

Failed unpublished desktop preview tag object de7481a8dfd9255740953c11e1d5d54f165fcae0 was replaced under an exact-target lease.
Failed crawler release/preview tag objects f9b91f3d55417ed8f84d9597acd09ca185b91516 and 453041770201c42111fc52fc8d1ea5f79024543d were also replaced.
All published replacements are now immutable.

Next: commit the checked root chain, then run an authorized network preview trial from a clean temporary checkout.
Check its exact source run and public assets before marking R57-C57A checked.
Keep owner README edits outside the commit. No local release builds, D1 changes or source grants.
OIDC, live npm draft promotion, installation identity, updater safety and real-source fleet recovery remain open.
Private attacker research remains unread until pipeline setup finishes.
