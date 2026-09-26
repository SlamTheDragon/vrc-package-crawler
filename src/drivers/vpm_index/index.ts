import { AbortableDriverRuntime } from "./runtime.ts";
import { getUrlCandidates as discovery_getUrlCandidates, discoverVpmRepositories as discovery_discoverVpmRepositories } from "./discovery.ts";
import { crawlManifest as harvesting_crawlManifest } from "./harvesting.ts";

export * from "./seeding.ts";

const runtime = new AbortableDriverRuntime();

export class VpmIndexDriver {
  public static abort() {
    runtime.abort();
  }

  public static reset() {
    runtime.reset();
  }

  static getUrlCandidates(...args: Parameters<typeof discovery_getUrlCandidates> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof discovery_getUrlCandidates> {
    return discovery_getUrlCandidates(runtime, ...args) as ReturnType<typeof discovery_getUrlCandidates>;
  }

  static discoverVpmRepositories(...args: Parameters<typeof discovery_discoverVpmRepositories> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof discovery_discoverVpmRepositories> {
    return discovery_discoverVpmRepositories(runtime, ...args) as ReturnType<typeof discovery_discoverVpmRepositories>;
  }

  static crawlManifest(...args: Parameters<typeof harvesting_crawlManifest> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_crawlManifest> {
    return harvesting_crawlManifest(runtime, ...args) as ReturnType<typeof harvesting_crawlManifest>;
  }
}

