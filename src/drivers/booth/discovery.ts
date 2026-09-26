import { CONFIG } from "../../config.ts";
import { logger } from "../../logger.ts";
import { db, type EntityRecord, type CrawlerDB } from "../../db.ts";
import { rateLimiter } from "../../ratelimit.ts";
import { RelevanceFilter } from "../../filter.ts";
import { CuratedDriver } from "../curated";
import { cleanTitle, cleanAuthorName, cleanDescription } from "../../utils/sanitizer.ts";
import type { DriverRuntime } from "./runtime.ts";

// Parses listing card URLs from a category browse page
  export async function crawlCategoryPage(runtime: DriverRuntime, pageUrl: string): Promise<string[]> {
    if (runtime.isAborted || db.isClosed) return [];
    logger.info(`[BOOTH] Crawling category page: ${pageUrl}`);
    try {
      await rateLimiter.waitIfBackoff("booth");
      const delay = rateLimiter.getPacingDelayMs("booth", CONFIG.boothDelayMs);
      await runtime.sleep(delay);
      if (runtime.isAborted || db.isClosed) return [];

      const resp = await fetch(pageUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
        }
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit("booth", resp);
        return [];
      }

      // 404 alternative path fallback: try locale swap between /en/ and /ja/
      if (resp.status === 404) {
        const altUrl = pageUrl.includes("/en/browse/")
          ? pageUrl.replace("/en/browse/", "/ja/browse/")
          : pageUrl.includes("/ja/browse/")
          ? pageUrl.replace("/ja/browse/", "/en/browse/")
          : "";
        if (altUrl) {
          logger.info(`[BOOTH] Category 404 on ${pageUrl}, testing alternative path: ${altUrl}`);
          await runtime.sleep(delay);
          const altResp = await fetch(altUrl, {
            headers: {
              "User-Agent": CONFIG.userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
            }
          });
          if (altResp.ok) {
            logger.info(`[BOOTH] Alternative category path resolved successfully: ${altUrl}`);
            return crawlCategoryPage(runtime, altUrl);
          }
        }
        logger.warn(`[BOOTH] Category HTTP 404 for ${pageUrl} (no alternative paths succeeded)`);
        return [];
      }

      if (!resp.ok) {
        logger.error(`[BOOTH] Category HTTP Error ${resp.status} for ${pageUrl}`);
        return [];
      }

      rateLimiter.handleSuccess("booth", CONFIG.boothDelayMs);

      const html = await resp.text();
      const itemMatches = html.match(/\/items\/(\d+)/g) || [];
      const itemIds = new Set<string>();

      for (const m of itemMatches) {
        const match = m.match(/\/items\/(\d+)/);
        if (match) itemIds.add(match[1]);
      }

      const itemUrls = Array.from(itemIds).map((id) => `https://booth.pm/ja/items/${id}`);
      logger.info(`[BOOTH] Found ${itemUrls.length} items on ${pageUrl}`);
      return itemUrls;
    } catch (e) {
      logger.error(`[BOOTH] Exception fetching category ${pageUrl}`, e);
      return [];
    }
  }
