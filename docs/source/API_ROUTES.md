# API Route Reference (Candidate Source Document)

> **Document Status:** Candidate Source — v0 Pre-Production  
> **Last Updated:** 2026-10-01  
> **Source:** `src-crawler/src/worker/api/` · `src-crawler/src/shared/protocol/`  
> **Status:** ✅ Implemented · 🔲 Planned · ⚠️ Partial

---

## Token Types

| Token | Format | Length | Issued By | Scope |
|---|---|---|---|---|
| Node | `vrcp_<64-hex><4-hex>` | 73 chars | Coordinator (operator or registrant) | Crawler Node — platform capability bitmask in final 4 hex chars |
| Downstream App | `vrcp_app_<64-hex>` | 73 chars | Coordinator (registrant or open registration) | Catalog read, search, random, demand feedback |
| Registrant | `vrcp_reg_<64-hex>` | 73 chars | Web Operator Panel (Firebase Auth) | Node issuance, app registration, self-service delist |
| Admin Operator | `COORDINATOR_OPERATOR_TOKEN` (64-hex env) | 64 chars | Set at `init` time | Full infrastructure control |

All tokens are stored as SHA-256 hashes. Plaintext is returned once at issuance, never logged or re-readable.

---

## Routes

### §1 — Crawler Node Protocol `/v1/node/*`

Auth: `Authorization: Bearer <NODE_TOKEN>` (`vrcp_<64-hex><4-hex>`)  
Handler: `handler.ts` · Schema: `node_protocol.ts`

| Method | Path | Status | Description | Request body fields | Response (2xx) |
|---|---|:---:|---|---|---|
| `POST` | `/v1/node/jobs/claim` | ✅ | Request an origin lease and crawl job. The coordinator checks capability mask, robots, source-access profile, and active lease state. | `nodeId`, `leaseId` (uuid), `platform` | `200` `{ status: "leased", jobId, leaseId, url, platform, minDelayMs, origin, leaseExpiresAt }` or `{ status: "empty", retryAfterMs }` |
| `POST` | `/v1/node/heartbeat` | ✅ | Renew active job lease and confirm liveness. | `nodeId`, `jobId`, `leaseId` | `200` `{ status: "ok", leaseExpiresAt }` |
| `POST` | `/v1/node/jobs/result` | ✅ | Submit crawl observation, discovered leads, or access failure. Transitions job state and updates canonical catalog. | `nodeId`, `jobId`, `leaseId`, `outcome`, `observations[]`, `discoveredLeads[]` | `200` `{ status: "accepted", jobId }` |

---

### §2 — Admin Operator Protocol `/v1/operator/*`

Auth: `Authorization: Bearer <COORDINATOR_OPERATOR_TOKEN>` (64-hex env, constant-time compare)  
Handler: `operator_handler.ts` · Schema: `operator_protocol.ts`

| Method | Path | Status | Description | Key request body fields | Response (2xx) |
|---|---|:---:|---|---|---|
| `POST` | `/v1/operator/nodes` | ✅ | Issue a capability-encoded node credential. Auto-selects most underserved platform set when `capabilities` is omitted. | `nodeId`, `capabilities[]` (optional), `reason` (optional) | `201` `{ nodeId, capabilities[], token: "vrcp_<64><4>" }` |
| `GET` | `/v1/operator/leads` | ✅ | List pending discovery leads with keyset pagination. | Query: `status`, `limit`, `cursor` | `200` `{ leads[], nextCursor }` |
| `POST` | `/v1/operator/leads/{leadKey}/approve` | ✅ | Approve a pending lead and seed it into the crawl queue. | `minDelayMs` | `200` `{ status: "approved" }` |
| `POST` | `/v1/operator/leads/{leadKey}/reject` | ✅ | Permanently reject a pending lead. | `reason` (optional) | `200` `{ status: "rejected" }` |
| `GET` | `/v1/operator/source-profiles` | ✅ | Page through all source-access profiles. | Query: `limit`, `cursor` | `200` `{ profiles[], nextCursor }` |
| `POST` | `/v1/operator/source-profiles` | ✅ | Create a scoped source-access profile. Required before any live URL fetch. | `origin`, `pathScope`, `purpose`, `minDelayMs`, `allowedEvidenceClasses[]`, `reason`, `expiresAt` | `201` `{ profile }` |
| `POST` | `/v1/operator/source-profiles/{profileId}/disable` | ✅ | Disable a source-access profile and block new leases. | `reason` | `200` `{ status: "disabled" }` |
| `GET` | `/v1/operator/autoqueue-rules` | ✅ | List auto-queue rules. | Query: `limit`, `cursor` | `200` `{ rules[], nextCursor }` |
| `POST` | `/v1/operator/autoqueue-rules` | ✅ | Create an expiring, path-scoped auto-queue rule. Seeds incoming leads automatically without individual approval. | `leadKind`, `origin`, `pathScope`, `minDelayMs`, `expiresAt`, `reviewReference`, `reason` | `201` `{ rule }` |
| `POST` | `/v1/operator/autoqueue-rules/{ruleId}/disable` | ✅ | Disable an active auto-queue rule. | `reason` | `200` `{ status: "disabled" }` |
| `GET` | `/v1/operator/catalog` | ✅ | Page canonical package catalog (newest-first). Operator view; public version is `GET /v1/catalog`. | Query: `limit`, `cursor` | `200` `{ packages[], nextCursor }` |
| `POST` | `/v1/operator/registrants` | 🔲 | Issue a registrant token directly (invite-only onboarding path). | `registrantName`, `contactEmail` (optional) | `201` `{ registrantId, registrantName, token: "vrcp_reg_<64>" }` |
| `GET` | `/v1/operator/registrants` | 🔲 | List registered registrants with pagination. | Query: `limit`, `cursor` | `200` `{ registrants[], nextCursor }` |
| `POST` | `/v1/operator/registrants/{registrantId}/revoke` | 🔲 | Revoke a registrant token. Issued node and app tokens remain valid until separately revoked. | `reason` | `200` `{ status: "revoked" }` |
| `GET` | `/v1/operator/takedowns` | 🔲 | List all `creator_opt_outs` records, filterable by `requester_type` and review status. | Query: `requesterType`, `limit`, `cursor` | `200` `{ records[], nextCursor }` |
| `POST` | `/v1/operator/takedowns/{takedownId}/verify` | 🔲 | Mark an unauthenticated creator takedown as operator-verified after manual review. Triggers lifecycle transition if not already applied. | `verdict: "accepted" | "rejected"`, `notes` (optional) | `200` `{ status }` |

