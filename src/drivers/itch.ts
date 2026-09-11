import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";
import { rateLimiter } from "../ratelimit.ts";
import { RelevanceFilter } from "../filter.ts";

export class ItchDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Crawls an Itch browse or search results page
  static async crawlBrowsePage(browseUrl: string): Promise<string[]> {
    const key = "itch";
    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Itch:Browse] Fetching browse page: ${browseUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, 1500);
      await this.sleep(delay);

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

  // Scrapes an individual Itch product page
  static async crawlProduct(productUrl: string): Promise<boolean> {
    const key = "itch";
    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Itch:Product] Inspecting product: ${productUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, 1500);
      await this.sleep(delay);

      const resp = await fetch(productUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit(key, resp);
        return false;
      }

      if (!resp.ok) {
        logger.warn(`[Itch:Product] HTTP ${resp.status} for ${productUrl}`);
        return false;
      }

      rateLimiter.handleSuccess(key, 1500);

      const html = await resp.text();

      // Extract title from <title> or og:title
      let title = "";
      const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
      if (ogTitle && ogTitle[1]) {
        title = ogTitle[1].replace(/by\s+.*$/i, "").trim();
      }
      if (!title) {
        const tm = html.match(/<title>(.*?)<\/title>/i);
        if (tm && tm[1]) {
          title = tm[1].replace(/\s*by\s+.*$/i, "").replace(/\s*-\s*itch\.io.*$/i, "").trim();
        }
      }
      if (!title) {
        title = productUrl.split("/").pop() || "Itch Tool";
      }

      // Extract creator from subdomain or author link
      const subMatch = productUrl.match(/https?:\/\/([^.]+)\.itch\.io/);
      const creator = subMatch ? subMatch[1] : "Itch Creator";

      // Extract description
      const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
      const desc = ogDesc ? ogDesc[1].trim() : "";

      // Extract tags
      const tags: string[] = ["itch", "vrchat"];
      const tagMatches = html.match(/href="https:\/\/itch\.io\/[^\/]+\/tag-([^"]+)"/g) || [];
      for (const tm of tagMatches) {
        const t = tm.split("/tag-")[1]?.replace(/"$/, "");
        if (t && !tags.includes(t)) tags.push(decodeURIComponent(t));
      }

      // Extract external links (cross-feed GitHub, Gumroad, BOOTH)
      const extLinks: string[] = [];
      const hrefs = html.match(/href="(https?:\/\/[^"]+)"/g) || [];
      for (const h of hrefs) {
        const raw = h.replace('href="', '').replace('"', '').split("?")[0];
        if (raw.includes("github.com/") && !raw.includes("/issues") && !raw.includes("/pulls")) {
          if (!extLinks.includes(raw)) {
            extLinks.push(raw);
            if (RelevanceFilter.isUrlCandidateRelevant(raw, "github")) {
              db.queueUrl(raw, "github");
            }
          }
        } else if (raw.includes("gumroad.com/l/")) {
          if (!extLinks.includes(raw)) {
            extLinks.push(raw);
            if (RelevanceFilter.isUrlCandidateRelevant(raw, "gumroad")) {
              db.queueUrl(raw, "gumroad");
            }
          }
        } else if (raw.includes("booth.pm/ja/items/") || raw.includes("booth.pm/en/items/")) {
          if (!extLinks.includes(raw)) {
            extLinks.push(raw);
            db.queueUrl(raw, "booth");
          }
        }
      }

      const entity: EntityRecord = {
        id: `itch:${creator}/${productUrl.split("/").pop()}`,
        platform: "itch",
        url: productUrl,
        title: title,
        author: creator,
        price_currency: "USD",
        price_amount: 0,
        description: desc || `${title} on Itch.io by ${creator}`,
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        raw_json: JSON.stringify({ creator, title, extLinks, tags })
      };

      const evalRes = RelevanceFilter.evaluate(entity);
      if (evalRes.isRelevant) {
        db.saveEntity(entity);
        logger.info(`[Itch:Product] Ingested: ${title.slice(0, 50)} by ${creator} (Score: ${evalRes.score})`);
      } else {
        db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons);
        logger.info(`[Itch:Product] Quarantined: ${title.slice(0, 50)} (${evalRes.reasons.join(", ")})`);
      }

      return true;
    } catch (e) {
      logger.error(`[Itch:Product] Error inspecting ${productUrl}`, e);
      return false;
    }
  }
}
