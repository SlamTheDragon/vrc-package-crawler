import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord, type CrawlerDB } from "../db.ts";
import { rateLimiter } from "../ratelimit.ts";
import { RelevanceFilter } from "../filter.ts";
import { cleanTitle, cleanAuthorName, cleanDescription } from "../utils/sanitizer.ts";

export class ItchDriver {
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

  // Crawls an Itch browse or search results page
  static async crawlBrowsePage(browseUrl: string): Promise<string[]> {
    if (this.isAborted || db.isClosed) return [];
    const key = "itch";
    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Itch:Browse] Fetching browse page: ${browseUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, 1500);
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
  static async crawlProduct(
    productUrl: string,
    customDb?: CrawlerDB,
    etag?: string | null,
    lastModified?: string | null
  ): Promise<boolean | { success: boolean; notModified?: boolean; etag?: string | null; lastModified?: string | null }> {
    const targetDb = customDb || db;
    if (this.isAborted || targetDb.isClosed) return false;
    const key = "itch";
    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Itch:Product] Inspecting product: ${productUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, 1500);
      await this.sleep(delay);
      if (this.isAborted || targetDb.isClosed) return false;

      let currentUrl = productUrl;
      const reqHeaders: Record<string, string> = {
        "User-Agent": CONFIG.userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      };
      if (etag) reqHeaders["If-None-Match"] = etag;
      if (lastModified) reqHeaders["If-Modified-Since"] = lastModified;

