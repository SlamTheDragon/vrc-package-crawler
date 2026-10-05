# Product milestone notes

Keep one current milestone summary per product. Edit it for meaningful changes, not each commit.
Version configs supply versions. CI supplies channel, commit, delivery status and artifact checksums.
Each GitHub Release contains a product-specific CHANGELOG.md. Release pages hold historical notes.
Do not treat a checked build as proof of npm publication, container publication or Worker deployment.

## package

- Separate release and CalVer preview npm identities use the same canonical SDK import key.
- Release staging retains owner npm approval. Preview publication uses the trusted publisher and checks public artifact integrity.
- Release v0.1 still requires the complete owner API review.
- Packed-consumer checks exercise Node, declarations and the native Worker runtime. This is a version-0 API, not a stable contract.

## network

- Internal node/coordinator contracts are a distributed package, not sibling source imports.
- One suffix-free YYYY.M.Patch stream supplies both runtime channels through checked GitHub tarballs, receipts, notes and checksums.
- Each consumer supplies its SDK channel through a required peer. One network archive is tested against both SDK distributions.
- Root preparation checks hosted dependencies instead of compiling sibling producer source. The package remains unpublished on npm.
- Root delivery commands plan one patch, trigger tagged CI, and check published artifact receipts without local release files.

## crawler

- Separate Linux and Windows headless binaries use coordinator-issued leases and scoped source policies.
- Release and preview containers use separate GHCR packages and matching dependencies.
- CI checks one image without networking, then hands its checked archive to protected publication without rebuilding.
- The tagged preview trial passed Docker execution, config persistence, GHCR publication and automatic binary attachments.
- The desktop shell does not yet install or supervise these binaries. Real-source fleet and durable recovery checks remain open.

## crawler-client

- The Windows desktop shell has an independent build and version.
- Desktop previews use YY.M.Patch-pre from config, with short UTC years and MSI-bounded patches. Other product formats stay unchanged.
- MSI receives config-derived numeric version fields. The app, Cargo and preview tags keep the pre label.
- Installer outputs are unsigned. Node installation, supervision and update contracts remain unimplemented.
- CI normalizes installer filenames before receipts and stops if GitHub changes an uploaded name. Existing 0.0.0 assets remain immutable.

## web

- The static website remains a starter application, not an integrated operator dashboard.
- Website CI and hosting remain disabled pending owner direction.
