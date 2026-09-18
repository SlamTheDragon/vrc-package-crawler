import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db } from "../db.ts";
import { VpmIndexDriver } from "../drivers/vpm_index.ts";
import { GitHubDriver } from "../drivers/github.ts";
import { CuratedDriver } from "../drivers/curated.ts";

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

export function abortVpmDiscovery() {
  isVpmInterrupted = true;
}

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
    const initialVpmCount = (db.query("SELECT count(*) as c FROM entities WHERE platform = 'vpm' AND is_quarantined = 0").get() as any).c;
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
          ...(CONFIG.githubToken ? { Authorization: `token ${CONFIG.githubToken}` } : {})
        }
      });

      if (!resp.ok) {
        console.log(`  HTTP ${resp.status} - skipping query`);
        continue;
      }

      const data = await resp.json() as any;
      const items = data.items || [];
      console.log(`  Found ${items.length} repositories`);

      for (const repo of items) {
        if (isVpmInterrupted) break;
        const defaultBranch = repo.default_branch || "main";
        const rawBase = `https://raw.githubusercontent.com/${repo.full_name}/${defaultBranch}`;
        const ghPagesBase = `https://${repo.owner.login.toLowerCase()}.github.io/${repo.name}`;

        const probeUrls = [
          `${rawBase}/index.json`,
          `${rawBase}/vpm.json`,
          `${rawBase}/packages.json`,
          `${ghPagesBase}/index.json`,
          `${ghPagesBase}/vpm.json`
        ];

        for (const u of probeUrls) {
          candidateUrls.add(u);
        }
      }

      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.error(`  Error searching query "${q}":`, err);
    }
  }

  if (isVpmInterrupted) return;

  // 2. Validate and crawl candidate feeds
  console.log(`\n[2/3] Probing and crawling ${candidateUrls.size} discovered candidate endpoints...`);
  let successfulFeeds = 0;

  for (const url of candidateUrls) {
    if (isVpmInterrupted) break;
    try {
      const ok = await VpmIndexDriver.crawlManifest(url);
      if (ok) {
        successfulFeeds++;
        db.markStatus(url, "done");
      }
    } catch (_) {}
  }

  if (isVpmInterrupted) return;

  // 3. Ingest creator portfolios dynamically derived from database truth sources
  console.log("\n[3/3] Ingesting creator portfolios dynamically derived from live truth sources...");
  await GitHubDriver.harvestDiscoveredCreators();

  const finalVpmCount = (db.query("SELECT count(*) as c FROM entities WHERE platform = 'vpm' AND is_quarantined = 0").get() as any).c;
  const totalEntities = (db.query("SELECT count(*) as c FROM entities WHERE is_quarantined = 0").get() as any).c;

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
