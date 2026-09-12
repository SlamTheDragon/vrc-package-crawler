import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";
import { rateLimiter } from "../ratelimit.ts";
import { RelevanceFilter } from "../filter.ts";

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

      // 404 alternative path fallback: try locale swap between /en/ and /ja/
      if (resp.status === 404) {
        const altUrl = pageUrl.includes("/en/browse/")
          ? pageUrl.replace("/en/browse/", "/ja/browse/")
          : pageUrl.includes("/ja/browse/")
          ? pageUrl.replace("/ja/browse/", "/en/browse/")
          : "";
        if (altUrl) {
          logger.info(`[BOOTH] Category 404 on ${pageUrl}, testing alternative path: ${altUrl}`);
          await this.sleep(delay);
          const altResp = await fetch(altUrl, {
            headers: {
              "User-Agent": CONFIG.userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
            }
          });
          if (altResp.ok) {
            logger.info(`[BOOTH] Alternative category path resolved successfully: ${altUrl}`);
            return this.crawlCategoryPage(altUrl);
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

  // Scrapes an individual item page and extracts Schema.org JSON-LD with 404 alternative path fallback
  static async crawlItemDetail(itemUrl: string): Promise<boolean> {
    try {
      await rateLimiter.waitIfBackoff("booth");
      const delay = rateLimiter.getPacingDelayMs("booth", CONFIG.boothDelayMs);
      await this.sleep(delay);

      let currentUrl = itemUrl;
      let resp = await fetch(currentUrl, {
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

      // 404 alternative path fallback: probe canonical /ja/, /en/, and root /items/
      const itemIdMatch = currentUrl.match(/items\/(\d+)/);
      const itemId = itemIdMatch ? itemIdMatch[1] : "";

      if (resp.status === 404 && itemId) {
        const fallbacks = [
          `https://booth.pm/ja/items/${itemId}`,
          `https://booth.pm/en/items/${itemId}`,
          `https://booth.pm/items/${itemId}`
        ].filter((u) => u !== currentUrl);

        for (const altUrl of fallbacks) {
          logger.info(`[BOOTH] Item 404 on ${currentUrl}, probing alternative path: ${altUrl}`);
          await this.sleep(CONFIG.boothDelayMs);
          const altResp = await fetch(altUrl, {
            headers: {
              "User-Agent": CONFIG.userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
            }
          });
          if (altResp.ok) {
            logger.info(`[BOOTH] Alternative item path resolved: ${altUrl}`);
            resp = altResp;
            currentUrl = altUrl;
            break;
          }
        }
      }

      if (!resp.ok) {
        logger.warn(`[BOOTH] Item HTTP ${resp.status} for ${currentUrl} (all alternative paths failed)`);
        return false;
      }

      rateLimiter.handleSuccess("booth", CONFIG.boothDelayMs);

      const html = await resp.text();
      const finalItemId = itemId || currentUrl;

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
        id: `booth:${finalItemId}`,
        platform: "booth",
        url: currentUrl,
        title: title || `BOOTH Item ${finalItemId}`,
        author: author,
        price_currency: priceCurrency,
        price_amount: priceAmount,
        description: description,
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        raw_json: JSON.stringify({ itemId: finalItemId, title, author, priceAmount, tags, extLinks })
      };

      const evalRes = RelevanceFilter.evaluate(record);
      if (evalRes.isRelevant) {
        db.saveEntity(record);
        logger.info(`[BOOTH] Ingested: [${finalItemId}] ${title.slice(0, 50)} by ${author} (Score: ${evalRes.score})`);
      } else {
        db.quarantineEntity(record.id, record.platform, record.url, record.title, record.author, evalRes.reasons);
        logger.info(`[BOOTH] Quarantined: [${finalItemId}] ${title.slice(0, 50)} (${evalRes.reasons.join(", ")})`);
      }
      return true;
    } catch (e) {
      logger.error(`[BOOTH] Error processing item ${itemUrl}`, e);
      return false;
    }
  }
}
