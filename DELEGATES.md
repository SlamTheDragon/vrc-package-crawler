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

Packed installation checks cover ordinary Node, TypeScript declarations and a separate Worker consumer. These checks do not prove npm registry availability.

```typescript
import { VrcPackagesClient } from "vrc-packages-api";

const publicClient = new VrcPackagesClient({
  baseUrl: "https://coordinator.example.com"
});

const appClient = new VrcPackagesClient({
  baseUrl: "https://coordinator.example.com",
  appToken: applicationCredential
});

const userClient = new VrcPackagesClient({
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

Search uses SQL text matching and classification heuristics. Dynamic indexed tag lists, full-text ranking and publisher-date semantics remain open. Random sampling is removed.

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
