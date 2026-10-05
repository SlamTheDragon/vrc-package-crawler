import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { cacheInputs, monitorCaches, warmCache } from "../scripts/cache-maintenance.mjs";

const base = "/repos/SlamTheDragon/vrc-packages";
function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), "vrcp-cache-fixture-"));
  mkdirSync(join(workspace, "src-worker"), { recursive: true });
  const root = { name: "vrc-packages", version: "0.0.0", private: true, packageManager: "bun@1.4.2",
    devDependencies: { semver: "^7.8.5" }, scripts: { postinstall: "PRIVATE_SCRIPT_SENTINEL" } };
  const worker = { name: "vrcp-worker", version: "2026.10.5-pre", packageManager: "bun@1.4.2",
    dependencies: { zod: "^4.6.5", "vrc-packages-api": "npm:vrc-packages-api-preview@latest",
      "vrc-packages-network": "https://github.com/SlamTheDragon/vrc-packages/releases/download/vrcp-network/v2026.10.2/network.tgz" },
    devDependencies: { wrangler: "4.147.0" } };
  const save = () => {
    writeFileSync(join(workspace, "package.json"), JSON.stringify(root));
    writeFileSync(join(workspace, "src-worker/package.json"), JSON.stringify(worker));
  };
  save();
  return { workspace, root, worker, save };
}

test("dependency keys ignore source/release metadata but change with public dependency contracts", () => {
  const f = fixture();
  try {
    const initial = cacheInputs("worker", f.workspace);
    f.root.version = "0.0.5"; f.worker.version = "0.0.6"; f.worker.name = "different-name";
    f.root.scripts.postinstall = "ANOTHER_PRIVATE_SENTINEL";
    f.worker.dependencies["vrc-packages-api"] = "latest";
    f.worker.dependencies["vrc-packages-network"] = "file:/ignored-verified-delivery-input";
    f.save();
    expect(cacheInputs("worker", f.workspace).key).toBe(initial.key);
    expect(JSON.stringify(initial.manifests)).not.toContain("PRIVATE_SCRIPT_SENTINEL");
    expect(JSON.stringify(initial.manifests)).not.toContain("vrc-packages-api");
    expect(JSON.stringify(initial.manifests)).not.toContain("github.com");
    f.worker.devDependencies.wrangler = "4.148.0"; f.save();
    expect(cacheInputs("worker", f.workspace).key).not.toBe(initial.key);
    const changed = cacheInputs("worker", f.workspace).key;
    f.root.devDependencies.semver = "^8"; f.save();
    expect(cacheInputs("worker", f.workspace).key).not.toBe(changed);
    expect(cacheInputs("root", f.workspace).manifests).toHaveLength(1);
  } finally { rmSync(f.workspace, { recursive: true }); }
});

test("cache inputs reject unknown projects, wrong tools and nonregistry dependencies", () => {
  const f = fixture();
  try {
    for (const project of ["web", "../src-worker", "toString", ""]) expect(() => cacheInputs(project, f.workspace)).toThrow();
    for (const spec of ["file:../secret", "https://user:secret@example.com/a", "git+https://example.com/a", "a\nb", ""]) {
      f.worker.dependencies.zod = spec; f.save();
      expect(() => cacheInputs("worker", f.workspace)).toThrow("public registry");
    }
    f.worker.dependencies.zod = "^4.6.5"; f.worker.packageManager = "bun@1.4.3"; f.save();
    expect(() => cacheInputs("worker", f.workspace)).toThrow("Bun pin");
    f.worker.packageManager = "bun@1.4.2";
    (f.worker as any).dependencies = ["zod"]; f.save();
    expect(() => cacheInputs("worker", f.workspace)).toThrow("must be objects");
  } finally { rmSync(f.workspace, { recursive: true }); }
});

test("warming installs minimal manifests in temporary storage without project scripts or source changes", () => {
  const f = fixture(), temporaryRoot = mkdtempSync(join(tmpdir(), "vrcp-cache-warming-"));
  try {
    const before = readFileSync(join(f.workspace, "src-worker/package.json"), "utf8");
    const calls: any[] = [];
    const result = warmCache("worker", f.workspace, (binary: string, args: string[], options: any) => {
      if (args[0] === "--version") return "1.4.2\n";
      calls.push({ binary, args, options });
      const directory = args[2];
      expect(directory.startsWith(temporaryRoot)).toBe(true);
      expect(args).toEqual(["install", "--cwd", directory, "--no-save", "--ignore-scripts"]);
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      expect(manifest.private).toBe(true);
      expect(manifest.scripts).toBeUndefined();
      expect(manifest.dependencies["vrc-packages-api"]).toBeUndefined();
      expect(readdirSync(directory)).toEqual(["package.json"]);
    }, temporaryRoot);
    expect(result.status).toBe("warmed"); expect(calls).toHaveLength(2);
    expect(calls.every(c => c.binary === "bun")).toBe(true);
    expect(readFileSync(join(f.workspace, "src-worker/package.json"), "utf8")).toBe(before);
    expect(() => warmCache("worker", f.workspace, () => { throw new Error("offline registry"); }, temporaryRoot)).toThrow("offline registry");
    expect(() => warmCache("worker", f.workspace, () => "1.4.1", temporaryRoot)).toThrow("pinned Bun runtime");
  } finally {
    rmSync(f.workspace, { recursive: true });
    rmSync(temporaryRoot, { recursive: true });
  }
});

