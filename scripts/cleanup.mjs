import { lstat, realpath, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { productDirectories } from "./versioning.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const projects = { root: ".", ...productDirectories };
const outputs = {
  crawler: [["dist/dev/vrcp-crawler-node.exe", "file"], ["dist/dev/vrcp-crawler-node-linux", "file"],
    ["dist/tests", "directory"], [".artifacts/dev", "directory"], [".ci-artifacts", "directory"]],
  "crawler-client": [["build", "directory"], [".svelte-kit", "directory"], ["src-tauri/target", "directory"],
    [".artifacts/dev", "directory"]],
  package: [["dist", "directory"], ["tsconfig.tsbuildinfo", "file"], [".artifacts/dev", "directory"], [".artifacts/tests", "directory"]],
  web: [["dist", "directory"], [".astro", "directory"], [".artifacts/dev", "directory"]],
  worker: [[".wrangler/dev-build", "directory"], [".wrangler/ci-tools", "directory"], ["dist/tests", "directory"],
    [".artifacts/dev", "directory"]],
  network: [["dist", "directory"], [".artifacts/dev", "directory"], [".artifacts/tests", "directory"]]
};

function inside(parent, target) {
  const path = relative(parent, target);
  return path !== "" && !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
}

async function inspectTarget(workspace, productRoot, target, kind) {
  if ((productRoot !== workspace && !inside(workspace, productRoot)) || !inside(productRoot, target)) {
    throw new Error("Cleanup target must stay inside its selected product");
  }
  const segments = relative(workspace, target).split(sep);
  let current = workspace;
  for (const segment of segments) {
    current = resolve(current, segment);
    let info;
    try { info = await lstat(current); }
    catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Cleanup refuses linked paths: ${current}`);
    const expectedFile = current === target && kind === "file";
    if (expectedFile ? !info.isFile() : !info.isDirectory()) throw new Error(`Unexpected cleanup target type: ${current}`);
    if (!inside(workspace, await realpath(current))) throw new Error(`Cleanup path escapes the workspace: ${current}`);
  }
  return true;
}

/** Plan by default. Delete only explicit generated targets after --apply. */
export async function cleanup(mode, product, apply = false, workspace = root) {
  if (!["clean", "reset"].includes(mode) ||
      (product !== "all" && !Object.hasOwn(projects, product)) ||
      mode === "clean" && product === "root" || typeof apply !== "boolean") {
    throw new Error("Usage: cleanup.mjs <clean|reset> <crawler|crawler-client|package|web|worker|network|all> [--apply]; root supports reset only");
  }
  const base = await realpath(workspace);
  const targets = [];
  for (const name of product === "all" ? Object.keys(mode === "clean" ? outputs : projects) : [product]) {
    const productRoot = resolve(base, projects[name]);
    for (const [path, kind] of mode === "clean" ? outputs[name] : [["node_modules", "directory"]]) {
      const target = resolve(productRoot, path);
      targets.push({ product: name, path: target, kind, exists: await inspectTarget(base, productRoot, target, kind) });
    }
  }
  // Validate the whole plan before deletion, then recheck each target immediately before rm.
  if (apply) {
    for (const target of targets) {
      if (await inspectTarget(base, resolve(base, projects[target.product]), target.path, target.kind)) {
        await rm(target.path, { recursive: target.kind === "directory", force: false });
      }
    }
  }
  return { mode, product, dryRun: !apply, targets };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, product, flag, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || (flag !== undefined && flag !== "--apply")) throw new Error("Only --apply is accepted after the selected product");
    console.log(JSON.stringify(await cleanup(mode, product, flag === "--apply")));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Cleanup failed");
    process.exitCode = 1;
  }
}
