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
Its direct main commit/tag push cannot satisfy reviewed-main protection unchanged.

## Current state and checked contract

Implemented checkpoints: 7a1f097, 7916922, 2a6434a and bec2930.
The owner confirmed the R58 prompt after a concurrent delivery-document rewrite entered 7a1f097.
Preserve procedure commit 8ac3616 and owner README commit ac5bd8e.
Human procedures are in docs/source/DELIVERY.md. Agent procedures are in docs/decisions/AGENT_DELIVERY_PROCEDURE.md.
Keep three scratch files and preserve owner-comment cells.

Root command → plan → configured patch → metadata sync → commit/tag → atomic push.
Product scripts forward to root. Native hooks stay separate to prevent re-entry.

- Synchronized feature-branch previews pass. Stale remote tags or main configs stop allocation before writes.
- Missing main objects fail closed. Planning does not fetch, skip patches or change saved versions.
- Non-main release start and unpublished retry fail. Lost acknowledgments retry the same tag. Different remote tags never move.
- SDK, crawler-image and Worker previews no longer need opt-in variables. Release switches, reviews, staging and byte checks remain.
- The branch-only App dispatcher serializes each product and calls root preview delivery.
- It requests current-repository Contents write permission, not merge or release approval.
- Ordinary pushes do not allocate versions. Missing App credentials stop before allocation.

Final grouped root checks on 2026-10-06 passed 118 tests and 1869 assertions, with zero failures.
Script syntax, workflow YAML parsing and whitespace checks passed.
Disposable Git remotes covered feature delivery, stale-tag/main-config denial, non-main release/retry denial and lost acknowledgments.
Workflow tests covered App routing, product forwarding and release approval conditions.
Local Bun is 1.4.1. Hosted delivery pins 1.4.2. These results are not live App proof.
Crawler leases, source access and D1 code did not change. Their runtime tests were not repeated.

No real version bump, tag change, App setup, publication, deployment, protection or branch creation ran.

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
| Worker | 2026.10.6-pre / 37357039766 | 0.0.5 / 37357069065, build only |
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

1. Owner will configure the App installation, Client ID variable and private-key secret. Keep the key outside chat and source.
2. Complete CI release provenance and reviewed version-PR/final-tag delivery. Contents-write permission does not restrict an App to preview tags.
3. Settle pending-file scope before automatic commits. The executor still rejects a dirty worktree.
4. Settle recovery refs. Environment rules match the workflow ref, not its input tag.
5. Prove normal hosted branch preview allocation, tag CI, original bytes and deployment links.
6. Complete main protection and owner fresh-clone proof before sign-off. Never bypass reviews.

Public metadata on 2026-10-06 showed only unprotected main and no rulesets.
Desktop preview/network lacked selected-ref restrictions. No settings changed.
The shell has no gh executable. Credential extraction was rejected and not retried.

Parallel reviews found pending-run cancellation, repeated App allocation and stale-main retry gaps.
Repair bec2930 preserves pending delivery/attachment runs, rejects allocator reruns before App auth, and shares the main freshness check.
The reviewer checked the repair diff. Final grouped checks passed. No hosted trial ran.
Queue capacity is 100. Channel groups use the current -pre convention. Historical suffixless preview acceptance remains a caveat.

The release review confirms a separate reviewed-metadata PR and exact merged-main tag-only finalization are needed.
Reuse existing version, source-run and immutable-tag helpers. Check provenance during tag routing, CI builds and asset recovery.
Never use a pre-merge test SHA, direct main push, App release allocation or automatic promotion merge.
Read-only reviews changed no source or settings. Their findings remain within C57A/B.
Do not resume unrelated feature work or declare the full goal complete.
