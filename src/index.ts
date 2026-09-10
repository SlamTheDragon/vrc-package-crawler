import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";
import { db } from "./db.ts";
import { BoothDriver } from "./drivers/booth.ts";
import { GitHubDriver } from "./drivers/github.ts";
import { VpmIndexDriver } from "./drivers/vpm_index.ts";
import { GumroadDriver } from "./drivers/gumroad.ts";
import { CuratedDriver } from "./drivers/curated.ts";

let isRunning = true;

async function seedAllDomains() {
  const metrics = db.getMetrics();
  logger.info("Checking domain seed status...");

  // 1. Ingest decentralized VPM repositories if none present
  if (metrics.platformStats["vpm"].pending === 0 && metrics.platformStats["vpm"].done === 0) {
    logger.info("Seeding decentralized community VPM repositories...");
    await CuratedDriver.ingestVpmRepositoriesList();
    
    // Core feeds fallback
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

  // 2. Ingest curated awesome-vrchat collections
  if (metrics.platformStats["github"].pending < 5) {
    logger.info("Seeding curated awesome-vrchat collections & GitHub topics...");
    await CuratedDriver.ingestAwesomeVRChat();

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
  }

  // 3. Queue BOOTH browse pages if empty
  if (metrics.platformStats["booth"].pending === 0 && metrics.platformStats["booth"].done === 0) {
    logger.info("Seeding BOOTH category browse pages (1-88)...");
    const boothPages: { url: string; platform: "booth" }[] = [];
    for (let p = 1; p <= 88; p++) {
      boothPages.push({
        url: `https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0?page=${p}`,
        platform: "booth"
      });
    }
    db.queueBatchUrls(boothPages);
  }

  // 4. Queue Gumroad Western creator tools
  if (metrics.platformStats["gumroad"].pending === 0 && metrics.platformStats["gumroad"].done === 0) {
    logger.info("Seeding Western creator tool hubs on Gumroad...");
    const gumroadSeeds = [
      "https://architechvr.gumroad.com/l/protv",
      "https://aleasevr.gumroad.com/l/ik2rig",
      "https://markcreator.gumroad.com/l/Polytool",
      "https://jessycat92.gumroad.com/l/RQDoUj"
    ];
    for (const g of gumroadSeeds) {
      db.queueUrl(g, "gumroad");
    }
  }
}

// Dedicated BOOTH Worker
async function runBoothWorker() {
  logger.info("[Worker:BOOTH] Started.");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("booth", 10);
    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }

    for (const item of items) {
      if (!isRunning) break;
      db.markStatus(item.url, "fetching");

      try {
        if (item.url.includes("/browse/")) {
          const itemUrls = await BoothDriver.crawlCategoryPage(item.url);
          for (const u of itemUrls) {
            db.queueUrl(u, "booth");
          }
          db.markStatus(item.url, "done");
        } else {
          const ok = await BoothDriver.crawlItemDetail(item.url);
          db.markStatus(item.url, ok ? "done" : "failed");
        }
      } catch (err) {
        logger.error(`[Worker:BOOTH] Error on ${item.url}`, err);
        db.markStatus(item.url, "failed");
      }
    }
  }
  logger.info("[Worker:BOOTH] Stopped.");
}

// Dedicated GitHub Worker (with rate limit pacing)
async function runGithubWorker() {
  logger.info("[Worker:GitHub] Started.");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("github", 3);
    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    for (const item of items) {
      if (!isRunning) break;
      db.markStatus(item.url, "fetching");

      try {
        if (item.url.includes("/search/")) {
          const qm = item.url.match(/\?q=([^&]+)/);
          const query = qm ? decodeURIComponent(qm[1]) : "vrchat";
          const repoUrls = await GitHubDriver.searchRepos(query);
          for (const ru of repoUrls) {
            db.queueUrl(ru, "github");
          }
          db.markStatus(item.url, "done");
        } else {
          const ok = await GitHubDriver.crawlRepoDetail(item.url);
          db.markStatus(item.url, ok ? "done" : "failed");
        }
      } catch (err) {
        logger.error(`[Worker:GitHub] Error on ${item.url}`, err);
        db.markStatus(item.url, "failed");
      }
    }
  }
  logger.info("[Worker:GitHub] Stopped.");
}

// Dedicated VPM Manifest Worker (fast JSON parser)
async function runVpmWorker() {
  logger.info("[Worker:VPM] Started.");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("vpm", 5);
    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    for (const item of items) {
      if (!isRunning) break;
      db.markStatus(item.url, "fetching");

      try {
        const ok = await VpmIndexDriver.crawlManifest(item.url);
        db.markStatus(item.url, ok ? "done" : "failed");
      } catch (err) {
        logger.error(`[Worker:VPM] Error on ${item.url}`, err);
        db.markStatus(item.url, "failed");
      }
    }
  }
  logger.info("[Worker:VPM] Stopped.");
}

// Dedicated Gumroad Worker
async function runGumroadWorker() {
  logger.info("[Worker:Gumroad] Started.");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("gumroad", 2);
    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    for (const item of items) {
      if (!isRunning) break;
      db.markStatus(item.url, "fetching");

      try {
        const ok = await GumroadDriver.crawlProduct(item.url);
        db.markStatus(item.url, ok ? "done" : "failed");
      } catch (err) {
        logger.error(`[Worker:Gumroad] Error on ${item.url}`, err);
        db.markStatus(item.url, "failed");
      }
    }
  }
  logger.info("[Worker:Gumroad] Stopped.");
}

// Heartbeat & Checkpoint Monitor
async function runMonitor() {
  let cycle = 0;
  while (isRunning) {
    await new Promise((r) => setTimeout(r, 15000)); // Every 15 seconds
    if (!isRunning) break;
    cycle++;

    const m = db.getMetrics();
    const S = m.totalDiscovered > 0 ? (m.totalDone / m.totalDiscovered) : 0;
    db.recordCheckpoint(S, `Cycle ${cycle} status check`);
    logger.info(`[HEARTBEAT] Total: ${m.totalEntities} entities | Done: ${m.totalDone}/${m.totalDiscovered} | Saturation: ${(S * 100).toFixed(1)}%`);
  }
}

async function main() {
  console.log("\x1b[36m");
  console.log("==================================================================");
  console.log("   VRC PACKAGE CRAWLER — MULTI-DOMAIN CONCURRENT HARVESTER ENGINE ");
  console.log("==================================================================");
  console.log("\x1b[0m");

  db.resetStaleFetching();
  await seedAllDomains();

  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down all concurrent workers...");
    isRunning = false;
  });
  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM. Shutting down all concurrent workers...");
    isRunning = false;
  });

  // Launch ALL domain workers concurrently!
  logger.info("Launching concurrent domain workers: [BOOTH, GitHub, VPM, Gumroad, Monitor]...");
  await Promise.all([
    runBoothWorker(),
    runGithubWorker(),
    runVpmWorker(),
    runGumroadWorker(),
    runMonitor()
  ]);

  logger.info("All workers exited cleanly. Closing database connections.");
  db.close();
  logger.close();
  console.log("Engine terminated cleanly.");
}

main().catch((err) => {
  logger.error("Fatal error in main runner", err);
  process.exit(1);
});
