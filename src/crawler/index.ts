import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db } from "../db.ts";
import { BoothDriver } from "../drivers/booth.ts";
import { GitHubDriver } from "../drivers/github.ts";
import { VpmIndexDriver } from "../drivers/vpm_index.ts";
import { GumroadDriver } from "../drivers/gumroad.ts";
import { JinxxyDriver } from "../drivers/jinxxy.ts";
import { ItchDriver } from "../drivers/itch.ts";
import { CuratedDriver } from "../drivers/curated.ts";
import { rateLimiter } from "../ratelimit.ts";
import { ProcessLock } from "../utils/lock.ts";
import { runPipelineSanitize, abortPipelineSanitize } from "../tools/pipeline_sanitize.ts";
import { CrawlerIpcServer } from "../utils/ipc.ts";
import { poissonScheduler } from "../utils/poisson_scheduler.ts";
import { robotsEnforcer } from "../utils/robots.ts";

let isRunning = true;

/**
 * Interruptible sleep that checks isRunning every stepMs to allow immediate graceful shutdown.
 */
async function sleepOrInterrupt(ms: number, stepMs: number = 150): Promise<void> {
  const end = Date.now() + ms;
  while (isRunning && Date.now() < end) {
    const wait = Math.min(stepMs, end - Date.now());
    await new Promise((r) => setTimeout(r, wait));
  }
}

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

// Dedicated BOOTH Worker (concurrent item processing with Adaptive AIMD politeness)
async function runBoothWorker() {
  logger.info("[Worker:BOOTH] Started (Adaptive AIMD limiter).");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("booth", 6);
    if (items.length === 0) {
      await sleepOrInterrupt(4000);
      continue;
    }

    for (const item of items) {
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          return;
        }

        const allowed = await robotsEnforcer.isAllowed(item.url);
        if (!allowed) {
          logger.info(`[Worker:BOOTH] Skipping URL disallowed by robots.txt: ${item.url}`);
          db.markStatus(item.url, "done", "Disallowed by robots.txt");
          return;
        }

        const release = await rateLimiter.acquire("booth.pm");
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          release();
          return;
        }

        const t0 = Date.now();
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
            rateLimiter.recordSuccess("booth.pm", Date.now() - t0);
            db.markStatus(item.url, "done");
          } else {
            const ok = await BoothDriver.crawlItemDetail(item.url);
            if (!isRunning) {
              db.markStatus(item.url, "pending");
            } else {
              if (ok) {
                rateLimiter.recordSuccess("booth.pm", Date.now() - t0);
              } else {
                rateLimiter.recordFailure("booth.pm", false);
              }
              db.markStatus(item.url, ok ? "done" : "failed");
            }
          }
        } catch (err) {
          if (!isRunning) {
            db.markStatus(item.url, "pending");
          } else {
            rateLimiter.recordFailure("booth.pm", false);
            logger.error(`[Worker:BOOTH] Error on ${item.url}`, err);
            db.markStatus(item.url, "failed");
          }
        } finally {
          release();
        }
      })
    );
  }
  logger.info("[Worker:BOOTH] Stopped.");
}

