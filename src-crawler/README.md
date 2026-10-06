<!-- LOCKED DOCUMENTATION - DO NOT CHANGE -->

# VRCP Crawler Node

This is a docker image for the VRC Packages Network to run nodes on headless linux machines. VRC Packages (VRCP) is an open-source discovery and indexing network engine for public VRChat creator packages (Tools, Assets, & Avatars).

---

## Contributing to our Discovery Crawler Network

This is a Dockerfile with fleet configuration. Image publication, restart recovery and automatic updates are pending.

```bash
# See latest version at https://github.com/SlamTheDragon/vrc-packages/pkgs/container/vrcp-crawler-node
docker pull ghcr.io/slamthedragon/vrcp-crawler-node:<VERSION>

# For preview builds, go to https://github.com/SlamTheDragon/vrc-packages/pkgs/container/vrcp-crawler-node-preview
docker pull ghcr.io/slamthedragon/vrcp-crawler-node-preview:<VERSION>-pre
```

Review the [Docker runbook](../DELEGATES.md#3-crawler-node-operation--fleet-management) before starting containers. The compose file grants Watchtower access to the host Docker socket.

---

To read further, see repository documentation at [docs/applications](../docs/applications/VRCP%20Crawler/).

---

## Changelogs

Current changelog lies [here](https://github.com/SlamTheDragon/vrc-packages/blob/main/CHANGELOG.md) <br/>
Read the full changelog history [here](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-crawler-node)

---

## Legal & Compliance

The Project operates under strict technical and legal covenants to safeguard creator rights and target infrastructure:

- **Zero-Binaries**: The crawler never fetches, stores, or mirrors binary archives (e.g. `.unitypackage`, `.zip`, `.rar`, executables, or 3D model files).
- **Mandatory Outbound Routing**: Downstream APIs and applications must provide direct outbound links to the original creator storefront or repository.
- **RFC 9309 Robots Compliance**: Honors `robots.txt` directives with conservative origin-wide AIMD rate pacing.
- **Removal Review**: App-authenticated removal reports are recorded without automatic delisting. DNS/bio ownership verification remains unimplemented.
- **Anti-AI Model Training Restrictions**: Catalog compilations are restricted from use in training generative AI models.

Review [LEGAL.md](../LEGAL.md) for full operational covenants, governing law, and public terms of service.

---

## License

This application is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) — see [`LICENSE.md`](../LICENSE.md) for details.
