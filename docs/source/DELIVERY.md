# Development and tagged delivery

Implementation status, 2026-10-05: the grouped local checks passed for packages, node, Worker, website and desktop development builds.
Preview dependency selection, the replacement D1 binding and the persistent preview Worker deployment passed.
Local commands create development outputs only. They do not upload releases, publish packages or deploy a Worker.

Remote checkpoint: SDK release run 37234232443 and preview run 37234232436 passed at commit 8907ef2.
Both runs uploaded the checked tarball and a separate npm stage receipt. The owner promoted the stages on npm.
Public latest resolves to vrc-packages-api@0.0.0 and vrc-packages-api-preview@2026.10.0-pre.
The published tarballs match their CI stage receipts by SHA-256. The check used memory only, with no local release files.
The authorized SDK tag replacements used exact-target leases. Published SDK tags must not move again.
Worker run 37235649307 passed at 8907ef2 for worker/v2026.10.0-pre.
It deployed version 4a93db4f-8d7f-493b-9d85-76ead98d4510 to the separate persistent preview Worker.
The unauthenticated operator-init probe returned 401. No remote schema initialization or source grant ran.
SDK release attachments passed remotely at 12b26f1. Runs 37237551535 and 37237553499 attached the original checked outputs.
The two SDK releases contain five assets each. All checksum entries match uploaded digests.
Owner correction: Worker environments have no GitHub Release assets. Worker bundles and receipts stay in Actions artifacts.

## Version authority

`config.versions.json` supplies release versions. `config.preview.versions.json` supplies preview versions.
Tags use these exact values, with the form `<product-prefix>/v<configured-version>`.
Config keys and local command product names stay unchanged. Product-specific tag prefixes select those keys.
Already-published generic tags stay immutable. Only historical attachment checks accept their earlier prefixes.
No command substitutes the example `0.0.1` for a config value.
Version changes, metadata sync, builds and external publication are separate actions.

| Product | Version meaning | Tagged destination |
| --- | --- | --- |
| package | Release SemVer or preview CalVer with pre, from the selected config | Two npm identities from one SDK source. Separate publication environments and switches. |
| network | npm SemVer for internal contracts, with `pre` for preview distribution | CI tarball only. Registry selection remains open. |
| worker | Runtime version, with `pre` for preview | Persistent preview Worker or existing production Worker |
| crawler | Headless executable version | Standalone CI binary and optional container publication |
| crawler-client | Desktop application version, not a staging environment | Unsigned Windows shell installers in CI |
| web | Site artifact version. Current calendar-shaped value remains authoritative. | CI is disabled pending hosting selection. Local static builds remain available. |

Numeric values must fit SemVer syntax. Calendar-shaped values do not become API compatibility guarantees.
UI and headless preview values can omit a prerelease label. Distributed npm packages and Worker preview values require `pre`.
If both configs select the same product version, tag routing fails instead of choosing a channel silently.
Resolve that ambiguity before a tagged build. A branch name does not select a release channel.
The owner authorizes release `0.0.0` and configured CalVer preview publication after artifact checks.
Release `v0.1.0` remains the stable `/v1/` milestone and requires the full owner API review.
That release-version hold does not block the separate preview identity.

| Consumer channel | SDK identity | Dependency selection |
| --- | --- | --- |
| Preview Worker and other preview apps | vrc-packages-api-preview | npm:vrc-packages-api-preview@latest under vrc-packages-api, checked against the preview config |
| Preview internal network package | vrc-packages-api-preview | Exact config-selected SDK alias, preserving the tested compiled dependency pair |
| Release Worker | vrc-packages-api | latest, with its resolved version checked against config.versions.json |
| Other release consumers and release network | vrc-packages-api | Exact version from config.versions.json |

The two identities share one source tree and export layout. They do not share npm version histories.
API schema versions remain independent of package versions.

## Local development

Run from the repository root. Install Node with npm and the project's Bun version.
Root setup installs orchestration dependencies only.

```sh
npm run setup
npm run versions:sync:preview
npm run prepare:dev -- preview worker
npm run build:dev -- preview worker
```

