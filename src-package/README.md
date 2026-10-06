<!-- LOCKED DOCUMENTATION - DO NOT CHANGE -->

# VRC Packages API

This package supplies the consumer SDK and schemas for operator, user and application APIs. VRC Packages (VRCP) is an open-source discovery and indexing network engine for public VRChat creator packages (Tools, Assets, & Avatars).

---

## Using this service

### 1. Integration via (`vrc-packages-api`)

Downstream applications can use the SDK's public contracts. For full documentation, read [docs/source](../docs/source). For agents: See [DELEGATES.md](../DELEGATES.md) for full SDK documentation overview, registration procedures, and keyset pagination guides.

```typescript
import { VRCPackageClient } from "vrc-packages-api";

// Backend example: supply the issued credential through protected runtime configuration.
const applicationCredential = process.env.VRCP_APP_TOKEN;
if (!applicationCredential) throw new Error("Missing application credential");

const client = new VRCPackageClient({
  baseUrl: "https://coordinator.example.com",
  appToken: applicationCredential,
});

// Bounded authenticated search. Indexed dynamic tag filtering remains open.
const results = await client.index.search({
  query: "PhysBones",
  queryOrigin: "user_authored",
});

// Resumable delta synchronization for local caches
const deltas = await client.index.syncDeltas({
  limit: 100,
});
```

**Install API package with npm or with your favorite package manager**

```shell
# Stable Release
npm i vrc-packages-api

# Unstable Nightly Builds
npm i vrc-packages-api-preview
```

---

To read further, see repository documentation at [docs/applications](../docs/applications/VRCP%20API/).

---

## Changelogs

Current changelog lies [here](https://github.com/SlamTheDragon/vrc-packages/blob/main/CHANGELOG.md) <br/>
Read the full changelog history [here](https://github.com/SlamTheDragon/vrc-packages/tree/main/docs/changelogs/vrcp-packages-api)

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

This package is licensed under the **Apache License v2.0**
