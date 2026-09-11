import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";
import { db } from "./db.ts";
import { BoothDriver } from "./drivers/booth.ts";
import { GitHubDriver } from "./drivers/github.ts";
import { VpmIndexDriver } from "./drivers/vpm_index.ts";
import { GumroadDriver } from "./drivers/gumroad.ts";
import { JinxxyDriver } from "./drivers/jinxxy.ts";
import { CuratedDriver } from "./drivers/curated.ts";
import { rateLimiter } from "./ratelimit.ts";

let isRunning = true;

// Search queries for Gumroad internal discover engine
const GUMROAD_SEARCH_QUERIES = [
  "vrchat tool",
  "vrchat system",
  "vrchat script",
  "vrchat udon",
  "vrchat unity",
  "vrcfury",
  "modular avatar",
  "vrchat shader",
  "vpm",
  "unitypackage vrchat",
  "vrchat osc",
  "vrchat editor",
  "vrchat camera",
  "vrchat physics",
  "vrchat world",
  "vrchat prefab"
];

// Curated Jinxxy tags and categories
const JINXXY_TAGS = [
  "tool", "tools", "script", "scripts", "system", "systems", "udon", "udonsharp",
  "vrcfury", "modular-avatar", "shader", "shaders", "editor", "osc", "camera", "unity",
  "physics", "preset", "animation"
];

const JINXXY_CATEGORIES = [
  "https://jinxxy.com/market/scripts-tools",
  "https://jinxxy.com/market/particles-shaders",
  "https://jinxxy.com/market/world-assets"
];