test("cache monitoring reads usage without capacity access, deletion or invented quota", async () => {
  const calls: any[] = [];
  const result = await monitorCaches(async (method: string, path: string) => {
    calls.push({ method, path });
    return { active_caches_size_in_bytes: 1_414_776_479, active_caches_count: 8 };
  });
  expect(calls).toEqual([{ method: "GET", path: base + "/actions/cache/usage" }]);
  expect(result.bytes).toBe(1_414_776_479);
  expect(result.capacity).toBe("not-measured");
  expect(result.eviction).toBe("GitHub-managed");
  for (const usage of [null, {}, { active_caches_size_in_bytes: -1, active_caches_count: 0 },
    { active_caches_size_in_bytes: 0, active_caches_count: 0.5 }]) {
    await expect(monitorCaches(async () => usage)).rejects.toThrow("malformed");
  }
  await expect(monitorCaches(async () => { throw new Error("permission denied"); })).rejects.toThrow("permission denied");
});

test("cache workflows use trusted branch warming and restore-only product jobs without skipping installation", () => {
  const yaml = (path: string): any => Bun.YAML.parse(readFileSync(new URL("../" + path, import.meta.url), "utf8"));
  const action = yaml(".github/actions/dependency-cache/action.yml");
  const restore = action.runs.steps.find((s: any) => s.uses === "actions/cache/restore@v4");
  const save = action.runs.steps.find((s: any) => s.uses === "actions/cache/save@v4");
  expect(restore.with.path).toBe("~/.bun/install/cache");
  expect(restore.with.key).toContain("runner.os");
  expect(restore.with.key).toContain("runner.arch");
  expect(restore.with["restore-keys"]).toBeUndefined();
  expect(save.if).toContain("github.event.repository.default_branch");
  expect(save.if).toContain("github.event_name == 'push'");
  expect(save.if).toContain("cache-hit != 'true'");
  const warm = yaml(".github/workflows/dependency-cache.yml");
  expect(warm.permissions).toEqual({ contents: "read" });
  expect(warm.on.pull_request).toBeUndefined();
  expect(warm.jobs.warm.strategy.matrix.include).toHaveLength(8);
  expect(warm.jobs.warm.steps[0].with["persist-credentials"]).toBe(false);
  expect(warm.jobs.warm.steps.at(-1).with.warm).toBe("true");
  const mappings: any = { "node-client": { build: "crawler-client" }, "node-docker": { "build-linux": "crawler", "standalone-windows": "crawler" },
    "cloudflare-worker": { build: "worker" }, "vrc-packages-api": { build: "package" }, network: { build: "network" },
    "release-assets": {}, "sdk-release-reconcile": {} };
  for (const [name, products] of Object.entries(mappings)) for (const [jobName, job] of Object.entries<any>(yaml(".github/workflows/" + name + ".yml").jobs)) {
    for (const [index, step] of (job.steps ?? []).entries()) if (step.run === "bun install --no-save --ignore-scripts") {
      expect(step.if).toBeUndefined();
      expect(job.steps[index - 1].uses).toBe("./.github/actions/dependency-cache");
      expect(job.steps[index - 1].with).toEqual({ project: (products as any)[jobName] ?? "root" });
    }
  }
  const monitor = yaml(".github/workflows/cache-maintenance.yml");
  expect(monitor.permissions).toEqual({ contents: "read", actions: "read" });
  expect(monitor.jobs.maintain.steps.at(-1).run).toBe("bun run cache:check");
  expect(monitor.jobs.maintain.steps[0].with).toEqual({ ref: "main", "persist-credentials": false });
  const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(root.scripts["cache:prune"]).toBeUndefined();
});

test("cache key CLI starts without installed dependencies and monitoring never leaks authentication errors", () => {
  const f = fixture(), directory = join(f.workspace, "scripts");
  try {
    mkdirSync(directory);
    const script = readFileSync(new URL("../scripts/cache-maintenance.mjs", import.meta.url), "utf8");
    writeFileSync(join(directory, "cache-maintenance.mjs"), script);
    const cold = spawnSync(process.execPath, [join(directory, "cache-maintenance.mjs"), "key", "worker"], { encoding: "utf8" });
    expect(cold.status).toBe(0);
    expect(cold.stdout.trim()).toBe("key=" + cacheInputs("worker", f.workspace).key);
    const path = fileURLToPath(new URL("../scripts/cache-maintenance.mjs", import.meta.url));
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", `process.argv[1]=${JSON.stringify(path)};
      globalThis.fetch=async()=>Response.json({message:'PRIVATE_RESPONSE_SENTINEL'},{status:403});
      await import(${JSON.stringify(new URL("../scripts/cache-maintenance.mjs", import.meta.url).href)});`], {
      env: { ...process.env, GH_TOKEN: "not-a-credential", GITHUB_TOKEN: "", GITHUB_REPOSITORY: "SlamTheDragon/vrc-packages" },
      encoding: "utf8", timeout: 10_000
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Cache API status: 403, operation: usage");
    expect(run.stderr).not.toContain("PRIVATE_RESPONSE_SENTINEL");
    expect(run.stderr).not.toContain("not-a-credential");
  } finally { rmSync(f.workspace, { recursive: true }); }
});
