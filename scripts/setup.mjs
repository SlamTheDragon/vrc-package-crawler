#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { productDirectories } from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

export const setupProjects = {
  root: ".",
  ...productDirectories
};

export async function setup(target = "all", options = {}) {
  const { workspace = root, quiet = false, exec = execFileSync } = options;
  const projectKeys = Object.keys(setupProjects);
  const targets = target === "all" ? projectKeys : [target];

  for (const name of targets) {
    if (!setupProjects[name]) {
      throw new Error(`Unknown project: "${name}". Valid targets: all, ${projectKeys.join(", ")}`);
    }
    const projectDir = resolve(workspace, setupProjects[name]);
    const manifestPath = resolve(projectDir, "package.json");
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

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const target = process.argv[2] || "all";
  try {
    await setup(target);
    console.log("All dependency installations complete.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
