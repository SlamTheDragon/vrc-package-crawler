import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { CrawlerDB } from "../src/db.ts";
import { BoothDriver } from "../src/drivers/booth";
import { GitHubDriver } from "../src/drivers/github";
import { PoissonScheduler } from "../src/utils/poisson_scheduler.ts";
import path from "path";
import fs from "fs";

describe("Phase 3 - Task 3.3: Wire Conditional Request Headers (ETag / If-None-Match) & Reconnect Poisson Feedback", () => {
  const fixturePath = path.resolve(__dirname, `../dist/test_conditional_${Date.now()}.db`);
  let testDb: CrawlerDB;
  const originalFetch = globalThis.fetch;
  const scheduler = new PoissonScheduler();

  beforeAll(() => {
    testDb = new CrawlerDB(fixturePath);
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    try { testDb?.close(); } catch (_) {}
    if (fs.existsSync(fixturePath)) {
      try { fs.unlinkSync(fixturePath); } catch (_) {}
    }
  });

  it("BoothDriver sends conditional headers and returns notModified: true on HTTP 304", async () => {
    const itemUrl = "https://booth.pm/ja/items/1234567";
    const testEtag = '"w/booth-hash-123"';
    const testLastMod = "Mon, 15 Jan 2026 12:00:00 GMT";

    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (url: any, opts: any) => {
      capturedHeaders = (opts?.headers || {}) as Record<string, string>;
      return new Response(null, {
        status: 304,
        headers: {
          "etag": testEtag,
          "last-modified": testLastMod
        }
      });
    }) as any;

    const result = await BoothDriver.crawlItemDetail(itemUrl, testDb, testEtag, testLastMod) as any;

    // Verify conditional headers were sent
    expect(capturedHeaders["If-None-Match"]).toBe(testEtag);
    expect(capturedHeaders["If-Modified-Since"]).toBe(testLastMod);

    // Verify driver response indicates 304 not modified
    expect(result.success).toBe(true);
    expect(result.notModified).toBe(true);
    expect(result.etag).toBe(testEtag);
    expect(result.lastModified).toBe(testLastMod);
  });

  it("GitHubDriver sends conditional headers on package.json fetch and returns notModified: true on HTTP 304", async () => {
    const repoUrl = "https://github.com/vrc-dev/sample-tool";
    const testEtag = '"gh-tag-789"';
    const testLastMod = "Tue, 16 Jan 2026 08:30:00 GMT";

    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (url: any, opts: any) => {
      const urlStr = String(url);
      if (urlStr.includes("package.json")) {
        capturedHeaders = (opts?.headers || {}) as Record<string, string>;
        return new Response(null, {
          status: 304,
          headers: {
            "etag": testEtag,
            "last-modified": testLastMod
          }
        });
      }
      return new Response("{}", { status: 200 });
    }) as any;

    const result = await GitHubDriver.crawlRepoDetail(repoUrl, testDb, testEtag, testLastMod) as any;

    expect(capturedHeaders["If-None-Match"]).toBe(testEtag);
    expect(capturedHeaders["If-Modified-Since"]).toBe(testLastMod);

    expect(result.success).toBe(true);
    expect(result.notModified).toBe(true);
    expect(result.etag).toBe(testEtag);
    expect(result.lastModified).toBe(testLastMod);
  });

  it("PoissonScheduler expands interval on 304 Not Modified and contracts on modified", () => {
    const testUrl = "https://booth.pm/ja/items/777888";
    testDb.queueUrl(testUrl, "booth", 5);

    // Set initial 24h interval (86400s)
    testDb.rawDb.run(`
      UPDATE frontier
      SET fetch_interval_sec = 86400, attempts = 1, failure_count = 0
      WHERE url = ?;
    `, [testUrl]);

    // 1. Simulating HTTP 304 Not Modified (isModified = false)
    const expandedInterval = scheduler.adjustAfterFetch(testUrl, false, '"etag-v1"', "Thu, 01 Jan 2026 00:00:00 GMT", testDb);
    // 86400 * 1.5 = 129600
    expect(expandedInterval).toBe(129600);

    let row = testDb.rawDb.prepare("SELECT fetch_interval_sec, attempts, etag, status FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(row.fetch_interval_sec).toBe(129600);
    expect(row.attempts).toBe(2);
    expect(row.etag).toBe('"etag-v1"');
    expect(row.status).toBe("done");

    // 2. Simulating subsequent HTTP 200 Modified (isModified = true)
    const contractedInterval = scheduler.adjustAfterFetch(testUrl, true, '"etag-v2"', "Fri, 02 Jan 2026 00:00:00 GMT", testDb);
    // 129600 / 1.5 = 86400
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
