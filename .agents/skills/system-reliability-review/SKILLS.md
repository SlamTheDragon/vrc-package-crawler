# System reliability review procedure

1. Enumerate the externally observable operations and trust boundaries for
   the slice. Trace each from entry point to storage and back to consumers;
   use live source references, not only documents or semantic retrieval.
2. Challenge the design with a failure matrix: malformed payload, absent or
   revoked profile, robots denial/staleness, redirect/SSRF, timeout, partial
   parse, duplicate result, lost lease, coordinator outage, restart, and
   multiple nodes racing for one origin. Add a minimal regression test for
   each changed boundary; mark genuinely irrelevant rows explicitly.
3. Compare in-process simulation and loopback HTTP on the same versioned
   schemas. Verify compiled binaries where a changed entry point matters.
4. Inspect data provenance and publication separately from fetch permission.
   Test that lead-only sources cannot silently become canonical authority.
5. Audit dependency/code volume: identify duplicate parsers, schedulers,
   policy checks, and dead paths; choose justified deletion or reuse. Review
   performance and bounded resources under concurrent/retry conditions.
6. Report confirmed strengths, failures, untested risks, and a bounded next
   slice. Never equate test count or implementation volume with reliability.