      let resp = await fetch(currentUrl, {
        headers: reqHeaders
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit(key, resp);
        return false;
      }

      if (resp.status === 304) {
        logger.info(`[Itch] HTTP 304 Not Modified for ${currentUrl}`);
        rateLimiter.handleSuccess(key, 1500);
        return {
          success: true,
          notModified: true,
          etag: resp.headers.get("etag") || etag,
          lastModified: resp.headers.get("last-modified") || lastModified
        };
      }

      // 404 alternative path fallback: probe creator profile or Itch search
      if (resp.status === 404) {
        const m = currentUrl.match(/https?:\/\/([^.]+)\.itch\.io\/([^/?#]+)/);
        const creator = m ? m[1] : "";
        const slug = m ? m[2] : "";

        if (creator && slug) {
          logger.info(`[Itch:Product] Product 404 on ${currentUrl}. Probing creator storefront: https://${creator}.itch.io...`);
          await this.sleep(1000);
          try {
            const authorResp = await fetch(`https://${creator}.itch.io`, {
              headers: { "User-Agent": CONFIG.userAgent }
            });
            if (authorResp.ok) {
              const authorHtml = await authorResp.text();
              const foundLinks = authorHtml.match(new RegExp(`https://${creator}\\.itch\\.io/[a-zA-Z0-9_-]+`, "g")) || [];
              const similar = foundLinks.find((l) => l.toLowerCase().includes(slug.toLowerCase().slice(0, 5)));
              if (similar && similar !== currentUrl) {
                logger.info(`[Itch:Product] Alternative path resolved on creator profile: ${similar}`);
                return this.crawlProduct(similar);
              }
            }
          } catch (_) {}

          // Search fallback
          logger.info(`[Itch:Product] Probing alternative path via search for "${slug}"...`);
          const searchUrls = await this.crawlBrowsePage(`https://itch.io/search?q=${encodeURIComponent(slug.replace(/[-_]/g, " "))}`);
          if (searchUrls.length > 0) {
            logger.info(`[Itch:Product] Discovered ${searchUrls.length} alternative paths via search`);
            return this.crawlProduct(searchUrls[0]);
          }
        }
      }

      if (!resp.ok) {
        logger.warn(`[Itch:Product] HTTP ${resp.status} for ${currentUrl} (all alternative paths failed)`);
        return false;
      }

      rateLimiter.handleSuccess(key, 1500);

      if (resp.url && resp.url !== currentUrl) {
        currentUrl = resp.url;
      }

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
        title = currentUrl.split("?")[0].split("/").pop() || "Itch Tool";
      }

      // Extract creator from subdomain or author link
      const subMatch = currentUrl.match(/https?:\/\/([^.]+)\.itch\.io/);
      const creator = subMatch ? subMatch[1] : "Itch Creator";

      // Extract description
      const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
      let desc = ogDesc ? ogDesc[1].trim() : "";
      const descBlock = html.match(/<div[^>]*class=["'][^"']*\bformatted_description\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (descBlock) {
        const fullDesc = descBlock[1].replace(/<br\s*\/?>/gi, "\n").replace(/<p[^>]*>/gi, "\n\n").replace(/<[^>]+>/g, " ");
        if (fullDesc.trim().length > desc.length) {
          desc = fullDesc;
        }
      }

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

      // Extract published date if available
      let originCreatedAt: string | null = null;
      const dateMatch = html.match(/(?:itemprop=["']datePublished["']|property=["']article:published_time["'])\s+content=["'](.*?)["']/i) ||
                        html.match(/<abbr\s+class=["']date["'][^>]*title=["'](.*?)["']/i);
      if (dateMatch && dateMatch[1]) {
        try {
          originCreatedAt = new Date(dateMatch[1]).toISOString();
        } catch (_) {}
      }

      // Extract og:image and twitter:image for primary thumbnail
      const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      const twImgMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
      const thumbnailUrl: string | null = (ogImgMatch ? ogImgMatch[1] : null) || (twImgMatch ? twImgMatch[1] : null) || null;

      // Extract itch.zone screenshot/cover images (quality-filtered)
      // Itch.io CDN URLs like: https://img.itch.zone/aW1nLzE4Nzk5MjgxLnBuZw==/508x254%23mb/xxxx.png
      const itchImgRaw = html.match(/https:\/\/img\.itch\.zone\/[^\s"'<>]+/g) || [];
      const mediaSet = new Set<string>();
      for (const imgUrl of itchImgRaw) {
        // Parse size hints from URL path (e.g. /32x32%23/, /508x254%23mb/, /original/)
        const sizeMatch = imgUrl.match(/\/(\d+)x(\d+)/);
        if (sizeMatch) {
          const w = parseInt(sizeMatch[1], 10);
          const h = parseInt(sizeMatch[2], 10);
          // Skip icon/favicon-sized images (under 200px in both dimensions)
          if (Math.min(w, h) < 200) continue;
        }
        // Skip avatar/profile images (typically /a/ path or small icon slugs)
        if (imgUrl.includes("/a/")) continue;
        const cleanImg = imgUrl.split("?")[0];
        mediaSet.add(cleanImg);
      }
      if (thumbnailUrl) mediaSet.add(thumbnailUrl.split("?")[0]);
      const mediaUrls = Array.from(mediaSet).slice(0, 20);

      // Extract YouTube video URLs
      const ytRaw = html.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})[^\s"'<>]*/gi) || [];
      const ytSet = new Set<string>();
      for (const yt of ytRaw) {
        const match = yt.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
        if (match) {
          ytSet.add(`https://www.youtube.com/watch?v=${match[1]}`);
        }
      }
      const youtubeUrls = Array.from(ytSet);

      if (currentUrl !== productUrl && !extLinks.includes(productUrl)) {
        extLinks.push(productUrl);
      }

      const entity: EntityRecord = {
        id: `itch:${creator}/${currentUrl.split("?")[0].split("/").pop()}`,
        platform: "itch",
        url: currentUrl,
        title: cleanTitle(title),
        author: cleanAuthorName(creator),
        price_currency: "USD",
        price_amount: 0,
        description: cleanDescription(desc || `${title} on Itch.io by ${creator}`),
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        origin_created_at: originCreatedAt,
        raw_json: JSON.stringify({
          creator, title, extLinks, tags, originCreatedAt,
          thumbnail_url: thumbnailUrl,
          media_urls: mediaUrls,
          youtube_urls: youtubeUrls
        })
      };

      const evalRes = RelevanceFilter.evaluate(entity);
      if (evalRes.isRelevant) {
        db.saveEntity(entity);
        logger.info(`[Itch:Product] Ingested: ${title.slice(0, 50)} by ${creator} (Score: ${evalRes.score}, Media: ${mediaUrls.length} imgs, ${youtubeUrls.length} yt)`);
      } else {
        db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons, entity);
        logger.info(`[Itch:Product] Quarantined: ${title.slice(0, 50)} (${evalRes.reasons.join(", ")})`);
      }


      return true;

    } catch (e) {
      logger.error(`[Itch:Product] Error inspecting ${productUrl}`, e);
      return false;
    }
  }
}