Local `prepare` syncs the SDK to the selected channel, then builds and packs dependencies under each package's `.artifacts/dev/`.
It installs tarballs into the selected consumer. It does not use source links or query unpublished internal registry coordinates.
Worker preview CI resolves the preview SDK's latest tag and checks its version against the preview config.
Release Worker CI resolves the release SDK's latest tag and rejects a version outside the authoritative release config.
It then packs that exact version, not the moving tag. Both paths check identity, SHA-512 integrity and compiled files.
It then builds the internal network tarball against that SDK. A missing registry version fails the build without a source fallback.
This development path does not select a public or private registry for the network package.
No install scripts run during preparation. Product build commands run their required build hooks explicitly.
Dependency resolution is not frozen. Preserve the owner's no-lockfile choice and record this reproducibility limit.

Use `crawler`, `crawler-client`, `web`, `package` or `network` instead of `worker` for another product.
The desktop development build uses `--debug --no-bundle`. It does not create installation bundles locally.
Crawler development binaries stay under `src-crawler/dist/dev/`.
Worker dry-run bundles stay under `src-worker/.wrangler/dev-build/<preview|production>/`.
SDK/network compiled modules stay under their own `dist/`. Root outputs are not used.

Change one version config value without building or publishing:

```sh
npm run versions:bump -- release worker patch
npm run versions:bump -- preview worker patch
```

Release patch, minor and major increments are arithmetic SemVer operations, not automatic calendar updates.
Preview bumps derive year and month from the current UTC calendar, increase patch and retain the pre suffix.
In the same month, `2026.10.0-pre` becomes `2026.10.1-pre`. In November, that next bump becomes `2026.11.2-pre`.
The preview SDK uses YYYY.M.Patch-pre. npm requires months without a leading zero. No trailing prerelease counter is allowed.
Only the explicit bump command reads the calendar. Builds and publication read the saved config, preserving older tagged builds.
Sync metadata separately after a config change. Product-only sync does not sync its dependency projects.
Use an all-product sync when preparing a consistent dependency graph for the selected config.

Start a local Worker from `src-worker` with `npm run dev`.
The preview configuration uses local D1, with state under `.wrangler/local-preview`.
Supply a local `OPERATOR_TOKEN` in an ignored `.dev.vars.preview` file.
Never put it in shell history, tracked files or browser assets.
Local operation does not prove remote database ownership or runtime safety for all sources.

## Tagged CI paths

Only product-tag pushes trigger build workflows. Ordinary branch pushes do not trigger these workflows.
The tag must match exactly one authoritative config. CI syncs metadata from that config.
Related SDK/network builds supply packaged dependencies. Consumer builds import no sibling source.

The SDK runtime depends on Zod, not Wrangler, Miniflare or coordinator code.
Wrangler and Miniflare are SDK development dependencies for the packed distribution test.
That test builds a temporary consumer with Wrangler deploy --dry-run, then runs it locally with external fetches blocked.
It does not deploy the SDK, use Cloudflare credentials or include Worker infrastructure in SDK exports.

| Tag prefix | Workflow | External action |
| --- | --- | --- |
| `cloudflare-worker/v` | cloudflare-worker.yml | Automatic preview-only deployment through cloudflare-preview with the switch enabled. Release tags build without production deployment. |
| `vrcp-crawler/v` | node-docker.yml | Upload Windows/Linux binaries. Publish a checked musl container only with the publication switch |
| `vrcp-crawler-client/v` | node-client.yml | Upload unsigned Windows installers. No updater or crawler installation contract |
| `vrcp-api/v` | vrc-packages-api.yml | Build the SDK, then stage it in vrcp-api-release or vrcp-api-preview. npm publication requires owner 2FA |
| `vrcp-network/v` | network.yml | Upload the internal tarball. No registry publication |
| `web/v` | web.yml | Disabled pending hosting selection |

Each successful distributed-product delivery calls the shared GitHub Release attachment workflow automatically. Worker deployments do not.
The API workflow keeps its filename because npm trusted publishers match that exact filename.
The network release is a checked tarball distribution, not an npm publication.

