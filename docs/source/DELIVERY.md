# Delivery

One rule: **the root `package.json` starts every delivery.** Product folders forward their
`delivery:*` scripts to the root. Version numbers come only from
`config.versions.json` (release) and `config.preview.versions.json` (preview).
Do not edit those files by hand. The bump command changes them.

> Owner target model (2026-10-06). R58 clarifies R57-C57A/B. Open checks are in [§7](#7-target-model-and-current-gaps).
> - **Preview:** bump patch → commit and push → tag → CI builds → publishes with no approval guard → GitHub prerelease page with artifacts.
> - **Release:** prepare a version PR → owner inspects and merges → tag the exact merged commit → gated CI publication.
> - Preview works from any synchronized branch. Release requires main after a manually reviewed promotion PR.
> - Keep responsibility branches and separate evergreen tracking PRs. Never merge the tracking PR as a release promotion.

---

## 1. Deliver a product (all products)

From the repository root:

```sh
bun run delivery:preview <product>             # plan only: shows next version, tag, blockers
bun run delivery:preview <product> --execute   # pending checkpoint, bump, commit, tag, push → CI
bun run delivery:status <tag>                  # read the tagged CI run
bun run delivery:check <tag>                   # check published bytes, receipts, registry
```

From a product folder, `bun run delivery:preview --execute` does the same thing.

Preview execution prints and commits all nonignored pending files, then pushes that checkpoint before the version commit.
It rejects stale versions before staging. It rejects pending indexed files that match ignore rules, including force-added files.
Ignore rules are not a secret scanner. Check the printed paths and maintain the ignore rules before delivery.
If that checkpoint push fails, use its displayed same-branch recovery command. The local commit remains and no bump runs.
Release execution never commits pending files. It requires clean main.

For release, first promote product changes to main through a manually reviewed PR. Then:

1. Start from clean main that matches origin.
2. Run `bun run delivery:release <product> --execute`.
3. Open the returned version-PR link. The command pushes only its metadata branch, not main or a tag.
4. Inspect and manually merge that PR. An owner-reviewed merge needs no second reviewer.
5. Return to main and synchronize it with origin.
6. Run `bun run delivery:finalize <product> <merged-pr-number> <merged-main-commit>` to check the plan.
7. Add `--execute` to push only the tag at that exact merged commit.
8. Complete the product's release approvals below.

The finalizer reproduces metadata with the same bump and sync functions. It does not bump another patch or merge a PR.
Its API checks establish owner merge identity, not proof of human inspection. Do not bypass main protection.
Local delivery checks passed 151 tests and 2271 assertions. Hosted App authentication and main-branch preview delivery passed.
Non-main delivery, reviewed release promotion and external protection checks remain open.
If a deleted preparation branch leaves its commit unavailable locally, fetch `refs/pull/<PR>/head` before finalization.
Never substitute the PR test-merge SHA.

If the push fails, run `bun run delivery:retry <tag>`. This retries the same tag. It does not bump again.
For a failed preparation push, use `bun run delivery:retry-preparation <returned-branch>` on its clean local branch.
If CI fails, rerun the CI job. Do not bump a new version only to retry CI.
The allocator requires publication and artifact proof for the current configured version before it writes the next version.
Finalization repeats this check for the predecessor, including metadata branches prepared before this guard.
Use `bun --env-file=.env run delivery:diagnose <tag>` for read-only run status and troubleshooting pointers.
Use `bun --env-file=.env run delivery:check <tag>` for full artifact and publication proof.
Use `bun --env-file=.env run delivery:diagnose:all` for all nine configured channel statuses.
Use `bun --env-file=.env run delivery:check:all` for all nine publication/artifact proofs. It fails if any proof is unavailable.
Both commands are read-only. Network has one channel, website is excluded, and Worker keeps its no-Release boundary.
Preview checkpoints reject pending edits to either authoritative version config before staging. Use the root allocator, not direct config edits.
This guard does not prevent local file editing or replace protected CI transition checks.
The existing `delivery:retry` retries Git delivery only. All CI reruns remain manual by owner decision.
Broken tagged workflows require manual resolution. Never move their tags or allocate another patch to hide a failed delivery.
Do not move, delete or force-push a published tag.

For remote preview allocation, start `preview-delivery.yml` with a synchronized branch and product.
The preview App calls the same root executor. It does not allocate versions on every ordinary push.
Configure the App first with [these steps](#preview-app-setup).
In GitHub, select the product from the dropdown. For a no-write check, tick this checkbox:
**“Check App access and the synchronized branch preview plan without allocating a version.”**
That checkbox sets `diagnose-only`. Without it, the workflow allocates a version and starts delivery.
Diagnostic run [37406552782](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37406552782) passed with both mutation steps skipped.
Earlier run 37406357833 allocated Worker preview `2026.10.7-pre`. It was not a no-write diagnostic.
Its [tagged delivery](https://github.com/SlamTheDragon/vrc-packages/actions/runs/37406393578) passed original bundle and receipt checks.
The deployment used preview D1 `fbef6ce1-4145-45ae-ae91-5d617a1f2672`. These results do not prove non-main or release promotion.
The catalog runtime check returned 500 because `canonical_packages` is missing.
Initialize the preview schema with `autoSeed: false` through the protected operator route before catalog testing.
Do not initialize production or grant source access as part of this delivery check.
Do not rerun the allocator: it refuses repeated attempts before requesting an App token.
Inspect its original tag first. Retry that tag's delivery, not another patch allocation.

**Order:** publish producers before consumers. That is the SDK (`package`), then `network` if SDK peer bounds changed,
then `crawler` / `worker` / `crawler-client`. Do not push all tags at once.

## 2. npm SDK — `src-package` (`package`)

1. Update the `package` section in [CHANGELOG.md](CHANGELOG.md).
2. Run `bun run delivery:preview package --execute`.
   CI publishes `vrc-packages-api-preview` through npm OIDC and creates a prerelease page.
3. For release, complete the version PR and finalization steps in §1, then:
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

For first-time preview schema setup:

1. In Settings → Environments → `cloudflare-preview`, retain the existing Worker Tag rule.
2. Add a **Branch** rule for `main` so the manual initializer can access its existing `OPERATOR_TOKEN` secret.
3. Open Actions → **Initialize preview Worker schema without seeding**.
4. Select `main`, then run the workflow. It uses the published preview SDK and explicitly disables seeding.
5. Check that initialization and the catalog read pass. A failure does not prove that no schema statements ran.

The root command is `bun run worker:preview:init`. It plans without credentials or network calls.
Its `--execute` mode requires the dedicated main-ref manual workflow and preview environment scope.
The product command `bun run preview:init` forwards to root.
This operation neither bumps a version nor builds, deploys, seeds jobs or grants source access.
It does not reset data or migrate an existing schema. Keep main and workflow protections active.

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
| Dirty worktree | All nonignored preview changes use a separate checkpoint. Release requires clean main. Local checks passed. | Keep ignored-file, stale-branch and partial-push guards. See R58-DIRTY-COMMIT. |
| Preview approval switches | Removed. Release switches, reviews and byte checks remain. Local root checks passed 118 tests and 1869 assertions. | Automatic preview publication after successful checks. No preview approval switch. |
| Branches | Metadata PR preparation, tag-only finalization and CI source fixtures passed locally. Hosted transition remains open. | Any synchronized preview branch. Main-only gated releases after owner-reviewed promotion. |
| Preview GitHub App | Hosted diagnostic 37406552782 passed without allocation. Worker preview 2026.10.7-pre passed App allocation, tag CI and original byte checks on main. | Check a synchronized non-main branch and reviewed release promotion. No merge or release-approval bypass. |
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
| `web/v` | no workflow; website delivery deferred | disabled |

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
7. Start `preview-delivery.yml` on a synchronized branch with `diagnose-only` selected. Check its no-write result.
8. After source/protection checks, start normal allocation. Check the tag, CI result, published bytes and deployment link.

The [official App-token action](https://github.com/actions/create-github-app-token) documents these credentials and current-repository token scope.
This dispatcher uses the App token for tag pushes because the default Actions token suppresses new push workflows.
See [GitHub token behavior](https://docs.github.com/en/actions/concepts/security/github_token).
Keep the App out of release allocation. Contents-write permission does not restrict it to a preview tag prefix.
CI release provenance must enforce that boundary too. Missing App credentials fail before allocation.

### Release source trust

Repository rulesets (Settings → Rules → Rulesets):

- Main: require a PR, block deletion and force pushes, and retain zero required approvals for owner-reviewed manual merges.
- Never grant the preview App a main bypass. Agents push task branches and wait for owner promotion.
- Tag ruleset `Immutable delivery tags`: target all tags. Enable Restrict updates and Restrict deletions, with no bypass actors.
- Keep Restrict creations disabled in that ruleset so new preview tags remain possible.
- Separate tag ruleset `Stable release creation`: include `vrcp-api/v*`, `vrcp-crawler/v*`, `vrcp-crawler-client/v*` and `cloudflare-worker/v*`.
- Exclude the corresponding `v*-pre*` patterns for all four prefixes. Network has only a preview stream and stays outside this creation rule.
- Enable only Restrict creations. Allow the release-authorized repository admin to bypass this creation rule, but never the preview App.
- The immutable rule still blocks updates/deletion because its bypass list is empty. Check overlapping rules before saving.

Main ruleset `main-guard` (24553134) was checked active on 2026-10-06, with no bypass actors.
Tag protections remain owner setup work. These instructions do not prove that those settings exist.
GitHub documents [rule controls](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
and [tag-pattern matching](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).

- New releases bind the annotated tag to one owner-merged metadata PR and its exact merged main commit.
- Tag routing, builds, publication and artifact recovery check that proof. They use the original Actions actor, not the rerun actor.
- `.github/release-baseline.json` preserves only exact historical repository/tag/object/commit pairs. It grants no broad version or ancestry exception.
- Repository protections must restrict main, release tags and workflow changes. A tag-selected checker cannot police an older workflow that omits it.
- The preview App must not bypass those protections. Main protection remains a delivery sign-off requirement.
- Preview D1 initialization, catalog reads and live source-policy checks belong to later runtime/ingestion gates, not delivery sign-off.
- The owner creates responsibility branches and checks a fresh clone after delivery sign-off. That check is not a prerequisite.

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
- Supply `GH_TOKEN` or `GITHUB_TOKEN` explicitly when authenticated metadata or Actions archive reads need it.
- If the credential is in the ignored root `.env`, use `bun --env-file=.env run <root-command> ...` so Node scripts receive it.
- Use repository Contents, Actions and pull-request read scope for those checks. Never print or commit the token.
- Scripts do not extract Git's stored credentials. Public reads can fail because of authentication or rate limits.
- If the reader reports a rate limit, retry the same finalization after its reset time. Do not allocate another version.
- An explicit `GH_TOKEN` or `GITHUB_TOKEN` can authorize metadata reads. Keep its value outside commits and logs.
- Rate-limit handling does not waive PR proof, main protection, tag immutability or release approvals.
- Tagged checkouts select `${{ github.ref }}` explicitly with full history. This preserves annotated tag objects for provenance checks.
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
