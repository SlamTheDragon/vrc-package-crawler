import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";

export class GumroadDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Crawls an individual product page
  static async crawlProduct(productUrl: string): Promise<boolean> {
    logger.info(`[Gumroad] Fetching product: ${productUrl}`);
    try {
      await this.sleep(CONFIG.gumroadDelayMs);

      const resp = await fetch(productUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (!resp.ok) {
        logger.warn(`[Gumroad] HTTP ${resp.status} for ${productUrl}`);
        return false;
      }

      const html = await resp.text();

      // Extract OpenGraph tags
      const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
      const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/);
      const urlMatch = productUrl.match(/gumroad\.com\/l\/([^/?#]+)/);
      const slug = urlMatch ? urlMatch[1] : productUrl;

      // Extract creator from subdomain (e.g. architechvr.gumroad.com)
      const subMatch = productUrl.match(/https?:\/\/([^.]+)\.gumroad\.com/);
      const creatorName = subMatch ? subMatch[1] : "Gumroad Creator";

      // Queue the creator's root storefront to discover ALL their tools!
      if (subMatch && subMatch[1] !== "www") {
        db.queueUrl(`https://${subMatch[1]}.gumroad.com`, "gumroad");
      }

      const title = ogTitleMatch ? ogTitleMatch[1].trim() : `Gumroad Product ${slug}`;
      const desc = ogDescMatch ? ogDescMatch[1].trim() : "";

      // Extract external links (GitHub, BOOTH, Discord)
      const extLinks: string[] = [];
      const ghMatches = html.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g) || [];
      for (const gh of ghMatches) {
        if (!extLinks.includes(gh)) {
          extLinks.push(gh);
          db.queueUrl(gh, "github");
        }
      }

      const entity: EntityRecord = {
        id: `gumroad:${slug}`,
        platform: "gumroad",
        url: productUrl,
        title: title,
        author: creatorName,
        description: desc,
        tags_json: JSON.stringify(["gumroad", "vrchat"]),
        external_links_json: JSON.stringify(extLinks),
        raw_json: JSON.stringify({ slug, title, author: creatorName, desc, extLinks })
      };

      db.saveEntity(entity);
      logger.info(`[Gumroad] Ingested: ${title.slice(0, 50)} by ${creatorName}`);
      return true;
    } catch (e) {
      logger.error(`[Gumroad] Error crawling product ${productUrl}`, e);
      return false;
    }
  }

  // Crawls creator storefront and parses Inertia.js data-page payload
  static async crawlStorefront(storeUrl: string): Promise<boolean> {
    logger.info(`[Gumroad] Spidering creator storefront: ${storeUrl}`);
    try {
      await this.sleep(CONFIG.gumroadDelayMs);

      const resp = await fetch(storeUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (!resp.ok) {
        logger.warn(`[Gumroad] Storefront HTTP ${resp.status} for ${storeUrl}`);
        return false;
      }

      const htmlText = await resp.text();
      const match = htmlText.match(/data-page="([^"]+)"/);
      if (!match) {
        logger.warn(`[Gumroad] No Inertia data-page found on ${storeUrl}`);
        return false;
      }

      // Decode HTML entities
      const unescaped = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      const data = JSON.parse(unescaped);
      const creatorProfile = data.props?.creator_profile || {};
      const creatorName = creatorProfile.name || "Gumroad Creator";
      const sections = data.props?.sections || [];

      let count = 0;
      for (const s of sections) {
        const products = s.search_results?.products || [];
        for (const p of products) {
          if (!p.url) continue;

          // Strip layout query params
          const cleanUrl = p.url.split("?")[0];
          const permalink = p.permalink || cleanUrl.split("/l/")[1] || cleanUrl;

          const entity: EntityRecord = {
            id: `gumroad:${permalink}`,
            platform: "gumroad",
            url: cleanUrl,
            title: p.name || `Tool ${permalink}`,
            author: creatorName,
            price_currency: p.currency_code ? p.currency_code.toUpperCase() : "USD",
            price_amount: p.price_cents ? p.price_cents / 100 : 0,
            description: p.description || `${p.name} on Gumroad by ${creatorName}`,
            tags_json: JSON.stringify(["gumroad", "vrchat"]),
            external_links_json: JSON.stringify([storeUrl]),
            raw_json: JSON.stringify({
              ratings: p.ratings,
              thumbnail_url: p.thumbnail_url,
              filetypes: p.filetypes_data
            })
          };

          db.saveEntity(entity);
          count++;
        }
      }

      logger.info(`[Gumroad] Ingested ${count} products from storefront: ${storeUrl} (${creatorName})`);
      return true;
    } catch (e) {
      logger.error(`[Gumroad] Error parsing storefront ${storeUrl}`, e);
      return false;
    }
  }
}
