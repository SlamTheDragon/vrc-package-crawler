# Code-path inventory and migration boundary

This is a descriptive inventory of the version-0 implementation, not a claim that its behavior is correct. It supports the staged work in `IMPLEMENTATION_PLAN.md`. The owner's clarified target is a local, offline-capable coordinator/catalog with real-source crawler ingestion; the coordinator's contracts should be portable to a future Cloudflare Worker. A standalone crawler-node binary must continue to run on a VPS or desktop. No Cloudflare account is required for the local milestone. The new coordinator database starts empty. `bin/crawler_state.db` is prototype evidence to inspect read-only, while `dist/crawler_state.db` can be created by current imports/tests and is not the intended migration source.

## Executable surfaces

| Entry point or command | Current behavior | External or persistent effects | Planned owner |
| --- | --- | --- | --- |
| `src-crawler/src/crawler/index.ts` (`start`, `build:crawler`, `build:linux`) | Seeds and runs seven platform workers plus creator harvesting and a monitor; owns shutdown, lock, IPC, projection and export triggers | Origin requests, SQLite writes, local IPC, image metadata, possible edge sync | Crawler node for fetching; projection and publication migrate to local coordinator |
| `src-crawler/src/monitor/index.ts` (`monitor`, `build:monitor`) | Starts/stops and inspects the local crawler process over IPC | Child process, local IPC and DB reads | Node operator CLI; later coordinator controls through a distinct client |
| `src-crawler/src/server/index.ts` (`server`, `build:server`) | Bun HTTP gateway for catalog, media, reports, opt-out and telemetry | DB reads/writes, DNS and image-origin requests | Local coordinator API, then Worker-compatible request handler plus runtime adapters |
| `src-crawler/src/crawler/projection.ts` (`project`, daemon) | Relevance, normalization, clustering, fronts and catalog epoch | Reads/writes entities, canonical packages, fronts and frontier | Coordinator catalog projection, not node fetch loop |
| `src-crawler/src/crawler/steering.ts` (daemon/IPC) | Applies reports and pulls feedback from directory or R2 | DB mutations, filesystem and Cloudflare API requests | Coordinator review/feedback service; remote pull optional adapter |
| `src-crawler/src/sync/index.ts` (`sync`, `build:sync`) | D1 publication or local backup using checkpoints | Cloudflare API or local files and DB checkpoints | Migration/replication adapter, not coordinator core |
| `src-crawler/src/sync/exporter.ts` (`export`, `build:export`) | Builds standalone SQLite/FTS catalog and observation export | Reads DB, writes another SQLite file | Local coordinator export adapter |
| `src-crawler/src/utils/sharp_worker.ts` | Spawned by image proxy for image metadata | Image processing worker process | Node-only media adapter pending G1 review |
| `node/main.ts` (`node`, `build:node`) | Top-level standalone entry point loads a versioned launch-directory config or legacy environment settings, then claims purpose-bearing jobs over HTTP and submits validated results; VPM/GitHub/product metadata and BOOTH browse-to-pending-leads parsing remain narrow | `init` writes one non-secret `node.config.json` in the launch directory; runtime adapters remain under `src-crawler/src/node/`; profile-leased HTTPS requests and result submissions do not write the original crawler DB | Move remaining node-only modules in tested slices, design node DB ownership, and expand policy-aware source adapters in G3/G5 |
| `worker/main.ts` (`coordinator`, `build:coordinator`) | Top-level local coordinator entry point initializes or loads a versioned, non-secret launch-directory config, then exposes SQLite-backed claim/result and operator APIs; CLI supports register/seed/revoke, source profiles, robots refresh and inspection | Configured `coordinator.db` is created in its launch directory only after `init`; legacy environment launch retains explicit `COORDINATOR_DB_PATH` or its prior default. Loopback HTTP and scoped live fetches still require profile/robots checks | Move remaining local coordinator adapters in tested slices; add source/catalog projection, reports, public API and Worker runtime adapter |

`package.json` builds the legacy binaries plus separate node/coordinator binaries. The new `src-crawler/src/worker/handler.ts` is a Worker-portable `Request → Response` core and passes a browser-target bundle check; it is not a deployed Worker entry point or complete catalog API.

## Source ownership and seams

