import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";
import { rateLimiter } from "../ratelimit.ts";
import { RelevanceFilter } from "../filter.ts";
import { CuratedDriver } from "./curated.ts";
import { cleanTitle, cleanAuthorName, cleanDescription } from "../utils/sanitizer.ts";

export class BoothDriver {
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

  // Parses listing card URLs from a category browse page
  static async crawlCategoryPage(pageUrl: string): Promise<string[]> {
    if (this.isAborted || db.isClosed) return [];
    logger.info(`[BOOTH] Crawling category page: ${pageUrl}`);
    try {
      await rateLimiter.waitIfBackoff("booth");
      const delay = rateLimiter.getPacingDelayMs("booth", CONFIG.boothDelayMs);
      await this.sleep(delay);
      if (this.isAborted || db.isClosed) return [];

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
    if (this.isAborted || db.isClosed) return false;
    try {
      await rateLimiter.waitIfBackoff("booth");
      const delay = rateLimiter.getPacingDelayMs("booth", CONFIG.boothDelayMs);
      await this.sleep(delay);
      if (this.isAborted || db.isClosed) return false;

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

      if (resp.url && resp.url !== currentUrl) {
        currentUrl = resp.url;
      }

      const html = await resp.text();
      const finalItemId = itemId || currentUrl;

      // Extract JSON-LD
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      let title = "";
      let author = "Unknown";
      let priceAmount = 0;
      let priceCurrency = "JPY";
      let description = "";
      let ldImage: string | null = null;

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
          // JSON-LD image (Schema.org Product image)
          if (ld.image && typeof ld.image === "string" && ld.image.startsWith("http")) {
            ldImage = ld.image;
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

      // Fallback description from DOM or OpenGraph if JSON-LD description was missing or brief
      if (!description || description.length < 30) {
        const descMatch = html.match(/<div[^>]*class=["'][^"']*(?:item-description|js-item-description|description-text)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        if (descMatch) {
          const domDesc = descMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
          if (domDesc.trim().length > description.length) {
            description = domDesc;
          }
        } else {
          const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
          if (ogDesc && ogDesc[1].trim().length > description.length) {
            description = ogDesc[1];
          }
        }
      }

      // Extract OpenGraph and Twitter Card preview images
      const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      const twImgMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
      const ogImage = ogImgMatch ? ogImgMatch[1] : null;
      const twImage = twImgMatch ? twImgMatch[1] : null;

      // Primary thumbnail: prefer JSON-LD image -> og:image -> twitter:image
      const thumbnailUrl = ldImage || ogImage || twImage || null;

      // Extract gallery images from pximg CDN (the booth image CDN)
      // Only include images with quality-indicative size params (≥200) to filter out icons/thumbnails
      const pximgRaw = html.match(/https:\/\/[a-z0-9.-]*pximg\.net\/[^\s"'<>]+/g) || [];
      const mediaSet = new Set<string>();
      for (const imgUrl of pximgRaw) {
        // Skip tiny icon/thumbnail variants (e.g. /c/32x32/, /c/48x48/, /c/100x100/)
        if (/\/c\/(\d+)x(\d+)\//.test(imgUrl)) {
          const sizeMatch = imgUrl.match(/\/c\/(\d+)x(\d+)\//);
          if (sizeMatch) {
            const dim = Math.min(parseInt(sizeMatch[1], 10), parseInt(sizeMatch[2], 10));
            if (dim < 200) continue; // skip icons and tiny previews
          }
        }
        // Skip avatar images (contain /user-profile/ or /a/)
        if (imgUrl.includes("/user-profile/") || imgUrl.includes("/a/")) continue;
        // Normalize: strip query params
        const cleanImg = imgUrl.split("?")[0];
        mediaSet.add(cleanImg);
      }
      // Always include thumbnail as first media entry if not already present
      if (thumbnailUrl) mediaSet.add(thumbnailUrl.split("?")[0]);
      const mediaUrls = Array.from(mediaSet).slice(0, 20); // cap at 20 gallery items

      // Extract YouTube video URLs (video embeds, watch links, youtu.be short links)
      const ytRaw = html.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})[^\s"'<>]*/gi) || [];
      const ytSet = new Set<string>();
      for (const yt of ytRaw) {
        const match = yt.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
        if (match) {
          ytSet.add(`https://www.youtube.com/watch?v=${match[1]}`);
        }
      }
      const youtubeUrls = Array.from(ytSet);

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

      // Autonomously extract any VPM / registry feeds from page description & links
      CuratedDriver.extractAndQueueRegistries(html);

      // Extract tags
      const tagMatches = html.match(/class="[^"]*tag-name[^"]*"[^>]*>([^<]+)<\/a>/g) || [];
      const tags = tagMatches.map((t) => t.replace(/<[^>]+>/g, "").trim());

      // Extract origin created date from DOM
      let originCreatedAt: string | null = null;
      const createdMatch = html.match(/<div[^>]*class="[^"]*item-created-date[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (createdMatch) {
        const text = createdMatch[1].replace(/<[^>]+>/g, "").trim();
        const d = new Date(text);
        if (!isNaN(d.getTime())) {
          originCreatedAt = d.toISOString();
        }
      }

      const record: EntityRecord = {
        id: `booth:${finalItemId}`,
        platform: "booth",
        url: currentUrl,
        title: cleanTitle(title || `BOOTH Item ${finalItemId}`),
        author: cleanAuthorName(author),
        price_currency: priceCurrency,
        price_amount: priceAmount,
        description: cleanDescription(description),
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        origin_created_at: originCreatedAt,
        raw_json: JSON.stringify({
          itemId: finalItemId, title, author, priceAmount, tags, extLinks, originCreatedAt,
          thumbnail_url: thumbnailUrl,
          media_urls: mediaUrls,
          youtube_urls: youtubeUrls
        })
      };

      const evalRes = RelevanceFilter.evaluate(record);
      if (evalRes.isRelevant) {
        db.saveEntity(record);
        logger.info(`[BOOTH] Ingested: [${finalItemId}] ${title.slice(0, 50)} by ${author} (Score: ${evalRes.score}, Media: ${mediaUrls.length} imgs, ${youtubeUrls.length} vids)`);
      } else {
        db.quarantineEntity(record.id, record.platform, record.url, record.title, record.author, evalRes.reasons, record);
        logger.info(`[BOOTH] Quarantined: [${finalItemId}] ${title.slice(0, 50)} (${evalRes.reasons.join(", ")})`);
      }

      return true;

    } catch (e) {
      logger.error(`[BOOTH] Error processing item ${itemUrl}`, e);
      return false;
    }
  }
}
