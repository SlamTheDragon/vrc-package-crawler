import { CONFIG } from "../../config.ts";
import { logger } from "../../logger.ts";
import { db, CrawlerDB, type EntityRecord } from "../../db.ts";
import { rateLimiter, circuitBreaker } from "../../ratelimit.ts";
import { RelevanceFilter } from "../../filter.ts";
import { CuratedDriver } from "../curated";
import { cleanTitle, cleanAuthorName, cleanDescription } from "../../utils/sanitizer.ts";
import type { DriverRuntime } from "./runtime.ts";
import { crawlDiscoverQuery } from "./discovery.ts";

// Crawls an individual product page
  export async function crawlProduct(runtime: DriverRuntime, 
    productUrl: string,
    customDb?: CrawlerDB,
    etag?: string | null,
    lastModified?: string | null
  ): Promise<boolean | { success: boolean; notModified?: boolean; etag?: string | null; lastModified?: string | null }> {
    const targetDb = customDb || db;
    if (runtime.isAborted || targetDb.isClosed) return false;
    const key = "gumroad";

    // Circuit breaker check (Task 2.7)
    if (!circuitBreaker.canExecute("gumroad.com")) {
      const waitMs = circuitBreaker.getRemainingBackoffMs("gumroad.com");
      logger.info(`[Gumroad:Product] Circuit breaker OPEN for gumroad.com. Skipping ${productUrl} for ${(waitMs / 1000).toFixed(0)}s.`);
      return false;
    }

    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Gumroad] Fetching product: ${productUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.gumroadDelayMs);
      await runtime.sleep(delay);
      if (runtime.isAborted || targetDb.isClosed) return false;

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
        circuitBreaker.recordFailure("gumroad.com", resp.status, "Rate limit / forbidden");
        return false;
      }

      if (resp.status === 304) {
        logger.info(`[Gumroad] HTTP 304 Not Modified for ${currentUrl}`);
        rateLimiter.handleSuccess(key, CONFIG.gumroadDelayMs);
        circuitBreaker.recordSuccess("gumroad.com");
        return {
          success: true,
          notModified: true,
          etag: resp.headers.get("etag") || etag,
          lastModified: resp.headers.get("last-modified") || lastModified
        };
      }

      // 404 alternative path fallback: try swapping between subdomain and root domain, or Discover search
      if (resp.status === 404) {
        const slugMatch = currentUrl.match(/gumroad\.com\/l\/([^/?#]+)/);
        const slug = slugMatch ? slugMatch[1] : "";
        const isSubdomain = /https?:\/\/[^.]+\.gumroad\.com\/l\//.test(currentUrl);

        if (slug && isSubdomain) {
          const rootUrl = `https://gumroad.com/l/${slug}`;
          logger.info(`[Gumroad] Product 404 on subdomain ${currentUrl}, probing alternative path: ${rootUrl}`);
          await runtime.sleep(CONFIG.gumroadDelayMs);
          const rootResp = await fetch(rootUrl, {
            headers: {
              "User-Agent": CONFIG.userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
          });
          if (rootResp.ok) {
            logger.info(`[Gumroad] Alternative product path resolved: ${rootUrl}`);
            resp = rootResp;
            currentUrl = rootUrl;
          }
        }

        // If still 404, try Discover query fallback for the slug
        if (resp.status === 404 && slug) {
          logger.info(`[Gumroad] Product 404 on ${currentUrl}. Probing alternative path via Discover search: "${slug}"...`);
          const discRes = await crawlDiscoverQuery(runtime, slug.replace(/[-_]/g, " "), 1, targetDb);
          if (discRes.productsCount > 0) {
            logger.info(`[Gumroad] Discovered ${discRes.productsCount} products via fallback search for "${slug}"`);
            return true;
          }
        }
      }

      if (!resp.ok) {
        logger.warn(`[Gumroad] HTTP ${resp.status} for ${currentUrl} (all alternative paths failed)`);
        circuitBreaker.recordFailure("gumroad.com", resp.status, `HTTP error ${resp.status}`);
        return false;
      }

      const html = await resp.text();

      // Cloudflare Managed Challenge & Turnstile detection (Task 2.3)
      if (html.includes("challenges.cloudflare.com/turnstile") || html.includes("cf-mitigated: challenge")) {
        logger.warn(`[AntiBot] Cloudflare Managed Challenge encountered on ${currentUrl}. Halting domain crawl.`);
        targetDb.markStatus(currentUrl, "blocked", "Cloudflare Turnstile challenge detected", undefined, undefined, 86400 * 3, 403, "Cloudflare Turnstile challenge detected");
        circuitBreaker.trip("gumroad.com", 403, "Cloudflare Turnstile Challenge", 86400 * 3 * 1000);
        return false;
      }

      rateLimiter.handleSuccess(key, CONFIG.gumroadDelayMs);
      circuitBreaker.recordSuccess("gumroad.com");
      const finalUrl = resp.url || currentUrl;

      // Extract OpenGraph tags
      const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/);
      const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/);
      const ogImgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
      const urlMatch = productUrl.match(/gumroad\.com\/l\/([^/?#]+)/);
      const slug = urlMatch ? urlMatch[1] : productUrl;
      const finalUrlMatch = finalUrl.match(/gumroad\.com\/l\/([^/?#]+)/);
      const finalSlug = finalUrlMatch ? finalUrlMatch[1] : slug;

      // Extract creator from subdomain (e.g. architechvr.gumroad.com)
      const subMatch = (finalUrl || productUrl).match(/https?:\/\/([^.]+)\.gumroad\.com/);
      const creatorName = subMatch ? subMatch[1] : "Gumroad Creator";

      // Queue the creator's root storefront to discover ALL their tools!
      if (subMatch && subMatch[1] !== "www") {
        targetDb.queueUrl(`https://${subMatch[1]}.gumroad.com`, "gumroad");
      }

      const title = ogTitleMatch ? ogTitleMatch[1].trim() : `Gumroad Product ${slug}`;
      let desc = ogDescMatch ? ogDescMatch[1].trim() : "";

      // Extract external links (GitHub, BOOTH, Discord, VPM)
      // FIXME: remove discord, and VPM cannot be directly extracted from these packages, it may lead to a creator's website that contains social links and what not, and potentially might not even have the proper headers or metadata to obtain their true VCC listing directory. Applies on all drivers
      const extLinks: string[] = [];
      const ghMatches = html.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g) || [];
      for (const gh of ghMatches) {
        if (!extLinks.includes(gh)) {
          extLinks.push(gh);
          targetDb.queueUrl(gh, "github");
        }
      }

      // Preserve alternate/vanity URLs in external links
      if (finalUrl !== productUrl && !extLinks.includes(productUrl)) {
        extLinks.push(productUrl);
      }
      if (!extLinks.includes(finalUrl)) {
        extLinks.push(finalUrl);
      }

      // Autonomously extract any VPM / registry feeds from page description & links
      CuratedDriver.extractAndQueueRegistries(html);

      // Extract Inertia data-page properties (published_at, updated_at, covers, thumbnail_url)
      let originCreatedAt: string | null = null;
      let originUpdatedAt: string | null = null;
      let thumbnailUrl: string | null = ogImgMatch ? ogImgMatch[1] : null;
      const mediaSet = new Set<string>();
      const videoSet = new Set<string>();
      const ytSet = new Set<string>();
      let permalink = slug;

      const inertiaMatch = html.match(/data-page="([^"]+)"/);
      if (inertiaMatch) {
        try {
          const unescaped = inertiaMatch[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
          const pageData = JSON.parse(unescaped);
          const p = pageData.props?.product;
          if (p) {
            if (p.permalink) permalink = p.permalink;
            if (p.published_at) originCreatedAt = new Date(p.published_at).toISOString();
            if (p.updated_at) originUpdatedAt = new Date(p.updated_at).toISOString();
            if (p.description_text || p.plain_description) {
              const rich = (p.description_text || p.plain_description).trim();
              if (rich.length > desc.length) desc = rich;
            } else if (p.description_html || p.description) {
              const rawHtmlDesc = p.description_html || p.description;
              const rich = rawHtmlDesc.replace(/<br\s*\/?>/gi, "\n").replace(/<p[^>]*>/gi, "\n\n").replace(/<[^>]+>/g, " ").trim();
              if (rich.length > desc.length) desc = rich;
            }
            // thumbnail_url: the single preview image used in discovery search results
            if (p.thumbnail_url && typeof p.thumbnail_url === "string") {
              thumbnailUrl = thumbnailUrl || p.thumbnail_url;
            }
            // covers: the full gallery (images, GIFs, videos, oembeds)
            if (Array.isArray(p.covers)) {
              for (const cover of p.covers) {
                const coverUrl: string = cover?.original_url || cover?.url || "";
                const type: string = cover?.type || "image";
                if (!coverUrl || !coverUrl.startsWith("http")) continue;

                // 1. Check if cover is an oembed or YouTube embed
                if (type === "oembed" || coverUrl.includes("youtube.com") || coverUrl.includes("youtu.be")) {
                  const ytMatch = coverUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
                  if (ytMatch) {
                    ytSet.add(`https://www.youtube.com/watch?v=${ytMatch[1]}`);
                  }
                  const thumb: string = cover?.thumbnail || "";
                  if (thumb && thumb.startsWith("http")) {
                    mediaSet.add(thumb.split("?")[0]);
                  }
                  continue;
                }

                const w: number = cover?.native_width || cover?.width || 0;
                const h: number = cover?.native_height || cover?.height || 0;
                // Quality filter: skip if reported dimensions are below 200px
                if (w > 0 && h > 0 && Math.min(w, h) < 200) continue;

                if (type === "video") {
                  videoSet.add(coverUrl.split("?")[0]);
                  // Direct videos often provide a poster thumbnail
                  const thumb: string = cover?.thumbnail || "";
                  if (thumb && thumb.startsWith("http")) {
                    mediaSet.add(thumb.split("?")[0]);
                  }
                } else {
                  // image or gif
                  mediaSet.add(coverUrl.split("?")[0]);
                }
              }
            }
          }
        } catch (_) {}
      }

      // Fallback: og:image as thumbnail if no cover found
      if (thumbnailUrl) mediaSet.add(thumbnailUrl.split("?")[0]);
      const mediaUrls = Array.from(mediaSet).slice(0, 20);
      const videoUrls = Array.from(videoSet).slice(0, 10);

      // Extract YouTube video URLs from product page HTML (unescape JSON-encoded slashes)
      const unescapedHtml = html.replace(/\\\//g, "/");
      const ytRaw = unescapedHtml.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})[^\s"'<>]*/gi) || [];
      for (const yt of ytRaw) {
        const match = yt.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
        if (match) {
          ytSet.add(`https://www.youtube.com/watch?v=${match[1]}`);
        }
      }
      const youtubeUrls = Array.from(ytSet);

      const entityId = `gumroad:${permalink}`;
      if (permalink !== slug) {
        const permalinkUrl = `https://gumroad.com/l/${permalink}`;
        if (!extLinks.includes(permalinkUrl)) extLinks.push(permalinkUrl);
      }

      const entity: EntityRecord = {
        id: entityId,
        platform: "gumroad",
        url: finalUrl,
        title: cleanTitle(title),
        author: cleanAuthorName(creatorName),
        description: cleanDescription(desc),
        tags_json: JSON.stringify(["gumroad", "vrchat"]),
        external_links_json: JSON.stringify(extLinks),
        origin_created_at: originCreatedAt,
        origin_updated_at: originUpdatedAt,
        raw_json: JSON.stringify({
          slug: permalink,
          vanity_slug: finalSlug !== permalink ? finalSlug : undefined,
          title,
          author: creatorName,
          desc,
          extLinks,
          originCreatedAt,
          originUpdatedAt,
          thumbnail_url: thumbnailUrl,
          media_urls: mediaUrls,
          video_urls: videoUrls,
          youtube_urls: youtubeUrls
        })
      };

      const evalRes = RelevanceFilter.evaluate(entity);
      if (evalRes.isRelevant) {
        targetDb.saveEntity(entity);
        logger.info(`[Gumroad] Ingested: ${title.slice(0, 50)} by ${creatorName} (Score: ${evalRes.score}, Media: ${mediaUrls.length} imgs, ${videoUrls.length} vids, ${youtubeUrls.length} yt)`);
      } else {
        targetDb.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons, entity);
        logger.info(`[Gumroad] Quarantined: ${title.slice(0, 50)} (${evalRes.reasons.join(", ")})`);
      }

      return true;
    } catch (e: any) {
      if (e?.message?.includes("ENOTFOUND") || e?.code === "ENOTFOUND") {
        logger.warn(`[Gumroad] Dead subdomain detected for ${productUrl}. Archiving to qualified_discards.`);
        targetDb.discardFailedUrl(productUrl, "gumroad", "Dead subdomain (ENOTFOUND)");
        return true;
      }
      circuitBreaker.recordFailure("gumroad.com", 0, e instanceof Error ? e.message : String(e));
      logger.error(`[Gumroad] Error crawling product ${productUrl}`, e);
      return false;
    }
  }

// Crawls creator storefront and parses Inertia.js data-page payload
  export async function crawlStorefront(runtime: DriverRuntime, storeUrl: string, customDb?: CrawlerDB): Promise<boolean> {
    const targetDb = customDb || db;
    if (runtime.isAborted || targetDb.isClosed) return false;
    const key = "gumroad";

    // Circuit breaker check (Task 2.7)
    if (!circuitBreaker.canExecute("gumroad.com")) {
      const waitMs = circuitBreaker.getRemainingBackoffMs("gumroad.com");
      logger.info(`[Gumroad:Storefront] Circuit breaker OPEN for gumroad.com. Skipping ${storeUrl} for ${(waitMs / 1000).toFixed(0)}s.`);
      return false;
    }

    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Gumroad] Spidering creator storefront: ${storeUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.gumroadDelayMs);
      await runtime.sleep(delay);
      if (runtime.isAborted || db.isClosed) return false;

      let currentStore = storeUrl;
      let resp = await fetch(currentStore, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429 || resp.status === 403) {
        rateLimiter.handleRateLimit(key, resp);
        circuitBreaker.recordFailure("gumroad.com", resp.status, "Rate limit / forbidden");
        return false;
      }

      // 404 alternative path fallback: try path-based profile or Discover search
      if (resp.status === 404) {
        const subMatch = currentStore.match(/https?:\/\/([^.]+)\.gumroad\.com/);
        const creator = subMatch ? subMatch[1] : "";
        if (creator && creator !== "www") {
          const pathUrl = `https://gumroad.com/${creator}`;
          logger.info(`[Gumroad] Storefront 404 on subdomain ${currentStore}, probing alternative path: ${pathUrl}`);
          await runtime.sleep(CONFIG.gumroadDelayMs);
          const pathResp = await fetch(pathUrl, {
            headers: {
              "User-Agent": CONFIG.userAgent,
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            }
          });
          if (pathResp.ok) {
            logger.info(`[Gumroad] Alternative storefront path resolved: ${pathUrl}`);
            resp = pathResp;
            currentStore = pathUrl;
          } else if (pathResp.status === 404) {
            logger.info(`[Gumroad] Storefront 404 on both subdomain and path. Probing alternative path via Discover search: "${creator}"...`);
            const discRes = await crawlDiscoverQuery(runtime, creator, 1);
            if (discRes.productsCount > 0) {
              logger.info(`[Gumroad] Discovered ${discRes.productsCount} products for creator "${creator}" via fallback search`);
              return true;
            }
          }
        }
      }

      if (!resp.ok) {
        logger.warn(`[Gumroad] Storefront HTTP ${resp.status} for ${currentStore} (all alternative paths failed)`);
        circuitBreaker.recordFailure("gumroad.com", resp.status, `HTTP error ${resp.status}`);
        return false;
      }

      const htmlText = await resp.text();

      // Cloudflare Managed Challenge & Turnstile detection (Task 2.3)
      if (htmlText.includes("challenges.cloudflare.com/turnstile") || htmlText.includes("cf-mitigated: challenge")) {
        logger.warn(`[AntiBot] Cloudflare Managed Challenge encountered on ${currentStore}. Halting domain crawl.`);
        targetDb.markStatus(currentStore, "blocked", "Cloudflare Turnstile challenge detected", undefined, undefined, 86400 * 3, 403, "Cloudflare Turnstile challenge detected");
        circuitBreaker.trip("gumroad.com", 403, "Cloudflare Turnstile Challenge", 86400 * 3 * 1000);
        return false;
      }

      rateLimiter.handleSuccess(key, CONFIG.gumroadDelayMs);
      circuitBreaker.recordSuccess("gumroad.com");
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

          let pCreated = p.published_at || p.created_at || null;
          let pUpdated = p.updated_at || null;
          if (pCreated) { try { pCreated = new Date(pCreated).toISOString(); } catch (_) { pCreated = null; } }
          if (pUpdated) { try { pUpdated = new Date(pUpdated).toISOString(); } catch (_) { pUpdated = null; } }

          const entity: EntityRecord = {
            id: `gumroad:${permalink}`,
            platform: "gumroad",
            url: cleanUrl,
            title: cleanTitle(p.name || `Tool ${permalink}`),
            author: cleanAuthorName(creatorName),
            price_currency: p.currency_code ? p.currency_code.toUpperCase() : "USD",
            price_amount: p.price_cents ? p.price_cents / 100 : 0,
            description: cleanDescription(p.description || `${p.name} on Gumroad by ${creatorName}`),
            tags_json: JSON.stringify(["gumroad", "vrchat"]),
            external_links_json: JSON.stringify([storeUrl]),
            origin_created_at: pCreated,
            origin_updated_at: pUpdated,
            raw_json: JSON.stringify({
              ratings: p.ratings,
              thumbnail_url: p.thumbnail_url,
              filetypes: p.filetypes_data,
              originCreatedAt: pCreated,
              originUpdatedAt: pUpdated
            })
          };

          const evalRes = RelevanceFilter.evaluate(entity);
          if (evalRes.isRelevant) {
            db.saveEntity(entity);
            db.queueUrl(cleanUrl, "gumroad", 10);
            count++;
          } else {
            db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons, entity);
          }

        }
      }

      logger.info(`[Gumroad] Ingested ${count} vetted products from storefront: ${storeUrl} (${creatorName})`);
      return true;
    } catch (e: any) {
      if (e?.message?.includes("ENOTFOUND") || e?.code === "ENOTFOUND") {
        logger.warn(`[Gumroad] Dead storefront subdomain detected for ${storeUrl}. Archiving to qualified_discards.`);
        db.discardFailedUrl(storeUrl, "gumroad", "Dead storefront subdomain (ENOTFOUND)");
        return true;
      }
      circuitBreaker.recordFailure("gumroad.com", 0, e instanceof Error ? e.message : String(e));
      logger.error(`[Gumroad] Error parsing storefront ${storeUrl}`, e);
      return false;
    }
  }

