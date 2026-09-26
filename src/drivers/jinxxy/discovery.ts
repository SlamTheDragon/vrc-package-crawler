import { CONFIG } from "../../config.ts";
import { logger } from "../../logger.ts";
import { db, CrawlerDB, type EntityRecord } from "../../db.ts";
import { rateLimiter, circuitBreaker } from "../../ratelimit.ts";
import { RelevanceFilter } from "../../filter.ts";
import { cleanTitle, cleanAuthorName, cleanDescription } from "../../utils/sanitizer.ts";
import type { DriverRuntime } from "./runtime.ts";

// Crawls a curated marketplace category or tag URL
  export async function crawlBrowsePage(runtime: DriverRuntime, browseUrl: string, customDb?: CrawlerDB): Promise<string[]> {
    const targetDb = customDb || db;
    if (runtime.isAborted || targetDb.isClosed) return [];
    const key = "jinxxy";

    // Circuit breaker check (Task 2.7)
    if (!circuitBreaker.canExecute("jinxxy.com")) {
      const waitMs = circuitBreaker.getRemainingBackoffMs("jinxxy.com");
      logger.info(`[Jinxxy:Browse] Circuit breaker OPEN for jinxxy.com. Skipping ${browseUrl} for ${(waitMs / 1000).toFixed(0)}s.`);
      return [];
    }

    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Jinxxy:Browse] Fetching browse page: ${browseUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.jinxxyDelayMs);
      await runtime.sleep(delay);
      if (runtime.isAborted || targetDb.isClosed) return [];

      const resp = await fetch(browseUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit(key, resp);
        circuitBreaker.recordFailure("jinxxy.com", resp.status, "Rate limit / forbidden");
        return [];
      }

      if (!resp.ok) {
        logger.warn(`[Jinxxy:Browse] HTTP ${resp.status} for ${browseUrl}`);
        circuitBreaker.recordFailure("jinxxy.com", resp.status, `HTTP error ${resp.status}`);
        return [];
      }

      const html = await resp.text();

      // Cloudflare Managed Challenge & Turnstile detection (Task 2.3)
      if (html.includes("challenges.cloudflare.com/turnstile") || html.includes("cf-mitigated: challenge")) {
        logger.warn(`[AntiBot] Cloudflare Managed Challenge encountered on ${browseUrl}. Halting domain crawl.`);
        targetDb.markStatus(browseUrl, "blocked", "Cloudflare Turnstile challenge detected", undefined, undefined, 86400 * 3, 403, "Cloudflare Turnstile challenge detected");
        circuitBreaker.trip("jinxxy.com", 403, "Cloudflare Turnstile Challenge", 86400 * 3 * 1000);
        return [];
      }

      rateLimiter.handleSuccess(key, CONFIG.jinxxyDelayMs);
      circuitBreaker.recordSuccess("jinxxy.com");
      // Match product links: href="/CreatorName/ProductSlug"
      const linkMatches = html.match(/href="\/([A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)"/g) || [];
      const discoveredUrls: string[] = [];

      for (const m of linkMatches) {
        const path = m.replace('href="', '').replace('"', '');
        if (
          path.startsWith("/market/") ||
          path.startsWith("/search/") ||
          path.startsWith("/cdn-cgi/") ||
          path.startsWith("/_next/") ||
          path.startsWith("/my/") ||
          path.startsWith("/cart/") ||
          path.startsWith("/about/") ||
          path.startsWith("/support/")
        ) {
          continue;
        }

        const fullUrl = `https://jinxxy.com${path}`;
        if (!discoveredUrls.includes(fullUrl) && RelevanceFilter.isUrlCandidateRelevant(fullUrl, "jinxxy")) {
          discoveredUrls.push(fullUrl);
        }
      }

      logger.info(`[Jinxxy:Browse] Found ${discoveredUrls.length} candidate products on ${browseUrl}`);
      return discoveredUrls;
    } catch (e) {
      circuitBreaker.recordFailure("jinxxy.com", 0, e instanceof Error ? e.message : String(e));
      logger.error(`[Jinxxy:Browse] Error crawling ${browseUrl}`, e);
      return [];
    }
  }