---

### §3 — Registrant Protocol `/v1/registrant/*` and `/v1/delist`

Auth: `Authorization: Bearer <REGISTRANT_TOKEN>` (`vrcp_reg_<64-hex>`)  
Handler: `registrant_handler.ts` · Schema: `downstream_protocol.ts`

Registrants are distinct from admin operators (infrastructure control) and downstream apps (catalog consumers). Registrant tokens are issued by the Web Operator Panel after Firebase Auth identity verification.

| Method | Path | Auth | Status | Description | Key request body fields | Response (2xx) |
|---|---|:---:|:---:|---|---|---|
| `POST` | `/v1/registrant/nodes` | `vrcp_reg_` | ✅ | Issue a capability-encoded Crawler Node token on behalf of the registrant. Coordinator may restrict capabilities based on workforce distribution. | `nodeId`, `requestedCapabilities[]` (optional), `reason` (optional) | `201` `{ nodeId, capabilities[], token: "vrcp_<64><4>" }` |
| `POST` | `/v1/registrant/apps` | `vrcp_reg_` | ✅ | Register a downstream application and issue a `vrcp_app_` credential. | `appName`, `contactEmail` (optional), `description` (optional) | `201` `{ appId, appName, appToken: "vrcp_app_<64>", permissions[] }` |
| `POST` | `/v1/registrant/delist` | `vrcp_reg_` | ✅ | Self-service delisting for content the registrant owns. Auth is proof — no external `proofKind` required. Immediately transitions packages to `lifecycle=delisted`. | `targetUrl` (or `canonicalId`), `reason`, `contactEmail` (optional) | `202` `{ status: "accepted", takedownId, target, action: "delisted", requesterType: "registrant", recordedAt }` |
| `GET` | `/v1/registrant/me` | `vrcp_reg_` | 🔲 | Return the registrant's profile: registered nodes, apps, and takedown history. | — | `200` `{ registrantId, registrantName, nodes[], apps[], takedowns[] }` |
| `DELETE` | `/v1/registrant/nodes/{nodeId}` | `vrcp_reg_` | 🔲 | Revoke a node credential issued by this registrant. | — | `200` `{ status: "revoked" }` |
| `DELETE` | `/v1/registrant/apps/{appId}` | `vrcp_reg_` | 🔲 | Revoke a downstream app credential issued by this registrant. | — | `200` `{ status: "revoked" }` |
| `POST` | `/v1/delist` | None (proof-gated) | ✅ | Unauthenticated creator takedown. Requires `proofKind: storefront_bio_token | dns_txt`. `manual_notice` is rejected — use the email channel (LEGAL.md §9.2). Proof *verification* is deferred to operator review. | `targetUrl` (or `canonicalId`), `reason`, `proofKind`, `proofValue`, `contactEmail` (optional) | `202` same envelope with `requesterType: "unauthenticated_creator"` |

---

### §4 — Downstream Consumer Protocol `/v1/apps/*`, `/v1/catalog/*`

Auth (authenticated routes): `Authorization: Bearer <APP_TOKEN>` (`vrcp_app_<64-hex>`)  
Handler: `downstream_handler.ts` · Schema: `downstream_protocol.ts`

