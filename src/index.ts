import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";
import { db } from "./db.ts";
import { BoothDriver } from "./drivers/booth.ts";
import { GitHubDriver } from "./drivers/github.ts";
import { VpmIndexDriver } from "./drivers/vpm_index.ts";

async function seedFrontierIfEmpty() {
  const metrics = db.getMetrics();
  if (metrics.totalDiscovered === 0) {
    logger.info("Initializing discovery frontier across primary domains...");

    // 1. BOOTH category 3Dツール・システム pages 1 to 88
    const boothPages: { url: string; platform: "booth" }[] = [];
    for (let p = 1; p <= 88; p++) {
      boothPages.push({
        url: `https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0?page=${p}`,
        platform: "booth"
      });
    }
    const boothQueued = db.queueBatchUrls(boothPages);
    logger.info(`Queued ${boothQueued} BOOTH category browse pages.`);

    // 2. High-value GitHub searches
    const githubQueries = [
      "topic:vrchat topic:vpm",
      "topic:udonsharp",
      "topic:modular-avatar",
      "topic:vrcfury",
      "vrchat-tools",
      "vpm-package",
      "vrchat-unitypackage"
    ];
    for (const q of githubQueries) {
      db.queueUrl(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`, "github");
    }

    // 3. Known VPM Community repository indexes
    const initialVpmFeeds = [
      "https://vpm.anatawa12.com/vpm.json",
      "https://vpm.nadena.dev/vpm.json",
      "https://vrcfury.com/vpm.json",
      "https://hai-vr.github.io/vpm-listing/index.json",
      "https://kurotu.github.io/vpm-repos/index.json"
    ];
    for (const feed of initialVpmFeeds) {
      db.queueUrl(feed, "vpm");
    }
  }
}

async function main() {
  console.log("\x1b[36m");
  console.log("==================================================================");
  console.log("   VRC PACKAGE CRAWLER — AUTONOMOUS DISCOVERY & INGESTION ENGINE  ");
  console.log("==================================================================");
  console.log("\x1b[0m");

  db.resetStaleFetching();
  await seedFrontierIfEmpty();

  let isRunning = true;
  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Gracefully stopping crawler loop...");
    isRunning = false;
  });
  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM. Gracefully stopping crawler loop...");
    isRunning = false;
  });

  let cycle = 0;
  while (isRunning) {
    cycle++;
    const pendingItems = db.getNextPending(CONFIG.batchSize);

    if (pendingItems.length === 0) {
      logger.info("No pending URLs in frontier. Saturation check...");
      const metrics = db.getMetrics();
      logger.info(`Status: Discovered ${metrics.totalDiscovered} URLs, ${metrics.totalEntities} entities ingested.`);
      
      // Sleep before re-checking frontier
      await new Promise((r) => setTimeout(r, 10000));
      continue;
    }

    for (const item of pendingItems) {
      if (!isRunning) break;

      db.markStatus(item.url, "fetching");

      try {
        if (item.platform === "booth") {
          if (item.url.includes("/browse/")) {
            // Category browse page
            const discoveredItemUrls = await BoothDriver.crawlCategoryPage(item.url);
            for (const iurl of discoveredItemUrls) {
              db.queueUrl(iurl, "booth");
            }
            db.markStatus(item.url, "done");
          } else if (item.url.includes("/items/")) {
            // Item detail page
            const ok = await BoothDriver.crawlItemDetail(item.url);
            db.markStatus(item.url, ok ? "done" : "failed");
          }
        } else if (item.platform === "github") {
          if (item.url.includes("/search/")) {
            const queryMatch = item.url.match(/\?q=([^&]+)/);
            const query = queryMatch ? decodeURIComponent(queryMatch[1]) : "vrchat";
            const repoUrls = await GitHubDriver.searchRepos(query);
            for (const rurl of repoUrls) {
              db.queueUrl(rurl, "github");
            }
            db.markStatus(item.url, "done");
          } else {
            const ok = await GitHubDriver.crawlRepoDetail(item.url);
            db.markStatus(item.url, ok ? "done" : "failed");
          }
        } else if (item.platform === "vpm") {
          const ok = await VpmIndexDriver.crawlManifest(item.url);
          db.markStatus(item.url, ok ? "done" : "failed");
        }
      } catch (err) {
        logger.error(`Failed crawling ${item.url}`, err);
        db.markStatus(item.url, "failed");
      }
    }

    // Periodic checkpoint every 5 cycles
    if (cycle % 5 === 0) {
      const metrics = db.getMetrics();
      const saturation = metrics.totalDiscovered > 0 ? (metrics.totalDone / metrics.totalDiscovered) : 0;
      db.recordCheckpoint(saturation, `Cycle ${cycle} completed.`);
      logger.info(`[CHECKPOINT] Total Entities: ${metrics.totalEntities} | Done: ${metrics.totalDone}/${metrics.totalDiscovered} | Saturation: ${(saturation * 100).toFixed(1)}%`);
    }
  }

  logger.info("Crawler loop stopped. Closing database connections.");
  db.close();
  logger.close();
  console.log("Crawler successfully stopped.");
}

main().catch((err) => {
  logger.error("Fatal error in main runner", err);
  process.exit(1);
});
