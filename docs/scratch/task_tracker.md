# Active checkpoint — R57-C57A/B delivery transition

## Owner handover — start here (2026-10-06)

Owner resumed job execution after this handover. SDK release finalization plan passed on synchronized main.
Execution pushed `vrcp-api/v0.0.6` at PR #13's exact merged commit `2b3c4175f29247721d17f06ef5df917c521f1da6`.
Tag object: `c4375001a753b6f9f2ab2f05d5baa3674b1580d0`. Hosted run `37492006796` passed its build and awaits `vrcp-api-release` approval.
The exact-run approval attempt returned HTTP 403: `Resource not accessible by personal access token`. No protection setting changed.
The GitHub gate subsequently cleared externally. Publication job `112367290717` passed staging-byte checks. Release attachment also passed.
Owner action: approve `vrc-packages-api@0.0.6` in npm Staged Packages, stage `fb038069-2792-45c9-9698-a787692b7cb2`.
CI reports `awaiting-npm-approval`. Do not treat successful staging as public npm publication or completed advancement proof.
Latest readback: all applicable jobs in run `37492006796` completed successfully. Root status reports `publication-not-proved`.
Public npm metadata for `vrc-packages-api/0.0.6` returns HTTP 404. Owner is waiting for npm checks before stage approval.
Fresh root `delivery:check:all` completed: eight configured paths passed full artifact proof. SDK release `0.0.6` alone reports `proof-unavailable`.
The command correctly returned exit 1. Both Worker paths passed their special no-Release proof. No local release artifacts were written.
These checks renew baseline evidence. They do not complete the outstanding next-patch trials, deployment-link review or main sign-off.
Next: inspect that same run, complete its protected publication gate and owner npm stage approval, then check public artifact proof.
Do not repeat finalization or allocate another SDK release. Network advancement still waits for this producer proof.

Main delivery sign-off remains open. No new publication or allocation ran during this handover.
The sections below this handover retain earlier evidence. Their older next steps are not current instructions.

### Current checkout and approvals

- Main is at `2b3c4175f29247721d17f06ef5df917c521f1da6`, the owner-merged SDK release PR #13.
- PR #13 changes only the release config, SDK manifest and network manifest. SDK release now declares `0.0.6`.
- Untracked `docs/changelogs/` files belong to the owner. They were not staged, read or removed for this checkpoint.
- Preview execution commits all nonignored pending files. Inspect that list before execution, especially the new changelog files.
- Preview can run on synchronized main or another synchronized branch. Release allocation and finalization remain main-only.
- Release metadata still needs owner inspection and manual merge. Standing trial approval does not authorize an agent to merge PRs.
- CI reruns remain manual. Keep tag immutability, protected release environments and owner-approved npm release staging.

### Nine-path evidence and remaining advancement

These are recorded runtime proofs, not nine new checks during this handover. A recovery is half-pass until its next patch passes.

| Path | Configured version | Last checked runtime evidence | Next required trial |
| --- | --- | --- | --- |
| API preview | `2026.10.7-pre` | Run `37468577502`: new patch passed after manual failed-job retry. Full root artifact proof passed. | Advancement checked. Retain the readback failure and retry evidence. |
| API release | `0.0.6` | Public predecessor `0.0.5` checked. Owner merged preparation PR #13. | Finalize merged `0.0.6`, complete npm staging approval, then check public bytes and Release. |
| Network, single stream | `2026.10.4` | Recovery `37460124422` passed. Four public hashes and archive consumer resolution checked. | Allocate `2026.10.5` after both SDK channels pass. |
| Crawler preview | `2026.10.6-pre` | Tagged run `37410193664` passed, including binaries, image and attachment. | Allocate `2026.10.7-pre` after the new network archive passes. |
| Crawler release | `0.0.7` | Recovery `37466559953` passed. Six asset hashes, GHCR, deployment link and Discord checked. | Prepare and owner-merge `0.0.8`, then finalize and check the complete chain. |
| Crawler Client preview | `26.10.5-pre` | Recovery `37460312551` passed. Five asset hashes and Discord checked. | Allocate `26.10.6-pre` after release SDK `0.0.6` passes. |
| Crawler Client release | `0.0.4` | Run `37357012826` and protected attachment replay `37454682979` passed. | Prepare and owner-merge `0.0.5`, then finalize and check the complete chain. |
| Worker preview | `2026.10.7-pre` | Run `37406393578` passed deployment and bundle proof with preview-only D1. | Allocate `2026.10.8-pre` after the new network archive passes. |
| Worker release build | `0.0.5` | Run `37357069065` passed build-only checks. Production deployment skipped. | Prepare and owner-merge `0.0.6`, then finalize and check build-only proof. |

Website delivery stays disabled. Worker environments get no GitHub Release or downloadable Release assets.
Crawler and Worker consume preview SDK plus the distributed network archive. Desktop and Web consume release SDK.
Targets assume the current UTC month remains October 2026. The root allocator determines the actual calendar version.

### Execute the remaining jobs

Use the repository root. Bun loads the ignored root credential file with `--env-file=.env`.
Do not print credentials or paste them into a command, log, fixture or issue.

1. Inspect `git status --short` and PR #13. Do not prepare API release `0.0.6` a second time.
2. Check the existing release-finalization plan:

   ```sh
   bun --env-file=.env run delivery:finalize package 13 2b3c4175f29247721d17f06ef5df917c521f1da6
   ```

3. Resolve any reported blocker without editing the version configs. Finalization requires a clean checkout that matches origin/main.
4. If the plan passes, repeat that exact command with `--execute`. It pushes the tag, not another version.
5. Follow the returned CI link. Complete the protected GitHub approval and approve the exact npm stage when requested.
6. Check `vrcp-api/v0.0.6` with the command below. A draft Release can await the existing SDK reconciliation workflow.
7. After SDK release proof passes, plan and execute the network preview delivery:

   ```sh
   bun --env-file=.env run delivery:check vrcp-api/v0.0.6
   bun --env-file=.env run delivery:preview network
   bun --env-file=.env run delivery:preview network --execute
   ```

