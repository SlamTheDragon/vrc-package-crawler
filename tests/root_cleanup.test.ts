import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { cleanup } from "../scripts/cleanup.mjs";

async function fixture(run: (workspace: string) => Promise<void>) {
  const parent = await realpath(tmpdir());
  const workspace = await mkdtemp(resolve(parent, "vrcp-cleanup-"));
  try { await run(workspace); }
  finally {
    const path = relative(parent, await realpath(workspace));
    if (!path || isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) throw new Error("Unsafe fixture cleanup path");
    await rm(workspace, { recursive: true });
  }
}

test("cleanup plans by default and deletes only selected crawler binaries", async () => {
  await fixture(async workspace => {
    const build = resolve(workspace, "src-crawler/dist/local-node");
    await mkdir(build, { recursive: true });
    await mkdir(resolve(workspace, "src-package/dist"), { recursive: true });
    for (const name of ["vrcp-crawler-node.exe", "vrcp-crawler-node-linux", "node.db", "activity.log"]) {
      await writeFile(resolve(build, name), name);
    }
    const plan = await cleanup("clean", "crawler", false, workspace);
    expect(plan.dryRun).toBe(true);
    expect(plan.targets).toHaveLength(2);
    expect(await readFile(resolve(build, "vrcp-crawler-node.exe"), "utf8")).toBe("vrcp-crawler-node.exe");
    await cleanup("clean", "crawler", true, workspace);
    await expect(readFile(resolve(build, "vrcp-crawler-node.exe"))).rejects.toThrow();
    expect(await readFile(resolve(build, "node.db"), "utf8")).toBe("node.db");
    expect(await readFile(resolve(build, "activity.log"), "utf8")).toBe("activity.log");
    expect((await cleanup("clean", "package", false, workspace)).targets[0].exists).toBe(true);
  });
});

test("cleanup preserves Worker local D1 state and reset touches only node_modules", async () => {
  await fixture(async workspace => {
    const worker = resolve(workspace, "src-worker");
    for (const path of [".wrangler/api-build", ".wrangler/state", "node_modules", "bin"]) {
      await mkdir(resolve(worker, path), { recursive: true });
      await writeFile(resolve(worker, path, "fixture"), path);
    }
    await cleanup("clean", "worker", true, workspace);
    expect(await readFile(resolve(worker, ".wrangler/state/fixture"), "utf8")).toBe(".wrangler/state");
    expect((await cleanup("reset", "worker", false, workspace)).dryRun).toBe(true);
    await cleanup("reset", "worker", true, workspace);
    expect(await readFile(resolve(worker, "bin/fixture"), "utf8")).toBe("bin");
    expect(await readFile(resolve(worker, ".wrangler/state/fixture"), "utf8")).toBe(".wrangler/state");
  });
});

test("cleanup rejects linked ancestors before deleting any selected targets", async () => {
  await fixture(async workspace => {
    const actual = resolve(workspace, "actual-worker");
    await mkdir(resolve(actual, "node_modules"), { recursive: true });
    await writeFile(resolve(actual, "node_modules/fixture"), "preserve");
    await mkdir(resolve(workspace, "src-package/node_modules"), { recursive: true });
    await writeFile(resolve(workspace, "src-package/node_modules/fixture"), "preserve-earlier-target");
    await symlink(actual, resolve(workspace, "src-worker"), process.platform === "win32" ? "junction" : "dir");
    await expect(cleanup("reset", "all", true, workspace)).rejects.toThrow("linked paths");
    expect(await readFile(resolve(actual, "node_modules/fixture"), "utf8")).toBe("preserve");
    expect(await readFile(resolve(workspace, "src-package/node_modules/fixture"), "utf8")).toBe("preserve-earlier-target");
  });
});

test("cleanup refuses unknown products and absent product selection", async () => {
  for (const product of [undefined, "../", "root", "crawler/../../", ""]) {
    await expect(cleanup("clean", product)).rejects.toThrow("Usage:");
  }
});