// Dedicated GitHub Worker (with paginated search and raw scraping)
async function runGithubWorker() {
  logger.info("[Worker:GitHub] Started (Adaptive AIMD limiter).");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("github", 3);
    if (items.length === 0) {
      await sleepOrInterrupt(5000);
      continue;
    }

    for (const item of items) {
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          return;
        }
        const release = await rateLimiter.acquire("api.github.com");
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          release();
          return;
        }

        const t0 = Date.now();
        try {
          if (item.url.includes("/search/")) {
            const qm = item.url.match(/\?q=([^&]+)/);
            const query = qm ? decodeURIComponent(qm[1]) : "vrchat";
            const repoUrls = await GitHubDriver.searchRepos(query, 5);
            for (const ru of repoUrls) {
              db.queueUrl(ru, "github");
            }
            rateLimiter.recordSuccess("api.github.com", Date.now() - t0);
            db.markStatus(item.url, "done");
          } else {
            const ok = await GitHubDriver.crawlRepoDetail(item.url);
            if (!isRunning) {
              db.markStatus(item.url, "pending");
            } else {
              if (ok) {
                rateLimiter.recordSuccess("api.github.com", Date.now() - t0);
              } else {
                rateLimiter.recordFailure("api.github.com", false);
              }
              db.markStatus(item.url, ok ? "done" : "failed");
            }
          }
        } catch (err) {
          if (!isRunning) {
            db.markStatus(item.url, "pending");
          } else {
            rateLimiter.recordFailure("api.github.com", false);
            logger.error(`[Worker:GitHub] Error on ${item.url}`, err);
            db.markStatus(item.url, "failed");
          }
        } finally {
          release();
        }
      })
    );
  }
  logger.info("[Worker:GitHub] Stopped.");
}

// Dedicated VPM Manifest Worker (fast concurrent JSON parser with fallback candidates)
async function runVpmWorker() {
  logger.info("[Worker:VPM] Started (Adaptive AIMD limiter).");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("vpm", 6);
    if (items.length === 0) {
      await sleepOrInterrupt(3000);
      continue;
    }

    for (const item of items) {
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          return;
        }
        const release = await rateLimiter.acquire("vpm");
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          release();
          return;
        }

        const t0 = Date.now();
        try {
          const ok = await VpmIndexDriver.crawlManifest(item.url);
          if (!isRunning) {
            db.markStatus(item.url, "pending");
          } else {
            if (ok) {
              rateLimiter.recordSuccess("vpm", Date.now() - t0);
            } else {
              rateLimiter.recordFailure("vpm", false);
            }
            db.markStatus(item.url, ok ? "done" : "failed");
          }
        } catch (err) {
          if (!isRunning) {
            db.markStatus(item.url, "pending");
          } else {
            rateLimiter.recordFailure("vpm", false);
            logger.error(`[Worker:VPM] Error on ${item.url}`, err);
            db.markStatus(item.url, "failed");
          }
        } finally {
          release();
        }
      })
    );
  }
  logger.info("[Worker:VPM] Stopped.");
}

