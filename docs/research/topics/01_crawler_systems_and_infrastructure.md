# Crawler infrastructure resource library

Reviewed 2026-10-03 against HEAD `3b9d203`. External guidance is not proof that this repository implements it. See the [capability audit](../audits/PROTOTYPE_PARITY.md) for code evidence and the [library guide](04_curriculum_and_core_philosophies.md) for review rules.

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

The owner wants a Worker coordinator, separate headless crawler nodes, and downstream operator/user/app bindings. A message broker is optional infrastructure, not a replacement for leases, source profiles, origin budgets or idempotent submission. Do not add one until a measured failure requires it.

Prefer existing platform primitives and maintained dependencies. Compare caller requirements, runtime support, bundle cost, license, failure behavior and deletion opportunities before adding an abstraction. The [dependency review](../CRAWLER_DEPENDENCY_RESEARCH.md) distinguishes parsers from competing schedulers.

Remove unsupported estimates from decisions: requests per second, memory use, deduplication accuracy and cloud cost need a measured workload and a dated product limit. The former tutorial's fixed performance numbers and claims that local tests proved fleet safety are withdrawn.

## Further reading, not yet implementation authority

- [Percolator publication search](https://research.google/search/?query=Percolator): the previously linked USENIX page could not be retrieved in this review. Obtain the primary paper before borrowing its transaction model.
- [awesome-crawler](https://github.com/brucedone/awesome-crawler): a discovery index, not a security review or package recommendation.
- [Historical spikes](../SPIKES.md): dated experiments, not current deployment evidence.

Local runtime claim races now pass. See [the active tracker](../../scratch/task_tracker.md) for measured results and remaining gates. Remote deployment and broad live crawling remain unverified.

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
