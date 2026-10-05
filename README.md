# VRC Packages (⚠️WIP!)

VRC Packages (VRCP) is an open-source discovery and indexing engine for public VRChat creator packages (Tools, Assets, Avatars).

The project derives metadata discovery from VPM repositories, such as GitHub, and creator storefronts like Gumroad, Booth.pm, Jinxxy, Shopify, Payhip, & others. The catalog records public links to original publisher fronts. The policy excludes archives, assets, and executable downloads.

---

## Using this service

### 1. Integration via (`vrc-packages-api`)

Downstream applications can use the SDK's public contracts. For full documentation, read [docs/source](docs/source). For agents: See [DELEGATES.md](DELEGATES.md) for full SDK documentation overview, registration procedures, and keyset pagination guides.

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

The example environment variable is a backend convention, not an SDK requirement. The Worker accepts queryOrigin but does not record or apply search attribution. Do not treat that field as implemented attribution or auditing.

### 2. Contribute to our Discovery Crawler Nodes Network via Docker or Crawler Client

#### Crawler Client

Download & Install the latest release found at [Deployments](https://github.com/SlamTheDragon/vrc-packages/deployments)

#### Crawler Docker

The node has a Dockerfile and a fleet configuration. Image publication, restart recovery and automatic updates are pending.

```bash
docker compose -f src-crawler/docker-compose.yml config
```

Review the [Docker runbook](DELEGATES.md#3-crawler-node-operation--fleet-management) before starting containers. The compose file grants Watchtower access to the host Docker socket.

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
cd src-worker
bun run test

# Run consumer SDK tests
cd src-package
bun test
```

### Typechecking & Builds

```powershell
# Typecheck the crawler node
cd src-crawler
bun run typecheck

# Typecheck consumer SDK
cd src-package
bun run typecheck

# Build the standalone node
cd src-crawler
bun run build

# Check and build the API Worker without deploying
cd src-worker
bun run check
bun run build

# Run the isolated native D1 HTTP smoke (requires Node.js)
bun run test:runtime
```

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
