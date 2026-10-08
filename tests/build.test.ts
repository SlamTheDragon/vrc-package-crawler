import { describe, expect, test } from "bun:test";
import { buildTargets, buildOrder, resolveBuildScript, buildProduct, build } from "../scripts/build.mjs";

describe("Unified monorepo build orchestration (R67)", () => {
  test("buildTargets and buildOrder cover all 7 products in dependency order", () => {
    const expectedProducts = ["network", "package", "worker", "crawler", "crawler-client", "web", "web-search"];
    expect(buildOrder).toEqual(expectedProducts);
    for (const prod of expectedProducts) {
      expect(buildTargets[prod]).toBeDefined();
      expect(typeof buildTargets[prod].dir).toBe("string");
    }
  });

  test("resolveBuildScript selects channel and platform-specific build commands", () => {
    expect(resolveBuildScript("package", "preview")).toBe("build");
    expect(resolveBuildScript("package", "release")).toBe("build");
    expect(resolveBuildScript("worker", "preview")).toBe("build:preview");
    expect(resolveBuildScript("worker", "release")).toBe("build:release");
    expect(resolveBuildScript("crawler", "preview")).toBe(process.platform === "win32" ? "build:dev" : "build:node:linux");
    expect(resolveBuildScript("crawler-client", "preview")).toBe("build:dev");
    expect(resolveBuildScript("network", "preview")).toBe("build");
    expect(resolveBuildScript("web", "preview")).toBe("build");
    expect(resolveBuildScript("web-search", "preview")).toBe("build");
    expect(() => resolveBuildScript("unknown", "preview")).toThrow("Unknown build target");
  });

  test("buildProduct injects root environment variables and dispatches bun run", async () => {
    let executedCmd = "";
    let executedArgs: string[] = [];
    let executedOpts: any = {};

    const mockExec = (cmd: string, args: string[], opts: any) => {
      executedCmd = cmd;
      executedArgs = args;
      executedOpts = opts;
      return Buffer.from("");
    };

    const res = await buildProduct("package", "preview", {
      exec: mockExec as any,
      quiet: true,
      env: { CUSTOM_TEST_VAR: "123" }
    });

    expect(res.status).toBe("build-success");
    expect(res.product).toBe("package");
    expect(res.channel).toBe("preview");
    expect(res.script).toBe("build");
    expect(executedCmd).toBe("bun");
    expect(executedArgs).toEqual(["run", "build"]);
    expect(executedOpts.env.VRCP_PRODUCT).toBe("package");
    expect(executedOpts.env.VRCP_CHANNEL).toBe("preview");
    expect(executedOpts.env.CUSTOM_TEST_VAR).toBe("123");
    expect(typeof executedOpts.env.VRCP_ROOT_DIR).toBe("string");
  });

  test("build all executes products in buildOrder and rejects invalid channel", async () => {
    const executed: string[] = [];
    const mockExec = (_cmd: string, _args: string[], opts: any) => {
      executed.push(opts.env.VRCP_PRODUCT);
      return Buffer.from("");
    };

    const results = await build("all", "release", {
      exec: mockExec as any,
      quiet: true
    });

    expect(Array.isArray(results)).toBe(true);
    expect(executed).toEqual(buildOrder);
    await expect(build("all", "invalid-channel" as any)).rejects.toThrow("Invalid build channel");
  });
});
