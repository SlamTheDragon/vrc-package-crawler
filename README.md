# VRC Package Crawler

This repository is evolving from a single-process VRChat package crawler into a local coordinator plus standalone crawler nodes. The intended catalog covers Tools, Assets, and Avatars. The Phase 1–4 crawler/export/server source paths remain for transition, but their former package scripts are no longer current entry points. The local pre-production architecture provides two distinct processes, configurations, and SQLite databases (`coordinator.db` and `node.db` via `LocalNodeStore`) operating concurrently in the same launch directory or separate locations without collision. See [docs/scratch/decisions/plans/IMPLEMENTATION_PLAN.md](docs/scratch/decisions/plans/IMPLEMENTATION_PLAN.md) for the gates and [docs/scratch/decisions/current/status/CONFORMANCE.md](docs/scratch/decisions/current/status/CONFORMANCE.md) for what has actually been demonstrated.

**Current working directory:** run the Bun commands below from `src-crawler/`, which owns `package.json`, shared crawler modules, `scratch/`, and compiled `dist/`. The standalone entry points and runtime adapters live under `src-crawler/src/node/` and `src-crawler/src/worker/`. The node persists its own execution and task receipts in `node.db`, while the coordinator manages leases and source evidence in `coordinator.db`. See the [documentation map](docs/scratch/decisions/DOCUMENT_MAP.md) for the four document categories and authority boundaries. Later Phase 1–4 binary/layout descriptions below are historical until they are reconciled with this split.

The system links back to original creator sources and does not download or redistribute binary assets. Descriptions and thumbnails are third-party material, not automatically “factual metadata”; source-specific access, retention, and publication rules remain under review. See [LEGAL.md](LEGAL.md) for the intended terms and their implementation-status notice.

## Local coordinator slice

The local coordinator uses a fresh SQLite file at `bin/local_coordinator.db` only on the older environment/default launch path. In a dedicated compiled-binary launch directory, `vrc-coordinator.exe init [listen-port]` creates a non-secret `coordinator.config.json` once; subsequent commands use `coordinator.db` beside that file. An explicit `COORDINATOR_CONFIG_PATH` can select a config, while a present invalid config fails closed. The operator bearer key remains separate in `COORDINATOR_OPERATOR_TOKEN`. No config initialization opens a database, and existing files are never overwritten. The coordinator does not import `bin/crawler_state.db`. A queued job is not permission to fetch. First record a separate, source-reviewed access profile with an exact origin/path, purpose, expiry, retention classes, and review reference. Then prepare the job; the node uses the versioned API over loopback HTTP:

```powershell
bun run coordinator -- register my-node vpm
# After source-specific review, create a scoped profile for the URL being tested.
# See docs/scratch/decisions/current/access/SOURCE_ACCESS_GATE_DESIGN.md for the profile JSON contract.
bun run coordinator -- profile-create '<reviewed-profile-json>'
bun run coordinator -- seed vpm https://vrchat-community.github.io/template-package/index.json 1000 discovery
bun run coordinator -- refresh-queued-robots
bun run coordinator -- serve 8787
# After the profile's minimum post-robots delay, set NODE_ID=my-node and NODE_TOKEN
# to the registration token in a second terminal:
bun run node -- --once
```

Registration defaults to all eight currently selectable coordinator capabilities unless scoped as above. Jobs are seeded explicitly; default selection is not a claim that every platform permits live automated access. A seed and an auto-queued lead both need a separate matching active source-access profile before robots refresh or a fetch lease. The `profile-create <json>`, `profiles`, and `profile-disable <id> <reason>` commands manage local, audited profiles; creating one records an operator judgment, not a legal finding. After a reviewed profile and matching job exist, `serve` refreshes robots for up to ten due origins on startup and every minute. A cross-process lease prevents duplicate refreshes; each request has a 15-second timeout, safe HTTPS redirects, and a bounded response. Claims remain empty when robots is absent, stale, or disallowing. The explicit `refresh-queued-robots [limit]` command remains useful before a one-shot node run, as in the example above; `refresh-robots <https-origin>` refreshes one origin only if it has a due job with a matching active profile. None of these commands alone grants source permission. The current node adapter supports direct VPM package JSON, bounded published listings, template recipe leads, limited product-page metadata, and a bounded Shopify product-sitemap lead path—not broad discovery or arbitrarily large feeds. Keep the legacy crawler path separate until the remaining gates pass.

For a separate compiled-node launch directory, run `vrc-node.exe init <node-id> [coordinator-url] [comma-separated-capabilities]` **from that directory**. It creates `node.config.json` once with version, node ID, coordinator URL, capabilities, and databaseFile (`node.db`), and refuses to overwrite it. Supply the coordinator-issued key separately through `NODE_TOKEN`; the config rejects embedded tokens. On startup the node loads that file from its working directory, or an explicit `NODE_CONFIG_PATH`; a present but invalid file fails closed. When started, the node creates and maintains its local execution database `node.db` via `LocalNodeStore`. If neither file exists, the previous `NODE_ID`/`NODE_CAPABILITIES`/`COORDINATOR_URL` environment path still works.

