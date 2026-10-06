# Active checkpoint — R57-C57A/B delivery transition

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
   First initialize the missing preview schema through the existing protected operator path. Keep autoSeed false and production untouched.
2. Check hosted release provenance and external main/tag/workflow protection. Contents write does not restrict the App to preview tags.
3. Preserve the checked all-nonignored checkpoint, ignored-file and same-version recovery guards.
4. Settle recovery refs. Environment rules match the workflow ref, not its input tag.
5. Main preview allocation, tag CI and original bytes passed. Non-main policy and distributed-product links remain separate checks.
6. Complete main protection and owner fresh-clone proof before sign-off. Never bypass reviews.
7. Fix the default node logger path before root-output sign-off. Existing root logs predate this gate and remain untouched.

Public metadata rechecked after the hosted diagnostic on 2026-10-06 still showed unprotected main and no rulesets.
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
