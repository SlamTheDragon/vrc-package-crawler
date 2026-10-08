#!/usr/bin/env node
import process from "node:process";

const useColor = !process.env.NO_COLOR && (process.stdout.isTTY ?? true);
const c = {
  reset: useColor ? "\x1b[0m" : "",
  bold: useColor ? "\x1b[1m" : "",
  dim: useColor ? "\x1b[2m" : "",
  cyan: useColor ? "\x1b[36m" : "",
  green: useColor ? "\x1b[32m" : "",
  yellow: useColor ? "\x1b[33m" : "",
  red: useColor ? "\x1b[31m" : "",
  magenta: useColor ? "\x1b[35m" : "",
  blue: useColor ? "\x1b[34m" : ""
};

const TOPICS = {
  execute: {
    title: "Delivery Pipeline Execution",
    usage: "bun run publish <product> <channel> [options]",
    aliases: ["bun run execute", "bun run publish:execute", "bun run delivery:execute"],
    flags: [
      ["--force", "Owner direct-release bypass (skips PR ceremony, commits/tags directly to main)"],
      ["--skip-tests", "Skip test execution (PREVIEW ONLY; forbidden on release routes)"],
      ["--no-watch", "Commit and push tag without streaming GitHub Actions progress"]
    ],
    examples: [
      "bun run publish package release --force",
      "bun run publish crawler preview --skip-tests",
      "bun run publish worker preview",
      "bun run publish crawler-client release --force"
    ]
  },
  publish: {
    title: "Publishing & Release Management",
    usage: "bun run publish <product> <channel> [options]",
    aliases: ["bun run publish:preview", "bun run publish:release", "bun run publish:finalize"],
    flags: [
      ["--force", "Owner single-pass direct commit/tag push"],
      ["--skip-tests", "Preview-only rapid iteration test skip"],
      ["--no-watch", "Do not stream workflow progress in terminal"]
    ],
    examples: [
      "bun run publish:preview crawler",
      "bun run publish:release package --force",
      "bun run publish:reconcile",
      "bun run publish:status"
    ]
  },
  build: {
    title: "Unified Monorepo Build",
    usage: "bun run build [product] [channel]",
    aliases: ["bun run build all [channel]"],
    flags: [
      ["[product]", "Target: package, crawler, crawler-client, worker, network, web, web-search, all"],
      ["[channel]", "Deployment mode: preview (default) | release"]
    ],
    examples: [
      "bun run build",
      "bun run build crawler",
      "bun run build worker release",
      "bun run build all release"
    ]
  },
  setup: {
    title: "Monorepo Setup & Dependency Management",
    usage: "bun run setup [target] | bun run init",
    aliases: ["bun run onboard", "bun run setup:root", "bun run setup:interactive"],
    flags: [
      ["--interactive, -i", "Interactive credential onboarding wizard (.env & PAT verification)"],
      ["[target]", "Project target: all (default), root, crawler, package, worker, network, etc."]
    ],
    examples: [
      "bun run init",
      "bun run setup",
      "bun run setup crawler",
      "bun run setup:root"
    ]
  },
  recovery: {
    title: "Delivery Recovery & Failure Diagnosis",
    usage: "bun run recovery [subcommand] [args]",
    aliases: ["bun run publish:recover", "bun run delivery:recover"],
    flags: [
      ["interactive", "Interactive failure diagnosis & remediation menu (default)"],
      ["patch-branch <create|merge>", "Manage temporary release/patch/* isolation branches"],
      ["rerun <runId>", "Rerun failed CI workflow jobs"],
      ["revert-tag <tag>", "Safely delete/revert premature delivery tag"]
    ],
    examples: [
      "bun run recovery",
      "bun run recovery:patch create crawler 0.0.12",
      "bun run recovery:patch merge crawler 0.0.12",
      "bun run recovery:rerun 12345678"
    ]
  },
  sync: {
    title: "Version Synchronization & Parity",
    usage: "bun run sync:check | bun run sync:deps",
    aliases: ["bun run versions:check:release", "bun run versions:sync:release"],
    flags: [
      ["sync:check", "Detect git ahead/behind state and version drift vs remote"],
      ["sync:deps", "Align internal network peer dependencies across subprojects"]
    ],
    examples: [
      "bun run sync:check",
      "bun run sync:deps"
    ]
  }
};

TOPICS.delivery = TOPICS.execute;

function renderTopic(key) {
  const t = TOPICS[key];
  if (!t) return false;

  console.log(`\n${c.bold}${c.cyan}◆ ${t.title}${c.reset}`);
  console.log(`${c.dim}  ${t.usage}${c.reset}\n`);

  if (t.aliases?.length) {
    console.log(`  ${c.bold}Aliases:${c.reset}`);
    t.aliases.forEach(a => console.log(`    ${c.dim}•${c.reset} ${a}`));
    console.log("");
  }

  if (t.flags?.length) {
    console.log(`  ${c.bold}Flags & Parameters:${c.reset}`);
    t.flags.forEach(([f, desc]) => {
      console.log(`    ${c.yellow}${f.padEnd(24)}${c.reset} ${c.dim}${desc}${c.reset}`);
    });
    console.log("");
  }

  if (t.examples?.length) {
    console.log(`  ${c.bold}Examples:${c.reset}`);
    t.examples.forEach(ex => console.log(`    ${c.green}❯${c.reset} ${ex}`));
    console.log("");
  }

  return true;
}

