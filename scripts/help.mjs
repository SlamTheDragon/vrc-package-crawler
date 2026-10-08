import { defineCommand, runMain } from "citty";
import { fileURLToPath, pathToFileURL } from "node:url";

const isColorSupported = !process.env.NO_COLOR && (process.stdout?.isTTY || process.env.FORCE_COLOR);
export const style = {
  reset: isColorSupported ? "\x1b[0m" : "",
  bold: isColorSupported ? "\x1b[1m" : "",
  dim: isColorSupported ? "\x1b[2m" : "",
  cyan: isColorSupported ? "\x1b[36m" : "",
  blue: isColorSupported ? "\x1b[34m" : "",
  green: isColorSupported ? "\x1b[32m" : "",
  yellow: isColorSupported ? "\x1b[33m" : "",
  red: isColorSupported ? "\x1b[31m" : "",
  magenta: isColorSupported ? "\x1b[35m" : ""
};

export const symbols = {
  diamond: "◆",
  pointer: "❯",
  check: "✔",
  cross: "✖",
  warn: "⚠",
  info: "ℹ"
};

export const categories = {
  setup: {
    title: "1. Setup & Onboarding",
    description: "Install dependencies and configure developer environment tokens.",
    commands: [
      { cmd: "bun run setup", desc: "Installs root dependencies and runs interactive onboarding wizard" },
      { cmd: "bun run setup:root", desc: "Installs only root tooling dependencies" },
      { cmd: "bun run setup:interactive", desc: "Runs interactive onboarding prompt for tokens and targets" },
      { cmd: "bun run onboard", desc: "Alias for setup:interactive" },
      { cmd: "bun run init", desc: "Alias for setup:interactive" }
    ]
  },
  build: {
    title: "2. Unified Monorepo Build",
    description: "Build products across the monorepo in dependency order.",
    commands: [
      { cmd: "bun run build", desc: "Builds all 7 products in dependency order for preview channel" },
      { cmd: "bun run build <product>", desc: "Builds specific product (package, crawler, worker, etc.)" },
      { cmd: "bun run build <product> release", desc: "Builds specific product using release configuration" }
    ]
  },
  test: {
    title: "3. Testing & Governance",
    description: "Run automated test suites and check dependency download cache keys.",
    commands: [
      { cmd: "bun run test", desc: "Runs all root monorepo governance and publishing test suites" },
      { cmd: "bun test ./tests", desc: "Runs test files located in ./tests" },
      { cmd: "bun run cache:check", desc: "Calculates Bun dependency cache key for CI" }
    ]
  },
  publish: {
    title: "4. Publication & Release",
    description: "Publish preview or release artifacts with automated version bumping.",
    commands: [
      { cmd: "bun run publish", desc: "Interactive prompt for target, channel, bump, and execution" },
      { cmd: "bun run publish:preview <product>", desc: "Plans preview CalVer patch bump on current branch" },
      { cmd: "bun run publish:preview <product> --execute", desc: "Executes preview commit, tag, and push to origin" },
      { cmd: "bun run publish:release <product>", desc: "Plans release SemVer bump from clean main" },
      { cmd: "bun run publish:release <product> --execute", desc: "Creates release version PR branch on origin" },
      { cmd: "bun run publish:finalize <product> <pr> <sha> --execute", desc: "Tags merged release commit on main" },
      { cmd: "bun run publish:status <tag>", desc: "Reads status of tagged GitHub Actions CI run" },
      { cmd: "bun run publish:check <tag>", desc: "Verifies release assets, npm package, or registry" },
      { cmd: "bun run publish:check:all", desc: "Verifies publication proof across all configured versions" },
      { cmd: "bun run publish:diagnose <tag>", desc: "Diagnoses CI status and gives actionable next steps" },
      { cmd: "bun run publish:diagnose:all", desc: "Diagnoses CI status across all products" },
      { cmd: "bun run publish:reconcile", desc: "Reconciles and links orphaned GitHub release drafts" },
      { cmd: "bun run publish:retry <tag>", desc: "Retries a failed git tag push" }
    ]
  },
  recovery: {
    title: "5. Failure Diagnosis & Recovery",
    description: "Diagnose pipeline failures, rerun transient CI, or manage patch branches.",
    commands: [
      { cmd: "bun run recovery", desc: "Interactive recovery tool prompting for tag and failure options" },
      { cmd: "bun run recovery:rerun <runId>", desc: "Reruns failed jobs on the frozen tagged commit" },
      { cmd: "bun run recovery:revert-tag <tag> [--remote]", desc: "Deletes unverified tag locally and on remote origin" },
      { cmd: "bun run recovery:patch <product> <version>", desc: "Creates temporary patch branch (release/patch/...)" },
      { cmd: "bun run publish:recover <tag>", desc: "Inspects recovery plan for fixed versions" },
      { cmd: "bun run publish:authorize-recovery <tag>", desc: "Authorizes failed tag recovery manifest entry" }
    ]
  },
  sync: {
    title: "6. Version & Dependency Synchronization",
    description: "Validate branch parity, detect version drift, and sync internal packages.",
    commands: [
      { cmd: "bun run sync:check", desc: "Checks if current branch is behind remote and reports config drift" },
      { cmd: "bun run sync:deps", desc: "Synchronizes vrc-packages-network version across worker and crawler" },
      { cmd: "bun run versions:check:release", desc: "Checks release version configuration against tags" },
      { cmd: "bun run versions:check:preview", desc: "Checks preview version configuration against tags" },
      { cmd: "bun run versions:sync:release", desc: "Syncs release version configuration from git tags" },
      { cmd: "bun run versions:sync:preview", desc: "Syncs preview version configuration from git tags" }
    ]
  },
  clean: {
    title: "7. Workspace Maintenance & Cleanup",
    description: "Remove build outputs, generated tarballs, and reset node_modules.",
    commands: [
      { cmd: "bun run clean", desc: "Removes build artifacts for current product directory" },
      { cmd: "bun run clean:all", desc: "Removes build artifacts across all monorepo products" },
      { cmd: "bun run reset", desc: "Removes node_modules in current directory" },
      { cmd: "bun run reset:all", desc: "Removes node_modules across entire monorepo" }
    ]
  },
  infra: {
    title: "8. Infrastructure & CI Utilities",
    description: "Worker preview initialization and release announcement webhooks.",
    commands: [
      { cmd: "bun run worker:preview:init", desc: "Initializes Cloudflare Worker preview D1 database" },
      { cmd: "bun run release:announce", desc: "Emits Discord release announcement for published tag" }
    ]
  }
};

