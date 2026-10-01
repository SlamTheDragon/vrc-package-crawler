# Crawler Network Specification (Candidate)

> **Document Status:** Post-Production Candidate Specification  
> **Target Subsystem:** Coordinator, Ingestion Gateway, and Cloudflare Worker Infrastructure  
> **Source Directory:** `src-crawler/src/worker/` and `src-crawler/src/shared/`

---

## 1. Overview and Architectural Role

The **Crawler Network** (coordinator) orchestrates decentralized discovery, workforce distribution, and canonical catalog compilation for the VRChat package ecosystem:
1. **Pre-Production Local Simulation:** Runs locally as `dist/local-coordinator/vrc-coordinator.exe`. It listens on loopback HTTP (default `127.0.0.1:3737`), reads `coordinator.config.json`, and stores state in `coordinator.db`.
2. **Production Deployment:** Deploys as Cloudflare Workers backed by D1/R2 once the local simulation is proven to match edge semantics identically.

The Coordinator is the central authority responsible for:
- **Crawler Node & Client Registration**: Provisioning node credentials and evaluating registrant capacity.
- **Workforce Distribution**: Evaluating platform coverage demands and enabling specific website capabilities for Crawler Nodes and Crawler Clients to balance network coverage and route capacity dynamically toward demanding targets requiring immediate data freshness.
- **Capability-Encoded Tokens**: The coordinator-issued token contains/encodes the combination of permitted website capabilities that a node provides or is authorized to accept.
- **Anti-"Bot-Net" Job & Rate-Limit Management**: Centralized origin lease scheduler enforcing origin-wide politeness floors, preventing multi-node traffic amplification against third-party storefronts.
- **Report Ingestion & Moderation**: Ingesting structured consumer reports, managing report state, and seeding the crawl frontier.
- **Canonical Front Arbiter**: Testing and determining the final verdict on canonical identified package fronts delivered to downstream clients.
- **Downstream Consumer Services**:
  - *Registered Downstream Service*: Search and configurable content retrieval endpoints allowing registered downstream applications to query or randomly select/sample database entries.
  - *Unauthenticated Downstream Service*: Limited public catalog search and delta streaming for anonymous consumers.

---

## 2. Protocol Boundaries and Endpoints

Version 1 Zod schemas in `src-crawler/src/shared/node_protocol.ts`, `operator_protocol.ts`, and `catalog_protocol.ts` validate all network payloads.

### 2.1 Crawler Node Protocol (`/v1/node/*`)
Needs `Authorization: Bearer <NODE_TOKEN>`. The bearer token encodes the node's assigned capability set.

- `POST /v1/node/jobs/claim`: Issues an origin lease and atomic crawl job to an authorized node whose token permits that platform capability. Returns a job payload or `{ status: "empty", retryAfterMs: number }`.
- `POST /v1/node/heartbeat`: Renews active job leases and confirms node liveness.
- `POST /v1/node/jobs/result`: Submits observation facts, discovered leads, or access failure diagnostics. Transitions job state and updates canonical catalog tables.

### 2.2 Operator Control Protocol (`/v1/operator/*`)
Needs `Authorization: Bearer <OPERATOR_TOKEN>` (256-bit entropy token issued at first boot or set in `coordinator.config.json`).

- `POST /v1/operator/nodes`: Registers a new crawler node or client, evaluates workforce balance, and returns a capability-encoded one-time 64-hex bearer token (`no-store`).
- `GET /v1/operator/source-profiles` and `POST /v1/operator/source-profiles`: Audits and provisions scoped source-access profiles.
- `POST /v1/operator/source-profiles/{profileId}/disable`: Disables an active source-access profile and invalidates active leases.
- `GET /v1/operator/autoqueue-rules` and `POST /v1/operator/autoqueue-rules`: Configures expiring, path-scoped auto-queue rules for discovered leads.
- `POST /v1/operator/autoqueue-rules/{ruleId}/disable`: Disables an active auto-queue rule and stops associated fetches.
- `GET /v1/operator/leads`: Inspects pending discovery leads with keyset pagination.
- `POST /v1/operator/leads/{leadKey}/approve` and `POST /v1/operator/leads/{leadKey}/reject`: Approves or rejects pending leads.
- `GET /v1/operator/catalog`: Queries deduplicated `canonical_packages` with keyset pagination.

### 2.3 Downstream Consumer Protocol (`/v1/catalog/*`, `/v1/apps/*`)

#### A. Registered Downstream Applications (Authenticated via `Authorization: Bearer <APP_TOKEN>`)
- `POST /v1/apps/register`: Registers a downstream client application (e.g. desktop managers, ALCOM, VCC) to receive application credentials.
- `POST /v1/catalog/search`: Offers full configurable search, multi-facet filtering, and custom content extraction across canonical packages.
- `GET /v1/catalog/random`: Allows registered clients to randomly sample/select database entries based on configurable filter criteria (e.g. for showcase discovery or random feed exploration).
- `POST /v1/apps/feedback`: Ingests downstream search activities, query telemetry, cache-miss signals, and freshness demand signals, enabling the coordinator to reorient node workforce allocation and prioritize crawl frontier scheduling for high-demand packages.
- `POST /v1/reports`: Ingests structured application-level curation/error reports.

#### B. Unauthenticated Public Catalog (Read-Only)
- `GET /v1/catalog`: Queries projected canonical catalog items with keyset pagination and public caching headers (`max-age=60`).
- `GET /v1/catalog/delta`: Emits keyset-paginated incremental catalog deltas and delisting tombstones with epoch preservation.

---

## 3. Core Safety and Governance Invariants

1. **Origin Lease System**:
   - Crawler nodes do not fetch without an active, unexpired lease from the coordinator.
   - The coordinator paces requests per origin. Extra nodes add breadth across domains, not higher frequency on one host.
2. **Fail-Closed Availability**:
   - If the coordinator becomes unreachable, crawler nodes stop outbound requests immediately. Nodes do not generate local seeds.
3. **Source-Access Profile Gate**:
   - Each candidate URL needs an explicit, active, scoped `SourceAccessProfile` before robots preflight and before lease claim.
   - Unknown domains, unvetted paths, and exploratory auto-queue leads stay in a `'pending'` state until operator approval.
4. **RFC 9309 Robots Compliance**:
   - The coordinator manages centralized robots snapshots with 24-hour TTLs. It obeys `Disallow` rules with DNS pinning and redirect checks.

---

## 4. Local Coordinator Storage Schema (`coordinator.db`)

The coordinator stores relational state in SQLite WAL mode:
- `source_items`: Canonical origin identity anchored by `source_item_key` and canonical URL.
- `source_versions`: Immutable change versions indexed by SHA-256 content digests.
- `source_events`: Audit log of crawl attempts, observations, and state transitions.
- `discovery_leads`: Outbound leads awaiting operator triage or rule-based auto-queuing.
- `canonical_packages`: Deduplicated catalog records linked to source items through `identity_links`.
- `node_credentials`: SHA-256 hashed node authentication tokens and capability permissions.
- `source_access_profiles`: Audited access rules, rate floors, and permitted evidence classes.
