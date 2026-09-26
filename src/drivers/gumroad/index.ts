import { AbortableDriverRuntime } from "./runtime.ts";
import { crawlDiscoverQuery as discovery_crawlDiscoverQuery } from "./discovery.ts";
import { crawlProduct as harvesting_crawlProduct, crawlStorefront as harvesting_crawlStorefront, harvestCrossLinks as harvesting_harvestCrossLinks } from "./harvesting.ts";

export * from "./seeding.ts";

const runtime = new AbortableDriverRuntime();

// FIXME: gumroad has a sitemap, are we taking it appropriately?
export class GumroadDriver {
  public static abort() {
    runtime.abort();
  }

  public static reset() {
    runtime.reset();
  }

  static crawlDiscoverQuery(...args: Parameters<typeof discovery_crawlDiscoverQuery> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof discovery_crawlDiscoverQuery> {
    return discovery_crawlDiscoverQuery(runtime, ...args) as ReturnType<typeof discovery_crawlDiscoverQuery>;
  }

  static crawlProduct(...args: Parameters<typeof harvesting_crawlProduct> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_crawlProduct> {
    return harvesting_crawlProduct(runtime, ...args) as ReturnType<typeof harvesting_crawlProduct>;
  }

  static crawlStorefront(...args: Parameters<typeof harvesting_crawlStorefront> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_crawlStorefront> {
    return harvesting_crawlStorefront(runtime, ...args) as ReturnType<typeof harvesting_crawlStorefront>;
  }

  static harvestCrossLinks(...args: Parameters<typeof harvesting_harvestCrossLinks> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_harvestCrossLinks> {
    return harvesting_harvestCrossLinks(runtime, ...args) as ReturnType<typeof harvesting_harvestCrossLinks>;
  }
}