function renderOverview() {
  console.log(`
${c.bold}${c.cyan}◆ VRC Packages (VRCP) Operations CLI${c.reset}
${c.dim}  Unified monorepo orchestration for delivery, build, and recovery${c.reset}

${c.bold}Quickstart:${c.reset}
  ${c.green}1.${c.reset} ${c.yellow}bun run init${c.reset}                ${c.dim}Configure .env credentials & test GitHub PAT${c.reset}
  ${c.green}2.${c.reset} ${c.yellow}bun run setup${c.reset}               ${c.dim}Initialize submodules & install all dependencies${c.reset}
  ${c.green}3.${c.reset} ${c.yellow}bun test ./tests${c.reset}            ${c.dim}Verify governance & delivery test suite${c.reset}

${c.bold}Command Hierarchy:${c.reset}
  ${c.magenta}┌── 🚀 Publishing & Delivery${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}publish${c.reset}                       ${c.dim}Interactive delivery wizard (product, channel, bump)${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}publish <target> <chan>${c.reset}       ${c.dim}Single-pass pipeline (e.g. publish package release --force)${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}publish:reconcile${c.reset}             ${c.dim}Reconcile staged npm packages on demand${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}publish:status${c.reset}                ${c.dim}Inspect current active delivery status${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}publish:check:all${c.reset}             ${c.dim}Verify published checksums across all channels${c.reset}
  ${c.magenta}│${c.reset}
  ${c.magenta}├── 🛠  Build & Test${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}build [product] [chan]${c.reset}        ${c.dim}Build components in dependency order${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}test${c.reset}                          ${c.dim}Run governance, unit, and integration tests${c.reset}
  ${c.magenta}│${c.reset}
  ${c.magenta}├── ⚙️  Setup & Onboarding${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}init${c.reset}                          ${c.dim}Interactive setup (.env credentials, PAT, targets)${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}setup [target]${c.reset}                ${c.dim}Install dependencies non-destructively (--no-save)${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}setup:root${c.reset}                    ${c.dim}Install root workspace dependencies only${c.reset}
  ${c.magenta}│${c.reset}
  ${c.magenta}├── 🩹 Failure Recovery${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}recovery${c.reset}                      ${c.dim}Interactive diagnosis and remediation console${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}recovery:patch <create|merge>${c.reset} ${c.dim}Manage isolated release/patch/* branches${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}recovery:rerun <runId>${c.reset}        ${c.dim}Rerun failed CI jobs${c.reset}
  ${c.magenta}│${c.reset}   ${c.yellow}recovery:revert-tag <tag>${c.reset}     ${c.dim}Safely delete/revert premature delivery tag${c.reset}
  ${c.magenta}│${c.reset}
  ${c.magenta}└── 🔄 Versioning & Synchronization${c.reset}
      ${c.yellow}sync:check${c.reset}                    ${c.dim}Check git ahead/behind & version config parity${c.reset}
      ${c.yellow}sync:deps${c.reset}                     ${c.dim}Synchronize internal network dependencies${c.reset}
      ${c.yellow}versions:sync:release${c.reset}         ${c.dim}Align local config.versions.json with remote${c.reset}

${c.bold}Products & Subprojects:${c.reset}
  ${c.cyan}package${c.reset}         VRC Packages SDK (vrc-packages-api on npm)           ${c.dim}src-package${c.reset}
  ${c.cyan}crawler${c.reset}         Crawler Node (GHCR image & Windows binary)           ${c.dim}src-crawler${c.reset}
  ${c.cyan}crawler-client${c.reset}  Crawler Desktop Shell (Windows NSIS & WiX MSI)       ${c.dim}src-crawler-client${c.reset}
  ${c.cyan}worker${c.reset}          Coordinator API Services (Cloudflare Worker)         ${c.dim}src-worker${c.reset}
  ${c.cyan}network${c.reset}         Internal Shared Package (vrc-packages-network)       ${c.dim}src-worker/packages/network${c.reset}
  ${c.cyan}web${c.reset}             Web Portal Starter                                   ${c.dim}src-web${c.reset}
  ${c.cyan}web-search${c.reset}      Web Search Submodule (vrc-packages-search)           ${c.dim}src-web-search${c.reset}

${c.dim}Topic Details: run 'bun run help <topic>' (e.g. publish, build, setup, recovery, sync)${c.reset}
`.trim());
}

const args = process.argv.slice(2);
const topic = args[0]?.toLowerCase().replace(/^--?/, "");

if (topic && topic !== "help") {
  if (!renderTopic(topic)) {
    console.error(`\n${c.red}Unknown help topic: "${topic}".${c.reset}`);
    console.log(`Available topics: ${Object.keys(TOPICS).filter(k => k !== "delivery").join(", ")}\n`);
    renderOverview();
    process.exitCode = 1;
  }
} else {
  renderOverview();
}