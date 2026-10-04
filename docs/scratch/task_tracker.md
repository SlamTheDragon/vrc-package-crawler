# Active delivery gate and continuation checkpoint

## Owner authority

Goal remains active. Read the attached goal objective at each continuation.
G14 delivery and its G13 dependencies remain the priority. Preserve staged owner edits.
Local builds create development artifacts only. CI creates release artifacts.
The two version configs remain authoritative. No numeric values were changed.
The owner permits SDK 0.0.0 publication and Worker preview deployment after checks.
The full SDK v0.1.0 API-review hold remains, including prereleases.
Website CI and hosting are deferred. No new branch-push trigger or automatic version bump is approved.
Owner direction, 2026-10-05: use the declared remote preview environment for successive milestones.
Keep version configs unchanged. Publish the authorized release SDK 0.0.0 before Worker preview activation.
Initialize only preview D1, without automatic seeds. Remaining source and publication gates still apply.

## Current delivery changes

Active G14 repair passed local checks: a shared receipt check replaces Worker existence-only promotion and npm's separate check.
Worker CI binds the single-file bundle and Wrangler config to product/version/channel/commit and digests before promotion.
Hidden-directory uploads select only bundle/tarball files and their receipts. Real CI execution remains unverified.

Product tags use exact config versions. Local prepare installs compiled SDK/network tarballs without sibling source links.
The private network package supplies ten compiled exports. Worker CI requires the exact release SDK from npm.
It checks identity, SHA-512 and files, then builds the network artifact against that SDK. No source fallback exists.
Preview consumers use release SDK and their own preview versions. Preparation syncs the dependency SDK to release.

SDK 0.0.0 publication is authorized. Its manifest permits publication with the existing Apache-2.0 asset.
npm preview publication is disabled. A second package identity remains a proposal, not publication authority.
The initial registry check returned 404 for vrc-packages-api. Publish and check release SDK before Worker tags.

Preview binds the separately confirmed vrcp-preview-d1, fbef6ce1-4145-45ae-ae91-5d617a1f2672.
Production keeps vrc-package-crawler and D1 722bdd0d-92ca-445b-9319-da0b27adf7b2.
CI deploys preview only. The owner reports main-push Cloudflare Builds disconnected.
GitHub exposes preview/production with the expected secrets. Repository Worker/SDK switches were false at inspection.
Both environments permit owner self-review. Preview allows worker/v* tags. Production allows package/v* tags.
Enable only the authorized SDK/preview switches for the release sequence. Required owner review remains in place.
Secret names do not prove usable credentials. [The setup guide](../source/DELIVERY.md) maps these controls.
OPERATOR_TOKEN is the shared administrator API key. Pinned Wrangler 4.147.0 uploads only this 64-hex runtime binding.
The temporary secret-file path has fixture evidence, not a remote execution result.
No remote schema, data, secret or deployment write ran.

Crawler CI defines Windows/Linux binaries and Docker. Client CI uploads only MSI/NSIS installers.
Desktop development uses debug/no-bundle. Client download, signing, updater and supervision remain future work.
Root setup suppresses package-lock creation. CONTRIBUTING.md supplies development and source-safety guidance.

## Measured checkpoint — delivery group, 2026-10-05

| Check | Result | Limit |
| --- | --- | --- |
| Unit suites | Root 26 passed after handoff repairs. Retained SDK 54, Worker 233 and node 133 baselines. | Those product unit suites were not rerun for the root delivery-only changes. No all-path or remote CI claim. |
| SDK distribution | 31-file tarball passed Node, strict declarations and native Worker. Zero external fetches. | Registry publication and installed-registry consumption remain untested. |
| Internal distribution | 23-file tarball passed Node, Bun, declarations and native Worker. Zero external fetches. | No public/internal registry release. |
| Worker targets | Release development bundle and native D1 passed after handoff repairs. Earlier preview binding/dependency checks passed. No local CI receipt. | Synthetic data and zero external fetches. No remote runtime or CI receipt-generation proof. |
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

The second SDK identity remains deferred. It does not block the expressly authorized release SDK 0.0.0.
Check owner-created GitHub environments, secret names, token scopes, tag rules and repository switches without reading values.
Check registry ownership and the exact published SDK before Worker tag pushes. Do not rely on a publication race.
Preview URLs can be public. Public catalog routes lack rights and age-disclosure controls.
Keep preview test data synthetic until those publication boundaries are settled.

Preserve the owner no-lockfile choice. Floating external dependencies limit reproducibility.
Docker is unavailable locally. Docker and Windows installer CI still need real runner checks.
No cleanup, tag, push, npm publication or Worker deployment ran before this activation checkpoint.
Local and remote baseline: 3fba15d, build paths pre-configured. The checked delivery changes are ready for commit.
Next: enable authorized switches, push the SDK tag, and await the protected publication review.
After registry verification, activate Worker preview. Record remote outcomes separately from local proof.
No gate or the full real-source pre-production goal is complete.

Security transcript intake remains queued behind delivery.
Latest direction: downstream apps observe creator challenges, admitted apps submit proofs, operators/staff review takedowns manually.
Age assurance before app-token issuance and malicious-node threats require flow review before cryptographic choices.
Other critical work remains in the ledgers: robots transport, reviewed seeds/profiles, publication rights, API permissions, owned-node provisioning and fleet/outbox budgets.
