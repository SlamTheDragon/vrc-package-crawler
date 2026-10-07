#!/usr/bin/env node
// Add args for each help path and a documentation link when ready

import process from "node:process";

const TOPICS = {
  execute: `
Execute Pipeline (bun run execute <product> <channel> [options])
================================================================
Runs the unified single-command delivery pipeline for a product and channel.

Usage:
  bun run execute <product> <channel> [--force] [--skip-tests] [--no-watch]
  bun run delivery:execute <product> <channel>

Parameters:
  <product>    One of: package, crawler, crawler-client, worker, network
  <channel>    One of: preview, release

Options:
  --force       Owner-only direct release commit and tag push directly to main.
  --skip-tests  Skip tests (PREVIEW ONLY; forbidden on release routes).
  --no-watch    Trigger and plan delivery without watching GitHub Actions.

Pipeline Stages:
  1. Predecessor Verification: Verifies previous version proof in config.versions.json.
  2. Remote Artifact Check: Ensures target version has not already been published.
  3. Changelog Extraction: Extracts and strips comments for the targeted version.
  4. Atomic Commit & Push: Pushes source commit and annotated tag.
  5. Workflow Tracking: Locates and streams GitHub Actions execution.
  6. Challenge Detection: Alerts for environment reviews or npm staging approvals.
  7. Finalization: Verifies published assets, registry digests, and announcements.
`,
  reconcile: `
SDK Release Reconciliation (bun run delivery:reconcile)
=======================================================
Dispatches sdk-release-reconcile.yml to reconcile staged npm packages.

Usage:
  bun run delivery:reconcile

Purpose:
  When an npm package (e.g. vrc-packages-api) is staged for publication, the
  GitHub Actions workflow creates a draft release and alerts the owner. Once the
  package is approved on npmjs.com, this command immediately triggers the
  reconciliation workflow to make the release public and notify Discord.
`,
  delivery: `
Delivery Subcommands (bun run delivery:*)
=========================================
Manual and granular delivery lifecycle operations.

Available Commands:
  bun run delivery:preview <product>     Start preview delivery branch & tag.
  bun run delivery:release <product>     Prepare release candidate PR on branch.
  bun run delivery:finalize <product>    Finalize reviewed release PR after merge.
  bun run delivery:check <tag>           Verify release assets and checksums in remote.
  bun run delivery:check:all             Check all configured product release tags.
  bun run delivery:diagnose <tag>        Diagnose tag status and remote artifacts.
  bun run delivery:status                Display current delivery pipeline status.
`,
  recovery: `
Delivery Recovery (bun run delivery:recover)
============================================
Operational recovery procedures for interrupted or failed delivery runs.

Commands:
  bun run delivery:recover <tag>             Trigger authorized CI recovery.
  bun run delivery:authorize-recovery <tag>   Authorize recovery token locally.
`,
  testing: `
Testing & Quality Assurance
===========================
Commands for running test suites and checking code boundaries.

Commands:
  bun test ./tests                      Run repository governance and delivery tests.
  bun run --cwd src-package test        Run SDK unit and distribution tests.
  bun run --cwd src-crawler test        Run Crawler node unit and protocol tests.
  bun run --cwd src-worker test         Run Coordinator Worker unit tests.
  bun run --cwd src-worker test:runtime Run Coordinator Worker runtime smoke tests.
  bun run --cwd src-crawler-client check Run Svelte type checks.
`
};

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const topic = args[0]?.toLowerCase();

if (topic && TOPICS[topic]) {
  console.log(TOPICS[topic].trim());
} else {
  console.log(`
VRC Packages (VRCP) Delivery & Operations CLI
=============================================
Authoritative repository CLI tool for building, testing, delivering, and managing VRCP components.

Primary Commands:
  bun run execute <product> <channel>    Run unified delivery pipeline (e.g. bun run execute package release)
  bun run delivery:reconcile             Trigger on-demand SDK staged package reconciliation
  bun run delivery:check <tag>           Verify published artifacts against remote checksums
  bun run delivery:status                Check active delivery status across products
  bun test ./tests                       Run root governance and integration test suite

Products:
  package         VRC Packages SDK (vrc-packages-api on npm)
  crawler         Crawler Node (Linux/Windows binaries + Docker image)
  crawler-client  Crawler Desktop Shell (Windows Tauri application)
  worker          Coordinator Service (Cloudflare Worker API)
  network         Discovery Bot & Protocol contracts

Help Topics:
  bun run help execute                   Detailed options for the execute pipeline
  bun run help reconcile                 Staged package reconciliation details
  bun run help delivery                  Granular delivery subcommands
  bun run help recovery                  Troubleshooting and CI recovery
  bun run help testing                   Test suites and validation commands

Documentation:
  - Architecture & Delivery: docs/scratch/IMPLEMENTATION_PLAN.md
  - Operational Runbook:     DELEGATES.md
  - Task Status:             docs/scratch/task_tracker.md
`.trim());
}