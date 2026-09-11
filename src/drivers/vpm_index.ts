import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";

export class VpmIndexDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Generates rich candidate URLs based on Claude skill pattern recognition
  public static getUrlCandidates(rawUrl: string): string[] {
    const candidates = [rawUrl];

    // Handle GitHub repository links -> convert to Pages & raw endpoints
    const ghMatch = rawUrl.match(/https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
    if (ghMatch) {
      const [, owner, repo] = ghMatch;
      const cleanRepo = repo.replace(/\.git$/, "");
      candidates.push(`https://${owner}.github.io/${cleanRepo}/index.json`);
      candidates.push(`https://${owner}.github.io/${cleanRepo}/vpm.json`);
      candidates.push(`https://${owner}.github.io/vpm/index.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/HEAD/index.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/HEAD/vpm.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/main/index.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/master/index.json`);
    }

    if (rawUrl.endsWith("/index.json")) {
      candidates.push(rawUrl.replace(/\/index\.json$/, "/vpm.json"));
      candidates.push(rawUrl.replace(/\/index\.json$/, ""));
    } else if (rawUrl.endsWith("/vpm.json")) {
      candidates.push(rawUrl.replace(/\/vpm\.json$/, "/index.json"));
      candidates.push(rawUrl.replace(/\/vpm\.json$/, ""));
    } else {
      const cleanBase = rawUrl.replace(/\/$/, "");
      candidates.push(`${cleanBase}/index.json`);
      candidates.push(`${cleanBase}/vpm.json`);
      candidates.push(`${cleanBase}/vpm/index.json`);
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

        const packages = data.packages || {};
        if (typeof packages !== "object" || Object.keys(packages).length === 0) continue;

        const repoAuthor = data.author || data.name || "Community";

        // Claude Skill Step 5-4: Self-reported canonical URL verification
        if (data.url && typeof data.url === "string" && data.url !== testUrl && data.url.startsWith("http")) {
          db.queueUrl(data.url, "vpm");
        }

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

          // Claude Skill Step 7: Filter uncustomized sample templates and dummy test packages
          // FIXME: apparently this isnt enough, need a broader manual post inspection for cleanup
          if (
            pkgId === "com.vrchat.demo-template.listing" ||
            pkgId === "com.vrchat.example-listing" ||
            pkgId.includes("upm-test") ||
            title === "VRChat Example Package" ||
            (desc && desc.includes("Simple Package for testing Automation"))
          ) {
            logger.warn(`[VPM] Skipping uncustomized template dummy: ${pkgId}`);
            continue;
          }

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

          // Queue author homepage or docs if pointing to external site
          // WARN: there are dislocated or orphan items in the web, this may not be enough
          if (latest.author?.url && latest.author.url.includes("github.com")) {
            db.queueUrl(latest.author.url, "github");
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

