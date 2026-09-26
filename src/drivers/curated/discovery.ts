import { CONFIG } from "../../config.ts";
import { logger } from "../../logger.ts";
import { db } from "../../db.ts";
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

// Dynamically queries GitHub search API for new community VPM catalogs and awesome lists
  export async function discoverRegistriesOnGitHub(runtime: DriverRuntime): Promise<string[]> {
    if (runtime.isAborted || db.isClosed) return [];
    logger.info("[Curated] Dynamically discovering community VPM registries and curated collections across GitHub...");
    // FIXME: should this be hardcoded?
    const queries = [
      "vpm-repos in:name",
      "vpm-listing in:name",
      "vpm-catalog in:name",
      "vpm-packages in:name",
      "awesome-vrchat in:name"
    ];
    const discovered = new Set<string>();

    for (const q of queries) {
      if (runtime.isAborted || db.isClosed) break;
      try {
        await runtime.sleep(CONFIG.githubSearchDelayMs);
        if (runtime.isAborted || db.isClosed) break;
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=20&sort=updated`;
        const resp = await fetch(url, { headers: getHeaders() });
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
