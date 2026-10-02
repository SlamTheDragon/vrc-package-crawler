# Task Tracker: Active Slice Tracking
## Active Milestone: Gate G12 — Wrangler Staging Simulation, Docker Crawler Fleet Provisioning & Multi-Platform Ingestion
## Active Milestone: Gate G12 — Coordinator Staging Readiness, Universal Package Projection & Legacy Loopback Purge
### Working Theories & Context
1. **User Decision Directives**:
   - **Directive A1**: Provision live crawler node fleet with Docker Compose and launch initial discovery crawl on public VPM listings.
   - **Directive A2**: Set up automated staging deployment scripts and verification harness using Wrangler local simulation and staging bindings.
   - **Directive A3**: Defer `src-web/` development for now until node fleet operations are validated.
   - **Directive A4**: Multi-platform seeds including approved GitHub repository releases and verified storefront listings.
2. **Architecture & Boundary Guardrails**:
   - Coordinator runs Cloudflare Worker on D1 or simulated environment with origin-wide pacing clock.
   - Standalone crawler nodes run in containerized fleets via Docker Compose with automated Watchtower updates.
   - Multi-platform seed catalog must enforce active source-access profiles and robots preflight before any fetch.
   - Slices must touch strictly 2–3 files at a time.
   - Scratch footprint strictly maintained at 3 files (`IMPLEMENTATION_PLAN.md`, `UNMERGED_IMPLEMENTATION_PLAN.md`, `task_tracker.md`).
### Codebase Deep Audit & Working Theories
1. **Universal Package Projection Invariant**:
   - Every crawled item from ANY supported platform (VPM, GitHub, BOOTH, Gumroad, Jinxxy, Sellfy, Payhip) represents a package and must project into `canonical_packages` upon submission.
   - Platform tags (`vpm_package`, `desktop_tool`, `avatar`, `asset`, `shader`, etc.) and `vpm_id` distinguish VPM packages from non-VPM packages, rather than excluding non-VPM sources from canonical status.
2. **Coordinator-Initiated Profile Seeding**:
   - Source-access profiles and initial seed jobs must be initiated and managed strictly by the Coordinator. Crawler nodes never self-authorize or provision profiles.
3. **Legacy Loopback Purge**:
   - In Version 0, the Coordinator is Cloudflare Workers backed by D1.
   - The legacy `LocalCoordinatorStore` (`src/worker/storage/local_sqlite.ts`), local CLI binary `src/worker/main.ts`, and loopback test fixtures are obsolete scaffolding to be purged in preparation for staging.
4. **Terminology Disambiguation**:
   - **Crawler Node**: Headless VPS executable (Linux/x64), polls coordinator for job leases, crawls jobs, returns results, never shuts down (resilient to interruptions and coordinator unavailability), logs all activity, configured with coordinator-issued token and ID.
   - **Coordinator**: Cloudflare Workers with D1, handles node registration, dynamic workforce distribution via capability-encoded tokens, rate limit pacing, report management, seeding, and public/downstream search services.
   - **Crawler Client**: GUI shell for Windows that bundles Crawler Node within (`src-crawler-client/`, deferred).
   - **Web Operator Panel & Landing Page**: `src-web/` (deferred, Firebase auth + Cloudflare).
5. **Pre-Production Real Data Ingestion**:
   - Pre-production delivery requires a verified live smoke test fetching real public metadata (e.g. VPM template listing and GitHub API repo) under coordinator lease, verifying end-to-end data ingestion.
### Planned Slices (Awaiting Author Review)
- `FLEET-S1`: Wrangler Staging Simulation & Automated D1 Verification Harness
- `FLEET-S2`: Multi-Platform Default Seeds & Initial Fleet Seeding
- `FLEET-S3`: Docker Fleet Compose Configuration & Node Clustering
- `FLEET-S4`: End-to-End Fleet Multi-Platform Crawl Simulation
- `STAGE-S1`: Universal Package Projection & Coordinator-Initiated Seeding
- `STAGE-S2`: Terminology & Documentation Alignment (Version 0 Disambiguation)
- `STAGE-S3`: Purge Legacy Loopback Store & Obsolete Server Binary
- `STAGE-S4`: True Live Data Pre-Production Smoke Test Harness

### Pause checkpoint — 2026-10-03

- Owner requested a pause. No source edits, tests, live crawls, or deployments were performed in this continuation.
- Read the updated goal attachment, current AGENTS.md, both plan ledgers, this tracker, and repository rules. The current target is Worker/D1 staging and a resilient headless node; the September local-binary plan is superseded.
- Git HEAD is `069a400` (`config 2`). Existing skill edits, removed `SKILLS.md` files, added skill folders, and `skills-lock.json` belong to the current worktree and were preserved.
- The ledger reports 333 passing tests, but that baseline was not rerun. G12 rows have blank author-review comments; no proposed slice was implemented.
- Next on resume: finish the required LEGAL.md read from line 191, trace the current Worker/D1 and node paths, and reconcile the active G12 slice with the updated goal. Keep changes within the 2–3 file constraint.