8. Check the resulting network tag before dependent builds. Do not assume a successful tag push proves publication.
9. Allocate consumer previews with `delivery:preview crawler`, `crawler-client` and `worker`. Inspect each plan before adding `--execute`.
10. Prepare consumer releases with `delivery:release crawler`, `crawler-client` and `worker`, then add `--execute` after each plan passes.
11. Inspect and manually merge each returned metadata PR. Synchronize main before its matching finalization.
12. Finalize each release with `delivery:finalize <product> <PR-number> <exact-merged-main-SHA>`, then add `--execute` after its plan passes.
13. Run `delivery:check <returned-tag>` for every chain. Check image identities, artifacts, dependency versions, deployment URLs and applicable Discord acknowledgements.
14. Run the all-path commands below. Record failures, not just successful paths.

   ```sh
   bun --env-file=.env run delivery:diagnose:all
   bun --env-file=.env run delivery:check:all
   bun --env-file=.env run cache:check
   bun run clean all
   bun run reset all
   ```

The last two commands are dry-run plans without execution flags. Do not add deletion flags during delivery proof.
Allocate sequentially in this checkout. Hosted builds can run in parallel after their required producer proofs pass.
Do not run standalone version-sync commands as a substitute for root delivery. They can leave an incomplete metadata transition.
If a preparation head is missing locally, fetch `refs/pull/<PR-number>/head`. Never finalize a PR test-merge SHA.

### Blockers and failure procedures

- Owner approved `docs/changelogs/` and instructed agents to leave it untouched. Do not move, remove or rewrite its contents.
- The checker now allows the owner-approved `changelogs` folder. Its contents remain untouched and subject to ordinary Markdown link checks.
- The documentation gate passed all 374 document link/layout checks and whitespace checks. No other layout rule changed.
- Handover prose lint: 1.13 issues per 100 words. Whitespace checks passed. No product checks ran for this documentation checkpoint.
- SDK `0.0.6` finalization and hosted publication remain pending. A handover diagnostic failed at Git rev-parse before remote proof.
- That diagnostic failure does not prove a publication failure. The tag is not yet locally resolved. Use the finalization plan first.
- The GitHub connector previously refused PR creation with HTTP 403. Open the root executor's comparison link manually if necessary.
- An exact protected-deployment approval request returned HTTP 403. Read/write Actions access does not imply Deployments: write access.
- The owner subsequently approved the crawler gate externally. Check the next gate rather than assuming the local PAT permission changed.
- `delivery:retry <tag>` retries Git delivery only. It does not rerun CI or allocate another version.
- For a CI failure, inspect the failed step and existing outputs first. A manual failed-job rerun must retain the same source and version.
- Stop on different bytes, unknown partial publication, auth, provenance or broken tagged tooling. Do not bump past the failed version.
- `delivery:recover` accepts only exact reviewed identities in `.github/delivery-recoveries.json`. Do not invent a recovery recipe during a retry.
- Never move a published tag, replace published bytes, disable immutability or add a retry suffix to bypass the advancement guard.
- Independent CI config-transition enforcement remains open under critical `R58-CONFIG-TAMPER`. Local allocator guards are not tamper-proof security.
- Non-main preview execution remains a separate runtime proof. Do not claim every-branch delivery solely from a successful main run.
- Preserve provenance and reconciliation inputs during cleanup. Remote workflow-run deletion still needs exact safe targets.
- Final sign-off still needs the nine-path advancement matrix, root entry-point checks and reviewed delivery documentation.
- The owner's fresh clone follows sign-off. Preview D1 initialization and product runtime defects are outside this delivery gate.
- Delete temporary agent branches only after sign-off. Keep responsibility branches and their evergreen tracking PRs.

### Latest retry and retention evidence

- SDK preview `2026.10.7-pre` initially published, but its bounded registry-readback window failed. No automatic publication retry ran.
- Before a manual retry, the public tarball matched the original CI archive: 22633 bytes, SHA-256 `bf9ee3e29aa1c7f53129e29e87ed659025093e5ea43b2b2203e3f7aa116e1d97`.
- Manual rerun of failed job `112286091548` returned HTTP 201. This was not `delivery:recover` or an automatic CI rerun.
- The retry checked the existing package. It changed no source, version, tag or published bytes. Root full proof then passed.
- Deployment `6884970200` succeeded. Discord check `112289622295` acknowledged message `1557019077367832631`.
- Crawler recovery `37466559953` retained tag object `d9788177f481e7317c250e790dd5204ba67c95f0` and source `2e1c6011d1d21c7e7bb3b2a24de9d99575f88030`.
- GHCR `0.0.7` and `latest` matched manifest `sha256:738d07f45716f8a986b2abccfe641eb4dcd4b17ad83b7d4ce0c1726e4380b814`.
- Its historical SDK `2026.10.5-pre` and network `2026.10.3` labels are intentional recovery inputs, not current consumer targets.
- Cache readback measured 2262603737 bytes across 86 caches. Account capacity remains unmeasured. GitHub manages eviction.
- Cleanup and reset dry runs passed. No database, credential, dependency, build output or cache was deleted.
- Sanitized security intake is already in the ledgers. Intake completion does not mean security remediation passed.
- No claim guarantees every future build or publication will pass without failures. Manual diagnosis and immutable evidence remain required.

## Active gate — same-version recovery, then patch-advance proof (2026-10-06)

