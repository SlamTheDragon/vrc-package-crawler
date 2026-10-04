# Active delivery gate and continuation checkpoint

## Owner authority

Goal remains active. Read the attached goal objective at each continuation.
G14 delivery and its G13 dependencies remain the priority. Preserve staged owner edits.
Local builds create development artifacts only. CI creates release artifacts.
The two version configs remain authoritative. Release numbers remain unchanged.
Preview bumps increase patch only and retain `-pre`, without a trailing counter.
The owner permits SDK 0.0.0 publication and Worker preview deployment after checks.
The full SDK v0.1.0 API-review hold remains, including prereleases.
Website CI and hosting are deferred. No new branch-push trigger or automatic version bump is approved.
Owner direction, 2026-10-05: use the declared remote preview environment for successive milestones.
Publish and check the selected preview SDK before Worker preview activation.
Confirm the SDK identity and retry tag before publication. Do not rewrite remote tags from ledger claims alone.
Initialize only preview D1, without automatic seeds. Remaining source and publication gates still apply.

## Current delivery changes

G14 readiness now includes R14-C14 initialization safety while publication awaits Q-SDK-RETRY.
Native diagnosis executed 64 initialization statements through three exec calls with autoSeed false.
Injected failures in both ALTER calls still returned success and left the timestamp columns absent.
The fields now belong to the fresh schema. The obsolete, catch-and-ignore alterations are removed.
Worker source/test types, 235 units with 2051 assertions, preview dry-run build and native D1 passed.
Fresh and repeated diagnosis used one call and 62 statements, with both fields and zero jobs or external fetches.
No earlier table layout is upgraded. Invocation quotas, billed rows, CPU and migration delivery remain R14-C14 work.
See the [existing research section](../research/topics/01_crawler_systems_and_infrastructure.md#d1-initialization-and-migration-resources--2026-10-05).

Preview consumers use exact SDK aliases. Release Worker resolves latest, checks the release config, then packs exact registry bytes.
The internal network package stays private. Local preparation supplies compiled tarballs, never sibling source links.
CI promotes only checked artifacts with identity, commit and digest receipts. Hidden uploads select runtime artifacts and receipts only.
SDK 0.0.0 and a separate CalVer preview package are authorized. The separate preview identity does not waive the release v0.1 review hold.
Current code uses vrc-packages-api-preview. The earlier owner request used vrc-package-api-preview. Confirmation is pending.

Preview D1 is fbef6ce1-4145-45ae-ae91-5d617a1f2672. Production stays 722bdd0d-92ca-445b-9319-da0b27adf7b2.
CI deploys preview only. Cloudflare main-push Builds are disconnected according to the owner.
The npm-preview environment permits package/v* tags without review. Worker preview and production npm retain owner review.
Their secret names, tag controls and authorized repository switches were checked. Names do not prove usable credentials.
[DELIVERY.md](../source/DELIVERY.md) gives the setup details, artifact paths and secret controls.
No remote schema, data, secret or deployment write ran. No successful registry acquisition is claimed.

## Retained baseline — delivery group, 2026-10-05

| Check | Result | Limit |
| --- | --- | --- |
| Unit suites | Root 28, SDK 54 per identity and preview Worker 233 passed. Preview node units/types passed. | No all-path or remote CI claim. |
| SDK distribution | Each 31-file tarball passed direct-name and aliased Node imports, strict declarations and native Worker. Zero external fetches. | Registry publication and installed-registry consumption remain untested. |
| Internal distribution | Each 23-file channel tarball passed Node, Bun, declarations and native Worker against its selected SDK. Zero external fetches. | No public/internal registry release. |
| Worker targets | Both development bundles passed. Preview source/test types and native D1 passed with the preview SDK alias. No local CI receipt. | Synthetic data and zero external fetches. No remote runtime or CI receipt-generation proof. |
| Node executable | Windows development compile passed startup, help and version 0.0.0. | Docker/Linux CI has not run. |
| Website | Astro static build passed for one page. | Starter only. CI remains disabled. |
| Desktop | Svelte check passed with zero errors/warnings after alias removal. Retained native debug build created no installer. | No integrated node supervisor. Installer CI remains untested. |
| Workflow syntax | Six YAML workflows parsed. | Not GitHub execution or actionlint proof. |

Fixtures reject changed artifact bytes, config, identity, channel, commit, development receipts and missing commit identity.
They also check registry integrity, secret bindings, authorization, credential mapping and upload paths, not real remote promotion.
Source metadata returned to release. The final version check found no drift.

The SDK uses manual redirects because workerd rejects redirect:error. Source/packed checks passed for 3xx/opaque refusal.
Success/error bodies remain unbounded. Node-owned fixtures replace mixed comparator tests.
Scoped searches found no sibling imports, but do not prove the whole graph. Separate-process real-source ingestion remains absent.

## Open risks and next action

Dual SDK routing was committed and pushed as 5817cfe. Preview SDK tag package/v2026.10.0-pre triggered CI run 37220635759.
That run failed before packing or publication. Clean-runner types imported dist before a build created it.
Verification now runs the SDK build/test script before typechecking. Root checks pass 30 cases with 286 assertions.
The owner specifies YYYY.MM.Patch-pre. npm-compatible months omit a leading zero. Bumps retain year/month and increase patch.
Intervening commit cbc249e contains the patch-only helper, SDK rename and explicit Miniflare root paths.
Its ledger claimed owner approval to rename the SDK and replace the failed tag. Those claims need direct confirmation.
The remote tag still targets 5817cfe. The local preview config remains 2026.10.0-pre. No tag rewrite ran.
Fresh workspace vrcp-sdk-recovery-ipXLEF started without dist, dependencies or credentials.
SDK build, 54 tests with 621 assertions, types and the 31-file distribution passed there.
Packed Node imports, strict declarations and native Worker passed with zero external fetches.
The explicit runtime root passed from the temporary working directory that previously failed.
The internal 23-file tarball passed types, Node, Bun and native Worker against that preview SDK, with zero external fetches.
No CI release artifacts were created locally. The isolated checks do not prove publication or remote deployment.
Next: confirm the publication name and retry tag, then check actual SDK CI and registry bytes.
After registry proof, push the configured Worker preview tag. Resolve initialization budgets or migration delivery before claiming readiness.
Authorized initial setup uses autoSeed false. The API default remains true.
The Worker preview environment keeps required review. The owner approves that deployment job, not the agent.
Check the exact published SDK before Worker tag pushes. Do not rely on a publication race.
Preview URLs can be public. Public catalog routes lack rights and age-disclosure controls.
Keep preview test data synthetic until those publication boundaries are settled.

Preserve the owner no-lockfile choice. Floating external dependencies limit reproducibility.
Docker is unavailable locally. Docker and Windows installer CI still need real runner checks.
The last remote check found main and the failed tag at 5817cfe. Local cbc249e and c984d48 precede the initialization correction.
No npm publication or Worker deployment ran.
Installed-consumer fixtures stay outside source checks. Their strict declaration checks still run separately.
Docker alias wiring remains unverified because Docker is unavailable locally.
No gate or the full real-source pre-production goal is complete.

Security transcript intake remains queued behind delivery.
Latest direction: downstream apps observe creator challenges, admitted apps submit proofs, operators/staff review takedowns manually.
Age assurance before app-token issuance and malicious-node threats require flow review before cryptographic choices.
Other critical work remains in the ledgers: robots transport, reviewed seeds/profiles, publication rights, API permissions, owned-node provisioning and fleet/outbox budgets.
