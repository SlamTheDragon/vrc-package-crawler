import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, CrawlerDB, type EntityRecord } from "../db.ts";
import { rateLimiter, circuitBreaker } from "../ratelimit.ts";
import { RelevanceFilter } from "../filter.ts";
import { cleanTitle, cleanAuthorName, cleanDescription } from "../utils/sanitizer.ts";

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
  static async crawlBrowsePage(browseUrl: string, customDb?: CrawlerDB): Promise<string[]> {
    const targetDb = customDb || db;
    if (this.isAborted || targetDb.isClosed) return [];
    const key = "jinxxy";

    // Circuit breaker check (Task 2.7)
    if (!circuitBreaker.canExecute("jinxxy.com")) {
      const waitMs = circuitBreaker.getRemainingBackoffMs("jinxxy.com");
      logger.info(`[Jinxxy:Browse] Circuit breaker OPEN for jinxxy.com. Skipping ${browseUrl} for ${(waitMs / 1000).toFixed(0)}s.`);
      return [];
    }

    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Jinxxy:Browse] Fetching browse page: ${browseUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.jinxxyDelayMs);
      await this.sleep(delay);
      if (this.isAborted || targetDb.isClosed) return [];

      const resp = await fetch(browseUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit(key, resp);
        circuitBreaker.recordFailure("jinxxy.com", resp.status, "Rate limit / forbidden");
        return [];
      }

      if (!resp.ok) {
        logger.warn(`[Jinxxy:Browse] HTTP ${resp.status} for ${browseUrl}`);
        circuitBreaker.recordFailure("jinxxy.com", resp.status, `HTTP error ${resp.status}`);
        return [];
      }

      const html = await resp.text();

      // Cloudflare Managed Challenge & Turnstile detection (Task 2.3)
      if (html.includes("challenges.cloudflare.com/turnstile") || html.includes("cf-mitigated: challenge")) {
        logger.warn(`[AntiBot] Cloudflare Managed Challenge encountered on ${browseUrl}. Halting domain crawl.`);
        targetDb.markStatus(browseUrl, "blocked", "Cloudflare Turnstile challenge detected", undefined, undefined, 86400 * 3, 403, "Cloudflare Turnstile challenge detected");
        circuitBreaker.trip("jinxxy.com", 403, "Cloudflare Turnstile Challenge", 86400 * 3 * 1000);
        return [];
      }

      rateLimiter.handleSuccess(key, CONFIG.jinxxyDelayMs);
      circuitBreaker.recordSuccess("jinxxy.com");
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
      circuitBreaker.recordFailure("jinxxy.com", 0, e instanceof Error ? e.message : String(e));
      logger.error(`[Jinxxy:Browse] Error crawling ${browseUrl}`, e);
      return [];
    }
  }

  // Crawls an individual Jinxxy product page
  static async crawlProduct(
    productUrl: string,
    customDb?: CrawlerDB,
    etag?: string | null,
    lastModified?: string | null
  ): Promise<boolean | { success: boolean; notModified?: boolean; etag?: string | null; lastModified?: string | null }> {
    const targetDb = customDb || db;
    if (this.isAborted || targetDb.isClosed) return false;
    const key = "jinxxy";

    // Circuit breaker check (Task 2.7)
    if (!circuitBreaker.canExecute("jinxxy.com")) {
      const waitMs = circuitBreaker.getRemainingBackoffMs("jinxxy.com");
      logger.info(`[Jinxxy:Product] Circuit breaker OPEN for jinxxy.com. Skipping ${productUrl} for ${(waitMs / 1000).toFixed(0)}s.`);
      return false;
    }

    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Jinxxy:Product] Inspecting: ${productUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.jinxxyDelayMs);
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
        circuitBreaker.recordFailure("jinxxy.com", resp.status, "Rate limit / forbidden");
        return false;
      }

      if (resp.status === 304) {
        logger.info(`[Jinxxy] HTTP 304 Not Modified for ${currentUrl}`);
        rateLimiter.handleSuccess(key, CONFIG.jinxxyDelayMs);
        circuitBreaker.recordSuccess("jinxxy.com");
        return {
          success: true,
          notModified: true,
          etag: resp.headers.get("etag") || etag,
          lastModified: resp.headers.get("last-modified") || lastModified
        };
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
        circuitBreaker.recordFailure("jinxxy.com", resp.status, `HTTP error ${resp.status}`);
        return false;
      }

      rateLimiter.handleSuccess(key, CONFIG.jinxxyDelayMs);

      if (resp.url && resp.url !== currentUrl) {
        currentUrl = resp.url;
      }

      const html = await resp.text();

      // Cloudflare Managed Challenge & Turnstile detection (Task 2.3)
      if (html.includes("challenges.cloudflare.com/turnstile") || html.includes("cf-mitigated: challenge")) {
        logger.warn(`[AntiBot] Cloudflare Managed Challenge encountered on ${currentUrl}. Halting domain crawl.`);
        targetDb.markStatus(currentUrl, "blocked", "Cloudflare Turnstile challenge detected", undefined, undefined, 86400 * 3, 403, "Cloudflare Turnstile challenge detected");
        circuitBreaker.trip("jinxxy.com", 403, "Cloudflare Turnstile Challenge", 86400 * 3 * 1000);
        return false;
      }

      circuitBreaker.recordSuccess("jinxxy.com");

      // Extract title
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      let title = titleMatch ? titleMatch[1].replace(/\s*-\s*Jinxxy\s*$/i, "").trim() : "";
      if (!title) {
        const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i);
        title = ogTitle ? ogTitle[1].replace(/\s*on\s*Jinxxy\s*$/i, "").trim() : "Jinxxy Product";
      }

      // Extract creator from URL path
      const urlParts = currentUrl.replace("https://jinxxy.com/", "").split("/");
      const creatorName = urlParts[0] || "Jinxxy Creator";
      const productSlug = urlParts[1] || "";

      // Extract description
      const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i);
      let desc = ogDesc ? ogDesc[1].trim() : "";

      // Extract og:image and twitter:image for primary thumbnail
      const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      const twImgMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
      const ogImage = ogImgMatch ? ogImgMatch[1] : null;
      const twImage = twImgMatch ? twImgMatch[1] : null;

      let thumbnailUrl: string | null = ogImage || twImage || null;
      const mediaSet = new Set<string>();
      const ytSet = new Set<string>();

      // Extract product image gallery from Next.js __NEXT_DATA__ hydration payload
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch) {
        try {
          const nd = JSON.parse(nextDataMatch[1]);
          const p = nd.props?.pageProps?.product || nd.props?.pageProps?.listing;
          if (p) {
            if (p.description || p.details || p.content) {
              const rawPDesc: string = p.description || p.details || p.content;
              const rich = rawPDesc.replace(/<br\s*\/?>/gi, "\n").replace(/<p[^>]*>/gi, "\n\n").replace(/<[^>]+>/g, " ").trim();
              if (rich.length > desc.length) desc = rich;
            }
            // Primary cover / thumbnail
            const cover: string = p.cover || p.thumbnail || p.image || "";
            if (cover && cover.startsWith("http")) {
              thumbnailUrl = thumbnailUrl || cover;
            }
            // Full images array
            const images: any[] = p.images || p.media || [];
            for (const img of images) {
              const imgUrl: string = typeof img === "string" ? img : (img?.url || img?.src || "");
              if (!imgUrl || !imgUrl.startsWith("http")) continue;

              // Filter YouTube / Vimeo / video embeds directly into youtubeUrls rather than image queues
              const ytMatch = imgUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
              if (ytMatch) {
                ytSet.add(`https://www.youtube.com/watch?v=${ytMatch[1]}`);
                continue;
              }
              if (imgUrl.includes("vimeo.com") || img?.type === "video" || img?.type === "oembed") {
                continue;
              }

              // Quality filter: skip images from known icon/logo CDN patterns and those with tiny dimensions
              const w: number = img?.width || 0;
              const h: number = img?.height || 0;
              if (w > 0 && h > 0 && Math.min(w, h) < 200) continue;
              if (imgUrl.includes("/icon") || imgUrl.includes("/logo") || imgUrl.includes("/favicon")) continue;
              mediaSet.add(imgUrl.split("?")[0]);
            }
          }
        } catch (_) {}
      }

      // Filter thumbnail if it happens to be a video embed
      if (thumbnailUrl) {
        const ytMatch = thumbnailUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
        if (ytMatch) {
          ytSet.add(`https://www.youtube.com/watch?v=${ytMatch[1]}`);
          thumbnailUrl = null;
        } else if (thumbnailUrl.includes("vimeo.com")) {
          thumbnailUrl = null;
        }
      }

      // Fallback: add thumbnail to media set if no gallery found
      if (thumbnailUrl) mediaSet.add(thumbnailUrl.split("?")[0]);
      const mediaUrls = Array.from(mediaSet).slice(0, 20);

      // Extract YouTube video URLs
      const ytRaw = html.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})[^\s"'<>]*/gi) || [];
      for (const yt of ytRaw) {
        const match = yt.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
        if (match) {
          ytSet.add(`https://www.youtube.com/watch?v=${match[1]}`);
        }
      }
      const youtubeUrls = Array.from(ytSet);

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

      if (currentUrl !== productUrl && !extLinks.includes(productUrl)) {
        extLinks.push(productUrl);
      }

      const entity: EntityRecord = {
        id: `jinxxy:${creatorName}/${productSlug}`,
        platform: "jinxxy",
        url: currentUrl,
        title: cleanTitle(title),
        author: cleanAuthorName(creatorName),
        price_currency: "USD",
        price_amount: 0,
        description: cleanDescription(desc),
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        origin_created_at: originCreatedAt,
        raw_json: JSON.stringify({
          creator: creatorName,
          slug: productSlug,
          tags: tags,
          extLinks: extLinks,
          originCreatedAt,
          thumbnail_url: thumbnailUrl,
          media_urls: mediaUrls,
          youtube_urls: youtubeUrls
        })
      };

      const evalRes = RelevanceFilter.evaluate(entity);
      if (evalRes.isRelevant) {
        targetDb.saveEntity(entity);
        logger.info(`[Jinxxy:Product] Ingested: ${title.slice(0, 50)} by ${creatorName} (Score: ${evalRes.score}, Media: ${mediaUrls.length} imgs, ${youtubeUrls.length} yt)`);
      } else {
        targetDb.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons, entity);
        logger.info(`[Jinxxy:Product] Quarantined: ${title.slice(0, 50)} (${evalRes.reasons.join(", ")})`);
      }

      return true;
    } catch (e) {
      circuitBreaker.recordFailure("jinxxy.com", 0, e instanceof Error ? e.message : String(e));
      logger.error(`[Jinxxy:Product] Error inspecting ${productUrl}`, e);
      return false;
    }
  }
}

