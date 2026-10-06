# Historical experiments and required revalidation

Reviewed 2026-10-03. These experiments informed the earlier architecture; they do not prove the current Worker/D1 runtime. See the [parity audit](PROTOTYPE_PARITY.md) for current source and reproduced failures.

| Experiment | Historical evidence | Current interpretation | Next falsifiable check |
| --- | --- | --- | --- |
| Browser-target coordinator build, 2026-09-27 | Earlier portable handler bundled successfully | Build output is not workerd compatibility, D1 integration or remote deployment evidence. The old bundle-size and product-limit comparison is not current. | Run API-only Worker locally with its real bindings; capture request and database behavior. |
| Two local coordinator processes, 2026-09-27 | Recorded immediate SQLite transaction smoke: one lease and idempotent submission | Applies to the old local adapter. It does not transfer to D1, whose current claim reads before unconditional writes. Retired smoke commands are not reproducible current instructions. | Race claims against D1. A new in-memory diagnostic reproduced two leases for one job. Add a regression, then runtime coverage. |
| Robots parser, 2026-09-27 | Adopted @trybyte/robotstxt-parser 2.0.0 in RFC mode with encoded-path and group fixtures | Preserve package tests, but distinguish matching from retrieval, TTL, profile approval and leases. Bootstrap robots bodies are invented, not fetched evidence. | Test real preflight and expiry, unreachable/oversized/HTML bodies, redirects and origin reservation. |
| VPM template smoke, 2026-09-28 | The specialized note records separate listing and recipe fetches, metadata plus leads, no ZIP bytes | A bounded historical source smoke, not general source clearance or current deployment proof. | Repeat only with reviewed live profiles after storage and robots defects are fixed. |
| Public projection diagnostic, 2026-10-03 | An observation under publishClasses [] appeared in the catalog | Schema presence does not enforce publication rights. | Add denied-field/front/catalog regressions and test revocation. |
| Delist diagnostic, 2026-10-03 | Unverified proof remained pending while the canonical lifecycle became delisted | Intake and destructive action are not separated. | Add unauthenticated and unrelated-user tests; verify ownership or operator action before suppression. |

## Baseline measured this review

At HEAD 3b9d203: crawler tests 296 pass; SDK tests 33 pass; root layout tests 2 pass and 2 fail because the crawler config is missing. Both package typechecks pass. Historical claims of 333 passing tests are not the current baseline.

The three new diagnostics used a hermetic in-memory SQLite-backed D1 interface. They made no external requests and printed no credentials. They establish counterexamples in coordinator logic, not full D1 runtime compatibility.

Do not retain arbitrary platform limits in this note. Retrieve [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) when measuring the actual workload. Record invocation queries, bytes, CPU and failure distribution before estimating cost.

## Acceptance evidence

A capability needs caller-to-consumer fixtures, negative cases, full suites, typechecks and runtime validation appropriate to its risk. Source observations, local process tests, runtime tests and remote staging are distinct evidence classes. Keep source-access approval separate from every test result.