Robots preflight and product fetches share the coordinator's per-origin pacing clock. A refresh holds its own origin lease, so a node claim waits for that refresh to finish **and** for the profile's minimum delay to elapse. One-shot live smoke scripts wait on the persisted due time rather than immediately claiming after robots.

The compiled `serve` process also exposes a separate loopback `/v1/operator/*` control API when `COORDINATOR_OPERATOR_TOKEN` is configured as a CSPRNG-generated 64-character hex token. It lists leads, supports audited manual approval/rejection, manages expiring VPM-listing auto-queue rules, creates/lists/disables source-access profiles, and issues node credentials under operator authority; node tokens cannot use it. New leads matching an active origin/path auto-queue rule may become jobs, while unknown leads remain pending. That rule is not a fetch approval: the job still needs a matching source-access profile. This is a backend path for a future admin dashboard, not a dashboard or complete all-driver source-access policy. See [operator control API](docs/scratch/decisions/current/api/OPERATOR_CONTROL_API.md) for exact scopes and limits.

For an end-to-end pre-production simulation in a shared working directory, run `bun run smoke:preprod`. It builds the binaries, initializes `coordinator.config.json` and `node.config.json`, starts the coordinator and node processes in the exact same directory, provisions scoped source-access profiles, fetches real public online data (VPM index and recipe), records durable results in `coordinator.db` and execution telemetry in `node.db`, and verifies zero database or lock collisions. For a no-network process-topology check, run `bun run smoke:local`. It launches one coordinator and two standalone node processes, asserts distinct PIDs, and verifies each node's heartbeat through the loopback API. The nodes do not receive the coordinator's SQLite path.

The standalone node uses a bounded, DNS-pinned HTTPS metadata transport; non-public destinations, redirects, embedded credentials, fragments, and nonstandard ports are rejected. Remote coordinator endpoints also require HTTPS so node tokens are not sent over cleartext. These are network safety controls, not permission to crawl a source. See [node fetch safety](docs/scratch/decisions/current/access/NODE_FETCH_SAFETY.md) and [source access review](docs/scratch/decisions/current/access/SOURCE_ACCESS_REVIEW.md).

While fetching, a node rechecks its exact coordinator lease every five seconds and again before submission. If an operator suppresses the URL or the coordinator becomes unreachable, the node aborts the in-flight metadata request and does not submit an outcome. This is bounded polling, not instantaneous revocation.

The VPM adapter also accepts bounded published `index.json` listings as multi-package evidence. A malformed release creates a partial result with persisted diagnostics rather than silently deleting missing versions; inspect recent entries with `bun run coordinator -- issues` or grouped counts with `bun run coordinator -- inspect`. `bun run coordinator -- vpm-evidence` shows the latest **complete**, not-gone source observation per VPM item for operator review, excluding suppressed listing URLs. This is source evidence, not an installable index or public catalog. A template `source.json` instead yields pending discovery leads. Review them with `bun run coordinator -- leads` or the operator API; after checking a listing host's access policy, `bun run coordinator -- approve-lead <lead-key>` can seed that **listing** URL. It does not create a source-access profile. GitHub repository and ZIP leads cannot be approved as VPM listing jobs. For an isolated, metadata-only real-source check against VRChat's public example listing and template recipe, build the node/coordinator binaries, set `LIVE_VPM_SMOKE=1`, `LIVE_SOURCE_REVIEW_REFERENCE` to the recorded source-specific review, and `LIVE_SOURCE_RETAIN_CLASSES` to the approved evidence classes, then run `bun run smoke:vpm:live`. The script creates short-lived exact-path profiles, queues both sources, and runs two compiled nodes concurrently against a temporary database; it never downloads release ZIPs. These environment values are operator attestations, not proof of permission. See [VPM template research](docs/research/markets/VPM_TEMPLATE_RESEARCH.md), [client-ecosystem research](docs/research/markets/VRC_GET_ECOSYSTEM_RESEARCH.md), and the [read-only prototype DB audit](docs/scratch/decisions/current/audits/PROTOTYPE_DB_AUDIT.md).

The opt-in VPM smoke waits for the running coordinator's automatic robots refresh before starting either node; it is a narrow check of the compiled startup path, not a sustained crawl.

`bun run coordinator -- node-evidence <node-id>` shows bounded submission counts and recent source versions, events, issues, and discovery leads attributed to that authenticated node and its job leases. Pre-migration records have null provenance; operator-created suppression events have no node. This supports local incident review but is not a signature or independent verification of the node's claims.

