# Downstream and Node Operator Runbook

This runbook describes the current pre-production interfaces. It does not establish source permission or production readiness.

## 1. Runtime Ownership

| Component | Location | Current role |
| --- | --- | --- |
| API coordinator | `src-worker/src/worker_entry.ts` | Worker API and D1. Local tests use Wrangler/workerd, not a coordinator binary. |
| Crawler node | `src-crawler/src/main.ts` | Separate headless process. It fetches only under coordinator leases. |
| Consumer SDK | `src-package/`, package `vrc-packages-api` | Public operator/user/app contracts and typed client. Registry publication remains open. |
| Website | `src-web/` | Astro/Svelte starter. SDK, authentication and panels are not integrated. |
| Desktop client | `src-crawler-client/` | Tauri/Svelte starter. Node bundling and supervision are not integrated. |

Worker tests live in `src-worker/test/`. Its support folder contains the test-only SQLite comparator. The production Worker still imports some crawler contracts. Independent dependency delivery remains unfinished.

## 2. SDK Integration

Historical packed installation checks covered ordinary Node, TypeScript declarations and a separate Worker consumer before the recent changes. They do not verify the current artifact or npm registry availability. G15 still requires package checks and the owner's complete API review.

```typescript
import { VRCPackageClient } from "vrc-packages-api";

const publicClient = new VRCPackageClient({
  baseUrl: "https://coordinator.example.com"
});

const appClient = new VRCPackageClient({
  baseUrl: "https://coordinator.example.com",
  appToken: applicationCredential
});

const userClient = new VRCPackageClient({
  baseUrl: "https://coordinator.example.com",
  userToken: userCredential
});
```

Protect credentials. Do not log issuance responses or embed the operator secret in browser assets. User token issuance and Firebase integration are not public HTTP capabilities.

### App Registration and Owned Views

`client.app.register` requires a user or operator credential. Anonymous registration fails. User-authenticated creation records app ownership. Operator-created apps remain unowned.

```typescript
const registration = await userClient.app.register({
  schemaVersion: 1,
  appName: "MyVrcPackageManager",
  description: "VRChat package discovery"
});
// Store registration.appToken securely. Do not log it.

const ownedApps = await userClient.user.apps.list({ limit: 50 });
const ownedApp = await userClient.user.apps.get(registration.appId);
```

User app collections are read-only. User node list/detail views remain pending because operator provisioning does not record user ownership.

### Catalog and Search

```typescript
const catalog = await publicClient.index.query({ limit: 25 });
if (catalog.nextCursor !== null) {
  const nextPage = await publicClient.index.query({ limit: 25, cursor: catalog.nextCursor });
}
const search = await appClient.index.search({
  query: "PhysBones",
  queryOrigin: "user_authored",
  umbrella: "tools",
  limit: 25
});
const deltaPage = await publicClient.index.syncDeltas({ limit: 100 });
```

The SDK exposes `index`, not `catalog` or `app.search`. Public index pages accept only `limit` and `cursor`. The default limit is 50, with integer values from 1 through 100. The SDK returns the validated `schemaVersion`, `packages` and `nextCursor` fields, without a total count. A null cursor ends pagination. Search filters belong to authenticated `index.search`. Save delta cursors and handle the returned catalog epoch.

Search uses SQL text matching and classification heuristics. The Worker accepts queryOrigin but does not record or apply attribution in storage. Dynamic indexed tag lists, full-text ranking and publisher-date semantics remain open. Random sampling is removed.

### Reports and Removal Requests

```typescript
const receipt = await appClient.reports.submit({
  schemaVersion: 1,
  reportType: "removal_request",
  targetUrl: "https://publisher.example/products/avatar",
  reason: "Publisher requests review of this listing"
});
```

The route is singular `/v1/app/report`. Removal returns HTTP 202 and a pending record. It does not delist, suppress crawling or create demand. Demand and issue reports return HTTP 200. An accepted receipt means recorded, not verified ownership or approved removal. DNS/bio challenge verification and removal review controls remain unfinished.

## 3. Crawler Node Operation & Fleet Management

The coordinator issues node credentials through `/v1/operator/nodes`. A token encodes platform capabilities. Queue entries still need scoped source approval and valid robots evidence before a lease.

The node entry supports runtime identity and paths through its configuration and environment. `NODE_TOKEN` carries the secret separately. See [the node specification](docs/source/SPECIFICATION_CRAWLER_CLIENT.md) for the current execution boundary.

Docker files live in `src-crawler/`. Inspect the configuration before starting containers:

```bash
docker compose -f src-crawler/docker-compose.yml config
```

The compose file includes Watchtower with the host Docker socket. It is not a verified safe update workflow. Its image name differs from the workflow's publication name. Inspect and settle image trust, update timing, persistence and credential handling before fleet use.

