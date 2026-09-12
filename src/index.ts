import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";
import { db } from "./db.ts";
import { BoothDriver } from "./drivers/booth.ts";
import { GitHubDriver } from "./drivers/github.ts";
import { VpmIndexDriver } from "./drivers/vpm_index.ts";
import { GumroadDriver } from "./drivers/gumroad.ts";
import { JinxxyDriver } from "./drivers/jinxxy.ts";
import { ItchDriver } from "./drivers/itch.ts";
import { CuratedDriver } from "./drivers/curated.ts";
import { rateLimiter } from "./ratelimit.ts";

let isRunning = true;

// High-signal search queries for Gumroad internal discover engine (empirically derived from VRChat tool ecosystem tags)
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
  "vrchat prefab",
  "vrchat gimmick",
  "vrchat locomotion",
  "vrchat toggle",
  "vrchat constraint",
  "vrchat audio",
  "vrchat flight",
  "vrchat menu",
  "vrchat setup",
  "vrchat prop system",
  "vrchat physbone",
  "avatar dynamics vrchat",
  "vrchat ragdoll",
  "vrchat facetracking"
];

// Curated Jinxxy tags and categories
const JINXXY_TAGS = [
  "tool", "tools", "script", "scripts", "system", "systems", "udon", "udonsharp",
  "vrcfury", "modular-avatar", "shader", "shaders", "editor", "osc", "camera", "unity",
  "physics", "preset", "animation", "constraint", "gimmick", "flight", "avatar-dynamics"
];

const JINXXY_CATEGORIES = [
  "https://jinxxy.com/market/scripts-tools",
  "https://jinxxy.com/market/particles-shaders",
  "https://jinxxy.com/market/world-assets"
];

