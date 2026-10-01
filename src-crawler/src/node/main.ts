import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { CoordinatorClient } from "./coordinator_client.ts";
import { CrawlerNodeDaemon } from "./daemon.ts";
import { initializeNodeConfig, loadNodeRuntimeConfig } from "./runtime_config.ts";
import { LocalNodeStore } from "./local_sqlite.ts";
import { NodeIdSchema, PlatformSchema, type Platform } from "../shared/node_protocol.ts";
import { loadScopedGitHubTokenFromEnvFile } from "./observation_adapter.ts";
import { logger } from "../utils/logger.ts";

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
    Supported platforms: booth, github, vpm, gumroad, shopify
    Default: all supported platforms (booth,github,vpm,gumroad,shopify)

Examples:
  vrc-node init desktop-1
  vrc-node init worker-prod-1 https://vrc-coordinator.workers.dev
  vrc-node init gh-node http://127.0.0.1:8787 github,vpm

Next Steps:
  1. Register this node ID with the coordinator administrator:
     vrc-coordinator register <node-id>
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
    logger.error("Generate a token using coordinator: 'vrc-coordinator register <node-id>'.");
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
console.log(`Crawler node ${nodeId} connected to ${baseUrl}; capabilities: ${capabilities.join(",")}; database: ${databasePath}`);

const daemon = new CrawlerNodeDaemon(config, nodeStore, client, {
  runOnce,
  stopFilePath: stopFile,
});

let isShuttingDown = false;
const shutdown = () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  daemon.stop();
  nodeStore.close();
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
if (process.stdin.isTTY === false) {
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data) => {
    const text = String(data).trim();
    if (text === "stop" || text === "exit" || text === "shutdown") {
      shutdown();
    }
  });
  process.stdin.unref();
}

try {
  await daemon.start();
} finally {
  shutdown();
}
