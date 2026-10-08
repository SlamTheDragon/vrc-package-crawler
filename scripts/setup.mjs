import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productDirectories } from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

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

export async function interactiveSetup(options = {}) {
  const {
    workspace = root,
    env = process.env,
    askFn,
    onProgress = console.log,
    fetchFn = fetch,
    exec = execFileSync
  } = options;

  let rl;
  const ask = askFn || (async query => {
    if (!rl) {
      const readline = await import("node:readline/promises");
      rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }
    return (await rl.question(query)).trim();
  });

  try {
    onProgress("=================================================");
    onProgress("VRCP Monorepo Setup & Onboarding Wizard");
    onProgress("=================================================");

    const envPath = resolve(workspace, ".env");
    let envEntries = {};
    if (existsSync(envPath)) {
      envEntries = parseEnvFile(readFileSync(envPath, "utf8"));
    }

    // 1. Inspect and configure GITHUB_TOKEN
    let ghToken = envEntries.GITHUB_TOKEN || envEntries.GH_TOKEN || (workspace === root ? (env.GH_TOKEN || env.GITHUB_TOKEN) : undefined);
    if (ghToken) {
      onProgress("Verifying existing GitHub Personal Access Token...");
      const check = await validateGitHubToken(ghToken, fetchFn);
      if (check.valid) {
        onProgress(`✓ Authenticated as GitHub user: @${check.login}`);
      } else {
        onProgress(`⚠ Existing GitHub token is invalid (${check.error}).`);
        ghToken = "";
      }
    }

    if (!ghToken) {
      onProgress("\nA GitHub Personal Access Token (PAT) with repo and workflow permissions");
      onProgress("is required to authenticate release pipelines and API queries.");
      const inputToken = await ask("Enter your GitHub Token (or press Enter to skip): ");
      if (inputToken) {
        const check = await validateGitHubToken(inputToken, fetchFn);
        if (check.valid) {
          onProgress(`✓ Verified! Authenticated as: @${check.login}`);
          writeEnvEntry(envPath, "GITHUB_TOKEN", inputToken);
          ghToken = inputToken;
        } else {
          onProgress(`⚠ Token verification failed (${check.error}). Saving anyway...`);
          writeEnvEntry(envPath, "GITHUB_TOKEN", inputToken);
          ghToken = inputToken;
        }
      } else {
        onProgress("Skipped GitHub token configuration.");
      }
    }

    // 2. Inspect optional Cloudflare token
    const cfExisting = envEntries.CLOUDFLARE_API_TOKEN || (workspace === root ? env.CLOUDFLARE_API_TOKEN : undefined);
    if (!cfExisting) {
      const cfToken = await ask("Enter CLOUDFLARE_API_TOKEN (optional, press Enter to skip): ");
      if (cfToken) {
        writeEnvEntry(envPath, "CLOUDFLARE_API_TOKEN", cfToken);
        onProgress("✓ Cloudflare API token saved to .env");
      }
    }

    // 3. Project Selection
    onProgress("\nAvailable target projects:");
    const projectKeys = Object.keys(setupProjects);
    onProgress(`  - all (installs root and all 7 subprojects: ${projectKeys.join(", ")})`);
    projectKeys.forEach(p => onProgress(`  - ${p}`));

    const targetChoice = (await ask("\nSelect target project to set up [all]: ")) || "all";
    const selectedTarget = projectKeys.includes(targetChoice) || targetChoice === "all" ? targetChoice : "all";

    onProgress(`\nStarting dependency installation for target: "${selectedTarget}"...`);
    await setup(selectedTarget, { workspace, quiet: false, exec });

    onProgress("\n=================================================");
    onProgress("✓ Setup and onboarding complete!");
    onProgress("Run `bun run help` for common commands and operational workflows.");
    onProgress("=================================================");
    return { status: "setup-complete", target: selectedTarget, ghTokenConfigured: Boolean(ghToken) };
  } finally {
    if (rl) rl.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const isInteractive = args.includes("--interactive") || args.includes("-i") || args[0] === "interactive" || args[0] === "onboard" || args.length === 0;
  try {
    if (isInteractive) {
      await interactiveSetup();
    } else {
      const target = (args.length > 1 && args[0] === "all") ? args[1] : (args[0] || "all");
      await setup(target);
      console.log("All dependency installations complete.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