| Method | Path | Auth | Status | Description | Key request/query fields | Response (2xx) |
|---|---|:---:|:---:|---|---|---|
| `POST` | `/v1/apps/register` | None (open) | ⚠️ | Register a downstream app and issue catalog credentials. **Open registration — registrant gate planned.** Use `/v1/registrant/apps` for the gated path. | `appName`, `contactEmail` (optional), `description` (optional) | `200` `{ appId, appName, appToken: "vrcp_app_<64>", permissions[] }` |
| `POST` | `/v1/apps/feedback` | `vrcp_app_` | ✅ | Ingest search activity, cache-miss, and demand signals. Used to reorient workforce and bump crawl priority for high-demand packages. | `signalType`, `query`, `zeroHits`, `requestedPlatform`, `targetUrl`, `category`, `metadata` | `200` `{ status: "accepted", signalId, recordedAt }` |
| `POST` | `/v1/catalog/search` | `vrcp_app_` | ✅ | Full-text and faceted catalog search with keyset pagination. | `query`, `umbrella`, `category`, `platform`, `limit`, `cursor` | `200` `{ items[], nextCursor, totalEstimated }` |
| `GET` | `/v1/catalog/random` | `vrcp_app_` | ✅ | Randomly sample catalog entries for discovery feeds. | Query: `limit` (1–50), `umbrella`, `category`, `platform` | `200` `{ items[] }` |
| `POST` | `/v1/reports` | `vrcp_app_` | 🔲 | Submit a curation or error report about a specific package (broken link, wrong metadata, misclassified). Distinct from demand feedback. | `canonicalId` (or `targetUrl`), `reportKind`, `description`, `contactEmail` | `202` `{ status: "accepted", reportId, recordedAt }` |
| `GET` | `/v1/catalog` | None | ✅ | Public paginated catalog read. `Cache-Control: public, max-age=60`. Excludes `delisted` packages. | Query: `limit` (1–100), `cursor` | `200` `{ packages[], nextCursor }` |
| `GET` | `/v1/catalog/delta` | None | ✅ | Incremental delta feed ordered `updated_at ASC`. Emits `upsert` and `delist` envelopes. Stable epoch across restarts for client sync resume. | Query: `limit` (1–100), `cursor` | `200` `{ epoch, deltas[], nextCursor }` |

---

## Role × Route Matrix

| Route | Admin Operator | Registrant | Downstream App | Node | Public |
|---|:---:|:---:|:---:|:---:|:---:|
| `POST /v1/node/jobs/claim` | | | | ✅ | |
| `POST /v1/node/heartbeat` | | | | ✅ | |
| `POST /v1/node/jobs/result` | | | | ✅ | |
| `POST /v1/operator/nodes` | ✅ | | | | |
| `GET /v1/operator/leads` | ✅ | | | | |
| `POST /v1/operator/leads/{key}/approve` | ✅ | | | | |
| `POST /v1/operator/leads/{key}/reject` | ✅ | | | | |
| `GET /v1/operator/source-profiles` | ✅ | | | | |
| `POST /v1/operator/source-profiles` | ✅ | | | | |
| `POST /v1/operator/source-profiles/{id}/disable` | ✅ | | | | |
| `GET /v1/operator/autoqueue-rules` | ✅ | | | | |
| `POST /v1/operator/autoqueue-rules` | ✅ | | | | |
| `POST /v1/operator/autoqueue-rules/{id}/disable` | ✅ | | | | |
| `GET /v1/operator/catalog` | ✅ | | | | |
| `POST /v1/operator/registrants` 🔲 | ✅ | | | | |
| `GET /v1/operator/registrants` 🔲 | ✅ | | | | |
| `POST /v1/operator/registrants/{id}/revoke` 🔲 | ✅ | | | | |
| `GET /v1/operator/takedowns` 🔲 | ✅ | | | | |
| `POST /v1/operator/takedowns/{id}/verify` 🔲 | ✅ | | | | |
| `POST /v1/registrant/nodes` | | ✅ | | | |
| `POST /v1/registrant/apps` | | ✅ | | | |
| `POST /v1/registrant/delist` | | ✅ | | | |
| `GET /v1/registrant/me` 🔲 | | ✅ | | | |
| `DELETE /v1/registrant/nodes/{id}` 🔲 | | ✅ | | | |
| `DELETE /v1/registrant/apps/{id}` 🔲 | | ✅ | | | |
| `POST /v1/delist` (proof-gated) | | | | | ✅ |
| `POST /v1/apps/register` ⚠️ (open) | | | | | ✅ |
| `POST /v1/apps/feedback` | | | ✅ | | |
| `POST /v1/catalog/search` | | | ✅ | | |
| `GET /v1/catalog/random` | | | ✅ | | |
| `POST /v1/reports` 🔲 | | | ✅ | | |
| `GET /v1/catalog` | | | | | ✅ |
| `GET /v1/catalog/delta` | | | | | ✅ |
