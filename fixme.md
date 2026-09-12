# Crawler Audit & FIXME Verification Checklist

- [x] **False positives in main categories**:
  - Implemented `COSMETIC_EXCLUSIONS` regex patterns (clothing, outfits, hair, textures) and `GENERIC_TECH_TERMS` penalties in `src/filter.ts`.
  - Purged 278 skeleton repositories with artificial placeholder descriptions.
  - Over 7,939 non-tool items accurately quarantined.

- [x] **True positives in quarantined categories**:
  - Unified quarantine auditing in `src/verify_quarantine.ts` and `src/pipeline_sanitize.ts` using `RelevanceFilter.evaluate()`.
  - Reinstated verified tools and whitelisted creator tools with secondary ecosystem context.

- [x] **404 resolutions & speculative probing**:
  - Upgraded `VpmIndexDriver.getUrlCandidates()` in `src/drivers/vpm_index.ts` to probe `package.json`, GitHub Pages, raw branches (`HEAD`, `main`, `master`), and fallback to GitHub driver.
  - Resolves direct VPM package repositories (e.g. `JustSleightly/VPM-Package-Template`) and cascades into author feed discovery (`vpm.sleightly.dev`).

- [x] **Umbrella repositories vs source packages**:
  - In `src/filter.ts`, aggregation and curated list repos (`awesome-*`, `-awesome`) receive a -10 penalty as entities.
  - In `src/drivers/curated.ts`, umbrella repos are used strictly as link extraction vectors rather than catalog items.

- [x] **Retry errors & qualified discards**:
  - Created `qualified_discards` table in `src/db.ts` to archive dead or unreachable endpoints after retries.
  - 1,394 dead URLs migrated out of `frontier` with provenance reasons and attempts.

- [x] **Source code & package.json crawling**:
  - In `src/drivers/github.ts`, raw `package.json` is inspected for `vpmDependencies` and `keywords`.
  - Raw `README.md` is scanned for tooling paradigm signals (`udon`, `modular avatar`, `vrcfury`, `physbone`, `mesh combiner`).

- [x] **Release page verification**:
  - In `src/drivers/github.ts`, `/releases/latest` endpoints are probed for `.zip` and `.unitypackage` binary distributions.
  - Repositories with packaged release assets receive `verified-release` tag and automatic toolchain qualification.

- [x] **`MagmaVRC/SimplXP` author context bleed investigation**:
  - Decoupled creator handle from repository content evaluation in `src/filter.ts`.
  - Substrings like `"vrc"` in creator usernames no longer leak false positive points to unrelated software.
  - Audited all 22 `MagmaVRC` repositories: 12 genuine VRChat tools retained (`FastUdonVM`, `UdonProfiler`), 10 non-VR web tools quarantined (`SimplXP`, `BetterForms`).