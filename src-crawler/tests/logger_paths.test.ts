import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, realpathSync, rmSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

test("source and standalone log defaults ignore cwd while explicit overrides and Docker persistence remain", async () => {
  const output = resolve(import.meta.dir, "../dist/tests");
  mkdirSync(output, { recursive: true });
  const parent = realpathSync(output), fixture = mkdtempSync(join(parent, "logger_paths_"));
  const entry = resolve(import.meta.dir, "fixtures/logger_paths.ts");
  const binary = join(fixture, process.platform === "win32" ? "logger.exe" : "logger");
  const cwd = join(fixture, "cwd"), state = join(fixture, "state");
  mkdirSync(cwd);
  const env = { ...process.env, CRAWLER_LOGS_DIR: "", LOCALAPPDATA: state, XDG_STATE_HOME: state, HOME: state, USERPROFILE: state };
  const run = (command: string[], extraEnv = {}) => {
    const result = Bun.spawnSync(command, { cwd, env: { ...env, ...extraEnv }, stdout: "pipe", stderr: "pipe", timeout: 15_000 });
    expect(result.exitCode).toBe(0);
    return JSON.parse(result.stdout.toString().split("\n")[0]!);
  };
  try {
    const source = run([process.execPath, "run", entry]);
    expect(source).toEqual({ path: resolve(import.meta.dir, "../logs/latest.log"), standalone: false });
    const built = await Bun.build({ entrypoints: [entry], compile: { outfile: binary }, target: "bun" });
    expect(built.success).toBe(true);
    const installedRoot = process.platform === "darwin" ? join(state, "Library", "Logs") : state;
    const installed = run([binary, "write"]);
    expect(installed).toEqual({ path: join(installedRoot, "vrcp-crawler", "logs", "latest.log"), standalone: true });
    expect(existsSync(installed.path)).toBe(true);
    expect(readdirSync(cwd)).toEqual([]);
    expect(run([binary], { CRAWLER_LOGS_DIR: join(fixture, "override") }).path).toBe(join(fixture, "override", "latest.log"));
    expect(run([binary, "explicit"], { CRAWLER_LOGS_DIR: join(fixture, "override") }).path).toBe(join("explicit-logs", "latest.log"));
    const fallbackRoot = process.platform === "win32" ? join(state, "AppData", "Local")
      : process.platform === "darwin" ? join(state, "Library", "Logs") : join(state, ".local", "state");
    expect(run([binary], { LOCALAPPDATA: "relative-state", XDG_STATE_HOME: "relative-state" }).path)
      .toBe(join(fallbackRoot, "vrcp-crawler", "logs", "latest.log"));
    expect(await Bun.file(resolve(import.meta.dir, "../Dockerfile")).text()).toContain("ENV CRAWLER_LOGS_DIR=/app/data/logs");
  } finally {
    if (!realpathSync(fixture).startsWith(parent + sep)) throw new Error("Unexpected logger fixture path");
    rmSync(fixture, { recursive: true, force: true });
  }
});
