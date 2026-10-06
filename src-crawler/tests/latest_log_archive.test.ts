import { describe, it, expect, afterAll } from "bun:test";
import { Logger } from "../src/utils/logging/logger.ts";
import path from "path";
import fs from "fs";
import zlib from "zlib";

const outputPath = path.resolve(import.meta.dir, "../dist/tests");
fs.mkdirSync(outputPath, { recursive: true });
const tempRoot = fs.realpathSync(outputPath);

describe("Unified latest.log and Archiving Lifecycle", () => {
  const testDir = fs.mkdtempSync(path.join(tempRoot, "test_latest_log_"));
  let logger: Logger;

  afterAll(async () => {
    try { await logger?.close(); } catch (_) {}
    if (fs.existsSync(testDir)) {
      if (!fs.realpathSync(testDir).startsWith(tempRoot + path.sep)) throw new Error("Unexpected log fixture path");
      try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  it("all logs point to latest.log", async () => {
    logger = new Logger({
      logsDir: testDir,
      sessionId: `test_session_${process.pid}`,
      initialDate: "2026-10-01"
    });

    const activePath = logger.getActiveLogPath();
    expect(activePath).toBe(path.join(testDir, "latest.log"));
    expect(fs.existsSync(activePath)).toBe(false);

    logger.info("Test message for latest log");
    expect(fs.existsSync(activePath)).toBe(true);
    logger.warn("Test warning for latest log");
    logger.error("Test error for latest log", new Error("Sample test failure"));
    logger.rateLimit("booth", 5, "2026-10-01T15:00:00Z", 2000);
    logger.debug("Test debug message");

    // Wait a brief moment for writes to flush to stream
    await new Promise((r) => setTimeout(r, 60));

    const content = fs.readFileSync(activePath, "utf-8");
    expect(content).toContain("[INFO] Test message for latest log");
    expect(content).toContain("[WARN] Test warning for latest log");
    expect(content).toContain("[ERROR] Test error for latest log");
    expect(content).toContain("[RATE_LIMIT] [booth] Remaining: 5");
    expect(content).toContain("[DEBUG] Test debug message");
  });

  it("clears latest.log and archives contents to logs/archived with the date on rotation", async () => {
    const archiveDir = path.join(testDir, "archive");
    const activePath = logger.getActiveLogPath();

    // Rotate to the next day
    const compressed = await logger.rotate("2026-10-02");
    expect(compressed.length).toBeGreaterThan(0);

    const expectedGz = path.join(archiveDir, "2026-10-01.log.gz");
    expect(fs.existsSync(expectedGz)).toBe(true);

    // Verify the archive contains the archived data
    const gzippedBuffer = fs.readFileSync(expectedGz);
    const unzipped = zlib.gunzipSync(gzippedBuffer).toString("utf-8");
    expect(unzipped).toContain("Test message for latest log");

    // Verify latest.log is cleared
    const latestAfterRotation = fs.readFileSync(activePath, "utf-8");
    expect(latestAfterRotation).toBe("");

    // Write new log messages after rotation
    logger.info("Message for the next day 2026-10-02");
    await new Promise((r) => setTimeout(r, 60));

    const latestNewContent = fs.readFileSync(activePath, "utf-8");
    expect(latestNewContent).toContain("Message for the next day 2026-10-02");
    expect(latestNewContent).not.toContain("Test message for latest log");
  });

  it("archives latest.log and clears it when program shuts down (close)", async () => {
    const archiveDir = path.join(testDir, "archive");
    const activePath = logger.getActiveLogPath();

    // Closing the logger simulates program shutdown
    await logger.close();

    const expectedSecondGz = path.join(archiveDir, "2026-10-02.log.gz");
    expect(fs.existsSync(expectedSecondGz)).toBe(true);

    const gzippedBuffer = fs.readFileSync(expectedSecondGz);
    const unzipped = zlib.gunzipSync(gzippedBuffer).toString("utf-8");
    expect(unzipped).toContain("Message for the next day 2026-10-02");

    // Verify latest.log was cleared upon shutdown
    const latestAfterShutdown = fs.readFileSync(activePath, "utf-8");
    expect(latestAfterShutdown).toBe("");
  });

  it("handles multiple archives on the same date with indexed suffix", async () => {
    const subLogger = new Logger({
      logsDir: testDir,
      sessionId: `repeat_session_${process.pid}`,
      initialDate: "2026-10-01"
    });

    subLogger.info("Session 1 on 2026-10-01");
    await subLogger.close();

    // The first archive for 2026-10-01 already exists from prior test, so next is 2026-10-01-1.log.gz
    const expectedIndexedGz = path.join(testDir, "archive", "2026-10-01-1.log.gz");
    expect(fs.existsSync(expectedIndexedGz)).toBe(true);

    const content = zlib.gunzipSync(fs.readFileSync(expectedIndexedGz)).toString("utf-8");
    expect(content).toContain("Session 1 on 2026-10-01");
  });
});
