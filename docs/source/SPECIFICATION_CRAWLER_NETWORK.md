# Crawler Network Specification (Candidate)

> **Document Status:** Post-Production Candidate Specification  
> **Target Subsystem:** Coordinator, Ingestion Gateway, and Cloudflare Worker Infrastructure  
> **Source Directory:** `src-web/src/worker/` and `src-crawler/src/shared/`

---

## 1. Overview and Architectural Role

The **Crawler Network** (coordinator) orchestrates decentralized discovery, workforce distribution, and canonical catalog compilation for the VRChat package ecosystem:
1. **Local Worker:** `src-web` runs the API entry through `bun run dev` (Wrangler local mode). It uses local D1. There is no coordinator binary.
2. **Worker Target:** `src-web/src/worker/worker_entry.ts` serves API routes with a D1 binding named `DB`. The current configuration declares no static assets or R2 binding. A dry-run build does not prove remote deployment.

`src-web/tests/support/` contains the SQLite comparator and prototype test helpers. They are not production Worker dependencies. Native runtime smoke uses isolated D1 and blocks external requests.

`POST /v1/operator/init` can queue candidate jobs through `autoSeed`. It does not create source-access profiles or robots snapshots. All drivers remain available. Reinitialization preserves existing grants, restrictions, active leases and suppressed targets. Earlier bootstrap-created grants require review before an existing-database live run. Placeholder candidate selection remains unresolved.

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

The route draft is [`API_ROUTES.md`](API_ROUTES.md). Runtime schemas live in [`src-crawler/src/shared/protocol/`](../../src-crawler/src/shared/protocol/). Handlers define executable routes. [`DATABASE_SCHEMAS.md`](DATABASE_SCHEMAS.md) describes storage.

### 2.1 Crawler Node Protocol (`/v1/node/*`)
Requires `Authorization: Bearer <NODE_TOKEN>` (`vrcp_<64-hex><4-hex>`). The 4-hex suffix encodes the node's assigned capability bitmask.
- `POST /v1/node/jobs/claim`: Issues an origin lease and atomic crawl job if the node possesses the required platform capability, robots allow, and an active `SourceAccessProfile` covers the target.
- `POST /v1/node/heartbeat`: Renews active origin leases and confirms node liveness.
- `POST /v1/node/jobs/result`: Submits observation facts, discovered leads, or access failure diagnostics. Transitions job state and updates canonical catalog tables.

### 2.2 Operator Control Protocol (`/v1/operator/*`)
Requires `Authorization: Bearer <COORDINATOR_OPERATOR_TOKEN>` (Constant-time secret comparison). Admin operators manage infrastructure; they never receive or view plaintext node or application tokens.
- `GET /v1/operator/source-profiles` and `POST /v1/operator/source-profiles`: Audits and provisions scoped source-access profiles.
- `POST /v1/operator/source-profiles/{id}/disable`: Disables a profile and invalidates active leases.
- `GET /v1/operator/autoqueue-rules` and `POST /v1/operator/autoqueue-rules`: Configures expiring, path-scoped auto-queue rules for discovered leads.
- `POST /v1/operator/autoqueue-rules/{id}/disable`: Disables an active auto-queue rule.
- `GET /v1/operator/leads`: Inspects pending discovery leads with keyset pagination.
- `POST /v1/operator/leads/{key}/approve` and `POST /v1/operator/leads/{key}/reject`: Triage actions on pending leads.
- `GET /v1/operator/takedowns` and `POST /v1/operator/takedowns/{id}/verify`: Inspects and reviews creator delisting requests.

### 2.3 User & Registrant Protocol (`/v1/user/*`)
Requires `Authorization: Bearer <REGISTRANT_TOKEN>` (`vrcp_reg_<64-hex>`) for authenticated actions; anonymous proof-gated for creator opt-outs.
- `POST /v1/user/nodes`: Self-service node issuance; coordinator returns capability-encoded node token.
- `POST /v1/user/apps`: Registers downstream application credentials (`vrcp_app_`).
- `POST /v1/user/delist`: Unified delisting endpoint. Authenticated users delist on their own behalf (auth is proof); unauthenticated creators provide `proofKind` (`dns_txt` | `storefront_bio_token`).
- `GET /v1/user/me` · `DELETE /v1/user/nodes/{id}` · `DELETE /v1/user/apps/{id}`: Credential and takedown lifecycle.

### 2.4 Downstream Application Protocol (`/v1/app/*`)
Public read for catalog index and delta streaming; `Authorization: Bearer <APP_TOKEN>` (`vrcp_app_<64-hex>`) for bounded search and reporting.
- `POST /v1/app/register`: Gated downstream app registration (requires registrant or operator auth).
- `GET /v1/app/index`: Core package catalog projection. Bounded search without unbounded pagination.
- `GET /v1/app/index/delta`: Keyset-paginated incremental sync feed for package managers (VCC/ALCOM). Emits `upsert` and `delist` envelopes.
- `POST /v1/app/index/search`: Bounded search with `queryOrigin: "user_authored" | "app_automated"` attribution.
- `POST /v1/app/reports`: Consolidated reporting endpoint ingesting demand signals (`search_miss`, `refresh_demand`, `popularity_signal`) and quality/takedown reports (`broken_link`, `wrong_metadata`, `misclassified`).

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

## 4. Coordinator Storage Schema (`coordinator.db` / D1)

The Worker stores coordinator state through D1 in local workerd tests and the deployment target. The SQLite comparator is test-only. See [`DATABASE_SCHEMAS.md`](DATABASE_SCHEMAS.md) for the schema draft.
