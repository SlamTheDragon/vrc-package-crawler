# G14 — checked local setup and output cleanup

## Authority and current boundary

- Active related gate: Q-PRODUCT-TEST-OUTPUTS and R57-DEV-READINESS.
- The owner requires setup, cache and generated-output checks before feature work resumes.
- The full goal remains active. This local readiness gate passed on 2026-10-06, not the conditional main sign-off.
- Keep exactly three scratch files. Preserve owner comments, staged-release approvals and the SDK v0.1 review hold.
- Commit each implemented slice locally as unverified. Commit and push the passed gate evidence.
- Website delivery stays disabled. Worker release builds only, without production deployment or GitHub Release assets.
- The owner creates responsibility branches and performs the later fresh clone. Do not delete this checkout.

## Checked contract

Root clean/reset commands call scripts/cleanup.mjs and use the same product mapping as delivery.
Clean removes only named generated outputs. Reset removes only the selected node_modules.
Both commands plan by default. Deletion requires --apply.
The complete plan rejects linked paths and unexpected types before deletion. Each target receives another check before removal.
Concurrent filesystem changes can still cause partial cleanup. There is no recovery copy.

Crawler binary cleanup preserves nearby databases and logs. Worker cleanup preserves local D1 and other runtime state.
Root reset and the nested network project now have explicit commands.
Shared Bun downloads, credentials and published identities are not cleanup targets.

Worker database fixtures use the existing product test-directory helper.
SDK and network packed consumers use their own .artifacts/tests folders and private package manifests.
Their explicit typechecks ignore parent compiler configuration, but retain strict checks.
Producer manifests must remain unchanged. Published tarballs must exclude the test consumers.

## Gate evidence

| Check | Result |
| --- | --- |
| Root safety and delivery tests | 112 passed, 1802 assertions, zero failures |
| Crawler tests | 137 passed, 839 assertions, zero failures |
| Worker tests from product and root | Each passed 235 tests and 2062 assertions |
| Worker typechecks and native runtime | Passed. Isolated D1 lease/race/replay/revocation cases passed. External fetches: zero |
| SDK source and packed consumer | 54 tests, 621 assertions. Strict declarations, Node runtime, Worker build and native runtime passed |
| Network packed consumer | Same 23-file archive checked with release SDK 0.0.5 and preview SDK 2026.10.5-pre |
| Network resolvers and runtimes | npm and Bun installations, strict declarations, Node/Bun runtime and native Worker passed. External fetches: zero |
| Root output observation | No repository-root entries added or removed during the grouped checks |
| First root setup | Disposable fixture passed setup, reset root --apply, then setup again |
| Cleanup safety | Disposable fixtures passed repeatability, linked/type rejection and runtime/source/secret preservation |
| Real checkout cleanup | clean all and reset all plans passed. No --apply ran here |
| Static review | Script syntax and whitespace checks passed. Source manifests and version configs stayed unchanged |

Local Bun is 1.4.1. Hosted delivery uses pinned Bun 1.4.2.
These local results do not replace the hosted runtime proof.
The setup fixture checked root tools only. It does not prove a full fresh-clone installation of every product.
Development test packs are not new publications or replacements for published network version 2026.10.3.

## Failures found and repaired

- Nested npm consumers without private manifests found the producer manifest and changed it. Only those generated changes were restored.
- Private consumer manifests now stop parent package discovery. Final checks asserted unchanged producer manifests.
- TypeScript found the parent config during positional-file checks. Explicit --ignoreConfig now isolates the strict consumer check.
- The local network SDK was stale. Checked preparation installed the configured preview SDK without changing manifests.
- A setup diagnostic compared Windows short and long path spellings. The repeated real-path check passed.
- Four implemented slice commits: 8e32469, 19f3299, df2cdc2 and e989219. Their verification status is now checked.

## Cache and artifact policy

- Latest read-only cache observation: 2,262,603,737 bytes across 86 entries. Account capacity is not measured.
- Hosted caches contain compatible public Bun downloads only. Keys include dependency specifications, OS, architecture and pinned Bun.
- Tagged jobs restore only. Trusted default-branch warming jobs save compatible downloads.
- No credentials, node_modules, compiled targets, D1 state or release outputs enter these caches.
- GitHub-managed eviction remains the accepted policy. No cache deletion or quota change ran.
- Most CI artifacts inherit repository retention. Container archives and announcement receipts explicitly use 14 days.
- Keep original SDK artifacts while owner staging is pending. Broader artifact/GHCR/account budgets remain open.
- Do not treat published Releases, npm versions or GHCR images as disposable caches.

## Delivered baseline and remaining exits

Nine delivery paths retain their checked baseline. No versions, tags or publications changed in this gate.

- SDK preview/release: 2026.10.5-pre / 0.0.5. Source runs 37349103560 / 37349119431.
- Crawler preview/release: 2026.10.5-pre / 0.0.5. Source runs 37356931567 / 37356959435.
- Desktop preview/release: 26.10.4-pre / 0.0.4. Source runs 37356987065 / 37357012826.
- Worker preview/release: 2026.10.6-pre / 0.0.5. Source runs 37357039766 / 37357069065.
- Network single stream: 2026.10.3. Source run 37354313987.
- Crawler/Worker use preview SDK. Desktop/web use release SDK. Network accepts both SDK channels.
- Seven distributed-product deployment links passed. Worker links remain deferred to docs.vrcpackages.com.

C57B rules and sanitized private-security intake are committed and pushed.
The raw private input stays ignored. Security findings are queued, not remediated.
The announcement gate is committed as 209d5be. No synthetic, historical or live Discord message ran.
Its hosted acknowledgement remains pending until the next ordinary product delivery.

Main remains unprotected. Only main exists, with no rulesets.
Root delivery still performs a direct atomic branch/tag push.
Reviewed promotion needs a compatible delivery path before the owner splits responsibilities.
Desktop preview and network environments currently lack selected-ref restrictions.
Resolve those policies without blocking approved manual attachment workflows.
Preview branch-push automation remains unimplemented. Keep main preview auto-publication disabled.

## Next action

Keep these checked commits with the recorded gate evidence.
Finish the branch/promotion and environment-policy slice before conditional main sign-off.
Do not resume unrelated feature work, create owner branches or declare the full goal complete.
