import { db } from "./db.ts";
import { CONFIG } from "./config.ts";
import { ToolClassifier } from "./classifier.ts";
import fs from "fs";
import path from "path";

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

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "--";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

const startTime = Date.now();
let initialDone = -1;
let cachedCategoryCounts: Record<string, number> = {};
let lastCategoryCheck = 0;

function getCategoryBreakdown(): Record<string, number> {
  const now = Date.now();
  if (now - lastCategoryCheck > 5000 || Object.keys(cachedCategoryCounts).length === 0) {
    lastCategoryCheck = now;
    const rows = (db as any).db.query("SELECT title, description, tags_json FROM entities").all() as any[];
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

function getRecentLogs(maxLines: number = 4): string[] {
  const logFile = path.join(CONFIG.logsDir, "crawler.log");
  if (!fs.existsSync(logFile)) return [];
  try {
    const content = fs.readFileSync(logFile, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.slice(-maxLines).map(l => {
      const match = l.match(/^\[[^\]]+\]\s*(.*)$/);
      return match ? match[1].slice(0, 85) : l.slice(0, 85);
    });
  } catch {
    return [];
  }
}

async function runLiveMonitor() {
  while (isRunning) {
    const metrics = db.getMetrics();
    if (initialDone === -1) {
      initialDone = metrics.totalDone;
    }

    const S = metrics.totalDiscovered > 0 ? (metrics.totalDone / metrics.totalDiscovered) * 100 : 0;
    const elapsedSec = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
    const doneGained = metrics.totalDone - initialDone;
    const ratePerSec = doneGained / elapsedSec;
    const ratePerMin = (ratePerSec * 60).toFixed(1);

    // Calculate ETA
    let etaStr = "Calculating...";
    if (ratePerSec > 0.05 && metrics.totalPending > 0) {
      const remainingSec = Math.round(metrics.totalPending / ratePerSec);
      etaStr = formatDuration(remainingSec);
    } else if (metrics.totalPending === 0) {
      etaStr = "Complete (Frontier Exhausted)";
    }

    const catCounts = getCategoryBreakdown();
    const recentLogs = getRecentLogs(15);

    // Clear terminal screen and move cursor to top-left
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");

    console.log("\x1b[36m=================================================================================\x1b[0m");
    console.log("\x1b[1m\x1b[32m               VRC PACKAGE CRAWLER — LIVE HARVESTER MONITOR                      \x1b[0m");
    console.log("\x1b[36m=================================================================================\x1b[0m");
    console.log(` \x1b[90mUpdated:\x1b[0m ${new Date().toLocaleTimeString()}   |   \x1b[90mSession:\x1b[0m ${formatDuration(elapsedSec)}   |   \x1b[90mThroughput:\x1b[0m \x1b[32m+${ratePerMin} URLs/min\x1b[0m`);
    console.log(` \x1b[90mETA:\x1b[0m \x1b[33m${etaStr}\x1b[0m   |   \x1b[90mDatabase:\x1b[0m ${CONFIG.dbPath}`);
    console.log("\x1b[36m---------------------------------------------------------------------------------\x1b[0m");
    console.log(` \x1b[1mTotal Discovered URLs:\x1b[0m     ${metrics.totalDiscovered.toLocaleString()}`);
    console.log(` \x1b[1mFresh Pending Queue:\x1b[0m       \x1b[34m${metrics.totalFreshPending.toLocaleString()}\x1b[0m (Unvisited candidates)`);
    console.log(` \x1b[1mRetrying Queue:\x1b[0m            \x1b[33m${metrics.totalRetrying.toLocaleString()}\x1b[0m (Temporary network backoff/transient errors)`);
    console.log(` \x1b[1mTerminal Failed:\x1b[0m           \x1b[31m${metrics.totalFailed.toLocaleString()}\x1b[0m (Active failed status)`);
    console.log(` \x1b[1mQualified Discards:\x1b[0m        \x1b[90m${metrics.totalDiscarded.toLocaleString()}\x1b[0m (Archived dead endpoints / permanent 404s)`);
    console.log(` \x1b[1mHarvested & Processed:\x1b[0m     \x1b[32m${metrics.totalDone.toLocaleString()}\x1b[0m`);
    console.log(` \x1b[1mVetted VRChat Tools:\x1b[0m       \x1b[1m\x1b[32m${metrics.totalEntities.toLocaleString()}\x1b[0m (Pristine observations)`);
    console.log(` \x1b[1mCanonical Merged Tools:\x1b[0m    \x1b[1m\x1b[35m${metrics.totalMerged.toLocaleString()}\x1b[0m (Deduplicated catalog packages)`);
    console.log(` \x1b[1mQuarantined Pollution:\x1b[0m     \x1b[33m${(metrics.totalQuarantined || 0).toLocaleString()}\x1b[0m (Cosmetics / non-VR software)`);
    console.log(` \x1b[1mSaturation Index:\x1b[0m          ${renderProgressBar(S)} \x1b[33m${S.toFixed(2)}%\x1b[0m (Target: >= ${(CONFIG.targetSaturationScore * 100).toFixed(0)}%)`);
    console.log("\x1b[36m---------------------------------------------------------------------------------\x1b[0m");
    console.log("\x1b[1m Platform Queue Breakdown (Fresh vs Retrying vs Done vs Vetted Tools):\x1b[0m");
    for (const [p, s] of Object.entries(metrics.platformStats)) {
      const pName = p.toUpperCase().padEnd(8);
      const freshStr = s.pending.toLocaleString().padStart(5);
      const retryStr = s.retrying.toLocaleString().padStart(5);
      const doneStr = s.done.toLocaleString().padStart(6);
      const entStr = s.entities.toLocaleString().padStart(5);
      console.log(`   • \x1b[35m${pName}\x1b[0m : Fresh = \x1b[34m${freshStr}\x1b[0m | Retry = \x1b[33m${retryStr}\x1b[0m | Done = ${doneStr} | Vetted = \x1b[32m${entStr}\x1b[0m`);
    }
    console.log("\x1b[36m---------------------------------------------------------------------------------\x1b[0m");
    console.log("\x1b[1m Semantic Category Breakdown (Vetted Tools):\x1b[0m");
    for (const [cat, count] of Object.entries(catCounts)) {
      const catName = cat.padEnd(20);
      const countStr = count.toLocaleString().padStart(5);
      const pct = metrics.totalEntities > 0 ? ((count / metrics.totalEntities) * 100).toFixed(1) : "0.0";
      console.log(`   • \x1b[34m${catName}\x1b[0m : \x1b[1m\x1b[32m${countStr}\x1b[0m (${pct}%)`);
    }

    if (recentLogs.length > 0) {
      console.log("\x1b[36m---------------------------------------------------------------------------------\x1b[0m");
      console.log("\x1b[1m Recent Crawler Engine Activity Stream (index.ts):\x1b[0m");
      for (const logLine of recentLogs) {
        let colored = logLine;
        if (logLine.includes("[INFO]")) colored = logLine.replace("[INFO]", "\x1b[32m[INFO]\x1b[0m").slice(0, 60);
        else if (logLine.includes("[WARN]")) colored = logLine.replace("[WARN]", "\x1b[33m[WARN]\x1b[0m").slice(0, 60);
        else if (logLine.includes("[ERROR]")) colored = logLine.replace("[ERROR]", "\x1b[31m[ERROR]\x1b[0m").slice(0, 60);
        console.log(`   \x1b[90m›\x1b[0m ${colored}...`);
      }
    }

    console.log("\x1b[36m=================================================================================\x1b[0m");
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

