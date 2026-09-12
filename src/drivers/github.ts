import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";
import { RelevanceFilter, TOP_VRCHAT_CREATORS, CREATOR_ALIASES } from "../filter.ts";

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

            // Proactive VPM manifest discovery ONLY if repository context indicates VPM
            const repoLower = `${r.name} ${r.description || ""}`.toLowerCase();
            const topicsLower = (r.topics || []).join(" ").toLowerCase();
            const isVpmCandidate =
              repoLower.includes("vpm") ||
              repoLower.includes("vcc") ||
              repoLower.includes("listing") ||
              topicsLower.includes("vpm") ||
              topicsLower.includes("vcc");

            if (isVpmCandidate) {
              if (r.has_pages) {
                db.queueUrl(`https://${r.owner.login}.github.io/${r.name}/index.json`, "vpm");
                db.queueUrl(`https://${r.owner.login}.github.io/${r.name}/vpm.json`, "vpm");
                db.queueUrl(`https://${r.owner.login}.github.io/vpm/index.json`, "vpm");
              }
              if (r.homepage && typeof r.homepage === "string" && r.homepage.startsWith("http")) {
                const cleanHome = r.homepage.replace(/\/$/, "");
                if (cleanHome.endsWith(".json")) {
                  db.queueUrl(cleanHome, "vpm");
                } else if (cleanHome.includes("vpm")) {
                  db.queueUrl(`${cleanHome}/index.json`, "vpm");
                  db.queueUrl(`${cleanHome}/vpm.json`, "vpm");
                }
              }
              db.queueUrl(`https://raw.githubusercontent.com/${r.full_name}/HEAD/index.json`, "vpm");
            }
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

      // 1. Try raw package.json first across branch candidates (detects VPM packages directly with 0 rate limit!)
      const branchCandidates = ["HEAD", "main", "master"];
      for (const branch of branchCandidates) {
        try {
          const pkgUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`;
          const pkgResp = await fetch(pkgUrl, { headers: { "User-Agent": CONFIG.userAgent } });
          if (pkgResp.ok) {
            const pkg = await pkgResp.json();
            if (pkg.name) title = pkg.displayName || pkg.name;
            if (pkg.author?.name) author = pkg.author.name;
            if (pkg.description) description = pkg.description;
            if (pkg.keywords) tags.push(...pkg.keywords);
            if (pkg.vpmDependencies) {
              tags.push("vpm-package");
              logger.info(`[GitHub] Verified VPM Package via package.json (${branch}): ${owner}/${repo}`);
            }
            break;
          }
        } catch (_) {}
      }

      // 2. Try raw README across branch candidates to extract description and cross-references
      let readmeText = "";
      for (const branch of branchCandidates) {
        for (const readmeFile of ["README.md", "readme.md", "README.ja.md"]) {
          try {
            const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${readmeFile}`;
            const rdResp = await fetch(readmeUrl, { headers: { "User-Agent": CONFIG.userAgent } });
            if (rdResp.ok) {
              readmeText = await rdResp.text();
              break;
            }
          } catch (_) {}
        }
        if (readmeText) break;
      }

      if (readmeText) {
        if (!description) {
          // First non-image, non-header paragraph of README as description
          const firstPara = readmeText.split("\n\n").find((p) => {
            const t = p.trim();
            return t && !t.startsWith("#") && !t.startsWith("![") && !t.startsWith("<img") && !t.startsWith("[![");
          });
          if (firstPara) {
            description = firstPara.trim().replace(/!\[.*?\]\(.*?\)/g, "").replace(/<[^>]+>/g, "").slice(0, 300);
          }
        }

          // Harvest ecosystem keywords from README text if present
          if (readmeText) {
            const lowerReadme = readmeText.toLowerCase();
            const terms = ["vrchat", "vpm", "udon", "unity", "modular avatar", "vrcfury", "ndmf", "physbone", "avatar optimizer"];
            for (const term of terms) {
              if (lowerReadme.includes(term) && !tags.includes(term)) {
                tags.push(term);
              }
            }
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

      // 3. Fallback to scraping public HTML page if description still empty
      if (!description || tags.length === 0) {
        try {
          const htmlResp = await fetch(`https://github.com/${owner}/${repo}`, {
            headers: { "User-Agent": CONFIG.userAgent }
          });
          if (htmlResp.ok) {
            const html = await htmlResp.text();
            
            // Try og:description meta tag first (most reliable description on GitHub)
            if (!description) {
              const ogMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:description|description)["']\s+content=["'](.*?)["']/i);
              if (ogMatch) {
                const cleanOg = ogMatch[1].replace(/\s*-\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "").trim();
                if (cleanOg && !cleanOg.startsWith("GitHub -")) {
                  description = cleanOg;
                }
              }
            }

            const topicMatches = html.match(/data-ga-click="Topic, [^"]*">([^<]+)<\/a>/g) || html.match(/href="\/topics\/([^"]+)"/g) || [];
            for (const tm of topicMatches) {
              const cleanTopic = tm.replace(/<[^>]+>/g, "").replace('href="/topics/', "").replace('"', "").trim();
              if (cleanTopic && !tags.includes(cleanTopic)) tags.push(cleanTopic);
            }
          } else if (htmlResp.status === 404) {
            // 404 repository fallback: check if repo was moved or transferred
            logger.info(`[GitHub] Repository 404 on ${repoUrl}. Probing alternative path via search for "${repo}"...`);
            try {
              const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(repo + " " + owner)}&per_page=3`;
              const searchResp = await fetch(searchUrl, { headers: this.getHeaders() });
              if (searchResp.ok) {
                const sData = (await searchResp.json()) as any;
                const matchItem = (sData.items || []).find((it: any) => it.name.toLowerCase() === repo.toLowerCase());
                if (matchItem && matchItem.html_url !== repoUrl) {
                  logger.info(`[GitHub] Alternative repository path resolved: ${matchItem.html_url}`);
                  db.queueUrl(matchItem.html_url, "github");
                  return this.crawlRepoDetail(matchItem.html_url);
                }
              }
            } catch (_) {}
          }
        } catch (_) {}
      }

      // 4. Check for binary release assets (.zip, .unitypackage)
      let hasReleaseAssets = false;
      let latestReleaseAsset = "";
      try {
        const relResp = await fetch(`https://github.com/${owner}/${repo}/releases/latest`, {
          headers: { "User-Agent": CONFIG.userAgent }
        });
        if (relResp.ok) {
          const relHtml = await relResp.text();
          const zipMatch = relHtml.match(/href="([^"]+\.(?:zip|unitypackage))"/i);
          if (zipMatch) {
            hasReleaseAssets = true;
            latestReleaseAsset = zipMatch[1];
            if (!tags.includes("verified-release")) tags.push("verified-release");
          }
        }
      } catch (_) {}

      const entity: EntityRecord = {
        id: `github:${owner}/${repo}`,
        platform: "github",
        url: `https://github.com/${owner}/${repo}`,
        title: title,
        author: author,
        description: description,
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        raw_json: JSON.stringify({
          owner,
          repo,
          readmeLength: readmeText.length,
          hasReleaseAssets,
          latestReleaseAsset
        })
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

  private static harvestedCreators = new Set<string>();

  // Harvests full repository portfolios for prominent VRChat creator accounts with multi-tier fallback
  static async harvestCreatorRepos(creators: string[]): Promise<number> {
    logger.info(`[GitHub] Harvesting repository portfolios for ${creators.length} top creators...`);
    let totalHarvested = 0;

    for (const rawCreator of creators) {
      const creator = CREATOR_ALIASES[rawCreator.toLowerCase()] || rawCreator;
      if (this.harvestedCreators.has(creator.toLowerCase())) continue;

      const existing = db.prepare(
        "SELECT COUNT(*) as c FROM entities WHERE platform = 'github' AND (LOWER(author) = LOWER(?) OR LOWER(author) = LOWER(?));"
      ).get(creator, rawCreator) as any;
      if (existing && existing.c >= 3) {
        this.harvestedCreators.add(creator.toLowerCase());
        this.harvestedCreators.add(rawCreator.toLowerCase());
        continue;
      }

      try {
        await this.sleep(CONFIG.githubSearchDelayMs);
        
        let repos: any[] | null = null;
        let resolvedPath = "user";
        
        // Tier 1: Try user profile repos endpoint
        const userUrl = `https://api.github.com/users/${creator}/repos?per_page=100&type=owner`;
        let resp = await fetch(userUrl, { headers: this.getHeaders() });

        if (resp.status === 403 || resp.status === 429) {
          const reset = resp.headers.get("x-ratelimit-reset");
          const remaining = resp.headers.get("x-ratelimit-remaining") || "0";
          logger.rateLimit("GitHub", remaining, reset, 30000);
          break; // Stop harvesting if rate limited
        }

        if (resp.ok) {
          repos = (await resp.json()) as any[];
        } else if (resp.status === 404) {
          // Tier 2: Organization repos endpoint (alternative path)
          logger.info(`[GitHub] Creator @${creator} returned 404 under /users/. Probing alternative path: /orgs/${creator}/repos...`);
          await this.sleep(CONFIG.githubSearchDelayMs);
          const orgUrl = `https://api.github.com/orgs/${creator}/repos?per_page=100`;
          const orgResp = await fetch(orgUrl, { headers: this.getHeaders() });
          if (orgResp.ok) {
            repos = (await orgResp.json()) as any[];
            resolvedPath = "organization";
            logger.info(`[GitHub] Alternative path resolved: @${creator} is an active GitHub organization! Ingesting repos...`);
          } else if (orgResp.status === 404) {
            // Tier 3: Search API query for creator + vrchat (alternative path)
            logger.info(`[GitHub] Creator @${creator} 404 under /users/ and /orgs/. Probing alternative path via search API...`);
            await this.sleep(CONFIG.githubSearchDelayMs);
            const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(rawCreator + " vrchat")}&per_page=10`;
            const searchResp = await fetch(searchUrl, { headers: this.getHeaders() });
            if (searchResp.ok) {
              const searchData = (await searchResp.json()) as any;
              if (searchData.items && searchData.items.length > 0) {
                repos = searchData.items;
                resolvedPath = "search_discovery";
                logger.info(`[GitHub] Alternative path resolved via search for "${rawCreator}": discovered ${repos.length} repository matches!`);
              }
            }
          }
        }

        if (!repos || !Array.isArray(repos) || repos.length === 0) {
          logger.warn(`[GitHub] All alternative paths failed for creator @${creator} (query: ${rawCreator})`);
          this.harvestedCreators.add(creator.toLowerCase());
          this.harvestedCreators.add(rawCreator.toLowerCase());
          continue;
        }

        let creatorVetted = 0;
        for (const r of repos) {
          if (r.fork) continue;
          const repoUrl = r.html_url;

          const entity: EntityRecord = {
            id: `github:${r.full_name}`,
            platform: "github",
            url: repoUrl,
            title: r.name,
            author: r.owner?.login || creator,
            description: r.description || "",
            tags_json: JSON.stringify(r.topics || []),
            external_links_json: JSON.stringify([r.homepage].filter(Boolean)),
            raw_json: JSON.stringify({
              stargazers_count: r.stargazers_count,
              forks_count: r.forks_count,
              default_branch: r.default_branch,
              license: r.license?.spdx_id,
              resolved_via: resolvedPath
            })
          };

          const evalRes = RelevanceFilter.evaluate(entity);
          if (evalRes.isRelevant) {
            db.saveEntity(entity);
            creatorVetted++;
            totalHarvested++;
          } else {
            db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons);
          }

          // Queue repo into frontier for deep README cross-link inspection
          db.queueUrl(repoUrl, "github");
        }

        this.harvestedCreators.add(creator.toLowerCase());
        this.harvestedCreators.add(rawCreator.toLowerCase());
        logger.info(`[GitHub] Creator @${creator} [${resolvedPath}]: Ingested ${creatorVetted}/${repos.length} vetted repositories.`);
      } catch (e) {
        logger.error(`[GitHub] Error harvesting repos for @${creator}`, e);
      }
    }

    logger.info(`[GitHub] Completed creator portfolio harvest. Total vetted repos ingested: ${totalHarvested}`);
    return totalHarvested;
  }

  // Harvests portfolios for dynamically discovered creators from database truth sources (VPM manifests, cross-references, GitHub repos)
  static async harvestDiscoveredCreators(maxCreators: number = 100): Promise<number> {
    logger.info("[GitHub] Deriving dynamic creator list from database entities truth source...");
    const discovered = new Set<string>();

    // 1. Extract creators from verified VPM packages and community registries
    const vpmAuthors = db.prepare(`
      SELECT DISTINCT author FROM entities 
      WHERE platform = 'vpm' AND author IS NOT NULL AND author != '' AND author != 'Unknown'
      LIMIT ?;
    `).all(maxCreators) as { author: string }[];
    for (const r of vpmAuthors) {
      if (r.author && r.author.length < 40 && !r.author.includes(" ")) {
        discovered.add(r.author);
      }
    }

    // 2. Extract owners from GitHub entity URLs
    const ghUrls = db.prepare(`
      SELECT url FROM entities 
      WHERE platform = 'github' AND url LIKE 'https://github.com/%'
      LIMIT ?;
    `).all(maxCreators * 2) as { url: string }[];
    for (const r of ghUrls) {
      const match = r.url.match(/https:\/\/github\.com\/([^/]+)/);
      if (match && match[1] && !match[1].includes(".") && match[1].length < 40) {
        discovered.add(match[1]);
      }
    }

    // 3. Include bootstrap creator seeds to ensure cold-start coverage
    for (const c of TOP_VRCHAT_CREATORS) {
      discovered.add(c);
    }

    const creatorList = Array.from(discovered);
    logger.info(`[GitHub] Harvesting dynamically discovered portfolios for ${creatorList.length} creators...`);
    return this.harvestCreatorRepos(creatorList);
  }
}

export { TOP_VRCHAT_CREATORS } from "../filter.ts";

