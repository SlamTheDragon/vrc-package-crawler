import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { productDirectories } from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

function loadRootEnv(workspace = root) {
  const envFile = resolve(workspace, ".env");
  if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(envFile); } catch {}
  } else if (typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(); } catch {}
  }
}

loadRootEnv(root);

export const buildTargets = {
  package: {
    dir: "src-package",
    script: "build"
  },
  worker: {
    dir: "src-worker",
    scriptFor: channel => (channel === "release" ? "build:release" : "build:preview")
  },
  crawler: {
    dir: "src-crawler",
    scriptFor: _channel => (process.platform === "win32" ? "build:dev" : "build:node:linux")
  },
  "crawler-client": {
    dir: "src-crawler-client",
    script: "build:dev"
  },
  network: {
    dir: "src-worker/packages/network",
    script: "build"
  },
  web: {
    dir: "src-web",
    script: "build"
  },
  "web-search": {
    dir: "src-web-search",
    script: "build"
  }
};

// Dependency order for building all products
export const buildOrder = ["network", "package", "worker", "crawler", "crawler-client", "web", "web-search"];

export function resolveBuildScript(product, channel = "preview") {
  const target = buildTargets[product];
  if (!target) {
    throw new Error(`Unknown build target: "${product}". Valid targets: all, ${Object.keys(buildTargets).join(", ")}`);
  }
  if (typeof target.scriptFor === "function") {
    return target.scriptFor(channel);
  }
  return target.script || "build";
}

export async function buildProduct(product, channel = "preview", options = {}) {
  const {
    workspace = root,
    exec = execFileSync,
    quiet = false,
    env = {}
  } = options;

  const target = buildTargets[product];
  if (!target) {
    throw new Error(`Unknown build target: "${product}". Valid targets: all, ${Object.keys(buildTargets).join(", ")}`);
  }

  const projectDir = resolve(workspace, target.dir);
  const manifestPath = join(projectDir, "package.json");

  if (!existsSync(manifestPath)) {
    if (!quiet) console.warn(`Skipping build for ${product}: package.json not found at ${projectDir}`);
    return { product, channel, status: "skipped-missing-package", directory: projectDir };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let scriptName = resolveBuildScript(product, channel);

  // Fallback to "build" if specialized script not defined in manifest
  if (!manifest.scripts?.[scriptName] && manifest.scripts?.build) {
    scriptName = "build";
  }

  if (!manifest.scripts?.[scriptName]) {
    throw new Error(`Package ${product} at ${projectDir} has no "${scriptName}" script defined.`);
  }

  if (!quiet) {
    console.log(`Building ${product} (${channel}) in ${target.dir} via "bun run ${scriptName}"...`);
  }

  const mergedEnv = {
    ...process.env,
    VRCP_PRODUCT: product,
    VRCP_CHANNEL: channel,
    VRCP_ROOT_DIR: workspace,
    ...env
  };

  exec("bun", ["run", scriptName], {
    cwd: projectDir,
    stdio: quiet ? "ignore" : "inherit",
    encoding: "utf8",
    env: mergedEnv
  });

  return {
    product,
    channel,
    directory: projectDir,
    script: scriptName,
    status: "build-success"
  };
}

export async function build(product = "all", channel = "preview", options = {}) {
  const { quiet = false } = options;
  const channelNorm = (channel || "preview").toLowerCase();
  if (!["preview", "release"].includes(channelNorm)) {
    throw new Error(`Invalid build channel: "${channel}". Must be "preview" or "release".`);
  }

  if (product === "all") {
    if (!quiet) {
      console.log(`=================================================`);
      console.log(`VRCP Monorepo Unified Build: all products (${channelNorm})`);
      console.log(`=================================================`);
    }
    const results = [];
    for (const prod of buildOrder) {
      const res = await buildProduct(prod, channelNorm, options);
      results.push(res);
    }
    if (!quiet) {
      console.log(`✓ All products built successfully for channel: ${channelNorm}`);
    }
    return results;
  }

  return buildProduct(product, channelNorm, options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let product = "all";
  let channel = "preview";

  for (const arg of args) {
    const argLower = arg.toLowerCase();
    if (["preview", "release"].includes(argLower)) {
      channel = argLower;
    } else if (Object.keys(buildTargets).includes(argLower) || argLower === "all") {
      product = argLower;
    }
  }

  try {
    await build(product, channel);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
