import { expect, test } from "bun:test";
import { resolve, join, sep } from "node:path";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";

test("missing .env configuration exits with code 1 and concise error", () => {
  const result = Bun.spawnSync([process.execPath, "run", "src/main.ts"], {
    cwd: resolve(import.meta.dir, ".."),
    env: { ...process.env, GITHUB_TOKEN: "test-help-placeholder", GH_TOKEN: "", NODE_TOKEN: "", NODE_ID: "" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = new TextDecoder().decode(result.stderr) + new TextDecoder().decode(result.stdout);
  expect(result.exitCode).toBe(1);
  expect(output).toContain("The crawler node requires configuration via .env or environment variables");
});

test("--version preserves an existing cwd log without creating archives or node state", () => {
  const output = resolve(import.meta.dir, "../dist/tests");
  mkdirSync(output, { recursive: true });
  const parent = realpathSync(output), fixture = mkdtempSync(join(parent, "cli_no_outputs_"));
  const logs = join(fixture, "logs");
  mkdirSync(logs);
  writeFileSync(join(logs, "latest.log"), "existing fixture log\n");
  try {
    const result = Bun.spawnSync([process.execPath, "run", resolve(import.meta.dir, "../src/main.ts"), "--version"], {
      cwd: fixture,
      env: { ...process.env, CRAWLER_LOGS_DIR: logs, GITHUB_TOKEN: "test-help-placeholder", GH_TOKEN: "", NODE_TOKEN: "" },
      stdout: "pipe", stderr: "pipe", timeout: 15_000
    });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(logs, "latest.log"), "utf8")).toBe("existing fixture log\n");
    expect(readdirSync(logs)).toEqual(["latest.log"]);
    expect(readdirSync(fixture)).toEqual(["logs"]);
  } finally {
    if (!realpathSync(fixture).startsWith(parent + sep)) throw new Error("Unexpected CLI fixture path");
    rmSync(fixture, { recursive: true, force: true });
  }
});
