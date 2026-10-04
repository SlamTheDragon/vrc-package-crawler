# Development and tagged delivery

Implementation status, 2026-10-04: the earlier grouped local checks passed for packages, node, Worker, website and desktop development builds.
The latest registry-consumption and preview-binding changes await the next grouped checkpoint. Remote CI remains unverified.
Local commands create development outputs only. They do not upload releases, publish packages or deploy a Worker.

## Version authority

`config.versions.json` supplies release versions. `config.preview.versions.json` supplies preview versions.
Tags use these exact values, with the form `<product>/v<configured-version>`.
No command substitutes the example `0.0.1` for a config value.
Version changes, metadata sync, builds and external publication are separate actions.

| Product | Version meaning | Tagged destination |
| --- | --- | --- |
| package | npm-compatible version from its config | SDK tarball and gated release publication. npm preview publication is deferred. |
| network | npm SemVer for internal contracts, with `pre` for preview distribution | CI tarball only. Registry selection remains open. |
| worker | Runtime version, with `pre` for preview | Persistent preview Worker or existing production Worker |
| crawler | Headless executable version | Standalone CI binary and optional container publication |
| crawler-client | Desktop application version, not a staging environment | Unsigned Windows shell installers in CI |
| web | Site artifact version. Current calendar-shaped value remains authoritative. | CI is disabled pending hosting selection. Local static builds remain available. |

Numeric values must fit SemVer syntax. Calendar-shaped values do not become API compatibility guarantees.
UI and headless preview values can omit a prerelease label. Distributed npm packages and Worker preview values require `pre`.
If both configs select the same product version, tag routing fails instead of choosing a channel silently.
Resolve that ambiguity before a tagged build. A branch name does not select a release channel.
The current SDK preview value, `2026.10.0-pre`, exceeds the owner's `v0.1.0` publication hold.
It can support development checks but cannot bypass that hold. npm preview publication is deferred.
Preview consumers pin the release SDK from `config.versions.json`, not the SDK preview version.
The owner proposed a second preview package. That proposal is not implemented or published.

## Local development

Run from the repository root. Install Node with npm and the project's Bun version.
Root setup installs orchestration dependencies only.

```sh
npm run setup
npm run versions:sync:preview
npm run prepare:dev -- preview worker
npm run build:dev -- preview worker
```

Local `prepare` syncs the SDK to its release version, then builds and packs dependencies under each package's `.artifacts/dev/`.
It installs tarballs into the selected consumer. It does not use source links or query unpublished internal registry coordinates.
Worker CI downloads the exact release SDK from npm and checks its identity, SHA-512 integrity and compiled-file allowlist.
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
npm run versions:bump -- preview worker pre
```

Patch, minor and major increments are arithmetic SemVer operations, not automatic calendar updates.
Edit calendar-shaped versions directly when a calendar sequence is intended.
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
| `package/v` | vrc-packages-api.yml | Upload the checked SDK tarball. Optional npm publication retains the package/API holds |
| `network/v` | network.yml | Upload the internal tarball. No registry publication |
| `web/v` | web.yml | Disabled pending hosting selection |

Worker deployment downloads the bundle from its build job. It installs only pinned Wrangler tooling and uses `--no-bundle`.
It does not rebuild source in the deployment job.
SDK publication downloads the packaged artifact and checks its name, version, commit and SHA-256 digest.
Neither path creates tags or pushes branches. GitHub artifacts are build outputs, not automatically created GitHub Releases.

## Owner setup before remote activation

1. Keep automatic main-branch Cloudflare Builds disconnected. The owner reports this setup is done.
2. Create protected GitHub environments named `preview` and `production`.
3. Add required reviewers and allowed tag rules to both environments.
4. Set environment-scoped Cloudflare account and API token secrets.
5. Check that both D1 IDs belong to the intended account and represent separate databases.
6. Set distinct Worker operator secrets for preview and production.
7. Protect preview access before sending real restricted or personal metadata.
8. Enable a publication/deployment switch only after its gate passes.

The switches are `VRCP_WORKER_DEPLOY_APPROVED`, `VRCP_CONTAINER_PUBLISH_APPROVED` and `VRCP_SDK_PUBLISH_APPROVED`.
Each must equal `true` to enable its external action. They are off when absent.
GitHub environment protection is a panel setting. YAML cannot create required reviewers.
Store `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in each protected environment.
Use a least-privilege account token. Never reuse preview credentials as production operator credentials.
The owner reports environment secrets and `NPM_TOKEN` are configured. Their names, scopes and approvals still need CI checks.
SDK version `0.0.0` publication is authorized after package verification. Its manifest declares the existing Apache-2.0 license asset.
The SDK private flag is removed. CI publication still requires the checked artifact, release tag and approval switch.
The complete owner API review hold still blocks `v0.1.0` and later SDK publication.
The hold also includes `v0.1` prereleases. It does not block the newly authorized `v0.0.0` release.

Production keeps Worker name `vrc-package-crawler` and D1 ID `722bdd0d-92ca-445b-9319-da0b27adf7b2`.
Preview uses Worker name `vrc-package-crawler-preview` and `vrcp-preview-d1`, ID `fbef6ce1-4145-45ae-ae91-5d617a1f2672`.
An authenticated D1 listing confirmed the separate database on 2026-10-04. No schema or data writes ran.
Preview is a persistent Wrangler environment, not a branch Preview or a production Version URL.
Its separate D1 binding and secret configuration are explicit because bindings do not inherit across environments.
`remote = false` controls local development, not remote deployment isolation.

Worker URLs can be public without access controls. Current public catalog routes do not enforce age or publication-rights gates.
Do not treat API token checks on other routes as protection for public routes.
Schema initialization is an authenticated `/v1/operator/init` operation, not an automatic deployment step.
Review schema changes before activation. Code rollback does not roll back D1 data.
The Compose file requires an explicit reviewed CI image. Watchtower and its Docker socket still need a separate review.

## Release order and open preview policy

Publish and check the configured release SDK before pushing Worker tags that consume it.
Do not push all product tags at once and assume npm publication wins the build race.
Worker preview deployment remains authorized. Production deployment is not part of that authorization.
The current workflows use product-tag pushes only. Branch-push previews and automatic version increments remain proposals.
If adopted, define the branch, version owner, collision handling and loop prevention before changing triggers.
npm distribution tags name channels within one package. They do not create separate deployments or make a published version replaceable.
A second package would need explicit names, dependency routing and the same verification and owner-review gates.

Sources: [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/),
[workflow comparison](https://developers.cloudflare.com/workers/previews/compare-workflows/),
[external GitHub CI](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/),
[Bun executable targets](https://bun.sh/docs/bundler/executables),
[npm publication](https://docs.npmjs.com/cli/v11/commands/npm-publish/).