| Current files | Current responsibilities and noteworthy coupling | Destination or contract seam |
| --- | --- | --- |
| `src-crawler/src/drivers/{booth,github,vpm_index,gumroad,jinxxy,itch,curated}/{index,discovery,harvesting,seeding}.ts` | Seven adapters do origin fetches and/or discovery, parsing, relevance decisions, frontier/entity writes and cross-link expansion. `index.ts` keeps per-adapter abort state. | `src-crawler/src/node/drivers/` eventually owns fetch, parse and lead extraction. Typed observations/results cross to coordinator; no adapter writes canonical tables. |
| `src-crawler/src/node/driver_runtime.ts` | Shared cancellation/pacing implementation replacing seven identical copies. | Node-only; per-adapter instances retained. |
| `src-crawler/src/db.ts` | Singleton SQLite database, schema initialization, frontier, opt-out, entities, catalog, reports, patterns and checkpoint methods in one class. Import initializes the DB. | Split into explicit node state and coordinator repositories; move schema/migrations to one owner. No singleton on import in portable core. |
| `src-crawler/src/config.ts`, `src-crawler/src/logger.ts`, `src-crawler/src/ratelimit.ts` | Process environment/paths, logging, and origin limiters. | Node runtime adapters; coordinator configuration/logging separate. Shared protocol types may live under `src-crawler/src/shared/`. |
| `src-crawler/src/filter.ts`, `src-crawler/src/classifier.ts`, `src-crawler/src/utils/{sanitizer,simhash,iana}.ts` | Relevance, classification, normalization, similarity and domain validation. IANA now uses offline bootstrap by default; `IANA_REFRESH=1` opts into live refresh. | Pure classification/projection core where possible; evaluate an authoritative offline suffix package. Taxonomy is a G2/G4 decision. |
| `src-crawler/src/utils/{robots,adaptive_limiter,circuit_breaker,poisson_scheduler,lock,ipc}.ts` | Origin access and scheduling policy, local lock/IPC. | Node execution adapters plus coordinator-issued origin lease/policy. Lock remains local; leases are cross-node. |
| `src-crawler/src/utils/image_proxy.ts`, `src-crawler/src/utils/sharp_worker.ts` | Media URL checks, metadata, stream and worker process. The unused WebP conversion is removed; compiled mode still uses the subprocess for BlurHash/pHash. | Separate coordinator media HTTP adapter from node-only image analysis; compiled subprocess parity remains to test. |
| `src-crawler/src/shared/report_validation.ts` imported by `src-crawler/src/server/index.ts` and `src-crawler/src/crawler/steering.ts` | Report validation has already been extracted from the Bun HTTP server, removing that import-time coupling. | Keep the shared contract portable while report storage/review moves to the coordinator. |
| `src-crawler/src/sync/*` | Cloudflare coupling and export share local database models. | Optional adapters over coordinator catalog revision/outbox. |

## Network and storage audit checklist

| Path | Current sites to trace | Gate test required before move |
| --- | --- | --- |
| Source HTTP | All seven drivers, including GitHub API/HTML and VPM repository discovery | Origin policy, robots, challenge/429, redirects, conditional fetch, lead versus evidence |
| Support HTTP | `robots.ts`, `iana.ts`, `image_proxy.ts`, IPC client | Hermetic fixtures; injection/SSRF and source-availability behavior |
| Cloudflare HTTP | `sync/index.ts`, `crawler/steering.ts` | Disabled local path works with no credentials; eventual adapter parity |
| Public HTTP | `server/index.ts`: `/`, `/v1/health`, `/v1/media/stream`, `/v1/media/:id`, `/v1/thumbs/:id`, `/v1/catalog/delta`, `/v1/packages/stream`, `/v1/vpm/index.json`, `/index.json` | Route inventory, terms, cursor/revision, media safety, versioned schema |
| Mutating HTTP | `server/index.ts`: `/v1/reports`, `/v1/opt-out`, `/v1/telemetry` | Scoped auth, validation, rate limiting, opt-out propagation, review authority |
| SQLite writes | `db.ts`, `crawler/projection.ts`, `crawler/steering.ts`, `sync/index.ts`, `sync/exporter.ts` | Transaction/replay and writer ownership; source version versus catalog revision |
| Local process/files | `crawler/index.ts`, `monitor/index.ts`, `utils/{lock,ipc,image_proxy}.ts`, `sync/*` | Binary smoke, crash recovery and recovery from coordinator loss |

## Coverage and migration order

The historical `src-crawler/src/tests/phase*.test.ts` files cover past milestones, not every production path. `src-crawler/src/tests/gate1_safety_baseline.test.ts`, `src-crawler/src/tests/local_coordinator_protocol.test.ts`, `src-crawler/src/tests/source_access_profile.test.ts`, `src-crawler/src/tests/robots_refresh_service.test.ts` and `src-crawler/src/tests/node_observation_adapter.test.ts` cover the newer safety and boundary slices. Compiled local/multi-process and narrow profile-gated GitHub/VPM live smokes have passed. Projection no longer attempts live IANA access by default. Tests do not yet prove compiled Sharp subprocess parity, sustained cross-process origin pacing under natural time, multi-node delisting, complete real-driver ingestion or Worker runtime behavior.

1. Keep legacy commands and binary builds green while extracting pure protocol and validation modules.
2. Give `src-crawler/src/node/` source-fetching and local node runtime ownership; give `src-crawler/src/worker/` a runtime-neutral `Request → Response` coordinator core and a local HTTP/SQLite adapter. `src-crawler/src/shared/` owns the versioned wire schemas and runtime validation, not database side effects. In-process simulation must serialize and validate payloads through the same handler; the compiled node uses those routes over loopback HTTP.
3. Move one vertical slice through node result submission, local coordinator validation/persistence, projection and delta. Compare local behavior to legacy tests before moving the remaining drivers.
4. After every driver has crossed the boundary, retire duplicate legacy entry points only when the replacement binary and API have equivalent tested behavior. Cloudflare Worker/D1 adapters remain a later deployment option.

Open decisions: source-specific approval and retention, source roles, query/encoded-path policy, the public catalog projection, and future Worker/D1 storage semantics. The local coordinator already has scoped node credential rotation/revocation, SQLite leases and a separate source-profile fetch gate; those narrow capabilities do not close the remaining gates.