// Dedicated Gumroad Worker (strictly serialized per Mercator politeness to eliminate 429 backoffs)
async function runGumroadWorker() {
  logger.info("[Worker:Gumroad] Started (serialized Mercator politeness queue & Adaptive AIMD limiter).");
  let queryIndex = 0;
  let lastDiscoverTime = 0;
  const DISCOVER_COOLDOWN_MS = 60000; // 60s cooldown between discover query bursts

  while (isRunning) {
    const items = db.getNextPendingForPlatform("gumroad", 1);
    const item = items[0];
    // If pending queue is low, run internal Gumroad Discover queries ONLY if not in backoff, cooldown elapsed, AND below saturation target
    if (!item) {
      const isBackingOff = rateLimiter.isBackingOff("gumroad.com");
      const cooldownElapsed = Date.now() - lastDiscoverTime > DISCOVER_COOLDOWN_MS;

      if (!isBackingOff && cooldownElapsed) {
        lastDiscoverTime = Date.now();
        const q = GUMROAD_SEARCH_QUERIES[queryIndex % GUMROAD_SEARCH_QUERIES.length];
        queryIndex++;
        logger.info(`[Worker:Gumroad] Queue empty. Running discover search for '${q}'...`);
        for (let p = 1; p <= 3; p++) {
          if (!isRunning || rateLimiter.isBackingOff("gumroad.com")) break;
          const release = await rateLimiter.acquire("gumroad.com");
          if (!isRunning) {
            release();
            break;
          }
          const t0 = Date.now();
          try {
            const res = await GumroadDriver.crawlDiscoverQuery(q, p);
            rateLimiter.recordSuccess("gumroad.com", Date.now() - t0);
            if (res.productsCount === 0) break;
          } catch (err) {
            rateLimiter.recordFailure("gumroad.com", false);
            break;
          } finally {
            release();
          }
        }
      }
      await sleepOrInterrupt(4000);
      continue;
    }

    if (!isRunning) {
      break;
    }

    const allowed = await robotsEnforcer.isAllowed(item.url);
    if (!allowed) {
      logger.info(`[Worker:Gumroad] Skipping URL disallowed by robots.txt: ${item.url}`);
      db.markStatus(item.url, "done", "Disallowed by robots.txt");
      continue;
    }

    db.markStatus(item.url, "fetching");
    const release = await rateLimiter.acquire("gumroad.com");
    if (!isRunning) {
      db.markStatus(item.url, "pending");
      release();
      break;
    }

    const t0 = Date.now();
    try {
      if (item.url.includes("/l/")) {
        const ok = await GumroadDriver.crawlProduct(item.url);
        if (!isRunning) {
          db.markStatus(item.url, "pending");
        } else {
          if (ok) {
            rateLimiter.recordSuccess("gumroad.com", Date.now() - t0);
          } else {
            rateLimiter.recordFailure("gumroad.com", false);
          }
          db.markStatus(item.url, ok ? "done" : "failed");
        }
      } else {
        const ok = await GumroadDriver.crawlStorefront(item.url);
        if (!isRunning) {
          db.markStatus(item.url, "pending");
        } else {
          if (ok) {
            rateLimiter.recordSuccess("gumroad.com", Date.now() - t0);
          } else {
            rateLimiter.recordFailure("gumroad.com", false);
          }
          db.markStatus(item.url, ok ? "done" : "failed");
        }
      }
    } catch (err) {
      if (!isRunning) {
        db.markStatus(item.url, "pending");
      } else {
        rateLimiter.recordFailure("gumroad.com", false);
        logger.error(`[Worker:Gumroad] Error on ${item.url}`, err);
        db.markStatus(item.url, "failed");
      }
    } finally {
      release();
    }
  }
  logger.info("[Worker:Gumroad] Stopped.");
}

// Dedicated Jinxxy Worker (browse, tags, and product pages with cross-feeding)
async function runJinxxyWorker() {
  logger.info("[Worker:Jinxxy] Started (Adaptive AIMD limiter).");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("jinxxy", 5);
    if (items.length === 0) {
      await sleepOrInterrupt(4000);
      continue;
    }

    for (const item of items) {
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          return;
        }

        const allowed = await robotsEnforcer.isAllowed(item.url);
        if (!allowed) {
          logger.info(`[Worker:Jinxxy] Skipping URL disallowed by robots.txt: ${item.url}`);
          db.markStatus(item.url, "done", "Disallowed by robots.txt");
          return;
        }

        const release = await rateLimiter.acquire("jinxxy.com");
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          release();
          return;
        }

        const t0 = Date.now();
        try {
          if (item.url.includes("/market/")) {
            const productUrls = await JinxxyDriver.crawlBrowsePage(item.url);
            for (const pu of productUrls) {
              db.queueUrl(pu, "jinxxy");
            }
            rateLimiter.recordSuccess("jinxxy.com", Date.now() - t0);
            db.markStatus(item.url, "done");
          } else {
            const ok = await JinxxyDriver.crawlProduct(item.url);
            if (!isRunning) {
              db.markStatus(item.url, "pending");
            } else {
              if (ok) {
                rateLimiter.recordSuccess("jinxxy.com", Date.now() - t0);
              } else {
                rateLimiter.recordFailure("jinxxy.com", false);
              }
              db.markStatus(item.url, ok ? "done" : "failed");
            }
          }
        } catch (err) {
          if (!isRunning) {
            db.markStatus(item.url, "pending");
          } else {
            rateLimiter.recordFailure("jinxxy.com", false);
            logger.error(`[Worker:Jinxxy] Error on ${item.url}`, err);
            db.markStatus(item.url, "failed");
          }
        } finally {
          release();
        }
      })
    );
  }
  logger.info("[Worker:Jinxxy] Stopped.");
}

