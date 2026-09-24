import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db, type EntityRecord } from "../db.ts";
import { RelevanceFilter, CREATOR_ALIASES } from "../filter.ts";
import { IanaRegistry } from "../utils/iana.ts";
import { cleanTitle, cleanAuthorName, cleanDescription, extractReadmeDescription } from "../utils/sanitizer.ts";

export class GitHubDriver {
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
    if (this.isAborted || db.isClosed) return [];
    logger.info(`[GitHub] Executing paginated search: "${query}" (up to ${maxPages} pages)`);
    const allRepoUrls: string[] = [];

    for (let page = 1; page <= maxPages; page++) {
      if (this.isAborted || db.isClosed) break;
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

        const data = (await resp.json()) as any;
        const repos = data.items || [];
        if (repos.length === 0) break;

        let vetted = 0;
        for (const r of repos) {
          allRepoUrls.push(r.html_url);

          const originCreated = r.created_at || null;
          const originUpdated = r.updated_at || r.pushed_at || null;

          const entity: EntityRecord = {
            id: `github:${r.full_name}`,
            platform: "github",
            url: r.html_url,
            title: cleanTitle(r.name),
            author: cleanAuthorName(r.owner?.login || "Unknown"),
            description: r.description || "",
            tags_json: JSON.stringify(r.topics || []),
            external_links_json: JSON.stringify([r.homepage].filter(Boolean)),
            origin_created_at: originCreated,
            origin_updated_at: originUpdated,
            raw_json: JSON.stringify({
              stargazers_count: r.stargazers_count,
              forks_count: r.forks_count,
              default_branch: r.default_branch,
              license: r.license?.spdx_id,
              originCreatedAt: originCreated,
              originUpdatedAt: originUpdated,
              // Social preview image (GitHub OpenGraph card — public URL, no binary)
              thumbnail_url: r.owner?.avatar_url || null,
              // GitHub repo social preview card: https://opengraph.githubassets.com/1/{full_name}
              media_urls: r.full_name ? [`https://opengraph.githubassets.com/1/${r.full_name}`] : [],
              youtube_urls: []
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
            db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons, entity);
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
      let rawEtag: string | null = null;
      let rawLastModified: string | null = null;

      // 1. Try raw package.json first across branch candidates (detects VPM packages directly with 0 rate limit!)
      const branchCandidates = ["HEAD", "main", "master"];
      for (const branch of branchCandidates) {
        try {
          const pkgUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`;
          const pkgResp = await fetch(pkgUrl, { headers: { "User-Agent": CONFIG.userAgent } });
          if (pkgResp.ok) {
            rawEtag = pkgResp.headers.get("etag");
            rawLastModified = pkgResp.headers.get("last-modified");
            const pkg = (await pkgResp.json()) as any;
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

      let readmeDesc = "";
      if (readmeText) {
        readmeDesc = extractReadmeDescription(readmeText, description);
        if (readmeDesc) {
          description = readmeDesc;
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
            
            // Try og:description meta tag (reliable description on GitHub)
            const ogMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:description|description)["']\s+content=["'](.*?)["']/i);
            if (ogMatch) {
              const cleanOg = ogMatch[1].replace(/\s*-\s*[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "").trim();
              if (cleanOg && !cleanOg.startsWith("GitHub -")) {
                if (readmeText) {
                  description = extractReadmeDescription(readmeText, cleanOg);
                } else if (!description) {
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

      let originCreatedAt: string | null = null;
      let originUpdatedAt: string | null = null;
      if (rawLastModified) {
        try {
          originUpdatedAt = new Date(rawLastModified).toISOString();
        } catch (_) {}
      }

      // If GitHub Token is available, fetch exact upstream creation and push dates
      if (CONFIG.githubToken) {
        try {
          const apiResp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: this.getHeaders()
          });
          if (apiResp.ok) {
            const apiData = (await apiResp.json()) as any;
            if (apiData.created_at) originCreatedAt = apiData.created_at;
            if (apiData.pushed_at || apiData.updated_at) originUpdatedAt = apiData.pushed_at || apiData.updated_at;
            if (apiData.description) {
              if (readmeText) {
                description = extractReadmeDescription(readmeText, apiData.description);
              } else if (!description) {
                description = apiData.description;
              }
            }
            if (apiData.topics && Array.isArray(apiData.topics)) {
              for (const tp of apiData.topics) {
                if (!tags.includes(tp)) tags.push(tp);
              }
            }
          }
        } catch (_) {}
      }

      // Extract YouTube video links from README (e.g. demo videos, tutorials)
      const ytReadme = readmeText.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})[^\s\)\"<>]*/gi) || [];
      const ytSet = new Set<string>();
      for (const yt of ytReadme) {
        const match = yt.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
        if (match) {
          ytSet.add(`https://www.youtube.com/watch?v=${match[1]}`);
        }
      }
      const youtubeUrls = Array.from(ytSet);

      // Extract candidate screenshots/images from README (quality-filtered, excluding badges)
      const mediaSet = new Set<string>();
      mediaSet.add(`https://opengraph.githubassets.com/1/${owner}/${repo}`);
      if (readmeText) {
        const imgMatches = readmeText.match(/https?:\/\/[^\s\)\"]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s\)\"]*)?/gi) || [];
        for (const img of imgMatches) {
          const cleanImg = img.split(/[?#]/)[0];
          const lower = cleanImg.toLowerCase();
          if (
            lower.includes("shields.io") ||
            lower.includes("badge") ||
            lower.includes("travis-ci") ||
            lower.includes("github.com/workflows") ||
            lower.includes("/actions/") ||
            lower.includes("coveralls.io") ||
            lower.includes("codecov.io") ||
            lower.includes("discord.gg") ||
            lower.includes("slack.com") ||
            lower.includes("icon") ||
            lower.includes("logo") ||
            lower.includes("favicon")
          ) {
            continue;
          }
          mediaSet.add(cleanImg);
          if (mediaSet.size >= 10) break;
        }
      }
      const mediaUrls = Array.from(mediaSet);

      const entity: EntityRecord = {
        id: `github:${owner}/${repo}`,
        platform: "github",
        url: `https://github.com/${owner}/${repo}`,
        title: cleanTitle(title),
        author: cleanAuthorName(author),
        description: cleanDescription(description),
        tags_json: JSON.stringify(tags),
        external_links_json: JSON.stringify(extLinks),
        origin_created_at: originCreatedAt,
        origin_updated_at: originUpdatedAt,
        raw_json: JSON.stringify({
          owner,
          repo,
          readmeLength: readmeText.length,
          readmeExcerpt: readmeDesc ? readmeDesc.slice(0, 500) : undefined,
          hasReleaseAssets,
          latestReleaseAsset,
          etag: rawEtag,
          lastModified: rawLastModified,
          originCreatedAt,
          originUpdatedAt,
          // Social preview image (GitHub OpenGraph card — public URL, no binary download)
          thumbnail_url: `https://opengraph.githubassets.com/1/${owner}/${repo}`,
          media_urls: mediaUrls,
          youtube_urls: youtubeUrls
        })
      };

      const evalRes = RelevanceFilter.evaluate(entity);
      if (evalRes.isRelevant) {
        db.saveEntity(entity);
        logger.info(`[GitHub] Ingested Repo: ${owner}/${repo} (Score: ${evalRes.score}, Confidence: ${evalRes.confidence.toFixed(2)})`);
      } else {
        db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons, entity);
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
    if (this.isAborted || db.isClosed) return 0;
    logger.info(`[GitHub] Harvesting repository portfolios for ${creators.length} creators...`);
    let totalHarvested = 0;

    for (const rawCreator of creators) {
      if (this.isAborted || db.isClosed) break;
      if (!rawCreator || typeof rawCreator !== "string") continue;
      const cleanHandle = rawCreator.trim().replace(/^@/, "");

      // Dynamic ground-truth validation: valid GitHub handle syntax, not an IANA TLD, not an SDK namespace
      if (
        cleanHandle.length < 3 ||
        cleanHandle.length > 39 ||
        !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(cleanHandle) ||
        IanaRegistry.isTld(cleanHandle) ||
        ["base", "worlds", "avatars", "core", "community", "unknown", "listing-action-type-detection"].includes(cleanHandle.toLowerCase())
      ) {
        continue;
      }

      const creator = CREATOR_ALIASES[cleanHandle.toLowerCase()] || cleanHandle;
      if (this.harvestedCreators.has(creator.toLowerCase())) continue;

      const existing = db.prepare(
        "SELECT COUNT(*) as c FROM entities WHERE is_quarantined = 0 AND platform = 'github' AND (LOWER(author) = LOWER(?) OR LOWER(author) = LOWER(?));"
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
          const reset = resp.headers.get("x-ratelimit-reset") || "0";
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
            // Tier 3: Targeted Search API query with creator user/org scope
            logger.info(`[GitHub] Creator @${creator} 404 under /users/ and /orgs/. Probing alternative path via targeted search API...`);
            await this.sleep(CONFIG.githubSearchDelayMs);
            const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent("user:" + creator + " vrchat")}&per_page=10`;
            const searchResp = await fetch(searchUrl, { headers: this.getHeaders() });
            if (searchResp.ok) {
              const searchData = (await searchResp.json()) as any;
              if (searchData.items && searchData.items.length > 0) {
                repos = searchData.items;
                resolvedPath = "search_discovery";
                logger.info(`[GitHub] Alternative path resolved via targeted search for @${creator}: discovered ${repos?.length || 0} repository matches!`);
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
            title: cleanTitle(r.name),
            author: cleanAuthorName(r.owner?.login || creator),
            description: r.description || "",
            tags_json: JSON.stringify(r.topics || []),
            external_links_json: JSON.stringify([r.homepage].filter(Boolean)),
            origin_created_at: r.created_at || null,
            origin_updated_at: r.updated_at || null,
            raw_json: JSON.stringify({
              stargazers_count: r.stargazers_count,
              forks_count: r.forks_count,
              default_branch: r.default_branch,
              license: r.license?.spdx_id,
              originCreatedAt: r.created_at,
              originUpdatedAt: r.updated_at,
              resolved_via: resolvedPath
            })
          };

          const evalRes = RelevanceFilter.evaluate(entity);
          if (evalRes.isRelevant) {
            db.saveEntity(entity);
            creatorVetted++;
            totalHarvested++;
          } else {
            db.quarantineEntity(entity.id, entity.platform, entity.url, entity.title, entity.author, evalRes.reasons, entity);
          }


          // Queue repo into frontier for deep README cross-link inspection
          db.queueUrl(repoUrl, "github", 10);
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
  static async harvestDiscoveredCreators(maxCreators: number = 150): Promise<number> {
    if (this.isAborted || db.isClosed) return 0;
    logger.info("[GitHub] Deriving dynamic creator list from database entities truth source...");
    const discovered = new Set<string>();

    // 1. Extract creators from verified VPM packages and community registries
    const vpmAuthors = db.prepare(`
      SELECT DISTINCT author FROM entities 
      WHERE is_quarantined = 0 AND author IS NOT NULL AND author != '' AND author != 'Unknown' AND author != 'VRChat'
      LIMIT ?;
    `).all(maxCreators) as { author: string }[];
    for (const r of vpmAuthors) {
      const clean = (r.author || "").trim().replace(/^@/, "");
      if (clean.length >= 3 && clean.length <= 39 && /^[a-zA-Z0-9_-]+$/.test(clean) && !IanaRegistry.isTld(clean)) {
        discovered.add(clean);
      }
    }

    // 2. Extract owners from GitHub entity URLs
    const ghUrls = db.prepare(`
      SELECT url FROM entities 
      WHERE is_quarantined = 0 AND (platform = 'github' OR url LIKE '%github.com/%')
      LIMIT ?;
    `).all(maxCreators * 3) as { url: string }[];
    for (const r of ghUrls) {
      const match = r.url.match(/github\.com\/([a-zA-Z0-9_-]+)\//i);
      if (match && match[1] && !match[1].includes(".") && match[1].length >= 3 && match[1].length <= 39 && !IanaRegistry.isTld(match[1])) {
        if (match[1].toLowerCase() !== "vrchat") {
          discovered.add(match[1]);
        }
      }
    }

    const creatorList = Array.from(discovered);
    logger.info(`[GitHub] Harvesting dynamically discovered portfolios for ${creatorList.length} creators derived from truth sources...`);
    return this.harvestCreatorRepos(creatorList);
  }
}

