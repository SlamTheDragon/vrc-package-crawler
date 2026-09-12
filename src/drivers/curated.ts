import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db } from "../db.ts";

// Multi-maintainer decentralized community registries across the VRChat ecosystem
export const COMMUNITY_REGISTRY_SEEDS = [
  "vrchat-community/vpm-listing-curated",
  "kurotu/vpm-catalog",
  "Narazaka/vpm-repos",
  "Rafael-6fx/VPM-Repo-catalog-plus",
  "ureishi/vpm-repos",
  "lilxyzw/vpm-repos",
  "vrcd-community/vpm-repos-syncronizer-web",
  "madjin/awesome-vrchat",
  "misyaguziya/awesome-vrchat",
  "edu3d-lsl/awesome-vrchat"
];

export class CuratedDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": CONFIG.userAgent,
      "Accept": "application/vnd.github.v3+json"
    };
    if (CONFIG.githubToken) {
      headers["Authorization"] = `Bearer ${CONFIG.githubToken}`;
    }
    return headers;
  }

  // Ingests any community repository dynamically by probing manifests, source lists, and markdown
  static async ingestCommunityRepo(repoFullName: string): Promise<number> {
    logger.info(`[Curated] Ingesting community registry: ${repoFullName}...`);
    let queued = 0;
    const branches = ["HEAD", "main", "master"];

    // 1. Probe for repositories.txt across branches
    for (const b of branches) {
      try {
        const url = `https://raw.githubusercontent.com/${repoFullName}/${b}/repositories.txt`;
        const resp = await fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
        if (resp.ok) {
          const text = await resp.text();
          const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
          for (const line of lines) {
            if (line.startsWith("http") && db.queueUrl(line, "vpm")) queued++;
          }
          logger.info(`[Curated] Ingested ${queued} VPM feeds from ${repoFullName} (repositories.txt)`);
          break;
        }
      } catch (_) {}
    }

    // 2. Probe for source.json / index.json / vpm.json across branches
    for (const b of branches) {
      for (const fileName of ["source.json", "index.json", "vpm.json", "packages.json"]) {
        try {
          const url = `https://raw.githubusercontent.com/${repoFullName}/${b}/${fileName}`;
          const resp = await fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
          if (resp.ok) {
            const data = (await resp.json()) as any;
            if (data && typeof data === "object") {
              if (data.url && typeof data.url === "string") {
                if (db.queueUrl(data.url, "vpm")) queued++;
              }
              if (data.infoLink && typeof data.infoLink === "string") {
                if (data.infoLink.includes("github.com")) db.queueUrl(data.infoLink, "github");
              }
              if (data.packages && typeof data.packages === "object") {
                db.queueUrl(url, "vpm");
                queued++;
              }
            }
          }
        } catch (_) {}
      }
    }

    // 3. Probe for README.md across branches to extract cross-references
    for (const b of branches) {
      try {
        const url = `https://raw.githubusercontent.com/${repoFullName}/${b}/README.md`;
        const resp = await fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
        if (resp.ok) {
          const text = await resp.text();
          const links = text.match(/https?:\/\/[^\s\)\"\'<>]+/g) || [];
          for (const link of links) {
            const clean = link.replace(/[.,;)]+$/, "");
            if (clean.includes("github.com") && !clean.includes(repoFullName)) {
              const m = clean.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/);
              if (m && db.queueUrl(m[0], "github")) queued++;
            } else if (clean.includes("booth.pm/ja/items/") || clean.includes("booth.pm/en/items/")) {
              const m = clean.match(/https:\/\/booth\.pm\/(?:ja|en)\/items\/\d+/);
              if (m && db.queueUrl(m[0], "booth")) queued++;
            } else if (clean.includes("gumroad.com/l/")) {
              const m = clean.match(/https:\/\/[^/]*gumroad\.com\/l\/[^/?#]+/);
              if (m && db.queueUrl(m[0], "gumroad")) queued++;
            } else if (clean.endsWith("/index.json") || clean.endsWith("/vpm.json")) {
              if (db.queueUrl(clean, "vpm")) queued++;
            }
          }
          break;
        }
      } catch (_) {}
    }

    // 4. Check GitHub Pages candidate URLs for the repo
    const owner = repoFullName.split("/")[0];
    const repo = repoFullName.split("/")[1];
    if (owner && repo) {
      db.queueUrl(`https://${owner}.github.io/${repo}/index.json`, "vpm");
      db.queueUrl(`https://${owner}.github.io/${repo}/vpm.json`, "vpm");
      db.queueUrl(`https://${owner}.github.io/vpm/index.json`, "vpm");
    }

    return queued;
  }

  // Dynamically queries GitHub search API for new community VPM catalogs and awesome lists
  static async discoverRegistriesOnGitHub(): Promise<string[]> {
    logger.info("[Curated] Dynamically discovering community VPM registries and curated collections across GitHub...");
    const queries = [
      "vpm-repos in:name",
      "vpm-listing in:name",
      "vpm-catalog in:name",
      "vpm-packages in:name",
      "awesome-vrchat in:name"
    ];
    const discovered = new Set<string>();

    for (const q of queries) {
      try {
        await this.sleep(CONFIG.githubSearchDelayMs);
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=20&sort=updated`;
        const resp = await fetch(url, { headers: this.getHeaders() });
        if (!resp.ok) continue;

        const data = (await resp.json()) as any;
        const items = data.items || [];
        for (const item of items) {
          if (item.full_name) {
            discovered.add(item.full_name);
          }
        }
        logger.info(`[Curated] Discovered ${items.length} repositories for query "${q}"`);
      } catch (e) {
        logger.error(`[Curated] Error discovering registries for query "${q}"`, e);
      }
    }

    return Array.from(discovered);
  }

  // Ingests all decentralized community VPM repositories across multiple maintainers
  static async ingestVpmRepositoriesList(): Promise<number> {
    logger.info("[Curated] Ingesting decentralized community VPM repositories across multi-author registries...");
    let total = 0;
    const vpmRegistries = [
      "vrchat-community/vpm-listing-curated",
      "kurotu/vpm-catalog",
      "Narazaka/vpm-repos",
      "Rafael-6fx/VPM-Repo-catalog-plus",
      "ureishi/vpm-repos",
      "lilxyzw/vpm-repos",
      "vrcd-community/vpm-repos-syncronizer-web"
    ];

    for (const repo of vpmRegistries) {
      const c = await this.ingestCommunityRepo(repo);
      total += c;
    }
    return total;
  }

  // Harvests curated links from multiple awesome-vrchat collections across independent maintainers
  static async ingestAwesomeVRChat(): Promise<number> {
    logger.info("[Curated] Ingesting awesome-vrchat collections across independent maintainers...");
    let total = 0;
    const collections = [
      "madjin/awesome-vrchat",
      "misyaguziya/awesome-vrchat",
      "edu3d-lsl/awesome-vrchat"
    ];

    for (const repo of collections) {
      const c = await this.ingestCommunityRepo(repo);
      total += c;
    }
    return total;
  }

  // Comprehensive multi-source ingestion combining seeded registries and live dynamic discovery
  static async ingestAllCuratedSources(): Promise<number> {
    logger.info("[Curated] Launching comprehensive multi-source decentralized registry ingestion...");
    let totalQueued = 0;

    // 1. Ingest all decentralized bootstrap seeds
    for (const seed of COMMUNITY_REGISTRY_SEEDS) {
      const count = await this.ingestCommunityRepo(seed);
      totalQueued += count;
    }

    // 2. Discover and ingest live dynamic registries on GitHub
    const liveRegistries = await this.discoverRegistriesOnGitHub();
    for (const reg of liveRegistries) {
      if (!COMMUNITY_REGISTRY_SEEDS.includes(reg)) {
        const count = await this.ingestCommunityRepo(reg);
        totalQueued += count;
      }
    }

    logger.info(`[Curated] Multi-source ingestion complete. Total community feeds & links queued: ${totalQueued}`);
    return totalQueued;
  }
}
