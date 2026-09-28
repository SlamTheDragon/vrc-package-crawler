# VRChat desktop and runtime-tool discovery: research intake

**Status (2026-09-27):** owner-selected direction is a distinct category tag *within Tools* for desktop/runtime software that particularly targets VRChat; `vrchat-desktop-tool` is a provisional tag slug, not an implemented public contract. This is scoped research, not an approved crawl list or an implemented catalog subtype. It implements the intake requested in `TODO.md` Task 5.5. The active pre-production node has no desktop-app-specific discovery contract; its narrow GitHub repository API adapter can collect bounded repository metadata but does not prove an application is relevant, installable, current, safe, or correctly classified.

The product boundary is wider than Unity/VPM packages: [VRChat documents external OSC applications](https://docs.vrchat.com/docs/osc-overview), and its [OSC resources page](https://docs.vrchat.com/docs/osc-resources) points to community tools. Those pages provide leads and evidence of an integration surface, **not** a license to crawl every listed host or an endorsement of a binary. A standalone app may itself be a Tools catalog item even if it is also a potential downstream catalog consumer. “Desktop application” is an item kind; GitHub, a publisher site, and a storefront are separate *source* kinds.

| Candidate / boundary case | Initial thought | Publisher or primary-source reality checked | Projection and decision needed |
| --- | --- | --- | --- |
| [VRCX](https://github.com/vrcx-team/VRCX) | VRChat companion/client outside Unity and VPM | Its publisher describes a VRChat companion application and distributes an installer; some features interact with VRChat accounts/API. | **Research → likely Tools / companion application.** Catalog public publisher metadata only; never authenticate to VRChat or collect users' private app state. Verify canonical publisher/release source, OS variants, terms, and a stable identity separate from any future integration. |
| [VRCFaceTracking](https://github.com/benaclejames/VRCFaceTracking) | Desktop tracking bridge | Its publisher describes a bridge from eye/facial hardware to VRChat OSC. The app, hardware modules, and avatar setup are not one product. | **Research → likely Tools / tracking bridge.** Map project stewardship, app-versus-module relations, supported OS/hardware claims, and first-party release evidence before versioning. |
| [VRCOSC](https://github.com/VolcanicArts/VRCOSC) | Desktop OSC toolkit | Its publisher describes a VRChat OSC application with modules and programming/routing capabilities. | **Research → likely Tools / OSC control.** Model application and add-on modules separately; do not merge them just because they share a name, publisher, or OSC vocabulary. |
| [ADVOSC](https://github.com/TheArmagan/advosc) | Emerging VRChat-oriented desktop utility | Its publisher describes a Windows VRChat OSC app for chatbox templates and avatar-parameter control. | **Research → likely Tools / OSC and chatbox utility.** Check publisher-controlled release/version evidence, update channel, and metadata access policy; no installer download/execution. |
| Generic OSC clients such as those in [VRChat's OSC overview](https://docs.vrchat.com/docs/osc-overview) | Might be useful to VRChat players | VRChat documents using general OSC-compatible software; that alone does not show the publisher designed a product particularly for VRChat. | **Lead, not accepted tagged item.** The owner requires particular VRChat targeting for the new Tools category tag; generic compatibility is insufficient. |
| VPM clients and Unity integrations | Also desktop or tool-like | [Existing client-ecosystem research](VRC_GET_ECOSYSTEM_RESEARCH.md) already handles vrc-get/ALCOM and project-local VPM state. | **Existing path / relation test.** A desktop app, its VPM package, and its Unity module may be related but must not be forced into one item or given a fabricated VPM release. |

## Reproducible classifier baseline

The current `src/classifier.ts` accepts only title, description, and tags, not a publisher/source relationship or distribution kind. On 2026-09-27, `ToolClassifier.classify(title, "Desktop application for VRChat", [])` produced:

| Title probe | Current subcategory | Why this is not sufficient evidence |
| --- | --- | --- |
| `VRCX` | `OSC & External Companion Applications` (0.97) | Broadly adjacent, but its publisher describes a companion application, not necessarily an OSC app; confidence is hard-coded from a name match. |
| `VRCFaceTracking` | `Face & Eye Tracking Frameworks` under `Avatars` (0.94) | A desktop tracking bridge is collapsed into an avatar framework. |
| `ADVOSC` | `Unity Editor Extensions & Workflow Helpers` (0.85) | The default fallback asserts a Unity-editor subtype despite a publisher-described standalone app. |
| `Generic SteamVR Base Station Mount` | `OSC & External Companion Applications` (0.97) | The broad `steamvr` substring yields a high-confidence false positive for an unrelated physical accessory. |

These are **diagnostic probes**, not an accepted accuracy score or a license to patch the keyword list blindly. The G4 corpus needs labeled source-backed examples and negatives; the replacement classifier should use an explicit evidence field for application/module/asset kind and a separately justified VRChat relationship, with unknown kept unknown. Until then, pre-production output must not claim reliable desktop-tool classification.

## Questions the corpus must answer before a live discovery adapter

1. **Inclusion:** Does publisher-controlled evidence show that the product particularly targets VRChat, or is there only a search hit, community link, or generic VR/OSC compatibility? Only the former can receive the provisional `vrchat-desktop-tool` tag; the latter remains a lead or boundary case.
2. **Identity:** What is the app's publisher-controlled canonical page, stable repository/project identifier, release channel, and relationship to modules, plugins, VPM packages, hardware, and storefront fronts? A shared logo or similar name is not enough for a merge.
3. **Evidence:** Which source supports each field—purpose, OS support, version, update time, license, price, and installer link? A GitHub repository's `updated_at` is not an application release date. A release tag is not automatically an app version without publisher context.
4. **Policy and safety:** Review each host's API/robots/terms, rate budget, attribution, and retention before seeding. The crawler may observe public metadata; it must not download/run executables, interrogate local OSC ports or VRChat logs, log in to an account, or call unofficial/private VRChat APIs as a discovery shortcut.
5. **Evaluation:** Label positive, adjacent, and negative fixtures, including an app-plus-module pair and an unrelated general utility. Measure category and false-merge errors before publishing a Tools subtype. Demonstrate one explicitly approved public metadata source through the compiled node/coordinator path, and keep the remaining coverage open in `status/CONFORMANCE.md`.

**Next artifact:** turn this initial matrix into a dated candidate/source profile with keep/research/defer decisions. The examples above are research leads only; no new driver, crawl schedule, installable feed, or broad source permission follows from this note.
