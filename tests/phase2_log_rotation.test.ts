import { describe, it, expect, afterAll } from "bun:test";
import { Logger } from "../src/logger.ts";
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

    logger.info("Writing test message 1");
    logger.warn("Writing test warning 2");
    logger.error("Writing test error 3");
  });

  it("rotates log files on date change and compresses prior logs to .gz", async () => {
    const priorLogPath = logger.getActiveLogPath();
    expect(fs.existsSync(priorLogPath)).toBe(true);

    // Simulate date turnover to next day
    const compressedFiles = await logger.rotate("2026-09-25");

    const expectedGz = `${priorLogPath}.gz`;
    expect(fs.existsSync(expectedGz)).toBe(true);
    expect(fs.existsSync(priorLogPath)).toBe(false);

    // Verify new active log path reflects the new date
    const newActivePath = logger.getActiveLogPath();
    expect(newActivePath).toContain("2026-09-25.log");
    expect(fs.existsSync(newActivePath)).toBe(true);

    // Verify new writes go to the rotated file
    logger.info("New day test message");
    await new Promise((r) => setTimeout(r, 50));
    const content = fs.readFileSync(newActivePath, "utf-8");
    expect(content).toContain("New day test message");
  });
});
