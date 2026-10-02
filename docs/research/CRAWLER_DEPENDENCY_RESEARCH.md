# Crawler dependency selection

Review checkpoint: 2026-10-03. The owner supplied [awesome-crawler](https://github.com/brucedone/awesome-crawler). It is a discovery index, not evidence that its packages satisfy this architecture. No new dependency was installed during this review.

## Keep, research or reject

| Primitive or candidate | Evidence | Decision and reason |
| --- | --- | --- |
| Existing Cheerio, Zod, semver and @trybyte/robotstxt-parser | Current src-crawler manifest and parser/protocol call paths | Keep narrow parsing/validation primitives. Test canonical SemVer and RFC-mode matching rather than duplicating them. Network retrieval and policy remain project responsibilities. |
| [Crawlee](https://github.com/apify/crawlee) | Historical README/quick-start review | Research only if a narrow component removes code. Its queues, retries, storage and automatic link traversal must not compete with coordinator authority. Node/Bun compatibility and bundle impact need tests. |
| [node-crawler](https://github.com/bda-research/node-crawler) | Historical README review | Do not adopt its scheduler for network-wide orchestration. Local pacing cannot enforce a fleet-wide budget; HTML parsing overlaps Cheerio. |
| [Supercrawler](https://github.com/brendonboshell/supercrawler) | Historical README review | Research only. Check maintenance, license, runtime support, transport control and code removed before adoption. |
| Native Workers/D1 and runtime HTTP APIs | [Infrastructure library](topics/01_crawler_systems_and_infrastructure.md) | Prefer supported runtime capabilities to custom coordinator binaries or compatibility wrappers. Prove storage atomicity separately. |

## Adoption test

Compare maintained releases, security history, license, transitive dependencies, runtime support and the code that can be deleted. Historical README claims are not current package guarantees; verify upstream sources before selection.

Use a mock transport and one bounded fixture. Prove zero unleased requests, no automatic traversal, safe redirect handling, bounded bodies, cancellation on authority loss, coordinator-owned rates and unchanged versioned DTOs. Disable raw-page archives and evasion features.

Measure integration code, bundle size and failure behavior against the existing path. If integration adds more machinery than it removes, retain the narrow primitive. A dependency is not a substitute for a source-access profile or publication review.

Current priority is correcting verified protocol/storage defects, not replacing the crawler with a second autonomous scheduler.
