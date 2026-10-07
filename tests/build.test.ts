import { expect, test } from "bun:test";
import { build, buildProduct, buildTargets, buildOrder, resolveBuildScript } from "../scripts/build.mjs";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("resolveBuildScript resolves product and channel build scripts", () => {
  expect(resolveBuildScript("package", "preview")).toBe("build");
  expect(resolveBuildScript("package", "release")).toBe("build");
  expect(resolveBuildScript("worker", "preview")).toBe("build:preview");
  expect(resolveBuildScript("worker", "release")).toBe("build:release");
  expect(resolveBuildScript("crawler", "preview")).toBe(process.platform === "win32" ? "build:dev" : "build:node:linux");
  expect(resolveBuildScript("crawler-client", "preview")).toBe("build:dev");
  expect(resolveBuildScript("network", "preview")).toBe("build");
  expect(resolveBuildScript("web", "preview")).toBe("build");
  expect(() => resolveBuildScript("unknown-target" as any)).toThrow("Unknown build target: \"unknown-target\"");
});

test("buildProduct executes target npm script with root environment variables", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-build-test-"));
  try {
    const pkgDir = join(dir, "src-package");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify({
      name: "vrc-packages-api",
      scripts: { build: "bun build src/index.ts" }
    }));

    const executed: { cmd: string; args: string[]; cwd: string; env: any }[] = [];
    const mockExec = (cmd: string, args: string[], opts: any) => {
      executed.push({ cmd, args, cwd: opts.cwd, env: opts.env });
      return "";
    };

    const res = await buildProduct("package", "release", {
      workspace: dir,
      exec: mockExec as any,
      quiet: true
    });

    expect(res.status).toBe("build-success");
    expect(res.product).toBe("package");
    expect(res.channel).toBe("release");
    expect(executed.length).toBe(1);
    expect(executed[0].cmd).toBe("bun");
    expect(executed[0].args).toEqual(["run", "build"]);
    expect(executed[0].cwd).toBe(pkgDir);
    expect(executed[0].env.VRCP_PRODUCT).toBe("package");
    expect(executed[0].env.VRCP_CHANNEL).toBe("release");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildProduct skips product with missing package.json gracefully", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-build-missing-"));
  try {
    const res = await buildProduct("web-search", "preview", {
      workspace: dir,
      quiet: true
    });
    expect(res.status).toBe("skipped-missing-package");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("build('all') runs builds in proper dependency order across products", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-build-all-"));
  try {
    for (const [prod, info] of Object.entries(buildTargets)) {
      const pDir = join(dir, info.dir);
      mkdirSync(pDir, { recursive: true });
      writeFileSync(join(pDir, "package.json"), JSON.stringify({
        name: `vrc-${prod}`,
        scripts: {
          build: "echo build",
          "build:preview": "echo build:preview",
          "build:release": "echo build:release",
          "build:dev": "echo build:dev",
          "build:node:linux": "echo build:node:linux"
        }
      }));
    }

    const executedOrder: string[] = [];
    const mockExec = (_cmd: string, _args: string[], opts: any) => {
      executedOrder.push(opts.env.VRCP_PRODUCT);
      return "";
    };

    const results = await build("all", "preview", {
      workspace: dir,
      exec: mockExec as any,
      quiet: true
    });

    expect(Array.isArray(results)).toBe(true);
    expect(executedOrder).toEqual(buildOrder);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("build throws on invalid channel", async () => {
  await expect(build("package", "staging" as any, { quiet: true })).rejects.toThrow("Invalid build channel: \"staging\"");
});
