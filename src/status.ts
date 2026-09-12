import { db } from "./db.ts";
import { CONFIG } from "./config.ts";
import { ToolClassifier } from "./classifier.ts";

let isRunning = true;

process.on("SIGINT", () => {
  isRunning = false;
  console.log("\n\x1b[33m[MONITOR] Stopped live status monitoring.\x1b[0m\n");
  process.exit(0);
});

process.on("SIGTERM", () => {
  isRunning = false;
  process.exit(0);
});

function renderProgressBar(percentage: number, length: number = 25): string {
  const filled = Math.min(length, Math.max(0, Math.round((percentage / 100) * length)));
  const empty = length - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

const startTime = Date.now();
let initialEntities = -1;
let cachedCategoryCounts: Record<string, number> = {};
let lastCategoryCheck = 0;

function getCategoryBreakdown(): Record<string, number> {
  const now = Date.now();
  if (now - lastCategoryCheck > 5000 || Object.keys(cachedCategoryCounts).length === 0) {
    lastCategoryCheck = now;
    const rows = db.getNextPending ? (db as any).db.query("SELECT title, description, tags_json FROM entities").all() : [];
    const counts: Record<string, number> = {
      "Avatars": 0,
      "World Creation": 0,
      "Shaders & Visuals": 0,
      "Tools & Utilities": 0
    };
    for (const r of rows) {
      let tags: string[] = [];
      try {
        tags = JSON.parse(r.tags_json || "[]");
      } catch (_) {}
      const res = ToolClassifier.classify(r.title, r.description, tags);
      counts[res.category] = (counts[res.category] || 0) + 1;
    }
    cachedCategoryCounts = counts;
  }
  return cachedCategoryCounts;
}

async function runLiveMonitor() {
  while (isRunning) {
    const metrics = db.getMetrics();
    if (initialEntities === -1) {
      initialEntities = metrics.totalEntities;
    }

    const S = metrics.totalDiscovered > 0 ? (metrics.totalDone / metrics.totalDiscovered) * 100 : 0;
    const elapsedSec = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
    const entitiesGained = metrics.totalEntities - initialEntities;
    const ratePerMin = ((entitiesGained / elapsedSec) * 60).toFixed(1);
    const catCounts = getCategoryBreakdown();

    // Clear terminal screen and move cursor to top-left
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");

    console.log("\x1b[36m=================================================================\x1b[0m");
    console.log("\x1b[1m\x1b[32m           VRC PACKAGE CRAWLER — LIVE MONITOR DASHBOARD          \x1b[0m");
    console.log("\x1b[36m=================================================================\x1b[0m");
    console.log(` \x1b[90mUpdated:\x1b[0m ${new Date().toLocaleTimeString()}   |   \x1b[90mSession Time:\x1b[0m ${elapsedSec}s   |   \x1b[90mIngestion Speed:\x1b[0m +${ratePerMin}/min`);
    console.log(` \x1b[90mDatabase:\x1b[0m ${CONFIG.dbPath}`);
    console.log("\x1b[36m-----------------------------------------------------------------\x1b[0m");
    console.log(` \x1b[1mTotal Discovered URLs:\x1b[0m     ${metrics.totalDiscovered.toLocaleString()}`);
    console.log(` \x1b[1mPending Frontier Queue:\x1b[0m    ${metrics.totalPending.toLocaleString()}`);
    console.log(` \x1b[1mHarvested & Processed:\x1b[0m     ${metrics.totalDone.toLocaleString()}`);
    console.log(` \x1b[1mFailed / Retrying:\x1b[0m         ${metrics.totalFailed.toLocaleString()}`);
    console.log(` \x1b[1mVetted VRChat Tools:\x1b[0m       \x1b[1m\x1b[32m${metrics.totalEntities.toLocaleString()}\x1b[0m`);
    console.log(` \x1b[1mQuarantined Pollution:\x1b[0m     \x1b[33m${(metrics.totalQuarantined || 0).toLocaleString()}\x1b[0m (Non-VR software / cosmetic assets)`);
    console.log(` \x1b[1mDomain Saturation Index:\x1b[0m   ${renderProgressBar(S)} \x1b[33m${S.toFixed(2)}%\x1b[0m (Target: >= ${(CONFIG.targetSaturationScore * 100).toFixed(0)}%)`);
    console.log("\x1b[36m-----------------------------------------------------------------\x1b[0m");
    console.log("\x1b[1m Platform Breakdown (Vetted Ecosystem Tools):\x1b[0m");
    for (const [p, s] of Object.entries(metrics.platformStats)) {
      const pName = p.toUpperCase().padEnd(8);
      const pendingStr = s.pending.toLocaleString().padStart(6);
      const doneStr = s.done.toLocaleString().padStart(6);
      const entStr = s.entities.toLocaleString().padStart(5);
      console.log(`   • \x1b[35m${pName}\x1b[0m : Pending = ${pendingStr} | Done = ${doneStr} | Vetted Tools = \x1b[32m${entStr}\x1b[0m`);
    }
    console.log("\x1b[36m-----------------------------------------------------------------\x1b[0m");
    console.log("\x1b[1m Semantic Category Breakdown (Vetted Tools):\x1b[0m");
    for (const [cat, count] of Object.entries(catCounts)) {
      const catName = cat.padEnd(20);
      const countStr = count.toLocaleString().padStart(5);
      const pct = metrics.totalEntities > 0 ? ((count / metrics.totalEntities) * 100).toFixed(1) : "0.0";
      console.log(`   • \x1b[34m${catName}\x1b[0m : \x1b[1m\x1b[32m${countStr}\x1b[0m (${pct}%)`);
    }
    console.log("\x1b[36m=================================================================\x1b[0m");
    if (process.argv.includes("--once")) {
      db.close();
      break;
    }
    console.log(" \x1b[90m[Press Ctrl+C to exit monitor]\x1b[0m");

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

runLiveMonitor().catch((err) => {
  console.error("Status monitor failed", err);
  process.exit(1);
});
