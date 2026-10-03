# API Route Reference (Candidate Source Document)

> **Document Status:** Candidate Source — v0 Pre-Production Architecture  
> **Last Updated:** 2026-10-01  
> **Target Subsystems:** `src-web` (API Worker coordinator) · `src-crawler` (node) · `src-package` (`vrc-packages-api` SDK)
> **Status Legend:** ✅ Implemented · 🔲 Planned · ⚠️ In Transition · ⏸️ On Hold / Redefining

---

## 1. Architectural Roles & Credentials

The system operates across four discrete principal boundaries. Tokens must never be cross-used or exposed across role boundaries.

| Principal Tier | Token Format | Length | Issued By | Scope & Boundaries |
|---|---|---|---|---|
| **Crawler Node** | `vrcp_<64-hex><4-hex>` | 73 chars | User (`/v1/user/nodes`) or Operator (`/v1/operator/nodes`) | Leases crawl jobs; capability bitmask encoded in final 4 hex characters; fails closed without lease. |
| **Downstream App** | `vrcp_app_<64-hex>` | 73 chars | User / Operator (`/v1/app/register` or `/v1/user/apps`) | Search index, delta streaming, and telemetry/demand reporting. |
| **User** | `vrcp_usr_<64-hex>` | 73 chars | Web Operator Panel (Firebase Auth) | Self-service node issuance, downstream app registration, and own-content delisting. |
| **Admin Operator** | `COORDINATOR_OPERATOR_TOKEN` | 64 chars | Environment / Secret config | Infrastructure oversight: source profiles, auto-queue rules, lead triage, catalog oversight, node issuance. |

> [!NOTE]
> All tokens are stored as irreversible SHA-256 digests. Raw token values are emitted exactly once upon creation and are never logged, inspected, or echoed back in administration listings.

---

## 2. API Routes

### Storage initialization (implemented locally, 2026-10-03)

`POST /v1/operator/init` requires the configured operator bearer token and an `application/json` body. The strict request is `{ "schemaVersion": 1, "autoSeed": true }`. `autoSeed` is optional and defaults to true. Unknown fields, other versions and nonboolean values return 400. Malformed JSON returns 400, unsupported media returns 415, and bodies above 256 KiB return 413. These failures occur before database operations.

Success returns `{ "schemaVersion": 1, "status": "ok", "message": "Schema initialized", "autoSeed": true }`, with the actual seed choice. Responses disable caching. The SDK exposes `client.operator.init({ autoSeed })` and checks the response schema. Seeding queues candidates only. It creates no source-access approval or robots evidence. Existing stored grants remain unchanged and require review before live use.

### Manual job enqueue (implemented locally, 2026-10-03)

`POST /v1/operator/jobs` requires operator authentication. The SDK exposes `client.operator.jobs.enqueue(request)`.

```json
{
  "schemaVersion": 1,
  "url": "https://publisher.example/index.json",
  "platform": "vpm",
  "purpose": "metadata",
  "minDelayMs": 1000,
  "reason": "Reviewed discovery candidate"
}
```

The strict request requires all six fields. URL length is at most 4096 characters. Delay is an integer from 0 through 86400000 milliseconds. The trimmed reason contains 1 through 300 characters. Existing target restrictions still apply. Unknown fields and invalid types return 400. Unsafe targets, suppression and conflicting platform/purpose return 409. Authentication failure returns 401. Bounded JSON parsing returns 400, 413 or 415 as for initialization.

Success returns `{ "schemaVersion": 1, "jobId": "<UUID>" }` with status 200 and no-store caching. Matching repeats return the existing ID. They preserve its state, lease and next-fetch time, but can increase origin pacing. Each successful operator action writes a job audit record in the same storage transaction. Audit failure rolls back the queue and pacing writes. No source profile, robots snapshot or publication permission comes from enqueue. This route is not a force-refresh control.

### §2.1 Crawler Node Protocol (`/v1/node/*`)

**Auth:** `Authorization: Bearer <NODE_TOKEN>` (`vrcp_<64-hex><4-hex>`)  
**Handler:** `src-web/src/worker/api/handler.ts` · **Schema:** `node_protocol.ts`

