# Crawler Network Specification (Candidate)

> **Document Status:** Post-Production Candidate Specification  
> **Target Subsystem:** Coordinator, Ingestion Gateway, and Cloudflare Worker Infrastructure  
> **Source Directory:** `src-crawler/src/worker/` and `src-crawler/src/shared/`

---

## 1. Overview & Architectural Role

The **Crawler Network** (coordinator) serves as the authoritative orchestrator and catalog compilation engine for the VRChat package discovery ecosystem. It operates in two environments:
1. **Pre-Production Local Simulation:** Runs locally as `dist/local-coordinator/vrc-coordinator.exe`, listening on loopback HTTP (default `127.0.0.1:3737`) backed by `coordinator.db` and configured via `coordinator.config.json`.
2. **Production Deployment:** Deploys as a Cloudflare Worker using the exact same request/response schemas, DTOs, and protocol validators.

---

## 2. Protocol Boundaries & Endpoints

All network payloads are strictly validated using version 1 Zod schemas defined in `src-crawler/src/shared/node_protocol.ts` and `operator_protocol.ts`.

### 2.1 Crawler Node Protocol (`/v1/node/*`)
Requires `Authorization: Bearer <NODE_TOKEN>`.

- `POST /v1/node/claim`: Issues an origin lease and atomic crawl job to an authorized node. Returns job payload or `{ status: "empty", retryAfterMs: number }`.
- `POST /v1/node/heartbeat`: Renews active job leases and verifies node liveness.
- `POST /v1/node/result`: Submits observation facts, discovered leads, or access failure diagnostics. Automatically transitions job state and updates canonical catalog tables.

### 2.2 Operator Control Protocol (`/v1/operator/*`)
Requires `Authorization: Bearer <OPERATOR_TOKEN>` (256-bit entropy token issued at first boot or configured in `coordinator.config.json`).

- `POST /v1/operator/nodes`: Registers a new crawler node and returns a one-time 64-hex bearer token (`no-store`).
- `GET /v1/operator/profiles` & `POST /v1/operator/profiles`: Audits and provisions scoped source-access profiles.
- `GET /v1/operator/rules` & `POST /v1/operator/rules`: Configures expiring, path-scoped auto-queue rules for discovered leads.
- `GET /v1/operator/leads`: Keyset-paginated inspection of pending discovery leads.
- `POST /v1/operator/leads/review`: Manually approves or rejects pending leads.
- `GET /v1/operator/catalog`: Keyset-paginated query interface for deduplicated `canonical_packages`.

---

## 3. Core Safety & Governance Invariants

1. **Origin Lease System**:
   - Crawler nodes never fetch without holding an active, unexpired lease issued by the coordinator.
   - Pacing is enforced globally per origin: adding nodes increases breadth across domains, not request frequency on any single host.
2. **Fail-Closed Availability**:
   - If the coordinator is unreachable, crawler nodes halt outbound requests immediately. Nodes never fall back to local seed generation.
3. **Source-Access Profile Gate**:
   - Every candidate URL requires an explicit, active, scoped `SourceAccessProfile` before robots preflight and before a lease can be claimed.
   - Unknown domains, unvetted paths, and exploratory auto-queue leads remain in a `'pending'` state until approved by an operator.
4. **RFC 9309 Robots Compliance**:
   - The coordinator manages centralized, expiring robots snapshots with 24-hour TTLs, honoring `Disallow` rules with DNS pinning and redirect verification.

---

## 4. Local Coordinator Storage Schema (`coordinator.db`)

The coordinator maintains relational state in SQLite WAL mode:
- `source_items`: Authoritative origin identity anchored by `source_item_key` and canonical URL.
- `source_versions`: Change-only immutable versions indexed by content SHA-256 digests.
- `source_events`: Complete audit log of crawl attempts, observations, and state transitions.
- `discovery_leads`: Extracted outbound leads awaiting operator triage or rule-based auto-queuing.
- `canonical_packages`: Deduplicated public catalog records linked to source items via `identity_links`.
- `node_credentials`: SHA-256 hashed node authentication tokens and capability permissions.
- `source_access_profiles`: Audited operational access rules, rate floors, and allowed evidence classes.
