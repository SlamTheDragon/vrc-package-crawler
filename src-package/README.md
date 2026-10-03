# vrc-packages-api

This package supplies the consumer SDK and schemas for operator, user and application APIs. It does not supply a crawler node or job runner.

The distribution contains ESM JavaScript and TypeScript declarations. It does not require TypeScript source execution, Bun or another monorepo folder at runtime. Supported imports:

- `vrc-packages-api`
- `vrc-packages-api/protocol`
- `vrc-packages-api/types`
- `vrc-packages-api/taxonomy`
- `vrc-packages-api/auth`

Run `bun run build` to create the distribution. Each build removes the generated `dist` directory before compilation. This prevents deleted source files from leaving stale package exports. Source files remain unchanged.

Run `bun run test` to build and test it. `npm pack` runs the build before it creates a tarball. Runtime dependencies remain declared npm dependencies, not bundled copies.

Run `npm run test:distribution` before release. This test packs the SDK, installs the tarball in a separate directory and checks all exports with ordinary Node. It also checks strict declarations, an isolated Wrangler build and native Worker execution. Use `npm run test:distribution -- --offline` when npm has cached the runtime dependencies.

The SDK owns its pinned Worker test tools as development dependencies. The distribution test does not use another project directory. It prints and retains the temporary consumer directory for inspection. The published SDK contains no Worker test tools or crawler source.

Registry publication remains pending. Package identity, release version and license metadata need review before publication. Cloudflare Builds must consume an approved distribution rather than importing this package's source across project folders. Packaging this SDK does not relocate crawler-internal Worker dependencies.
