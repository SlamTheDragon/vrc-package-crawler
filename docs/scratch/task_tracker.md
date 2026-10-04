# Active delivery gate and continuation checkpoint

## Authority and scope

Goal active. Read the attached objective at each continuation. Active group: G14 delivery with G13 distributed dependencies.
Owner comments approve vrc-packages-api-preview, release SDK 0.0.0 and replacement of the failed unpublished preview tag.
Versions stay 0.0.0 for release and 2026.10.0-pre for preview. No counter or patch bump before this first publication.
Later explicit preview bumps derive current UTC year/month and increment patch. Builds read saved configs, not the clock.
Consumer preview manifests keep vrc-packages-api as the import key, aliased to npm:vrc-packages-api-preview@latest.
Both SDK identities publish latest. Worker CI checks the resolved version against its channel config, then installs exact registry bytes.
The private network package pins its SDK alias to the config version. No sibling source links or internal registry publication.
Main remains the working branch. No branch-push publication or automatic version bumps.
Local outputs are development-only. CI authors release artifacts. Preserve the owner's no-lockfile choice.
Website CI/hosting and production Worker deployment remain off. Release SDK v0.1, including prereleases, requires full owner API review.
Owner approves cloudflare-preview and vrcp-api-preview without required reviewers. Release npm in vrcp-api-release retains owner review.
Do not approve protected jobs through the owner's saved credential.

## Trace and grouped evidence — 2026-10-05

Package tag → config/channel sync → SDK build/tests/types/distribution → tarball receipt → protected npm publication.
Preview Worker tag → checked registry SDK → compiled network tarball → checked bundle receipt → automatic preview deployment.
Theory: this existing delivery path can activate real preview without changing release versions or API contracts.
Current G14 work: apply the owner-approved environment mapping without changing runtime resources or unrelated products.
SDK preview/release routes select vrcp-api-preview/vrcp-api-release. Worker preview selects cloudflare-preview.
Worker artifact paths still derive from channel, matching delivery.mjs, not the GitHub environment label.
Root group passed 33 cases/307 assertions. Script syntax, three real configured tag routes and unchanged release metadata passed.
No npm authentication change, remote Worker execution or tagged-run retry is claimed.

- Root: 33 cases, 307 assertions passed, including the new environment mapping and unchanged unrelated-product routing.
- Preview SDK: build, 54 units/621 assertions, types and 31-file packed Node/declaration/native Worker checks passed.
- Preview network: types and 23-file packed Node/Bun/declaration/native Worker checks passed. Runtime external fetches: zero.
- A transitive network latest alias caused an npm 404 despite the supplied SDK tarball. The exact network alias removed that dependency drift.
- Source metadata returned to release. Version check: changed []. Diff whitespace check passed.
- Retained Worker baseline: 235 units/2051 assertions, source/test types, preview dry-run bundle and native D1 checks passed at de99ad5.
- Retained clean workspace vrcp-sdk-recovery-ipXLEF proves the earlier build-before-typecheck correction without preexisting dist.
- Docker/Linux container and Windows installer CI remain unverified. No full real-source fleet proof.

Native D1 at de99ad5: fresh/repeated initialization uses one exec call and 62 statements, with timestamp columns and zero seed jobs.
The catch-and-ignore ALTER paths are removed. Earlier layouts are not upgraded.
This count does not prove Free-tier query, row or CPU headroom. R14-C14 migration and remote budgets remain open.

## Remote checkpoint and next action

Commit 4d44ae2 and both SDK tags were pushed. The owner explicitly approved failed-tag replacement in chat.
Previous preview tag object: b6d28f468c26374777a68c57fb9da3d24341b2da, dereferencing to 5817cfe. Its replacement used an exact-target lease.
Release CI run 37230866545 and preview run 37230892161 both passed build, distribution checks and artifact upload.
Both publish jobs downloaded artifacts and passed receipt checks, then npm failed with EOTP requiring interactive authorization.
Public npm metadata for both identities remains 404. No package publication is claimed.
The updated workflow separates future SDK concurrency by channel without removing approval requirements.
GitHub cloudflare-preview permits worker/v* without review. vrcp-api-preview permits package/v* without review.
vrcp-api-release permits package/v* with owner review. Expected enable switches remain true.
Expected secret names are present. Names do not prove usable tokens, scopes or publication rights.

Calendar/concurrency correction is pushed at c77a00c. No existing SDK tag moved for that correction.
Next: owner supplies non-interactive npm publishing credentials in both selected environments, or approves a different supported authentication design.
Owner recreated the three environments and explicitly approved their new mapping and automatic Worker preview deployment in chat.
Owner flags npm's January 2027 direct-token publishing cutoff. Authentication selection remains open, not assumed to be token bypass.
Research confirms staged publication supports new packages, but creates a public 0.0.0-stage placeholder requiring owner acceptance.
Staging requires changed CI commands and npm 11.15.0 or later. Later OIDC setup must match the finalized environment names.
Original environments are absent. Existing SDK tagged-run retries still use those deleted names.
Agree a migrated retry strategy before publication. New main routing cannot change those runs' saved commits.
See DELIVERY.md's npm EOTP recovery. Never send an account password or OTP through chat or store it in CI.
After the authentication and retry decisions, check the CI artifact handoff and exact registry bytes.
Check actual CI, downloaded receipts and registry bytes before pushing worker/v2026.10.0-pre.
Then check automatic preview deployment and its API. Release npm still requires owner approval.
See [DELIVERY.md](../source/DELIVERY.md) for setup and paths.

Preview D1: fbef6ce1-4145-45ae-ae91-5d617a1f2672. Production D1: 722bdd0d-92ca-445b-9319-da0b27adf7b2.
Initial preview setup must explicitly use autoSeed false. The API default stays true.
Public catalog routes lack rights/age controls. Use synthetic data only until those boundaries are settled.
No remote Worker deployment, schema/data/secret write or successful npm publication is claimed at this checkpoint.

## Deferred work

Security transcript intake, publication attribution, ratings/age policy, API permissions, owned-node provisioning, robots transport,
reviewed seeds/profiles, fleet budgets and durable outbox remain in the ledgers.
New owner comments outside delivery are preserved, not interpreted as implemented or legally cleared.
The full pre-production goal and G14 remain incomplete.
