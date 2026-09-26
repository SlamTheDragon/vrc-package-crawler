import { AbortableDriverRuntime } from "./runtime.ts";
import { discoverRegistriesOnGitHub as discovery_discoverRegistriesOnGitHub } from "./discovery.ts";
import { extractAndQueueRegistries as harvesting_extractAndQueueRegistries, ingestCommunityRepo as harvesting_ingestCommunityRepo, ingestVpmRepositoriesList as harvesting_ingestVpmRepositoriesList, ingestAwesomeVRChat as harvesting_ingestAwesomeVRChat, ingestAllCuratedSources as harvesting_ingestAllCuratedSources } from "./harvesting.ts";

export * from "./seeding.ts";

const runtime = new AbortableDriverRuntime();

export class CuratedDriver {
  public static abort() {
    runtime.abort();
  }

  public static reset() {
    runtime.reset();
  }

  static discoverRegistriesOnGitHub(...args: Parameters<typeof discovery_discoverRegistriesOnGitHub> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof discovery_discoverRegistriesOnGitHub> {
    return discovery_discoverRegistriesOnGitHub(runtime, ...args) as ReturnType<typeof discovery_discoverRegistriesOnGitHub>;
  }

  static extractAndQueueRegistries(...args: Parameters<typeof harvesting_extractAndQueueRegistries> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_extractAndQueueRegistries> {
    return harvesting_extractAndQueueRegistries(runtime, ...args) as ReturnType<typeof harvesting_extractAndQueueRegistries>;
  }

  static ingestCommunityRepo(...args: Parameters<typeof harvesting_ingestCommunityRepo> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_ingestCommunityRepo> {
    return harvesting_ingestCommunityRepo(runtime, ...args) as ReturnType<typeof harvesting_ingestCommunityRepo>;
  }

  static ingestVpmRepositoriesList(...args: Parameters<typeof harvesting_ingestVpmRepositoriesList> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_ingestVpmRepositoriesList> {
    return harvesting_ingestVpmRepositoriesList(runtime, ...args) as ReturnType<typeof harvesting_ingestVpmRepositoriesList>;
  }

  static ingestAwesomeVRChat(...args: Parameters<typeof harvesting_ingestAwesomeVRChat> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_ingestAwesomeVRChat> {
    return harvesting_ingestAwesomeVRChat(runtime, ...args) as ReturnType<typeof harvesting_ingestAwesomeVRChat>;
  }

  static ingestAllCuratedSources(...args: Parameters<typeof harvesting_ingestAllCuratedSources> extends [any, ...infer Rest] ? Rest : never): ReturnType<typeof harvesting_ingestAllCuratedSources> {
    return harvesting_ingestAllCuratedSources(runtime, ...args) as ReturnType<typeof harvesting_ingestAllCuratedSources>;
  }
}

