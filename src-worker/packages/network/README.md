# VRC Packages network contracts

`vrc-packages-network` contains internal leased-ingestion contracts and pure policy shared by the Worker coordinator and crawler nodes.
It is a separate package under Worker ownership, not a Worker source entry point or a consumer application SDK.

The package contains node wire schemas, evidence classes, URL/IP checks, robots snapshots, bot identity, SemVer checks and title/link hygiene.
It contains no D1 storage, node SQLite storage, credentials, DNS resolver, source adapter or scheduler.
The robots reader accepts an injected safe transport and an explicit runtime user-agent. It does not choose an egress implementation.
It uses the public operator credential schema from `vrc-packages-api` without adding node jobs to that SDK.

Consumers use the declared subpath exports in `package.json`.
Exports point to compiled JavaScript and TypeScript declarations in `dist`.
They do not expose TypeScript source, sibling paths or a forwarding barrel.
Each runtime supplies its own product version to `crawlerUserAgent`.
HTTP identity uses `VRCPDiscoveryBot/{version}`. Robots checks also retain restrictions for the earlier bot token.
Both checks must allow the target. Earlier refusals do not disappear through wildcard fallback after the rename.

## Delivery status

Version `0.0.0` matches the current source manifests. No registry artifact exists from this implementation.
Consumer dependencies declare this exact version instead of a `file:` link.
Do not install registry coordinates until package ownership and reviewed artifact integrity are confirmed.
An ordinary clean install cannot succeed until verified matching artifacts exist in the selected registry.
Local gate checks must install packed artifacts into isolated consumers, not link these source folders.

The package remains `private: true` until artifact and dependency checks pass.
The distribution channel remains a deferred owner decision.
SDK v0.1.0 also requires the separate full owner API review.
This ownership change does not authorize deployment, publication or live source access.

Use [the delivery guide](../../../docs/source/DELIVERY.md) to prepare development artifacts and independent consumers.
From the repository root, run `npm run prepare:dev -- release worker` after release metadata sync.
The 23-file package passed isolated Node, Bun, declarations and native Worker checks on 2026-10-04.
Those checks do not select a registry or authorize publication.
Use `npm run build` to emit compiled development modules after dependencies are available.
Check the artifact's files, exports, license, declarations and runtime behavior before release.
