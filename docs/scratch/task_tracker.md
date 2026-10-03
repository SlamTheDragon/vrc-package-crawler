# Active slice and checkpoint

## R51 — dependency ownership preparation, active

Theory: Worker credential generation, scoped-profile matching and operator contracts remain in the crawler tree despite having only coordinator production callers. Move coordinator-only implementation and its tests into Worker-owned functional folders. Keep node leases and genuine cross-runtime validation separate. Extract title/link normalization from the IANA/README/author sanitizer into one pure shared module, without forwarding wrappers or algorithm changes. This reduces coupling but does not select an internal package identity or establish isolated deployment.

Related changes will accumulate before one gate checkpoint. Required checks: direct imports and node exports, token fixtures, profile/lease fail-closed behavior, sanitizer fixtures, SDK/Worker lead-schema differences, typechecks, native Worker/D1 and final bundle. Do not run these after each move. Defer registry/license/internal artifact decisions and behavior changes to lead defaults.

| Boundary | Implementation scope | Unverified gate checks |
| --- | --- | --- |
| Coordinator credentials | Worker-owned token module and tests, no crawler issuance export | Generation/decoding, revoked principals, native issuance |
| Operational source profiles | Worker-owned matching and private-IP policy composition | Profile scope/expiry/revocation and shared lease guards |
| Title/link normalization | One pure shared module, direct callers | Sanitizer equivalence and Worker graph/bundle |
| Operator contracts | Move Worker-only contracts without changing accepted payloads | Characterize SDK/Worker lead shapes/defaults before consolidation |

## R49/R50 — prior verified checkpoint

Next-iteration cadence: owner defers testing until a capability gate or related gate group is implemented. Stop per-slice suite/build repetition. Record changed boundaries and pending checks, then run verification together at the gate checkpoint. Keep implementation status separate from verified status. Existing R49/R50 measurements below remain historical evidence, not proof of future edits.

Owner moved the coordinator into src-worker/src and its tests into src-worker/test, created an Astro static src-web, and initialized a Tauri/Svelte src-crawler-client. Reviewed commits ca5d69d (split/scaffolds), b438a8d (remove/ignore lockfiles), 4d99e0b (vrcp-crawler-node binary names). Preserve dirty owner edits in Worker package, operator handler and catalog projection tests.

R50 theory: the owner's four-database research mixes account-wide quotas, per-database limits, included paid allowances and hard caps. Ten nodes and 1,000 users do not determine usage without polling/query measurements. Corrected primary facts now live in the existing infrastructure topic. Two registry/user databases per environment remain a planning scenario, not a delivered migration. No remote resources, plan purchase, KV auth cache or Firebase integration changed.

| Claimed behavior | Current evidence | Next smallest check |
| --- | --- | --- |
| Account quota isolation | Primary docs confirm shared D1 usage | Measure preview/production separately but budget their sum |
| Paid execution budget | HTTP CPU defaults to 30 seconds, not 50 ms | Measure current invocation CPU and query count |
| Population-based capacity | One-second idle claims and 30-second heartbeats | R50-C31: measure operations before backoff/plan selection |
| Authentication caching | KV eventual consistency differs from revocation authority | R50-C30: settle identity/database ownership and consistency |

R49 evidence: SDK/handler fixtures reproduced dropped cursors, limit clamping and accepted malformed receipts. A separate fixture reproduced an unusable response cursor. Public query/response now share canonical token validation and return the full wire receipt. SDK: 44 tests passed, 275 assertions. Full repository: 383 tests passed, zero failed, 2802 assertions across 41 files. Three configured workerd tests pass. SDK/node/Worker types pass. Offline packed SDK: 31 files, ordinary Node, strict declarations, dry-run/native Worker, zero external fetches. API bundle: 2596.36 KiB, gzip 414.76. Native D1/HTTP smoke passes. Search/delta unchanged. Long/Unicode-ID encoding remains R49-C29. No publication, deployment or push.

Retained verification: R47 native first/second lead failures roll back receipt/events/leads and preserve the lease/reservation. Exact retry and duplicate replay pass. Automatic promotion is still post-commit, without durable retry guarantees. R48 matching/malformed/wrong-job receipt and exact-body retry fixtures pass. R45/R46 fixed binding/path drift. Windows/Linux node compilation, Astro build and desktop Svelte/build/offline Cargo checks passed previously. Linux execution and frontend integration remain unverified.

New Cloudflare log dbb64f2f confirms src-worker selection, placeholder build and deploy failure with 16 dependency errors (eight zod, four SDK, three SemVer, one robots parser). Local sibling installs still hide cross-project resolution. Parser/build/config repairs do not establish a clean remote build. No aliases or sibling-install workaround.

Next related work: audit lead defaulting and camel/snake wire validation under R13-C6 alongside distribution boundaries under R15-C18/R28-C22. Record differential fixture needs, then execute them at the gate checkpoint. Do not replace stricter operational policy with permissive SDK defaults without an explicit decision. Package identity/version/license and internal artifact ownership remain critical decisions. Do not hide clean-build failure with aliases or sibling installs. Recovery needs R15-C17 retention/quota decisions before persistent payload storage.

R50 evidence: primary pricing/limits and Firebase verification sources checked. Research records account-versus-database scopes, paid allowances, indexed writes, CPU versus wait time and KV consistency. Actual idle code explains the idealized 864,000 claims plus 28,800 heartbeats daily for ten nodes. This is not a workload benchmark. R50-C30/C31 preserve the architecture and measurement questions. Independent review found no blocker and confirmed ten changed relative links resolve. Prose lint: infrastructure 1.69, SDK README 0.63, runbook 1.38 issues/100 words.

Docs: live relocation links repaired, false frontend/API guarantees removed, and setup checklist updated. Link checker retains seven existing findings: docs/.obsidian and six missing skill references. Do not delete owner tooling or invent absent skill packages. New prose passed STE-flavored lint. Keep exactly three scratch files.

## Retained decisions and open gates

- API coordinator now src-worker. Static web and desktop client remain starters until executable integration proves otherwise. The new build log proves the panel invoked src-worker. Verify deployment settings before a main push.
- R44 removed coordinator evidence/subtype duplicates from SDK. UmbrellaSchema remains tools/assets/avatars. Built and installed SDK tests passed before the split: 31 files, strict declarations, ordinary Node and native Worker, zero external fetches.
- Dynamic JSON tags, profiles/hierarchy, furry/human(anime) distinctions and NSFW evidence remain open. A fourth VPM umbrella remains an unapproved proposal.
- R39-C24: node owner relation and user GET routes need an explicit provisioning decision. Existing user collection POST retirement and owned app reads do not settle this.
- R15-C18/R28-C22: independent SDK/internal distribution remains open. Three physical Zod copies existed before this split. Owner removed lockfiles deliberately. Do not restore them or publish unresolved identity/license merely to satisfy a build.
- R15-C17: node has no durable payload/idempotency outbox after lost acknowledgement/restart. Replay must submit directly, not heartbeat/refetch. Retention deadline, quota and terminal rejection behavior remain critical decisions. The discovery receipt prerequisite now passes locally.
- Robots transport, publication rights, reviewed seeds, Docker fleet and true real-source ingestion remain gated. Goal active. Exactly three scratch documents.