- Main permits normal source and preview pushes. Release metadata review, operator approvals and immutable tags remain required.
- API readback confirmed main-guard 24553134, immutable-delivery-tags 24553469 and stable-release 24553551 active with the documented controls.
- The advancement guard remains. Recover failed configured versions before another patch. Recovery counts as half a pass.
- Exact recovery identities remain in .github/delivery-recoveries.json. No published bytes or tag objects changed.
- Tooling through 11b340a passed the grouped gate: 81 tests / 1458 assertions. Hosted checks exposed and resolved stale fixtures.
- Network recovery 37460124422 passed. Root proof checked four public hashes. The consumer resolver checked the 26087-byte archive and source receipt.
- Desktop preview recovery 37460312551 passed. Root proof checked five public hashes. Its terminal Discord check acknowledged delivery.
- Repair 8fea87c checks GitHub's commit-level Discord sidecar separately from workflow jobs. Publication and zero-artifact guards remain strict.
- Repair f7044db reads binary proofs in exact 8 MB ranges. It checks every byte against the complete size and SHA-256 digest.
- Live finalization checked all six crawler 0.0.6 assets, including the complete 82707936-byte Linux and 87481344-byte Windows binaries.
- Root finalization pushed crawler 0.0.7 at owner-merged source 2e1c6011d1d21c7e7bb3b2a24de9d99575f88030 from PR #8.
- Tag object: d9788177f481e7317c250e790dd5204ba67c95f0. Actual CI run 37465066520 failed dependency preparation on Linux and Windows.
- Live evidence shows successful routing, skipped container publication/attachment and zero artifacts. Linux passed 158 root tests before preparation failed.
- Cause: the tagged SDK config selects 2026.10.5-pre, but registry latest selects 2026.10.6-pre. The config guard correctly refused it.
- Working theory: authorize that exact preparation-only failure for manual recovery. Existing recovery tooling pins the tagged SDK version.
- The new recipe checks both failed preparation steps and skipped later steps. It retains original source, version, tag and release approvals.
- Independent review tightened cleanup names, ordered step numbers and preparation-only retry checks. The final review found no remaining blocker.
- Final recovery/attachment/announcement checks passed 37 tests / 500 assertions. The earlier long run mixed superseded code with newer fixtures.
- Its 31 unchanged chain cases passed, but its mixed-state recovery failure is not a clean gate result. The final-source recovery rerun passed.
- All 374 document-link checks, syntax and whitespace checks passed. DELIVERY prose score: 1.47 issues per 100 words.
- Checked tooling c6f317f reached main by normal push. The actual root plan passed, then --execute dispatched recovery 37466559953.
- Recovery 37466559953 passed routing, Linux binary/container checks, Windows binary checks, protected publication and attachment.
- Owner granted standing release approvals for these production distribution trials. This does not remove protection rules or authorize automatic CI retries.
- The exact-run approval attempt returned HTTP 403 despite current_user_can_approve=true. GitHub requires repository Deployments: write for review requests.
- The gate subsequently passed externally. Root full proof checked all six public asset hashes and the exact recovery/source/tag identity.
- Linux SHA-256: 78a8318d159ce0a6f03c8d3e750a5429d183cbb4806fa847fd44d1bd2f565abc. Windows: 18a94c43e72141be01269ae8945bc18968900a541f2cbba75fba4b04e8901154.
- Public GHCR 0.0.7 and latest share manifest sha256:738d07f45716f8a986b2abccfe641eb4dcd4b17ad83b7d4ce0c1726e4380b814 and the exact tagged source/SDK/network labels.
- Deployment 6884524554 passed and links to the exact 0.0.7 Release. Discord check 112282424812 acknowledged message 1557014968916779119.
- Tag status retains the original failure until a recovered Release exists. The root recovery command shows the separate attempt and run link.
- Live cache monitoring returned 2262603737 bytes across 86 caches. Account capacity remains unmeasured and eviction remains GitHub-managed.
- Root clean all and reset all produced safe dry-run target plans. No build output, dependency, database, credential or cache was deleted.
- Same-version recoveries are checked. Working theory: exercise root SDK allocation first, then network and consumers after producer publication proof.
- SDK preview plan selects 2026.10.7-pre from configured 2026.10.6-pre without blockers. SDK release will select 0.0.6 with owner metadata review retained.
- Next: execute SDK preview through the root pending-checkpoint/version/tag chain, then prepare the reviewed SDK release. Network peer bounds change with SDK metadata.
- Each of the nine enabled paths needs next-patch chain proof, applicable bytes, dependency identities, deployment links and terminal notifications.
- Check GHCR independently for crawler delivery. Worker release is build-only without production deployment or Release assets. Website remains disabled.
- Non-main preview execution remains a separate runtime proof. D1 initialization and the owner's fresh clone remain outside delivery sign-off.

## Superseded checkpoint — temporary main preview branch

- The owner superseded this temporary branch policy. The following lines describe the earlier exercise, not the current procedure.
- Working theory: check the configured predecessor's remote publication and artifacts before creating a preview branch or changing version metadata.
- A main invocation will checkpoint pending source on that branch, allocate one patch and push its tag. No direct main push occurs.
- Source/config promotion back to main remains owner-reviewed. A stale main config must stop at remote tag checks, not allocate a skipped patch.
- Recovery 37454376963 passed route, Linux, Windows, container publication and attachment. Full root proof verified all six public artifact hashes.
- SDK preview attachment 37454683571 and desktop preview attachment 37454682893 passed. Protected desktop release attachment 37454682979 also passed.
- All-nine readback passed eight configured channels. Prepared crawler 0.0.7 still has no tag. Its old dependency snapshot needs review before publication.
- Next: implement the allocator boundary, then publish the compatible network producer before parallel node/Worker/desktop preview builds.
- The requested final chat matrix will distinguish live full-chain proof, attachment replay, build-only Worker release and disabled website paths.

## Active gate — immutable-source crawler recovery (2026-10-06)

