# Crawler infrastructure resource library

Reviewed 2026-10-03 against HEAD `3b9d203`. External guidance is not proof that this repository implements it. See the [capability audit](../audits/PROTOTYPE_PARITY.md) for code evidence and the [library guide](04_curriculum_and_core_philosophies.md) for review rules.

## Select a resource by the failure under review

| Concern | Primary resource and review scope | Application here | Required evidence |
| --- | --- | --- | --- |
| API-only hosting | [Workers migration from Pages](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) — retrieved | Workers can serve APIs and assets. Pages remains a migration source; this is not proof that both configurations are interchangeable. An API service does not require a frontend. | Trace Worker entry, D1 binding, environment isolation and routing before moving code into src-web. |
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

Next implementation priority is the reproduced duplicate-claim defect. Remote deployment and broad live crawling remain outside the evidence established by this library.
