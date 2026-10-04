# VRC Packages

VRC Packages (VRCP) is an open-source, polite discovery and indexing engine for public VRChat creator packages (Tools, Assets, Avatars).

The project develops metadata discovery from VPM repositories, GitHub and creator storefronts. Catalog records link to original publisher fronts. Real-source fleet ingestion remains a pre-production gate. The policy excludes archive and executable downloads (`.zip`, `.unitypackage`, `.vpmz`, `.fbx`).

---

## Documentation

Read repository documentation at [docs/source](docs/source).

---

## Prerequisites & Development

Use [the delivery guide](docs/source/DELIVERY.md) for config-driven builds, packed development dependencies and tagged CI paths.
Local commands do not publish or deploy. Worker preview/production routing is separate from UI artifact versions.

- **Bun** >= 1.4.0 (required for runtime, compilation, and testing)
- **Node.js** (required for root version commands and the native Worker test harness)
- **Docker** & **Docker Compose** (optional, for running crawler node fleets)

### Testing & Verification

Tests cover protocol schemas, adapters, leases and SDK methods. Passing fixtures do not prove complete fleet readiness.

```powershell
# Run root layout and contract conformance tests
bun test tests

# Run node-owned tests
cd src-crawler
bun test

# Run Worker-owned tests
cd ../src-worker
bun run test

# Run consumer SDK tests
cd ../src-package
bun test
```

Current measurements and known failures live in [the active tracker](docs/scratch/task_tracker.md). The migration does not prove isolated remote builds or live-source ingestion.

### Typechecking & Builds

```powershell
# Typecheck the crawler node
cd src-crawler
bun run typecheck

# Typecheck consumer SDK
cd ../src-package
bun run typecheck

# Build the standalone node
cd ../src-crawler
bun run build

# Check and build the API Worker without deploying
cd ../src-worker
bun run check
bun run build

# Run the isolated native D1 HTTP smoke (requires Node.js)
bun run test:runtime
```

---

## Deployment & Operations

### 1. Downstream Integration (`vrc-packages-api`)

Downstream applications can use the SDK's public contracts. No integration with VCC or `vrc-get` is claimed.

```typescript
import { VRCPackageClient } from "vrc-packages-api";

// Backend example: supply the issued credential through protected runtime configuration.
const applicationCredential = process.env.VRCP_APP_TOKEN;
if (!applicationCredential) throw new Error("Missing application credential");

const client = new VRCPackageClient({
  baseUrl: "https://coordinator.example.com",
  appToken: applicationCredential,
});

// Bounded authenticated search. Indexed dynamic tag filtering remains open.
const results = await client.index.search({
  query: "PhysBones",
  queryOrigin: "user_authored",
});

// Resumable delta synchronization for local caches
const deltas = await client.index.syncDeltas({
  limit: 100,
});
```

See [DELEGATES.md](DELEGATES.md) for full SDK documentation, registration procedures, and keyset pagination guides.

The example environment variable is a backend convention, not an SDK requirement. The Worker accepts queryOrigin but does not record or apply search attribution. Do not treat that field as implemented attribution or auditing.

### 2. Running Crawler Nodes via Docker

The node has a Dockerfile and a proposed fleet configuration. Image publication, restart recovery and automatic updates remain unverified.

```bash
docker compose -f src-crawler/docker-compose.yml config
```

Review the [Docker runbook](DELEGATES.md#3-crawler-node-operation--fleet-management) before starting containers. The compose file grants Watchtower access to the host Docker socket.

### 3. Cloudflare Build Setup

The owner moved the API build root from `src-web` to `src-worker`. The latest supplied build log confirms the `src-worker` package ran remotely. `src-web` now builds the separate static site.

Use the [panel setup checklist](docs/research/CRAWLER_DEPENDENCY_RESEARCH.md#cloudflare-panel-setup-checklist). Dependency distribution, repeatable installation and environment isolation remain release gates. No panel configuration is inferred from local files.

---

## Legal & Compliance Covenants

The Project operates under strict technical and legal covenants to safeguard creator rights and target infrastructure:

- **Zero-Binary Invariant**: The crawler never fetches, stores, or mirrors binary archives (`.unitypackage`, `.vpmz`, `.zip`, `.rar`, executables, or 3D model files).
- **Mandatory Outbound Routing**: Downstream APIs and applications must provide direct outbound links to the original creator storefront or repository.
- **RFC 9309 Robots Compliance**: Honors `robots.txt` directives with conservative origin-wide AIMD rate pacing.
- **Removal Review**: App-authenticated removal reports are recorded without automatic delisting. DNS/bio ownership verification remains unimplemented.
- **Anti-AI Model Training Restrictions**: Catalog compilations are restricted from use in training generative AI models.

Review [LEGAL.md](LEGAL.md) for full operational covenants, governing law, and public terms of service.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) — see [`LICENSE.md`](LICENSE.md) for details.