- Owner approved the recovery attempt and real execution when ready. This supersedes the earlier refusal of reviewed recovery tooling.
- Scope: crawler `0.0.6`, original run `37413527166`, fixed source `995db61` and tag object `41039d1f0020a95eda00cd898654d35c093bde25`.
- Working theory: root manual dispatch can reuse the crawler chain on reviewed main while the product checkout stays at its original tag.
- Local gate passed 130 tests / 1986 assertions across seven grouped suites. Hosted recovery remains unverified.
- Root `delivery:recover` plans by default. Execution requires clean synchronized main and explicit Actions write access.
- The existing crawler workflow retains operator review, Linux/Windows checks, container publication, Release assets and terminal announcement.
- Saved dependency versions and product/config files remain tied to the tag. Receipts distinguish source and repair-tooling commits.
- Release titles and changelog headings take the delivered package manifest name. The grouped attachment checks passed.
- All 374 document link/layout checks and whitespace checks passed. DELIVERY prose score: 1.47 issues per 100 words.
- Owner merged PR #10. Clean main synchronized to 0e1eaf9d43cccbe2ec6e8e11d3686539d20c3268 before recovery.
- Environment readback passed: vrcp-crawler-release allows Branch main and its existing tag rule, with one required reviewer. Preview has no reviewer gate.
- Explicit local PAT reads and Actions dispatch passed. No credential value entered output or source.
- Root recovery plan passed. Approved execution dispatched run 37452937062: https://github.com/SlamTheDragon/vrc-packages/actions/runs/37452937062 .
- Recovery run failed on both runners before product builds. Routing passed. Container publication and Release attachment were skipped.
- Observed cause: archive extraction retained the old tracked web.yml, although reviewed main deleted it. Two workflow-layout assertions failed.
- Working theory: Git restore with no overlay can synchronize only delivery-owned paths, including deletions, while retaining tagged product/config files.
- Next: repair tooling synchronization and add an explicit manual same-version retry that refuses active runs or existing outputs. Promote before hosted execution.
- Owner reconfirmed real publication/deployment authority. Local tests cannot replace hosted chain proof. Existing operator protection remains intact.
- Actual Git synchronization on a disposable checkout removed obsolete web.yml and retained the exact original product/config files and source HEAD.
- Live API readback found zero artifacts and skipped publication/attachment jobs. The root retry checker rejected unchanged tooling as intended.
- Repair adds explicit --retry planning/execution for completed failed, output-free attempts with different reviewed tooling. It never retries automatically.
- Syntax, all 374 document links/layouts and whitespace checks passed. DELIVERY prose score: 1.44 issues per 100 words.
- Regression assertions were updated, but no local unit-test result is claimed for this repair. Hosted publication remains the delivery exit.
- Owner promotion PR #11 is open: https://github.com/SlamTheDragon/vrc-packages/pull/11 . Retain one test branch; do not merge for the owner.
- No version bump, tag replacement or operator approval ran. Tests alone do not pass this gate.
- Real local planning exposed an ESM entry-point cycle. The CLI fix now reaches remote source proof and reports the missing main promotion explicitly.
- The first grouped run found stale workflow/SDK assertions and an in-flight test/module mismatch. The corrected full rerun passed.
- Diagnosis now selects manual actions from observed failure phases. Only the reviewed, unpublished route-failure recipe can rebuild.
- Recovery setup: retain required operator review and add a Branch main rule to vrcp-crawler-release. The local credential needs Actions write.
- No guarantee covers every future failure. Unknown states, changed provenance, truncated evidence and partial publication require manual inspection.
- Checked commits through 18c752d were pushed to codex/delivery-proof. The GitHub connector refused PR creation with HTTP 403.
- Owner promotion link: https://github.com/SlamTheDragon/vrc-packages/compare/main...codex%2Fdelivery-proof?expand=1 . No credential expansion or main bypass ran.

## Current exercise — root commands and nine chains (2026-10-06)

- Owner requires real command and chain exercises before delivery sign-off. Historical green runs do not satisfy this exit alone.
- Main-only releases retain operator approvals. Synchronized branches can publish previews without approval guards. CI reruns remain manual.
- Owner merged PR #9 into main at `4e2ea92`. The checkout fast-forwarded before this exercise.
- All seven old agent branches were ancestors of merged main. Exact-OID remote deletions and local merged-branch deletions passed.
- Local and remote now contain only `main` and `codex/delivery-proof`. No tag or main history changed during cleanup.
- Root preview planning passed. Release planning on the test branch reported its main-only blocker. Website delivery rejected the disabled path.
- The crawler product-folder preview command forwarded to the root and returned the same branch/config plan.
- Root SDK preview execution checked the predecessor and pushed `2026.10.6-pre`. Commit: `979939bcbad09f6f5c7d9902777b3f3d55f098dd`. Tag object: `279a78d7b67a8eb3437fc448f48cd64d02aef78d`.
- Tagged run `37447577498` passed build, publication and Release attachment. Root `delivery:check` returned `release-artifacts-verified` and checked npm integrity against CI bytes. Terminal Discord acknowledgement remains unchecked.
- SDK product-scoped version check passed. The global preview check rejected mixed release/preview manifests. Do not synchronize all products to one channel to hide that result.
- All four product preview forwarders returned root plans. Cleanup/reset commands returned dry-run paths and removed nothing.
- Main declares crawler `0.0.7`, but its tag is absent. Failed `0.0.6` still blocks predecessor proof and finalization.
- Owner wants local troubleshooting scripts that preserve remote operator approvals. The latest recovery approval permits reviewed main tooling for the fixed failed tag.
- Working theory: one test branch can serve preview exercises. Release preparation still creates a separate branch and verifies its exact name.
- Next: finish SDK byte/link proof, exercise remaining product entry points, then repair the one-branch release contract and resolve crawler recovery manually.
- Keep D1 initialization and the owner's later fresh-clone check outside delivery sign-off. The full pre-production goal remains open.