`.github/workflows/node-docker.yml` defines image publication on qualifying main pushes, version tags and manual dispatch. It targets `ghcr.io/<repository-owner>/vrcp-crawler-node`. Successful CI publication, Linux startup and restart-safe submission remain unverified. Watchtower does not guarantee uninterrupted leases or result recovery.

## 4. API and Deployment References

Use [API_ROUTES.md](docs/source/API_ROUTES.md) with the current handlers and SDK schemas. Planned routes are not runnable endpoints. `/v1/user/delist`, user collection POSTs and `/v1/app/index/random` are absent. Node result submission uses `/v1/node/jobs/result`.

Use [the Cloudflare setup checklist](docs/research/CRAWLER_DEPENDENCY_RESEARCH.md#cloudflare-panel-setup-checklist) for the owner-completed folder split. The latest supplied build log confirms the API package `src-worker` ran remotely. `src-web` is the separate static site, not the API build root.

LEGAL.md states draft covenants, not measured implementation. Terms headers are not uniformly emitted by every handler. No remote build, deployment, source permission or legal compliance is inferred from this runbook.

## 5. Version Metadata and Explicit Setup

The root version files supply product versions. Release versions use standard SemVer. Preview versions use the pre prerelease label, such as 2026.10.0-pre. API schemaVersion values do not change with a product version.

Install root tool dependencies with bun install. There is no root install hook that installs the five projects. Run bun run setup explicitly for developer setup. This does not prove independent installation: current sibling imports and SDK file links remain G13 failures. Do not use this setup sequence as a remote CI workaround.

The version commands do not install, build, tag, publish or deploy:

```sh
bun run versions:sync:release
bun run versions:sync:preview
bun run versions:check:release
bun run versions:check:preview
# Select one product instead of all five:
node scripts/versioning.mjs sync release crawler
```

Sync changes selected package manifests and the desktop Cargo package version. It preserves SDK publication protection and dependency declarations. It checks all config values before writing. File-write failures can leave partial edits, so inspect the diff before a release. Check reports drift without changing files. These commands remain unverified until the G14 checkpoint.

The node --version command and user-agent read its local manifest. Worker structured logs include the local Worker version. Frontend metadata reads each frontend's local manifest. Tauri reads its local package.json through [the supported version-path setting](https://v2.tauri.app/reference/config/#version). No product reads another src-* source file for version metadata. Existing unrelated cross-project imports remain unresolved.

Product tag names and release-event routing remain deferred. Root publish/preview/bump placeholders are not release implementations. Cloudflare panel setup remains an owner task. SDK registry publication requires G15 verification and complete owner API review, regardless of the configured version.

### Local Product Builds

Root build commands check the selected product's manifest against the chosen version config before its local build. They do not sync versions, bump, tag, publish or deploy. Node.js and root tool dependencies are required. Install product dependencies separately. These commands remain unrun under G14.

| Product | Release command | Preview command |
| --- | --- | --- |
| Crawler, host target | `bun run build:release:crawler` | `bun run build:preview:crawler` |
| Crawler, Linux target | `bun run build:release:crawler:linux` | `bun run build:preview:crawler:linux` |
| Desktop client | `bun run build:release:crawler-client` | `bun run build:preview:crawler-client` |
| Consumer SDK | `bun run build:release:package` | `bun run build:preview:package` |
| Static website | `bun run build:release:web` | `bun run build:preview:web` |
| API Worker | `bun run build:release:worker` | `bun run build:preview:worker` |

Preview selects metadata, not a Cloudflare Preview or deployed environment. Worker builds use the project's Wrangler dry-run command. Local build routing does not change CI triggers or establish independent artifact installation.

### Explicit Worker Deployment — Not Yet Ready to Run

The root command bun run deploy:release:worker checks release metadata, then calls the Worker's deploy script with wrangler.toml. Unlike build:release:worker, this command changes the remote deployment. It targets the top-level Worker, not a named production environment. No command ran during implementation.

Before use, finish dependency isolation, gate checks, account/resource review, secret setup and deployment approval. Disconnect automatic main-push Builds in the Cloudflare panel. Local scripts cannot change that setting. Do not run the command as a readiness check.

Default and Preview D1 configuration now use the same logical VRCP_D1 binding. Their database IDs remain distinct and unchanged. The entry point does not consume VRCP_PREVIEW_D1. [Cloudflare requires matching binding names with preview-safe resources](https://developers.cloudflare.com/workers/previews/configuration/#what-goes-in-the-previews-block).

No Preview deployment command or activation occurred. Review Preview secrets, public URL access, database sharing/migrations and existing-project migration before enabling it. Multiple branches can share a configured Preview database. A metadata preview build does not test that resource boundary.
