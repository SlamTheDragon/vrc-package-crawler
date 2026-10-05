# Delivery

One rule: **the root `package.json` starts every delivery.** Product folders forward their
`delivery:*` scripts to the root. Version numbers come only from
`config.versions.json` (release) and `config.preview.versions.json` (preview).
Do not edit those files by hand. The bump command changes them.

> Owner target model (2026-10-06). R58 clarifies R57-C57A/B. Open checks are in [§7](#7-target-model-and-current-gaps).
> - **Preview:** bump patch → commit and push → tag → CI builds → publishes with no approval guard → GitHub prerelease page with artifacts.
> - **Release:** same chain, with owner approval checkpoints.
> - Preview works from any synchronized branch. Release requires main after a manually reviewed promotion PR.
> - Keep responsibility branches and separate evergreen tracking PRs. Never merge the tracking PR as a release promotion.

---

## 1. Deliver a product (all products)

From the repository root:

```sh
bun run delivery:preview <product>             # plan only: shows next version, tag, blockers
bun run delivery:preview <product> --execute   # bump, commit, tag, push → CI runs
bun run delivery:status <tag>                  # read the tagged CI run
bun run delivery:check <tag>                   # check published bytes, receipts, registry
```

Use `delivery:release` instead of `delivery:preview` for release.
From a product folder, `bun run delivery:preview --execute` does the same thing.

Start releases only from main after a manually reviewed promotion merge.
The current executor still pushes a version commit directly. Do not bypass protected-main rules.
The reviewed version-PR and final-tag path remains open.

If the push fails, run `bun run delivery:retry <tag>`. This retries the same tag. It does not bump again.
If CI fails, rerun the CI job. Do not bump a new version only to retry CI.
Do not move, delete or force-push a published tag.

For remote preview allocation, start `preview-delivery.yml` with a synchronized branch and product.
The preview App calls the same root executor. It does not allocate versions on every ordinary push.
Configure the App first with [these steps](#preview-app-setup). The live branch trial remains open.
Do not rerun the allocator: it refuses repeated attempts before requesting an App token.
Inspect its original tag first. Retry that tag's delivery, not another patch allocation.

**Order:** publish producers before consumers. That is the SDK (`package`), then `network` if SDK peer bounds changed,
then `crawler` / `worker` / `crawler-client`. Do not push all tags at once.

## 2. npm SDK — `src-package` (`package`)

1. Update the `package` section in [CHANGELOG.md](CHANGELOG.md).
2. Run `bun run delivery:preview package --execute`.
   CI publishes `vrc-packages-api-preview` through npm OIDC and creates a prerelease page.
3. For release, run `bun run delivery:release package --execute`, then:
   1. Approve the `vrcp-api-release` GitHub environment.
   2. Approve the staged package on npmjs.com with 2FA.
   3. The hourly `sdk-release-reconcile.yml` workflow publishes the draft Release page. You can also start it manually.
4. Run `bun run delivery:check <tag>`.

Hold: release `v0.1.0` and later needs the owner's full `API_ROUTES.md` review. Pre-0.1 releases are allowed.

## 3. Crawler node — `src-crawler` (`crawler`)

1. Make sure the preview SDK and network archive versions exist (§1 order).
2. Run `bun run delivery:preview crawler --execute`.
   CI builds the Linux and Windows binaries and the GHCR image `vrcp-crawler-node-preview`, and attaches them to a prerelease page.
3. For release, approve the `vrcp-crawler-release` environment. The image is `vrcp-crawler-node`.

Both channels use the preview SDK.

## 4. Node client — `src-crawler-client` (`crawler-client`)

1. Run `bun run delivery:preview crawler-client --execute`.
   CI builds unsigned MSI/NSIS installers and attaches them to a prerelease page.
2. For release, approve `vrcp-crawler-client-release` before assets publish.

Both channels use the release SDK. Preview format is `YY.M.Patch-pre`. Release uses SemVer. The MSI preview version drops `-pre`.

## 5. Worker — `src-worker` (`worker`)

1. Run `bun run delivery:preview worker --execute`.
   CI deploys `vrc-package-crawler-preview` with preview D1. Its checked bundle stays in Actions, not GitHub Release assets.
2. Release tags build only. Production deployment is disabled.

## 6. Network archive and web

- `network`: preview only. It is one `YYYY.M.Patch` stream used by crawler and Worker. It has a Release page with a tarball and is not published to npm.
- `web`: delivery is disabled until hosting is selected. Local builds still work.

## 7. Target model and current gaps

| Product | Preview target | Release target | Release page / artifacts |
| --- | --- | --- | --- |
| package | auto-publish | gated (GitHub env + npm 2FA stage) | yes |
| crawler | auto-publish | gated (env) | yes (binaries + GHCR) |
| crawler-client | auto-publish | gated (env) | yes (installers) |
| worker | auto-deploy | none (build only) | no |
| network | auto-publish | none | yes (tarball) |
| web | disabled | disabled | no |

| Gap | Current behavior | Target |
| --- | --- | --- |
| Dirty worktree | Bump stops if the worktree is dirty. Pending-file scope is undecided. | Commit selected pending changes before the version commit. See R58-DIRTY-COMMIT in the canonical ledger. |
| Preview approval switches | Removed. Release switches, reviews and byte checks remain. Local root checks passed 118 tests and 1869 assertions. | Automatic preview publication after successful checks. No preview approval switch. |
| Branches | Root checks reject stale tag/main versions and non-main release start/retry. CI release provenance and reviewed-main finalization remain open. | Any synchronized preview branch. Main-only gated releases after manual promotion. |
| Preview GitHub App | Dispatcher wired and locally checked. Owner will configure installation and credentials. Live branch proof remains open. | Repository-scoped preview allocation. No merge or release-approval bypass. |
| `--execute` | Required; without it the command only plans | Unchanged unless the owner decides otherwise |

---

## Reference

### Version config

| Key | Format | Example next bump |
| --- | --- | --- |
| `release-*` | SemVer patch | `0.0.5` → `0.0.6` |
| `preview-*` (crawler, package, worker) | `YYYY.M.Patch-pre` (UTC month) | `2026.10.5-pre` → `2026.10.6-pre`, or `2026.11.6-pre` in November |
| `preview-crawler-client` | `YY.M.Patch-pre` (patch max 65535) | `26.10.4-pre` → `26.10.5-pre` |
| `preview-network` | `YYYY.M.Patch` (no `-pre`) | `2026.10.3` → `2026.10.4` |

Only the bump reads the calendar. Builds read the saved config.
If both configs have the same version for a product, routing fails. Fix that before tagging.

### Tags and workflows

| Tag prefix | Workflow | Environments (preview / release) |
| --- | --- | --- |
| `vrcp-api/v` | `vrc-packages-api.yml` (filename fixed by npm trusted publisher) | `vrcp-api-preview` / `vrcp-api-release` |
| `vrcp-crawler/v` | `node-docker.yml` | `vrcp-crawler-preview` / `vrcp-crawler-release` |
| `vrcp-crawler-client/v` | `node-client.yml` | `vrcp-crawler-client-preview` / `vrcp-crawler-client-release` |
| `cloudflare-worker/v` | `cloudflare-worker.yml` | `cloudflare-preview` / none |
| `vrcp-network/v` | `network.yml` | `vrcp-network` |
| `web/v` | `web.yml` | disabled |

`release-assets.yml` attaches checked CI outputs to the Release page. It does not rebuild.
`release-announcements.yml` posts to Discord (`DISCORD_RELEASE_WEBHOOK`, `DISCORD_PREVIEW_WEBHOOK`) for package, crawler and crawler-client.

### SDK selection per consumer

| Consumer | SDK |
| --- | --- |
| crawler, worker | `vrc-packages-api-preview` (as alias `vrc-packages-api`) + network archive |
| crawler-client, web | `vrc-packages-api` (release) |

### Secrets and variables

| Location | Name | Purpose |
| --- | --- | --- |
| `cloudflare-preview` env | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `OPERATOR_TOKEN` | Preview Worker deploy and admin key |
| `vrcp-api-release` env | `NPM_TOKEN` | Stage-only npm token for release staging |
| repo variables | `VRCP_SDK_PUBLISH_APPROVED`, `VRCP_CONTAINER_PUBLISH_APPROVED`, `VRCP_CRAWLER_RELEASE_PUBLISH_APPROVED` | Release publish switches (`true` enables). No preview switch. |
| repo variable / secret | `VRCP_PREVIEW_APP_CLIENT_ID` / `VRCP_PREVIEW_APP_PRIVATE_KEY` | Preview-only App dispatcher |

Preview SDK uses OIDC with no npm token. GHCR uses `GITHUB_TOKEN`.
Generate `OPERATOR_TOKEN` locally (64 hex chars) and do not print it:
`node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard`

Worker IDs: production `vrc-package-crawler` / D1 `722bdd0d-92ca-445b-9319-da0b27adf7b2`;
preview `vrc-package-crawler-preview` / D1 `vrcp-preview-d1` `fbef6ce1-4145-45ae-ae91-5d617a1f2672`.

### Preview App setup

1. Register a GitHub App with repository Contents read/write permission.
2. Install it only on `SlamTheDragon/vrc-packages`.
3. Save its Client ID as repository variable `VRCP_PREVIEW_APP_CLIENT_ID`.
4. Save its private key as repository secret `VRCP_PREVIEW_APP_PRIVATE_KEY`.
5. Keep the key outside source, chat, logs and artifacts.
6. Do not grant a main-rule bypass or permission to approve releases or merge PRs.
7. After App setup and source/protection checks, start `preview-delivery.yml` on a synchronized branch.
8. Check the allocated tag, CI result, published bytes and deployment link.

The [official App-token action](https://github.com/actions/create-github-app-token) documents these credentials and current-repository token scope.
This dispatcher uses the App token for tag pushes because the default Actions token suppresses new push workflows.
See [GitHub token behavior](https://docs.github.com/en/actions/concepts/security/github_token).
Keep the App out of release allocation. Contents-write permission does not restrict it to a preview tag prefix.
CI release provenance must enforce that boundary too. Missing App credentials fail before allocation.

### Local development

```sh
bun run setup                          # root tools only
bun run prepare:dev preview <product>  # checked SDK/network deps
bun run build:dev preview <product>    # dev output in the product folder
bun run clean <product> [--apply]      # remove generated outputs (plan first)
bun run reset <product> [--apply]      # remove node_modules (plan first)
```

Tools: Bun 1.4.2 for installs, scripts and builds. Node and npm for registry, packing and publishing. Rust and Tauri for the desktop app.
Local Worker: `bun run dev` in `src-worker`, with `OPERATOR_TOKEN` in an ignored `.dev.vars.preview`.

- Fetch origin main before delivery if its current config object is missing locally. The plan does not fetch or change saved versions.
- Refresh checked dependencies after producer publication. Root setup alone does not install every product.
- Stop processes before cleanup. Inspect every planned path before --apply. Applied deletion has no recovery copy.
- Clean preserves Worker local D1. Reset removes selected node_modules only. Reset all includes root and nested network dependencies.
- Run setup after root reset, then prepare the selected product again. Shared Bun caches and published identities are not cleanup targets.

### Safety properties kept by CI

- Builds use published SDK/network versions only, never sibling source.
- Each artifact has a SHA-256 receipt. Release pages, npm and GHCR publication check bytes against it.
- Published versions, tags and images are never replaced.
- Worker bundles and container archives stay CI-only (`ci-only-*`).
- SDK, crawler and Worker queues preserve pending runs, with separate preview and release groups.
- Attachment retries also preserve pending runs. GitHub queues at most 100 per group, not an unlimited backlog.
