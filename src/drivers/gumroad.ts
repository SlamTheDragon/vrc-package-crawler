import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";

export class GumroadDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async crawlProduct(productUrl: string): Promise<boolean> {
    logger.info(`[Gumroad] Fetching product: ${productUrl}`);
    try {
      await this.sleep(2000);

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

      // Extract author from subdomain if present (e.g. architechvr.gumroad.com)
      const subMatch = productUrl.match(/https?:\/\/([^.]+)\.gumroad\.com/);
      let author = subMatch ? subMatch[1] : "Gumroad Creator";

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
        author: author,
        description: desc,
        tags_json: JSON.stringify(["gumroad", "vrchat"]),
        external_links_json: JSON.stringify(extLinks),
        raw_json: JSON.stringify({ slug, title, author, desc, extLinks })
      };

      db.saveEntity(entity);
      logger.info(`[Gumroad] Ingested: ${title.slice(0, 50)} by ${author}`);
      return true;
    } catch (e) {
      logger.error(`[Gumroad] Error crawling product ${productUrl}`, e);
      return false;
    }
  }
}
