import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";
import { rateLimiter } from "../ratelimit.ts";
import { RelevanceFilter } from "../filter.ts";

export class JinxxyDriver {
  private static isAborted = false;

  public static abort() {
    this.isAborted = true;
  }

  public static reset() {
    this.isAborted = false;
  }

  private static async sleep(ms: number) {
    const end = Date.now() + ms;
    while (!this.isAborted && Date.now() < end) {
      const wait = Math.min(100, end - Date.now());
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
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
    if (this.isAborted || db.isClosed) return [];
    const key = "jinxxy";
    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Jinxxy:Browse] Fetching browse page: ${browseUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.jinxxyDelayMs);
      await this.sleep(delay);
      if (this.isAborted || db.isClosed) return [];

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
        logger.warn(`[Jinxxy:Browse] HTTP ${resp.status} for ${browseUrl}`);
        return [];
      }

      rateLimiter.handleSuccess(key, CONFIG.jinxxyDelayMs);

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
        if (!discoveredUrls.includes(fullUrl) && RelevanceFilter.isUrlCandidateRelevant(fullUrl, "jinxxy")) {
          discoveredUrls.push(fullUrl);
        }
      }

      logger.info(`[Jinxxy:Browse] Found ${discoveredUrls.length} candidate products on ${browseUrl}`);
      return discoveredUrls;
    } catch (e) {
      logger.error(`[Jinxxy:Browse] Error crawling ${browseUrl}`, e);
      return [];
    }
  }

  // Crawls an individual Jinxxy product page
  static async crawlProduct(productUrl: string): Promise<boolean> {
    if (this.isAborted || db.isClosed) return false;
    const key = "jinxxy";
    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Jinxxy:Product] Inspecting: ${productUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.jinxxyDelayMs);
      await this.sleep(delay);
      if (this.isAborted || db.isClosed) return false;

      let currentUrl = productUrl;
      let resp = await fetch(currentUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit(key, resp);
        return false;
      }

      // 404 alternative path fallback: probe creator profile or browse search
      if (resp.status === 404) {
        const urlParts = currentUrl.replace("https://jinxxy.com/", "").split("/");
        const creatorName = urlParts[0] || "";
        const productSlug = urlParts[1] || "";

        if (creatorName && productSlug) {
          logger.info(`[Jinxxy:Product] Product 404 on ${currentUrl}. Probing creator profile: https://jinxxy.com/${creatorName}...`);
          await this.sleep(1000);
          try {
            const creatorResp = await fetch(`https://jinxxy.com/${creatorName}`, {
              headers: { "User-Agent": CONFIG.userAgent }
            });
            if (creatorResp.ok) {
              const creatorHtml = await creatorResp.text();
              const foundLinks = creatorHtml.match(new RegExp(`href="/${creatorName}/([A-Za-z0-9_-]+)"`, "g")) || [];
              const similar = foundLinks.find((l) => l.toLowerCase().includes(productSlug.toLowerCase().slice(0, 5)));
              if (similar) {
                const newPath = similar.replace('href="', '').replace('"', '');
                const fullAlt = `https://jinxxy.com${newPath}`;
                if (fullAlt !== currentUrl) {
                  logger.info(`[Jinxxy:Product] Alternative path resolved on creator profile: ${fullAlt}`);
                  return this.crawlProduct(fullAlt);
                }
              }
            }
          } catch (_) {}

          // Search fallback
          logger.info(`[Jinxxy:Product] Probing alternative path via browse search for "${productSlug}"...`);
          const searchUrls = await this.crawlBrowsePage(`https://jinxxy.com/market/browse?query=${encodeURIComponent(productSlug.replace(/[-_]/g, " "))}`);
          if (searchUrls.length > 0) {
            logger.info(`[Jinxxy:Product] Discovered ${searchUrls.length} alternative paths via search`);
            return this.crawlProduct(searchUrls[0]);
          }
        }
      }

      if (!resp.ok) {
        logger.warn(`[Jinxxy:Product] HTTP ${resp.status} for ${currentUrl} (all alternative paths failed)`);
        return false;
      }

      rateLimiter.handleSuccess(key, CONFIG.jinxxyDelayMs);

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

      // Extract published date if available
      let originCreatedAt: string | null = null;
      const dateMatch = html.match(/(?:itemprop=["']datePublished["']|property=["']article:published_time["'])\s+content=["'](.*?)["']/i);
      if (dateMatch && dateMatch[1]) {
        try {
          originCreatedAt = new Date(dateMatch[1]).toISOString();
        } catch (_) {}
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
        origin_created_at: originCreatedAt,
        raw_json: JSON.stringify({
          creator: creatorName,
          slug: productSlug,
          tags: tags,
          extLinks: extLinks,
          originCreatedAt
        })
      };

      const evalRes = RelevanceFilter.evaluate(entity);
      if (evalRes.isRelevant) {
        db.saveEntity(entity);
        logger.info(`[Jinxxy:Product] Ingested: ${title.slice(0, 50)} by ${creatorName} (Score: ${evalRes.score})`);
      } else {
        db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons);
        logger.info(`[Jinxxy:Product] Quarantined: ${title.slice(0, 50)} (${evalRes.reasons.join(", ")})`);
      }
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

        // Check if slug contains tool keywords and passes pre-screening
        const lower = path.toLowerCase();
        if (
          this.TOOL_KEYWORDS.some((kw) => lower.includes(kw)) &&
          RelevanceFilter.isUrlCandidateRelevant(u, "jinxxy")
        ) {
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
