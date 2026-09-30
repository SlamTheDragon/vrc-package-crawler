import { describe, it, expect, afterAll } from "bun:test";
import { Logger } from "../src/utils/logger.ts";
import path from "path";
import fs from "fs";

describe("Phase 2 - Task 2.5: Implement Session-Prefixed Daily Rotating Log Streams", () => {
  const testDir = path.resolve(__dirname, `../dist/test_log_rotation_${Date.now()}`);
  let logger: Logger;

  afterAll(async () => {
    try { await logger?.close(); } catch (_) {}
    if (fs.existsSync(testDir)) {
      try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  it("creates session-prefixed log files with date partitioning", () => {
    logger = new Logger({
      logsDir: testDir,
      sessionId: `test_session_${process.pid}`,
      initialDate: "2026-09-24"
    });

    const activePath = logger.getActiveLogPath();
    expect(activePath).toContain(`session_test_session_${process.pid}_2026-09-24.log`);
    expect(fs.existsSync(activePath)).toBe(true);

    const activeFiles = logger.getActiveLogFiles();
    expect(activeFiles.latest).toBe(path.join(testDir, "latest.log"));
    expect(fs.existsSync(activeFiles.latest)).toBe(true);

    logger.info("Writing test message 1");
    logger.warn("Writing test warning 2");
    logger.error("Writing test error 3");
  });

  it("rotates log files on date change and compresses prior logs to .gz in archive folder", async () => {
    const priorLogPath = logger.getActiveLogPath();
    expect(fs.existsSync(priorLogPath)).toBe(true);

    // Simulate date turnover to next day
    const compressedFiles = await logger.rotate("2026-09-25");

    const expectedGz = path.join(testDir, "archive", `${path.basename(priorLogPath)}.gz`);
    expect(fs.existsSync(expectedGz)).toBe(true);
    expect(fs.existsSync(priorLogPath)).toBe(false);
    expect(compressedFiles).toContain(expectedGz);

    // Verify new active log path reflects the new date
    const newActivePath = logger.getActiveLogPath();
    expect(newActivePath).toContain("2026-09-25.log");
    expect(fs.existsSync(newActivePath)).toBe(true);

    // Verify latest.log is continuous and remained intact
    const latestPath = path.join(testDir, "latest.log");
    expect(fs.existsSync(latestPath)).toBe(true);

    // Verify new writes go to the rotated file
    logger.info("New day test message");
    await new Promise((r) => setTimeout(r, 50));
    const content = fs.readFileSync(newActivePath, "utf-8");
    expect(content).toContain("New day test message");

    // Verify latest.log contains all prior and new messages
    const latestContent = fs.readFileSync(latestPath, "utf-8");
    expect(latestContent).toContain("Writing test message 1");
    expect(latestContent).toContain("Writing test warning 2");
    expect(latestContent).toContain("Writing test error 3");
    expect(latestContent).toContain("New day test message");
  });

  it("supports custom archiveDir when configured", async () => {
    const customArchiveDir = path.join(testDir, "custom_archive");
    const customLogger = new Logger({
      logsDir: testDir,
      sessionId: `custom_archive_${process.pid}`,
      initialDate: "2026-09-24",
      archiveDir: customArchiveDir
    });

    customLogger.info("Custom archive message");
    const customLogPath = customLogger.getActiveLogPath();
    const compressed = await customLogger.rotate("2026-09-25");
    await customLogger.close();

    const expectedGz = path.join(customArchiveDir, `${path.basename(customLogPath)}.gz`);
    expect(fs.existsSync(expectedGz)).toBe(true);
    expect(compressed).toContain(expectedGz);
  });
});