| Method | Path | Status | Description | Request Payload | Response (2xx) |
|---|---|:---:|---|---|---|
| `POST` | `/v1/node/jobs/claim` | ✅ | Requests an origin lease and atomic crawl job. Validates token capability bitmask, robots snapshot, and active `SourceAccessProfile`. | `{ schemaVersion: 1, nodeId, leaseId, platform }` | `200` `{ status: "leased", jobId, leaseId, url, platform, minDelayMs, origin, leaseExpiresAt }`<br>or `{ status: "empty", retryAfterMs }` |
| `POST` | `/v1/node/heartbeat` | ✅ | Renews active origin lease and reports node liveness. | `{ schemaVersion: 1, nodeId, jobId, leaseId }` | `200` `{ status: "ok", leaseExpiresAt }` |
| `POST` | `/v1/node/jobs/result` | ✅ | Submits crawl facts, discovered leads, or access failure diagnostics. Updates canonical package graph. | `{ schemaVersion: 1, nodeId, jobId, leaseId, outcome, observations[], discoveredLeads[] }` | `200` `{ status: "accepted", jobId }` |

---

### §2.2 Admin Operator Protocol (`/v1/operator/*`)

**Auth:** `Authorization: Bearer <COORDINATOR_OPERATOR_TOKEN>` (Constant-time secret comparison)  
**Handler:** `src-web/src/worker/api/operator_handler.ts` · **Schema:** `operator_protocol.ts`

| Method | Path | Status | Description | Request / Query | Response (2xx) |
|---|---|:---:|---|---|---|
| `GET` | `/v1/operator/leads` | ✅ | Lists pending, approved, or rejected discovery leads. | Query: `status`, `limit`, `cursor` | `200` `{ leads[], nextCursor }` |
| `POST` | `/v1/operator/leads/{leadKey}/approve` | ✅ | Approves a pending discovery lead into the crawl queue. | `{ schemaVersion: 1, minDelayMs? }` | `200` `{ status: "approved" }` |
| `POST` | `/v1/operator/leads/{leadKey}/reject` | ✅ | Permanently archives/rejects a pending lead. | `{ schemaVersion: 1, reason? }` | `200` `{ status: "rejected" }` |
| `GET` | `/v1/operator/source-profiles` | ✅ | Lists active and disabled origin access profiles. | Query: `limit`, `cursor` | `200` `{ profiles[], nextCursor }` |
| `POST` | `/v1/operator/source-profiles` | ✅ | Authorizes an origin + path scope for crawling. Required before any live fetch lease can be granted. | `{ schemaVersion: 1, platform, origin, pathScope, purpose, minDelayMs, retainClasses[], publishClasses[], reviewReference, reason, expiresAt }` | `201` `{ profile }` |
| `POST` | `/v1/operator/source-profiles/{id}/disable` | ✅ | Disables a source-access profile and immediately blocks new leases. | `{ schemaVersion: 1, reason }` | `200` `{ status: "disabled" }` |
| `GET` | `/v1/operator/autoqueue-rules` | ✅ | Lists automated lead ingestion rules. | Query: `limit`, `cursor` | `200` `{ rules[], nextCursor }` |
| `POST` | `/v1/operator/autoqueue-rules` | ✅ | Creates an auto-queue rule that automatically enqueues matching discovery leads without manual operator triage. | `{ schemaVersion: 1, leadKind, origin, pathScope, minDelayMs, expiresAt, reviewReference, reason }` | `201` `{ rule }` |
| `POST` | `/v1/operator/autoqueue-rules/{id}/disable` | ✅ | Disables an auto-queue rule. | `{ schemaVersion: 1, reason }` | `200` `{ status: "disabled" }` |
| `POST` | `/v1/operator/nodes` | ✅ | Issues an audited, capability-encoded node credential. | `{ schemaVersion: 1, nodeId, capabilities[]?, reason }` | `201` `{ nodeId, capabilities[], token }` |
| `GET` | `/v1/operator/catalog` | ✅ | Lists canonical packages with operator oversight and cursor pagination. | Query: `limit`, `cursor` | `200` `{ packages[], nextCursor }` |
| `GET` | `/v1/operator/takedowns` | ✅ | Audits all recorded creator delistings and opt-outs. | Query: `requesterType`, `limit`, `cursor` | `200` `{ records[], nextCursor }` |
| `POST` | `/v1/operator/takedowns/{id}/verify` | ✅ | Verifies an unauthenticated creator's ownership proof (DNS/bio). | `{ schemaVersion: 1, verdict: "accepted" \| "rejected", notes? }` | `200` `{ status }` |

---

### §2.3 User Protocol (`/v1/user/*`)

