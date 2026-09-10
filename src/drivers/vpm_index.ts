import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";

export class VpmIndexDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Tries multiple URL candidates if initial manifest URL fails
  private static getUrlCandidates(rawUrl: string): string[] {
    const candidates = [rawUrl];
    if (rawUrl.endsWith("/index.json")) {
      candidates.push(rawUrl.replace(/\/index\.json$/, "/vpm.json"));
      candidates.push(rawUrl.replace(/\/index\.json$/, ""));
    } else if (rawUrl.endsWith("/vpm.json")) {
      candidates.push(rawUrl.replace(/\/vpm\.json$/, "/index.json"));
      candidates.push(rawUrl.replace(/\/vpm\.json$/, ""));
    } else {
      candidates.push(`${rawUrl.replace(/\/$/, "")}/index.json`);
      candidates.push(`${rawUrl.replace(/\/$/, "")}/vpm.json`);
    }
    return Array.from(new Set(candidates));
  }

  // Ingests a VPM index.json / vpm.json repository manifest with fallback probing
  static async crawlManifest(manifestUrl: string): Promise<boolean> {
    const candidates = this.getUrlCandidates(manifestUrl);

    for (const testUrl of candidates) {
      try {
        await this.sleep(CONFIG.vpmIndexDelayMs);

        const resp = await fetch(testUrl, {
          headers: {
            "User-Agent": CONFIG.userAgent,
            "Accept": "application/json, text/plain, */*"
          }
        });

        if (!resp.ok) continue;

        const data = await resp.json();
        if (!data || typeof data !== "object") continue;

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
          const repoUrl = latest.repo || latest.url || testUrl;

          // Extract dependencies for cross-reference
          const vpmDeps = Object.keys(latest.vpmDependencies || {});

          const entity: EntityRecord = {
            id: `vpm:${pkgId}`,
            platform: "vpm",
            url: repoUrl,
            title: title,
            author: author,
            description: desc,
            tags_json: JSON.stringify([...(latest.keywords || []), ...vpmDeps]),
            external_links_json: JSON.stringify([testUrl]),
            raw_json: JSON.stringify({
              pkgId,
              version: latest.version,
              vpmDependencies: latest.vpmDependencies,
              legacyFolders: latest.legacyFolders
            })
          };

          db.saveEntity(entity);
          newCount++;

          // If repo is hosted on GitHub, queue for raw code inspection
          if (typeof repoUrl === "string" && repoUrl.includes("github.com")) {
            const m = repoUrl.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/);
            if (m) db.queueUrl(m[0], "github");
          }
        }

        logger.info(`[VPM] Ingested ${newCount} packages from ${testUrl}`);
        return true;
      } catch (_) {
        continue;
      }
    }

    logger.warn(`[VPM] All URL candidates failed for manifest ${manifestUrl}`);
    return false;
  }
}
