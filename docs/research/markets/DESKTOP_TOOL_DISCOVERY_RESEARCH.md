# VRChat desktop-tool research intake

Historical intake: 2026-09-27. Alignment: 2026-10-03. Candidate publisher descriptions were not refreshed here.

Owner direction: add a category tag within Tools for desktop/runtime software particularly targeting VRChat. Generic VR/OSC compatibility alone is not enough. The proposed slug vrchat-desktop-tool is not a finalized public contract.

[VRChat OSC overview](https://docs.vrchat.com/docs/osc-overview) and [resources](https://docs.vrchat.com/docs/osc-resources) establish integration surfaces and leads, not an endorsement or access grant.

| Publisher candidate | Historical description | Research decision |
| --- | --- | --- |
| [VRCX](https://github.com/vrcx-team/VRCX) | VRChat companion application | Likely Tools candidate. Catalog publisher metadata only. Never collect private app state or authenticate to VRChat for discovery. |
| [VRCFaceTracking](https://github.com/benaclejames/VRCFaceTracking) | Hardware-to-VRChat facial/eye tracking bridge | Separate application, modules, hardware and avatar setup. Check stewardship and first-party releases. |
| [VRCOSC](https://github.com/VolcanicArts/VRCOSC) | VRChat OSC toolkit and modules | Separate application from add-ons. Shared name and OSC vocabulary do not prove same-product identity. |
| [ADVOSC](https://github.com/TheArmagan/advosc) | Windows VRChat OSC/chatbox utility | Check canonical publisher, version/update channel, terms and metadata interface. No installer downloads. |
| Generic OSC/VR utility | Compatible workflow but no particular publisher targeting | Keep as a lead or boundary fixture, not an accepted tagged item. |
| ALCOM / VPM client | Application plus package-management functions | See [client research](VRC_GET_ECOSYSTEM_RESEARCH.md). Do not fabricate a VPM release for the desktop app. |

## Historical classifier counterexamples

The September 27 prototype classifier probes found VRCX classified as an OSC companion, VRCFaceTracking under avatar frameworks, ADVOSC as a Unity extension, and a generic SteamVR mount as an OSC app. Their high scores came from keywords, not measured accuracy.

These are historical diagnostic examples, not current classifier results. Retain them as positive, adjacent and negative corpus cases. The [parity audit](../audits/PROTOTYPE_PARITY.md) explains why standalone GitHub ingestion is not yet complete canonical desktop-tool coverage.

## Required evidence

Record publisher-controlled purpose, supported OS, release/version, license, canonical project/front and VRChat relationship separately. Repository updated_at is not a release date. A tag is not automatically an application version.

Test app/module pairs, hardware boundaries, forks, generic utilities and unrelated physical products. Keep unknown category or identity unknown. No local OSC probing, VRChat logs, unofficial/private APIs or executable downloads.

Before a live adapter, complete host/API/terms/robots and retention/publication review. A default-enabled GitHub capability does not establish desktop-app relevance, safety, installability or source clearance.

Next artifact: a small labeled corpus with provenance and keep/research/defer decisions in the [implementation ledger](../../scratch/IMPLEMENTATION_PLAN.md).
