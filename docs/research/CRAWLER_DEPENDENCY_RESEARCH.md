# Crawler Library Candidates from awesome-crawler

Status: Initial research only (2026-09-28). The project owner gave [awesome-crawler](https://github.com/brucedone/awesome-crawler), a cross-language list. It is a discovery index. It does not prove that a listed library obeys source policies or fits the coordinator and node split. No new package is installed or authorized for live use.

| Candidate | Features | Fit Against This Repository | Decision |
| --- | --- | --- | --- |
| Existing `cheerio`, `zod`, and `@trybyte/robotstxt-parser` | Used for HTML extraction, API boundary validation, and RFC-mode robots matching. | Small, separate primitives fit the node parser and Worker protocol boundary. Keep testing exact behavior and do not clone library functions. | **Keep**. Improve adapters and tests instead of inventing another parser or validator. |
| [Crawlee (JS)](https://github.com/apify/crawlee) | TypeScript and Node crawler framework with request queues, storage, scheduling, retries, Cheerio, and optional browser crawling. The README shows automatic link extraction, proxy features, and browser-like headers. The [quick start](https://crawlee.dev/js/docs/quick-start) targets Node. | It can remove single-process crawler plumbing. But its queue, storage, retry, and fetch defaults compete with coordinator-issued leases, origin pacing, policy reviews, pinned-DNS egress, and versioned DTOs. A developer must prove these behaviors stay controllable before adoption. Browser and proxy evasion is not an authorized goal. Worker portability and Bun compiled binary behavior require a spike. | **Research a narrow adapter spike**, not wholesale adoption. Measure removed code, bundle size, cancellation behavior, and compliance with coordinator policies and safe transport. |
| [node-crawler](https://github.com/bda-research/node-crawler) | Node request queue, Cheerio integration, configurable local `rateLimit`, retries, and duplicate skipping. The README documents optional user-agent and proxy rotation. | Local rate limiting cannot replace network-wide pacing across nodes. Its request scheduler can dispatch work outside coordinator leases. Parsing overlaps installed Cheerio. | **Do not replace coordinator scheduling**. Revisit only if a bounded, non-autonomous parsing use case appears. |
| [Supercrawler](https://github.com/brendonboshell/supercrawler) | Describes custom handlers, robots, rate, and concurrency handling. | Features overlap existing controls. An independent per-process robots or rate decision violates shared SQLite coordinator invariants. Maintenance, Bun support, exact URL overrides, and safe transport require direct tests. | **Research only**. No dependency change. |

The evaluation does not compare frameworks to custom code generally. A package is attractive when it replaces a domain-neutral primitive without moving source authority from coordinator to node.

The coordinator must continue to decide which exact URL a node can fetch, when, and under which active profile, robots snapshot, and lease. The node must validate the versioned API payload, check its lease during egress, and use pinned HTTPS transport. Any candidate that follows links, retries challenges, rotates identities or proxies, or stores raw pages needs a deny-by-default configuration and fixture proof.

### Suggested Offline Spike
Wrap one candidate parser or execution component around a mock transport for one approved VPM listing fixture. Check for:
1. Zero unleased requests.
2. Zero redirects.
3. Zero automatic queuing.
4. Bounded byte consumption.
5. Cancellation on lost coordinator authority.
6. Zero per-node rate decisions that override the coordinator.
7. Identical Zod result DTOs.

Compare dependency trees and compiled bundle sizes against the current implementation. If the candidate requires more integration code than it removes, keep the existing narrow primitives.
