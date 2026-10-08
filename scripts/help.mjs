#!/usr/bin/env node
import process from "node:process";

const TOPICS = {
  execute: `
================================================================
Execute Pipeline (bun run execute <product> <channel> [options])
================================================================

Runs the authoritative single-command delivery pipeline for a product and channel.

Usage:
  bun run execute <product> <channel> [--force] [--skip-tests] [--no-watch]
  bun run delivery:execute <product> <channel>

Parameters:
  <product>    Target product to deliver:
                 - package         (VRC Packages SDK: vrc-packages-api on npm)
                 - crawler         (Crawler Node: Docker GHCR & Windows binaries)
                 - crawler-client  (Crawler Desktop Shell: Windows NSIS/MSI)
                 - worker          (Coordinator API: Cloudflare Worker)
                 - network         (Internal Shared Package: vrc-packages-network)
  <channel>    Deployment channel:
                 - preview         (Prerelease channel: CalVer YY.M.Patch-pre)
                 - release         (Production release: SemVer major.minor.patch)

Options:
  --force       Owner-only direct release commit and tag push directly to main,
                bypassing temporary candidate branches and PR ceremony. Requires
                admin repository collaborator authority authenticated via GitHub PAT.
  --skip-tests  Skip test execution for rapid preview iteration.
                NOTE: PREVIEW ONLY. Test skipping is strictly forbidden on release routes.
  --no-watch    Trigger pipeline, commit, and push tag without watching GitHub Actions.

Concrete Examples:
  # Direct release of SDK to npm and GitHub Release with owner authority:
  bun run execute package release --force

  # Direct release of Desktop Shell (Windows NSIS & WiX MSI):
  bun run execute crawler-client release --force

  # Rapid preview iteration for Crawler Node, skipping tests:
  bun run execute crawler preview --skip-tests

  # Preview deployment of Cloudflare Worker API coordinator:
  bun run execute worker preview

  # Shared network archive preview distribution:
  bun run execute network preview

Pipeline Stages (Sequenced Automatically):
  1. Predecessor Verification: Verifies previous version proof in config.versions.json.
  2. Remote Artifact Check: Ensures target version has not already been published.
  3. Changelog Extraction: Extracts and strips comments for the targeted version.
  4. Atomic Commit & Push: Pushes source commit and annotated tag to origin.
  5. Workflow Tracking: Locates and streams GitHub Actions execution in real-time.
  6. Challenge Detection: Alerts for environment reviews or npm staging approvals.
  7. Finalization: Verifies published assets, registry digests, and announcements.
`,

  build: `
=============================================
Unified Monorepo Build (bun run build [prod])
=============================================

Executes unified local builds across subprojects and submodules directly in
dependency order (network -> package -> worker -> crawler -> crawler-client -> web -> web-search).

Commands:
  bun run build                         Build all products for preview channel
  bun run build all [channel]           Build all products for specified channel (preview | release)
  bun run build <product> [channel]     Build a single product (preview | release)

Available Products:
  package, crawler, crawler-client, worker, network, web, web-search

Concrete Examples:
  # Build all products for preview:
  bun run build

  # Build crawler node for current platform:
  bun run build crawler

  # Build worker coordinator for release:
  bun run build worker release
`,

  setup: `
========================================================
Monorepo Setup Walkthrough & Dependency Management
========================================================

Installs dependencies across the root repository, all product subprojects, and
git submodules non-destructively using Bun (--no-save --ignore-scripts).

Quickstart Walkthrough:
  1. Environment Configuration:
     Copy the template environment file and configure local credentials:
       cp .env.example .env
     Ensure GH_TOKEN or GITHUB_TOKEN has appropriate repo permissions (or ensure
     Git credentials are authenticated via 'git credential fill').

  2. Initialize Submodules & Install All Dependencies:
     Run the monorepo setup command:
       bun run setup
     (or bun run setup:all)
     This automatically:
       - Initializes and clones git submodules (including src-web-search)
         via 'git submodule update --init --recursive'.
       - Installs dependencies across all 8 projects using
         'bun install --no-save --ignore-scripts' without mutating lockfiles.

  3. Verify System Health:
     Run the governance test suite to ensure workspace integrity:
       bun test ./tests

Setup Commands:
  bun run setup                     Install all dependencies across all 8 projects
  bun run setup:all                 Same as bun run setup
  bun run setup <project>           Install dependencies for a specific product
  bun run setup:root                Install root workspace dependencies only
  bun run onboard                   Interactive onboarding wizard (.env credentials & project setup)
  bun run setup:interactive         Same as bun run onboard
  bun run setup:crawler             Install Crawler Node dependencies (src-crawler)
  bun run setup:crawler-client      Install Desktop Shell dependencies (src-crawler-client)
  bun run setup:package             Install SDK dependencies (src-package)
  bun run setup:worker              Install Cloudflare Worker dependencies (src-worker)
  bun run setup:network             Install Shared Network dependencies (src-worker/packages/network)
  bun run setup:web                 Install Web Starter dependencies (src-web)
  bun run setup:web-search          Install Web Search Submodule dependencies (src-web-search)

Available Project Identifiers:
  root, crawler, crawler-client, package, web, web-search, worker, network

Example Usage:
  bun run setup web-search          # Initialize & install web-search submodule
  bun run setup crawler             # Install crawler dependencies only
  bun run setup:root                # Install root dependencies only
`,

  reconcile: `
=======================================================
SDK Release Reconciliation (bun run delivery:reconcile)
=======================================================

Dispatches sdk-release-reconcile.yml to reconcile staged npm packages.

Usage:
  bun run delivery:reconcile

Purpose & Workflow:
  When an npm package (e.g. vrc-packages-api) is released, the GitHub Actions
  pipeline stages the package in npm Staged Packages and alerts the owner via
  Discord webhook with an actionable approval link.
  
  Once the package is approved on npmjs.com:
    1. Run: bun run delivery:reconcile
    2. The reconciliation workflow verifies the public npm registry release.
    3. The draft GitHub Release is made public and release assets are verified.
    4. Terminal Discord announcements and cache maintenance are triggered.

Example:
  # After approving npm staged package vrc-packages-api@0.0.7 on npmjs.com:
  bun run delivery:reconcile
`,

  delivery: `
=========================================
Delivery Subcommands (bun run delivery:*)
=========================================

Granular inspection, verification, and lifecycle delivery operations.

Inspection & Verification:
  bun run delivery:check <tag>           Verify release assets and checksums in remote
  bun run delivery:check:all             Check all 9 configured product release channels
  bun run delivery:status                Display current delivery pipeline status
  bun run delivery:diagnose <tag>        Diagnose tag status and remote artifacts
  bun run delivery:diagnose:all          Diagnose all configured channels

Lifecycle Preparation & Finalization:
  bun run delivery:preview <product>     Start preview delivery branch & tag
  bun run delivery:release <product>     Prepare release candidate PR on branch
  bun run delivery:finalize <product>    Finalize reviewed release PR after merge
  bun run delivery:retry <tag>           Retry git delivery without re-bumping

Concrete Examples:
  # Check published assets and SHA-256 checksums for SDK 0.0.7:
  bun run delivery:check vrcp-api/v0.0.7

  # Check published binaries and Docker image for Crawler 0.0.12:
  bun run delivery:check vrcp-crawler/v0.0.12

  # Check all 9 configured preview and release delivery paths:
  bun run delivery:check:all

  # Inspect active status across products:
  bun run delivery:status

  # Plan next preview patch for crawler:
  bun run delivery:preview crawler
`,

  recovery: `
======================================================
Delivery Recovery & Diagnosis (bun run recovery)
======================================================

Interactive console and operational recovery for interrupted or failed delivery runs.

Commands:
  bun run recovery                            Interactive recovery console & failure diagnosis
  bun run recovery:patch create <prod> <ver>  Create temporary release/patch/* branch & revert tag
  bun run recovery:patch merge <prod> <ver>   Merge patch fixes into source branch & delete patch branch
  bun run recovery:rerun <runId> [--all]      Rerun failed CI jobs or full workflow run
  bun run recovery:revert-tag <tag> [--remote] Revert local (and optional remote) delivery tag
  bun run delivery:recover <tag>              Trigger authorized CI recovery
  bun run delivery:authorize-recovery <tag>   Authorize recovery token locally

Purpose:
  If a CI workflow fails due to transient infrastructure issues (e.g. registry rate limits,
  temporary runner network failures) after an immutable tag has already been pushed, recovery
  replays the exact original source and tag without incrementing version numbers.
  For critical code defects mid-pipeline, the recovery CLI automatically creates a temporary
  branch (release/patch/<product>/v<version>), reverts the tag, merges fixes back, and deletes
  the temporary branch.

Concrete Examples:
  # Launch interactive recovery console:
  bun run recovery

  # Create temporary patch branch for Crawler v0.0.12:
  bun run recovery:patch create crawler 0.0.12

  # Merge patch branch back to main and clean up:
  bun run recovery:patch merge crawler 0.0.12

  # Rerun failed jobs for a workflow run:
  bun run recovery:rerun 37624229765

  # Dispatches recovery run for interrupted Crawler build:
  bun run delivery:recover vrcp-crawler/v0.0.9
`,

  cleaning: `
======================================================
Monorepo Cleanup & State Reset (bun run clean / reset)
======================================================

Safe cleaning of generated build artifacts and dependency caches.
NOTE: Dry-run by default. Pass --apply to execute deletions.

Clean (Deletes build outputs, dist/, and dev artifacts):
  bun run clean <project|all> [--apply]
  bun run clean:all                      Plan cleanup across all products
  bun run clean:crawler --apply          Delete Crawler dev binaries and test outputs
  bun run clean:crawler-client --apply   Delete Desktop build artifacts and Svelte kit
  bun run clean:package --apply          Delete SDK dist and build info
  bun run clean:worker --apply           Delete Worker wrangler dev builds
  bun run clean:network --apply          Delete shared network dist artifacts
  bun run clean:web --apply              Delete web dist and astro cache

Reset (Deletes node_modules for clean dependency reinstallation):
  bun run reset <project|all> [--apply]
  bun run reset:all --apply              Delete node_modules across all products
  bun run reset:root --apply             Delete root node_modules only
  bun run reset:crawler --apply          Delete crawler node_modules only

Concrete Examples:
  # Dry-run review of artifacts to be deleted:
  bun run clean:all

  # Clean crawler build artifacts:
  bun run clean:crawler --apply

  # Clean reset all dependencies across the entire monorepo:
  bun run reset:all --apply
  bun run setup:all
`,

  versions: `
================================================
Version Configuration Management (versions:*)
================================================

Manages authoritative versions declared in config.versions.json and
config.preview.versions.json.

Commands:
  bun run sync:check                     Evaluate git ahead/behind and version config drift against origin
  bun run sync:deps                      Synchronize internal vrc-packages-network across consumers
  bun run versions:check:release         Check release manifest alignment against config
  bun run versions:check:preview         Check preview manifest alignment against config
  bun run versions:sync:release          Synchronize manifests to config.versions.json
  bun run versions:sync:preview          Synchronize manifests to config.preview.versions.json
  bun run versions:bump <product>        Plan next version bump

Concrete Examples:
  # Check synchronization state against origin/main:
  bun run sync:check

  # Synchronize internal vrc-packages-network dependencies across consumers:
  bun run sync:deps

  # Validate that all product package.json files match the release config:
  bun run versions:check:release

  # Synchronize preview manifests after updating preview versions config:
  bun run versions:sync:preview
`,

  testing: `
===========================
Testing & Quality Assurance
===========================

Validation commands across monorepo governance, products, and submodules.

Commands:
  bun test ./tests                      Run repository governance and delivery tests
  bun test tests/setup.test.ts          Run monorepo setup tests
  bun test tests/delivery.test.ts       Run delivery contract tests
  bun test tests/delivery-chain.test.ts Run gated delivery pipeline tests
  bun run --cwd src-package test        Run SDK unit and distribution tests
  bun run --cwd src-crawler test        Run Crawler node unit and protocol tests
  bun run --cwd src-worker test         Run Coordinator Worker unit tests
  bun run --cwd src-worker test:runtime Run Coordinator Worker runtime smoke tests
  bun run --cwd src-crawler-client check Run Svelte type checks for desktop client
  bun run --cwd src-web-search build    Verify Astro search submodule build

Concrete Examples:
  # Run full root governance test suite:
  bun test ./tests

  # Run crawler unit tests:
  bun run --cwd src-crawler test

  # Run worker tests and runtime smoke test:
  bun run --cwd src-worker test
  bun run --cwd src-worker test:runtime
`
};

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const topic = args[0]?.toLowerCase();