export async function seedAllDomains() {
  const metrics = db.getMetrics();
  logger.info("Checking domain seed status and initializing fast frontier queues...");

  // 1. Ingest decentralized VPM repositories
  if (metrics.platformStats["vpm"].pending < 10 && metrics.platformStats["vpm"].done < 50) {
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

  // 2. Queue high-signal GitHub queries into frontier
  if (metrics.platformStats["github"].pending < 50) {
    const githubQueries = [
      "topic:vrchat",
      "topic:vpm",
      "topic:udonsharp",
      "topic:modular-avatar",
      "topic:vrcfury",
      "topic:ndmf",
      "topic:vrc-osc",
      "topic:vrchat-tools",
      "topic:vrchat-tool",
      "topic:vrchat-shader",
      "topic:vpm-repository",
      "vrchat-tools in:name,description",
      "vpm-package in:name,description",
      "vrchat-unitypackage in:name,description",
      "udon in:name,description",
      "vrc-avatar in:name,description",
      "\"vpmDependencies\" filename:package.json",
      "\"com.vrchat.avatars\" filename:package.json",
      "\"com.vrchat.worlds\" filename:package.json",
      "\"ModularAvatar\" in:name,description",
      "\"VRCFury\" in:name,description",
      "\"AvatarOptimizer\" in:name,description",
      "\"CyanTrigger\" in:name,description"
    ];
    for (const q of githubQueries) {
      db.queueUrl(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`, "github");
    }
  }

  // 3. Queue BOOTH browse pages and high-signal multi-tag searches
  const boothPages: { url: string; platform: "booth" }[] = [];
  if (metrics.platformStats["booth"].pending < 50) {
    logger.info("Seeding BOOTH category browse pages and expanded high-signal tag searches...");
    for (let p = 1; p <= 88; p++) {
      boothPages.push({
        url: `https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0?page=${p}`,
        platform: "booth"
      });
    }

    const BOOTH_TAGS = [
      "エディタ拡張", "AAO", "VRCFury", "NDMF", "FaceEmo", "GoGoLoco",
      "SaccFlight", "VirtualLens", "QvPen", "改変ツール", "シェーダー",
      "PhysBone", "UdonSharp", "Udon", "ModularAvatar", "AvatarOptimizer",
      "lilToon", "Poiyomi", "Kisekae", "VRChatツール", "アバター改変",
      "ワールドギミック", "ギミック", "OSC", "CyanTrigger", "MA対応",
      "VRCFury対応", "AAO対応", "NDMF対応", "便利ツール", "アバター改変ツール",
      "表情設定", "ポーズ", "追従", "アニメーション", "パーティクル",
      "ライト", "時計", "マーカー", "フライト", "コライダー",
      "コンストレイント", "オーディオ", "揺れもの", "ワールド制作", "テクスチャ改変",
      "TexTransTool", "AvatarAssembler", "Mochie", "DynamicBone", "USharpVideo",
      "VRCSDK3", "FaceTracking", "EyeTracking", "SlimeVR", "EasySetup",
      "ギミック付き", "カメラ", "メニュー", "衣装改変"
    ];
    for (const bt of BOOTH_TAGS) {
      for (let p = 1; p <= 15; p++) {
        boothPages.push({
          url: `https://booth.pm/ja/items?query=${encodeURIComponent(bt)}&page=${p}`,
          platform: "booth"
        });
      }
    }
    if (boothPages.length > 0) {
      db.queueBatchUrls(boothPages);
    }
  }

  // 4. Queue Western creator tool storefronts on Gumroad
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

  // 5. Seed Jinxxy marketplace categories and tags
  if (!metrics.platformStats["jinxxy"] || metrics.platformStats["jinxxy"].pending < 30) {
    for (const catUrl of JINXXY_CATEGORIES) {
      db.queueUrl(catUrl, "jinxxy");
    }
    for (const tag of JINXXY_TAGS) {
      db.queueUrl(`https://jinxxy.com/market/browse?tags=${encodeURIComponent(tag)}`, "jinxxy");
    }
  }

  // 6. Seed Itch.io tool browse feeds and searches
  if (!metrics.platformStats["itch"] || metrics.platformStats["itch"].pending < 10) {
    const itchFeeds = [
      ...Array.from({ length: 15 }, (_, i) => `https://itch.io/tools/tag-vrchat?page=${i + 1}`),
      ...Array.from({ length: 10 }, (_, i) => `https://itch.io/tools/tag-udon?page=${i + 1}`),
      ...Array.from({ length: 10 }, (_, i) => `https://itch.io/tools/tag-vrchat-avatar?page=${i + 1}`),
      "https://itch.io/search?q=vrchat+tool",
      "https://itch.io/search?q=vrchat+shader",
      "https://itch.io/search?q=vrchat+osc",
      "https://itch.io/search?q=vrchat+udon",
      "https://itch.io/search?q=vrcfury",
      "https://itch.io/search?q=modular+avatar"
    ];
    for (const f of itchFeeds) {
      db.queueUrl(f, "itch");
    }
  }
}

// Dedicated BOOTH Worker (concurrent item processing)
async function runBoothWorker() {
  logger.info("[Worker:BOOTH] Started.");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("booth", 6);
    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }

    for (const item of items) {
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) return;
        try {
          if (
            item.url.includes("/browse/") ||
            item.url.includes("/search/") ||
            item.url.includes("?query=") ||
            item.url.includes("/items?")
          ) {
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
      })
    );
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
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) return;
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
      })
    );
  }
  logger.info("[Worker:GitHub] Stopped.");
}

// Dedicated VPM Manifest Worker (fast concurrent JSON parser with fallback candidates)
async function runVpmWorker() {
  logger.info("[Worker:VPM] Started.");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("vpm", 6);
    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    for (const item of items) {
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) return;
        try {
          const ok = await VpmIndexDriver.crawlManifest(item.url);
          db.markStatus(item.url, ok ? "done" : "failed");
        } catch (err) {
          logger.error(`[Worker:VPM] Error on ${item.url}`, err);
          db.markStatus(item.url, "failed");
        }
      })
    );
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
    let items = db.getNextPendingForPlatform("gumroad", 4);

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
        items = db.getNextPendingForPlatform("gumroad", 4);
      }
    }

    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    for (const item of items) {
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) return;
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
      })
    );
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
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) return;
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
      })
    );
  }
  logger.info("[Worker:Jinxxy] Stopped.");
}

