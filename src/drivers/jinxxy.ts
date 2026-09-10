import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";

export class JinxxyDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Keywords that identify tools, scripts, shaders, systems, and utilities
  private static TOOL_KEYWORDS = [
    "tool", "tools", "script", "scripts", "system", "systems", "udon", "udonsharp",
    "vrcfury", "modular", "avatar-dynamics", "osc", "camera", "editor", "prefab",
    "shader", "shaders", "physics", "setup", "constraint", "flight", "protect",
    "xray", "gizmo", "rig", "pose", "toggles", "menu", "audio", "audiolink", "vpm"
  ];

  // Crawls a curated marketplace category or tag URL
  static async crawlBrowsePage(browseUrl: string): Promise<string[]> {
    logger.info(`[Jinxxy:Browse] Fetching browse page: ${browseUrl}`);
    try {
      await this.sleep(CONFIG.jinxxyDelayMs);

      const resp = await fetch(browseUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (!resp.ok) {
        logger.warn(`[Jinxxy:Browse] HTTP ${resp.status} for ${browseUrl}`);
        return [];
      }

      const html = await resp.text();
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
        if (!discoveredUrls.includes(fullUrl)) {
          discoveredUrls.push(fullUrl);
        }
      }

      logger.info(`[Jinxxy:Browse] Found ${discoveredUrls.length} products on ${browseUrl}`);
      return discoveredUrls;
    } catch (e) {
      logger.error(`[Jinxxy:Browse] Error crawling ${browseUrl}`, e);
      return [];
    }
  }

  // Crawls an individual Jinxxy product page
  static async crawlProduct(productUrl: string): Promise<boolean> {
    logger.info(`[Jinxxy:Product] Inspecting: ${productUrl}`);
    try {
      await this.sleep(CONFIG.jinxxyDelayMs);

      const resp = await fetch(productUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (!resp.ok) {
        logger.warn(`[Jinxxy:Product] HTTP ${resp.status} for ${productUrl}`);
        return false;
      }

      const html = await resp.text();

      // Extract title
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      let title = titleMatch ? titleMatch[1].replace(/\s*-\s*Jinxxy\s*$/i, "").trim() : "";
      if (!title) {
        const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
        title = ogTitle ? ogTitle[1].replace(/\s*on\s*Jinxxy\s*$/i, "").trim() : "Jinxxy Product";
      }

      // Extract creator from URL path
      const urlParts = productUrl.replace("https://jinxxy.com/", "").split("/");
      const creatorName = urlParts[0] || "Jinxxy Creator";
      const productSlug = urlParts[1] || "";

      // Extract description
      const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
      const desc = ogDesc ? ogDesc[1].trim() : "";

      // Extract tags
      const tagMatches = html.match(/href="\/market\/browse\?tags=([^"&]+)"/g) || [];
      const tags: string[] = ["jinxxy", "vrchat"];
      for (const tm of tagMatches) {
        const tag = tm.replace(/href="\/market\/browse\?tags=/, '').replace('"', '');
        if (tag && !tags.includes(tag)) {
          tags.push(decodeURIComponent(tag));
        }
      }

      // Extract external links (Gumroad, Payhip, Booth, GitHub)
      const extLinks: string[] = [];
      const hrefs = html.match(/href="(https?:\/\/[^"]+)"/g) || [];

      for (const h of hrefs) {
        const rawHref = h.replace('href="', '').replace('"', '');
        if (rawHref.includes("gumroad.com")) {
          // Cross-feed into Gumroad crawler!
          const cleanGumroad = rawHref.split("?")[0];
          db.queueUrl(cleanGumroad, "gumroad");
          if (!extLinks.includes(cleanGumroad)) extLinks.push(cleanGumroad);
        } else if (rawHref.includes("github.com/")) {
          // Cross-feed into GitHub crawler!
          const cleanGh = rawHref.split("?")[0];
          db.queueUrl(cleanGh, "github");
          if (!extLinks.includes(cleanGh)) extLinks.push(cleanGh);
        } else if (rawHref.includes("booth.pm")) {
          // Cross-feed into Booth crawler!
          const cleanBooth = rawHref.split("?")[0];
          db.queueUrl(cleanBooth, "booth");
          if (!extLinks.includes(cleanBooth)) extLinks.push(cleanBooth);
        } else if (rawHref.includes("payhip.com")) {
          if (!extLinks.includes(rawHref)) extLinks.push(rawHref);
        }
      }

      const entity: EntityRecord = {
        id: `jinxxy:${creatorName}/${productSlug}`,
        platform: "jinxxy",
        url: productUrl,
        title: title,
        author: creatorName,
        price_currency: "USD",
        price_amount: 0,
        description: desc,
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        raw_json: JSON.stringify({
          creator: creatorName,
          slug: productSlug,
          tags: tags,
          extLinks: extLinks
        })
      };

      db.saveEntity(entity);
      logger.info(`[Jinxxy:Product] Ingested: ${title.slice(0, 50)} by ${creatorName} (Cross-links: ${extLinks.length})`);
      return true;
    } catch (e) {
      logger.error(`[Jinxxy:Product] Error inspecting ${productUrl}`, e);
      return false;
    }
  }

  // Scans Jinxxy sitemaps 59-65 for tool-related product URLs
  static async scanSitemapForTools(sitemapIdx: number): Promise<string[]> {
    const sitemapUrl = `https://jinxxy.com/sitemaps/sitemap${sitemapIdx}.xml`;
    logger.info(`[Jinxxy:Sitemap] Scanning sitemap ${sitemapIdx} for tools...`);

    try {
      await this.sleep(500);
      const resp = await fetch(sitemapUrl, {
        headers: { "User-Agent": CONFIG.userAgent }
      });

      if (!resp.ok) return [];

      const xml = await resp.text();
      const locMatches = xml.match(/<loc>(https:\/\/jinxxy\.com\/[^<]+)<\/loc>/g) || [];
      const toolUrls: string[] = [];

      for (const loc of locMatches) {
        const u = loc.replace("<loc>", "").replace("</loc>", "");
        const path = u.replace("https://jinxxy.com/", "");
        const slashCount = (path.match(/\//g) || []).length;
        if (slashCount !== 1) continue;

        // Check if slug contains tool keywords
        const lower = path.toLowerCase();
        if (this.TOOL_KEYWORDS.some((kw) => lower.includes(kw))) {
          toolUrls.push(u);
        }
      }

      logger.info(`[Jinxxy:Sitemap] Discovered ${toolUrls.length} tool-matching URLs in sitemap ${sitemapIdx}`);
      return toolUrls;
    } catch (e) {
      logger.error(`[Jinxxy:Sitemap] Error scanning sitemap ${sitemapIdx}`, e);
      return [];
    }
  }
}
