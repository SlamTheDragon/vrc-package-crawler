import { CoordinatorClient } from "./coordinator_client.ts";
import { fetchJobOutcome } from "./observation_adapter.ts";
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
async function heartbeat(state: "idle" | "fetching", activeJobId?: string): Promise<void> {
  await client.heartbeat(state, activeJobId);
  lastHeartbeatAt = Date.now();
}
await heartbeat("idle");
for (;;) {
  if (Date.now() - lastHeartbeatAt >= 30_000) await heartbeat("idle");
  const claim = await client.claim();
  if (claim.status === "empty") {
    if (runOnce) break;
    await Bun.sleep(claim.retryAfterMs);
    continue;
  }
  const { job } = claim;
  await heartbeat("fetching", job.jobId);
  console.log(`Fetching ${job.platform} ${job.url}`);
  const outcome = await fetchJobOutcome(job, fetchPublicMetadata);
  const result = await client.submit({ jobId: job.jobId, leaseId: job.leaseId,
    idempotencyKey: crypto.randomUUID(), outcome });
  console.log(JSON.stringify({ jobId: job.jobId, outcome: outcome.kind, accepted: result.status,
    sourceVersionCreated: result.sourceVersionCreated }));
  await heartbeat("idle");
  if (runOnce) break;
}
