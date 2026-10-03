# VRC Package Crawler

An open-source, polite discovery and indexing engine for public VRChat creator packages (Tools, Assets, Avatars).

The project indexes public package metadata from VPM community repositories, GitHub releases, and creator storefronts, routing downstream users directly to original creator storefronts and repositories. It categorically excludes downloading, caching, or redistributing proprietary asset binaries (`.zip`, `.unitypackage`, `.vpmz`, `.fbx`).

---

## Architecture Overview

The system operates across three decoupled operational domains:

```mermaid
flowchart LR
    subgraph CrawlerFleet["Crawler Node Fleet"]
        N1["Crawler Node (Docker / Standalone)"]
        N2["Crawler Node (Docker / Standalone)"]
    end

    subgraph Coordinator["API Worker Coordinator (D1 / Local workerd D1)"]
        API["REST Coordinator API (/v1/*)"]
        Store["Lease Engine, Pacing Clock & Robots Cache"]
    end

    subgraph Downstream["Downstream Consumers & Ecosystem"]
        SDK["vrc-packages-api (src-package SDK)"]
        CLI["Community Package Managers (VCC / vrc-get)"]
        Web["Future Web Registry"]
    end

    N1 -- "Lease Claim & Submission" --> API
    N2 -- "Lease Claim & Submission" --> API
    API --- Store
    SDK -- "Catalog Query & Delta Sync" --> API
    CLI --> SDK
    Web --> SDK
```

1. **Coordinator (`src-web/src/worker/`)**:
   - Manages origin-wide AIMD pacing clocks, RFC 9309 robots caching, and scoped crawler job leases.
   - Verifies observation receipts, extracts outbound discovery leads, and enforces canonical provenance hierarchies.
   - Runs locally through Wrangler/workerd with D1. There is no coordinator binary. The SQLite comparator lives under Worker test support.
2. **Crawler Nodes (`src-crawler/src/`, entry `main.ts`)**:
   - Headless, standalone workers executing coordinator-leased jobs.
   - Includes a standalone binary build and Docker configuration. Fleet updates and restart-safe result submission still need checks.
   - Features DNS-pinned HTTPS transport, 10 MB payload socket abort guardrails, and continuous 5-second lease validity checks.
3. **Consumer SDK (`src-package/`)**:
   - Named `vrc-packages-api` for downstream application developers. npm packaging and installation checks remain open.
   - Provides strongly-typed TypeScript clients for catalog search, cursor-based keyset pagination, continuous delta synchronization, and creator delisting.
4. **Web Surface (`src-web/`)**:
   - Serves API endpoints only. Svelte tooling remains for possible future panels, not the active Worker entry.

---

## Repository Layout

```
vrc-package-crawler/
  .agents/                    Agent specifications, operational rules, and link auditing tools
  src-crawler/                Standalone crawler node
    src/
      main.ts                 Node CLI and daemon entry
      adapters/               Observation extraction
      client/                 Internal coordinator lease client
      config/                 Node runtime configuration
      runner/                 Daemon and lease execution
      storage/                Node-local SQLite telemetry
      shared/                 Versioned API protocol schemas (Zod) and platform definitions
      utils/                  Pacing clock, robots cache, logger, and DNS guardrails
    dist/                     Compiled node binaries
  src-package/                Downstream client SDK (`vrc-packages-api`) and shared wire schemas
    src/
      client.ts               Downstream API client
      protocol/               Consumer and operator wire schemas
      types/                  Domain entities, taxonomy, and token formats
  src-web/                    API-only Worker project
    src/worker/               API handlers and D1 coordinator
    tests/worker/             Worker-owned tests
    tests/support/            Test-only SQLite comparator and helpers
  docs/                       Source drafts, research and decision ledgers
    scratch/                  Exactly three lifecycle documents
    research/                 Platform access matrices, robots analysis, and market research
    source/                   Architecture specifications (`API_ROUTES.md`, `DATABASE_SCHEMAS.md`)
  tests/                      Layout tests, cross-runtime integration and shared test helpers
  AGENTS.md                   Agent entry point and operational boundaries
  DELEGATES.md                Downstream developer runbook & Docker node operations manual
  LEGAL.md                    Legal notices, operational covenants, and terms of service
  LICENSE.md                  GNU Affero General Public License v3.0 (AGPL-3.0)
```

---

## Prerequisites & Development

- **Bun** >= 1.4.0 (required for runtime, compilation, and testing)
- **Docker** & **Docker Compose** (optional, for running crawler node fleets)

### Testing & Verification

The repository maintains strict test suites ensuring zero regression across protocol schemas, node adapters, coordinator leasing, and SDK methods:

```powershell
# Run root layout and contract conformance tests
bun test tests

# Run node-owned tests
cd src-crawler
bun test

# Run Worker-owned tests
cd ../src-web
bun run test

# Run consumer SDK tests
cd ../src-package
bun test
```

Migration checks on 2026-10-03: node 142 pass, Worker/integration 161 pass, SDK 33 pass. Root layout still has two obsolete identity-config failures. These counts do not prove fleet readiness or live-source ingestion.

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
cd ../src-web
bun run check
bun run build

# Run the isolated native D1 HTTP smoke (requires Node.js)
bun run test:runtime
```

---

## Deployment & Operations

### 1. Downstream Integration (`vrc-packages-api`)

Downstream package managers (such as VCC or `vrc-get`), search tools, and community registries consume the catalog using the `vrc-packages-api` SDK:

```typescript
import { VrcPackagesClient } from "vrc-packages-api";

const client = new VrcPackagesClient({
  baseUrl: "https://api.vrc-packages.net",
  appToken: "vrcp_app_0123456789abcdef...",
});

// Full-text search with bulk tag filtering and canonical timestamp ordering
const results = await client.app.search({
  query: "PhysBones",
  tags: ["tool", "avatar"],
  queryOrigin: "MyVpmManager/1.0.0",
});

// Resumable delta synchronization for local caches
const deltas = await client.catalog.syncDeltas({
  since: "2026-10-01T00:00:00.000Z",
  limit: 100,
});
```

See [DELEGATES.md](DELEGATES.md) for full SDK documentation, registration procedures, and keyset pagination guides.

### 2. Running Crawler Nodes via Docker

Community node operators run containerized workers with automated rolling updates using Watchtower:

```bash
docker compose up -d
```

For configuration options, capability encoding, and environment templates, consult the [DELEGATES.md Docker Runbook](DELEGATES.md#operating-crawler-nodes-via-docker).

---

## Legal & Compliance Covenants

The Project operates under strict technical and legal covenants to safeguard creator rights and target infrastructure:

- **Zero-Binary Invariant**: The crawler never fetches, stores, or mirrors binary archives (`.unitypackage`, `.vpmz`, `.zip`, `.rar`, executables, or 3D model files).
- **Mandatory Outbound Routing**: Downstream APIs and applications must provide direct outbound links to the original creator storefront or repository.
- **RFC 9309 Robots Compliance**: Honors `robots.txt` directives with conservative origin-wide AIMD rate pacing.
- **Creator Delisting & Bio-Token Verification**: Creators can delist packages or assert ownership using non-invasive public bio-tokens or DNS TXT records.
- **Anti-AI Model Training Restrictions**: Catalog compilations are restricted from use in training generative AI models.

Review [LEGAL.md](LEGAL.md) for full operational covenants, governing law, and public terms of service.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) — see [`LICENSE.md`](LICENSE.md) for details.