// Dedicated Itch.io Worker (browse feeds, searches, and tool product pages)
async function runItchWorker() {
  logger.info("[Worker:Itch] Started (Adaptive AIMD limiter).");
  while (isRunning) {
    const items = db.getNextPendingForPlatform("itch", 5);
    if (items.length === 0) {
      await sleepOrInterrupt(4000);
      continue;
    }

    for (const item of items) {
      db.markStatus(item.url, "fetching");
    }

    await Promise.allSettled(
      items.map(async (item) => {
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          return;
        }

        const allowed = await robotsEnforcer.isAllowed(item.url);
        if (!allowed) {
          logger.info(`[Worker:Itch] Skipping URL disallowed by robots.txt: ${item.url}`);
          db.markStatus(item.url, "done", "Disallowed by robots.txt");
          return;
        }

        const release = await rateLimiter.acquire("itch.io");
        if (!isRunning) {
          db.markStatus(item.url, "pending");
          release();
          return;
        }

        const t0 = Date.now();
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
            rateLimiter.recordSuccess("itch.io", Date.now() - t0);
            db.markStatus(item.url, "done");
          } else {
            const ok = await ItchDriver.crawlProduct(item.url);
            if (!isRunning) {
              db.markStatus(item.url, "pending");
            } else {
              if (ok) {
                rateLimiter.recordSuccess("itch.io", Date.now() - t0);
              } else {
                rateLimiter.recordFailure("itch.io", false);
              }
              db.markStatus(item.url, ok ? "done" : "failed");
            }
          }
        } catch (err) {
          if (!isRunning) {
            db.markStatus(item.url, "pending");
          } else {
            rateLimiter.recordFailure("itch.io", false);
            logger.error(`[Worker:Itch] Error on ${item.url}`, err);
            db.markStatus(item.url, "failed");
          }
        } finally {
          release();
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
    await sleepOrInterrupt(10000);
  }
  logger.info("[Worker:CuratedRegistry] Stopped.");
}

// Dedicated Creator Harvest Worker (dynamically discovers creators from database truth sources)
async function runCreatorHarvestWorker() {
  logger.info("[Worker:CreatorHarvest] Started.");
  await sleepOrInterrupt(15000); // Delay 15s so other workers can start populating first
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
    await sleepOrInterrupt(10000);
  }
  logger.info("[Worker:CreatorHarvest] Stopped.");
}

