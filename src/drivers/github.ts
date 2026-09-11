import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";
import { RelevanceFilter } from "../filter.ts";

export class GitHubDriver {
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

  // Searches repositories with multi-page pagination
  static async searchRepos(query: string, maxPages: number = 3): Promise<string[]> {
    logger.info(`[GitHub] Executing paginated search: "${query}" (up to ${maxPages} pages)`);
    const allRepoUrls: string[] = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        await this.sleep(CONFIG.githubSearchDelayMs);

        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=30&page=${page}`;
        const resp = await fetch(url, { headers: this.getHeaders() });

        const remaining = resp.headers.get("x-ratelimit-remaining") || "unknown";
        const reset = resp.headers.get("x-ratelimit-reset") || "unknown";

        if (resp.status === 403 || resp.status === 429) {
          const resetTimestamp = parseInt(reset, 10);
          const waitMs = resetTimestamp ? Math.max(1000, resetTimestamp * 1000 - Date.now() + 2000) : 60000;
          logger.rateLimit("GitHub", remaining, reset, waitMs);
          await this.sleep(Math.min(waitMs, 120000)); // Cap wait at 2 mins before moving on
          break;
        }

        if (!resp.ok) {
          logger.warn(`[GitHub] Search HTTP ${resp.status} on page ${page} for: ${query}`);
          break;
        }

        const data = await resp.json();
        const repos = data.items || [];
        if (repos.length === 0) break;

        let vetted = 0;
        for (const r of repos) {
          allRepoUrls.push(r.html_url);

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

          const evalRes = RelevanceFilter.evaluate(entity);
          if (evalRes.isRelevant) {
            db.saveEntity(entity);
            vetted++;
          } else {
            db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons);
          }
        }

        logger.info(`[GitHub] Page ${page}/${maxPages}: Ingested ${vetted}/${repos.length} vetted repos for "${query}"`);
        if (repos.length < 30) break; // Reached last page
      } catch (e) {
        logger.error(`[GitHub] Error on search page ${page} for: ${query}`, e);
        break;
      }
    }

    return allRepoUrls;
  }

  // Crawls repository details using API or robust raw fallback
  static async crawlRepoDetail(repoUrl: string): Promise<boolean> {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return false;
    const [, owner, rawRepo] = match;
    const repo = rawRepo.replace(/\.git$/, "");

    try {
      let title = repo;
      let author = owner;
      let description = "";
      const tags: string[] = [];
      const extLinks: string[] = [];

      // 1. Try raw package.json first (detects VPM packages directly with 0 rate limit!)
      try {
        const pkgUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/package.json`;
        const pkgResp = await fetch(pkgUrl, { headers: { "User-Agent": CONFIG.userAgent } });
        if (pkgResp.ok) {
          const pkg = await pkgResp.json();
          if (pkg.name) title = pkg.displayName || pkg.name;
          if (pkg.author?.name) author = pkg.author.name;
          if (pkg.description) description = pkg.description;
          if (pkg.keywords) tags.push(...pkg.keywords);
          if (pkg.vpmDependencies) {
            tags.push("vpm-package");
            logger.info(`[GitHub] Verified VPM Package via package.json: ${owner}/${repo}`);
          }
        }
      } catch (_) {}

      // 2. Try raw README to extract description and cross-references
      let readmeText = "";
      try {
        const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`;
        const rdResp = await fetch(readmeUrl, { headers: { "User-Agent": CONFIG.userAgent } });
        if (rdResp.ok) {
          readmeText = await rdResp.text();
          if (!description && readmeText) {
            // First paragraph of README as description
            const firstPara = readmeText.split("\n\n").find((p) => p.trim() && !p.trim().startsWith("#"));
            if (firstPara) description = firstPara.trim().slice(0, 300);
          }

          // Cross-reference extraction from README!
          // ONLY queue outbound GitHub links if the target is pre-screened as relevant
          const links = readmeText.match(/https?:\/\/[^\s\)\"]+/g) || [];
          for (const l of links) {
            if (l.includes("github.com") && !l.includes(`${owner}/${repo}`)) {
              const m = l.match(/https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
              if (m && !extLinks.includes(m[0])) {
                const targetUrl = m[0];
                const targetLower = targetUrl.toLowerCase();
                // Reject generic paths and blacklisted orgs
                if (
                  RelevanceFilter.isUrlCandidateRelevant(targetUrl, "github") &&
                  !targetLower.includes("/actions") &&
                  !targetLower.includes("/issues") &&
                  !targetLower.includes("/pulls") &&
                  !targetLower.includes("/blob/") &&
                  !targetLower.includes("/tree/")
                ) {
                  extLinks.push(targetUrl);
                  db.queueUrl(targetUrl, "github");
                }
              }
            } else if (l.includes("booth.pm/ja/items/") || l.includes("booth.pm/en/items/")) {
              const m = l.match(/https:\/\/booth\.pm\/(?:ja|en)\/items\/\d+/);
              if (m && !extLinks.includes(m[0])) {
                extLinks.push(m[0]);
                db.queueUrl(m[0], "booth");
              }
            } else if (l.includes("gumroad.com/l/")) {
              const m = l.match(/https:\/\/[^/]*gumroad\.com\/l\/[^/?#]+/);
              if (m && !extLinks.includes(m[0])) {
                if (RelevanceFilter.isUrlCandidateRelevant(m[0], "gumroad")) {
                  extLinks.push(m[0]);
                  db.queueUrl(m[0], "gumroad");
                }
              }
            } else if (l.endsWith("/vpm.json") || l.endsWith("/index.json")) {
              if (!extLinks.includes(l)) {
                extLinks.push(l);
                db.queueUrl(l, "vpm");
              }
            }
          }
        }
      } catch (_) {}

      // 3. Fallback to scraping public HTML page if description still empty
      if (!description) {
        try {
          const htmlResp = await fetch(`https://github.com/${owner}/${repo}`, {
            headers: { "User-Agent": CONFIG.userAgent }
          });
          if (htmlResp.ok) {
            const html = await htmlResp.text();
            const descMatch = html.match(/<p[^>]*class="[^"]*f4[^"]*"[^>]*>([^<]+)<\/p>/);
            if (descMatch) description = descMatch[1].trim();

            const topicMatches = html.match(/data-ga-click="Topic, [^"]*">([^<]+)<\/a>/g) || [];
            for (const tm of topicMatches) {
              const cleanTopic = tm.replace(/<[^>]+>/g, "").trim();
              if (cleanTopic && !tags.includes(cleanTopic)) tags.push(cleanTopic);
            }
          }
        } catch (_) {}
      }

      const entity: EntityRecord = {
        id: `github:${owner}/${repo}`,
        platform: "github",
        url: `https://github.com/${owner}/${repo}`,
        title: title,
        author: author,
        description: description || `VRChat tool repository by ${owner}`,
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        raw_json: JSON.stringify({ owner, repo, readmeLength: readmeText.length })
      };

      const evalRes = RelevanceFilter.evaluate(entity);
      if (evalRes.isRelevant) {
        db.saveEntity(entity);
        logger.info(`[GitHub] Ingested Repo: ${owner}/${repo} (Score: ${evalRes.score}, Confidence: ${evalRes.confidence.toFixed(2)})`);
      } else {
        db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons);
        logger.info(`[GitHub] Quarantined Repo: ${owner}/${repo} (${evalRes.reasons.join(", ")})`);
      }

      return true;
    } catch (e) {
      logger.error(`[GitHub] Error crawling repo ${repoUrl}`, e);
      return false;
    }
  }
}
