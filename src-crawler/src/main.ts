import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { CoordinatorClient } from "./client/node_client.ts";
import { CrawlerNodeDaemon } from "./runner/daemon.ts";
import { initializeNodeConfig, loadNodeRuntimeConfig } from "./config/runtime_config.ts";
import { LocalNodeStore } from "./storage/local_sqlite.ts";
import { NodeIdSchema, PlatformSchema, type Platform } from "./shared/protocol/node_protocol.ts";
import { loadScopedGitHubTokenFromEnvFile } from "./adapters/observation_adapter.ts";
import { logger } from "./utils/logging/logger.ts";

if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
  const fallbackToken = loadScopedGitHubTokenFromEnvFile(process.cwd());
  if (fallbackToken) {
    process.env.GITHUB_TOKEN = fallbackToken;
  }
}

function printSetupGuide(): void {
  console.log(`=== VRC Package Crawler Node Setup Guide ===

To initialize a new crawler node configuration, specify a unique node identifier:

  vrc-node init <node-id> [coordinator-url] [capabilities]

Parameters:
  <node-id>
    Required unique string identifier for this node (e.g. desktop-1, worker-node-01).
    Must be 3-64 characters matching [a-zA-Z0-9_-].

  [coordinator-url]
    Coordinator service endpoint URL.
    Default: http://127.0.0.1:8787 (local loopback)
    Production: https://<your-coordinator-worker>.workers.dev

  [capabilities]
    Comma-separated list of platform capabilities.
    Supported platforms: ${PlatformSchema.options.join(", ")}
    Default: all supported platforms (${PlatformSchema.options.join(",")})
    The coordinator-issued token determines which capabilities are granted.

Examples:
  vrc-node init desktop-1
  vrc-node init worker-prod-1 https://vrc-coordinator.workers.dev
  vrc-node init gh-node http://127.0.0.1:8787 github,vpm

Next Steps:
  1. Ask the coordinator administrator to issue credentials for this node ID:
     POST /v1/operator/nodes using the administrator's operator credential.
     Do not place the operator credential on the crawler node.
  2. Provide the generated bearer token via NODE_TOKEN environment variable or .env:
     NODE_TOKEN=<token>
  3. Start the node daemon:
     vrc-node [--once]
`);
}

const args = Bun.argv.slice(2);
if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
  printSetupGuide();
  process.exit(0);
}

if (args[0] === "init") {
  if (args.length === 1) {
    console.error("Error: <node-id> argument is required for node initialization.\n");
    printSetupGuide();
    process.exit(1);
  }
  if (args.length > 4) {
    console.error("Usage: vrc-node init <node-id> [coordinator-url] [comma-separated-capabilities]");
    process.exit(2);
  }

  const rawNodeId = args[1];
  const parsedNodeId = NodeIdSchema.safeParse(rawNodeId);
  if (!parsedNodeId.success) {
    console.error(`Error: Invalid node-id '${rawNodeId}'. Must be 3-64 characters [a-zA-Z0-9_-].`);
    process.exit(2);
  }
  const nodeId = parsedNodeId.data;
  const coordinatorUrl = args[2] || "http://127.0.0.1:8787";
  const capabilities = args[3] ? (args[3].split(",") as Platform[]) : [...PlatformSchema.options];

  try {
    const path = initializeNodeConfig(process.cwd(), nodeId, coordinatorUrl, capabilities);
    console.log(`Created non-secret node config at ${path}; set NODE_TOKEN separately before running.`);
    process.exit(0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      console.log(`Node config already exists at ${join(process.cwd(), "node.config.json")}; skipping re-initialization.`);
      process.exit(0);
    }
    logger.error(`Failed to initialize node config: ${(error as Error).message}`);
    process.exit(1);
  }
}

let config: ReturnType<typeof loadNodeRuntimeConfig>;
try {
  config = loadNodeRuntimeConfig(process.cwd(), process.env);
} catch (error) {
  logger.error(`[Error] ${(error as Error).message}`);
  if (!existsSync(join(process.cwd(), "node.config.json"))) {
    logger.error("No node.config.json found in this directory. Run 'vrc-node init <node-id>' to initialize.");
  } else if (!process.env.NODE_TOKEN) {
    logger.error("NODE_TOKEN is required. Set it in .env or pass as an environment variable.");
    logger.error("Ask the coordinator administrator to issue a node token through POST /v1/operator/nodes.");
  }
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

let isShuttingDown = false;
const shutdown = async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    logger.info("Crawler node daemon shutting down...");
    daemon.stop();
  } catch (err) {
    logger.error("Error stopping daemon", err);
  }
  try {
    nodeStore.close();
  } catch (err) {
    logger.error("Error closing node store", err);
  }
  try {
    await logger.close();
  } catch (_) {}
  process.exit(0);
};

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection in crawler node", reason);
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception in crawler node", error);
  shutdown().finally(() => process.exit(1));
});

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
if (process.stdin.isTTY === false) {
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data) => {
    const text = String(data).trim();
    if (text === "stop" || text === "exit" || text === "shutdown") {
      void shutdown();
    }
  });
  process.stdin.unref();
}

try {
  await daemon.start();
} catch (err) {
  logger.error("Error running crawler node daemon", err);
} finally {
  await shutdown();
}