// Dedicated Itch.io Worker (browse feeds, searches, and tool product pages)
async function runItchWorker() {
  logger.info("[Worker:Itch] Started.");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("itch", 5);
    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 4000));
      continue;
    }

    for (const item of items) {
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) return;
        try {
          if (
            item.url.includes("/tools/") ||
            item.url.includes("/tag-") ||
            item.url.includes("/search") ||
            item.url.includes("itch.io/tools")
          ) {
            const productUrls = await ItchDriver.crawlBrowsePage(item.url);
            for (const pu of productUrls) {
              db.queueUrl(pu, "itch");
            }
            db.markStatus(item.url, "done");
          } else {
            const ok = await ItchDriver.crawlProduct(item.url);
            db.markStatus(item.url, ok ? "done" : "failed");
          }
        } catch (err) {
          logger.error(`[Worker:Itch] Error on ${item.url}`, err);
          db.markStatus(item.url, "failed");
        }
      })
    );
  }
  logger.info("[Worker:Itch] Stopped.");
}

// Dedicated Curated Registry Worker (decentralized multi-maintainer registries & GitHub live discovery)
async function runCuratedRegistryWorker() {
  logger.info("[Worker:CuratedRegistry] Started.");
  let lastRun = 0;
  const INTERVAL_MS = 15 * 60 * 1000; // Run every 15 minutes

  while (isRunning) {
    const now = Date.now();
    if (now - lastRun > INTERVAL_MS) {
      try {
        logger.info("[Worker:CuratedRegistry] Running decentralized registry discovery & multi-maintainer ingestion...");
        await CuratedDriver.ingestAllCuratedSources();
        lastRun = Date.now();
      } catch (err) {
        logger.error("[Worker:CuratedRegistry] Error during curated registry ingestion", err);
      }
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  logger.info("[Worker:CuratedRegistry] Stopped.");
}

// Dedicated Creator Harvest Worker (dynamically discovers creators from database truth sources)
async function runCreatorHarvestWorker() {
  logger.info("[Worker:CreatorHarvest] Started.");
  await new Promise((r) => setTimeout(r, 15000)); // Delay 15s so other workers can start populating first
  let lastRun = 0;
  const INTERVAL_MS = 20 * 60 * 1000; // Run every 20 minutes

  while (isRunning) {
    const now = Date.now();
    if (now - lastRun > INTERVAL_MS) {
      try {
        logger.info("[Worker:CreatorHarvest] Harvesting creator portfolios dynamically derived from truth sources...");
        await GitHubDriver.harvestDiscoveredCreators(75);
        lastRun = Date.now();
      } catch (err) {
        logger.error("[Worker:CreatorHarvest] Error harvesting creator portfolios", err);
      }
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  logger.info("[Worker:CreatorHarvest] Stopped.");
}

// Heartbeat & Checkpoint Monitor with Saturation Ceiling Detector
async function runMonitor() {
  let cycle = 0;
  let idleExhaustionCycles = 0;
  let lastDiscoveredCount = 0;

  while (isRunning) {
    await new Promise((r) => setTimeout(r, 15000));
    if (!isRunning) break;
    cycle++;

    // Every 4 cycles (~60s), replenish domain queues if pending items are low
    if (cycle % 4 === 0) {
      try {
        await seedAllDomains();
      } catch (err) {
        logger.error("[Monitor] Error in periodic seedAllDomains", err);
      }
    }

    const m = db.getMetrics();
    const S = m.totalDiscovered > 0 ? (m.totalDone / m.totalDiscovered) : 0;
    db.recordCheckpoint(S, `Cycle ${cycle} status check`);
    logger.info(`[HEARTBEAT] Vetted Tools: ${m.totalEntities} | Quarantined: ${m.totalQuarantined} | Done: ${m.totalDone}/${m.totalDiscovered} | Saturation: ${(S * 100).toFixed(1)}%`);

    // Saturation Ceiling & Queue Exhaustion Detection
    const isQueueExhausted = m.totalPending <= 2;
    const isNoNewDiscovery = m.totalDiscovered === lastDiscoveredCount;
    lastDiscoveredCount = m.totalDiscovered;

    if (isQueueExhausted && isNoNewDiscovery && (m.totalEntities >= 10000 || S >= 0.999)) {
      idleExhaustionCycles++;
      logger.info(`[MONITOR] Saturation ceiling check: ${idleExhaustionCycles}/4 idle cycles (Pending: ${m.totalPending}, Vetted: ${m.totalEntities}, Saturation: ${(S * 100).toFixed(2)}%)`);

      if (idleExhaustionCycles >= 4) {
        logger.info("[MONITOR] Saturation ceiling reached! All queues exhausted and >= 10,000 entities indexed. Initiating orderly shutdown...");
        isRunning = false;
        break;
      }
    } else {
      idleExhaustionCycles = 0;
    }
  }
}

async function main() {
  console.log("\x1b[36m");
  console.log("==================================================================");
  console.log("   VRC PACKAGE CRAWLER — MULTI-DOMAIN CONCURRENT HARVESTER ENGINE ");
  console.log("==================================================================");
  console.log("\x1b[0m");

  // 1. Startup Reverification Pass: Audit entities with updated rules and verify DB integrity before continuing
  logger.info("[STARTUP] Reverifying database integrity and auditing active/quarantined entities against current rules...");
  const { runPipelineSanitize } = await import("./pipeline_sanitize.ts");
  await runPipelineSanitize();

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

  logger.info("Launching concurrent domain workers: [BOOTH, GitHub, VPM, Gumroad, Jinxxy, Itch, CuratedRegistry, CreatorHarvest, Monitor]...");
  await Promise.all([
    runBoothWorker(),
    runGithubWorker(),
    runVpmWorker(),
    runGumroadWorker(),
    runJinxxyWorker(),
    runItchWorker(),
    runCuratedRegistryWorker(),
    runCreatorHarvestWorker(),
    runMonitor()
  ]);

  logger.info("All workers exited cleanly. Closing database connections.");
  db.close();
  logger.close();

  // Automated post-crawl cleanup and catalog build pipeline
  console.log("\n==================================================================");
  console.log("   TRIGGERING AUTOMATED PIPELINE SANITIZATION & CATALOG BUILD    ");
  console.log("==================================================================");
  try {
    const { spawnSync } = await import("child_process");
    const sanitize = spawnSync("bun", ["run", "src/pipeline_sanitize.ts"], {
      cwd: process.cwd(),
      stdio: "inherit"
    });
    console.log(`[PIPELINE] Sanitization process exited with code: ${sanitize.status}`);

    const frontendDir = "F:\\.repo\\.fork\\vpm-catalog-forked";
    const fs = await import("fs");
    if (fs.existsSync(frontendDir)) {
      const build = spawnSync("bun", ["run", "scripts/build-db.ts"], {
        cwd: frontendDir,
        stdio: "inherit"
      });
      console.log(`[FRONTEND] Catalog DB build process exited with code: ${build.status}`);
    }
  } catch (err) {
    console.error("Error during automated post-crawl pipeline execution:", err);
  }

  console.log("Engine terminated cleanly.");
}

if (import.meta.main) {
  main().catch((err) => {
    logger.error("Fatal error in main runner", err);
    process.exit(1);
  });
}
