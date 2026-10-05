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

Checked GitHub Release tarballs exist for `0.0.1` and `2026.10.1-pre`. The package has no npm registry publication.
Version `0.0.0` in a bootstrap manifest does not identify the latest distributed archive.
A bare install that requests `vrc-packages-network@0.0.0` from npm fails. It does not select a GitHub artifact automatically.
Install checked packed artifacts into each consumer. Do not link sibling source folders.

The owner selects one future rapid `YYYY.M.Patch` stream, without `-pre` or a separate release path.
That migration and the hosted development installer remain queued under R57-NETWORK-SINGLE and R57-DEV-INSTALL.
Existing published tags and receipts stay unchanged. Consumer SDK channel selection still needs a dependency review.
The package remains `private: true` because GitHub tarball distribution does not require npm publication.
The SDK v0.1.0 owner-review hold remains. Neither installation nor artifact publication authorizes live source access.

Use [the delivery guide](../../../docs/source/DELIVERY.md) to prepare development artifacts and independent consumers.
From the repository root, run `npm run prepare:dev -- release worker` after release metadata sync.
The 23-file package passed isolated Node, Bun, declarations and native Worker checks on 2026-10-04.
Those checks do not select a registry or authorize publication.
Use `npm run build` to emit compiled development modules after dependencies are available.
Check the artifact's files, exports, license, declarations and runtime behavior before release.