// Harvests all cross-linked Gumroad storefronts and product permalinks from existing entities
  export function harvestCrossLinks(runtime: DriverRuntime): number {
    logger.info("[Gumroad] Harvesting unqueued Gumroad cross-links from existing database entities...");
    const rows = db.query("SELECT external_links_json, raw_json FROM entities WHERE is_quarantined = 0").all() as any[];
    let queued = 0;

    for (const r of rows) {
      const text = `${r.external_links_json || ""} ${r.raw_json || ""}`;
      const productMatches = text.match(/https?:\/\/[a-zA-Z0-9_-]+\.gumroad\.com\/l\/[a-zA-Z0-9_-]+/g) || [];
      for (const pm of productMatches) {
        if (RelevanceFilter.isUrlCandidateRelevant(pm, "gumroad")) {
          if (db.queueUrl(pm, "gumroad")) queued++;
        }
      }

      const storeMatches = text.match(/https?:\/\/[a-zA-Z0-9_-]+\.gumroad\.com(?!\/l\/)/g) || [];
      for (const sm of storeMatches) {
        if (!sm.includes("www.gumroad") && !sm.includes("discover")) {
          if (db.queueUrl(sm, "gumroad")) queued++;
        }
      }
    }

    logger.info(`[Gumroad] Successfully queued ${queued} novel Gumroad storefront and product URLs into frontier.`);
    return queued;
  }
