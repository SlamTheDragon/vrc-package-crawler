import { db } from "../db.ts";
import { logger } from "../logger.ts";

export class PoissonScheduler {
  private readonly MIN_INTERVAL_SEC = 6 * 3600;      // 6 hours minimum re-crawl
  private readonly MAX_INTERVAL_SEC = 30 * 86400;    // 30 days maximum interval for static pages
  private readonly DEFAULT_INTERVAL_SEC = 24 * 3600; // 24 hours initial interval

  /**
   * Evaluates URLs in the observation lake / frontier that have expired their
   * Poisson freshness window and re-enqueues them as 'pending'.
   */
  public requeueStaleUrls(limit: number = 50): number {
    const now = new Date().toISOString();
    try {
      const rows = db.query(`
        SELECT url, platform, fetch_interval_sec, attempts
        FROM frontier
        WHERE (status = 'done' OR (status = 'failed' AND attempts < 5))
          AND next_fetch_at <= ?
        ORDER BY next_fetch_at ASC
        LIMIT ?;
      `).all(now, limit) as any[];

      if (rows.length === 0) return 0;

      const updateStmt = db.prepare(`
        UPDATE frontier
        SET status = 'pending', updated_at = ?
        WHERE url = ?;
      `);
      db.transaction(() => {
        for (const r of rows) {
          updateStmt.run(now, r.url);
        }
      })();

      logger.info(`[PoissonScheduler] Re-queued ${rows.length} stale URLs for adaptive freshness re-crawl.`);
      return rows.length;
    } catch (err) {
      logger.error("[PoissonScheduler] Error while re-queuing stale URLs", err);
      return 0;
    }
  }

  /**
   * Adjusts the next re-crawl interval based on observed resource mutability (Cho-Garcia-Molina model).
   */
  public adjustAfterFetch(
    url: string,
    isModified: boolean,
    etag?: string | null,
    lastModifiedHeader?: string | null
  ) {
    const now = new Date().toISOString();
    try {
      const row = db.query("SELECT fetch_interval_sec FROM frontier WHERE url = ?;").get(url) as any;
      const currentInterval = row?.fetch_interval_sec || this.DEFAULT_INTERVAL_SEC;

      let nextInterval: number;
      if (isModified) {
        // Resource changed: shorten interval to capture updates faster (divide by 1.5)
        nextInterval = Math.max(this.MIN_INTERVAL_SEC, Math.round(currentInterval / 1.5));
      } else {
        // Resource unchanged (e.g. HTTP 304): expand interval via exponential backoff (multiply by 1.5)
        nextInterval = Math.min(this.MAX_INTERVAL_SEC, Math.round(currentInterval * 1.5));
      }

      const nextFetchAt = new Date(Date.now() + nextInterval * 1000).toISOString();

      db.run(`
        UPDATE frontier
        SET status = 'done',
            etag = COALESCE(?, etag),
            last_modified = COALESCE(?, last_modified),
            fetch_interval_sec = ?,
            last_fetched_at = ?,
            next_fetch_at = ?,
            updated_at = ?
        WHERE url = ?;
      `, [etag, lastModifiedHeader, nextInterval, now, nextFetchAt, now, url]);
    } catch (err) {
      logger.error(`[PoissonScheduler] Failed to adjust schedule for ${url}`, err);
    }
  }
}

export const poissonScheduler = new PoissonScheduler();
