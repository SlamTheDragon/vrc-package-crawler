import type { CreateSourceAccessProfile } from "../../shared/policy/source_access_profile.ts";
import type { Platform, JobPurpose } from "../../shared/protocol/node_protocol.ts";

export interface DefaultSeedJob {
  url: string;
  platform: Platform;
  minDelayMs: number;
  purpose: JobPurpose;
}

export const DEFAULT_SOURCE_ACCESS_PROFILES: CreateSourceAccessProfile[] = [
  {
    schemaVersion: 1,
    platform: "vpm",
    origin: "https://vrchat-community.github.io",
    pathScope: "/template-package/index.json",
    method: "GET",
    purpose: "discovery",
    minDelayMs: 1000,
    expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "INIT-SEED-VPM-TEMPLATE",
    reason: "Initial VPM community package discovery template seed",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    schemaVersion: 1,
    platform: "vpm",
    origin: "https://raw.githubusercontent.com",
    pathScope: "/vrchat-community/template-package-listing/main/source.json",
    method: "GET",
    purpose: "discovery",
    minDelayMs: 1000,
    expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "INIT-SEED-VPM-LISTING",
    reason: "Initial VPM community package listing recipe seed",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    schemaVersion: 1,
    platform: "booth",
    origin: "https://booth.pm",
    pathScope: "/ja/items/",
    method: "GET",
    purpose: "metadata",
    minDelayMs: 1500,
    expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "INIT-SEED-BOOTH-METADATA",
    reason: "Initial BOOTH item storefront metadata profile",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    schemaVersion: 1,
    platform: "gumroad",
    origin: "https://gumroad.com",
    pathScope: "/l/",
    method: "GET",
    purpose: "metadata",
    minDelayMs: 3000,
    expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "INIT-SEED-GUMROAD-METADATA",
    reason: "Initial Gumroad product storefront metadata profile",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    schemaVersion: 1,
    platform: "jinxxy",
    origin: "https://jinxxy.com",
    pathScope: "/p/",
    method: "GET",
    purpose: "metadata",
    minDelayMs: 1200,
    expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "INIT-SEED-JINXXY-METADATA",
    reason: "Initial Jinxxy product storefront metadata profile",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    schemaVersion: 1,
    platform: "itch",
    origin: "https://itch.io",
    pathScope: "/tools/tag-vrchat",
    method: "GET",
    purpose: "metadata",
    minDelayMs: 1500,
    expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "INIT-SEED-ITCH-METADATA",
    reason: "Initial itch.io tools browse metadata profile",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    schemaVersion: 1,
    platform: "github",
    origin: "https://api.github.com",
    pathScope: "/repos/",
    method: "GET",
    purpose: "metadata",
    minDelayMs: 60000,
    expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "INIT-SEED-GITHUB-METADATA",
    reason: "Initial GitHub public REST repository API profile",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    schemaVersion: 1,
    platform: "sellfy",
    origin: "https://sellfy.com",
    pathScope: "/p/",
    method: "GET",
    purpose: "metadata",
    minDelayMs: 2000,
    expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "INIT-SEED-SELLFY-METADATA",
    reason: "Initial Sellfy product storefront metadata profile",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  },
  {
    schemaVersion: 1,
    platform: "custom_domain",
    origin: "https://payhip.com",
    pathScope: "/b/",
    method: "GET",
    purpose: "metadata",
    minDelayMs: 2000,
    expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "INIT-SEED-PAYHIP-METADATA",
    reason: "Initial Payhip product storefront metadata profile",
    retainClasses: ["normalized_facts"],
    publishClasses: ["normalized_facts"]
  }
];

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

export const DEFAULT_ROBOTS_SNAPSHOTS: { origin: string; statusCode: number; body: string }[] = [
  {
    origin: "https://vrchat-community.github.io",
    statusCode: 200,
    body: "User-agent: *\nAllow: /"
  },
  {
    origin: "https://raw.githubusercontent.com",
    statusCode: 200,
    body: "User-agent: *\nAllow: /"
  },
  {
    origin: "https://booth.pm",
    statusCode: 200,
    body: "User-agent: *\nDisallow: /admin\nAllow: /ja/items/\nAllow: /en/items/"
  },
  {
    origin: "https://gumroad.com",
    statusCode: 200,
    body: "User-agent: *\nDisallow: /checkout\nAllow: /l/"
  },
  {
    origin: "https://jinxxy.com",
    statusCode: 200,
    body: "User-agent: *\nDisallow: /creator\nAllow: /p/"
  },
  {
    origin: "https://sellfy.com",
    statusCode: 200,
    body: "User-agent: *\nDisallow: /checkout/\nAllow: /p/"
  },
  {
    origin: "https://payhip.com",
    statusCode: 200,
    body: "User-agent: *\nDisallow: /order/\nDisallow: /checkout/\nAllow: /b/"
  }
];