## Active gate — publication-proof advancement (2026-10-06)

- Owner requires proof before another version advance, same-version publication retry, and root troubleshooting hooks.
- Owner reserves broken tagged workflow recovery for manual resolution. Explicit approved recovery can use reviewed main tooling. Never move tags.
- Registry readback: release versions are 0.0.0-stage, 0.0.0, 0.0.1, 0.0.3, 0.0.5. Preview patches are 0, 1, 3, 5. Historical gaps remain unchanged.
- Working theory: root allocation and release finalization must check the configured predecessor with the existing strict publication/artifact verifier before writes.
- Pending crawler 0.0.7 metadata does not authorize skipping failed 0.0.6. Its tag remains absent pending manual resolution and proof.
- Local proof/diagnostic/config-checkpoint gate passed 102 tests / 1638 assertions across the four related suites. The first run hit a default fixture timeout; the corrected full rerun passed with zero failures. All 374 document links/layout checks, syntax and whitespace checks passed.
- Root diagnosis and full proof commands read all nine configured channels. Hosted full checks passed eight: SDK preview/release, network, crawler preview, client preview/release, Worker preview and Worker release build-only. Crawler release 0.0.6 correctly failed the aggregate gate. No CI rerun or publication ran.
- Preview App allocation now requests read-only Actions metadata/archive access through its normal GitHub token. Its App remains contents-write only. The final targeted wiring check passed 1 test / 24 assertions. Procedure and lifecycle rules match manual-only CI reruns.
- Approval-service usage exhaustion rejected one command before execution. Normal review later became available and the command passed without a bypass. Local commits 8792e91 and 7dbe69f plus this checked wiring/evidence checkpoint are ready for owner promotion from codex/publication-proof-advancement. DELIVERY prose score: 1.49. Agent procedure score: 0.95.
- Owner decision: all CI reruns remain manual for now. Do not add automatic Actions POST requests. Keep stage/release approvals and immutable artifacts unchanged.

## Active repair — annotated release checkout (2026-10-06)

- The owner's ignored root `.env` supplies a read credential. Explicit `bun --env-file=.env run` passed authenticated PR reads and finalization.
- Finalization from clean main pushed crawler `0.0.6` at owner-merged PR #5 commit `995db61`; tag object `41039d1f0020a95eda00cd898654d35c093bde25` remains fixed.
- Run `37413527166` failed route before builds/publication. Checkout fetched the annotated tag, then replaced its local ref with the peeled commit. Strict proof rejected it.
- Working theory: explicit checkout ref suppresses the action's default commit/ref fallback. All release-capable callers and reusable attachments need this selection; proof checks remain unchanged.
- Repair commit `2af92d5` passed 97 grouped delivery, chain, attachment and provenance tests with 1598 assertions. All 374 document links/layout checks and whitespace checks passed. DELIVERY prose score: 1.50 issues per 100 words.
- Explicit refs preserve annotations in all ten release-capable checkout steps. Existing proof, approval and immutability checks remain unchanged. Upstream checkout input/ref helpers confirm the observed fallback.
- Hosted repair remains unverified. Push `codex/annotated-release-checkout` for owner promotion, then use the next root-configured crawler patch. Never move the failed `0.0.6` tag. Main sign-off remains guarded.

## Authority and active slice

- Owner update, 2026-10-06: R58 clarifies R57-C57A/B. It is not a separate roadmap.
- Preview uses the root allocator on synchronized branches. The preview-only GitHub App is accepted.
- Releases require main after manually reviewed promotion. Keep release reviews and npm owner staging.
- Keep long-lived responsibility branches and separate evergreen tracking PRs. Never merge tracking PRs or delete branches.
- Closed unmerged PRs can reopen. Merged promotion PRs cannot reopen.
- Only root scripts change the authoritative version configs. Commit each slice locally and push the checked gate checkpoint.
- Preserve SDK v0.1 owner review. Website delivery stays disabled. Worker release builds only, without GitHub Release assets.
- The full goal remains active. The owner creates branches and clones again after conditional sign-off.

Working theory: one root allocator can serve local and App-triggered previews without duplicate version logic.
The prior direct main commit/tag push could not satisfy reviewed-main protection.

