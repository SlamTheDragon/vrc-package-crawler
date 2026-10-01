# Unmerged Implementation Plan

### Task Slices

| status | ID | problem | related-code(s) | reason | solution | author comments |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| done | DOC-S1 | Legacy `TODO.md` context recovery & root purge | [`docs/scratch/IMPLEMENTATION_PLAN.md`](file:///f:/.repo/.main/vrc-package-crawler/docs/scratch/IMPLEMENTATION_PLAN.md), [`TODO.md`](file:///f:/.repo/.main/vrc-package-crawler/TODO.md) | `TODO.md` (121 KB) contains stale single-process Phase 1–4 code patches alongside authoritative canonical foundation items (CANON-1..6, cosmetics taxonomy, bio-token delist, media streaming proxy). | Recover active canonical foundation covenants and architectural decisions into `docs/scratch/IMPLEMENTATION_PLAN.md`, then delete `TODO.md` from the repository root. | approved |
| done | DOC-S2 | Re-anchor agent instructions & align layout conformance test | [`AGENTS.md`](file:///f:/.repo/.main/vrc-package-crawler/AGENTS.md), [`tests/preprod_layout.test.ts`](file:///f:/.repo/.main/vrc-package-crawler/tests/preprod_layout.test.ts) | `AGENTS.md` points to deleted files (`DIRECTION.md`, `CONFORMANCE.md`, `AGENT_PHASE4.md`) and pre-refactor binary model; `tests/preprod_layout.test.ts` fails by asserting deleted scratch files (`DIRECTION.md`, `DEFERRED_OWNER_DECISIONS.md`). | Update `AGENTS.md` to reference live authoritative files and current network topology (Cloudflare D1 coordinator + Dockerized node); update `tests/preprod_layout.test.ts` to assert the standard clean root set (`AGENTS.md`, `DELEGATES.md`, `LEGAL.md`, `LICENSE.md`, `README.md`, `install.sh`) and minimal scratch files. | approved |
| done | DOC-S3 | Overhaul `DELEGATES.md` for downstream users & `src-package` SDK | [`DELEGATES.md`](file:///f:/.repo/.main/vrc-package-crawler/DELEGATES.md) | Author directive (A2): `DELEGATES.md` is meant for downstream users to take leverage upon, but currently describes the retired local two-binary loopback stack without referencing `src-package`. | Rewrite `DELEGATES.md` to guide downstream developers integrating `src-package` (app tokens `vrcp_app_`, user tokens `vrcp_usr_`, catalog indexing, delta sync, and takedown/report submission) and interacting with the remote coordinator. | approved |
| done | DOC-S4 | Overhaul root `README.md` & patch `LEGAL.md` links | [`README.md`](file:///f:/.repo/.main/vrc-package-crawler/README.md), [`LEGAL.md`](file:///f:/.repo/.main/vrc-package-crawler/LEGAL.md) | `README.md` references retired local binaries, deleted smoke scripts, stale 161 test count, and dead scratch links; `LEGAL.md` references deleted `docs/scratch/current/CONFORMANCE.md`. | Rewrite `README.md` to present the true repository layout (`src-crawler`, `src-package`, `src-web`), Docker/Worker deployment, and current test baseline (333 tests); patch `LEGAL.md` cross-references to point to `docs/scratch/IMPLEMENTATION_PLAN.md` and `docs/source/DATABASE_SCHEMAS.md`. | approved |

---

### Milestone Gates

| ID | milestone | current results | author comments |
| :--- | :--- | :--- | :--- |
| G10 | Upstream VPM Community Registry Ingestion & Cross-Source Verification | Completed: Multi-platform manifest lead decomposition, cross-source storefront/repository verification linking, timestamp confidence hierarchy ('confirmed', 'inferred', 'observed'), and bulk tag timestamp search ordering verified across 329 tests. | approved |
| G11 | Root Documentation Cleanup, Context Migration & Downstream Delegate Enablement | Completed: Recovered canonical foundation covenants (CANON-1..6) and purged stale 121 KB TODO.md; re-anchored AGENTS.md and preprod layout tests (4/4 pass); overhauled DELEGATES.md downstream developer runbook; overhauled README.md and patched LEGAL.md links. 333 tests pass / 0 fail. | approved |

---

### Owner Decisions on Deferred Questions (Accepted)

1. **Question D1 (Community Aggregator Leads)**:
   - *Decision (Accepted)*: Aggregators (e.g. nexxy, avtr.zip) serve strictly as discovery source leads subject to robots.txt rules. Sample from live data to discover leads and research gaps without promoting aggregator prose to authoritative records.
2. **Question D2 (Windows Desktop Shell `src-crawler-client`)**:
   - *Decision (Deferred)*: Remains deferred until the crawler node client architecture is fully finished and hardened with zero context drift.
3. **Question D3 (Creator Bio-Token Verification Automation)**:
   - *Decision (Accepted)*: Bio-token verification will utilize downstream cryptographic verification (asymmetric/public key architectures) or on-demand high-priority jobs aligning with transaction lifecycles, ensuring minimal data collection without continuous background polling.
