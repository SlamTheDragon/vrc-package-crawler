import { AbortableDriverRuntime } from "./runtime.ts";
import { crawlCategoryPage as discovery_crawlCategoryPage } from "./discovery.ts";
import { crawlItemDetail as harvesting_crawlItemDetail } from "./harvesting.ts";

export * from "./seeding.ts";

const runtime = new AbortableDriverRuntime();

export class BoothDriver {
  public static abort() {
    runtime.abort();
  }

  public static reset() {
    runtime.reset();
  }

  static crawlCategoryPage(...args: Parameters<typeof discovery_crawlCategoryPage> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof discovery_crawlCategoryPage> {
    return discovery_crawlCategoryPage(runtime, ...args) as ReturnType<typeof discovery_crawlCategoryPage>;
  }

  static crawlItemDetail(...args: Parameters<typeof harvesting_crawlItemDetail> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_crawlItemDetail> {
    return harvesting_crawlItemDetail(runtime, ...args) as ReturnType<typeof harvesting_crawlItemDetail>;
  }
}