Active output gate: lazy logger construction and idle CLI preservation are checked on codex/node-logger-output.
Construction now computes paths only. The first write starts files, timers and hooks. Unused close/rotation preserves existing logs.
Session-only logging preserves an existing latest.log. Active severity streams, rotation and shutdown fixtures passed.
Grouped path checks passed 141 tests / 874 assertions, types and a development binary build on 2026-10-06.
Source defaults use src-crawler/logs. Bun standalone mode selects absolute per-user storage, never the executable or launch directory.
Explicit overrides retain priority. Docker pins /app/data/logs. Relative platform state variables use absolute user-home fallbacks.
The compiled Windows logger fixture writes and closes successfully while cwd stays empty. Linux/macOS and container runs remain pending.
R58-ROOT-LOGS has local path proof, not tagged delivery proof. Existing owner logs remain untouched. No delivery bump ran.
The owner merged initializer PR #1 into main at 4a89ca2. Hosted initialization remains unverified.
Main ruleset 24553134 is active: default-branch PR requirement, zero required approvals, deletion/force-push denial and no bypass actors.
The owner merged lifecycle PR #2 into main at 9df1d19. These task branches are not the final responsibility-branch split.
Each slice stays a local commit. A checked gate permits a task-branch push, not a direct main write or agent merge.
Supply an owner comparison link if PR creation is unavailable. Do not expand permissions or disable protection.
The owner merged logger PR #3 into main at 6574094. Tagged cross-platform proof remains pending.
Ruleset readback: immutable-delivery-tags 24553469 blocks all tag updates/deletions, with no bypass actors.
Stable-release 24553551 now restricts creation only, with a RepositoryRole 5 admin bypass and all four preview exclusions.
The owner applied the correction. Main and immutable-tag bypass lists remain separate and must stay empty.
No settings changed through this agent. No open PR or recorded preview initializer run was visible in the latest readback.
Public unauthenticated environment readback succeeded on 2026-10-06. The connector's unsupported endpoint is not a GitHub access denial.
Owner corrections now permit Branch main and Worker tags in cloudflare-preview. Desktop preview and network have their product tag restrictions.
SDK, crawler and desktop release environments require owner review. Existing SDK/crawler/Worker environments use their product v* tag rules.
Select an existing product tag as the workflow ref for SDK OIDC diagnostics and desktop asset recovery. An input tag does not change that ref.
These are metadata checks, not hosted recovery proof or permission to change settings. No screenshot is needed for this readback.
Lifecycle writing scores: agent procedure 1.07, Delivery 1.54 issues per 100 words.
The repository-wide link/layout check failed on 10 existing findings outside the changed links. Do not record a full docs pass.
Findings include stale recovery-skill references, upstream skill links, CONTRIBUTING.md and a removed node protocol path. Repair separately before final sign-off.
This merge preserves the initializer, lifecycle and checked logger evidence. Its conflict repair changes only this checkpoint.
Main sign-off remains open. Delete temporary task branches only after sign-off and merged-work checks. Keep future responsibility branches.
The root allocator delivered non-main crawler preview 2026.10.6-pre from synchronized codex/node-logger-output.
Commit 2d27ce6 changed only preview-crawler and its manifest. Tag object: 08ac88eaafe73dc9e7637fa089e30f94751385ca.
Run 37410193664 passed Linux, Windows, container publication, Release attachment and its terminal Discord announcement job.
Linux exercised the changed logger: 141 tests / 874 assertions. Root delivery:check returned release-artifacts-verified.
Original CI bytes matched both binaries, receipts, checksums and changelog. Linux binary SHA-256: 750dbfa9f586b2c1cffefbfdcf8915e2148c9355ef1ee4e451a264c63e737988.
Windows binary SHA-256: 86c2edae5dafac639e0a9bb0c9347b2b6c5ebe2438059838cd2dd24934174562.
Release identity: https://github.com/SlamTheDragon/vrc-packages/releases/tag/vrcp-crawler/v2026.10.6-pre.
This is non-main delivery proof, not Worker schema initialization, stable release promotion or full goal completion.
Active initialization slice: a root command uses the distributed preview SDK for explicit autoSeed false, then a catalog read.
Plan by default. Execution requires the dedicated main-ref manual workflow and the existing cloudflare-preview secret scope.
Use one fixed approved preview origin. Reject redirects and bound time/body size. Never print server errors or operator credentials.
No version allocation, rebuild, seeding, source approval or production action belongs to this command.
The owner must permit Branch main in cloudflare-preview for this manual initialization workflow. Tag delivery rules remain.
Implementation 6b95629 and the ESM repair passed 13 related tests / 142 assertions, syntax and whitespace checks.
Published preview SDK 2026.10.5-pre passed explicit-false DTO, authenticated init, unauthenticated catalog and malformed-response checks with injected offline transport.
The first distribution check caught require.resolve selecting unsupported CommonJS exports. Bun now resolves the ESM package.
Both root and product planning commands passed without network calls. No initializer executed remotely.
Use a promotion branch and manual PR merge for these changes. Do not push them directly to main during protection setup.
The owner created and merged initializer PR #1 after the connector rejected PR creation with 403.
Owner next action: allow the manual initializer's main ref in cloudflare-preview, then run the guarded initializer.
Do not expand the preview App's permissions to resolve this connector limitation. No main, tag or D1 write ran.

Active release slice: prepare one config-derived metadata commit on a dedicated promotion branch, without a tag or main write.
After manual review/merge, finalize only its exact merged main commit with a tag-only push and the same saved version.
Reuse versionFiles and immutable-tag checks. Independent proof helpers must bind the PR, review, base/head and merged config transition.
The related local delivery gate passed. Hosted transition and repository protection remain open.
Hosted App authentication and main-branch allocation passed. Non-main allocation remains unverified.
Owner permits a manual owner-reviewed merge without a second reviewer. Check the owner merge identity, not a self-approval.
The API cannot prove human inspection. Hosted no-bump diagnostic 37406552782 passed with both mutation steps skipped.
Owner selects all nonignored pending files for preview checkpoints. Release still requires clean main.
Working theory: print the paths, reject stale branches and pending ignored index entries, then commit and push before allocating a patch.
Partial push recovery, path races and unrelated tags under push.followTags passed. Never unstage owner files or skip a patch.
New CI ingress checks use the original run actor and exact reviewed metadata. Historical exceptions bind exact tag/object/commit pairs.
Tag-selected code requires external main/tag/workflow protection. It cannot police old workflows. This remains a sign-off boundary.

## Documentation and cleanup checkpoint — 2026-10-06

