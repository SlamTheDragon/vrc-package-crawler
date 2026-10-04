# vrc-packages-api

This package supplies the consumer SDK and schemas for operator, user and application APIs. It does not supply a crawler node or job runner.

The root exports VRCPackageClient, VRCPackageClientOptions and VRCPApiError. VRC Packages is the canonical project brand. VRCP abbreviates that name, and P already stands for Packages. Use the exact client spelling VRCPackageClient, not VRCPPackageClient or VRCPPackagesClient. Crawler, Worker and Client describe project components, not the overall brand.

The package remains vrc-packages-api. Version zero retains no aliases for the old client/options/error names. Source, example and packed-consumer fixtures use the new names. The grouped Node/declaration/native Worker checks passed for these exports.

The taxonomy subpath exposes the three umbrella values: tools, assets and avatars. It does not supply an indexed tag vocabulary or coordinator-internal evidence schemas. VPM version validation belongs to the crawler. Coordinator-owned tags and classification profiles remain under development.

The distribution contains ESM JavaScript and TypeScript declarations. It does not require TypeScript source execution, Bun or another monorepo folder at runtime. Supported imports:

- `vrc-packages-api`
- `vrc-packages-api/protocol`
- `vrc-packages-api/types`
- `vrc-packages-api/taxonomy`
- `vrc-packages-api/auth`

Run `bun run build` to create the distribution. Each build removes the generated `dist` directory before compilation. This prevents deleted source files from leaving stale package exports. Source files remain unchanged.

Run `bun run test` to build and test it. `npm pack` runs the build before it creates a tarball. Runtime dependencies remain declared npm dependencies, not bundled copies.

Run `npm run test:distribution` before release. This test packs the SDK, installs the tarball in a separate directory and checks all exports with ordinary Node. It also checks strict declarations, an isolated Wrangler build and native Worker execution. Use `npm run test:distribution -- --offline` when npm has cached the runtime dependencies.

The SDK owns its pinned Worker test tools as development dependencies. The distribution test does not use another project directory. It prints and retains the temporary consumer directory for inspection. The packed SDK contains no Worker test tools or crawler source.

The owner authorizes v0.0.0 publication after package verification. The manifest permits publication and declares the existing Apache-2.0 license asset. CI checks the artifact before publishing it. npm preview publication remains deferred while the owner considers package channels. The complete owner API route review still gates v0.1.0, including its prereleases. See [delivery](../docs/source/DELIVERY.md) for exact config-driven routing and remaining checks. Packaging this SDK does not relocate crawler-internal Worker dependencies.

Operator lead rows use the exact Worker snake-case wire fields. The SDK adds no aliases or missing provenance. Approval and rejection require an explicit reason. Unknown fields fail validation. The grouped source and packed-consumer checks passed. Remaining authorization and report-lifecycle gaps still require review.

## Public catalog pages

`client.index.query` calls GET `/v1/app/index` without authentication. It accepts only `limit` and `cursor`. The default limit is 50. Integer limits from 1 through 100 are valid.

```typescript
const first = await client.index.query({ limit: 100 });
if (first.nextCursor !== null) {
  const next = await client.index.query({ limit: 100, cursor: first.nextCursor });
}
```

The response contains `schemaVersion`, `packages` and `nextCursor`. A null cursor ends the page sequence. It has no total count. Unsupported options, invalid cursors and malformed responses fail validation. Use the authenticated `index.search` method for search filters.