// Continuous 24/7 Monitor with Cho-Garcia-Molina Poisson Refresh, 15m Projections, 30m Steering Pull, and 4h Edge Sync
async function runMonitor() {
  let cycle = 0;
  let lastProjectionTime = Date.now();
  let lastSteeringTime = Date.now();
  let lastSyncTime = Date.now();
  let lastMediaIndexTime = Date.now();
  let lastExportTime = Date.now();

  const PROJECTION_INTERVAL_MS = 15 * 60 * 1000;   // 15 minutes
  const STEERING_INTERVAL_MS = 30 * 60 * 1000;     // 30 minutes
  const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000;      // 4 hours
  const MEDIA_INDEX_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
  const EXPORT_INTERVAL_MS = 6 * 60 * 60 * 1000;    // 6 hours

  while (isRunning) {
    await sleepOrInterrupt(15000);
    if (!isRunning) break;
    cycle++;

    const m = db.getMetrics();
    const S = m.totalDiscovered > 0 ? (m.totalDone / m.totalDiscovered) : 0;
    db.recordCheckpoint(S, `Cycle ${cycle} status check`);
    logger.info(`[HEARTBEAT] Vetted Tools: ${m.totalEntities} | Quarantined: ${m.totalQuarantined} | Done: ${m.totalDone}/${m.totalDiscovered} | Saturation: ${(S * 100).toFixed(1)}%`);

    // 1. Cho-Garcia-Molina Poisson refresh scheduler when pending queues are low
    if (m.totalPending <= 25) {
      const requeued = poissonScheduler.requeueStaleUrls(50);
      if (requeued > 0) {
        logger.info(`[MONITOR] Cho-Garcia-Molina Poisson scheduler re-enqueued ${requeued} stale URLs for freshness verification.`);
      } else if (cycle % 4 === 0) {
        // Replenish domain discovery queries when queues are calm
        try {
          await seedAllDomains();
        } catch (err) {
          logger.error("[Monitor] Error during background seedAllDomains", err);
        }
      }
    }

    // 2. Periodic 15-minute catalog projection synthesis
    if (Date.now() - lastProjectionTime >= PROJECTION_INTERVAL_MS) {
      lastProjectionTime = Date.now();
      logger.info("[MONITOR] Initiating scheduled 15-minute catalog projection synthesis...");
      try {
        await runPipelineSanitize();
      } catch (err) {
        logger.error("[MONITOR] Error during periodic projection synthesis", err);
      }
    }

    // 3. Periodic 30-minute steering ingestion (Cloudflare R2 download + local directory)
    if (Date.now() - lastSteeringTime >= STEERING_INTERVAL_MS) {
      lastSteeringTime = Date.now();
      try {
        const { pullReportsFromDirectory, processPendingReports } = await import("../tools/steering.ts");
        const pulled = await pullReportsFromDirectory();
        if (pulled > 0) {
          await processPendingReports();
        }
      } catch (err) {
        logger.error("[MONITOR] Error during periodic steering ingest", err);
      }
    }

    // 4. Periodic 4-hour Cloudflare edge sync upload
    if (Date.now() - lastSyncTime >= SYNC_INTERVAL_MS) {
      lastSyncTime = Date.now();
      logger.info("[MONITOR] Initiating scheduled 4-hour Cloudflare edge sync upload...");
      try {
        const { runEdgeSync } = await import("../sync/index.ts");
        await runEdgeSync();
      } catch (err) {
        logger.error("[MONITOR] Error during periodic edge sync", err);
      }
    }

    // 5. Periodic 5-minute low-resolution proxy image indexer
    if (Date.now() - lastMediaIndexTime >= MEDIA_INDEX_INTERVAL_MS) {
      lastMediaIndexTime = Date.now();
      try {
        const { ImageProxyService } = await import("../utils/image_proxy.ts");
        await ImageProxyService.indexPendingMedia(25);
      } catch (err) {
        logger.error("[MONITOR] Error during periodic media indexing", err);
      }
    }

    // 6. Periodic 6-hour offline FTS5 catalog export
    if (Date.now() - lastExportTime >= EXPORT_INTERVAL_MS) {
      lastExportTime = Date.now();
      logger.info("[MONITOR] Initiating scheduled 6-hour offline FTS5 catalog export...");
      try {
        const { runDatabaseExport } = await import("../tools/exporter.ts");
        await runDatabaseExport("catalog");
      } catch (err) {
        logger.error("[MONITOR] Error during periodic catalog export", err);
      }
    }
  }
  logger.info("[Monitor] Stopped.");
}

