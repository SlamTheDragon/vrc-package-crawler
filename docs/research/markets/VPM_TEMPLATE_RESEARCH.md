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

The [parity audit](../audits/PROTOTYPE_PARITY.md) owns current code evidence. The [vrc-get note](VRC_GET_ECOSYSTEM_RESEARCH.md) extends format research beyond listings.
