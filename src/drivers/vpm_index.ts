import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";
import { RelevanceFilter } from "../filter.ts";

export class VpmIndexDriver {
  private static isAborted = false;

  public static abort() {
    this.isAborted = true;
  }

  public static reset() {
    this.isAborted = false;
  }

  private static async sleep(ms: number) {
    const end = Date.now() + ms;
    while (!this.isAborted && Date.now() < end) {
      const wait = Math.min(100, end - Date.now());
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  // Generates rich candidate URLs based on Claude skill pattern recognition
  public static getUrlCandidates(rawUrl: string): string[] {
    const candidates = [rawUrl];

    // Handle GitHub repository links and raw endpoints -> convert to Pages, raw manifests, and package.json
    const ghMatch = rawUrl.match(/https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
    if (ghMatch) {
      const [, owner, repo] = ghMatch;
      const cleanRepo = repo.replace(/\.git$/, "");
      candidates.push(`https://${owner}.github.io/${cleanRepo}/index.json`);
      candidates.push(`https://${owner}.github.io/${cleanRepo}/vpm.json`);
      candidates.push(`https://${owner}.github.io/vpm/index.json`);
      candidates.push(`https://${owner}.github.io/index.json`);
      candidates.push(`https://vpm.${owner.toLowerCase()}.dev/index.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/HEAD/index.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/HEAD/vpm.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/main/index.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/master/index.json`);
      // Single package.json endpoints for direct package repos
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/HEAD/package.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/main/package.json`);
      candidates.push(`https://raw.githubusercontent.com/${owner}/${cleanRepo}/master/package.json`);
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

  // Ingests a VPM index.json / vpm.json repository manifest or direct package.json with fallback probing
  static async crawlManifest(manifestUrl: string): Promise<boolean> {
    if (this.isAborted || db.isClosed) return false;
    const candidates = this.getUrlCandidates(manifestUrl);

    for (const testUrl of candidates) {
      if (this.isAborted || db.isClosed) break;
      try {
        await this.sleep(CONFIG.vpmIndexDelayMs);

        const resp = await fetch(testUrl, {
          headers: {
            "User-Agent": CONFIG.userAgent,
            "Accept": "application/json, text/plain, */*"
          }
        });

        if (!resp.ok) continue;

        const data = (await resp.json()) as any;
        if (!data || typeof data !== "object") continue;

        // Check A: Multi-package repository manifest
        const packages = data.packages || {};
        const isRepoListing = typeof packages === "object" && Object.keys(packages).length > 0;

        // Check B: Direct single package manifest (package.json)
        if (!isRepoListing) {
          if (data.name && (data.vpmDependencies || data.version || data.type === "tool" || testUrl.endsWith("package.json"))) {
            const pkgId = String(data.name);
            const title = data.displayName || data.name || pkgId;
            let author = data.author?.name || (typeof data.author === "string" ? data.author : "");

            const ghMatch = testUrl.match(/https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
            const owner = ghMatch ? ghMatch[1] : "";
            const repo = ghMatch ? ghMatch[2].replace(/\.git$/, "") : "";
            if (!author && owner) author = owner;

            let originRepoUrl = data.url || "";
            if (!originRepoUrl || !originRepoUrl.startsWith("http")) {
              if (owner && repo) originRepoUrl = `https://github.com/${owner}/${repo}`;
            }

            const desc = data.description || "";
            const vpmDeps = Object.keys(data.vpmDependencies || {});
            const extLinks: string[] = [];
            if (originRepoUrl) extLinks.push(originRepoUrl);
            if (data.author?.url) extLinks.push(data.author.url);

            let originCreatedAt = data.published_at || data.created_at || data.date || null;
            let originUpdatedAt = data.updated_at || null;
            if (originCreatedAt) { try { originCreatedAt = new Date(originCreatedAt).toISOString(); } catch (_) { originCreatedAt = null; } }
            if (originUpdatedAt) { try { originUpdatedAt = new Date(originUpdatedAt).toISOString(); } catch (_) { originUpdatedAt = null; } }

            const entity: EntityRecord = {
              id: `vpm:${pkgId}`,
              platform: "vpm",
              url: originRepoUrl || testUrl,
              title,
              author: author || "Community",
              description: desc,
              tags_json: JSON.stringify([...(data.keywords || []), "vpm-package", ...vpmDeps]),
              external_links_json: JSON.stringify(extLinks),
              origin_created_at: originCreatedAt,
              origin_updated_at: originUpdatedAt,
              raw_json: JSON.stringify({
                pkgId,
                version: data.version,
                displayName: data.displayName,
                vpmDependencies: data.vpmDependencies,
                repo_url: originRepoUrl,
                manifest_url: testUrl,
                is_direct_package: true,
                originCreatedAt,
                originUpdatedAt
              })
            };

            const evalRes = RelevanceFilter.evaluate(entity);
            if (evalRes.isRelevant) {
              db.saveEntity(entity);
              logger.info(`[VPM] Ingested direct VPM package ${pkgId} from ${testUrl}`);
              if (originRepoUrl) db.queueUrl(originRepoUrl, "github");
              if (owner) {
                import("./github.ts").then(({ GitHubDriver }) => {
                  GitHubDriver.harvestCreatorRepos([owner]).catch(() => {});
                });
              }
              return true;
            } else {
              db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons);
            }
          }
          continue;
        }

        const repoAuthor = data.author || data.name || "Community";

        // Detect if manifest is a multi-vendor Aggregator / Curation Listing
        const pkgIds = Object.keys(packages);
        const vendorRoots = new Set<string>();
        for (const pid of pkgIds) {
          const parts = pid.split(".").filter((p) => p !== "com" && p !== "net" && p !== "org" && p !== "dev" && p !== "io" && p !== "vrchat" && p !== "jp");
          if (parts.length > 0) vendorRoots.add(parts[0].toLowerCase());
        }
        const isAggregator = vendorRoots.size > 2;
        if (isAggregator) {
          logger.info(`[VPM] Detected aggregator/curation manifest (${vendorRoots.size} distinct vendor namespaces): ${testUrl}`);
        }

        // Self-reported canonical URL verification
        if (data.url && typeof data.url === "string" && data.url !== testUrl && data.url.startsWith("http")) {
          db.queueUrl(data.url, "vpm");
        }

        let newCount = 0;
        for (const [pkgId, pkgData] of Object.entries(packages)) {
          const vMap = (pkgData as any)?.versions || pkgData;
          const versionEntries = Object.entries(vMap as Record<string, any>);
          if (!versionEntries.length) continue;

          // Pick latest version (handles both ascending and descending semver / order)
          let latest: any = null;
          for (const [, verData] of versionEntries) {
            if (verData && typeof verData === "object") {
              if (!latest || (verData.version && verData.version > (latest.version || ""))) {
                latest = verData;
              }
            }
          }
          if (!latest) latest = versionEntries[versionEntries.length - 1][1];
          if (!latest || typeof latest !== "object") continue;

          const title = latest.displayName || latest.name || pkgId;
          const cleanTitle = title.toLowerCase();
          const desc = latest.description || "";

          // Filter uncustomized sample templates and dummy test packages
          if (
            pkgId === "com.vrchat.demo-template.listing" ||
            pkgId === "com.vrchat.example-listing" ||
            pkgId.includes("upm-test") ||
            cleanTitle === "vrchat example package" ||
            cleanTitle === "example package 1" ||
            cleanTitle === "example package 2" ||
            cleanTitle === "example package 3" ||
            (desc && desc.includes("Simple Package for testing Automation")) ||
            (desc && desc.includes("This is an example package"))
          ) {
            logger.warn(`[VPM] Skipping uncustomized template dummy: ${pkgId}`);
            continue;
          }

          // Multi-Author & Contributor Extraction (preserves complete provenance)
          const authorsList: string[] = [];
          if (typeof latest.author === "string") {
            const cleanA = latest.author.replace(/<[^>]+>/g, "").replace(/\([^)]+\)/g, "").trim();
            if (cleanA) authorsList.push(cleanA);
          } else if (latest.author?.name) {
            authorsList.push(latest.author.name.trim());
          }
          if (Array.isArray(latest.authors)) {
            for (const a of latest.authors) {
              const name = typeof a === "string" ? a : a?.name;
              if (name && !authorsList.includes(name.trim())) authorsList.push(name.trim());
            }
          }
          if (Array.isArray(latest.contributors)) {
            for (const c of latest.contributors) {
              const name = typeof c === "string" ? c : c?.name;
              if (name && !authorsList.includes(name.trim())) authorsList.push(name.trim());
            }
          }

          // Author Disambiguation:
          // Never let an aggregator manifest owner (e.g. "VRChat") usurp the author of an external package!
          let author = authorsList.length > 0 ? authorsList[0] : "";
          if (!author || (isAggregator && (author.toLowerCase() === "vrchat" || author === repoAuthor))) {
            // Extract author from reverse-DNS vendor prefix
            const parts = pkgId.split(".").filter((p) => p !== "com" && p !== "net" && p !== "org" && p !== "dev" && p !== "io" && p !== "users");
            if (parts.length > 0) {
              author = parts[0] === "vrchat" && parts.length > 1 ? parts[1] : parts[0];
            } else {
              author = repoAuthor;
            }
            if (!authorsList.includes(author)) authorsList.unshift(author);
          }

          // Origin Repo URL extraction:
          // 1. Check latest.repo
          let originRepoUrl = "";
          if (typeof latest.repo === "string" && latest.repo.startsWith("http")) {
            originRepoUrl = latest.repo.replace(/\.git$/, "").replace(/\/$/, "");
          }

          // 2. Extract upstream GitHub repository from release zip URL
          if (!originRepoUrl && typeof latest.url === "string") {
            const ghReleaseMatch = latest.url.match(/https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases/);
            if (ghReleaseMatch) {
              originRepoUrl = `https://github.com/${ghReleaseMatch[1]}/${ghReleaseMatch[2].replace(/\.git$/, "")}`;
            }
          }

          // 3. Extract upstream GitHub repository from author URL
          if (!originRepoUrl && typeof latest.author?.url === "string") {
            const ghAuthorMatch = latest.author.url.match(/https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
            if (ghAuthorMatch) {
              originRepoUrl = `https://github.com/${ghAuthorMatch[1]}/${ghAuthorMatch[2].replace(/\.git$/, "")}`;
            }
          }

          // Fallback to manifest URL only if this is NOT an aggregator
          if (!originRepoUrl && !isAggregator) {
            originRepoUrl = testUrl;
          }

          // Extract dependencies for cross-reference
          const vpmDeps = Object.keys(latest.vpmDependencies || {});

          const extLinks: string[] = [testUrl];
          if (originRepoUrl && !extLinks.includes(originRepoUrl)) extLinks.push(originRepoUrl);

          const canonicalItemUrl = originRepoUrl || latest.url || testUrl;

          let originCreatedAt = latest.published_at || latest.created_at || latest.date || null;
          let originUpdatedAt = latest.updated_at || null;
          if (originCreatedAt) { try { originCreatedAt = new Date(originCreatedAt).toISOString(); } catch (_) { originCreatedAt = null; } }
          if (originUpdatedAt) { try { originUpdatedAt = new Date(originUpdatedAt).toISOString(); } catch (_) { originUpdatedAt = null; } }

          const entity: EntityRecord = {
            id: `vpm:${pkgId}`,
            platform: "vpm",
            url: canonicalItemUrl,
            title: title,
            author: authorsList.length > 1 ? authorsList.join(", ") : author,
            description: desc,
            tags_json: JSON.stringify([...(latest.keywords || []), ...vpmDeps]),
            external_links_json: JSON.stringify(extLinks),
            origin_created_at: originCreatedAt,
            origin_updated_at: originUpdatedAt,
            raw_json: JSON.stringify({
              pkgId,
              version: latest.version,
              displayName: latest.displayName,
              authors: authorsList,
              vpmDependencies: latest.vpmDependencies,
              legacyFolders: latest.legacyFolders,
              repo_url: originRepoUrl,
              download_url: latest.url,
              manifest_url: testUrl,
              is_from_aggregator: isAggregator,
              originCreatedAt,
              originUpdatedAt
            })
          };

          db.saveEntity(entity);
          newCount++;

          // If origin repo is on GitHub, queue for raw code inspection
          if (typeof originRepoUrl === "string" && originRepoUrl.includes("github.com")) {
            const m = originRepoUrl.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/);
            if (m) db.queueUrl(m[0], "github");
          }

          // Queue author homepage or docs if pointing to GitHub
          if (latest.author?.url && latest.author.url.includes("github.com")) {
            const m = latest.author.url.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/);
            if (m) db.queueUrl(m[0], "github");
          }
        }

        logger.info(`[VPM] Ingested ${newCount} packages from ${testUrl}`);
        return true;
      } catch (_) {
        continue;
      }
    }

    // Fallback 1: If a speculative VPM manifest URL for a GitHub repo failed, route to GitHub driver
    const ghFallback = manifestUrl.match(/https:\/\/(?:raw\.githubusercontent\.com|github\.com)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
    if (ghFallback) {
      const owner = ghFallback[1];
      const cleanRepo = ghFallback[2].replace(/\.git$/, "");
      const repoUrl = `https://github.com/${owner}/${cleanRepo}`;
      db.queueUrl(repoUrl, "github");
      logger.info(`[VPM] Manifest not found, routed repository to GitHub driver: ${repoUrl}`);

      // If repository is a known community template (e.g. VPM-Package-Template), search GitHub for active packages using it!
      if (cleanRepo.toLowerCase().includes("vpm-package-template") || cleanRepo.toLowerCase().includes("vpm-template")) {
        logger.info(`[VPM] Detected VPM Template (${owner}/${cleanRepo}). Discovering community repositories using this template...`);
        import("./github.ts").then(({ GitHubDriver }) => {
          GitHubDriver.searchRepos(`"${cleanRepo}" in:name,description`, 2).then(urls => {
            for (const u of urls) db.queueUrl(u, "github");
          }).catch(() => {});
        });
      }

      import("./github.ts").then(({ GitHubDriver }) => {
        GitHubDriver.harvestCreatorRepos([owner]).catch(() => {});
      });
      return true;
    }

    // Fallback 2: GitHub Pages URL (e.g. https://owner.github.io/repo/index.json)
    const ghPagesFallback = manifestUrl.match(/https?:\/\/([A-Za-z0-9_.-]+)\.github\.io(?:\/([A-Za-z0-9_.-]+))?/);
    if (ghPagesFallback) {
      const owner = ghPagesFallback[1];
      const repo = ghPagesFallback[2];
      if (repo) {
        const repoUrl = `https://github.com/${owner}/${repo}`;
        db.queueUrl(repoUrl, "github");
        logger.info(`[VPM] GitHub Pages manifest failed, routed to GitHub repository: ${repoUrl}`);
      }
      import("./github.ts").then(({ GitHubDriver }) => {
        GitHubDriver.harvestCreatorRepos([owner]).catch(() => {});
      });
      return true;
    }

    // Fallback 3: Custom domain root HTML scraping for vcc:// protocol or repository manifest links
    try {
      const rootUrlMatch = manifestUrl.match(/^(https?:\/\/[^/]+)/);
      if (rootUrlMatch) {
        const rootUrl = rootUrlMatch[1];
        logger.info(`[VPM] Manifest candidates 404 for ${manifestUrl}. Probing root domain HTML: ${rootUrl}...`);
        const rootResp = await fetch(rootUrl, {
          headers: { "User-Agent": CONFIG.userAgent }
        });
        if (rootResp.ok) {
          const rootHtml = await rootResp.text();
          // Match vcc://vpm/addRepo?url=...
          const vccMatch = rootHtml.match(/vcc:\/\/vpm\/addRepo\?url=([^"'\s&]+)/i);
          if (vccMatch) {
            const decodedVpmUrl = decodeURIComponent(vccMatch[1]);
            if (decodedVpmUrl && decodedVpmUrl !== manifestUrl && !candidates.includes(decodedVpmUrl)) {
              logger.info(`[VPM] Discovered alternative manifest URL via vcc:// link: ${decodedVpmUrl}`);
              db.queueUrl(decodedVpmUrl, "vpm");
              return this.crawlManifest(decodedVpmUrl);
            }
          }
          // Match direct index.json or vpm.json links in HTML
          const jsonLinkMatch = rootHtml.match(/href=["']([^"']+\/(?:index|vpm|packages)\.json)["']/i);
          if (jsonLinkMatch) {
            let jsonUrl = jsonLinkMatch[1];
            if (jsonUrl.startsWith("/")) jsonUrl = `${rootUrl}${jsonUrl}`;
            if (jsonUrl !== manifestUrl && !candidates.includes(jsonUrl)) {
              logger.info(`[VPM] Discovered alternative manifest URL via HTML link: ${jsonUrl}`);
              db.queueUrl(jsonUrl, "vpm");
              return this.crawlManifest(jsonUrl);
            }
          }
        }
      }
    } catch (_) {}

    logger.warn(`[VPM] All alternative paths failed for manifest ${manifestUrl}`);
    return false;
  }
}

