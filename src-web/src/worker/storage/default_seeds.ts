import type { Platform, JobPurpose } from "../../../../src-crawler/src/shared/protocol/node_protocol.ts";

export interface DefaultSeedJob {
  url: string;
  platform: Platform;
  minDelayMs: number;
  purpose: JobPurpose;
}

// Candidate jobs only. These entries grant neither fetching nor publication.
// Placeholder seed selection remains under owner review (FLEET-S2).
export const DEFAULT_SEED_JOBS: DefaultSeedJob[] = [
  {
    url: "https://vrchat-community.github.io/template-package/index.json",
    platform: "vpm",
    minDelayMs: 1000,
    purpose: "discovery"
  },
  {
    url: "https://raw.githubusercontent.com/vrchat-community/template-package-listing/main/source.json",
    platform: "vpm",
    minDelayMs: 1000,
    purpose: "discovery"
  },
  {
    url: "https://booth.pm/ja/items/456789",
    platform: "booth",
    minDelayMs: 1500,
    purpose: "metadata"
  },
  {
    url: "https://gumroad.com/l/sample-vrc-asset",
    platform: "gumroad",
    minDelayMs: 3000,
    purpose: "metadata"
  },
  {
    url: "https://jinxxy.com/p/sample-vrc-tool",
    platform: "jinxxy",
    minDelayMs: 2000,
    purpose: "metadata"
  },
  {
    url: "https://sellfy.com/p/sample-vrc-prefab/",
    platform: "sellfy",
    minDelayMs: 2000,
    purpose: "metadata"
  },
  {
    url: "https://payhip.com/b/sample-vrc-item",
    platform: "custom_domain",
    minDelayMs: 2000,
    purpose: "metadata"
  }
];
