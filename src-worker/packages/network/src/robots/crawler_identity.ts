/** Product token used for HTTP identity and robots rule selection. */
export const CRAWLER_ROBOTS_TOKEN = "VRCPDiscoveryBot";

/** Keep earlier bot-specific refusals restrictive during the identity transition. */
export const ROBOTS_RESTRICTION_TOKENS = [CRAWLER_ROBOTS_TOKEN, "VRCDiscoveryBot"] as const;

/** Each runtime supplies its own config-synchronized product version. */
export function crawlerUserAgent(version: string): string {
  return `${CRAWLER_ROBOTS_TOKEN}/${version} (+https://github.com/SlamTheDragon/vrc-package-crawler; slamthedragon@gmail.com)`;
}
