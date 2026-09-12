import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";
import { db } from "./db.ts";
import { VpmIndexDriver } from "./drivers/vpm_index.ts";
import { GitHubDriver } from "./drivers/github.ts";
import { CuratedDriver } from "./drivers/curated.ts";

const VPM_DISCOVERY_QUERIES = [
  "vpm vrchat sort:updated",
  "vpm package listing vrchat sort:updated",
  "vpm-listing vrchat sort:updated",
  "VCC listing vrchat sort:updated",
  "ALCOM vrchat sort:updated",
  "\"index.json\" \"packages\" vrchat",
  "\"vpm\" \"index.json\" vrchat"
];

let isVpmInterrupted = false;

function shutdownVpm(signal: string) {
  if (isVpmInterrupted) {
    process.exit(130);
  }
  isVpmInterrupted = true;
  console.log(`\n\x1b[33m[VPM DISCOVERY] Interrupted via ${signal}. Flushing database and exiting cleanly...\x1b[0m`);
  try {
    db.close();
  } catch (_) {}
  process.exit(0);
}

export async function runVpmDiscovery() {
  console.log("=================================================");
  console.log("   VPM REPOSITORY DISCOVERY (Claude Skill Specs) ");
  console.log("=================================================");

  try {
    const initialVpmCount = (db as any).db.query("SELECT count(*) as c FROM entities WHERE platform = 'vpm'").get().c;
    console.log(`Current VPM Packages in Database: ${initialVpmCount.toLocaleString()}`);

    // 0. Multi-author decentralized community registry ingestion
    console.log("\n[0/4] Ingesting multi-maintainer community registries & live catalogs...");
    await CuratedDriver.ingestAllCuratedSources();

    if (isVpmInterrupted) return;

    const candidateUrls = new Set<string>();

    // 1. Search GitHub API with specialized VPM listing queries
    console.log("\n[1/3] Executing high-signal GitHub API searches...");
    for (const q of VPM_DISCOVERY_QUERIES) {
      if (isVpmInterrupted) break;
      try {
      console.log(` Searching: "${q}"...`);
      const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=30&sort=updated&order=desc`;
      const resp = await fetch(searchUrl, {
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "application/vnd.github.v3+json",
          ...(CONFIG.githubToken ? { "Authorization": `Bearer ${CONFIG.githubToken}` } : {})
        }
      });

      if (!resp.ok) {
        console.log(`  Search HTTP ${resp.status} (Rate limited or forbidden)`);
        continue;
      }

      const data = await resp.json();
      const items = data.items || [];
      console.log(`  Found ${items.length} repositories.`);

      for (const item of items) {
        db.queueUrl(item.html_url, "github");

        const owner = item.owner?.login;
        const repo = item.name;

        if (item.has_pages && owner) {
          candidateUrls.add(`https://${owner}.github.io/${repo}/index.json`);
          candidateUrls.add(`https://${owner}.github.io/${repo}/vpm.json`);
          candidateUrls.add(`https://${owner}.github.io/vpm/index.json`);
        }

        if (item.homepage && typeof item.homepage === "string" && item.homepage.startsWith("http")) {
          const cleanHome = item.homepage.replace(/\/$/, "");
          if (cleanHome.endsWith(".json")) {
            candidateUrls.add(cleanHome);
          } else {
            candidateUrls.add(`${cleanHome}/index.json`);
            candidateUrls.add(`${cleanHome}/vpm.json`);
          }
        }

        candidateUrls.add(`https://raw.githubusercontent.com/${item.full_name}/HEAD/index.json`);
        candidateUrls.add(`https://raw.githubusercontent.com/${item.full_name}/HEAD/vpm.json`);
      }
    } catch (err) {
      console.error(`  Error searching "${q}":`, err);
    }

    await new Promise((r) => setTimeout(r, CONFIG.githubSearchDelayMs));
  }

  console.log(`\nCollected ${candidateUrls.size} candidate VPM manifest URLs.`);

  // 2. Probing candidate manifests
  console.log("\n[2/3] Probing candidate manifests for live VPM JSON feeds...");
  let successfulFeeds = 0;

  for (const url of candidateUrls) {
    if (isVpmInterrupted) break;
    try {
      const ok = await VpmIndexDriver.crawlManifest(url);
      if (ok) {
        successfulFeeds++;
        db.markDone(url, "vpm");
      }
    } catch (_) {}
  }

  if (isVpmInterrupted) return;

  // 3. Ingest creator portfolios dynamically derived from database truth sources
  console.log("\n[3/3] Ingesting creator portfolios dynamically derived from live truth sources...");
  await GitHubDriver.harvestDiscoveredCreators();

  const finalVpmCount = (db.query("SELECT count(*) as c FROM entities WHERE platform = 'vpm'").get() as any).c;
  const totalEntities = (db.query("SELECT count(*) as c FROM entities").get() as any).c;

  console.log("-------------------------------------------------");
  console.log("  VPM DISCOVERY PIPELINE COMPLETE");
  console.log(`  Initial VPM Packages: ${initialVpmCount.toLocaleString()}`);
  console.log(`  Updated VPM Packages: ${finalVpmCount.toLocaleString()} (+${(finalVpmCount - initialVpmCount).toLocaleString()})`);
  console.log(`  Total Vetted Packages Across All Platforms: ${totalEntities.toLocaleString()}`);
  console.log("=================================================");
  } finally {
    try {
      db.close();
    } catch (_) {}
  }
}

if (import.meta.main) {
  process.on("SIGINT", () => shutdownVpm("SIGINT"));
  process.on("SIGTERM", () => shutdownVpm("SIGTERM"));
  runVpmDiscovery().catch((err) => {
    console.error("VPM discovery failed:", err);
    try { db.close(); } catch (_) {}
    process.exit(1);
  });
}
