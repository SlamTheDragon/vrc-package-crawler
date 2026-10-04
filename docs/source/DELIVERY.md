# Development and tagged delivery

Implementation status, 2026-10-05: the grouped local checks passed for packages, node, Worker, website and desktop development builds.
Preview dependency selection and the replacement D1 binding passed local checks. Remote CI and registry SDK consumption remain unverified.
Local commands create development outputs only. They do not upload releases, publish packages or deploy a Worker.

## Version authority

`config.versions.json` supplies release versions. `config.preview.versions.json` supplies preview versions.
Tags use these exact values, with the form `<product>/v<configured-version>`.
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

| Tag prefix | Workflow | External action |
| --- | --- | --- |
| `worker/v` | worker.yml | Preview-only deployment after approval and the switch. Release tags build without production deployment. |
| `crawler/v` | node-docker.yml | Upload Windows/Linux binaries. Publish a checked musl container only with the publication switch |
| `crawler-client/v` | node-client.yml | Upload unsigned Windows installers. No updater or crawler installation contract |
| `package/v` | vrc-packages-api.yml | Upload the checked SDK tarball. Publish release in production or preview in npm-preview under separate switches |
| `network/v` | network.yml | Upload the internal tarball. No registry publication |
| `web/v` | web.yml | Disabled pending hosting selection |

Worker deployment downloads the bundle from its build job. It installs only pinned Wrangler tooling and uses `--no-bundle`.
It does not rebuild source in the deployment job.
CI creates a receipt for the current single-file Worker bundle, with product, version, channel, commit and SHA-256 digests.
Deployment checks the bundle bytes and Wrangler config against this receipt before creating a temporary secret file.
Missing or mismatched receipts stop deployment. Local development builds do not create CI receipts.
SDK publication downloads the packaged artifact and checks its name, version, commit and SHA-256 digest.
The shared receipt check requires a valid GitHub commit identity. It rejects development receipts and changed bytes.
These checks detect handoff errors, not a compromised runner that can replace both the artifact and its receipt.
Worker, SDK and network uploads explicitly include their hidden output directories, but select only runtime files and receipts.
They do not upload entire projects, node_modules, local state or credential files.
Neither path creates tags or pushes branches. GitHub artifacts are build outputs, not automatically created GitHub Releases.

## Owner setup before remote activation

GitHub environments protect CI jobs. Wrangler environments select Worker settings, resources and runtime secrets.
They are separate systems. A GitHub environment does not create a Worker or a D1 database.
An npm or Cloudflare account token does not automatically become a GitHub Actions secret.
An ignored local `.env` file does not supply secrets to remote CI.

1. Keep automatic main-branch Cloudflare Builds disconnected. The owner reports this setup is done.
2. Open this repository's GitHub Settings, then Environments.
3. Create environments named `preview` and `production`.
4. Add required reviewers where the repository's GitHub plan permits them.
5. Keep self-review enabled if the owner is the only reviewer.
6. Under selected deployment branches and tags, add a Tag rule `worker/v*` for preview.
7. Add a Tag rule `package/v*` for production's current SDK publication path.
8. Add the environment secrets from the table below.
9. Open Settings, then Secrets and variables, then Actions, then Variables.
10. Add the repository variables from the table below with value `false`.
11. Check the environment protection, secret names and token scopes before tag promotion.
12. Protect preview access before sending restricted or personal metadata.

| GitHub location | Name | Purpose |
| --- | --- | --- |
| preview environment secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account that owns the Worker and D1. This is not a database ID. |
| preview environment secret | `CLOUDFLARE_API_TOKEN` | Account-scoped Worker deployment credential. Limit its permissions to the deployment's requirements. |
| preview environment secret | `OPERATOR_TOKEN` | Project administrator API key. CI installs this binding into the preview Worker. |
| production environment secret | `NPM_TOKEN` | SDK publishing credential. CI supplies it as both NPM_TOKEN and NODE_AUTH_TOKEN. |
| npm-preview environment secret | `NPM_TOKEN` | Credential permitted to publish vrc-packages-api-preview. No Cloudflare secrets belong here. |
| repository Actions variable | `VRCP_WORKER_DEPLOY_APPROVED` | Enables preview deployment when equal to true. |
| repository Actions variable | `VRCP_SDK_PUBLISH_APPROVED` | Enables release SDK publication when equal to true. |
| repository Actions variable | `VRCP_SDK_PREVIEW_PUBLISH_APPROVED` | Enables preview SDK publication when equal to true. Independent of Worker deployment approval. |
| repository Actions variable | `VRCP_CONTAINER_PUBLISH_APPROVED` | Enables container publication when equal to true. Keep it absent or false until its gate passes. |

Approval variables belong at repository scope because the job condition runs before the job enters its environment.
An absent switch disables the external action. These switches do not replace environment approval or artifact checks.
Environment secrets become available only to jobs that select that environment and pass its protection rules.
An existing environment named `cloudflare` does not supply secrets to jobs that select `preview` or `production`.
The current production Worker deployment remains disabled. Its credentials are not necessary for initial SDK publication.
Future products require their own allowed-tag rules before their protected jobs can run.

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

Save the value in a password manager. Paste it into the preview environment's OPERATOR_TOKEN secret.
Clear the clipboard after setup. Use a different key for local development and future production.
CI deploys this binding with pinned Wrangler 4.147.0 and `--secrets-file`.
It does not upload Cloudflare or npm credentials as Worker bindings.
The temporary secret file is removed after the deployment attempt. Remote execution of this path remains unverified.

The read-only GitHub inspection on 2026-10-05 confirmed the expected preview and production secrets from this table.
It confirmed the Worker and SDK switches at repository scope, both false before activation.
The later inspection confirmed owner self-review is allowed, with required review still enabled.
Preview allows only `worker/v*` tags. Production allows only `package/v*` tags.
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
The failed first `package/v2026.10.0-pre` run published nothing. The owner directs reuse of patch 0, so that Git tag moves to the corrected commit.
The dual-package path uses one SDK source with channel-specific manifests and artifact checks.
Preview consumers declare npm:vrc-packages-api-preview@latest under the existing vrc-packages-api import name.
Each SDK publication updates latest within its separate package identity, including preview versions with the pre suffix.
CI checks the resolved latest version against its channel config, then downloads and installs that exact verified tarball.
Advance the preview config for later milestones. A moving registry tag cannot silently change a checked build.
The private network package pins the exact SDK alias. Its packed dependencies cannot silently select a later SDK through latest.
Promotion to the release identity is a separately checked release build and publication, not a renamed preview tarball.

Create a separate GitHub environment named `npm-preview` for automatic preview package publication.
Add its `NPM_TOKEN` secret with permission to publish the new identity.
Allow Tag refs matching `package/v*`. Omit required reviewers only if automatic package publication is intended.
Keep required review on the existing Worker `preview` environment. It retains the separate D1 and Cloudflare secrets.
The workflow selects `npm-preview` only for preview SDK publication.
SDK concurrency is separate per channel. A protected release publication cannot hold later preview publications in the same queue.
The 2026-10-05 metadata inspection confirmed this environment, its NPM_TOKEN, package/v* tag rule and absence of required reviewers.
Keep release SDK publication in `production`, with its existing approval rule and v0.1 API-review hold.
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
