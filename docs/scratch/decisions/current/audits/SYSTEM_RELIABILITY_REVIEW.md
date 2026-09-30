# Version-0 system reliability review — 2026-09-28

This is a review ledger, not a release sign-off. It records current strengths,
known limits, and the next falsifiable checks for the local coordinator and
standalone crawler node. Re-run it after any contract, scheduler, policy,
parser, or storage change. `status/CONFORMANCE.md` remains the measured gate ledger.
The sandbox shell runner failed before starting commands during the initial
review. An approved workspace shell path later restored verification; see
`status/CONFORMANCE.md` for the exact checks and their scope.

| Boundary | Current strength/evidence | Failure to challenge next | Minimum exit evidence |
| --- | --- | --- | --- |
| Process separation | `worker/main.ts` and `node/main.ts` are the separate local coordinator/node entry points. Both have compiled targets in `src-crawler/package.json`. The compiled local smoke initializes a non-secret config in each process's isolated launch directory and exchanges validated API requests. | A test using only in-process handlers could mask HTTP/schema drift. The node DB, durable secret storage, complete adapter relocation and Cloudflare Worker storage boundary are still absent. | Launch both local processes, exchange a lease/result via loopback, compare malformed-payload behavior with in-process handler; test future node-state recovery separately. |
| Source authorization | `src-crawler/src/shared/source_access_profile.ts` has exact platform/origin/path/purpose matching, expiry, disable state, and evidence classes; coordinator checks profiles before leases. | Encoded/query paths are denied; broadening matching could over-authorize. Old unbound jobs/leases must not slip through. | Negative matrix for no profile, wrong purpose, disabled/expired/narrower profile, query/encoding, heartbeat and result after revocation. |
| Robots and politeness | `src-crawler/src/worker/robots_refresh_service.ts` centralizes bounded preflight; origin leases are coordinator-owned. | Multi-process origin race, stale robots snapshot, shutdown during refresh, retry burst. | Concurrent two-coordinator/node test; shutdown/restart test; origin request-rate trace, including 429 and retry. |
| Network safety | `src-crawler/src/node/public_metadata_fetch.ts` handles public metadata retrieval behind a node lease. | DNS rebinding, redirects, oversized/deceptive content, and per-source headers remain high-consequence paths. | Adversarial fetch fixtures at each redirect/hop, private/reserved address and content-size negatives, bounded timeout. |
| VPM evidence | `src-crawler/src/node/observation_adapter.ts` requires explicit manifest name/version, checks canonical SemVer with the `semver` package, reports partial issues, and does not manufacture releases from map keys. The shared result schema rejects malformed release versions from a parser-bypassing node. The local coordinator blocks non-VPM release evidence and multi-item batches, while allowing VPM metadata without claiming it is installable. | Version ordering/resolver parity remain open; v0 transitional `src-crawler/src/drivers/vpm_index/` still uses lexical version comparison. Future Worker storage and public projection must preserve the platform/release distinction. A compromised node can still assert false source content or package identity; schema shape is not attestation. | Official-format fixtures with prerelease/build metadata, malformed versions, mismatch, partial batch, and parity of production adapters. |
| Identity/projection | Observation and discovery-lead schemas distinguish a fetched fact from a lead. | Similar titles or third-party indices could be promoted to canonical authority by future projection work. | Provenance/source-role model, ambiguous-front fixtures, explicit unresolved state, feedback abuse/consent review before any user steering launch. |
| Retention/publication | Profiles separate retained from published evidence classes. | Fetch permission is not a rights grant; source-specific terms and data classes remain undecided. | One reviewed profile per origin/path with source terms, fields, retention, publication, and takedown behavior; legal review before public export. |
| Operations/recovery | Coordinator uses persistent local SQLite; node requires leases and is meant to stop when coordinator is unreachable. | Crash between fetch and submit, duplicate result, replay, credential revoke, old schema, WAL recovery. | Fault-injection and restart/idempotency tests with durable state; backup/restore drill before any non-fixture database matters. |
| Scope/code volume | Capability gates and the new `.agents` rules require small verified slices and dependency research. | Parallel drivers and old single-machine code paths can diverge; extra abstractions can hide failures. | Per-gate path inventory, duplicate/dead-code audit, dependency decision record, diff review, and explicit deletion candidates. |

## Review sequence for every gate

1. Establish current user decision and one gate exit; capture dirty-worktree
   state and test baseline.
2. Trace the live path from input to consumer and back through callers,
   schemas, storage, and error handlers. Search references in the current
   tree rather than trusting a code index or older design prose.
3. Write one failure hypothesis per boundary above that the change touches.
   Test a counterexample before asserting the invariant.
4. Verify targeted behavior, transport equivalence where applicable,
   typecheck/build, process-level smoke, and diff. Record commands and
   results in `status/CONFORMANCE.md`; “not run” is not “passed.”
5. Close only the demonstrated slice. Keep uncertain source rights,
   publication, canonical identity, and owner choices open. A stop hook or
   confident second pass cannot override this ledger.

## Next bounded slices

1. Audit the transitional VPM driver paths against the node adapter and
   retire or reconcile lexical version selection only with production-path
   tests.
2. Compare VPM resolver version/range behavior with the C# reference before
   ranking releases or interpreting dependency compatibility.
3. Review one concrete source profile for rights and evidence classes before
   widening live-source runs.
