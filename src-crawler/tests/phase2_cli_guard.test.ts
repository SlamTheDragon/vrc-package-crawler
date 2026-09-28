import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import path from "path";

describe("Phase 2 - Task 2.1: Subcommand Guard on Crawler Daemon Binary", () => {
  const crawlerScript = path.resolve(__dirname, "../src/crawler/index.ts");

  it("exits with code 1 and instructional error when invoked with 'status'", () => {
    const res = spawnSync(process.execPath, ["run", crawlerScript, "status"], {
      encoding: "utf-8"
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("[ERROR] Direct subcommand invocation on vrc-crawler is unsupported.");
    expect(res.stderr).toContain("Administrative commands must be dispatched via vrc-monitor.exe");
  });

  it("exits with code 1 and instructional error when invoked with 'recrawl'", () => {
    const res = spawnSync(process.execPath, ["run", crawlerScript, "recrawl"], {
      encoding: "utf-8"
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("[ERROR] Direct subcommand invocation on vrc-crawler is unsupported.");
  });

  it("exits with code 1 and instructional error when invoked with 'stop'", () => {
    const res = spawnSync(process.execPath, ["run", crawlerScript, "stop"], {
      encoding: "utf-8"
    });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain("[ERROR] Direct subcommand invocation on vrc-crawler is unsupported.");
  });
});
