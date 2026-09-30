import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { CoordinatorClient } from "./coordinator_client.ts";
import { runLeasedJob } from "./lease_runner.ts";
import { fetchPublicMetadata } from "./public_metadata_fetch.ts";
import { initializeNodeConfig, loadNodeRuntimeConfig } from "./runtime_config.ts";
import { LocalNodeStore } from "./local_sqlite.ts";
import { PlatformSchema, type Platform } from "../shared/node_protocol.ts";
import { loadScopedGitHubTokenFromEnvFile } from "./observation_adapter.ts";

if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
  const fallbackToken = loadScopedGitHubTokenFromEnvFile(process.cwd());
  if (fallbackToken) {
    process.env.GITHUB_TOKEN = fallbackToken;
  }
}

// FIXME: WARNING: Certain hardcoded node identity elements cannot pass pre-production process
// FIXME: CODEBASE NOT OOP-ORIENTED
// FIXME: might be better if there's a walk-through or a simple GUI panel for node setup, because the node is a client anyway, and thus its node arch will remain the way it is, but the cloudflare coordinator will be oriented to be coded for worker, while using its methods to emit a local binary to simulate remote cloudflare worker operation. To clarify, the goal is to truly operate as a crawler network, locally ingesting downstream data from sites to be manually verify that what was produced is something expected in cloudflare, before worker migration begins ("full 'final' post-production runtime during the pre-production phase")
const args = Bun.argv.slice(2);
if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
  console.log("Usage: vrc-node init [node-id] [coordinator-url] [comma-separated-capabilities]");
  console.log("       vrc-node [--once]");
  process.exit(0);
}

if (args[0] === "init") {
  if (args.length > 4) {
    console.error("Usage: vrc-node init [node-id] [coordinator-url] [comma-separated-capabilities]");
    process.exit(2);
  }
  const nodeId = args[1] || "node-1";
  const coordinatorUrl = args[2] || "http://127.0.0.1:8787";
  const capabilities = args[3] ? args[3].split(",") as Platform[] : [...PlatformSchema.options];
  try {
    const path = initializeNodeConfig(process.cwd(), nodeId, coordinatorUrl, capabilities);
    console.log(`Created non-secret node config at ${path}; set NODE_TOKEN separately before running.`);
    process.exit(0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      console.log(`Node config already exists at ${join(process.cwd(), "node.config.json")}; skipping re-initialization.`);
      process.exit(0);
    }
    throw error;
    // FIXME: use logger, dont explicitly throw errors
  }
}

let config: ReturnType<typeof loadNodeRuntimeConfig>;
try {
  config = loadNodeRuntimeConfig(process.cwd(), process.env);
} catch (error) {
  // FIXME: USE LOGGER
  console.error(`[Error] ${(error as Error).message}`);
  if (!existsSync(join(process.cwd(), "node.config.json"))) {
    console.error("No node.config.json found in this directory. Run 'vrc-node init [node-id]' to initialize.");
  } else if (!process.env.NODE_TOKEN) {
    console.error("NODE_TOKEN is required. Set it in .env or pass as an environment variable.");
    console.error("Generate a token using coordinator: 'vrc-coordinator register <node-id>'.");
  }
  process.exit(1);
}

const { baseUrl, token, nodeId, capabilities, databasePath } = config;
const runOnce = Bun.argv.includes("--once");

const nodeStore = new LocalNodeStore(databasePath);
const runId = nodeStore.startRun(nodeId);

const stopFile = join(process.cwd(), "node.stop");
if (existsSync(stopFile)) {
  try { unlinkSync(stopFile); } catch {}
}

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  if (existsSync(stopFile)) {
    try { unlinkSync(stopFile); } catch {}
  }
  nodeStore.finishRun(runId, "completed");
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

const client = new CoordinatorClient(baseUrl, token, nodeId, capabilities);
console.log(`Crawler node ${nodeId} connected to ${baseUrl}; capabilities: ${capabilities.join(",")}; database: ${databasePath}`);

let lastHeartbeatAt = 0;
async function heartbeat(): Promise<void> {
  await client.heartbeat("idle");
  lastHeartbeatAt = Date.now();
}

await heartbeat();
for (;;) {
  if (stopping || existsSync(stopFile)) {
    shutdown();
    break;
  }
  if (Date.now() - lastHeartbeatAt >= 30_000) await heartbeat();
  const claim = await client.claim();
  if (claim.status === "empty") {
    if (runOnce) break;
    const sleepTarget = Date.now() + claim.retryAfterMs;
    while (!stopping && Date.now() < sleepTarget) {
      if (existsSync(stopFile)) {
        shutdown();
        break;
      }
      await Bun.sleep(Math.min(100, sleepTarget - Date.now()));
    }
    continue;
  }
  const { job } = claim;
  console.log(`Fetching ${job.platform} ${job.url}`);
  const taskId = nodeStore.recordClaimedJob(runId, job);
  nodeStore.recordTaskProgress(taskId, "fetching");
  const startTime = performance.now();
  try {
    const { outcome, result } = await runLeasedJob(job, client, fetchPublicMetadata);
    const durationMs = Math.round(performance.now() - startTime);
    nodeStore.recordTaskSuccess(taskId, outcome.kind, result, { durationMs });
    console.log(JSON.stringify({
      jobId: job.jobId,
      outcome: outcome.kind,
      accepted: result.status,
      sourceVersionCreated: result.sourceVersionCreated,
    }));
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    nodeStore.recordTaskFailure(taskId, error instanceof Error ? error.message : String(error), { durationMs });
    throw error;
  }
  await heartbeat();
  if (runOnce) break;
}

shutdown();
