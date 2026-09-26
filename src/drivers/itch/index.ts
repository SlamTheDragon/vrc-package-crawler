import { AbortableDriverRuntime } from "./runtime.ts";
import { crawlBrowsePage as discovery_crawlBrowsePage } from "./discovery.ts";
import { crawlProduct as harvesting_crawlProduct } from "./harvesting.ts";

export * from "./seeding.ts";

const runtime = new AbortableDriverRuntime();

export class ItchDriver {
  public static abort() {
    runtime.abort();
  }

  public static reset() {
    runtime.reset();
  }

  static crawlBrowsePage(...args: Parameters<typeof discovery_crawlBrowsePage> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof discovery_crawlBrowsePage> {
    return discovery_crawlBrowsePage(runtime, ...args) as ReturnType<typeof discovery_crawlBrowsePage>;
  }

  static crawlProduct(...args: Parameters<typeof harvesting_crawlProduct> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_crawlProduct> {
    return harvesting_crawlProduct(runtime, ...args) as ReturnType<typeof harvesting_crawlProduct>;
  }
}

