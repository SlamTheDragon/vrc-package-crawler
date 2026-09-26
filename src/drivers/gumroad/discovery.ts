import { CONFIG } from "../../config.ts";
import { logger } from "../../logger.ts";
import { db, CrawlerDB, type EntityRecord } from "../../db.ts";
import { rateLimiter, circuitBreaker } from "../../ratelimit.ts";
import { RelevanceFilter } from "../../filter.ts";
import { CuratedDriver } from "../curated";
import { cleanTitle, cleanAuthorName, cleanDescription } from "../../utils/sanitizer.ts";
import type { DriverRuntime } from "./runtime.ts";

// Crawls a Gumroad Discover search query page with exponential backoff & dynamic pacing
  export async function crawlDiscoverQuery(runtime: DriverRuntime, query: string, page: number = 1, customDb?: CrawlerDB): Promise<{ productsCount: number; sellersFound: string[]; savedCount?: number }> {
    const targetDb = customDb || db;
    if (runtime.isAborted || targetDb.isClosed) return { productsCount: 0, sellersFound: [] };
    const key = "gumroad:discover";

    // Circuit breaker check (Task 2.7)
    if (!circuitBreaker.canExecute("gumroad.com")) {
      const waitMs = circuitBreaker.getRemainingBackoffMs("gumroad.com");
      logger.info(`[Gumroad:Discover] Circuit breaker OPEN for gumroad.com. Skipping query '${query}' for ${(waitMs / 1000).toFixed(0)}s.`);
      return { productsCount: 0, sellersFound: [] };
    }

    // Wait if currently in backoff from previous 429
    if (rateLimiter.isBackingOff(key)) {
      const waitMs = rateLimiter.getRemainingBackoffMs(key);
      logger.info(`[Gumroad:Discover] Endpoint is currently in backoff. Skipping query '${query}' for ${(waitMs / 1000).toFixed(0)}s.`);
      return { productsCount: 0, sellersFound: [] };
    }

    const offset = (page - 1) * 36;
    const url = `https://gumroad.com/discover?query=${encodeURIComponent(query)}&from=${offset}`;
    logger.info(`[Gumroad:Discover] Searching '${query}' from offset ${offset} (page ${page})...`);

    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.gumroadDelayMs);
      await runtime.sleep(delay);
      if (runtime.isAborted || db.isClosed) return { productsCount: 0, sellersFound: [] };

      const resp = await fetch(url, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit(key, resp);
        circuitBreaker.recordFailure("gumroad.com", resp.status, "Rate limit / forbidden");
        return { productsCount: 0, sellersFound: [] };
      }

      if (!resp.ok) {
        logger.warn(`[Gumroad:Discover] HTTP ${resp.status} for query '${query}' offset ${offset}`);
        circuitBreaker.recordFailure("gumroad.com", resp.status, `HTTP error ${resp.status}`);
        return { productsCount: 0, sellersFound: [] };
      }

      const html = await resp.text();

      // Cloudflare Managed Challenge & Turnstile detection (Task 2.3)
      // FIXME: relation to TODO 2.3
      if (html.includes("challenges.cloudflare.com/turnstile") || html.includes("cf-mitigated: challenge")) {
        logger.warn(`[AntiBot] Cloudflare Managed Challenge encountered on ${url}. Halting domain crawl.`);
        targetDb.markStatus(url, "blocked", "Cloudflare Turnstile challenge detected", undefined, undefined, 86400 * 3, 403, "Cloudflare Turnstile challenge detected");
        circuitBreaker.trip("gumroad.com", 403, "Cloudflare Turnstile Challenge", 86400 * 3 * 1000);
        return { productsCount: 0, sellersFound: [] };
      }

      // Record success
      rateLimiter.handleSuccess(key, CONFIG.gumroadDelayMs);
      circuitBreaker.recordSuccess("gumroad.com");
      const match = html.match(/data-page="([^"]+)"/);
      if (!match) {
        logger.warn(`[Gumroad:Discover] No data-page found for query '${query}' offset ${offset}`);
        return { productsCount: 0, sellersFound: [] };
      }

      const unescaped = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      const data = JSON.parse(unescaped);
      const sr = data.props?.search_results || {};
      const products = sr.products || [];
      const sellersFound: string[] = [];

      if (products.length === 0) {
        logger.info(`[Gumroad:Discover] Query '${query}' reached end of results at offset ${offset}.`);
        return { productsCount: 0, sellersFound: [] };
      }

      let saved = 0;
      for (const p of products) {
        const permalink = p.permalink || p.id;
        if (!permalink) continue;

        const seller = p.seller || {};
        const sellerName = seller.name || "Gumroad Creator";
        const sellerProfile = seller.profile_url ? seller.profile_url.split("?")[0] : "";

        if (sellerProfile && !sellersFound.includes(sellerProfile)) {
          sellersFound.push(sellerProfile);
          db.queueUrl(sellerProfile, "gumroad");
        }

        const cleanUrl = sellerProfile ? `${sellerProfile}/l/${permalink}` : `https://gumroad.com/l/${permalink}`;
        db.queueUrl(cleanUrl, "gumroad", 10);

        const entity: EntityRecord = {
          id: `gumroad:${permalink}`,
          platform: "gumroad",
          url: cleanUrl,
          title: cleanTitle(p.name || `Tool ${permalink}`),
          author: cleanAuthorName(sellerName),
          price_currency: p.currency_code ? p.currency_code.toUpperCase() : "USD",
          price_amount: p.price_cents ? p.price_cents / 100 : 0,
          description: p.description || `${p.name} on Gumroad by ${sellerName}`,
          tags_json: JSON.stringify(["gumroad", "vrchat", query]),
          external_links_json: JSON.stringify(sellerProfile ? [sellerProfile] : []),
          raw_json: JSON.stringify({
            ratings: p.ratings,
            thumbnail_url: p.thumbnail_url || null,
            // Seed media_urls with the search thumbnail so indexPendingMedia can pick it up
            media_urls: p.thumbnail_url ? [p.thumbnail_url] : [],
            youtube_urls: [],
            filetypes: p.filetypes_data,
            query: query
          })
        };

        const evalRes = RelevanceFilter.evaluate(entity);
        if (evalRes.isRelevant) {
          db.saveEntity(entity);
          saved++;
        } else {
          db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons, entity);
        }

      }

      logger.info(`[Gumroad:Discover] Ingested ${saved}/${products.length} vetted products, queued ${sellersFound.length} creator storefronts for '${query}' offset ${offset}`);
      return { productsCount: products.length, savedCount: saved, sellersFound };
    } catch (e) {
      circuitBreaker.recordFailure("gumroad.com", 0, e instanceof Error ? e.message : String(e));
      logger.error(`[Gumroad:Discover] Error for query '${query}' offset ${offset}`, e);
      return { productsCount: 0, savedCount: 0, sellersFound: [] };
    }
  }
