import { CoordinatorClient } from "./coordinator_client.ts";
import { runLeasedJob } from "./lease_runner.ts";
import { fetchPublicMetadata } from "./public_metadata_fetch.ts";
import { PlatformSchema, type Platform } from "../shared/node_protocol.ts";

const baseUrl = process.env.COORDINATOR_URL || "http://127.0.0.1:8787";
const token = process.env.NODE_TOKEN || "";
const nodeId = process.env.NODE_ID || "";
const capabilities = (process.env.NODE_CAPABILITIES || PlatformSchema.options.join(",")).split(",") as Platform[];
const runOnce = Bun.argv.includes("--once");

if (!token || !nodeId) {
  console.error("Set NODE_ID and NODE_TOKEN from local-coordinator register before starting this node.");
  process.exit(2);
}

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
