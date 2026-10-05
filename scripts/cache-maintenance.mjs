import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = "SlamTheDragon/vrc-packages";
const projects = { root: ".", package: "src-package", network: "src-worker/packages/network",
  crawler: "src-crawler", "crawler-client": "src-crawler-client", worker: "src-worker" };
const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];

/** Cache public downloads only. Distributed project contracts still pass normal delivery checks. */
export function cacheInputs(project, workspace = root) {
  if (!Object.hasOwn(projects, project)) throw new Error("Unknown dependency cache project");
  const manifests = [...new Set([".", projects[project]])].map(directory => {
    const source = JSON.parse(readFileSync(join(workspace, directory, "package.json"), "utf8"));
    if (source.packageManager !== "bun@1.4.2") throw new Error("Cache toolchain must match the supported Bun pin");
    const manifest = { private: true, packageManager: source.packageManager };
    for (const field of dependencyFields) {
      if (source[field] !== undefined && (!source[field] || typeof source[field] !== "object" || Array.isArray(source[field]))) {
        throw new Error("Cache dependency fields must be objects");
      }
      const entries = Object.entries(source[field] ?? {}).filter(([name]) =>
        !["vrc-packages-api", "vrc-packages-network"].includes(name)).sort(([a], [b]) => a.localeCompare(b));
      // Refuse filesystem, Git and URL inputs, including credential-bearing registry URLs.
      if (entries.some(([name, spec]) => !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) ||
          typeof spec !== "string" || !spec || /[:/\\\r\n]/.test(spec))) {
        throw new Error("Cache warming accepts public registry dependency specifications only");
      }
      manifest[field] = Object.fromEntries(entries);
    }
    return manifest;
  });
  const digest = createHash("sha256").update(JSON.stringify(manifests)).digest("hex");
  return { project, key: `vrcp-bun-1.4.2-${project}-${digest}`, manifests };
}

export function warmCache(project, workspace = root, run = execFileSync, temporaryRoot = tmpdir()) {
  const inputs = cacheInputs(project, workspace);
  if (run("bun", ["--version"], { stdio: "pipe", encoding: "utf8" }).trim() !== "1.4.2") {
    throw new Error("Cache warming requires the pinned Bun runtime");
  }
  for (const manifest of inputs.manifests) {
    const directory = mkdtempSync(join(temporaryRoot, "vrcp-dependency-cache-"));
    writeFileSync(join(directory, "package.json"), JSON.stringify(manifest), { flag: "wx" });
    // Runner temporary storage, not repository source, credentials, scripts or release outputs.
    run("bun", ["install", "--cwd", directory, "--no-save", "--ignore-scripts"], { stdio: "inherit" });
  }
  return { project, status: "warmed", key: inputs.key };
}

export async function monitorCaches(api) {
  const usage = await api("GET", `/repos/${repository}/actions/cache/usage`);
  if (!Number.isSafeInteger(usage?.active_caches_size_in_bytes) || usage.active_caches_size_in_bytes < 0 ||
      !Number.isSafeInteger(usage.active_caches_count) || usage.active_caches_count < 0) {
    throw new Error("Cache usage response is malformed");
  }
  return { repository, purpose: "cache-monitoring", bytes: usage.active_caches_size_in_bytes,
    count: usage.active_caches_count, capacity: "not-measured", eviction: "GitHub-managed", status: "measured" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 2 && args[0] === "key") console.log(`key=${cacheInputs(args[1]).key}`);
    else if (args.length === 2 && args[0] === "warm") console.log(JSON.stringify(warmCache(args[1])));
    else {
      if (args.length) throw new Error("Use cache monitoring without arguments, or key/warm with a project");
      if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== repository) throw new Error("Unexpected repository");
      const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      if (!token) throw new Error("Cache monitoring requires a scoped GitHub token");
      console.log(JSON.stringify(await monitorCaches(async (method, path) => {
        const response = await fetch(`https://api.github.com${path}`, { method, redirect: "error", signal: AbortSignal.timeout(30_000),
          headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(`Cache API status: ${response.status}`);
        return response.json();
      }), null, 2));
    }
  } catch (error) {
    const status = error instanceof Error && /^Cache API status: (\d{3})$/.exec(error.message);
    if (status) console.error(`Cache API status: ${status[1]}, operation: usage`);
    console.error("Cache operation failed. No deletion, quota change or publication ran.");
    process.exitCode = 1;
  }
}