Working theory: repair live references without recreating removed documents or changing architecture.
Eight stale links now point to existing files or official documentation. CONTRIBUTING uses current root Bun delivery procedures.
The owner approved root CONTRIBUTING.md and ignored docs/.obsidian as narrow layout exceptions.
The checker permits only that root document and that exact ignored metadata directory. Other layout restrictions remain.
CONTRIBUTING prose lint: 1.66 issues per 100 words. Whitespace checks passed.
The full link/layout check passed for 374 documents. Whitespace checks passed.
The supplied validator passed for both repaired skills through isolated uv with PyYAML. Project dependencies stayed unchanged.
Workflow inventory found 13 files. Product delivery, reusable asset attachment, announcements, reconciliation, initialization and cache support have current roles.
The disabled website workflow still contained a tag trigger and build/attachment scaffold. No current caller requires that scaffold.
Removed web.yml and changed the boundary test to require its absence. Local website development remains available.
Other 12 workflows retain current roles. Remote run deletion remains deferred without exact retention evidence.
Website cleanup passed 72 related delivery/assets/provenance tests and 1275 assertions. Git preserves the removed workflow for recovery.
The first check found four stale workflow fixtures. Corrected those fixtures while retaining every enabled-product check.
The full link/layout check passed 374 documents. Whitespace checks passed. No product bump or publication belongs to this deferred-workflow cleanup.
Delivery prose lint: 1.56 issues per 100 words. Canonical owner correction supersedes older sign-off prerequisites without closing runtime work.
Owner added workflow/run/code cleanup to sign-off. Inventory first, preserve delivery and security evidence, then assess exact deletion targets.
Authenticated ruleset readback confirmed admin creation bypass only in stable-release. Immutable tags keep an empty bypass list.
No version bump, publication, deployment or settings change belongs to this documentation gate.
The owner logs marker remains untracked and untouched. Main sign-off and hosted initialization remain open.

## Owner correction — delivery sign-off boundary

Crawler PR #5 was owner-merged at 995db61. The finalizer plan accepted its exact metadata and main identity.
Execution stopped before tag creation: anonymous GitHub API quota reached zero. No explicit shell read credential was present.
The provider reset header was 2026-10-06T04:33:07Z. This is throttling, not a proven ruleset or permissions denial.
The reader now distinguishes exhausted quota/429 from other failures and prints only a bounded reset time, never provider bodies.
Diagnostic repair passed 72 related delivery/provenance/assets tests and 1277 assertions. Link/layout checks passed 374 documents.
Delivery prose lint: 1.52 issues per 100 words. Never extract stored credentials or bypass proof.
The failed finalization ran from clean main at 995db61, not the metadata preparation branch. No release tag was created or pushed.
Retry the same crawler 0.0.6 finalization after the quota resets. Do not allocate another patch or change permissions from this throttle response.

Preview D1 initialization and catalog reads belong to later runtime/ingestion gates, not delivery sign-off.
The owner creates responsibility branches and checks a fresh clone after sign-off. That check is not a prerequisite.
The nine-path baseline and merged documentation gate passed. Protected release-promotion proof and scoped workflow cleanup remain.
Root release preparation pushed metadata commit 226dbab for crawler 0.0.6 on codex/release/crawler/v0.0.6.
Only the release-crawler config and product manifest changed. No tag or publication ran. The connector cannot create PRs (403).
Owner must create and manually merge that promotion before exact merged-main finalization and protected publication.
PR #4 was owner-merged at e8f1bfb. Existing task branches remain until sign-off and merged-work checks permit their deletion.

## Current state and checked contract

Local implementation checkpoints: 9ad6d94, f9aaa1f, d452345, e6fb556 and 7c4cbc2.
Owner vision/UI commit 39c509b is preserved. Its desktop runtime was not built in this root gate.
Human procedures are in docs/source/DELIVERY.md. Agent procedures are in docs/decisions/AGENT_DELIVERY_PROCEDURE.md.
Keep three scratch files and preserve owner-comment cells.

Preview: root plan → optional pending checkpoint/push → configured patch → metadata sync → commit/tag → atomic push.
Release: clean main → metadata branch/PR → owner merge → exact merged-main proof → tag-only push.
Product scripts forward to root. Native hooks stay separate to prevent re-entry.

- Synchronized feature-branch previews pass. Stale remote tags or main configs stop allocation before writes.
- Missing main objects fail closed. Planning does not fetch, skip patches or change saved versions.
- Non-main release start and unpublished retry fail. Lost acknowledgments retry the same tag. Different remote tags never move.
- SDK, crawler-image and Worker previews no longer need opt-in variables. Release switches, reviews, staging and byte checks remain.
- The branch-only App dispatcher serializes each product and calls root preview delivery.
- It requests current-repository Contents write permission, not merge or release approval.
- Ordinary pushes do not allocate versions. Missing App credentials stop before allocation.

Final grouped root checks on 2026-10-06 passed 151 tests and 2271 assertions, with zero failures (413.98 seconds).
The first run found one stale installer fixture. It now tests preview filename handling without weakening release proof.
Script syntax, workflow YAML parsing and whitespace checks passed.
Disposable Git remotes covered pending paths, staged-file races, ignored index denial, freshness and lost acknowledgments.
Release fixtures covered merge/squash/rebase, owner identity, generated metadata, renamed annotations and tag-only pushes.
Original-run checks reject App actors, wrong workflows, foreign source and forged historical tags. All 22 frozen pairs matched origin.
Workflow checks covered full history, read scopes, App routing, product forwarding and approval conditions.
Root entries stayed unchanged, including pre-existing logs. Scratch keeps three files. The canonical ledger keeps two tables.
Local Bun is 1.4.1. Hosted delivery pins 1.4.2. Hosted proof is recorded separately below.
Crawler leases, source access and D1 code did not change. Their runtime tests were not repeated.

No real version bump, tag change, publication, deployment, protection or branch creation ran in the local gate.
The owner subsequently ran the dispatcher. The first run allocated a real Worker patch because the diagnostic checkbox was unchecked.

Hosted evidence, 2026-10-06:

