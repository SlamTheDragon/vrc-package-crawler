import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productDirectories } from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

const useColor = !process.env.NO_COLOR && (process.stdout.isTTY ?? true);
const c = {
  reset: useColor ? "\x1b[0m" : "",
  bold: useColor ? "\x1b[1m" : "",
  dim: useColor ? "\x1b[2m" : "",
  cyan: useColor ? "\x1b[36m" : "",
  green: useColor ? "\x1b[32m" : "",
  yellow: useColor ? "\x1b[33m" : "",
  red: useColor ? "\x1b[31m" : "",
  magenta: useColor ? "\x1b[35m" : ""
};

export const setupProjects = {
  root: ".",
  ...productDirectories,
  "web-search": "src-web-search"
};

export function parseEnvFile(content) {
  const result = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

export function writeEnvEntry(envPath, key, value) {
  let content = "";
  if (existsSync(envPath)) {
    content = readFileSync(envPath, "utf8");
  }
  const lines = content ? content.split("\n") : [];
  let found = false;
  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    newLines.push(`${key}=${value}`);
  }
  writeFileSync(envPath, newLines.join("\n") + "\n", "utf8");
}

export async function validateGitHubToken(token, fetchFn = fetch) {
  if (!token) return { valid: false, error: "No token provided" };
  try {
    const response = await fetchFn("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${token}`,
        "user-agent": "VRCPSetup",
        accept: "application/vnd.github+json"
      }
    });
    if (response.ok) {
      const data = await response.json();
      return { valid: true, login: data.login };
    }
    return { valid: false, error: `HTTP ${response.status}` };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function setup(target = "all", options = {}) {
  const { workspace = root, quiet = false, exec = execFileSync } = options;
  const projectKeys = Object.keys(setupProjects);
  const targets = target === "all" ? projectKeys : [target];

  for (const name of targets) {
    if (!setupProjects[name]) {
      throw new Error(`Unknown project: "${name}". Valid targets: all, ${projectKeys.join(", ")}`);
    }
    const projectDir = resolve(workspace, setupProjects[name]);
    let manifestPath = resolve(projectDir, "package.json");

    if (!existsSync(manifestPath) && name === "web-search") {
      if (!quiet) console.log(`Initializing git submodule for ${name}...`);
      try {
        exec("git", ["submodule", "update", "--init", "--recursive"], {
          cwd: workspace,
          stdio: quiet ? "ignore" : "inherit",
          encoding: "utf8"
        });
      } catch (submoduleErr) {
        if (!quiet) console.warn(`Warning: failed to initialize submodule: ${submoduleErr instanceof Error ? submoduleErr.message : String(submoduleErr)}`);
      }
    }

    if (!existsSync(manifestPath)) {
      if (!quiet) console.log(`Skipping ${name}: no package.json found at ${projectDir}`);
      continue;
    }
    if (!quiet) console.log(`Installing dependencies for ${name} (${setupProjects[name]})...`);
    exec("bun", ["install", "--no-save", "--ignore-scripts"], {
      cwd: projectDir,
      stdio: quiet ? "ignore" : "inherit",
      encoding: "utf8"
    });
  }
}

import * as p from "@clack/prompts";
import { defineCommand, runMain } from "citty";

