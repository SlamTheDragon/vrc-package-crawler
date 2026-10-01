# Crawler Network Specification (Candidate)

> **Document Status:** Post-Production Candidate Specification  
> **Target Subsystem:** Coordinator, Ingestion Gateway, and Cloudflare Worker Infrastructure  
> **Source Directory:** `src-crawler/src/worker/` and `src-crawler/src/shared/`

---

## 1. Overview and Architectural Role

The **Crawler Network** (coordinator) orchestrates discovery and catalog compilation for the VRChat package ecosystem. It operates in two environments:
1. **Pre-Production Local Simulation:** Runs locally as `dist/local-coordinator/vrc-coordinator.exe`. It listens on loopback HTTP (default `127.0.0.1:3737`), reads `coordinator.config.json`, and stores state in `coordinator.db`.
2. **Production Deployment:** Deploys as a Cloudflare Worker with identical request/response schemas, DTOs, and protocol validators.

---

## 2. Protocol Boundaries and Endpoints

Version 1 Zod schemas in `src-crawler/src/shared/node_protocol.ts` and `operator_protocol.ts` validate all network payloads.

### 2.1 Crawler Node Protocol (`/v1/node/*`)
Needs `Authorization: Bearer <NODE_TOKEN>`.

- `POST /v1/node/claim`: Issues an origin lease and atomic crawl job to an authorized node. Returns a job payload or `{ status: "empty", retryAfterMs: number }`.
- `POST /v1/node/heartbeat`: Renews active job leases and confirms node liveness.
- `POST /v1/node/result`: Submits observation facts, discovered leads, or access failure diagnostics. Transitions job state and updates canonical catalog tables.

### 2.2 Operator Control Protocol (`/v1/operator/*`)
Needs `Authorization: Bearer <OPERATOR_TOKEN>` (256-bit entropy token issued at first boot or set in `coordinator.config.json`).

- `POST /v1/operator/nodes`: Registers a new crawler node and returns a one-time 64-hex bearer token (`no-store`).
- `GET /v1/operator/profiles` and `POST /v1/operator/profiles`: Audits and provisions scoped source-access profiles.
- `GET /v1/operator/rules` and `POST /v1/operator/rules`: Configures expiring, path-scoped auto-queue rules for discovered leads.
- `GET /v1/operator/leads`: Inspects pending discovery leads with keyset pagination.
- `POST /v1/operator/leads/review`: Approves or rejects pending leads.
- `GET /v1/operator/catalog`: Queries deduplicated `canonical_packages` with keyset pagination.

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
