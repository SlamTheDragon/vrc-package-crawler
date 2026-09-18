import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { PoissonScheduler } from "../src/utils/poisson_scheduler.ts";
import { dbV2 } from "../src/db_v2.ts";

describe("Cho-Garcia-Molina Poisson Refresh Scheduler", () => {
  const scheduler = new PoissonScheduler();

  it("adjusts interval upwards on HTTP 304 unchanged (exponential backoff)", () => {
    const url = "https://booth.pm/test-unchanged";
    dbV2.run(`
      INSERT OR REPLACE INTO frontier_v2 (
        url, platform, status, attempts, fetch_interval_sec, next_fetch_at, discovered_at, updated_at
      ) VALUES (?, 'booth', 'fetching', 1, 86400, datetime('now'), datetime('now'), datetime('now'));
    `, [url]);

    scheduler.adjustAfterFetch(url, false, "etag-123");

    const row = dbV2.query("SELECT fetch_interval_sec, status, etag FROM frontier_v2 WHERE url = ?;").get(url) as any;
    expect(row.status).toBe("done");
    expect(row.fetch_interval_sec).toBe(Math.round(86400 * 1.5)); // 129600
    expect(row.etag).toBe("etag-123");
  });

  it("adjusts interval downwards on HTTP 200 modified (refresh sooner)", () => {
    const url = "https://booth.pm/test-modified";
    dbV2.run(`
      INSERT OR REPLACE INTO frontier_v2 (
        url, platform, status, attempts, fetch_interval_sec, next_fetch_at, discovered_at, updated_at
      ) VALUES (?, 'booth', 'fetching', 1, 86400, datetime('now'), datetime('now'), datetime('now'));
    `, [url]);

    scheduler.adjustAfterFetch(url, true, "etag-456");

    const row = dbV2.query("SELECT fetch_interval_sec, status, etag FROM frontier_v2 WHERE url = ?;").get(url) as any;
    expect(row.status).toBe("done");
    expect(row.fetch_interval_sec).toBe(Math.round(86400 / 1.5)); // 57600
    expect(row.etag).toBe("etag-456");
  });

  it("re-queues expired URLs into pending status", () => {
    const url = "https://booth.pm/test-expired";
    const pastTime = "1970-01-01T00:00:00.000Z";
    dbV2.run(`
      INSERT OR REPLACE INTO frontier_v2 (
        url, platform, status, attempts, fetch_interval_sec, next_fetch_at, discovered_at, updated_at
      ) VALUES (?, 'booth', 'done', 1, 86400, ?, ?, ?);
    `, [url, pastTime, pastTime, pastTime]);

    const count = scheduler.requeueStaleUrls(10);
    expect(count).toBeGreaterThanOrEqual(1);

    const rowV2 = dbV2.query("SELECT status FROM frontier_v2 WHERE url = ?;").get(url) as any;
    expect(rowV2.status).toBe("pending");

    // Verify two-way synchronization to legacy frontier
    const rowV1 = dbV2.query("SELECT status FROM frontier WHERE url = ?;").get(url) as any;
    if (rowV1) {
      expect(rowV1.status).toBe("pending");
    }
  });
});
