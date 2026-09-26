import { CONFIG } from "../../config.ts";
import { logger } from "../../logger.ts";
import { db, type EntityRecord, type CrawlerDB } from "../../db.ts";
import { RelevanceFilter, CREATOR_ALIASES } from "../../filter.ts";
import { IanaRegistry } from "../../utils/iana.ts";
import { cleanTitle, cleanAuthorName, cleanDescription, extractReadmeDescription } from "../../utils/sanitizer.ts";
import type { DriverRuntime } from "./runtime.ts";

export function getHeaders(runtime: DriverRuntime): Record<string, string> {
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
  export async function searchRepos(runtime: DriverRuntime, query: string, maxPages: number = 3): Promise<string[]> {
    if (runtime.isAborted || db.isClosed) return [];
    logger.info(`[GitHub] Executing paginated search: "${query}" (up to ${maxPages} pages)`);
    const allRepoUrls: string[] = [];

    for (let page = 1; page <= maxPages; page++) {
      if (runtime.isAborted || db.isClosed) break;
      try {
        await runtime.sleep(CONFIG.githubSearchDelayMs);

        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=30&page=${page}`;
        const resp = await fetch(url, { headers: getHeaders() });

        const remaining = resp.headers.get("x-ratelimit-remaining") || "unknown";
        const reset = resp.headers.get("x-ratelimit-reset") || "unknown";

        if (resp.status === 403 || resp.status === 429) {
          const resetTimestamp = parseInt(reset, 10);
          const waitMs = resetTimestamp ? Math.max(1000, resetTimestamp * 1000 - Date.now() + 2000) : 60000;
          logger.rateLimit("GitHub", remaining, reset, waitMs);
          await runtime.sleep(Math.min(waitMs, 120000)); // Cap wait at 2 mins before moving on
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