export async function main() {
  // Handle CLI commands before acquiring lock
  if (process.argv.includes("stop")) {
    const res = await CrawlerIpcServer.sendCommand("stop");
    if (res.success) {
      console.log("[CLI] Graceful shutdown signal dispatched to running crawler daemon.");
    } else {
      console.error(`[CLI] Shutdown command failed: ${res.error}`);
    }
    process.exit(res.success ? 0 : 1);
  }

  if (process.argv.includes("status") && !process.argv.includes("--once")) {
    const res = await CrawlerIpcServer.getStatus();
    if (res.running) {
      console.log("[CLI] Crawler daemon is active:", JSON.stringify(res.data, null, 2));
    } else {
      console.log("[CLI] Crawler daemon is not currently running.");
    }
    process.exit(0);
  }

  if (process.argv.includes("recrawl")) {
    const res = await CrawlerIpcServer.sendCommand("recrawl");
    if (res.success) {
      console.log("[CLI] Freshness re-crawl triggered successfully on active daemon.");
    } else {
      console.error(`[CLI] Recrawl command failed: ${res.error}`);
    }
    process.exit(res.success ? 0 : 1);
  }

  if (process.argv.includes("project")) {
    const res = await CrawlerIpcServer.sendCommand("project");
    if (res.success) {
      console.log("[CLI] Projection rebuild triggered successfully on active daemon.");
    } else {
      console.error(`[CLI] Projection rebuild failed: ${res.error}`);
    }
    process.exit(res.success ? 0 : 1);
  }

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
VRChat Package Crawler - Harvester Daemon
Usage:
  vrc-crawler.exe [command] [options]
  bun run start [command] [options]

Commands (dispatched to running daemon via loopback IPC):
  status                  Show active crawler daemon status
  stop                    Trigger graceful shutdown on running daemon
  recrawl                 Trigger Poisson freshness re-crawl sweep
  project                 Trigger canonical projection synthesis pass

Options:
  --help, -h              Show this help message

For monitoring, run: dist/vrc-monitor.exe
For edge sync, run:  dist/vrc-sync.exe
For HTTP API, run:   dist/vrc-server.exe
`);
    process.exit(0);
  }

  console.log("\x1b[36m");
  console.log("==================================================================");
  console.log("   VRC PACKAGE CRAWLER — MULTI-DOMAIN CONCURRENT HARVESTER ENGINE ");
  console.log("==================================================================");
  console.log("\x1b[0m");

  // Enforce single-instance lock and recover from any previous crash / power loss
  if (!ProcessLock.acquire()) {
    console.error("\n\x1b[31m[FATAL] Another instance of the crawler is actively running. Exiting.\x1b[0m\n");
    process.exit(1);
  }

  const ipcServer = new CrawlerIpcServer();

  BoothDriver.reset();
  GitHubDriver.reset();
  VpmIndexDriver.reset();
  GumroadDriver.reset();
  JinxxyDriver.reset();
  ItchDriver.reset();
  CuratedDriver.reset();

  if (CONFIG.githubToken) {
    const masked = CONFIG.githubToken.slice(0, 4) + "..." + CONFIG.githubToken.slice(-4);
    logger.info(`[STARTUP] GitHub Token loaded (${masked}): 5,000 req/hr authenticated API quota active.`);
  } else {
    logger.warn("[STARTUP] No GitHub Token detected in environment (GITHUB_TOKEN / GH_TOKEN empty): Unauthenticated 60 req/hr limit active.");
  }

  let isInterrupted = false;

  const initiateShutdown = (signal: string) => {
    if (isInterrupted) {
      logger.warn(`Received second ${signal}. Forcing immediate process termination.`);
      try {
        db.resetStaleFetching();
        db.close();
        ipcServer.stop();
      } catch (_) {}
      ProcessLock.release();
      process.exit(130);
    }
    logger.info(`Received ${signal}. Draining queues and initiating graceful worker shutdown...`);
    isRunning = false;
    isInterrupted = true;
    ipcServer.stop();
    BoothDriver.abort();
    GitHubDriver.abort();
    VpmIndexDriver.abort();
    GumroadDriver.abort();
    JinxxyDriver.abort();
    ItchDriver.abort();
    CuratedDriver.abort();
    rateLimiter.drain();
    try {
      abortPipelineSanitize();
    } catch (_) {}
    try {
      db.resetStaleFetching();
    } catch (_) {}
  };

  ipcServer.start({
    onStop: () => initiateShutdown("IPC /stop command"),
    onRecrawl: async () => {
      poissonScheduler.requeueStaleUrls(100);
    },
    onProject: async () => {
      await runPipelineSanitize();
    },
    onSync: async () => {
      const { runEdgeSync } = await import("../sync/index.ts");
      await runEdgeSync();
    },
    onSteering: async () => {
      const { pullReportsFromDirectory, processPendingReports } = await import("../tools/steering.ts");
      await pullReportsFromDirectory();
      await processPendingReports();
    },
    onExport: async () => {
      const { runDatabaseExport } = await import("../tools/exporter.ts");
      await runDatabaseExport("catalog");
    }
  });

  process.on("SIGINT", () => initiateShutdown("SIGINT"));
  process.on("SIGTERM", () => initiateShutdown("SIGTERM"));

  try {
    process.stdin.resume();
  } catch (_) {}

  process.stdin.on("data", (data) => {
    const input = data.toString().trim();
    if (input === "SIGINT" || input === "q" || input === "exit" || input === "shutdown") {
      initiateShutdown("STDIN (" + input + ")");
    }
  });

  try {
    // 0. Power Interruption & Crash Recovery Verification:
    // Checkpoint SQLite WAL, verify database integrity, and rollback any in-flight 'fetching' URLs from prior halts
    logger.info("[STARTUP] Performing power interruption & crash recovery verification...");
    try {
      (db as any).db.run("PRAGMA wal_checkpoint(TRUNCATE);");
      const checkRes = (db as any).db.query("PRAGMA quick_check;").get() as any;
      if (checkRes?.quick_check !== "ok") {
        logger.error("[STARTUP] SQLite quick_check detected anomalies:", checkRes);
      }
    } catch (err) {
      logger.warn("[STARTUP] Non-fatal notice during WAL checkpoint verification:", err);
    }

    const recovered = db.resetStaleFetching();
    if (recovered > 0) {
      logger.info(`[STARTUP] Power interruption recovery complete: Restored ${recovered} orphaned in-flight tasks to 'pending'.`);
    }

    // 1. Seed & Refresh Frontiers
    await seedAllDomains();

    if (isInterrupted) {
      logger.info("Startup aborted via interrupt signal. Exiting cleanly.");
      return;
    }

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

    // 4. Post-Processing & Deterministic Catalog Build (Triggered on saturation completion)
    if (!isInterrupted) {
      console.log("\n==================================================================");
      console.log("   TRIGGERING AUTOMATED PIPELINE SANITIZATION & CATALOG BUILD    ");
      console.log("==================================================================");
      try {
        await runPipelineSanitize();
        const { runDatabaseExport } = await import("../tools/exporter.ts");
        await runDatabaseExport("catalog");
        console.log("[PIPELINE] Post-crawl sanitization & catalog generation completed successfully.");
      } catch (err) {
        console.error("Error during automated post-crawl pipeline execution:", err);
      }
    }
  } finally {
    logger.info("Orderly engine shutdown: resetting in-flight tasks, flushing database, and releasing lock...");
    try {
      ipcServer.stop();
    } catch (_) {}
    try {
      db.resetStaleFetching();
    } catch (_) {}
    try {
      db.close();
    } catch (_) {}
    try {
      await logger.close();
    } catch (_) {}
    ProcessLock.release();
  }

  if (isInterrupted) {
    logger.info("Shutdown completed via interrupt signal. Skipped automated post-crawl sanitization.");
    console.log("Engine terminated cleanly.");
    process.exit(0);
  }

  console.log("Engine terminated cleanly.");
}

if (import.meta.main) {
  main().catch((err) => {
    logger.error("Fatal error in main runner", err);
    process.exit(1);
  });
}

export { main as startCrawler };