export async function interactiveSetup(options = {}) {
  const {
    workspace = root,
    env = process.env,
    askFn,
    onProgress = console.log,
    fetchFn = fetch,
    exec = execFileSync
  } = options;

  const isInteractiveTTY = !askFn && Boolean(process.stdin.isTTY) && !process.env.CI;

  let rl;
  const ask = askFn || (async query => {
    if (process.env.CI || !process.stdin.isTTY) return "";
    if (!rl) {
      const readline = await import("node:readline/promises");
      rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }
    return (await rl.question(query)).trim();
  });

  try {
    if (isInteractiveTTY) {
      p.intro(`${c.bold}${c.cyan}VRCP Monorepo Setup & Onboarding Wizard${c.reset}`);
    } else {
      onProgress(`\n${c.bold}${c.cyan}◆ VRCP Monorepo Setup & Onboarding Wizard${c.reset}`);
      onProgress(`${c.dim}  Automated credential onboarding and dependency bootstrap${c.reset}\n`);
    }

    const envPath = resolve(workspace, ".env");
    let envEntries = {};
    if (existsSync(envPath)) {
      envEntries = parseEnvFile(readFileSync(envPath, "utf8"));
    }

    // 1. Inspect and configure GITHUB_TOKEN
    let ghToken = envEntries.GITHUB_TOKEN || envEntries.GH_TOKEN || (workspace === root ? (env.GH_TOKEN || env.GITHUB_TOKEN) : undefined);
    if (!isInteractiveTTY) {
      onProgress(`${c.bold}┌── 🔑 GitHub Personal Access Token (PAT)${c.reset}`);
    }

    if (ghToken) {
      if (isInteractiveTTY) {
        const s = p.spinner();
        s.start("Verifying existing GitHub Personal Access Token...");
        const check = await validateGitHubToken(ghToken, fetchFn);
        if (check.valid) {
          s.stop(`Authenticated as GitHub user: @${check.login}`);
        } else {
          s.stop(`Existing GitHub token is invalid (${check.error})`);
          ghToken = "";
        }
      } else {
        onProgress(`│  Verifying existing GitHub Personal Access Token...`);
        const check = await validateGitHubToken(ghToken, fetchFn);
        if (check.valid) {
          onProgress(`│  ${c.green}✓ Authenticated as GitHub user: @${check.login}${c.reset}`);
        } else {
          onProgress(`│  ${c.yellow}⚠ Existing GitHub token is invalid (${check.error}).${c.reset}`);
          ghToken = "";
        }
      }
    }

    if (!ghToken) {
      if (isInteractiveTTY) {
        const inputToken = await p.password({
          message: "Enter your GitHub Personal Access Token (PAT) (leave empty to skip):",
          mask: "•"
        });
        if (p.isCancel(inputToken)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }
        if (inputToken && typeof inputToken === "string" && inputToken.trim()) {
          const trimmed = inputToken.trim();
          const s = p.spinner();
          s.start("Verifying GitHub token...");
          const check = await validateGitHubToken(trimmed, fetchFn);
          if (check.valid) {
            s.stop(`Verified! Authenticated as: @${check.login}`);
            writeEnvEntry(envPath, "GITHUB_TOKEN", trimmed);
            ghToken = trimmed;
          } else {
            s.stop(`Token verification returned: ${check.error}. Saving to .env anyway...`);
            writeEnvEntry(envPath, "GITHUB_TOKEN", trimmed);
            ghToken = trimmed;
          }
        } else {
          p.note("Skipped GitHub token configuration.", "GitHub PAT");
        }
      } else {
        onProgress(`│  ${c.dim}A GitHub Personal Access Token (PAT) with repo and workflow permissions is required.${c.reset}`);
        const inputToken = await ask("│  Enter your GitHub Token (or press Enter to skip): ");
        if (inputToken) {
          const check = await validateGitHubToken(inputToken, fetchFn);
          if (check.valid) {
            onProgress(`│  ${c.green}✓ Verified! Authenticated as: @${check.login}${c.reset}`);
            writeEnvEntry(envPath, "GITHUB_TOKEN", inputToken);
            ghToken = inputToken;
          } else {
            onProgress(`│  ${c.yellow}⚠ Token verification failed (${check.error}). Saving anyway...${c.reset}`);
            writeEnvEntry(envPath, "GITHUB_TOKEN", inputToken);
            ghToken = inputToken;
          }
        } else {
          onProgress(`│  ${c.dim}Skipped GitHub token configuration.${c.reset}`);
        }
      }
    }

    // 2. Inspect optional Cloudflare token
    const cfExisting = envEntries.CLOUDFLARE_API_TOKEN || (workspace === root ? env.CLOUDFLARE_API_TOKEN : undefined);
    if (!cfExisting) {
      if (isInteractiveTTY) {
        const cfToken = await p.password({
          message: "Enter CLOUDFLARE_API_TOKEN (optional, press Enter to skip):",
          mask: "•"
        });
        if (p.isCancel(cfToken)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }
        if (cfToken && typeof cfToken === "string" && cfToken.trim()) {
          writeEnvEntry(envPath, "CLOUDFLARE_API_TOKEN", cfToken.trim());
          p.note("Cloudflare API token saved to .env", "Cloudflare Token");
        }
      } else {
        onProgress(`\n${c.bold}├── ☁️  Cloudflare API Token (Optional)${c.reset}`);
        const cfToken = await ask("│  Enter CLOUDFLARE_API_TOKEN (optional, press Enter to skip): ");
        if (cfToken) {
          writeEnvEntry(envPath, "CLOUDFLARE_API_TOKEN", cfToken);
          onProgress(`│  ${c.green}✓ Cloudflare API token saved to .env${c.reset}`);
        } else {
          onProgress(`│  ${c.dim}Skipped Cloudflare token configuration.${c.reset}`);
        }
      }
    } else {
      if (isInteractiveTTY) {
        p.note("Cloudflare API token already configured in .env", "Cloudflare Token");
      } else {
        onProgress(`\n${c.bold}├── ☁️  Cloudflare API Token (Optional)${c.reset}`);
        onProgress(`│  ${c.green}✓ Cloudflare API token already configured.${c.reset}`);
      }
    }

    // 3. Project Selection
    const projectKeys = Object.keys(setupProjects);
    let selectedTarget = "all";

    if (isInteractiveTTY) {
      const targetChoice = await p.select({
        message: "Select target project to install dependencies for:",
        options: [
          { value: "all", label: "all (Entire Monorepo)", hint: "Install all subprojects in one go" },
          ...projectKeys.map(k => ({
            value: k,
            label: k,
            hint: setupProjects[k]
          }))
        ],
        initialValue: "all"
      });
      if (p.isCancel(targetChoice)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }
      selectedTarget = targetChoice;
    } else {
      onProgress(`\n${c.bold}└── 📦 Project Target Selection${c.reset}`);
      onProgress(`   ${c.dim}Available targets: all, ${projectKeys.join(", ")}${c.reset}`);

      const targetChoice = (await ask("\nSelect target project to set up [all]: ")) || "all";
      selectedTarget = projectKeys.includes(targetChoice) || targetChoice === "all" ? targetChoice : "all";
    }

    if (isInteractiveTTY) {
      const s = p.spinner();
      const targets = selectedTarget === "all" ? Object.keys(setupProjects) : [selectedTarget];
      for (let i = 0; i < targets.length; i++) {
        const name = targets[i];
        const dir = setupProjects[name];
        s.start(`[${i + 1}/${targets.length}] Installing dependencies for ${name} (${dir})...`);
        await setup(name, { workspace, quiet: true, exec });
        s.stop(`[${i + 1}/${targets.length}] Installed dependencies for ${name} (${dir})`);
      }
      p.outro(`${c.green}${c.bold}Setup and onboarding complete!${c.reset}`);
    } else {
      onProgress(`\n${c.cyan}◆${c.reset} Starting dependency installation for target: "${c.bold}${selectedTarget}${c.reset}"...`);
      await setup(selectedTarget, { workspace, quiet: false, exec });
      onProgress(`\n${c.green}${c.bold}✓ Setup and onboarding complete!${c.reset}`);
      onProgress(`${c.dim}Run 'bun run help' for common commands and operational workflows.${c.reset}\n`);
    }

    return { status: "setup-complete", target: selectedTarget, ghTokenConfigured: Boolean(ghToken) };
  } finally {
    if (rl) rl.close();
  }
}

export const main = defineCommand({
  meta: {
    name: "setup",
    description: "Install monorepo dependencies and configure developer environment"
  },
  args: {
    target: {
      type: "positional",
      description: "Project target to set up (all, root, package, crawler, crawler-client, worker, network, web, web-search)",
      required: false,
      default: "all"
    },
    interactive: {
      type: "boolean",
      alias: "i",
      description: "Run interactive credential onboarding wizard (.env and PAT verification)",
      default: false
    }
  },
  async run({ args }) {
    const isInteractive = args.interactive || args.target === "interactive" || args.target === "onboard";
    try {
      if (isInteractive) {
        await interactiveSetup();
      } else {
        await setup(args.target || "all");
        console.log("All dependency installations complete.");
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runMain(main);
}
