import { CONFIG } from "../../config.ts";
import { logger } from "../../logger.ts";
import { db, type EntityRecord, type CrawlerDB } from "../../db.ts";
import { rateLimiter } from "../../ratelimit.ts";
import { RelevanceFilter } from "../../filter.ts";
import { cleanTitle, cleanAuthorName, cleanDescription } from "../../utils/sanitizer.ts";
import type { DriverRuntime } from "./runtime.ts";

// Crawls an Itch browse or search results page
  export async function crawlBrowsePage(runtime: DriverRuntime, browseUrl: string): Promise<string[]> {
    if (runtime.isAborted || db.isClosed) return [];
    const key = "itch";
    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Itch:Browse] Fetching browse page: ${browseUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, 1500);
      await runtime.sleep(delay);
      if (runtime.isAborted || db.isClosed) return [];

      const resp = await fetch(browseUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit(key, resp);
        return [];
      }

      if (!resp.ok) {
        logger.warn(`[Itch:Browse] HTTP ${resp.status} for ${browseUrl}`);
        return [];
      }

      rateLimiter.handleSuccess(key, 1500);

      const html = await resp.text();
      // Match product card links: href="https://username.itch.io/game-title"
      const matches = html.match(/href="(https:\/\/[a-zA-Z0-9_-]+\.itch\.io\/[a-zA-Z0-9_-]+)"/g) || [];
      const discoveredUrls: string[] = [];

      for (const m of matches) {
        const u = m.replace('href="', '').replace('"', '');
        if (
          !u.includes(".itch.io/tag-") &&
          !u.includes("/community") &&
          !u.includes("/devlog") &&
          !discoveredUrls.includes(u)
        ) {
          discoveredUrls.push(u);
        }
      }

      logger.info(`[Itch:Browse] Found ${discoveredUrls.length} candidate products on ${browseUrl}`);
      return discoveredUrls;
    } catch (e) {
      logger.error(`[Itch:Browse] Error crawling browse page ${browseUrl}`, e);
      return [];
    }
  }
