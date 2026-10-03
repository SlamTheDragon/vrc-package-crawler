# Crawler Network Specification (Candidate)

> **Document Status:** Current source reference with open capability gaps
> **Target Subsystem:** Coordinator, Ingestion Gateway, and Cloudflare Worker Infrastructure  
> **Source Directory:** `src-worker/src/` and `src-crawler/src/shared/`

---

## 1. Overview and Architectural Role

The **Crawler Network** (coordinator) orchestrates decentralized discovery, workforce distribution, and canonical catalog compilation for the VRChat package ecosystem:
1. **Local Worker:** `src-worker` runs the API entry through `bun run dev` (Wrangler local mode). It uses local D1. There is no coordinator binary.
2. **Worker Target:** `src-worker/src/worker_entry.ts` serves API routes. Wrangler uses the D1 binding `VRCP_D1`. The configuration declares no static assets or R2 binding. A dry-run build does not prove remote deployment.

`src-worker/test/support/` contains the SQLite comparator and prototype test helpers. They are not production Worker dependencies. Native runtime smoke uses isolated D1 and blocks external requests.

`POST /v1/operator/init` can queue candidate jobs through `autoSeed`. It does not create source-access profiles or robots snapshots. All drivers remain available. Reinitialization preserves existing grants, restrictions, active leases and suppressed targets. Earlier bootstrap-created grants require review before an existing-database live run. Placeholder candidate selection remains unresolved.

The coordinator currently supports these responsibilities:
- **Node Provisioning**: Operators issue capability-scoped credentials. User ownership and capacity evaluation remain open.
- **Workforce Distribution**: Claims select eligible jobs under capability and origin restrictions. Complete demand-driven coverage balancing remains unverified.
- **Capability-Encoded Tokens**: The coordinator-issued token contains/encodes the combination of permitted website capabilities that a node provides or is authorized to accept.
- **Anti-"Bot-Net" Job & Rate-Limit Management**: Centralized origin lease scheduler enforcing origin-wide politeness floors, preventing multi-node traffic amplification against third-party storefronts.
- **Report Ingestion**: Records demand and issue reports. Removal requests remain pending without catalog mutation. Removal review controls are not implemented.
- **Canonical Projection**: Derives catalog entries from source evidence. Publication rights, correction controls and some identity decisions remain open.
- **Downstream Consumer Services**:
  - *Registered Downstream Service*: Bounded search and reports. Random sampling is removed.
  - *Unauthenticated Downstream Service*: Bounded index pages and delta synchronization. The public handler does not accept text/filter query keys.

---

## 2. Protocol Boundaries and Endpoints

The route draft is [`API_ROUTES.md`](API_ROUTES.md). Runtime schemas live in [`src-crawler/src/shared/protocol/`](../../src-crawler/src/shared/protocol/). Handlers define executable routes. [`DATABASE_SCHEMAS.md`](DATABASE_SCHEMAS.md) describes storage.

### 2.1 Crawler Node Protocol (`/v1/node/*`)
Requires `Authorization: Bearer <NODE_TOKEN>` (`vrcp_<64-hex><4-hex>`). The 4-hex suffix encodes the node's assigned capability bitmask.
- `POST /v1/node/jobs/claim`: Issues an origin lease and atomic crawl job if the node possesses the required platform capability, robots allow, and an active `SourceAccessProfile` covers the target.
- `POST /v1/node/heartbeat`: Checks active lease authority and records node liveness. It does not extend the lease deadline.
- `POST /v1/node/jobs/result`: Submits observation facts, discovered leads, or access failure diagnostics. Transitions job state and updates canonical catalog tables.

Discovery lead rows, source events, the receipt and job/lease updates commit in one D1 batch. Failed lead writes preserve the lease and origin reservation. Native D1 tests cover failures on the first and second lead, exact retry, and duplicate replay. Automatic lead promotion follows the commit. It does not yet have durable retry guarantees. Node restart cannot yet replay a result without a persisted payload/key outbox.

### 2.2 Operator Control Protocol (`/v1/operator/*`)
Requires the `OPERATOR_TOKEN` bearer secret. Operators receive newly issued node tokens once, but credential listings do not expose stored plaintext.
- `GET /v1/operator/source-profiles` and `POST /v1/operator/source-profiles`: Audits and provisions scoped source-access profiles.
- `POST /v1/operator/source-profiles/{id}/disable`: Disables a profile and invalidates active leases.
- `GET /v1/operator/autoqueue-rules` and `POST /v1/operator/autoqueue-rules`: Configures expiring, path-scoped auto-queue rules for discovered leads.
- `POST /v1/operator/autoqueue-rules/{id}/disable`: Disables an active auto-queue rule.
- `GET /v1/operator/leads`: Inspects pending discovery leads with keyset pagination.
- `POST /v1/operator/leads/{key}/approve` and `POST /v1/operator/leads/{key}/reject`: Triage actions on pending leads.
- `GET /v1/operator/takedowns` and `POST /v1/operator/takedowns/{id}/verify`: Lists historical requests and records an operator verdict. The route does not implement DNS/bio challenge verification.

### 2.3 User & Registrant Protocol (`/v1/user/*`)
Requires a user bearer token (`vrcp_usr_<64-hex>`).
- `GET /v1/user/apps` and `GET /v1/user/apps/{appId}`: Reads owned app metadata without credentials.
- User node list/detail GETs remain pending because node provisioning has no ownership relation.
- User collection POSTs and user delisting are removed. Profile and user credential revocation routes remain planned, not implemented.

### 2.4 Downstream Application Protocol (`/v1/app/*`)
Public read for catalog index and delta streaming; `Authorization: Bearer <APP_TOKEN>` (`vrcp_app_<64-hex>`) for bounded search and reporting.
- `POST /v1/app/register`: Gated downstream app registration (requires registrant or operator auth).
- `GET /v1/app/index`: Bounded catalog pages with `limit` and `cursor`.
- `GET /v1/app/index/delta`: Keyset-paginated incremental sync feed for package managers (VCC/ALCOM). Emits `upsert` and `delist` envelopes.
- `POST /v1/app/index/search`: Bounded search with `queryOrigin: "user_authored" | "app_automated"` attribution.
- `POST /v1/app/report`: Records demand, issue reports and pending removal requests. A removal receipt is not verified ownership or approved delisting.

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
   - The coordinator checks stored robots rules before node claim, active-fetch heartbeat and submission. Successful or missing-file snapshots expire after 24 hours. Error snapshots expire after one hour.
   - D1 refresh reservations share origin exclusion and pacing with node jobs. Completion requires current refresh ownership and an active scoped source profile. Production refresh transport and scheduling are not wired.
   - Node metadata transport pins a checked DNS answer. This does not prove Worker DNS pinning. The shared robots parser delegates safe transport to its caller.

---

## 4. Coordinator Storage Schema (`coordinator.db` / D1)

The Worker stores coordinator state through D1 in local workerd tests and the deployment target. The SQLite comparator is test-only. See [`DATABASE_SCHEMAS.md`](DATABASE_SCHEMAS.md) for the schema draft.