Worker deployment downloads the bundle from its build job. It installs only pinned Wrangler tooling and uses `--no-bundle`.
It does not rebuild source in the deployment job.
CI creates a receipt for the current single-file Worker bundle, with product, version, channel, commit and SHA-256 digests.
Deployment checks the bundle bytes and Wrangler config against this receipt before creating a temporary secret file.
Missing or mismatched receipts stop deployment. Local development builds do not create CI receipts.
SDK staging downloads the packaged artifact and checks its name, version, commit and SHA-256 digest.
CI uses npm 11.19.0. It uploads the tarball without source hooks and selects explicit latest for each SDK identity.
An existing stage must match the SDK identity, version, tag and checksum. Downloaded staged bytes must match the original SHA-256 receipt.
The stage record contains its ID, checked artifact digest and awaiting-npm-approval status. CI uploads this record separately.
CI does not approve or reject npm stages. A successful stage job does not prove package publication.
The shared receipt check requires a valid GitHub commit identity. It rejects development receipts and changed bytes.
These checks detect handoff errors, not a compromised runner that can replace both the artifact and its receipt.
Worker, SDK and network uploads explicitly include their hidden output directories, but select only runtime files and receipts.
They do not upload entire projects, node_modules, local state or credential files.
Neither path creates tags or pushes branches. GitHub artifacts are build outputs, not automatically created GitHub Releases.
SDK run 37234232443 contains sdk-release and sdk-release-stage. Run 37234232436 contains sdk-preview and sdk-preview-stage.
Download these outputs from each Actions run's Artifacts section. npm publication does not create a GitHub Release itself.

## Release assets and milestone notes

Distributed-product workflows call release-assets.yml after required build and delivery jobs pass. Worker workflows do not call it.
Website CI remains disabled. This wiring does not activate website builds or container publication.
The attachment job downloads the original CI outputs into runner temporary storage. It never rebuilds them.
It checks the source repository, tag, commit, product workflow and required successful jobs.
It checks every file against the original receipt. Extra files, changed bytes and duplicate names stop the job.
Worker bundles and receipts remain CI-only. Manual Worker release-asset requests fail before release creation or asset writes.
Crawler attachments include both platform binaries and receipts. Desktop attachments include unsigned installers and their receipt.
Container registry references and publication proof need the separate Docker channel gate.

[CHANGELOG.md](CHANGELOG.md) holds one current milestone summary per product. Do not append an entry for each commit.
CI selects that product's notes. Version configs remain the only version authority.
Each release attaches CHANGELOG.md and CHECKSUMS.sha256 beside the checked outputs. GitHub Release pages hold historical notes.
Preview releases use GitHub's prerelease flag. No product release changes the repository-wide latest pointer.
An SDK release stays a draft until its public npm tarball matches the checked CI bytes.
Published assets are immutable in this workflow. Retries check existing bytes and upload only missing draft assets.
After owner npm promotion, rerun the attachment workflow to publish the checked draft without a new package version.
The sdk-release-reconcile.yml workflow also checks pending SDK drafts each hour, at minute 23.
It reads public npm metadata and requests the original attachment check after publication. It cannot approve npm stages.
The attachment check still compares public tarball bytes before publishing the GitHub Release.
This workflow has no npm or Cloudflare credentials. It only reads releases and dispatches attachment verification.
GitHub can delay scheduled runs. Use its manual trigger for an immediate draft check.
Expired Actions artifacts require owner review. The workflow does not rebuild them or move their tag.

For earlier tags, run release-assets.yml manually on main. Supply the existing product tag and its original successful run ID.
This path attaches original artifacts without moving tags, publishing npm packages or deploying a Worker.
The source run's version configs govern the check, not main's current versions.
Changelog edits after attachment do not replace attached notes. Retries retain their original bytes and complete checksum index.
The retention check requires the original version, channel, commit and source-run link. Changed artifact bytes still stop the job.
Use the next authorized milestone for further note changes.

## Owner setup before remote activation

GitHub environments protect CI jobs. Wrangler environments select Worker settings, resources and runtime secrets.
They are separate systems. A GitHub environment does not create a Worker or a D1 database.
An npm or Cloudflare account token does not automatically become a GitHub Actions secret.
An ignored local `.env` file does not supply secrets to remote CI.

1. Keep automatic main-branch Cloudflare Builds disconnected. The owner reports this setup is done.
2. Open this repository's GitHub Settings, then Environments.
3. Create `cloudflare-preview`, `vrcp-api-preview` and `vrcp-api-release` environments.
4. Require owner review in `vrcp-api-release`. The owner selects automatic deployment/publication in the two preview environments.
5. Keep self-review enabled if the owner is the only reviewer.
6. Under selected deployment branches and tags, add a Tag rule `cloudflare-worker/v*` for `cloudflare-preview`.
7. Add a Tag rule `vrcp-api/v*` for each SDK environment.
8. Add the environment secrets from the table below.
9. Open Settings, then Secrets and variables, then Actions, then Variables.
10. Add the repository variables from the table below with value `false`.
11. Check the environment protection, secret names and token scopes before tag promotion.
12. Protect preview access before sending restricted or personal metadata.