if (topic && TOPICS[topic]) {
  console.log(TOPICS[topic].trim());
} else {
  console.log(`
=============================================
VRC Packages (VRCP) Delivery & Operations CLI
=============================================

Authoritative repository CLI tool for building, testing, delivering, and managing VRCP components.

Quickstart Setup Walkthrough:
  1. cp .env.example .env       Configure local GitHub credentials (GH_TOKEN / GITHUB_TOKEN)
  2. bun run setup              Initialize submodules & install dependencies across all 8 projects
  3. bun test ./tests           Verify monorepo governance and delivery integrity

Primary Operational Commands:
  bun run execute <product> <channel>    Run unified delivery pipeline (e.g. bun run execute package release --force)
  bun run delivery:reconcile             Trigger on-demand SDK staged package reconciliation
  bun run build [product] [channel]      Execute unified local builds across subprojects
  bun run setup                          Install dependencies across root and all 8 subprojects
  bun run onboard                        Interactive onboarding wizard (.env credentials & project setup)
  bun run recovery                       Interactive failure diagnosis and recovery console
  bun run sync:check                     Evaluate git ahead/behind and version config drift
  bun run sync:deps                      Synchronize internal network dependencies
  bun run delivery:check <tag>           Verify published artifacts against remote checksums
  bun run delivery:check:all             Check all 9 configured preview and release delivery paths
  bun run delivery:status                Check active delivery status across products
  bun test ./tests                       Run root governance and integration test suite

Products:
  package         VRC Packages SDK (vrc-packages-api on npm)              [src-package]
  crawler         Crawler Node (Docker GHCR image & Windows binary)       [src-crawler]
  crawler-client  Crawler Desktop Shell (Windows NSIS & WiX MSI)         [src-crawler-client]
  worker          Coordinator Services (Cloudflare Worker API)            [src-worker]
  network         Internal Shared Package (vrc-packages-network)          [src-worker/packages/network]
  web             Web Portal Starter                                      [src-web]
  web-search      Web Search Frontend (submodule: vrc-packages-search)   [src-web-search]

Help Topics (run 'bun run help <topic>'):
  bun run help execute                   Detailed options and examples for unified execute pipeline
  bun run help build                     Unified monorepo build orchestration across products
  bun run help setup                     Comprehensive monorepo setup walkthrough & project targets
  bun run help reconcile                 Staged npm package reconciliation and approval workflow
  bun run help delivery                  Granular delivery inspection, check, and lifecycle subcommands
  bun run help recovery                  Operational troubleshooting and CI workflow recovery
  bun run help cleaning                  Cleaning build artifacts and resetting dependency state
  bun run help versions                  Authoritative version configuration and synchronization
  bun run help testing                   Test suites, typechecks, and product verification commands

Documentation:
  - Repository Entry Point:  AGENTS.md
  - Operational Runbook:     DELEGATES.md
  - Delivery Procedures:     docs/decisions/AGENT_DELIVERY_PROCEDURE.md
`.trim());
}