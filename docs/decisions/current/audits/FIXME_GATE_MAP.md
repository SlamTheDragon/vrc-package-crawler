# Source FIXME map (2026-09-27)

This is a routing inventory, not a claim that the comments are resolved. `rg -n FIXME src` currently finds **28** comments after the driver-file split. The earlier plan's “30” was a snapshot of the old layout; use this inventory and a fresh search when closing a gate. A gate exits only after the code change, decision, and tests are recorded in `status/CONFORMANCE.md`.

| Gate | Current FIXME locations | Decision/research needed |
| --- | --- | --- |
| G0/G5 | `src-crawler/src/crawler/steering.ts:36,55` | Report authority, vocabulary, and which coordinator/application endpoints may change published facts. |
| G1/G2 | `src-crawler/src/crawler/projection.ts:146,182` | Decide whether quarantine recovery belongs in a replayable projection or is redundant with source admission; preserve reversibility before removing it. |
| G0/G6 | `src-crawler/src/config.ts:38` | Confirm obsolete legacy configuration only after the corresponding runtime path is replaced. |
| G3 | `src-crawler/src/crawler/index.ts:693,735`; `src-crawler/src/drivers/github/harvesting.ts:188,350`; `src-crawler/src/drivers/curated/discovery.ts:21`; `src-crawler/src/drivers/curated/harvesting.ts:129,145,169`; `src-crawler/src/drivers/curated/seeding.ts:6`; `src-crawler/src/drivers/gumroad/index.ts:9`; `src-crawler/src/drivers/gumroad/harvesting.ts:139` | Discovery leads beyond GitHub, derived creator links, search/fork strategy, curated-seed provenance, source-specific sitemaps, and typed link traversal without asserting that a social link is a VPM repository. Hard-coded seeds need evidence and refresh rules, not automatic deletion. |
| G2/G4 | `src-crawler/src/filter.ts:46,80,148,210,232,282,314,347,369,381,451,488` | Empirical taxonomy/negative corpus, Tools–Assets–Avatars and cosmetics, avatar-base identity, centralized rejection reasons, source-evidence extraction, stale-template detection, “awesome” seed meaning, and historical Phase 5 behavior. Do not loosen one rejection rule without false-merge fixtures. |

The current node adapter is deliberately narrower than the legacy seven drivers; this map does not imply that moving a file into `src-crawler/src/node/` makes its behavior coordinator-safe. The full integration is tracked in G3/G5.
