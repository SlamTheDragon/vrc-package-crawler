import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { rateLimiter } from "../ratelimit.ts";

export class BoothDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Parses listing card URLs from a category browse page
  static async crawlCategoryPage(pageUrl: string): Promise<string[]> {
    logger.info(`[BOOTH] Crawling category page: ${pageUrl}`);
    try {
      await rateLimiter.waitIfBackoff("booth");
      const delay = rateLimiter.getPacingDelayMs("booth", CONFIG.boothDelayMs);
      await this.sleep(delay);

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

  // Scrapes an individual item page and extracts Schema.org JSON-LD
  static async crawlItemDetail(itemUrl: string): Promise<boolean> {
    try {
      await rateLimiter.waitIfBackoff("booth");
      const delay = rateLimiter.getPacingDelayMs("booth", CONFIG.boothDelayMs);
      await this.sleep(delay);

      const resp = await fetch(itemUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
        }
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit("booth", resp);
        return false;
      }

      if (!resp.ok) {
        logger.warn(`[BOOTH] Item HTTP ${resp.status} for ${itemUrl}`);
        return false;
      }

      rateLimiter.handleSuccess("booth", CONFIG.boothDelayMs);

      const html = await resp.text();
      const itemIdMatch = itemUrl.match(/items\/(\d+)/);
      const itemId = itemIdMatch ? itemIdMatch[1] : itemUrl;

      // Extract JSON-LD
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      let title = "";
      let author = "Unknown";
      let priceAmount = 0;
      let priceCurrency = "JPY";
      let description = "";

      if (jsonLdMatch) {
        try {
          const ld = JSON.parse(jsonLdMatch[1]);
          title = ld.name || "";
          author = ld.brand?.name || "Unknown";
          description = ld.description || "";
          if (ld.offers) {
            priceCurrency = ld.offers.priceCurrency || "JPY";
            priceAmount = parseFloat(ld.offers.lowPrice || ld.offers.price || "0");
          }
        } catch (err) {
          logger.warn(`[BOOTH] JSON-LD parse failed for ${itemUrl}`);
        }
      }

      // Fallback title regex if JSON-LD was absent
      if (!title) {
        const tm = html.match(/<h2[^>]*class="[^"]*item-name[^"]*"[^>]*>([^<]+)<\/h2>/);
        if (tm) title = tm[1].trim();
      }

      // Extract External Links (GitHub, GitLab, etc.)
      const extLinks: string[] = [];
      const ghMatches = html.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g) || [];
      for (const gh of ghMatches) {
        if (!gh.includes("booth_pm") && !extLinks.includes(gh)) {
          extLinks.push(gh);
          // Queue newly discovered GitHub repository into frontier!
          db.queueUrl(gh, "github");
        }
      }

      // Extract tags
      const tagMatches = html.match(/class="[^"]*tag-name[^"]*"[^>]*>([^<]+)<\/a>/g) || [];
      const tags = tagMatches.map((t) => t.replace(/<[^>]+>/g, "").trim());

      const record: EntityRecord = {
        id: `booth:${itemId}`,
        platform: "booth",
        url: itemUrl,
        title: title || `BOOTH Item ${itemId}`,
        author: author,
        price_currency: priceCurrency,
        price_amount: priceAmount,
        description: description,
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        raw_json: JSON.stringify({ itemId, title, author, priceAmount, tags, extLinks })
      };

      db.saveEntity(record);
      logger.info(`[BOOTH] Ingested: [${itemId}] ${title.slice(0, 50)} by ${author}`);
      return true;
    } catch (e) {
      logger.error(`[BOOTH] Error processing item ${itemUrl}`, e);
      return false;
    }
  }
}