The new GitHub node path accepts only public `https://api.github.com/repos/{owner}/{repo}` metadata jobs; it does not scrape GitHub HTML, search repositories, or archive README/content. Unauthenticated jobs share a 60-second minimum origin delay, and API reset headers drive backoff. To repeat the one-request compiled-binary check against the public vrc-get repository, set `LIVE_GITHUB_SMOKE=1`, `LIVE_SOURCE_REVIEW_REFERENCE` to the recorded source-specific review, and `LIVE_SOURCE_RETAIN_CLASSES` to the approved evidence classes, then run `bun run smoke:github:live`. It creates a short-lived exact-path profile in a temporary database. This narrow test is not approval for broad collection; see the [source access review](docs/scratch/decisions/current/access/SOURCE_ACCESS_REVIEW.md).

For a no-network two-process coordinator check, run `bun run build:coordinator` and `bun run smoke:multi`. It checks cross-process same-origin leasing, duplicate submission, and suppression against an isolated temporary SQLite file. The scope and remaining concurrency limits are in [the lease spike](docs/research/spikes/MULTIPROCESS_LEASE_SPIKE.md).

---

## Pre-Production Repository Layout

```
vrc-package-crawler/
  .agents/                    Agent specifications, rules, and link-check scripts
  src-crawler/                Crawler engine, coordinator, and standalone node
    src/
      node/                   Standalone crawler node, observation adapter, runtime config
      worker/                 Coordinator request handler, operator API, local SQLite store
      shared/                 Versioned API protocol schemas (Zod) and platform definitions
      utils/                  Shared utilities (circuit breaker, logger, robots.txt)
    dist/                     Compiled standalone binaries (local-node, local-coordinator, worker)
    scratch/                  Reproducible test scripts (smoke_preprod_continuous.ts, etc.)
    config.json               Baseline preprod configuration and identity template
  src-web/                    Downstream operator and registry dashboard (SvelteKit)
  src-crawler-client/         Crawler client library scaffold
  src-package/                Shared strongly typed protocol & domain package (queued for extraction)
  docs/                       Authoritative documentation
    scratch/
      decisions/              Owner decisions, capability gates, conformance, question queue
      history/                Archived Phase 4 execution contract
      legacy-prototype-targets/ Archived Phase 1–4 monolithic guides
    research/                 Primary-source market and technical research
    source/                   Target specification templates
  tests/                      Root pre-production layout conformance tests
```

---

## Prerequisites & Development

- **Bun** >= 1.4.0 (required for development, testing, and compilation).
- **GitHub Token** (optional): increases GitHub REST rate limit from 60 to 5,000 req/hr.

### Core Commands (run from `src-crawler/`)

```powershell
# Install dependencies
bun install

# Run the test suite (161 tests across 23 files, isolated in-memory)
bun test

# Typecheck without emit
bun run typecheck

# Check documentation links (99 documents)
bun run check:docs

# Build compiled pre-production binaries
bun run build:coordinator   # dist/local-coordinator/vrc-coordinator.exe
bun run build:node          # dist/local-node/vrc-node.exe
bun run build:worker        # dist/worker/ (Cloudflare Worker browser bundle)
bun run build               # Builds all three targets

# Pre-production verification smokes
bun run smoke:preprod       # End-to-end dual-binary simulation in shared directory
bun run smoke:continuous    # Continuous dual-daemon simulation with autonomous polling
bun run smoke:local         # Multi-process loopback topology & heartbeat check
bun run smoke:multi         # Multi-process coordinator lease & race check
```

---

## Historical Architecture Note

The legacy monolithic Phase 1–4 binaries (`vrc-crawler.exe`, `vrc-server.exe`, `vrc-monitor.exe`, `vrc-sync.exe`, port 8765 IPC, and direct D1 edge sync) have been permanently retired and deleted as part of the version 0 pre-production refactor. For historical design records and specifications, see:
- [`docs/scratch/history/AGENT_PHASE4.md`](docs/scratch/history/AGENT_PHASE4.md)
- [`docs/scratch/decisions/current/status/CONFORMANCE.md`](docs/scratch/decisions/current/status/CONFORMANCE.md)

---

## Legal and Compliance

The crawler operates under strict legal boundaries and community norms:
- **Zero-Binary Invariant**: It does not download, cache, or redistribute binary asset archives (`.unitypackage`, executables, 3D meshes, textures).
- **Factual Metadata Focus**: It discovers and indexes public factual metadata, routing links directly to original creator storefronts.
- **Politeness & Access Gates**: Requires scoped source-access profiles and RFC 9309 robots compliance before network fetching.
- **Opt-Out Support**: Provides creator delisting and exclusion mechanisms.

See [`LEGAL.md`](LEGAL.md) and [`DELEGATES.md`](DELEGATES.md) for full operational covenants and runbooks.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) — see the [`LICENSE.md`](LICENSE.md) file for details.
