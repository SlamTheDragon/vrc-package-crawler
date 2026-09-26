import { AbortableDriverRuntime } from "./runtime.ts";
import { searchRepos as discovery_searchRepos } from "./discovery.ts";
import { crawlRepoDetail as harvesting_crawlRepoDetail, harvestCreatorRepos as harvesting_harvestCreatorRepos, harvestDiscoveredCreators as harvesting_harvestDiscoveredCreators } from "./harvesting.ts";

export * from "./seeding.ts";

const runtime = new AbortableDriverRuntime();

export class GitHubDriver {
  public static abort() {
    runtime.abort();
  }

  public static reset() {
    runtime.reset();
  }

  static searchRepos(...args: Parameters<typeof discovery_searchRepos> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof discovery_searchRepos> {
    return discovery_searchRepos(runtime, ...args) as ReturnType<typeof discovery_searchRepos>;
  }

  static crawlRepoDetail(...args: Parameters<typeof harvesting_crawlRepoDetail> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_crawlRepoDetail> {
    return harvesting_crawlRepoDetail(runtime, ...args) as ReturnType<typeof harvesting_crawlRepoDetail>;
  }

  static harvestCreatorRepos(...args: Parameters<typeof harvesting_harvestCreatorRepos> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_harvestCreatorRepos> {
    return harvesting_harvestCreatorRepos(runtime, ...args) as ReturnType<typeof harvesting_harvestCreatorRepos>;
  }

  static harvestDiscoveredCreators(...args: Parameters<typeof harvesting_harvestDiscoveredCreators> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_harvestDiscoveredCreators> {
    return harvesting_harvestDiscoveredCreators(runtime, ...args) as ReturnType<typeof harvesting_harvestDiscoveredCreators>;
  }
}