**Auth:** `Authorization: Bearer <USER_TOKEN>` (`vrcp_usr_<64-hex>`) for authenticated user endpoints; anonymous with verification proof for unauthenticated creator delisting.  
**Consolidation:** Combines all former registrant routes and `/v1/delist` into a unified namespace.

| Method | Path | Auth | Status | Description | Request Payload | Response (2xx) |
|---|---|:---:|:---:|---|---|---|
| `POST` | `/v1/user/nodes` | `vrcp_usr_` | ✅ | Provisions a capability-encoded node token for a VPS or Crawler Client. | `{ schemaVersion: 1, nodeId, requestedCapabilities[]?, reason? }` | `201` `{ nodeId, capabilities[], token: "vrcp_<64><4>" }` |
| `POST` | `/v1/user/apps` | `vrcp_usr_` | ✅ | Registers a downstream application under this user's account. | `{ schemaVersion: 1, appName, contactEmail?, description? }` | `201` `{ appId, appName, appToken: "vrcp_app_<64>", permissions[] }` |
| `POST` | `/v1/user/delist` | Optional (`vrcp_usr_` or None) | ✅ | Unified delisting route. Authenticated users delist on their own behalf (auth is proof). Unauthenticated creators require `proofKind` (`dns_txt` \| `storefront_bio_token`). | `{ schemaVersion: 1, targetUrl?, canonicalId?, reason, contactEmail?, proofKind?, proofValue? }` | `202` `{ status: "accepted", takedownId, target, action: "delisted", requesterType, recordedAt }` |
| `GET` | `/v1/user` | `vrcp_usr_` | 🔲 | Returns current user profile, active nodes, registered apps, and takedown records. | None | `200` `{ userId, email, nodes[], apps[], takedowns[] }` |
| `DELETE` | `/v1/user/nodes/{nodeId}` | `vrcp_usr_` | 🔲 | Revokes a node credential owned by this user. | None | `200` `{ status: "revoked" }` |
| `DELETE` | `/v1/user/apps/{appId}` | `vrcp_usr_` | 🔲 | Revokes an application credential owned by this user. | None | `200` `{ status: "revoked" }` |

---

### §2.4 Downstream Application Protocol (`/v1/app/*`)

**Auth:** Public for read index and delta sync; `Authorization: Bearer <APP_TOKEN>` (`vrcp_app_<64-hex>`) for search and reporting.  
**Consolidation:** Unifies all catalog querying, delta streaming, application registration, and feedback/report ingestion.

| Method | Path                   |          Auth           | Status | Description                                                                                                                                                                                                         | Request / Query                                                                                                                                         | Response (2xx)                                                       |
| ------ | ---------------------- | :---------------------: | :----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `POST` | `/v1/app/register`     | `vrcp_usr_` or Operator |   ✅    | Registers a downstream application. Gated by user or operator auth.                                                                                                                                                 | `{ schemaVersion: 1, appName, contactEmail?, description? }`                                                                                            | `201` `{ appId, appName, appToken: "vrcp_app_<64>", permissions[] }` |
| `GET`  | `/v1/app/index`        |         Public          |   ✅    | Core package catalog projection. Bounded search without unbounded pagination.                                                                                                                                       | Query: `query?`, `category?`, `umbrella?`, `platform?`, `limit?` (max 50)                                                                               | `200` `{ packages[], count }`                                        |
| `GET`  | `/v1/app/index/delta`  |         Public          |   ✅    | Continuous incremental sync feed for package managers (VCC/ALCOM). Emits `upsert` and `delist` events.                                                                                                              | Query: `cursor?`, `limit?` (max 100)                                                                                                                    | `200` `{ epoch, deltas[], nextCursor }`                              |
| `POST` | `/v1/app/index/search` |       `vrcp_app_`       |   ✅    | Bounded search with query attribution. Distinguishes direct human searches from automated background engine queries.                                                                                                | `{ schemaVersion: 1, query, queryOrigin: "user_authored" \| "app_automated", category?, umbrella?, platform?, tags[]?, limit? }`                        | `200` `{ items[], count, queryOrigin }`                              |
| `GET`  | `/v1/app/index/random` |       `vrcp_app_`       |   ⏸️   | Random package sampling for discovery showcases.                                                                                                                                                                    | Query: `umbrella?`, `category?`, `platform?`, `limit?`                                                                                                  | *On Hold / Redefining*                                               |
| `POST` | `/v1/app/reports`      |       `vrcp_app_`       |   ✅    | Consolidated reporting route: ingests search demand signals (`search_miss`, `refresh_demand`, `popularity_signal`) and content/quality reports (`broken_link`, `wrong_metadata`, `misclassified`, `inappropriate`). | `{ schemaVersion: 1, reportType: "demand_signal" \| "issue_report", signalKind?, reportKind?, targetUrl?, canonicalId?, query?, zeroHits?, metadata? }` | `200` `{ status: "accepted", reportId, recordedAt }`                 |