| GitHub location | Name | Purpose |
| --- | --- | --- |
| cloudflare-preview environment secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account that owns the Worker and D1. This is not a database ID. |
| cloudflare-preview environment secret | `CLOUDFLARE_API_TOKEN` | Account-scoped Worker deployment credential. Limit its permissions to the deployment's requirements. |
| cloudflare-preview environment secret | `OPERATOR_TOKEN` | Project administrator API key. CI installs this binding into the preview Worker. |
| vrcp-api-release environment secret | `NPM_TOKEN` | SDK publishing credential. CI supplies it as both NPM_TOKEN and NODE_AUTH_TOKEN. |
| vrcp-api-preview environment secret | `NPM_TOKEN` | Credential permitted to publish vrc-packages-api-preview. No Cloudflare secrets belong here. |
| repository Actions variable | `VRCP_WORKER_DEPLOY_APPROVED` | Enables preview deployment when equal to true. |
| repository Actions variable | `VRCP_SDK_PUBLISH_APPROVED` | Enables release SDK publication when equal to true. |
| repository Actions variable | `VRCP_SDK_PREVIEW_PUBLISH_APPROVED` | Enables preview SDK publication when equal to true. Independent of Worker deployment approval. |
| repository Actions variable | `VRCP_CONTAINER_PUBLISH_APPROVED` | Enables container publication when equal to true. Keep it absent or false until its gate passes. |

Approval variables belong at repository scope because the job condition runs before the job enters its environment.
An absent switch disables the external action. These switches do not replace environment approval or artifact checks.
Environment secrets become available only to jobs that select that environment and pass its protection rules.
Secrets belong to the selected environment. Another environment's secrets do not substitute for a missing name.
The current production Worker deployment remains disabled. Its credentials are not necessary for initial SDK publication.
Future products require their own allowed-tag rules before their protected jobs can run.

### Recreating GitHub environments under new names

