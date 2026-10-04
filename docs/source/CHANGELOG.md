# Product milestone notes

Keep one current milestone summary per product. Edit it for meaningful changes, not each commit.
Version configs supply versions. CI supplies channel, commit, delivery status and artifact checksums.
Each GitHub Release contains a product-specific CHANGELOG.md. Release pages hold historical notes.
Do not treat a checked build as proof of npm publication, container publication or Worker deployment.

## package

- Separate release and CalVer preview npm identities use the same canonical SDK import key.
- Checked staging retains owner npm approval. Release v0.1 still requires the complete owner API review.
- Packed-consumer checks exercise Node, declarations and the native Worker runtime. This is a version-0 API, not a stable contract.

## worker

- The API-only coordinator consumes the verified registry SDK and a packaged internal network dependency.
- Preview uses a separate Worker, D1 and operator secret. Production deployment remains disabled.
- Schema initialization and live source access are separate actions. Public rights and age controls remain open.

## network

- Internal node/coordinator contracts are a distributed package, not sibling source imports.
- The tarball is an artifact only. No public or private registry channel is selected.

## crawler

- Separate Linux and Windows headless binaries use coordinator-issued leases and scoped source policies.
- Container validation runs without networking. Container registry publication is a separate gated action.
- The desktop shell does not yet install or supervise these binaries. Real-source fleet and durable recovery checks remain open.

## crawler-client

- The Windows desktop shell has an independent build and version.
- Installer outputs are unsigned. Node installation, supervision and update contracts remain unimplemented.

## web

- The static website remains a starter application, not an integrated operator dashboard.
- Website CI and hosting remain disabled pending owner direction.
