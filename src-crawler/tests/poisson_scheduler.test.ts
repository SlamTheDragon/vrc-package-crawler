import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { CrawlerDB } from "../src/db/db.ts";
import { PoissonScheduler } from "../src/utils/poisson_scheduler.ts";
import path from "path";
import fs from "fs";

describe("PoissonScheduler & Adaptive Interval Updates", () => {
  const fixturePath = path.resolve(__dirname, `../dist/test_poisson_${Date.now()}.db`);
  let testDb: CrawlerDB;
  const scheduler = new PoissonScheduler();

  beforeAll(() => {
    testDb = new CrawlerDB(fixturePath);
  });

  afterAll(() => {
    try { testDb?.close(); } catch (_) {}
    if (fs.existsSync(fixturePath)) {
      try { fs.unlinkSync(fixturePath); } catch (_) {}
    }
  });

  it("PoissonScheduler expands interval on 304 Not Modified and contracts on modified", () => {
    const testUrl = "https://booth.pm/ja/items/777888";
    testDb.queueUrl(testUrl, "booth", 5);

    testDb.rawDb.run(`
      UPDATE frontier
      SET fetch_interval_sec = 86400, attempts = 1, failure_count = 0
      WHERE url = ?;
    `, [testUrl]);

    // 1. Simulating HTTP 304 Not Modified (isModified = false)
    const expandedInterval = scheduler.adjustAfterFetch(testUrl, false, '"etag-v1"', "Thu, 01 Jan 2026 00:00:00 GMT", testDb);
    expect(expandedInterval).toBe(129600);

    let row = testDb.rawDb.prepare("SELECT fetch_interval_sec, attempts, etag, status FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(row.fetch_interval_sec).toBe(129600);
    expect(row.attempts).toBe(2);
    expect(row.etag).toBe('"etag-v1"');
    expect(row.status).toBe("done");

    // 2. Simulating subsequent HTTP 200 Modified (isModified = true)
    const contractedInterval = scheduler.adjustAfterFetch(testUrl, true, '"etag-v2"', "Fri, 02 Jan 2026 00:00:00 GMT", testDb);
    expect(contractedInterval).toBe(86400);

    row = testDb.rawDb.prepare("SELECT fetch_interval_sec, attempts, etag FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(row.fetch_interval_sec).toBe(86400);
    expect(row.attempts).toBe(3);
    expect(row.etag).toBe('"etag-v2"');
  });

  it("db.markStatus accepts nextIntervalSec and dynamically updates next_fetch_at", () => {
    const testUrl = "https://github.com/vrc-dev/dynamic-interval-tool";
    testDb.queueUrl(testUrl, "github", 5);

    const customInterval = 14400; // 4 hours
    testDb.markStatus(
      testUrl,
      "done",
      undefined,
      '"etag-dyn"',
      "Sat, 03 Jan 2026 10:00:00 GMT",
      3600,
      null,
      null,
      customInterval
    );

    const row = testDb.rawDb.prepare("SELECT fetch_interval_sec, etag, last_modified, status FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(row.fetch_interval_sec).toBe(customInterval);
    expect(row.etag).toBe('"etag-dyn"');
    expect(row.last_modified).toBe("Sat, 03 Jan 2026 10:00:00 GMT");
    expect(row.status).toBe("done");
  });
});
