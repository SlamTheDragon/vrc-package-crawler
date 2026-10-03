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

Review date: 2026-10-03. Cloudflare supports monorepos and shared packages. Its configured root controls the build working directory. Cross-folder source imports are not categorically forbidden. They still require correct dependency installation and ownership. [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [monorepo setups](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/).

Owner-provided build evidence: src-web/vrc-package-crawler.production.21d89f30-207f-4c95-b23b-56aaf01cf88a.build.log. At 2026-10-03T10:51:52Z, Wrangler stops with 15 resolution errors: ten zod imports and five vrc-packages-api imports from sibling crawler/SDK source. The web install succeeds and generated Worker types pass first. Its dependencies include zod but not the SDK. This is a dependency-root/distribution failure, not evidence that Cloudflare cannot build monorepos. A local installation in every sibling hides it. Do not mark dependencies external or add sibling install/path workarounds as the production fix.

Secondary findings: the Svelte prepare hook reports overwritten types; it does not stop installation because the command masks failure. No src-web lockfile is tracked in the inspected worktree, and the log resolves/saves a new lockfile. Remote Bun is 1.2.15 versus local 1.4.2. The log's SDK-backed VPM helper predates the current local move-back; the dependency-root issue remains despite that cleanup. Reproducible install/tool versions and separate dev/staging/prod bindings belong to the build/release gate, not this diagnostic check.

| Boundary | Current evidence | Required distribution outcome |
| --- | --- | --- |
| Public operator/user/app contracts | SDK builds JavaScript/declarations. A separately installed tarball passes Node and native Worker tests. Profile path/query/evidence checks now share one definition. | Release an approved package version, then consume its exports through declared dependencies. No downstream TypeScript source execution. |
| Internal node leases and capabilities | Worker handlers import node_protocol.ts and capability_token.ts from the crawler tree. These are operational contracts, not consumer SDK features. | Settle a separate internal package or service-owned contract location. Do not publish the node runner through the consumer SDK. |
| Source access and robots | Worker imports shared policy, snapshots and retrieval constants. The SDK validates public profile input. Coordinator policy adds private-IP denial and live authority checks. | Keep operational checks separate from public DTOs. A valid SDK payload does not authorize fetching. |
| Catalog projection | Worker owns taxonomy and avatar compatibility under domain/classification. The crawler sanitizer remains a cross-folder import and imports the advisory IANA registry. | Keep projection policy in the coordinator. Settle remaining pure helper ownership without copying algorithms or importing node I/O into Workers. |
| Deployment consumer | src-web has no SDK dependency. Some Worker imports target SDK source directly. The node uses an existing file dependency. | Prove clean installation and a Worker build without sibling source or sibling node_modules after ownership and release decisions. |

npm runs prepack before packing or publishing. The SDK uses it to build clean output. Local directory dependencies help offline development but do not prove registry delivery. [npm lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts/), [local dependency behavior](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#local-paths).

No registry publication or production deployment occurred. Package identity, version, license and internal-contract placement remain open owner decisions.

## Cloudflare panel setup checklist

Owner context: pushes to main trigger Cloudflare Builds with src-web as the project root. The dashboard settings were not inspected directly. These are setup suggestions, not completed configuration or permission to deploy.

### Build and dependency settings

In Workers & Pages, select the API Worker. Open Settings > Build.

| Setting | Suggested value or action | Prerequisite |
| --- | --- | --- |
| Repository and branch control | Keep the connected repository and main trigger for the current non-live target. | Every qualifying main push can deploy. A documentation commit is not inherently deployment-free. |
| Root directory | src-web | Keep API Worker entry src/worker/worker_entry.ts. Do not select Svelte output or the crawler root. |
| Build command | Current npm run build checks types and bundles without deployment. Add npm run check before it in the release gate. | A passing local build with sibling dependencies does not prove isolation. |
| Deploy command | Confirm the panel value. Standard API-only deployment uses npx wrangler deploy --autoconfig=false. | Use the project-local, locked Wrangler. The build command's dry-run does not deploy. |
| Build watch paths | Keep the default all-files trigger during dependency separation. | Do not limit changes to src-web while sibling code remains reachable. |
| Build variables | Pin BUN_VERSION and NODE_VERSION to versions tested together. Current local Bun is 1.4.2. | Select and test the Node version explicitly. The supplied remote log used Node 24.18.0. |
| Registry authentication | Add a read-only npm token as a build secret only if the approved package requires private access. | Do not place a publish token or runtime operator credential in build logs or source. |

Cloudflare separates build and deploy commands. The root controls the working directory. [Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Build watch paths use repository paths, separate from the project root. Include every reachable dependency until isolation passes. [Watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).

BUN_VERSION and NODE_VERSION select build-image tool versions. [Build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

Before the next release, publish the owner-approved SDK identity, version and license through its own release process. Add that released package to src-web dependencies. Replace direct SDK source imports with exported package imports. Do not publish unresolved internal node contracts through the consumer SDK.

Commit a src-web lockfile after dependency ownership is correct. Require a frozen installation from that lockfile. Remove the unrelated, failure-masking Svelte prepare hook through a separate API-only cleanup. Prove installation, typecheck and bundling from a clean checkout without sibling node_modules. Adding aliases or installing the crawler in Cloudflare is not the accepted distribution solution.

### Runtime and environment settings

Set OPERATOR_TOKEN in the selected Worker's runtime Variables & Secrets. A build secret does not become a runtime secret. Keep deployment credentials, registry credentials and operator credentials separate. [Build versus runtime settings](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Keep the binding name DB consistent with the Worker. Select the intended D1 database in versioned configuration. Current default and preview configurations share one database ID. remote=false supports local testing. It does not create an isolated deployed database.

Before production, create distinct staging and production Workers, databases and operator secrets. Define each environment's bindings explicitly. Wrangler bindings and secrets are not inherited across environments. [Environments](https://developers.cloudflare.com/workers/wrangler/environments/).

Suggested future workflow: local tests first, then main pushes deploy only to staging. Promote a tested commit through a separately approved production path. The owner must select that promotion path. Keep current main automation unchanged until the corresponding Worker configuration and panel targets agree.

Disable branch preview deployments until their data, secrets and access controls are reviewed. Do not switch an existing project to a new preview model without review. Cloudflare documents an irreversible switch for some existing projects. [Branch controls](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).

Schema migrations need a separate reviewed release step. Do not automatically initialize or seed production data on each main push. Record the commit, package versions, build result and target database before release. Keep a database recovery plan separate from Worker code rollback.

Open checks: isolated dependency installation, clean remote build, supported observability configuration, database query budgets, migration tooling, environment isolation and staging smoke tests. Panel changes alone cannot close these gates.
