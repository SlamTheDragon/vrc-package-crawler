# Crawler dependency selection

Review checkpoint: 2026-10-03. The owner supplied [awesome-crawler](https://github.com/brucedone/awesome-crawler). It is a discovery index, not evidence that its packages satisfy this architecture. No new dependency was installed during this review.

## Keep, research or reject

| Primitive or candidate | Evidence | Decision and reason |
| --- | --- | --- |
| Existing Cheerio, Zod, semver and @trybyte/robotstxt-parser | Current src-crawler manifest and parser/protocol call paths | Keep narrow parsing/validation primitives. Test canonical SemVer and RFC-mode matching rather than duplicating them. Network retrieval and policy remain project responsibilities. |
| [Crawlee](https://github.com/apify/crawlee) | Historical README/quick-start review | Research only if a narrow component removes code. Its queues, retries, storage and automatic link traversal must not compete with coordinator authority. Node/Bun compatibility and bundle impact need tests. |
| [node-crawler](https://github.com/bda-research/node-crawler) | Historical README review | Do not adopt its scheduler for network-wide orchestration. Local pacing cannot enforce a fleet-wide budget; HTML parsing overlaps Cheerio. |
| [Supercrawler](https://github.com/brendonboshell/supercrawler) | Historical README review | Research only. Check maintenance, license, runtime support, transport control and code removed before adoption. |
| Native Workers/D1 and runtime HTTP APIs | [Infrastructure library](01_crawler_systems_and_infrastructure.md) | Prefer supported runtime capabilities to custom coordinator binaries or compatibility wrappers. Prove storage atomicity separately. |

## Adoption test

Compare maintained releases, security history, license, transitive dependencies, runtime support and the code that can be deleted. Historical README claims are not current package guarantees; verify upstream sources before selection.

Use a mock transport and one bounded fixture. Prove zero unleased requests, no automatic traversal, safe redirect handling, bounded bodies, cancellation on authority loss, coordinator-owned rates and unchanged versioned DTOs. Disable raw-page archives and evasion features.

Measure integration code, bundle size and failure behavior against the existing path. If integration adds more machinery than it removes, retain the narrow primitive. A dependency is not a substitute for a source-access profile or publication review.

Current priority is correcting verified protocol/storage defects, not replacing the crawler with a second autonomous scheduler.

## Worker and npm distribution boundaries

Review date: 2026-10-03. Cloudflare supports monorepos and shared packages. Its configured root controls the build working directory. Cross-folder source imports are not categorically forbidden. They still require correct dependency installation and ownership. [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [monorepo setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/).

The earlier owner log, production.21d89f30, recorded a failure under the former src-web API root. That local log is no longer present. At 2026-10-03T10:51:52Z, Wrangler stopped with 15 resolution errors: ten zod imports and five vrc-packages-api imports from sibling crawler/SDK source. Dependency installation and generated Worker types passed first. That manifest included zod but not the SDK. This is a dependency-root/distribution failure, not evidence that Cloudflare cannot build monorepos. A local installation in every sibling hides it. Do not mark dependencies external or add sibling install/path workarounds as the production fix.

Historical findings: the former API project's Svelte prepare hook masked a types warning. The log resolved a new lockfile, with remote Bun 1.2.15 versus local 1.4.2. The owner then split the API into src-worker and replaced src-web with an Astro site. The API no longer has that Svelte prepare hook. Commit b438a8d removed tracked lockfiles and added *.lock to .gitignore. Preserve that policy. Repeatable dependency resolution remains unresolved, not silently repaired. The log's SDK-backed VPM helper also predates its move back to the crawler.

The later log, src-worker/vrc-package-crawler.production.dbb64f2f-504b-4ac5-a0ac-640f0285d77f.build.log, confirms the src-worker package ran remotely. At 2026-10-03T11:58:52Z, npm run build executes only the placeholder echo. The deploy command then fails with 16 unresolved imports: zod (8), SDK (4), SemVer subpaths (3) and robots parser (1). It also reports unsupported previews.observability.issue_detection. Remote Bun/Node remain 1.2.15/24.18.0. Local script, parser-dependency and warning repairs do not prove sibling dependency resolution or a successful remote deployment.

| Boundary | Current evidence | Required distribution outcome |
| --- | --- | --- |
| Public operator/user/app contracts | SDK builds JavaScript/declarations. A separately installed tarball passes Node and native Worker tests. Profile path/query/evidence checks now share one definition. | Release an approved package version, then consume its exports through declared dependencies. No downstream TypeScript source execution. |
| Internal node leases and capabilities | Token generation now lives in Worker domain/security. Operational profiles live in domain/access. Node lease contracts remain genuinely cross-runtime under crawler shared/protocol. | Settle distribution for shared lease contracts. Physical ownership is not isolated installation. Do not publish the node runner through the consumer SDK. |
| Source access and robots | Worker imports shared policy, snapshots and retrieval constants. The SDK validates public profile input. Coordinator policy adds private-IP denial and live authority checks. | Keep operational checks separate from public DTOs. A valid SDK payload does not authorize fetching. |
| Catalog projection | Worker owns classification. Its title/URL imports now use a pure shared/text module with zero imports. README/author/IANA work remains crawler-only. | Keep projection policy in the coordinator. Do not claim live IANA refresh or import node I/O into Workers. Check the final graph at the gate. |
| Deployment consumer | Worker production consumer contracts now import SDK package exports directly. No approved SDK dependency is declared. Shared internal modules still use sibling source. The Astro site is not yet an SDK consumer. | Prove clean installation and a Worker build without sibling source or sibling node_modules after ownership and release decisions. Direct imports alone do not fix deployment. |

npm runs prepack before packing or publishing. The SDK uses it to build clean output. Local directory dependencies help offline development but do not prove registry delivery. [npm lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/), [local dependency behavior](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#local-paths).

No registry publication or production deployment occurred. Package identity, version, license and internal-contract placement remain open owner decisions.

R49 public index parity passes through the real handler and installed SDK. Other schema imports are not interchangeable yet. SDK lead approval/rejection defaults omitted reasons, but Worker requests require reasons. SDK lead responses accept camel/snake input through preprocessing. Worker lead rows require the strict snake-case wire form. Add differential fixtures before removing wrappers. Preserve coordinator-only private-IP denial and profile matching.

The prior local bundle contained three physical Zod installations and top-level JSON-schema conversion. New ownership edits remain unverified. Measure size and startup separately from runtime correctness at the gate. Do not distribute the whole crawler merely to satisfy Worker imports.

See [capacity and authentication research](01_crawler_systems_and_infrastructure.md#d1-capacity-and-authentication-research) for the owner's four-database scenario. Account-wide quotas, paid allowances and cache consistency require separate review from package distribution.

## Cloudflare panel setup checklist

Owner context: main pushes trigger Cloudflare Builds. The owner completed the API/static-site split. The latest log confirms src-worker ran, so an old root is no longer the diagnosed blocker. Keep src-worker as the API root. The panel was not inspected directly. These are setup suggestions, not completed settings or permission to deploy.

### Build and dependency settings

In Workers & Pages, select the API Worker. Open Settings > Build.

| Setting | Suggested value or action | Prerequisite |
| --- | --- | --- |
| Repository and branch control | Keep the connected repository and main trigger for the current non-live target. | Every qualifying main push can deploy. A documentation commit is not inherently deployment-free. |
| Root directory | src-worker | API entry is src/worker_entry.ts. src-web now builds the separate static site. |
| Build command | Use npm run check followed by npm run build. The repaired build script bundles the API with --dry-run. | The earlier placeholder echo did not test the bundle. A local build with sibling dependencies does not prove isolation. |
| Deploy command | Confirm the panel value. Standard API-only deployment uses npx wrangler deploy --autoconfig=false. | Use the project-local Wrangler and settle version reproducibility. The dry-run does not deploy. |
| Build watch paths | Keep the default all-files trigger during dependency separation. | Do not watch only src-worker while crawler/SDK source remains reachable. After isolation, define independent API and website watch scopes. |
| Build variables | Pin BUN_VERSION and NODE_VERSION to versions tested together. Current local Bun is 1.4.2. | Select and test the Node version explicitly. The supplied remote log used Node 24.18.0. |
| Registry authentication | Add a read-only npm token as a build secret only if the approved package requires private access. | Do not place a publish token or runtime operator credential in build logs or source. |

Cloudflare separates build and deploy commands. The root controls the working directory. [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Build watch paths use repository paths, separate from the project root. Include every reachable dependency until isolation passes. [Watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).

BUN_VERSION and NODE_VERSION select build-image tool versions. [Build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

Before release, settle SDK identity, version and license. Add an approved distribution to src-worker dependencies and replace direct SDK source imports. Do not publish internal node contracts through the consumer SDK. The website and desktop client need their own declared SDK dependency when integration starts.

The owner removed and ignored lockfiles. Do not restore them without a decision. Select a repeatable release-install strategy and tested tool versions before production. Prove installation, typecheck and bundling from a clean checkout without sibling node_modules. Adding aliases or installing the crawler in Cloudflare is not the accepted distribution solution.

### Runtime and environment settings

Set OPERATOR_TOKEN in the selected Worker's runtime Variables & Secrets. A build secret does not become a runtime secret. Keep deployment credentials, registry credentials and operator credentials separate. [Build versus runtime settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Keep the logical D1 binding VRCP_D1 consistent with the Worker in default and preview configuration. The owner selected distinct default and preview database IDs. Preserve those IDs. Distinct configuration does not prove remote isolation. remote=false supports local testing, not a new deployed database.

Before production, create distinct staging and production Workers, databases and operator secrets. Define each environment's bindings explicitly. Wrangler bindings and secrets are not inherited across environments. [Environments](https://developers.cloudflare.com/workers/wrangler/environments/).

Suggested future workflow: local tests first, then main pushes deploy only to staging. Promote a tested commit through a separately approved production path. The owner must select that promotion path. Keep current main automation unchanged until the corresponding Worker configuration and panel targets agree.

Disable branch preview deployments until their data, secrets and access controls are reviewed. Do not switch an existing project to a new preview model without review. Cloudflare documents an irreversible switch for some existing projects. [Branch controls](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).

Schema migrations need a separate reviewed release step. Do not automatically initialize or seed production data on each main push. Record the commit, package versions, build result and target database before release. Keep a database recovery plan separate from Worker code rollback.

Open checks: isolated dependency installation, clean remote build, supported observability configuration, database query budgets, migration tooling, environment isolation and staging smoke tests. Panel changes alone cannot close these gates.
