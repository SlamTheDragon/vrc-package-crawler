import * as cheerio from "cheerio";
import type { CrawlJob, DiscoveryLead } from "../../shared/node_protocol.ts";
import { isShopifyProductSitemapTarget, shopifyProductLead } from "../../shared/source_targets.ts";

/** A Shopify product sitemap is discovery evidence only; merchant/product facts need separate review. */
export function parseShopifyProductSitemapLeads(job: CrawlJob, body: string): DiscoveryLead[] | null {
  if (job.platform !== "shopify" || job.purpose !== "discovery" ||
      !isShopifyProductSitemapTarget(job.url) || /<!DOCTYPE|<!ENTITY/i.test(body) ||
      !/<\/urlset>\s*$/.test(body)) return null;
  const $ = cheerio.load(body, { xmlMode: true });
  if ($("urlset").length !== 1 || $("urlset").parent().length !== 0 || $("sitemapindex").length) return null;
  const urls = new Set<string>();
  for (const entry of $("urlset > url").toArray()) {
    const loc = $(entry).children("loc").first().text().trim();
    const product = shopifyProductLead(loc, job.origin);
    if (!product) continue;
    urls.add(product);
    if (urls.size > 100) return null;
  }
  return [...urls].map(url => ({ kind: "storefront_product", url }));
}
