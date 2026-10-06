# VPM clients beyond a listing

Historical review: 2026-09-27. Alignment: 2026-10-03. This is format research, not an installer specification or source-access approval.

| Primary reference | Historical observation | Catalog consequence |
| --- | --- | --- |
| [vrc-get CLI](https://github.com/vrc-get/vrc-get/blob/master/README.md) | Subscription/search differs from project install, resolve, upgrade and removal. | Catalog metadata does not require a project resolver or local client settings. |
| [ALCOM GUI](https://github.com/vrc-get/vrc-get/blob/master/vrc-get-gui/README.md) | Creator Companion alternative application | It can be a Tools candidate, not a repository registry merely because it manages packages. |
| [Remote repository parser](https://github.com/vrc-get/vrc-get/blob/master/vrc-get-vpm/src/repository/remote.rs) | Reviewed parser skipped malformed versions, supported conditional fetches and applied local fallback identifiers | Compare semantics with fixtures. A client fallback ID is not a publisher assertion. Recheck source revision before relying on it. |
| [VCC repository subscriptions](https://vcc.docs.vrchat.com/guides/community-repositories/) | Clients select repositories; private access can need headers | Preserve source listing and access context. Catalog appearance does not imply installability for every client. |
| [VCC resolver](https://vcc.docs.vrchat.com/vpm/resolver/) | Project manifest and local Packages folder describe project state | Do not treat vpm-manifest.json or user package folders as public discovery feeds. |
| [VCC package format](https://vcc.docs.vrchat.com/vpm/packages/) | Versions, dependency ranges and download/checksum fields describe releases | Preserve exact evidence without downloading ZIPs or promising compatibility. |
| [vrc-get issue 1696](https://github.com/vrc-get/vrc-get/issues/1696) | Historical report of a resolver difference for an OR range | A single client is not the universal specification. Review current behavior before implementing compatibility advice. |

## Snapshot and failure semantics

Current adapter supports bounded partial-listing diagnostics. Valid observations remain separate from invalid entries. Complete-source evidence must not be replaced with a false deletion inferred from partial results.

Repository ID/URL conflicts, yanked status, prerelease selection, redirects, >100-version listings and generator differences need explicit tests. Syntax validation is not a resolver. Avoid homegrown latest/compatible algorithms where a maintained library suffices.

A download URL and checksum are listing claims, not proof that the binary remains reachable, safe or licensed. No private repositories, local Unity projects, client settings or user folders are crawl scope.

Use the [template note](VPM_TEMPLATE_RESEARCH.md) for builder versus listing distinctions and the [parity audit](PROTOTYPE_PARITY.md) for current runtime evidence. Old implementation paths, TODO task numbers and local smoke counts do not describe current deployment.
