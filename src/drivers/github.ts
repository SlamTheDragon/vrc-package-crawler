import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";

export class GitHubDriver {
  private static sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Searches repositories by topic or query
  static async searchRepos(query: string): Promise<string[]> {
    logger.info(`[GitHub] Executing search: ${query}`);
    try {
      await this.sleep(CONFIG.githubSearchDelayMs);

      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=30`;
      const resp = await fetch(url, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "application/vnd.github.v3+json"
        }
      });

      const remaining = resp.headers.get("x-ratelimit-remaining") || "unknown";
      const reset = resp.headers.get("x-ratelimit-reset") || "unknown";

      if (resp.status === 403 || resp.status === 429) {
        const resetTimestamp = parseInt(reset, 10);
        const waitMs = resetTimestamp ? Math.max(1000, resetTimestamp * 1000 - Date.now() + 2000) : 60000;
        logger.rateLimit("GitHub", remaining, reset, waitMs);
        await this.sleep(waitMs);
        return [];
      }

      if (!resp.ok) {
        logger.warn(`[GitHub] Search HTTP ${resp.status} for query: ${query}`);
        return [];
      }

      const data = await resp.json();
      const repos = data.items || [];
      const repoUrls: string[] = [];

      for (const r of repos) {
        repoUrls.push(r.html_url);
        
        // Ingest repository immediately
        const entity: EntityRecord = {
          id: `github:${r.full_name}`,
          platform: "github",
          url: r.html_url,
          title: r.name,
          author: r.owner?.login || "Unknown",
          description: r.description || "",
          tags_json: JSON.stringify(r.topics || []),
          external_links_json: JSON.stringify([r.homepage].filter(Boolean)),
          raw_json: JSON.stringify({
            stargazers_count: r.stargazers_count,
            forks_count: r.forks_count,
            default_branch: r.default_branch,
            license: r.license?.spdx_id
          })
        };
        db.saveEntity(entity);
      }

      logger.info(`[GitHub] Discovered ${repos.length} repos for query: ${query}`);
      return repoUrls;
    } catch (e) {
      logger.error(`[GitHub] Search error for query: ${query}`, e);
      return [];
    }
  }

  // Crawls specific repository detail and checks for package.json / vpmDependencies
  static async crawlRepoDetail(repoUrl: string): Promise<boolean> {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return false;
    const [, owner, repo] = match;

    try {
      await this.sleep(1000);
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
      const resp = await fetch(apiUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "application/vnd.github.v3+json"
        }
      });

      if (!resp.ok) return false;
      const r = await resp.json();

      const entity: EntityRecord = {
        id: `github:${r.full_name}`,
        platform: "github",
        url: r.html_url,
        title: r.name,
        author: r.owner?.login || owner,
        description: r.description || "",
        tags_json: JSON.stringify(r.topics || []),
        external_links_json: JSON.stringify([r.homepage].filter(Boolean)),
        raw_json: JSON.stringify(r)
      };

      db.saveEntity(entity);
      logger.info(`[GitHub] Ingested Repo: ${r.full_name}`);
      return true;
    } catch (e) {
      logger.error(`[GitHub] Error fetching repo ${repoUrl}`, e);
      return false;
    }
  }
}
