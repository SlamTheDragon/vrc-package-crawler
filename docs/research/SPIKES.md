# Research Spikes

This document consolidates technical spikes for the crawler and coordinator subsystems.

---

## 1. Cloudflare Portability Spike (2026-09-27)

This milestone uses no Cloudflare account, deployment, or remote database. This evaluation checks capacity against official documentation.

| Constraint | Current Local Slice | Implication Before Deployment |
| --- | --- | --- |
| Worker bundle | `bun run build:worker` produces a 190.86 KB browser-target `handler.js` from the portable `Request → Response` core. | Build success does not prove runtime compatibility. A Wrangler local runtime test and a staging test remain necessary. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) are 64 MiB script size, 128 MB memory, and 10 ms CPU per HTTP request on Free. Paid CPU defaults to 30 seconds and allows higher values. |
| Request body | The node API rejects payloads above 256 KiB. | This ceiling is below the [100 MB Free-plan request body cap](https://developers.cloudflare.com/workers/platform/limits/). It prevents raw-page archival through the node result route. |
| D1 catalog | Local source versions and events are SQLite rows. No public catalog bridge exists yet. | A Free-plan D1 database has a 500 MB limit and allows 50 queries per Worker invocation. Paid databases allow 10 GB and 1,000 queries per invocation. Rows have a 2 MB maximum. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) require bounded catalog reads and retention policies. The local claim loop inspects up to 100 candidates. Do not copy it into D1 without query measurements. |
| Origin lease coordination | `LocalCoordinatorStore` uses one transactional SQLite file and an origin lease row. | Distributed serialization needs a consistency model. SQLite-backed Durable Objects have storage and CPU constraints and single-object serialization. Measure [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/) with real job rates. Mapping each origin to one Durable Object is an unverified hypothesis. |
| Cost | No observed request, row read/write, stored byte, or CPU distributions exist yet. | Do not estimate bills from prototype database sizes. Collect local metrics first. Then apply [pricing](https://developers.cloudflare.com/workers/platform/pricing/) before account creation. |

The local path remains authoritative. `src-crawler/src/worker/handler.ts` has no Bun or Node imports. `src-crawler/src/worker/local_sqlite.ts` and `src-crawler/src/worker/main.ts` (target layout `worker/main.ts`) are local adapters. A Cloudflare storage adapter, Wrangler simulation, and staging deployment are not implemented.

---

## 2. Local Multi-Process Lease and Idempotency Spike (2026-09-27)

Coordinator claim, submit, suppression, and seed operations read state before writing state. [SQLite transaction documentation](https://sqlite.org/lang_transaction.html) explains that deferred transactions can fail when promoted to a writer under concurrency. `BEGIN IMMEDIATE` takes the write lock before the read. [Bun SQLite API](https://bun.com/docs/runtime/sqlite#transactions) exposes this operation through `transaction(...).immediate()`.

`src-crawler/src/worker/local_sqlite.ts` uses immediate transactions for origin claims, result ingestion, suppression, and seed checks. The suppression check runs inside the seed transaction. A principal carries an opaque credential generation. Claim and submit recheck this generation inside the transaction to reject rotated or revoked tokens.

### Multi-Process Verification Steps
1. Run `bun run build:coordinator`.
2. Run `bun run smoke:multi`.

The test creates a temporary SQLite file and starts two separate compiled coordinator processes against it. It sends 24 concurrent claim requests for two jobs on one origin. The coordinator issues only one lease.

Simultaneous submissions of that lease across both processes yield one new result and one idempotent duplicate. The database stores one result and one event.

When an operator suppresses an active leased URL through the CLI, submission to the other process returns HTTP 403. The coordinator does not lease the suppressed URL again. The test deletes its temporary directory. It performs zero external network fetches.

### Remaining Concurrency Work
The test proves one bounded scenario. Sustained load, crash recovery, WAL checkpoint growth, operating-system locks, and fair origin scheduling require more tests. Contention can still trigger `SQLITE_BUSY`. The adapter sets a 10-second busy timeout, but lacks a validated retry policy. See [SQLite WAL concurrency](https://sqlite.org/wal.html).

---

## 3. Robots Matching Package Spike (2026-09-27)

**Decision:** Adopt `@trybyte/robotstxt-parser@2.0.0` for RFC 9309 rule matching in the legacy helper. Retain explicit application policies for HTTP retrieval, failures, size bounds, caching, and origin scheduling.

| Responsibility | Package Evidence | Current Project State | Next Gate |
| --- | --- | --- | --- |
| Rule parsing and percent-encoded paths | [Publisher README](https://github.com/trybyte-app/robotstxt-ts-port) documents strict `rfc9309` mode, typed match evidence, and repeated-group behavior. [Package metadata](https://raw.githubusercontent.com/trybyte-app/robotstxt-ts-port/main/package.json) reports Apache-2.0 and no runtime dependencies. | `src/utils/robots.ts` compiles once per fetched file. Parity tests cover repeated groups, itch `/search`, equal specificity, and encoded paths. | Expand RFC fixtures before coordinator adoption. |
| Fetching and HTTP status | The publisher excludes network retrieval. [RFC 9309 §2.3.1.2](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.3.1.2) recommends following five redirects across hosts while applying rules to the initial host. | The legacy helper fails closed on redirects. The local coordinator uses `src/shared/robots_retrieval.ts` to follow up to five HTTPS redirects through pinned transport. It caps bodies at 512 KiB, rejects HTML or invalid UTF-8, and records results against the initial origin. The `serve` command runs a refresh batch at startup and every minute. | Test redirecting hosts and keep fail-closed transport behavior. |
| File limit and cache | The package does not fetch or cache data. | The legacy helper caps bodies at 512 KiB, rejects truncated bodies, and caches entries (24h success, 1h failure). The coordinator persists snapshots with expiry and refresh leases. | Test recovery and keep malformed responses fail-closed. |
| `Crawl-delay` and rate | [RFC 9309 §2.2.4](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.2.4) excludes crawl-delay. The parser marks crawl-delay unsupported for rule matching. | The legacy helper does not expose crawl delay. The coordinator applies an independent operator rate floor. | Treat delays as optional extensions that raise rate floors. Extra nodes must not increase origin request rates. |
| Source authorization | [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) states that robots rules do not grant access authorization. | `docs/scratch/current/SOURCE_ACCESS_AND_SAFETY.md` serves as the separate terms and retention gate. | Require an approved source profile and robots allowance for every URL. |

Package adoption requires continued fixture tests, lockfile pinning, and compiled Bun and Worker parity. Use explicit `rfc9309` mode rather than Google-compatible mode. The package has no network side effects. Test evidence includes `tests/robots_parser_package_spike.test.ts`, `tests/robots_fail_closed.test.ts`, and a 20.33 KB browser bundle from `bun build --target=browser`.