export const manualProcedures = [
  {
    name: "1. GitHub Protected Environment Deployment Approvals",
    need: "When publishing a release for vrc-packages-api (npm), crawler-node (Docker), or worker (Cloudflare).",
    why: "GitHub Actions security policy blocks automated approval of production secrets.",
    steps: [
      "Open the GitHub repository Actions tab: https://github.com/SlamTheDragon/vrc-packages/actions",
      "Click the active workflow run for the release tag.",
      "Click 'Review deployments' on the amber pending stage.",
      "Select the environment (e.g. npm-release, vrcp-crawler-release) and click 'Approve and deploy'."
    ]
  },
  {
    name: "2. Release Pull Request Review and Merge",
    need: "When publishing on the release channel after running bun run publish:release <product> --execute.",
    why: "Release tags require an owner-merged PR into main. Preview does not require a PR.",
    steps: [
      "Open the pull request URL returned in the terminal.",
      "Review the automated version config and changelog changes.",
      "Merge the pull request into main (Squash and merge or Merge commit).",
      "Switch your local repository back to main and run: git pull origin main.",
      "Run the finalizer command: bun run publish:finalize <product> <pr-number> <merged-sha> --execute."
    ]
  },
  {
    name: "3. Discord Webhook CI Secrets Setup",
    need: "For staging alerts and public release announcements.",
    why: "Webhooks must not exist in local developer .env files. They belong strictly in GitHub Actions secrets.",
    steps: [
      "Go to GitHub Settings -> Secrets and variables -> Actions.",
      "Ensure DISCORD_RELEASE_WEBHOOK is set in Repository Secrets.",
      "Ensure DISCORD_STAGING_WEBHOOK is set in Environment Secrets for protected staging environments.",
      "Optional: set DISCORD_STAGING_PING in Repository Variables with role or user ID to notify."
    ]
  },
  {
    name: "4. Emergency Remote Tag Deletion",
    need: "If an invalid or corrupted version tag was pushed to origin.",
    why: "GitHub repository rules protect tags from direct modification. Deletion requires admin authority.",
    steps: [
      "Delete the local tag: git tag -d <tag-name>",
      "Delete the remote tag: git push origin :refs/tags/<tag-name>",
      "If GitHub rules block the deletion, use GitHub Web UI under Code -> Tags to remove it manually."
    ]
  }
];