Create the replacement environments before deleting the originals. Re-enter secrets and restore reviewers, tag rules and variables.
Tell the delivery agent each old-to-new name mapping before rerunning jobs. Do not rename Cloudflare resources to match GitHub labels.
Update GitHub approval routing in scripts/delivery.mjs, its tests and the setup instructions together.
Worker artifact paths derive from channel, not the approval-environment name. Wrangler preview and production settings remain separate.
Existing tagged runs retain the workflow and routing from their original commit. Updating main does not retarget those reruns.
Keep their original environments until those publications finish, or agree a separate retry strategy before deleting them.
The owner replaced all three original environments and approved the new routing on 2026-10-05.
The original SDK runs still select deleted names. The owner approves replacing both unpublished tags through exact-target leases.
Registry checks and captured tag object IDs precede replacement. Do not rerun the original jobs through deleted environments.
Other products retain their previous routing. Their environment setup remains separate from this SDK/Worker migration.
An unknown environment reference can create an empty, unprotected environment. Verify configuration before starting a migrated workflow.
See [GitHub environment management](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

### npm EOTP recovery

Do not supply an account password or a one-time code to an unattended runner.
Both first publication attempts reached npm publish, then npm required interactive authorization.
The current token's exact settings remain unknown. Secret presence alone does not establish non-interactive publishing permission.

The owner selects staged publication: CI uploads the checked tarball, then the owner approves it with 2FA on npm's website.
This keeps passwords and one-time codes outside CI. The workflow pins npm 11.19.0, above the 11.15.0 staging minimum.
For a new package, npm creates a public 0.0.0-stage placeholder before approval. The owner accepts this bootstrap version.
See [staged publication](https://docs.npmjs.com/staged-publishing/). Staging is implemented. OIDC is not configured.
The owner reports trusted publishers for both npm identities. This does not change the current token-based CI workflow.
CI still supplies NPM_TOKEN and lacks id-token: write. Trusted publishing remains untested in this repository.
The preview publisher reportedly permits npm publish, npm stage publish and npm dist-tag. These permissions do not select a CI operation.
Staging success means an upload awaits review, not that the configured SDK is available to Worker CI.
Record the stage ID alongside the checked CI artifact. The owner must approve the stage before registry verification and Worker tags.
A pending stage reserves its package version. Public registry metadata alone cannot prove that no pending stage exists.
Before a staging retry, inspect existing stages instead of uploading the same version again.
The selected npm tag is fixed for each stage. The approved implementation uses explicit latest for each SDK identity.
See [npm stage command rules](https://docs.npmjs.com/cli/v11/commands/npm-stage/).
After bootstrap, configure trusted publishing against the finalized GitHub environment names for continued automatic preview publication.

1. Open npm account settings, then Access Tokens, then Generate New Token.
2. Create a granular token with Read and write (stage only) package permission. Existing publish-and-stage tokens also support staging.
3. Leave Bypass two-factor authentication disabled. Keep account 2FA enabled.
4. Limit access to the two SDK packages where possible. First unscoped publication can require broader bootstrap access.
5. If broader access is necessary, use a short expiry and replace it with narrower credentials after bootstrap.
6. Replace NPM_TOKEN in `vrcp-api-release` and `vrcp-api-preview`. Never paste the value into chat, source or logs.
7. Tell the delivery agent that setup is ready. The authorized replacement tags select the new environment names.
8. Approve `vrcp-api-release` when GitHub requests it. Preview staging has no GitHub review requirement.
9. After staging passes, open npm's Staged Packages tab and review each SDK identity and configured version.
10. Approve each stage with your npm account's 2FA. Never delegate this step to an unattended runner.
11. Check public registry versions and integrity before starting Worker CI.

Package access, expiry and IP restrictions still apply. Stage-only tokens do not eliminate other token security risks.
See [token setup](https://docs.npmjs.com/creating-and-viewing-access-tokens/) and [token permissions](https://docs.npmjs.com/about-access-tokens/).

Prefer [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) after bootstrap to remove long-lived publishing tokens.
Each package must trust owner SlamTheDragon, repository vrc-package-crawler and workflow vrc-packages-api.yml.
Use vrcp-api-release for the release identity and vrcp-api-preview for the preview identity.
That transition also requires job-scoped id-token: write and a supported npm CLI. It is not enabled by the current token workflow.
OIDC trust tokens cannot list, view or download stages. Review this workflow's inspection credentials before that migration.
npm documents removal of direct token publication in January 2027. The current staging flow does not use direct token publication.

### Operator key

`OPERATOR_TOKEN` is a project API credential, not a Cloudflare, npm, user or node token.
The current Worker requires a 64-character hexadecimal value and checks it as an HTTPS bearer credential.
It authorizes schema initialization, node issuance/revocation, source profiles and other operator controls.
Keep this shared administrator key in protected operator tooling, not browser assets or distributed crawler configurations.
It does not establish creator ownership or replace future per-operator authentication.

Generate 32 random bytes locally. This PowerShell command copies the hexadecimal value without displaying it:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
```

Save the value in a password manager. Paste it into cloudflare-preview's OPERATOR_TOKEN secret.
Clear the clipboard after setup. Use a different key for local development and future production.
CI deploys this binding with pinned Wrangler 4.147.0 and `--secrets-file`.
It does not upload Cloudflare or npm credentials as Worker bindings.
The temporary secret file is removed after the deployment attempt. Worker preview CI passed this path in run 37235649307.

The read-only GitHub inspection on 2026-10-05 confirmed all three current environments and the expected secret names.
That inspection found the earlier worker/v* and package/v* restrictions. The new prefixes require owner updates before another product tag.
Use cloudflare-worker/v* in cloudflare-preview. Use vrcp-api/v* in vrcp-api-preview and vrcp-api-release.
Keep existing secrets and reviewers. Keep the npm trusted-publisher workflow filename unchanged.
The two preview environments have no required reviewer. The owner explicitly accepts automatic preview deployment/publication.
vrcp-api-release requires owner review and permits self-review. All three SDK/Worker enable switches are true.
The owner authorizes the declared remote preview path for successive milestones, without changing version configs.
Secret names do not prove token validity or permissions. A real CI run must check those boundaries.
Check npm publish permission, expiration and non-interactive 2FA requirements before enabling its switch.
SDK version `0.0.0` publication is authorized after package verification. Its manifest declares the existing Apache-2.0 license asset.
The SDK private flag is removed. CI publication still requires the checked artifact, release tag and approval switch.
The complete owner API review hold still blocks release-package `v0.1.0` and later publication, including `v0.1` prereleases.
It does not block authorized release `v0.0.0` or the separately authorized CalVer preview identity.

Production keeps Worker name `vrc-package-crawler` and D1 ID `722bdd0d-92ca-445b-9319-da0b27adf7b2`.
Preview uses Worker name `vrc-package-crawler-preview` and `vrcp-preview-d1`, ID `fbef6ce1-4145-45ae-ae91-5d617a1f2672`.
An authenticated D1 listing confirmed the separate database on 2026-10-04. No schema or data writes ran.
Preview is a persistent Wrangler environment, not a branch Preview or a production Version URL.
The owner retains this separate persistent Worker. Native Previews are deferred to a future metrics and resource-isolation review.
Its active deployment can appear as Production in that Worker's dashboard. This label does not select the production D1 binding.
Its separate D1 binding and secret configuration are explicit because bindings do not inherit across environments.
`remote = false` controls local development, not remote deployment isolation.

Worker URLs can be public without access controls. Current public catalog routes do not enforce age or publication-rights gates.
Do not treat API token checks on other routes as protection for public routes.
Schema initialization is an authenticated `/v1/operator/init` operation, not an automatic deployment step.
For initial preview setup, explicitly send `autoSeed: false`. Do not grant source access or start live crawling through initialization.
Fresh initialization includes both canonical timestamp columns. It does not upgrade earlier table layouts.
Native fresh/repeated checks execute 62 statements through one binding call with no seed jobs.
This count is not proof of Free-tier quota compliance. R14-C14 retains the invocation-budget and migration work.
Review schema changes before activation. Code rollback does not roll back D1 data.
The Compose file requires an explicit reviewed CI image. Watchtower and its Docker socket still need a separate review.

## Release order and open preview policy

Publish and check the selected SDK identity and configured version before pushing Worker tags that consume it.
Do not push all product tags at once and assume npm publication wins the build race.
Worker preview deployment remains authorized. Production deployment is not part of that authorization.
The current workflows use product-tag pushes only. Branch-push previews and automatic version increments remain proposals.
If adopted, define the branch, version owner, collision handling and loop prevention before changing triggers.
npm distribution tags name channels within one package. They do not create separate deployments or make a published version replaceable.
The owner selects `vrc-packages-api-preview` alongside release `vrc-packages-api`.
On 2026-10-05 this name replaced the unpublished `vrc-package-api-preview` to follow the `vrc-packages*` naming rule.
The failed first package/v2026.10.0-pre run published nothing. Its owner-approved replacement already completed before npm promotion.
That published tag cannot move again. Future SDK milestones use the vrcp-api prefix.
The dual-package path uses one SDK source with channel-specific manifests and artifact checks.
Preview consumers declare npm:vrc-packages-api-preview@latest under the existing vrc-packages-api import name.
Each SDK publication updates latest within its separate package identity, including preview versions with the pre suffix.
CI checks the resolved latest version against its channel config, then downloads and installs that exact verified tarball.
Advance the preview config for later milestones. A moving registry tag cannot silently change a checked build.
The private network package pins the exact SDK alias. Its packed dependencies cannot silently select a later SDK through latest.
Promotion to the release identity is a separately checked release build and publication, not a renamed preview tarball.

The workflow selects vrcp-api-preview for automatic preview SDK staging and cloudflare-preview for automatic preview Worker deployment.
Each npm stage still requires owner approval with 2FA before the SDK becomes available to Worker CI.
These environments retain separate npm and Cloudflare credentials. The Worker retains its separate preview D1.
SDK concurrency is separate per channel. A protected release publication cannot hold later preview publications in the same queue.
Keep release SDK publication in vrcp-api-release, with its owner review and v0.1 API-review hold.
Subsequent npm publications require new configured preview versions. Never replace an existing package version or move its release tag.

Sources: [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/),
[workflow comparison](https://developers.cloudflare.com/workers/previews/compare-workflows/),
[external GitHub CI](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[GitHub environment setup](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments),
[GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets),
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[artifact upload v4](https://github.com/actions/upload-artifact/tree/v4),
[artifact digest checks](https://docs.github.com/en/actions/tutorials/store-and-share-data#validating-artifacts),
[npm token permissions](https://docs.npmjs.com/creating-and-viewing-access-tokens/),
[npm aliases](https://docs.npmjs.com/cli/v11/commands/npm-install/),
[Bun executable targets](https://bun.sh/docs/bundler/executables),
[npm publication](https://docs.npmjs.com/cli/v11/commands/npm-publish/).
