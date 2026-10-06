import { describe, it, expect, afterAll } from "bun:test";
import { Logger } from "../src/utils/logging/logger.ts";
import path from "path";
import fs from "fs";

const outputPath = path.resolve(import.meta.dir, "../dist/tests");
fs.mkdirSync(outputPath, { recursive: true });
const tempRoot = fs.realpathSync(outputPath);

describe("Phase 2 - Task 2.5: Implement Unified latest.log with Daily/Shutdown Archiving", () => {
  const testDir = fs.mkdtempSync(path.join(tempRoot, "test_log_rotation_"));
  let logger: Logger;

  afterAll(async () => {
    try { await logger?.close(); } catch (_) {}
    if (fs.existsSync(testDir)) {
      if (!fs.realpathSync(testDir).startsWith(tempRoot + path.sep)) throw new Error("Unexpected log fixture path");
      try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  it("points active logs to latest.log and maintains session log paths", () => {
    logger = new Logger({
      logsDir: testDir,
      sessionId: `test_session_${process.pid}`,
      initialDate: "2026-09-24",
      enableSessionLogs: true,
    });

    expect(fs.existsSync(logger.getActiveLogPath())).toBe(false);
    logger.info("Writing test message 1");
    const activePath = logger.getActiveLogPath();
    expect(activePath).toBe(path.join(testDir, "latest.log"));
    expect(fs.existsSync(activePath)).toBe(true);

    const sessionPath = logger.getSessionLogPath();
    expect(sessionPath).toContain(`session_test_session_${process.pid}_2026-09-24.log`);
    expect(fs.existsSync(sessionPath)).toBe(true);

    const activeFiles = logger.getActiveLogFiles();
    expect(activeFiles.latest).toBe(path.join(testDir, "latest.log"));
    expect(fs.existsSync(activeFiles.latest)).toBe(true);

    logger.warn("Writing test warning 2");
    logger.error("Writing test error 3");
  });

  it("rotates log files on date change, archives latest.log to logs/archived with date, and clears latest.log", async () => {
    const latestPath = logger.getActiveLogPath();
    expect(fs.existsSync(latestPath)).toBe(true);

    // Simulate date turnover to next day (12am rotation)
    const compressedFiles = await logger.rotate("2026-09-25");

    const expectedGz = path.join(testDir, "archive", "2026-09-24.log.gz");
    expect(fs.existsSync(expectedGz)).toBe(true);
    expect(compressedFiles).toContain(expectedGz);

    // Verify latest.log is cleared after rotation
    const latestContentAfterRotate = fs.readFileSync(latestPath, "utf-8");
    expect(latestContentAfterRotate).toBe("");

    // Verify new writes go to latest.log
    logger.info("New day test message");
    await new Promise((r) => setTimeout(r, 60));
    const content = fs.readFileSync(latestPath, "utf-8");
    expect(content).toContain("New day test message");
    expect(content).not.toContain("Writing test message 1");
  });

  it("archives latest.log on program shutdown and clears latest.log", async () => {
    const latestPath = logger.getActiveLogPath();
    await logger.close();

    const expectedGz = path.join(testDir, "archive", "2026-09-25.log.gz");
    expect(fs.existsSync(expectedGz)).toBe(true);

    const latestAfterClose = fs.readFileSync(latestPath, "utf-8");
    expect(latestAfterClose).toBe("");
  });
});
