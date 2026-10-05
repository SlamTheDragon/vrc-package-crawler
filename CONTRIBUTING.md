# Contributing to VRC Packages

This monorepo is version-0 pre-production software. A successful build does not establish release readiness or source-access permission.
Read [LEGAL.md](LEGAL.md) and the [active tracker](docs/scratch/IMPLEMENTATION_PLAN.md) before changes.

## Project boundaries

| Project | Responsibility |
| --- | --- |
| src-worker | API-only Cloudflare coordinator, authentication, leases, policy and D1 storage |
| src-worker/packages/network | Compiled internal wire and pure policy contracts, distributed as a tarball |
| src-crawler | Headless node, leased fetching, adapters, local storage and task lifecycle |
| src-package | Public operator, user and application SDK, not crawler job execution |
| src-web | Separate Astro starter for the future website and operator interface |
| src-crawler-client | Separate Windows Tauri shell starter, not an integrated node supervisor |

Never import another project's source or tests through relative paths, aliases or symlinks.
Consume shared code through declared distribution packages. A file link to sibling source does not meet this requirement.
Keep archives, executables, databases, credentials and generated outputs out of source commits.
Use VRC Packages for the product name. Use VRCP for component prefixes and the exact SDK name VRCPackageClient.
Preserve upstream identifiers and the accepted vrc-packages-* package names.

## Development sequence

Use [DELEGATES.md](DELEGATES.md) for operational responsibilities and [delivery](docs/source/DELIVERY.md) for commands and CI setup.
Agent-specific delivery checks are separate in [the agent procedure](docs/decisions/AGENT_DELIVERY.md).

1. Read the canonical and unmerged ledgers in docs/scratch.
2. Choose one capability gate or related gate group.
3. Record the bounded work and unresolved decisions in task_tracker.md.
4. Implement the related paths before the grouped verification checkpoint.
5. Run the affected unit, type, distribution and runtime/build checks together.
6. Inspect the diff for lost behavior, sibling imports, secrets and unsupported documentation claims.
7. Record measured evidence and open risks. Do not equate passing fixtures with complete system reliability.

The 2–3-file limit applies to docs/scratch, not source and test edits.
Keep exactly the canonical ledger, unmerged ledger and tracker there.
Put research in docs/research. Keep current capability descriptions in docs/source.

## Versions, branches and artifacts

The two root version configs are authoritative. Do not substitute example tag versions.
Local builds create development artifacts only. Do not create release installers or publish from this workspace.
CI creates release artifacts from matching product tags. Website CI and hosting remain deferred.
Worker deployment is currently preview-only. The preview database must remain separate from production.
Publish the selected channel's SDK before consumer tags that require its registry version.
The complete owner API route review still blocks SDK v0.1.0 and later, including prereleases.

Use a focused development branch, normally with the codex/ prefix for agent changes.
Review and merge its commit before tagging that commit for delivery.
Branch automation starts after per-product patch-1 proof. The approved responsibility branches are website-preview, crawler-client-preview, api-package-preview and worker-preview.
Main will own releases and require reviewed promotion PRs. Website CI remains disabled.
API preview pushes will publish directly, with version patches allocated before commit. These branch triggers are not yet implemented.
Crawler CI defines standalone Windows and Linux artifacts as well as the container.
The desktop shell's download, signature, update and supervision contracts remain future work.

For a configured product, run `npm run delivery:preview -- <product>` to see the next patch and delivery blockers.
Add `--execute` only after review to commit that config patch and atomically push the branch and product tag.
CI builds, publishes and attaches assets through existing workflows. Release npm staging needs the owner's npm approval.
Preview npm publication uses its trusted publisher directly. Worker release tags build only, without production deployment or Release assets.
Use `npm run delivery:status -- <tag>` for CI progress and `npm run delivery:check -- <tag>` for hosted artifact checks.
No command creates local release binaries. See the delivery manual for retries and disabled paths.

## Security and source access

Never publish tokens or request bodies that can contain credentials.
Report a security concern privately to the maintainer contact in LEGAL.md without including live secrets.
Nodes require unexpired leases, active scoped source profiles and robots compliance before fetching.
Coordinator loss stops fetching. Queued URLs, enabled drivers and public visibility do not grant access.
Do not test against real sources until those boundaries and the intended source scope are approved.