- Allocator 37406357833 passed App authentication and normal allocation on main. Its no-write step was skipped.
- Commit e6bc3cee changed only preview-worker 6 → 7 and the Worker manifest. Other configured product versions stayed unchanged.
- Tag cloudflare-worker/v2026.10.7-pre points to e6bc3cee. Tag object: 14c1a59ef2559c9db87b360e3a511fac5b54948b.
- Tagged Worker run 37406393578 passed build, root tests, Worker tests/types/native checks and deployment without rebuilding.
- Artifact 11387007401 contains only worker_entry.js and its receipt. Archive SHA-256: 7f65bbd53162280c66a2377569b1a2d86dc3c9b5bb66bf251cc073d60d5f766a.
- Bundle SHA-256: 2d4a6d324ef388efb86e1f5b717ea7727882c194d9c4a3f99d518219ee1d089e. Receipt matches product, version, channel, commit and tracked Wrangler config hash.
- Deploy logs report preview D1 fbef6ce1-4145-45ae-ae91-5d617a1f2672 and Worker version 40f7f884-af95-4b7e-86cf-ae1087bd6217.
- Corrected diagnostic 37406552782 passed App authentication and planning. Commit identity and allocation steps were skipped.
- Remote main and Worker tag remained unchanged after the diagnostic. The clean local checkout fast-forwarded to e6bc3cee.
- A GET to /health returned the expected unknown-route 404. That path is not a health endpoint and proves no D1 behavior.
- The implemented GET /v1/app/index?limit=1 returned 500, internal_error: D1 has no canonical_packages table.
- Delivery passed, but catalog runtime readiness did not. Initialize only the preview schema with autoSeed false, then repeat the read-only catalog check.
- No remote schema, seed, source profile or credential changed during this check. Do not print the operator secret.

## Retained checked baseline

Setup/output gate 0f2c384 is pushed:

- Root 112/1802, crawler 137/839 and Worker 235/2062 passed.
- Worker passed from root and product directories. Native D1 race/replay/revocation checks passed with zero external fetches.
- SDK 54/621 and strict installed Node/native Worker checks passed.
- One 23-file network archive passed npm/Bun/types/native checks with both SDK channels.
- Root entries and producer manifests stayed unchanged. Packed consumers use product-local private manifests and isolated compiler configuration.
- Disposable root setup → reset --apply → setup passed. This is not a full product fresh-clone proof.
- Cleanup fixtures passed repeatability, link/type rejection and state preservation. Checkout cleanup ran as plans only.

Nine delivered paths retain independent artifact, registry and link proof:

| Product | Preview / single stream: version and run | Release: version and run |
| --- | --- | --- |
| SDK | 2026.10.5-pre / 37349103560 attempt 2 | 0.0.5 / 37349119431; promotion 37352706548 |
| Crawler | 2026.10.5-pre / 37356931567 | 0.0.5 / 37356959435 |
| Desktop | 26.10.4-pre / 37356987065 | 0.0.4 / 37357012826 |
| Worker | 2026.10.7-pre / 37406393578 | 0.0.5 / 37357069065, build only |
| Network | 2026.10.3 / 37354313987 | No release stream |

Crawler/Worker use preview SDK and network. Desktop/web use release SDK. Network accepts both.
Seven distributed-product deployment links passed. Worker links remain deferred to docs.vrcpackages.com.

## Cleanup, security and notification boundaries

- Clean removes named generated outputs. Reset removes selected node_modules, including root and nested network.
- Both plan by default. --apply checks paths/types/links. Concurrent changes can still cause partial deletion without recovery copies.
- Preserve node databases/logs/credentials, local D1, shared Bun downloads and published identities.
- Latest cache observation: 2262603737 bytes across 86 entries. Account capacity is unknown.
- Tagged jobs restore compatible public downloads. Trusted main warming jobs save them. GitHub manages eviction.
- Most artifacts inherit repository retention. Container archives and announcement receipts use 14 days.
- Keep SDK artifacts during staging. Broader artifact/GHCR budgets remain open.
- C57B and sanitized security intake are committed. Raw input stays ignored. Findings are queued, not remediated.
- Announcement gate 209d5be passed locally. No synthetic, historical or live Discord message ran.
- Live acknowledgement waits for the next normal delivery, not a ceremonial bump.

## Open sign-off exits and next actions

1. Keep the checked App diagnostic and main preview evidence. Prove synchronized non-main delivery at a relevant capability milestone.
   Preview schema initialization belongs to the later ingestion gate, not delivery sign-off.
2. Check hosted release provenance and external main/tag/workflow protection. Contents write does not restrict the App to preview tags.
3. Preserve the checked all-nonignored checkpoint, ignored-file and same-version recovery guards.
4. Settle recovery refs. Environment rules match the workflow ref, not its input tag.
5. Main preview allocation, tag CI and original bytes passed. Non-main policy and distributed-product links remain separate checks.
6. Check main/tag protection before sign-off. The owner checks a fresh clone afterward. Never bypass release reviews.
7. Keep the checked local logger path gate. Prove tagged crawler delivery when source/protection gates permit its next configured patch.

Earlier metadata showed unprotected main. Latest read on 2026-10-06 confirms active main-guard ruleset 24553134, without bypass actors.
Desktop preview/network lacked selected-ref restrictions. No settings changed.
The shell has no gh executable. Credential extraction was rejected and not retried.

Parallel reviews found pending-run cancellation, repeated App allocation and stale-main retry gaps.
Repair bec2930 preserves pending delivery/attachment runs, rejects allocator reruns before App auth, and shares the main freshness check.
The reviewer checked the repair diff. Final grouped checks passed. No hosted trial ran.
Queue capacity is 100. Channel groups use the current -pre convention. Historical suffixless preview acceptance remains a caveat.

Independent reviews found followTags leakage and inconsistent retained-annotation headers. Both repairs passed grouped checks.
The reviewers hit their usage limit afterward. Their findings are evidence, not a complete threat-model proof.
Metadata-PR preparation and merged-main tag-only finalization now reuse version, source-run and immutable-tag helpers.
Tag routing, CI and artifact recovery check original source proof. Old tag-selected workflows still require external policy.
Never use a pre-merge test SHA, direct main push, App release allocation or automatic promotion merge.
Both owner-triggered App runs passed. No explicit local API write credential or dispatch-capable connector is available.
Do not resume unrelated feature work or declare the full goal complete.
