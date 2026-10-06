import { expect, test } from "bun:test";
import { resolve, join, sep } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { PlatformSchema } from "vrc-packages-network/node";

test("node setup help reflects schema capabilities and Worker registration", () => {
  const result = Bun.spawnSync([process.execPath, "run", "src/main.ts", "--help"], {
    cwd: resolve(import.meta.dir, ".."),
    env: { ...process.env, GITHUB_TOKEN: "test-help-placeholder", GH_TOKEN: "", NODE_TOKEN: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = new TextDecoder().decode(result.stdout);
  expect(result.exitCode).toBe(0);
  expect(output).toContain(`Supported platforms: ${PlatformSchema.options.join(", ")}`);
  expect(output).toContain(`Default: all supported platforms (${PlatformSchema.options.join(",")})`);
  expect(output).toContain("/v1/operator/nodes");
  expect(output).not.toContain("vrc-coordinator register");
});

test("help and version preserve an existing cwd log without creating archives or node state", () => {
  const output = resolve(import.meta.dir, "../dist/tests");
  mkdirSync(output, { recursive: true });
  const parent = realpathSync(output), fixture = mkdtempSync(join(parent, "cli_no_outputs_"));
  const logs = join(fixture, "logs");
  mkdirSync(logs);
  writeFileSync(join(logs, "latest.log"), "existing fixture log\n");
  try {
    for (const flag of ["--help", "--version"]) {
      const result = Bun.spawnSync([process.execPath, "run", resolve(import.meta.dir, "../src/main.ts"), flag], {
        cwd: fixture,
        env: { ...process.env, CRAWLER_LOGS_DIR: logs, GITHUB_TOKEN: "test-help-placeholder", GH_TOKEN: "", NODE_TOKEN: "" },
        stdout: "pipe", stderr: "pipe", timeout: 15_000
      });
      expect(result.exitCode).toBe(0);
      expect(readFileSync(join(logs, "latest.log"), "utf8")).toBe("existing fixture log\n");
      expect(readdirSync(logs)).toEqual(["latest.log"]);
      expect(readdirSync(fixture)).toEqual(["logs"]);
    }
  } finally {
    if (!realpathSync(fixture).startsWith(parent + sep)) throw new Error("Unexpected CLI fixture path");
    rmSync(fixture, { recursive: true, force: true });
  }
});
