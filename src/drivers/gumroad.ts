import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";
import { rateLimiter } from "../ratelimit.ts";
import { RelevanceFilter } from "../filter.ts";

export class GumroadDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Crawls a Gumroad Discover search query page with exponential backoff & dynamic pacing
  static async crawlDiscoverQuery(query: string, page: number = 1): Promise<{ productsCount: number; sellersFound: string[] }> {
    const key = "gumroad:discover";

    // Wait if currently in backoff from previous 429
    if (rateLimiter.isBackingOff(key)) {
      const waitMs = rateLimiter.getRemainingBackoffMs(key);
      logger.info(`[Gumroad:Discover] Endpoint is currently in backoff. Skipping query '${query}' for ${(waitMs / 1000).toFixed(0)}s.`);
      return { productsCount: 0, sellersFound: [] };
    }

    const url = `https://gumroad.com/discover?query=${encodeURIComponent(query)}&page=${page}`;
    logger.info(`[Gumroad:Discover] Searching '${query}' page ${page}...`);

    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.gumroadDelayMs);
      await this.sleep(delay);

      const resp = await fetch(url, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429) {
        rateLimiter.handleRateLimit(key, resp);
        return { productsCount: 0, sellersFound: [] };
      }

      if (!resp.ok) {
        logger.warn(`[Gumroad:Discover] HTTP ${resp.status} for query '${query}' page ${page}`);
        return { productsCount: 0, sellersFound: [] };
      }

      // Record success
      rateLimiter.handleSuccess(key, CONFIG.gumroadDelayMs);

      const html = await resp.text();
      const match = html.match(/data-page="([^"]+)"/);
      if (!match) {
        logger.warn(`[Gumroad:Discover] No data-page found for query '${query}' page ${page}`);
        return { productsCount: 0, sellersFound: [] };
      }

      const unescaped = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      const data = JSON.parse(unescaped);
      const sr = data.props?.search_results || {};
      const products = sr.products || [];
      const sellersFound: string[] = [];

      let saved = 0;
      for (const p of products) {
        const permalink = p.permalink || p.id;
        if (!permalink) continue;

        const seller = p.seller || {};
        const sellerName = seller.name || "Gumroad Creator";
        const sellerProfile = seller.profile_url ? seller.profile_url.split("?")[0] : "";

        if (sellerProfile && !sellersFound.includes(sellerProfile)) {
          sellersFound.push(sellerProfile);
          db.queueUrl(sellerProfile, "gumroad");
        }

        const cleanUrl = sellerProfile ? `${sellerProfile}/l/${permalink}` : `https://gumroad.com/l/${permalink}`;

        const entity: EntityRecord = {
          id: `gumroad:${permalink}`,
          platform: "gumroad",
          url: cleanUrl,
          title: p.name || `Tool ${permalink}`,
          author: sellerName,
          price_currency: p.currency_code ? p.currency_code.toUpperCase() : "USD",
          price_amount: p.price_cents ? p.price_cents / 100 : 0,
          description: p.description || `${p.name} on Gumroad by ${sellerName}`,
          tags_json: JSON.stringify(["gumroad", "vrchat", query]),
          external_links_json: JSON.stringify(sellerProfile ? [sellerProfile] : []),
          raw_json: JSON.stringify({
            ratings: p.ratings,
            thumbnail_url: p.thumbnail_url,
            filetypes: p.filetypes_data,
            query: query
          })
        };

        const evalRes = RelevanceFilter.evaluate(entity);
        if (evalRes.isRelevant) {
          db.saveEntity(entity);
          saved++;
        } else {
          db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons);
        }
      }

      logger.info(`[Gumroad:Discover] Ingested ${saved}/${products.length} vetted products, queued ${sellersFound.length} creator storefronts for '${query}' page ${page}`);
      return { productsCount: saved, sellersFound };
    } catch (e) {
      logger.error(`[Gumroad:Discover] Error for query '${query}' page ${page}`, e);
      return { productsCount: 0, sellersFound: [] };
    }
  }

  // Crawls an individual product page
  static async crawlProduct(productUrl: string): Promise<boolean> {
    const key = "gumroad";
    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Gumroad] Fetching product: ${productUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.gumroadDelayMs);
      await this.sleep(delay);

      const resp = await fetch(productUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429) {
        rateLimiter.handleRateLimit(key, resp);
        return false;
      }

      if (!resp.ok) {
        logger.warn(`[Gumroad] HTTP ${resp.status} for ${productUrl}`);
        return false;
      }

      rateLimiter.handleSuccess(key, CONFIG.gumroadDelayMs);

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

      // Extract external links (GitHub, BOOTH, Discord, VPM)
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

      const evalRes = RelevanceFilter.evaluate(entity);
      if (evalRes.isRelevant) {
        db.saveEntity(entity);
        logger.info(`[Gumroad] Ingested: ${title.slice(0, 50)} by ${creatorName} (Score: ${evalRes.score})`);
      } else {
        db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons);
        logger.info(`[Gumroad] Quarantined: ${title.slice(0, 50)} (${evalRes.reasons.join(", ")})`);
      }
      return true;
    } catch (e) {
      logger.error(`[Gumroad] Error crawling product ${productUrl}`, e);
      return false;
    }
  }

  // Crawls creator storefront and parses Inertia.js data-page payload
  static async crawlStorefront(storeUrl: string): Promise<boolean> {
    const key = "gumroad";
    await rateLimiter.waitIfBackoff(key);

    logger.info(`[Gumroad] Spidering creator storefront: ${storeUrl}`);
    try {
      const delay = rateLimiter.getPacingDelayMs(key, CONFIG.gumroadDelayMs);
      await this.sleep(delay);

      const resp = await fetch(storeUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (resp.status === 429) {
        rateLimiter.handleRateLimit(key, resp);
        return false;
      }

      if (!resp.ok) {
        logger.warn(`[Gumroad] Storefront HTTP ${resp.status} for ${storeUrl}`);
        return false;
      }

      rateLimiter.handleSuccess(key, CONFIG.gumroadDelayMs);

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

          const evalRes = RelevanceFilter.evaluate(entity);
          if (evalRes.isRelevant) {
            db.saveEntity(entity);
            count++;
          } else {
            db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons);
          }
        }
      }

      logger.info(`[Gumroad] Ingested ${count} vetted products from storefront: ${storeUrl} (${creatorName})`);
      return true;
    } catch (e) {
      logger.error(`[Gumroad] Error parsing storefront ${storeUrl}`, e);
      return false;
    }
  }

  // Harvests all cross-linked Gumroad storefronts and product permalinks from existing entities
  static harvestCrossLinks(): number {
    logger.info("[Gumroad] Harvesting unqueued Gumroad cross-links from existing database entities...");
    const rows = (db as any).db.query("SELECT external_links_json, raw_json FROM entities").all() as any[];
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
}
