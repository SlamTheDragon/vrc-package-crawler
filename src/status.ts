import { db } from "./db.ts";
import { dbV2 } from "./db_v2.ts";
import { CONFIG } from "./config.ts";
import { CrawlerIpcServer } from "./utils/ipc.ts";
import { runDatabaseExport } from "./exporter.ts";
import { runEdgeSync } from "./sync.ts";
import fs from "fs";
import path from "path";

let isRunning = true;

const shutdownStatus = (signal: string) => {
  if (!isRunning) return;
  isRunning = false;
  console.log("\n\x1b[33m[MONITOR] Stopped live status monitoring.\x1b[0m\n");
  try {
    db.close();
    dbV2.close();
  } catch (_) {}
  process.exit(0);
};

process.on("SIGINT", () => shutdownStatus("SIGINT"));
process.on("SIGTERM", () => shutdownStatus("SIGTERM"));

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

/**
 * Sub-millisecond SQL projection query using pre-indexed SQLite tables.
 * Eliminates O(N) JavaScript regex classification overhead entirely.
 */
function getCategoryBreakdown(): Record<string, number> {
  const counts: Record<string, number> = {
    "Avatars": 0,
    "World Creation": 0,
    "Shaders & Visuals": 0,
    "Tools & Utilities": 0
  };

  try {
    const rows = dbV2.query(`
      SELECT category, COUNT(*) as c
      FROM canonical_packages_v2
      GROUP BY category;
    `).all() as any[];

    for (const r of rows) {
      if (r.category && counts[r.category] !== undefined) {
        counts[r.category] = r.c;
      } else if (r.category) {
        counts[r.category] = r.c;
      }
    }
  } catch (_) {
    // Fallback if canonical_packages_v2 is not yet initialized
    try {
      const rows = db.query("SELECT category, COUNT(*) as c FROM merged_packages GROUP BY category;").all() as any[];
      for (const r of rows) {
        if (r.category) counts[r.category] = r.c;
      }
    } catch (_) {}
  }

  return counts;
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

let notificationMessage = "";
let notificationTimeout = 0;

function setNotification(msg: string) {
  notificationMessage = msg;
  notificationTimeout = Date.now() + 4000;
}

// Setup keyboard interactivity if running in a interactive terminal
if (process.stdin.isTTY && !process.argv.includes("--once")) {
  try {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", async (keyStr: string) => {
      const key = keyStr.toLowerCase();
      if (key === "\u0003" || key === "q") {
        // [q] or Ctrl+C: Signal daemon shutdown and exit monitor
        console.log("\n\x1b[33m[MONITOR] Dispatching graceful shutdown to daemon...\x1b[0m");
        await CrawlerIpcServer.sendCommand("stop");
        shutdownStatus("KEYPRESS_Q");
      } else if (key === "r") {
        // [r]: Force re-crawl
        const res = await CrawlerIpcServer.sendCommand("recrawl");
        setNotification(res.success ? "✓ Freshness re-crawl triggered on daemon" : `✗ Re-crawl failed: ${res.error}`);
      } else if (key === "s") {
        // [s]: Immediate edge sync
        setNotification("⏳ Running immediate Cloudflare edge sync...");
        try {
          const res = await runEdgeSync({ batchSize: 50 });
          setNotification(`✓ Edge sync complete: ${res.syncedPackages} packages synced (Dry-run: ${res.isDryRun})`);
        } catch (err: any) {
          setNotification(`✗ Edge sync failed: ${err.message}`);
        }
      } else if (key === "e") {
        // [e]: Export DB
        setNotification("⏳ Exporting defragmented catalog database (vrc_catalog.db)...");
        try {
          const out = await runDatabaseExport("catalog");
          setNotification(`✓ Export successful: ${path.basename(out)} ready`);
        } catch (err: any) {
          setNotification(`✗ Export failed: ${err.message}`);
        }
      }
    });
  } catch (_) {}
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
      etaStr = "Freshness Idle (24/7 Poisson)";
    }

    const catCounts = getCategoryBreakdown();
    const recentLogs = getRecentLogs(6);
    const ipcStatus = await CrawlerIpcServer.getStatus();

    // Clear terminal screen and move cursor to top-left
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");

    console.log("\x1b[36m=================================================================================\x1b[0m");
    console.log("\x1b[1m\x1b[32m               VRC PACKAGE CRAWLER — LIVE HARVESTER MONITOR                      \x1b[0m");
    console.log("\x1b[36m=================================================================================\x1b[0m");
    console.log(` \x1b[90mUpdated:\x1b[0m ${new Date().toLocaleTimeString()}   |   \x1b[90mSession:\x1b[0m ${formatDuration(elapsedSec)}   |   \x1b[90mThroughput:\x1b[0m \x1b[32m+${ratePerMin} URLs/min\x1b[0m`);
    const ghAuthStr = CONFIG.githubToken ? "\x1b[32mAuthenticated (5k/hr)\x1b[0m" : "\x1b[33mUnauthenticated (60/hr)\x1b[0m";
    const daemonStr = ipcStatus.running ? `\x1b[32mActive (Port ${ipcStatus.data.port})\x1b[0m` : "\x1b[31mOffline / Inactive\x1b[0m";
    console.log(` \x1b[90mDaemon:\x1b[0m  ${daemonStr}   |   \x1b[90mGitHub API:\x1b[0m ${ghAuthStr}   |   \x1b[90mETA:\x1b[0m \x1b[33m${etaStr}\x1b[0m`);
    console.log("\x1b[36m---------------------------------------------------------------------------------\x1b[0m");
    console.log(` \x1b[1mTotal Discovered URLs:\x1b[0m     ${metrics.totalDiscovered.toLocaleString()}`);
    console.log(` \x1b[1mFresh Pending Queue:\x1b[0m       \x1b[34m${metrics.totalFreshPending.toLocaleString()}\x1b[0m (Unvisited candidates)`);
    console.log(` \x1b[1mRetrying Queue:\x1b[0m            \x1b[33m${metrics.totalRetrying.toLocaleString()}\x1b[0m (Temporary network backoff/transient errors)`);
    console.log(` \x1b[1mTerminal Failed:\x1b[0m           \x1b[31m${metrics.totalFailed.toLocaleString()}\x1b[0m (Active failed status)`);
    console.log(` \x1b[1mHarvested & Processed:\x1b[0m     \x1b[32m${metrics.totalDone.toLocaleString()}\x1b[0m`);
    console.log(` \x1b[1mVetted VRChat Tools:\x1b[0m       \x1b[1m\x1b[32m${metrics.totalEntities.toLocaleString()}\x1b[0m (Pristine observations)`);
    console.log(` \x1b[1mCanonical Catalog Tools:\x1b[0m   \x1b[1m\x1b[35m${metrics.totalMerged.toLocaleString()}\x1b[0m (Deduplicated canonical packages)`);
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
    console.log("\x1b[1m Pre-Indexed Semantic Categories (canonical_packages_v2):\x1b[0m");
    for (const [cat, count] of Object.entries(catCounts)) {
      const catName = cat.padEnd(20);
      const countStr = count.toLocaleString().padStart(5);
      const pct = metrics.totalMerged > 0 ? ((count / metrics.totalMerged) * 100).toFixed(1) : "0.0";
      console.log(`   • \x1b[34m${catName}\x1b[0m : \x1b[1m\x1b[32m${countStr}\x1b[0m (${pct}%)`);
    }

    if (recentLogs.length > 0) {
      console.log("\x1b[36m---------------------------------------------------------------------------------\x1b[0m");
      console.log("\x1b[1m Recent Crawler Engine Activity Stream:\x1b[0m");
      for (const logLine of recentLogs) {
        let colored = logLine;
        if (logLine.includes("[INFO]")) colored = logLine.replace("[INFO]", "\x1b[32m[INFO]\x1b[0m").slice(0, 60);
        else if (logLine.includes("[WARN]")) colored = logLine.replace("[WARN]", "\x1b[33m[WARN]\x1b[0m").slice(0, 60);
        else if (logLine.includes("[ERROR]")) colored = logLine.replace("[ERROR]", "\x1b[31m[ERROR]\x1b[0m").slice(0, 60);
        console.log(`   \x1b[90m›\x1b[0m ${colored}...`);
      }
    }

    console.log("\x1b[36m=================================================================================\x1b[0m");
    if (Date.now() < notificationTimeout && notificationMessage) {
      console.log(` \x1b[1m\x1b[33m${notificationMessage}\x1b[0m`);
      console.log("\x1b[36m---------------------------------------------------------------------------------\x1b[0m");
    }

    if (process.argv.includes("--once")) {
      break;
    }

    console.log(" \x1b[1mControls:\x1b[0m \x1b[32m[r]\x1b[0m Force Re-crawl  |  \x1b[34m[s]\x1b[0m Edge Sync  |  \x1b[35m[e]\x1b[0m Export DB  |  \x1b[31m[q]\x1b[0m Shutdown");

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

runLiveMonitor().catch((err) => {
  console.error("Status monitor failed", err);
  try {
    db.close();
    dbV2.close();
  } catch (_) {}
  process.exit(1);
}).finally(() => {
  try {
    db.close();
    dbV2.close();
  } catch (_) {}
});
