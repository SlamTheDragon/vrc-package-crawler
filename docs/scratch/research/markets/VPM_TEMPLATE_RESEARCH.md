# VPM listing-template research

Historical source review: 2026-09-27, corrected 2026-09-28. Alignment: 2026-10-03. Mutable upstream source was not re-read in full this alignment review.

## Primary reference set

- [Listing template](https://github.com/vrchat-community/template-package-listing), [source recipe](https://github.com/vrchat-community/template-package-listing/blob/main/source.json), [workflow](https://github.com/vrchat-community/template-package-listing/blob/main/.github/workflows/build-listing.yml).
- Builder [source model](https://github.com/vrchat-community/package-list-action/blob/main/PackageBuilder/ListingSource.cs) and [build code](https://github.com/vrchat-community/package-list-action/blob/main/PackageBuilder/Build.cs).
- [VCC listing guide](https://vcc.docs.vrchat.com/guides/create-listing/), [repository format](https://vcc.docs.vrchat.com/vpm/repos/), [package format](https://vcc.docs.vrchat.com/vpm/packages/).
- [Published example](https://vrchat-community.github.io/template-package/index.json), from template-package, not the template-package-listing recipe above.

The recipe and example are complementary fixtures, not a witnessed input/output pair. Do not claim exact build equivalence from them.

| Question | Historical finding | Catalog boundary / next test |
| --- | --- | --- |
| Is source.json a repository listing? | It is a recipe with repository and release references. The builder emits index.json. | Emit discovery leads, not package/version facts. Destination fetching still needs profiles, robots and leases. |
| Does a ZIP name or tag establish a version? | The builder reads package.json from ZIPs and adds download/hash metadata. | Our metadata catalog does not reproduce ZIP downloads. Use explicit listing manifests. |
| Can one listing have multiple releases? | packages maps IDs to version maps and embedded manifests. | Validate map/manifest agreement. Preserve valid entries and partial diagnostics. Missing entries in an incomplete response do not imply deletion. |
| Is the first map entry latest? | Map order does not define version ranking. | Preserve source versions. Test prerelease/yanked semantics before a latest projection. Do not invent versions. |
| Is default npm semver parsing strict enough? | It can accept prefixed or padded forms and normalize source strings. | Current canonical syntax fixtures preserve exact accepted strings and reject malformed forms. Resolver compatibility remains separate. |
| Is a recipe label canonical identity? | Template name and builder id fields differed; release content established output identity in the reviewed path. | Keep recipe labels as leads. Recheck upstream revisions before adopting their meaning. |
| Is a package ID globally conflict-free? | Multiple listings can contain the same ID with different releases and metadata. | Preserve listing-plus-package evidence, conflicts, mirrors and reversible identity links. |
| Do recipe fields survive output? | Website fields and listing manifests differ. | Test a real recipe/output pair. Do not transfer banner/description/author fields by assumption. |

## Dated smoke evidence

The September 28 note records an opt-in compiled local smoke of two separate template examples. It observed com.vrchat.demo-template release 0.0.7 with a hash, plus four pending leads: one listing, one GitHub repository and two ZIP references. Profile attribution remained attached, creator prose was omitted under reviewed retention, and no ZIP bytes were fetched.

That smoke was not repeated here. It does not prove arbitrary-host permission, full traversal, resolver parity, current D1 safety or remote staging.

Historical bounds were 100 packages, 100 versions per package, 100 diagnostics and 240 KB serialized. Recheck current schemas before using those numbers as an API guarantee. Larger listings need explicit overflow/chunking semantics and lease-safe commits.

The [parity audit](PROTOTYPE_PARITY.md) owns current code evidence. The [vrc-get note](VRC_GET_ECOSYSTEM_RESEARCH.md) extends format research beyond listings.

## VPM Catalog discovery lead

Reviewed 2026-10-03 at upstream revision `2f6e49561432caa706725751f7e202cecd655c6b`. The owner supplied [kurotu/vpm-catalog](https://github.com/kurotu/vpm-catalog) as a research lead, not a crawl approval.

The catalog has two paths: discovery proposes repository URLs, then builds refresh the accepted list. These source files describe intended behavior. This review did not run their workflows or measure discovery coverage.

| Stage | Pinned source evidence | Reuse boundary / next check |
| --- | --- | --- |
| Candidate discovery | [Discovery skill](https://github.com/kurotu/vpm-catalog/blob/2f6e49561432caa706725751f7e202cecd655c6b/.claude/skills/vpm-discovery/SKILL.md) searches GitHub APIs, Yahoo Japan realtime announcements, Google and publisher links. It includes recent updates to older repositories. | Research bounded search jobs and pagination. Search recency must not become a package creation date. Search providers need their own access review. |
| Review and scheduling | [Weekly workflow](https://github.com/kurotu/vpm-catalog/blob/2f6e49561432caa706725751f7e202cecd655c6b/.github/workflows/discover.yml) runs Copilot with unrestricted permissions. Its [prompt](https://github.com/kurotu/vpm-catalog/blob/2f6e49561432caa706725751f7e202cecd655c6b/.github/prompts/discover.md) requests a pull request and avoids existing proposals. | Reuse the separation between candidate reports and accepted seeds. Do not copy unrestricted execution or repository-write credentials into nodes. |
| Candidate validation | The discovery skill checks JSON responses, listing fields, redirects and declared repository URLs. It probes index.json and vpm.json candidates. | Every probe and redirect destination needs coordinator-controlled authorization. A name/id/url tuple alone does not establish valid package evidence. Retain strict map/manifest checks. |
| Publisher and mirror inference | The skill guesses GitHub handles from BOOTH shop names. It compares declared IDs/URLs and favors listings that cover multiple packages. | Guesses are leads, not identity proof. Matching package IDs or a declared URL must not erase conflicting releases or prove publisher control. Preserve path case. |
| Exclusion records | [Ignore list](https://github.com/kurotu/vpm-catalog/blob/2f6e49561432caa706725751f7e202cecd655c6b/repositories-ignore.txt) records duplicates, moved URLs, test listings and unavailable sources. | Research reversible reasons with evidence and dates. Do not import this third-party list as authoritative suppression or canonical identity. |
| Listing refresh | [Repository downloader](https://github.com/kurotu/vpm-catalog/blob/2f6e49561432caa706725751f7e202cecd655c6b/tasks/download-repos.sh) fetches accepted URLs and repairs malformed JSON through HJSON conversion. | Keep malformed-input diagnostics. Do not silently repair source evidence or use repository IDs as unchecked storage paths. |
| Package enrichment | [Package downloader](https://github.com/kurotu/vpm-catalog/blob/2f6e49561432caa706725751f7e202cecd655c6b/tasks/download-packages.sh) selects a stable release when available, downloads ZIPs and extracts files. | Exclude archive downloads and extraction under our metadata-only boundary. Research separately authorized publisher metadata links instead. |
| Release presentation | [VPM utilities](https://github.com/kurotu/vpm-catalog/blob/2f6e49561432caa706725751f7e202cecd655c6b/src/utils/vpm.ts) use semver, hide yanked/deprecated entries and examine legacyPackages relationships. | Compare yanked and prerelease fixtures without copying title-based deletion. Dependency/replacement links do not establish product equivalence. |

Current comparison: `src-crawler/src/adapters/observation_adapter.ts` validates listing manifests and emits explicit outbound links. It does not implement the search-provider workflow above. Source inspection found no vrc-get yanked or legacyPackages handling in the current crawler/SDK. This is a feature-research gap, not approval to select public lifecycle semantics.

A temporary shallow clone confirmed the same revision and the complete script inventory. Discovery uses agent instructions, not a dedicated deterministic search crawler. Executable shell scripts refresh known listings and download packages. The authenticated daily deployment hook triggers a build. Build scripts cache ZIPs through S3-compatible storage. These paths do not show a coordinator lease, robots preflight, or explicit curl timeout/size limits. No upstream script was executed.

The [aggregate endpoint](https://github.com/kurotu/vpm-catalog/blob/2f6e49561432caa706725751f7e202cecd655c6b/src/pages/index.json.ts) merges package/version records and prefers the longer serialized manifest on collisions. This discards source conflicts and is not a safe canonical verdict for our catalog. The repository also fetches an SPDX license list for presentation. That fetch does not establish permission for indexed content.

The upstream skill rejects other curated catalogs as discovery inputs. That is its project policy, not a legal ruling or our policy. Our owner permits directories as discovery leads. Neither approach authorizes destination fetching, text retention or publication.

Next research belongs to FLEET-S2: compare explicit publisher links, bounded search candidates and reviewed seed submission. Keep source profiles, robots preflight and leases separate. Do not import the upstream repository list wholesale or change runtime behavior from this note.
