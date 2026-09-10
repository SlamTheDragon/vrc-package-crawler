import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";

export class VpmIndexDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Ingests a VPM index.json / vpm.json repository manifest
  static async crawlManifest(manifestUrl: string): Promise<boolean> {
    logger.info(`[VPM] Fetching repository manifest: ${manifestUrl}`);
    try {
      await this.sleep(CONFIG.vpmIndexDelayMs);

      const resp = await fetch(manifestUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "application/json"
        }
      });

      if (!resp.ok) {
        logger.warn(`[VPM] Manifest HTTP ${resp.status} for ${manifestUrl}`);
        return false;
      }

      const data = await resp.json();
      const repoAuthor = data.author || data.name || "Community";
      const packages = data.packages || {};

      let newCount = 0;
      for (const [pkgId, pkgVersions] of Object.entries(packages)) {
        const versions = Object.values(pkgVersions as Record<string, any>);
        if (!versions.length) continue;

        // Latest version
        const latest: any = versions[versions.length - 1];
        const title = latest.displayName || latest.name || pkgId;
        const author = latest.author?.name || repoAuthor;
        const desc = latest.description || "";
        const repoUrl = latest.repo || latest.url || manifestUrl;

        const entity: EntityRecord = {
          id: `vpm:${pkgId}`,
          platform: "vpm",
          url: repoUrl,
          title: title,
          author: author,
          description: desc,
          tags_json: JSON.stringify(latest.keywords || []),
          external_links_json: JSON.stringify([manifestUrl]),
          raw_json: JSON.stringify(latest)
        };

        db.saveEntity(entity);
        newCount++;

        // If repo is on GitHub, queue it for code inspection
        if (typeof repoUrl === "string" && repoUrl.includes("github.com")) {
          db.queueUrl(repoUrl, "github");
        }
      }

      logger.info(`[VPM] Ingested ${newCount} packages from ${manifestUrl}`);
      return true;
    } catch (e) {
      logger.error(`[VPM] Error parsing manifest ${manifestUrl}`, e);
      return false;
    }
  }
}