---

## 3. Role × Route Access Matrix

| Route | Admin Operator | User | Downstream App | Crawler Node | Public Anonymous |
|---|:---:|:---:|:---:|:---:|:---:|
| `POST /v1/node/jobs/claim` | — | — | — | ✅ | — |
| `POST /v1/node/heartbeat` | — | — | — | ✅ | — |
| `POST /v1/node/jobs/result` | — | — | — | ✅ | — |
| `GET /v1/operator/leads` | ✅ | — | — | — | — |
| `POST /v1/operator/leads/{key}/approve` | ✅ | — | — | — | — |
| `POST /v1/operator/leads/{key}/reject` | ✅ | — | — | — | — |
| `GET /v1/operator/source-profiles` | ✅ | — | — | — | — |
| `POST /v1/operator/source-profiles` | ✅ | — | — | — | — |
| `POST /v1/operator/source-profiles/{id}/disable` | ✅ | — | — | — | — |
| `GET /v1/operator/autoqueue-rules` | ✅ | — | — | — | — |
| `POST /v1/operator/autoqueue-rules` | ✅ | — | — | — | — |
| `POST /v1/operator/autoqueue-rules/{id}/disable` | ✅ | — | — | — | — |
| `POST /v1/operator/nodes` | ✅ | — | — | — | — |
| `GET /v1/operator/catalog` | ✅ | — | — | — | — |
| `GET /v1/operator/takedowns` | ✅ | — | — | — | — |
| `POST /v1/operator/takedowns/{id}/verify` | ✅ | — | — | — | — |
| `POST /v1/user/nodes` | — | ✅ | — | — | — |
| `POST /v1/user/apps` | — | ✅ | — | — | — |
| `POST /v1/user/delist` | — | ✅ | — | — | ✅ (proof-gated) |
| `GET /v1/user 🔲 | — | ✅ | — | — | — |
| `DELETE /v1/user/nodes/{id}` 🔲 | — | ✅ | — | — | — |
| `DELETE /v1/user/apps/{id}` 🔲 | — | ✅ | — | — | — |
| `POST /v1/app/register` | ✅ | ✅ | — | — | — |
| `GET /v1/app/index` | — | — | — | — | ✅ |
| `GET /v1/app/index/delta` | — | — | — | — | ✅ |
| `POST /v1/app/index/search` | — | — | ✅ | — | — |
| `GET /v1/app/index/random` ⏸️ | — | — | ✅ | — | — |
| `POST /v1/app/reports` | — | — | ✅ | — | — |

---

## 4. Deep-Dive Design Clarifications

### 4.1 Why Plaintext Tokens Are Never Exposed to Admin Operators

In traditional architectures, admin panels often allow viewing or re-copying API keys. In this system:
1. **Zero-Knowledge Token Persistence:** All credentials (`node`, `app`, `user`) are hashed with SHA-256 upon issuance. The database stores `token_hash`, not the token.
2. **Role Separation:** An Admin Operator manages infrastructure (routes, rate limits, rules, storage). Node provisioning belongs to the **User/Registrant** tier.
3. **Anti-Leak Invariant:** Tokens are emitted strictly once in the creation response (`no-store` HTTP headers). If lost, the token must be revoked and re-issued.

### 4.2 Search Design: Bounded Results & Query Attribution

Downstream apps (e.g. desktop managers, ALCOM, VCC, curation tools) frequently perform both human-initiated and background-automated searches:
- **No Unbounded Pagination:** Search queries return bounded top-K result slices (`limit <= 50`). This prevents scrapers from using search endpoints to dump the entire catalog and focuses resources on relevant matching packages. Complete catalog replication is handled exclusively by `/v1/app/index/delta`.
- **Query Attribution (`queryOrigin`):**
  - `"user_authored"`: A human typed the query into a search bar. The coordinator treats search misses or popularity trends here as high-priority signals to lease crawler nodes toward missing content.
  - `"app_automated"`: Triggered by background recommendation algorithms, cache pre-warming, or dependency resolution. Logged for analytics, but prevented from skewing organic human workforce distribution.
