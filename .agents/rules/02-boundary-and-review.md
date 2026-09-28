---
trigger: always_on
description: "Protect crawler/coordinator boundaries and require system-level review."
---

# 02 — Review the whole effect, not just the edited function

1. Keep crawler node and coordinator as separate runnable processes. The
   local simulation serializes and validates the same versioned API payloads
   as loopback HTTP. Do not bypass leases through direct repository calls.
2. Source profiles authorize only scoped fetching. Robots is a second gate;
   neither grants retention, publication, canonical identity, nor an
   unrestricted driver. Fail closed when the coordinator is unavailable.
3. For each change, examine happy path, malformed input, unavailable service,
   retry/idempotency, concurrency/origin pacing, schema compatibility,
   persistence/restart, and what a downstream consumer can observe. Mark
   inapplicable checks with a reason, not an unchecked tick.
4. Run targeted tests first, then relevant integration/protocol tests,
   typecheck/build, and a final diff audit. A green suite is evidence for
   exercised cases, not proof of all paths. Record gaps and counterexamples.
