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

## Worker and npm distribution boundaries

Review date: 2026-10-03. Cloudflare supports monorepos and shared packages. Its configured root controls the build working directory. Cross-folder source imports are not categorically forbidden. They still require correct dependency installation and ownership. The reported build failure needs its logs and root settings. [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [monorepo setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/).

| Boundary | Current evidence | Required distribution outcome |
| --- | --- | --- |
| Public operator/user/app contracts | SDK builds JavaScript/declarations. A separately installed tarball passes Node and native Worker tests. Profile path/query/evidence checks now share one definition. | Release an approved package version, then consume its exports through declared dependencies. No downstream TypeScript source execution. |
| Internal node leases and capabilities | Worker handlers import node_protocol.ts and capability_token.ts from the crawler tree. These are operational contracts, not consumer SDK features. | Settle a separate internal package or service-owned contract location. Do not publish the node runner through the consumer SDK. |
| Source access and robots | Worker imports shared policy, snapshots and retrieval constants. The SDK validates public profile input. Coordinator policy adds private-IP denial and live authority checks. | Keep operational checks separate from public DTOs. A valid SDK payload does not authorize fetching. |
| Catalog projection | Worker imports taxonomy, avatar compatibility and the crawler sanitizer. The sanitizer imports the advisory IANA registry. | Settle pure projection ownership without copying algorithms or importing node I/O into Workers. Check reachable behavior, not only import names. |
| Deployment consumer | src-web has no SDK dependency. Some Worker imports target SDK source directly. The node uses an existing file dependency. | Prove clean installation and a Worker build without sibling source or sibling node_modules after ownership and release decisions. |

npm runs prepack before packing or publishing. The SDK uses it to build clean output. Local directory dependencies help offline development but do not prove registry delivery. [npm lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/), [local dependency behavior](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#local-paths).

No registry publication or production deployment occurred. Package identity, version, license and internal-contract placement remain open owner decisions.
