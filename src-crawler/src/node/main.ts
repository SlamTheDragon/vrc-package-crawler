import { CoordinatorClient } from "./coordinator_client.ts";
import { runLeasedJob } from "./lease_runner.ts";
import { fetchPublicMetadata } from "./public_metadata_fetch.ts";
import { initializeNodeConfig, loadNodeRuntimeConfig } from "./runtime_config.ts";
import { PlatformSchema, type Platform } from "../shared/node_protocol.ts";

const args = Bun.argv.slice(2);
if (args[0] === "init") {
  if (!args[1] || args.length > 4) {
    console.error("Usage: vrc-node init <node-id> [coordinator-url] [comma-separated-capabilities]");
    process.exit(2);
  }
  const capabilities = args[3] ? args[3].split(",") as Platform[] : [...PlatformSchema.options];
  const path = initializeNodeConfig(process.cwd(), args[1], args[2], capabilities);
  console.log(`Created non-secret node config at ${path}; set NODE_TOKEN separately before running.`);
  process.exit(0);
}

const { baseUrl, token, nodeId, capabilities } = loadNodeRuntimeConfig(process.cwd(), process.env);
const runOnce = Bun.argv.includes("--once");

const client = new CoordinatorClient(baseUrl, token, nodeId, capabilities);
console.log(`Crawler node ${nodeId} connected to ${baseUrl}; capabilities: ${capabilities.join(",")}`);
let lastHeartbeatAt = 0;
async function heartbeat(): Promise<void> {
  await client.heartbeat("idle");
  lastHeartbeatAt = Date.now();
}
await heartbeat();
for (;;) {
  if (Date.now() - lastHeartbeatAt >= 30_000) await heartbeat();
  const claim = await client.claim();
  if (claim.status === "empty") {
    if (runOnce) break;
    await Bun.sleep(claim.retryAfterMs);
    continue;
  }
  const { job } = claim;
  console.log(`Fetching ${job.platform} ${job.url}`);
  const { outcome, result } = await runLeasedJob(job, client, fetchPublicMetadata);
  console.log(JSON.stringify({ jobId: job.jobId, outcome: outcome.kind, accepted: result.status,
    sourceVersionCreated: result.sourceVersionCreated }));
  await heartbeat();
  if (runOnce) break;
}