export function renderHelpOverview() {
  console.log(`
${style.bold}${style.cyan}=================================================${style.reset}
${style.bold}${style.cyan}VRCP Monorepo CLI Reference & Command Guide${style.reset}
${style.bold}${style.cyan}=================================================${style.reset}

${style.bold}Core Principles & Branch Layout:${style.reset}
  ${symbols.diamond} ${style.bold}Slices & Gates:${style.reset} Slices mean local commit. Completed gates mean push.
  ${symbols.diamond} ${style.bold}Preview Channel:${style.reset} Fast iteration. Any branch ahead of origin can publish.
  ${symbols.diamond} ${style.bold}Release Channel:${style.reset} Strict governance. Requires clean main and owner-merged PR.
  ${symbols.diamond} ${style.bold}Repository Branches:${style.reset}
      • ${style.green}main${style.reset} (production / release)
      • ${style.green}preview/crawler-network${style.reset} (src-worker, src-crawler, src-worker/packages/network)
      • ${style.green}preview/desktop-client${style.reset} (src-crawler-client)
      • ${style.green}preview/web${style.reset} (src-web, src-web-search)
      • ${style.green}preview/workers-api${style.reset} (src-package)
      • ${style.green}release/patch/*${style.reset} (short-lived patch branches)
      • ${style.green}release/candidate/*${style.reset} (short-lived candidate PRs on main)
  ${symbols.diamond} ${style.bold}Interactive Defaults:${style.reset} Running scripts with no arguments starts interactive wizard.
  ${symbols.diamond} ${style.bold}Sub-command Help:${style.reset} Pass ${style.yellow}--help${style.reset} to any command (e.g., bun run publish --help).

${style.bold}Command Categories:${style.reset}
`);

  for (const [key, cat] of Object.entries(categories)) {
    console.log(`  ${style.cyan}${cat.title}${style.reset} (${style.dim}${key}${style.reset})`);
    console.log(`  ${style.dim}${cat.description}${style.reset}`);
    for (const item of cat.commands) {
      console.log(`    ${style.green}${item.cmd.padEnd(38)}${style.reset} ${item.desc}`);
    }
    console.log();
  }

  console.log(`${style.bold}Additional Reference:${style.reset}`);
  console.log(`  ${style.yellow}bun run help manual${style.reset}            View unhandled procedures requiring GitHub Web UI`);
  console.log(`  ${style.yellow}bun run help <category>${style.reset}        Filter help by category (setup, build, publish, recovery, etc.)`);
  console.log();
}

export function renderCategoryHelp(catKey) {
  const cat = categories[catKey];
  if (!cat) {
    console.error(`${style.red}${symbols.cross} Unknown category: "${catKey}".${style.reset}`);
    console.log(`Valid categories: ${Object.keys(categories).join(", ")}, manual`);
    process.exit(1);
  }

  console.log(`
${style.bold}${style.cyan}=================================================${style.reset}
${style.bold}${style.cyan}${cat.title}${style.reset}
${style.bold}${style.cyan}=================================================${style.reset}
${cat.description}

${style.bold}Commands:${style.reset}
`);
  for (const item of cat.commands) {
    console.log(`  ${style.green}${item.cmd.padEnd(38)}${style.reset} ${item.desc}`);
  }
  console.log();
}

export function renderManualProcedures() {
  console.log(`
${style.bold}${style.yellow}=================================================${style.reset}
${style.bold}${style.yellow}Unhandled & Manual Procedures (Web UI / Operator)${style.reset}
${style.bold}${style.yellow}=================================================${style.reset}

These procedures cannot be automated by local CLI scripts and require human operator actions:
`);

  for (const proc of manualProcedures) {
    console.log(`${style.bold}${style.cyan}${proc.name}${style.reset}`);
    console.log(`  ${style.bold}When Needed:${style.reset} ${proc.need}`);
    console.log(`  ${style.bold}Rationale:${style.reset}   ${proc.why}`);
    console.log(`  ${style.bold}Action Steps:${style.reset}`);
    for (const step of proc.steps) {
      console.log(`    ${symbols.pointer} ${step}`);
    }
    console.log();
  }
}

export const main = defineCommand({
  meta: {
    name: "help",
    description: "Top-level command reference and manual procedures guide for VRCP Monorepo"
  },
  args: {
    category: {
      type: "positional",
      description: "Category to inspect: setup, build, test, publish, recovery, sync, clean, infra, manual, all",
      required: false,
      default: "all"
    },
    manual: {
      type: "boolean",
      description: "Show manual procedures requiring GitHub Web UI or operator intervention",
      required: false,
      default: false
    }
  },
  async run({ args }) {
    if (args.manual || args.category === "manual") {
      renderManualProcedures();
      return;
    }
    const cat = (args.category || "all").toLowerCase();
    if (cat === "all") {
      renderHelpOverview();
    } else {
      renderCategoryHelp(cat);
    }
  }
});

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMain(main);
}