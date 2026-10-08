import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { CoordinatorClient } from "./client/node_client.ts";
import { CrawlerNodeDaemon } from "./runner/daemon.ts";
import { loadNodeRuntimeConfig } from "./config/runtime_config.ts";
import { LocalNodeStore } from "./storage/local_sqlite.ts";
import { loadScopedGitHubTokenFromEnvFile } from "./adapters/observation_adapter.ts";
import { logger } from "./utils/logging/logger.ts";
import { version } from "../package.json";

const args = Bun.argv.slice(2);
if (args[0] === "--version") {
  if (args.length !== 1) process.exit(2);
  console.log(version);
  process.exit(0);
}

if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
  const fallbackToken = loadScopedGitHubTokenFromEnvFile(process.cwd());
  if (fallbackToken) {
    process.env.GITHUB_TOKEN = fallbackToken;
  }
}

let config: ReturnType<typeof loadNodeRuntimeConfig>;
try {
  config = loadNodeRuntimeConfig(process.cwd(), process.env);
} catch (error) {
  logger.error(`[Error] ${(error as Error).message}`);
  logger.error("The crawler node requires configuration via .env or environment variables (NODE_ID, NODE_TOKEN, and optional COORDINATOR_URL, NODE_CAPABILITIES, NODE_DB_PATH).");
  process.exit(1);
}

const { baseUrl, token, nodeId, capabilities, databasePath } = config;
const runOnce = Bun.argv.includes("--once");

const nodeStore = new LocalNodeStore(databasePath);
const stopFile = join(process.cwd(), "node.stop");
if (existsSync(stopFile)) {
  try { unlinkSync(stopFile); } catch {}
}

const client = new CoordinatorClient(baseUrl, token, nodeId, capabilities);
logger.info(`Crawler node ${nodeId} connected to ${baseUrl}; capabilities: ${capabilities.join(",")}; database: ${databasePath}`);

const daemon = new CrawlerNodeDaemon(config, nodeStore, client, {
  runOnce,
  stopFilePath: stopFile,
});

let exitCode = 0;

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection in crawler node", reason);
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception in crawler node", error);
  exitCode = 1;
  daemon.stop("failed");
});

process.once("SIGINT", () => { daemon.stop(); });
process.once("SIGTERM", () => { daemon.stop(); });
if (process.stdin.isTTY === false) {
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data) => {
    const text = String(data).trim();
    if (text === "stop" || text === "exit" || text === "shutdown") {
      daemon.stop();
    }
  });
  process.stdin.unref();
}

try {
  await daemon.start();
} catch (err) {
  logger.error("Error running crawler node daemon", err);
  exitCode = 1;
} finally {
  // Drain task writes and in-flight receipts before closing the local store.
  daemon.stop(exitCode === 0 ? "completed" : "failed");
  try {
    nodeStore.close();
  } catch (err) {
    exitCode = 1;
    logger.error("Error closing node store", err);
  }
  try {
    await logger.close();
  } catch {
    exitCode = 1;
  }
  process.exit(exitCode);
}