async function seedAllDomains() {
  const metrics = db.getMetrics();
  logger.info("Checking domain seed status...");

  // 1. Ingest decentralized VPM repositories
  if (metrics.platformStats["vpm"].pending < 10 && metrics.platformStats["vpm"].done < 50) {
    logger.info("Seeding decentralized community VPM repositories from repositories.txt (300 repos)...");
    await CuratedDriver.ingestVpmRepositoriesList();
    
    const coreFeeds = [
      "https://vpm.anatawa12.com/vpm.json",
      "https://vpm.nadena.dev/vpm.json",
      "https://vcc.vrcfury.com",
      "https://hai-vr.github.io/vpm-listing/index.json",
      "https://kurotu.github.io/vpm-repos/index.json",
      "https://vrchat-community.github.io/curated-packages/index.json",
      "https://cyanlaser.github.io/CyanTrigger/index.json",
      "https://rurre.github.io/vpm/index.json",
      "https://vpm.razgriz.one/index.json"
    ];
    for (const feed of coreFeeds) {
      db.queueUrl(feed, "vpm");
    }
  }

  // 2. Ingest curated awesome-vrchat collections & expanded GitHub queries
  if (metrics.platformStats["github"].pending < 20) {
    logger.info("Seeding curated awesome-vrchat collections & expanded GitHub queries...");
    await CuratedDriver.ingestAwesomeVRChat();

    const githubQueries = [
      "topic:vrchat",
      "topic:vpm",
      "topic:udonsharp",
      "topic:modular-avatar",
      "topic:vrcfury",
      "topic:ndmf",
      "topic:vrc-osc",
      "topic:vrchat-tools",
      "vrchat-tools in:name,description",
      "vpm-package in:name,description",
      "vrchat-unitypackage in:name,description",
      "udon in:name,description",
      "vrc-avatar in:name,description",
      "\"vpmDependencies\" filename:package.json",
      "\"com.vrchat\" filename:package.json"
    ];
    for (const q of githubQueries) {
      db.queueUrl(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`, "github");
    }
  }

  // 3. Queue BOOTH browse pages and high-signal keyword searches
  if (metrics.platformStats["booth"].pending === 0 && metrics.platformStats["booth"].done === 0) {
    logger.info("Seeding BOOTH category browse pages (1-88)...");
    const boothPages: { url: string; platform: "booth" }[] = [];
    for (let p = 1; p <= 88; p++) {
      boothPages.push({
        url: `https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0?page=${p}`,
        platform: "booth"
      });
    }

    // High signal searches to catch tools filed outside category 208
    const boothSearches = [
      "VRChat ツール",
      "VRChat システム",
      "Udon",
      "Modular Avatar",
      "lilToon"
    ];
    for (const bs of boothSearches) {
      for (let p = 1; p <= 5; p++) {
        boothPages.push({
          url: `https://booth.pm/ja/search/${encodeURIComponent(bs)}?page=${p}`,
          platform: "booth"
        });
      }
    }

    db.queueBatchUrls(boothPages);
  }

  // 4. Queue Western creator tool storefronts on Gumroad
  if (metrics.platformStats["gumroad"].pending < 5) {
    logger.info("Seeding Western creator tool hubs on Gumroad...");
    const gumroadHubs = [
      "https://vrlabs.gumroad.com",
      "https://dreadrith.gumroad.com",
      "https://architechvr.gumroad.com",
      "https://aleasevr.gumroad.com",
      "https://markcreator.gumroad.com",
      "https://rollthered.gumroad.com",
      "https://hfcred.gumroad.com",
      "https://phasedragon.gumroad.com",
      "https://hai-vr.gumroad.com",
      "https://lyuma.gumroad.com",
      "https://jessycat92.gumroad.com",
      "https://boopdoodle.gumroad.com",
      "https://zenithvr.gumroad.com",
      "https://raicovr.gumroad.com",
      "https://vrfluff.gumroad.com",
      "https://liindy.gumroad.com",
      "https://ktecharms.gumroad.com",
      "https://heartmarksman.gumroad.com",
      "https://anmeire.gumroad.com",
      "https://aparche.gumroad.com",
      "https://legacytwotails.gumroad.com",
      "https://rezilloryker.gumroad.com",
      "https://mcardellje.gumroad.com"
    ];
    for (const hub of gumroadHubs) {
      db.queueUrl(hub, "gumroad");
    }
  }

  // 5. Seed Jinxxy marketplace categories, tags, and sitemaps
  if (metrics.platformStats["jinxxy"]?.pending === 0 && metrics.platformStats["jinxxy"]?.done === 0) {
    logger.info("Seeding Jinxxy categories, tags, and product sitemaps...");
    for (const catUrl of JINXXY_CATEGORIES) {
      db.queueUrl(catUrl, "jinxxy");
    }
    for (const tag of JINXXY_TAGS) {
      db.queueUrl(`https://jinxxy.com/market/browse?tags=${encodeURIComponent(tag)}`, "jinxxy");
    }

    // Scan Jinxxy product sitemaps 59 through 65 for tool keywords
    for (let sIdx = 59; sIdx <= 65; sIdx++) {
      const toolUrls = await JinxxyDriver.scanSitemapForTools(sIdx);
      for (const tu of toolUrls) {
        db.queueUrl(tu, "jinxxy");
      }
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
        if (item.url.includes("/browse/") || item.url.includes("/search/")) {
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

// Dedicated GitHub Worker (with paginated search and raw scraping)
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
          const repoUrls = await GitHubDriver.searchRepos(query, 5);
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

// Dedicated VPM Manifest Worker (fast JSON parser with fallback candidates)
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

// Dedicated Gumroad Worker (discover search, storefronts, and product pages)
async function runGumroadWorker() {
  logger.info("[Worker:Gumroad] Started.");
  let queryIndex = 0;
  let lastDiscoverTime = 0;
  const DISCOVER_COOLDOWN_MS = 60000; // 60s cooldown between discover query bursts

  while (isRunning) {
    let items = db.getNextPendingForPlatform("gumroad", 3);

    // If pending queue is low, run internal Gumroad Discover queries ONLY if not in backoff and cooldown elapsed
    if (items.length < 2) {
      const isBackingOff = rateLimiter.isBackingOff("gumroad:discover");
      const cooldownElapsed = Date.now() - lastDiscoverTime > DISCOVER_COOLDOWN_MS;

      if (!isBackingOff && cooldownElapsed) {
        lastDiscoverTime = Date.now();
        const q = GUMROAD_SEARCH_QUERIES[queryIndex % GUMROAD_SEARCH_QUERIES.length];
        queryIndex++;
        logger.info(`[Worker:Gumroad] Queue low (${items.length} items). Running discover search for '${q}'...`);
        for (let p = 1; p <= 3; p++) {
          if (!isRunning || rateLimiter.isBackingOff("gumroad:discover")) break;
          const res = await GumroadDriver.crawlDiscoverQuery(q, p);
          if (res.productsCount === 0) break;
        }
        items = db.getNextPendingForPlatform("gumroad", 3);
      }
    }

    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    for (const item of items) {
      if (!isRunning) break;
      db.markStatus(item.url, "fetching");

      try {
        if (item.url.includes("/l/")) {
          const ok = await GumroadDriver.crawlProduct(item.url);
          db.markStatus(item.url, ok ? "done" : "failed");
        } else {
          const ok = await GumroadDriver.crawlStorefront(item.url);
          db.markStatus(item.url, ok ? "done" : "failed");
        }
      } catch (err) {
        logger.error(`[Worker:Gumroad] Error on ${item.url}`, err);
        db.markStatus(item.url, "failed");
      }
    }
  }
  logger.info("[Worker:Gumroad] Stopped.");
}

// Dedicated Jinxxy Worker (browse, tags, and product pages with cross-feeding)
async function runJinxxyWorker() {
  logger.info("[Worker:Jinxxy] Started.");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("jinxxy", 5);
    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }

    for (const item of items) {
      if (!isRunning) break;
      db.markStatus(item.url, "fetching");

      try {
        if (item.url.includes("/market/")) {
          const productUrls = await JinxxyDriver.crawlBrowsePage(item.url);
          for (const pu of productUrls) {
            db.queueUrl(pu, "jinxxy");
          }
          db.markStatus(item.url, "done");
        } else {
          const ok = await JinxxyDriver.crawlProduct(item.url);
          db.markStatus(item.url, ok ? "done" : "failed");
        }
      } catch (err) {
        logger.error(`[Worker:Jinxxy] Error on ${item.url}`, err);
        db.markStatus(item.url, "failed");
      }
    }
  }
  logger.info("[Worker:Jinxxy] Stopped.");
}

// Heartbeat & Checkpoint Monitor
async function runMonitor() {
  let cycle = 0;
  while (isRunning) {
    await new Promise((r) => setTimeout(r, 15000));
    if (!isRunning) break;
    cycle++;

    const m = db.getMetrics();
    const S = m.totalDiscovered > 0 ? (m.totalDone / m.totalDiscovered) : 0;
    db.recordCheckpoint(S, `Cycle ${cycle} status check`);
    logger.info(`[HEARTBEAT] Vetted Tools: ${m.totalEntities} | Quarantined: ${m.totalQuarantined} | Done: ${m.totalDone}/${m.totalDiscovered} | Saturation: ${(S * 100).toFixed(1)}%`);
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

  logger.info("Launching concurrent domain workers: [BOOTH, GitHub, VPM, Gumroad, Jinxxy, Monitor]...");
  await Promise.all([
    runBoothWorker(),
    runGithubWorker(),
    runVpmWorker(),
    runGumroadWorker(),
    runJinxxyWorker(),
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
