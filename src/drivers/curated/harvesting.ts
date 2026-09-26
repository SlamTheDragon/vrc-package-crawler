import { CONFIG } from "../../config.ts";
import { logger } from "../../logger.ts";
import { db } from "../../db.ts";
import type { DriverRuntime } from "./runtime.ts";
import { COMMUNITY_REGISTRY_SEEDS } from "./seeding.ts";

// Autonomously extracts any VPM feeds, scoped registries, and repositories from arbitrary text/HTML/markdown
  export function extractAndQueueRegistries(runtime: DriverRuntime, text: string): number {
    if (!text) return 0;
    let queued = 0;

    // 1. Extract vcc://vpm/addRepo?url=... URIs
    const vccMatches = text.match(/vcc:\/\/vpm\/addRepo\?url=([^"'\s<>)]+)/gi) || [];
    for (const vm of vccMatches) {
      try {
        const u = new URL(vm);
        const repoUrl = u.searchParams.get("url");
        if (repoUrl && repoUrl.startsWith("http")) {
          if (db.queueUrl(repoUrl, "vpm")) queued++;
        }
      } catch (_) {}
    }

    // 2. Extract direct manifest JSON endpoints
    const jsonMatches = text.match(/https?:\/\/[^\s"'<>)\]]+\/(?:index|vpm|packages|source|default_repositories)\.json/gi) || [];
    for (const jm of jsonMatches) {
      const clean = jm.replace(/[.,;)]+$/, "");
      if (db.queueUrl(clean, "vpm")) queued++;
    }

    // 3. Extract repositories.txt URLs
    const txtMatches = text.match(/https?:\/\/[^\s"'<>)\]]+\/repositories\.txt/gi) || [];
    for (const tm of txtMatches) {
      const clean = tm.replace(/[.,;)]+$/, "");
      if (db.queueUrl(clean, "vpm")) queued++;
    }

    return queued;
  }

// Ingests any community repository dynamically by probing manifests, source lists, and markdown
  export async function ingestCommunityRepo(runtime: DriverRuntime, repoFullName: string): Promise<number> {
    if (runtime.isAborted || db.isClosed) return 0;
    logger.info(`[Curated] Ingesting community registry: ${repoFullName}...`);
    let queued = 0;
    const branches = ["HEAD", "main", "master"];

    // 1. Probe for repositories.txt across branches
    for (const b of branches) {
      if (runtime.isAborted || db.isClosed) break;
      try {
        const url = `https://raw.githubusercontent.com/${repoFullName}/${b}/repositories.txt`;
        const resp = await fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
        if (resp.ok) {
          const text = await resp.text();
          const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
          for (const line of lines) {
            if (runtime.isAborted || db.isClosed) break;
            if (line.startsWith("http") && db.queueUrl(line, "vpm")) queued++;
          }
          logger.info(`[Curated] Ingested ${queued} VPM feeds from ${repoFullName} (repositories.txt)`);
          break;
        }
      } catch (_) {}
    }

    // 2. Probe for source.json / index.json / vpm.json across branches
    for (const b of branches) {
      if (runtime.isAborted || db.isClosed) break;
      for (const fileName of ["source.json", "index.json", "vpm.json", "packages.json"]) {
        if (runtime.isAborted || db.isClosed) break;
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
      if (runtime.isAborted || db.isClosed) break;
      try {
        const url = `https://raw.githubusercontent.com/${repoFullName}/${b}/README.md`;
        const resp = await fetch(url, { headers: { "User-Agent": CONFIG.userAgent } });
        if (resp.ok) {
          const text = await resp.text();
          const links = text.match(/https?:\/\/[^\s\)\"\'<>]+/g) || [];
          for (const link of links) {
            if (runtime.isAborted || db.isClosed) break;
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
    if (!runtime.isAborted && !db.isClosed) {
      const owner = repoFullName.split("/")[0];
      const repo = repoFullName.split("/")[1];
      // FIXME: how can we even realize non github.io domains?
      if (owner && repo) {
        db.queueUrl(`https://${owner}.github.io/${repo}/index.json`, "vpm");
        db.queueUrl(`https://${owner}.github.io/${repo}/vpm.json`, "vpm");
        db.queueUrl(`https://${owner}.github.io/vpm/index.json`, "vpm");
      }
    }

    return queued;
  }

// Ingests all decentralized community VPM repositories across multiple maintainers
  export async function ingestVpmRepositoriesList(runtime: DriverRuntime): Promise<number> {
    if (runtime.isAborted || db.isClosed) return 0;
    logger.info("[Curated] Ingesting decentralized community VPM repositories across multi-author registries...");
    let total = 0;
    // FIXME: why is this hard coded?
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
      if (runtime.isAborted || db.isClosed) break;
      const c = await ingestCommunityRepo(runtime, repo);
      total += c;
    }
    return total;
  }

// Harvests curated links from multiple awesome-vrchat collections across independent maintainers
  export async function ingestAwesomeVRChat(runtime: DriverRuntime): Promise<number> {
    if (runtime.isAborted || db.isClosed) return 0;
    logger.info("[Curated] Ingesting awesome-vrchat collections across independent maintainers...");
    let total = 0;
    // FIXME: what the hell is awesome vrchat and why is this hardcoded
    const collections = [
      "madjin/awesome-vrchat",
      "misyaguziya/awesome-vrchat",
      "edu3d-lsl/awesome-vrchat"
    ];

    for (const repo of collections) {
      if (runtime.isAborted || db.isClosed) break;
      const c = await ingestCommunityRepo(runtime, repo);
      total += c;
    }
    return total;
  }

// Comprehensive multi-source ingestion combining seeded registries and live dynamic discovery
  export async function ingestAllCuratedSources(runtime: DriverRuntime): Promise<number> {
    if (runtime.isAborted || db.isClosed) return 0;
    logger.info("[Curated] Launching comprehensive multi-source decentralized registry ingestion...");
    let totalQueued = 0;

    // 1. Ingest all decentralized bootstrap seeds via granular category ingesters
    totalQueued += await ingestVpmRepositoriesList(runtime);
    if (runtime.isAborted || db.isClosed) return totalQueued;

    totalQueued += await ingestAwesomeVRChat(runtime);
    if (runtime.isAborted || db.isClosed) return totalQueued;

    // 2. Discover and ingest live dynamic registries on GitHub
    const liveRegistries = await discoverRegistriesOnGitHub(runtime);
    for (const reg of liveRegistries) {
      if (runtime.isAborted || db.isClosed) break;
      if (!COMMUNITY_REGISTRY_SEEDS.includes(reg)) {
        const count = await ingestCommunityRepo(runtime, reg);
        totalQueued += count;
      }
    }

    logger.info(`[Curated] Multi-source ingestion complete. Total community feeds & links queued: ${totalQueued}`);
    return totalQueued;
  }
