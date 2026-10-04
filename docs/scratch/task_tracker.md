# Active delivery gate and continuation checkpoint

## Owner authority

Goal remains active. Read the attached goal objective at each continuation.
G14 delivery and its G13 dependencies remain the priority. Preserve staged owner edits.
Local builds create development artifacts only. CI creates release artifacts.
The two version configs remain authoritative. No numeric values were changed.
The owner permits SDK 0.0.0 publication and Worker preview deployment after checks.
The full SDK v0.1.0 API-review hold remains, including prereleases.
Website CI and hosting are deferred. No new branch-push trigger or automatic version bump is approved.

## Current delivery changes

Product-tag workflows route from the exact config versions, not sample tags.
Local prepare installs compiled SDK/network tarballs without sibling source links.
The internal network package remains private and supplies ten compiled module exports.
Worker CI now requires the exact release SDK from npm, with identity, SHA-512 and file checks.
It builds the internal network tarball against that SDK. No registry-to-source fallback exists.
Preview consumers pin the release SDK. Their own product versions still come from the preview config.
Preparation syncs the dependency SDK metadata to release before building or obtaining its artifact.

SDK publication accepts pre-0.1 versions including the newly authorized 0.0.0.
Its manifest permits publication and declares the existing Apache-2.0 license asset.
npm preview publication is disabled in both the command and workflow.
The owner proposed two package names: one preview-only and one release channel.
That proposal remains open. Do not publish a second identity or waive the API-review hold.
The initial npm check returned 404 for vrc-packages-api. The release must publish before Worker tags consume it.

Worker preview now binds vrcp-preview-d1, ID fbef6ce1-4145-45ae-ae91-5d617a1f2672.
An authenticated Cloudflare listing confirmed it separately from production on 2026-10-04.
Production remains vrc-package-crawler with D1 722bdd0d-92ca-445b-9319-da0b27adf7b2.
Worker deployment is preview-only in CI. Release tags build without production deployment.
The owner reports main-push Cloudflare Builds are disconnected and environment/npm secrets are configured.
These reports do not establish GitHub protection rules, switch values or token scopes.
No remote schema, data, secret or deployment write ran.

Crawler CI defines standalone Windows/Linux binaries in addition to Docker.
The client download, signature, updater and supervision contract remains future work.
The desktop development build uses debug/no-bundle. Its redundant Svelte $lib paths are removed.
CONTRIBUTING.md defines project responsibility, gated changes, versions and source-safety boundaries.

## Measured checkpoint — before the latest delivery edits

| Check | Result | Limit |
| --- | --- | --- |
| Unit suites | Root 20, SDK 54, Worker 233, node 133. Total 440 passing cases. | Does not prove all code paths or remote CI. The new registry/version changes are not included. |
| SDK distribution | 31-file tarball passed Node, strict declarations and native Worker. Zero external fetches. | Registry publication and installed-registry consumption remain untested. |
| Internal distribution | 23-file tarball passed Node, Bun, declarations and native Worker. Zero external fetches. | No public/internal registry release. |
| Worker targets | Production and preview dry-runs and isolated native D1 passed. | The newly supplied preview binding needs the related checkpoint. No remote runtime proof. |
| Node executable | Windows development compile passed startup, help and version 0.0.0. | Docker/Linux CI has not run. |
| Website | Astro static build passed for one page. | Starter only. CI remains disabled. |
| Desktop | Svelte check passed with zero errors/warnings. Native debug executable built without an installer. | Framework alias warning and Rust cache access warning occurred. Alias repair awaits check. No integrated node supervisor. |
| Workflow syntax | Six YAML workflows parsed. | Not GitHub execution or actionlint proof. |

The SDK native check exposed workerd rejecting redirect:error.
The transport now uses manual redirects and rejects 3xx and opaque redirects.
The repaired source and packed fixtures passed. Unbounded success/error bodies remain open.
Node-owned fixtures replace mixed Worker/node comparator tests. Scoped searches found no sibling source imports.
These searches are not whole-graph proof. Separate-process real-source ingestion remains absent.

## Open risks and next action

Finish the package-channel decision before publication/tag promotion.
Then run the affected delivery, distribution, binding, build and native checks as one related checkpoint.
Check registry ownership and the exact published SDK before Worker tag pushes.
Do not push all tags concurrently and rely on a publication race.
Review protected environments, repo-level switches, operator secrets and preview access without logging credentials.
Preview URLs can be public. Public catalog routes lack rights and age-disclosure controls.
Keep preview test data synthetic until those publication boundaries are settled.

Preserve the owner no-lockfile choice. Floating external dependencies limit reproducibility.
Docker is unavailable locally. Docker and Windows installer CI still need real runner checks.
No cleanup, tag, push, npm publication or Worker deployment ran in this iteration.
Local baseline is 3edcdc4. Remote main was 98ccecb at the read-only check. No remote tags were returned.
No gate or the full real-source pre-production goal is complete.

Security transcript intake remains queued behind delivery.
Latest direction: downstream apps observe creator challenges, admitted apps submit proofs, operators/staff review takedowns manually.
Age assurance before app-token issuance and malicious-node threats require flow review before cryptographic choices.
Other critical work remains in the ledgers: robots transport, reviewed seeds/profiles, publication rights, API permissions, owned-node provisioning and fleet/outbox budgets.
