# Crawler infrastructure resource library

Reviewed 2026-10-03 against HEAD `3b9d203`. External guidance is not proof that this repository implements it. See the [capability audit](PROTOTYPE_PARITY.md) for code evidence and the [library guide](04_curriculum_and_core_philosophies.md) for review rules.

## Select a resource by the failure under review

| Concern | Primary resource and review scope | Application here | Required evidence |
| --- | --- | --- | --- |
| API-only hosting | [Workers migration from Pages](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) — retrieved | Workers can serve APIs and assets. Pages remains a migration source. The owner split the API into src-worker and the static site into src-web. | Trace Worker entry, D1 binding, environment isolation and routing. Do not infer deployment success from relocation. |
| Atomic job reservation | [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/) — retrieved; inspect batch semantics when implementing | Eligibility reads outside a write batch do not reserve a job. A transactional batch alone cannot make earlier reads atomic. | Race two eligible claims; prove one winner and one origin reservation using D1 runtime tests. |
| Runtime fidelity | [Workers testing](https://developers.cloudflare.com/workers/testing/) — retrieved reference | Use the supported local Workers runtime. A SQLite adapter can expose logic bugs but cannot prove D1 or deployment compatibility. | Exercise real Request/Response schemas and bindings under Wrangler or the Workers test integration. |
| Robots semantics | [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) — retrieved | Robots rules are not access authorization. Keep profile approval, robots state and a live lease separate. | Missing, unreachable, expired, redirected and oversized robots fixtures; no fabricated allow snapshot. |
| Public API pacing | [GitHub REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api) — retrieved | Use documented budgets, conditional requests and retry signals. Budget shared origins across nodes, not just per process. | Shared-IP contention, reset headers, Retry-After and token-scoped requests. |
| Recovery and retries | [AWS backoff and jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — retrieved reference | Bound retries and preserve result identity. Jitter spreads load; it does not authorize a fetch after lease expiry. | Coordinator outage, result retry, restart, expired lease and duplicate submission tests. |
| Local SQLite | [SQLite WAL](https://www.sqlite.org/wal.html) — retrieved | Relevant to node-local state, not a reason to keep a second authoritative coordinator implementation. | Crash/restart and transaction tests for the actual remaining local store. |
| npm delivery | [TypeScript declarations](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html), [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/) — retrieved | Test the consumer artifact, not just workspace imports of TypeScript source. | Pack/install in a clean consumer; import JavaScript and declarations without Bun-specific behavior. |

## Architecture checkpoints

### Delivery storage and retention — 2026-10-05

The live repository is public. Its cache storage limit is 10 GB, from the GitHub REST readback.
The snapshot contains 63 caches, totaling 1,304,427,315 bytes. Bun executable caches account for 847,109,183 bytes across 23 entries.
The other 40 caches total 457,318,132 bytes. All 55 listed Actions artifacts total 787,333,938 bytes.
These counts exclude Release assets, npm archives, GHCR images and other repositories. They do not prove the owner's account budget.

[GitHub cache limits](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#usage-limits-and-eviction-policy)
describe the default 10 GB cap and seven-day eviction for unused caches. A higher configured cap can incur charges.
[Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
distinguishes public standard runners, billed larger runners and separate storage allowances. Do not treat public CI as unlimited storage.

Conservative future controls: retain preview CI artifacts for seven days, preserve release staging inputs for 90 days, and keep container handoffs bounded.
Published Release assets and immutable registry versions are separate from temporary CI artifacts. Do not delete them as cache cleanup.
[setup-bun's no-cache input](https://github.com/oven-sh/setup-bun/blob/v2/action.yml)
disables its executable cache. This trades repeated downloads for fewer tag-scoped cache copies, not a dependency verification bypass.
These controls remain proposals. No retention change, cache deletion or paid limit increase ran in this audit.

Estimate storage per stream from daily uploaded bytes multiplied by retention days. Add pending staging inputs and existing retained data.
For example, one GiB uploaded daily with seven-day retention needs about seven GiB before those other records.
Measure actual archive sizes and delivery frequency before unattended branch publication. Recheck account budgets and package visibility separately.

The owner wants a Worker coordinator, separate headless crawler nodes, and downstream operator/user/app bindings. A message broker is optional infrastructure, not a replacement for leases, source profiles, origin budgets or idempotent submission. Do not add one until a measured failure requires it.

Prefer existing platform primitives and maintained dependencies. Compare caller requirements, runtime support, bundle cost, license, failure behavior and deletion opportunities before adding an abstraction. The [dependency review](CRAWLER_DEPENDENCY_RESEARCH.md) distinguishes parsers from competing schedulers.

Remove unsupported estimates from decisions: requests per second, memory use, deduplication accuracy and cloud cost need a measured workload and a dated product limit. The former tutorial's fixed performance numbers and claims that local tests proved fleet safety are withdrawn.

## Further reading, not yet implementation authority

### One network archive and two SDK channels — 2026-10-05

The owner selects one future network CalVer stream without a prerelease suffix. Other products retain their release and preview channels.
The current network protocol imports only IssueNodeCredentialSchema from the SDK and reuses its nodeId field.
Published SDK sources at vrcp-api/v0.0.1 and vrcp-api/v2026.10.1-pre contain the same node-ID rule.
This source comparison does not prove one packed network archive works with both SDK distributions.

| Candidate | Consequence | Required check |
| --- | --- | --- |
| Keep a pinned SDK dependency | The network archive can install its own SDK channel beneath a consumer | Reject channel contamination or duplicate SDK resolution before distribution |
| Let the consumer supply a required SDK peer | One network archive can reuse the consumer's selected SDK without copying the schema | Pack once, then check npm and Bun installs against both verified SDKs. Confirm actual module resolution, exported declarations and Worker behavior |
| Copy the node-ID rule into the network package | Removes the dependency but creates two mutable validation authorities | Do not select this shortcut without an explicit contract-ownership decision |

[npm peer dependencies](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#peerdependencies) express host compatibility and install automatically in npm 7 and later.
[Bun installation](https://bun.com/docs/pm/cli/install) also installs peers by default. Moving a dependency into peers alone does not prove channel isolation.
The installed semver library rejects 2026.10.1-pre for both * and >=0.0.0. An explicit 0.0.1 OR 2026.10.1-pre range accepts both current versions.
No broad range proves compatibility with future API changes. Generate compatibility bounds only from verified distributions, not calendar resemblance.

Preferred research candidate: a consumer-supplied SDK peer, with packed dual-channel checks and explicit compatibility bounds.
This is not an accepted dependency change. R57-NETWORK-SINGLE records the critical contract decision.
The hosted installer must select exact checked tarballs and preserve their version, source receipt and checksum.
An npm latest alias cannot resolve an unpublished network package. Do not use force or legacy-peer-deps to hide dependency conflicts.

### Rolling development tags versus delivery identity — 2026-10-05

The owner suggests a single moving nightly/latest-dev tag instead of a unique tag for every automated preview.
This is a distribution choice, not a universal release practice. Distinguish a moving alias from a fixed artifact identity.

| Mechanism | Useful purpose | Constraint for this repository |
| --- | --- | --- |
| Versioned product tag and Release | Bind source, package version, receipts and assets to one delivery | Keep published tags and bytes unchanged. Current delivery uses this contract. |
| Moving development Git tag | Point developers to the newest disposable build | Keep it outside versioned Release identity. Cached clones can retain the earlier tag. Separate triggers and consumer rules need owner review. |
| npm/GHCR channel alias | Let consumers select the newest channel version | Retain immutable package versions or image digests underneath the alias. CI still checks configured versions. |

[Git's retagging guidance](https://git-scm.com/docs/git-tag.html) describes inconsistent local tags and the trust risk of changing a public tag.
[GitHub's action release guide](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/using-immutable-releases-and-tags-to-manage-your-actions-releases)
distinguishes immutable releases from movable tags without a Release. Its action-major aliases are not a mandate for package previews.
[GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
lock published tags and assets when enabled. Repository enforcement is a separate setting, not proof from our scripts.
[npm dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages/) supply moving aliases such as latest without replacing a package version.

Recommendation for the current gate: keep versioned delivery snapshots and the existing registry channel aliases.
If an unreleased rolling pointer is needed, decide its separate trigger, retention and consumer semantics before implementation.
No rolling Git tag, force push, retention deletion or new publication trigger ran in this self-check.

- [Percolator publication search](https://research.google/search/?query=Percolator): the previously linked USENIX page could not be retrieved in this review. Obtain the primary paper before borrowing its transaction model.
- [awesome-crawler](https://github.com/brucedone/awesome-crawler): a discovery index, not a security review or package recommendation.
- [Historical spikes](SPIKES.md): dated experiments, not current deployment evidence.

Local runtime claim races now pass. See [the active tracker](task_tracker.md) for measured results and remaining gates. Remote deployment and broad live crawling remain unverified.

## D1 capacity and authentication research

Reviewed 2026-10-03 after owner-supplied research. Planning scenario: ten crawler nodes, 1,000 users, and separate registry/user databases in production and preview. This is not a delivered database split or a measured workload. Current configuration binds one D1 database per environment through VRCP_D1. Firebase verification is absent.

### Account allowances versus resource limits

Free D1 includes 5 million rows read and 100,000 rows written daily across the account. Separate production and preview databases do not multiply those allowances. Exhaustion blocks D1 queries until the daily reset at 00:00 UTC. Paid includes 25 billion reads and 50 million writes monthly, then charges for extra usage. These are allowances, not hard monthly caps. Paid storage includes 5 GB, not 1 TB of free storage. Queries from Wrangler and the dashboard also count. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

| Resource limit | Free | Paid | Scope |
| --- | --- | --- | --- |
| Database count | 10 | 50,000 | Account |
| Maximum database size | 500 MB | 10 GB | Database |
| Maximum stored data | 5 GB | 1 TB | Account, not included paid storage |
| D1 queries per Worker invocation | 50 | 1,000 | Invocation |

Four databases fit the count limit. Separate databases can isolate records, but cannot isolate account-wide quota exhaustion. A larger plan does not remove query and resource limits. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Free Workers allow 100,000 requests per account daily. Paid includes 10 million requests and 30 million CPU milliseconds monthly, with extra usage billed. The subscription starts at $5 monthly. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

For paid HTTP Workers, CPU defaults to 30 seconds and can reach five minutes. Free allows 10 milliseconds. The supplied 50-millisecond claim is not the current paid default. Database/network waits do not count as CPU execution. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

### Measure this code before selecting a plan

Current idle claims return retryAfterMs=1000. The daemon honors that delay and defaults to a 30-second idle heartbeat. An idealized ten-node, continuously idle fleet produces 864,000 claims plus 28,800 heartbeats daily, excluding latency. This arithmetic is not a benchmark. Active jobs, retries, node uptime and user traffic change the totals.

Trace [the daemon](../../../src-crawler/src/runner/daemon.ts) and [D1 claims](../../../src-worker/src/storage/d1/coordinator.ts). Measure empty claims, successful claims, fetching heartbeats, results, duplicate results, user queries and initialization separately. Collect invocation queries, rows_read, rows_written, CPU, storage and latency by environment. Local runtime measurements do not establish remote account consumption.

One result can write several records and indexes. Rows scanned differ from rows returned. Indexes can reduce reads but add writes and storage. Select indexes from query plans, not a blanket optimization rule. [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/).

### Keep authentication caches separate from authority

KV is eventually consistent. Changes can remain invisible elsewhere for 60 seconds or longer. Do not treat it as immediate credential revocation authority. [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

KV Free includes 100,000 reads but only 1,000 writes daily. It is not a free substitute for frequent session mutation. [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/).

Firebase verification keys are public, unlike private service credentials and user tokens. Cache keys according to their response Cache-Control max-age. Signature verification still requires token-claim checks. Session revocation is a separate requirement. [Firebase ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

Open decisions: registry/user ownership boundaries, cross-database atomicity, environment isolation, plan budget, cache freshness and revocation guarantees. Record them in the ledger before migrations or new bindings. Do not infer that 1,000 users require a paid plan without their request pattern.

## D1 initialization and migration resources — 2026-10-05

Use [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) for invocation and statement limits.
Use [the binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/#exec) for execution behavior and result counts.
Use [Wrangler migrations](https://developers.cloudflare.com/d1/reference/migrations/) for numbered SQL files and applied-migration records.
Migrations are a platform feature. Do not create another schema scheduler or infer rollback from deployment rollback.

The current initializer was measured with native isolated D1, not a remote Free account.
It formerly executed 64 statements through three binding calls with `autoSeed: false`.
Injected failures in both alteration calls still reported success and omitted the timestamp columns.
The fresh-schema correction declares those fields directly and removes the catch-and-ignore alterations.
Fresh and repeated runs now execute 62 statements through one call, with both fields and zero seed jobs.
The 62 schema statements contain 32 table definitions and 30 indexes. Runtime metadata tables are separate.

Do not equate SQL statements, binding calls, billed rows or CPU time.
The documented Free limit is 50 queries per invocation. The native counts do not establish the account's enforcement or billed usage.
The initializer still runs DDL through HTTP and does not upgrade earlier table layouts.
R14-C14 retains remote budget measurement and versioned migration delivery before claiming Free-plan readiness.
The owner requires fresh version-0 databases, not silent prototype upgrades.

Code anchors: [fresh schema](../../../src-worker/src/storage/d1/utils.ts), [initializer](../../../src-worker/src/storage/d1/coordinator.ts),
[regressions](../../../src-worker/test/d1_coordinator_store.test.ts). Worker types, 235 units, the preview dry-run build and native D1 passed.
All runtime diagnosis used isolated local databases with zero external fetches. No remote schema or migration ran.

## Fleet batching and staggered sync — proposal, 2026-10-04

The owner proposes assignment sequences, one-to-two-hour sync windows and 15-minute heartbeats. Compare these as separate clocks. This audit does not change runtime settings. [R54-C39A through D](UNMERGED_IMPLEMENTATION_PLAN.md) propose a full fleet-budget gate, G16, after ownership and recovery prerequisites.

### Four clocks, not one sync interval

| Clock | Inspected behavior | Proposal and constraint |
| --- | --- | --- |
| Source revisit | D1 submit schedules normal outcomes 24 hours later. Temporary failure uses 15 minutes. Rate-limited outcomes use the supplied delay. | Tune revisit frequency by source and change rate. A fleet sync window must not override Retry-After or origin pacing. |
| Assignment and idle liveness | claim returns one job or retryAfterMs=1000. The idle heartbeat defaults to 30 seconds. The empty-delay schema caps at five minutes. | Compare bounded backoff and jitter first. Hourly sleeps need a reviewed contract and accepted discovery latency. |
| Active fetch authority | Claims expire after five minutes. runLeasedJob checks authority before fetch, every five seconds, and before submit. Heartbeats do not renew leases. | Keep active checks separate from idle liveness. A 15-minute check exceeds the current lease lifetime. Longer intervals also delay outage and revocation detection. |
| Result upload and catalog sync | Node submits each result immediately. A new result needs a live lease. Consumers independently page index/delta. | Persist a minimized outbox first. Delaying new results for one or six hours needs an explicit acceptance/recovery contract. Consumer sync can use another cadence. |

Code anchors: [claim/heartbeat/submit](../../../src-worker/src/storage/d1/coordinator.ts), [wire limits](../../../src-worker/packages/network/src/protocol/node_protocol.ts), [daemon](../../../src-crawler/src/runner/daemon.ts), [lease runner](../../../src-crawler/src/runner/lease_runner.ts). Existing duplicate receipts can replay after lease expiry if identity, key, digest and active credentials match. That does not authorize first-time late submissions.

The prototype sync command at commit 09e9dc8 copied local rows to D1 with rowid checkpoints. That is not the current node-to-coordinator contract. The owner's six-hour schedule is historical intent, not a recovered setting in that command. Do not restore direct D1 writes or rowid replication. The [prototype audit](PROTOTYPE_PARITY.md) records missed in-place changes.

### Budget arithmetic, not a benchmark

Current Free allowances are 100,000 Worker requests daily, and D1's account-wide 5 million reads and 100,000 writes daily. D1 has no bandwidth charge. Node hosts and upstream services can impose separate byte quotas. Sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). These sources were checked on 2026-10-04.

For ten nodes online all day, one periodic call every I seconds produces 10 × 86,400 / I daily calls. This excludes latency, retries, job traffic and consumer traffic.

| Periodic operation | Interval | Calls/day across ten nodes |
| --- | --- | ---: |
| Current empty claims | 1 second | 864,000 |
| Current idle heartbeat | 30 seconds | 28,800 |
| Current active periodic heartbeat, if continuously fetching | 5 seconds | 172,800 |
| Candidate idle operation | 15 minutes | 960 |
| Candidate assignment window | 1 hour | 240 |
| Candidate assignment window | 2 hours | 120 |
| Historical sync cadence | 6 hours | 40 |

Do not sum mutually exclusive full-day idle and active scenarios. Current idle polling alone exceeds the request allowance in this idealized model. Slow idle calls save requests but increase assignment latency. For each executed job, count claim, result, initial/final authority checks, periodic checks and the daemon's post-job idle heartbeat. For batches, count individual SQL operations and rows, not just HTTP envelopes.

D1 bills rows scanned and changed, including index writes. HTTP batching does not itself reduce those rows. Free allows 50 D1 queries per invocation and 10 milliseconds of Worker CPU. Both constrain batch size. Measure SQL count, rows_read, rows_written, bytes and CPU before selecting limits. See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [Workers limits](https://developers.cloudflare.com/workers/platform/limits/). Reserve explicit headroom for users, preview runs, robots, moderation and failures.

### Decision matrix

| Option | Saving | System cost or failure risk | Recommendation for review |
| --- | --- | --- | --- |
| Empty-queue backoff, bounded jitter and activity-aware liveness | Fewer empty scans and idle writes | New-job latency and slower idle-node detection | First candidate. Coordinator supplies the schedule. Combine liveness with useful calls only if semantics remain clear. |
| Small batches of ready, short-lived leases | Fewer claim/result HTTP envelopes | Atomic per-job reservations, starvation, partial completion and payload/CPU limits | Second candidate. Persist receipts per job. Reserve origin budgets before fetching, including across nodes. |
| Future assignment hints with short execution authorization | Fewer scheduling exchanges | Hints are not fetch grants. Activation/check calls still have a cost. | Compare against short batches. Do not reserve one origin for hours merely to reduce calls. |
| One-to-two-hour unattended work grants | Fewer authority checks | Stale robots/profiles, delayed revocation, coordinator-loss detection and slow reassignment | Critical owner decision. Incompatible with current fail-closed behavior if treated as offline permission. |
| Delayed result batches | Fewer upload envelopes | Current leases expire first. Restart, lost ACK, quota and partial-batch recovery remain open. | Depends on R15-C17 outbox and a reviewed late-result contract. No unbounded raw-data buffer. |
| Conditional requests and adaptive revisits | Fewer downloaded bytes and less unchanged content | Validators need per-source support and correctness checks | Preserve existing If-None-Match/If-Modified-Since behavior. Measure response bytes. A 304 still uses a request. |
| Cloudflare Queues | Durable dispatch and delivery retries | Adds message operations, retention limits and another recovery boundary | Optional comparison, not an automatic replacement for D1 scheduling. Queue visibility is not crawler authorization. |

Queues Free includes 10,000 operations daily and 24-hour retention. A typical small message needs write, read and delete operations. Batch delivery does not discount those per-message operations. [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/). Pull consumers support delivery leases and redelivery, but these do not check source profiles, robots or origin reservations. Keep Cloudflare account tokens off crawler nodes. See [pull consumers](https://developers.cloudflare.com/queues/configuration/pull-consumers/).

First measure the current workload. Then compare backoff, short batches and Queues with the same source rules and backlog. Bound batch items, encoded bytes, SQL count, execution time and node disk usage. Give every item an idempotency key and explicit receipt or retry status. Jitter node wake times and source revisits. Do not let a burst bypass network-wide origin pacing.

Critical owner choices: maximum coordinator-loss/revocation delay, acceptable discovery and upload latency, outbox disk/retention budget, and account headroom. A six-hour outbox can save upload calls, but cannot satisfy current live-lease acceptance unchanged. Verification at G16 must include ten-node schedules, concurrent origin reservations, expiry, clock skew, offline/restart, lost ACK, partial batches and quota exhaustion. No remote quota measurement or fleet runtime test ran in this audit.
