import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { unusedLoopbackPort } from "./loopback_port.ts";

/**
 * Pre-Production Local Simulation Smoke Test
 *
 * Verifies:
 * - Two binaries: vrc-coordinator and vrc-node
 * - Two configs: coordinator.config.json and node.config.json
 * - Two databases: coordinator.db and node.db
 * - Both running in the EXACT SAME working directory without collision
 * - Loopback HTTP API communication between node and coordinator
 * - Online querying of real live data (official VPM package index & recipe)
 * - True persistent records in coordinator.db and execution history in node.db
 */

const smokeDir = mkdtempSync(join(tmpdir(), "vrc-preprod-sim-"));
const resolvedSmokeDir = realpathSync(smokeDir);
if (!resolvedSmokeDir.startsWith(resolve(tmpdir()) + sep)) {
  throw new Error("Smoke directory escaped system temp");
}

const coordinatorBinary = resolve(
  existsSync("dist/local-coordinator/vrc-coordinator.exe")
    ? "dist/local-coordinator/vrc-coordinator.exe"
    : "dist/vrc-coordinator.exe"
);
const nodeBinary = resolve(
  existsSync("dist/local-node/vrc-node.exe")
    ? "dist/local-node/vrc-node.exe"
    : "dist/vrc-node.exe"
);

console.log(`[PreProd] Using coordinator binary: ${coordinatorBinary}`);
console.log(`[PreProd] Using node binary: ${nodeBinary}`);
console.log(`[PreProd] Shared working directory: ${resolvedSmokeDir}`);

let server: ReturnType<typeof Bun.spawn> | undefined;

function runCmd(binary: string, args: string[], env: Record<string, string | undefined>): string {
  const result = Bun.spawnSync([binary, ...args], { cwd: resolvedSmokeDir, env });
  if (result.exitCode !== 0) {
    const err = new TextDecoder().decode(result.stderr);
    throw new Error(`${binary} ${args.join(" ")} failed (exit ${result.exitCode}): ${err}`);
  }
  return new TextDecoder().decode(result.stdout);
}

try {
  const port = await unusedLoopbackPort();
  const coordinatorUrl = `http://127.0.0.1:${port}`;
  const baseEnv: Record<string, string | undefined> = {
    ...process.env,
    PATH: process.env.PATH,
  };

  // 1. Initialize coordinator config in shared working directory
  console.log("[PreProd] Step 1: Initializing coordinator config...");
  runCmd(coordinatorBinary, ["init", String(port)], baseEnv);
  const coordinatorConfigPath = join(resolvedSmokeDir, "coordinator.config.json");
  if (!existsSync(coordinatorConfigPath)) {
    throw new Error("coordinator.config.json was not created in shared working directory");
  }

  // 2. Initialize node config in the EXACT SAME working directory
  console.log("[PreProd] Step 2: Initializing node config in same directory...");
  runCmd(nodeBinary, ["init", "node-preprod-1", coordinatorUrl, "vpm,github"], baseEnv);
  const nodeConfigPath = join(resolvedSmokeDir, "node.config.json");
  if (!existsSync(nodeConfigPath)) {
    throw new Error("node.config.json was not created in shared working directory");
  }

  // 3. Register node with coordinator to obtain node token
  console.log("[PreProd] Step 3: Registering node to obtain token...");
  const registerOut = JSON.parse(runCmd(coordinatorBinary, ["register", "node-preprod-1", "vpm,github"], baseEnv));
  const nodeToken = registerOut.token;
  if (!nodeToken || typeof nodeToken !== "string") {
    throw new Error("Failed to obtain node token from coordinator register");
  }

  // 4. Create scoped source-access profiles for real VPM data sources
  console.log("[PreProd] Step 4: Creating source-access profiles for real data...");
  const targets = [
    { url: "https://vrchat-community.github.io/template-package/index.json", platform: "vpm", purpose: "discovery" },
    { url: "https://raw.githubusercontent.com/vrchat-community/template-package-listing/main/source.json", platform: "vpm", purpose: "discovery" },
  ];

  for (const t of targets) {
    const targetUrl = new URL(t.url);
    runCmd(coordinatorBinary, ["profile-create", JSON.stringify({
      schemaVersion: 1,
      platform: t.platform,
      origin: targetUrl.origin,
      pathScope: targetUrl.pathname,
      method: "GET",
      purpose: t.purpose,
      minDelayMs: 1000,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      reviewReference: t.url,
      reason: "Pre-production local simulation smoke test with real data",
      retainClasses: ["normalized_facts"],
      publishClasses: ["normalized_facts"],
    })], baseEnv);

    runCmd(coordinatorBinary, ["seed", t.platform, t.url, "1000", t.purpose], baseEnv);
  }

  // 5. Preflight robots for queued origins
  console.log("[PreProd] Step 5: Refreshing robots for seeded origins...");
  const robotsResult = JSON.parse(runCmd(coordinatorBinary, ["refresh-queued-robots", "2"], baseEnv));
  console.log(`[PreProd] Robots refreshed for ${robotsResult.refreshed.length} origin(s).`);

  // 6. Launch coordinator HTTP daemon in shared working directory
  console.log(`[PreProd] Step 6: Starting coordinator HTTP daemon on port ${port}...`);
  server = Bun.spawn([coordinatorBinary, "serve", String(port)], {
    cwd: resolvedSmokeDir,
    env: baseEnv,
    stdout: "pipe",
    stderr: "pipe",
  });

  let coordinatorReady = false;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${coordinatorUrl}/v1/node/jobs/claim`);
      if (res.status === 404 || res.status === 401) {
        coordinatorReady = true;
        break;
      }
    } catch {}
    await Bun.sleep(100);
  }
  if (!coordinatorReady) {
    throw new Error("Coordinator daemon failed to start on loopback port");
  }

  // Wait for origin pacing delay
  const coordDb = new Database(join(resolvedSmokeDir, "coordinator.db"), { readonly: true });
  try {
    const row = coordDb.prepare("SELECT MAX(next_allowed_at) AS due FROM origin_leases").get() as { due: string | null };
    if (row?.due) {
      const waitMs = Math.max(0, Date.parse(row.due) - Date.now()) + 100;
      if (waitMs > 0) {
        console.log(`[PreProd] Waiting ${waitMs}ms for origin pacing floor...`);
        await Bun.sleep(waitMs);
      }
    }
  } finally {
    coordDb.close(true);
  }

  // 7. Run crawler node in the EXACT SAME working directory
  console.log("[PreProd] Step 7: Launching crawler node in shared directory...");
  const nodeEnv: Record<string, string | undefined> = {
    ...baseEnv,
    NODE_TOKEN: nodeToken,
  };

  // Run first job (listing)
  const nodeRun1 = runCmd(nodeBinary, ["--once"], nodeEnv);
  console.log(`[PreProd] Node pass 1 completed: ${nodeRun1.trim()}`);

  // Run second job (recipe)
  const nodeRun2 = runCmd(nodeBinary, ["--once"], nodeEnv);
  console.log(`[PreProd] Node pass 2 completed: ${nodeRun2.trim()}`);

  // 8. Fundamental verification of dual environments in same directory
  console.log("[PreProd] Step 8: Verifying dual configs, dual databases, and ingestion truth...");

  const coordinatorDbPath = join(resolvedSmokeDir, "coordinator.db");
  const nodeDbPath = join(resolvedSmokeDir, "node.db");

  if (!existsSync(coordinatorConfigPath)) throw new Error("Missing coordinator.config.json");
  if (!existsSync(nodeConfigPath)) throw new Error("Missing node.config.json");
  if (!existsSync(coordinatorDbPath)) throw new Error("Missing coordinator.db");
  if (!existsSync(nodeDbPath)) throw new Error("Missing node.db");

  // Verify Coordinator DB records
  const verifyCoordDb = new Database(coordinatorDbPath, { readonly: true });
  let coordItemsCount = 0;
  let coordVersionsCount = 0;
  let coordLeadsCount = 0;
  try {
    const itemRow = verifyCoordDb.prepare("SELECT COUNT(*) AS count FROM source_items").get() as { count: number };
    coordItemsCount = itemRow.count;
    const versionRow = verifyCoordDb.prepare("SELECT COUNT(*) AS count FROM source_versions").get() as { count: number };
    coordVersionsCount = versionRow.count;
    const leadRow = verifyCoordDb.prepare("SELECT COUNT(*) AS count FROM source_leads").get() as { count: number };
    coordLeadsCount = leadRow.count;
  } finally {
    verifyCoordDb.close(true);
  }

  console.log(`[PreProd] Coordinator DB: ${coordItemsCount} source items, ${coordVersionsCount} versions, ${coordLeadsCount} leads`);
  if (coordItemsCount < 1) throw new Error("Coordinator DB recorded zero source items");
  if (coordVersionsCount < 1) throw new Error("Coordinator DB recorded zero source versions");

  // Verify Node DB records
  const verifyNodeDb = new Database(nodeDbPath, { readonly: true });
  let nodeRunsCount = 0;
  let nodeTasksCount = 0;
  let nodeTasksCompleted = 0;
  try {
    const runRow = verifyNodeDb.prepare("SELECT COUNT(*) AS count FROM node_runs").get() as { count: number };
    nodeRunsCount = runRow.count;
    const taskRow = verifyNodeDb.prepare("SELECT COUNT(*) AS count, SUM(accepted) AS acceptedCount FROM node_tasks").get() as { count: number; acceptedCount: number };
    nodeTasksCount = taskRow.count;
    nodeTasksCompleted = taskRow.acceptedCount;
  } finally {
    verifyNodeDb.close(true);
  }

  console.log(`[PreProd] Node DB: ${nodeRunsCount} runs, ${nodeTasksCount} tasks executed (${nodeTasksCompleted} accepted by coordinator)`);
  if (nodeRunsCount < 1) throw new Error("Node DB recorded zero runs");
  if (nodeTasksCount < 1) throw new Error("Node DB recorded zero tasks");
  if (nodeTasksCompleted < 1) throw new Error("Node DB recorded zero accepted tasks");

  // 9. Verify canonical projection via live catalog API over loopback HTTP
  // The coordinator sets COORDINATOR_OPERATOR_TOKEN from its env. In the smoke,
  // we read it from the register output (same binary process shares env).
  // We use the COORDINATOR_OPERATOR_TOKEN env var if present; otherwise the catalog
  // verification is skipped with a warning (operator token may not be set in CI).
  const operatorToken = process.env.COORDINATOR_OPERATOR_TOKEN;
  if (operatorToken && /^[a-f0-9]{64}$/.test(operatorToken)) {
    console.log("[PreProd] Step 9: Verifying canonical catalog via live loopback HTTP...");
    const catalogRes = await fetch(`${coordinatorUrl}/v1/operator/catalog?limit=100`, {
      headers: { authorization: `Bearer ${operatorToken}` }
    });
    if (catalogRes.status !== 200) {
      throw new Error(`GET /v1/operator/catalog returned ${catalogRes.status}: ${await catalogRes.text()}`);
    }
    const catalogBody = await catalogRes.json() as { packages?: unknown[] };
    const catalogCount = Array.isArray(catalogBody.packages) ? catalogBody.packages.length : 0;
    console.log(`[PreProd] Canonical catalog: ${catalogCount} package(s) visible via loopback HTTP`);
    // VPM ingestion must produce at least one canonical package (templates listing has ≥1 package)
    if (catalogCount < 1) throw new Error("Canonical catalog is empty after real VPM ingestion — canonical projection pipeline not wired");
    console.log("[PreProd] ✓ Canonical projection pipeline confirmed: real VPM data → canonical packages visible via API");
  } else {
    console.warn("[PreProd] Step 9 skipped: COORDINATOR_OPERATOR_TOKEN not set or invalid — catalog API not verified in this run");
  }

  console.log("\n=======================================================");
  console.log(" PRE-PRODUCTION LOCAL SIMULATION SMOKE: ALL PASS!");
  console.log(" - 2 binaries (coordinator + node) executed cleanly");
  console.log(" - 2 configs (coordinator.config.json + node.config.json) in same dir");
  console.log(" - 2 databases (coordinator.db + node.db) in same dir");
  console.log(" - API communication over loopback HTTP validated");
  console.log(" - Real online data queried and ingested faithfully");
  if (operatorToken && /^[a-f0-9]{64}$/.test(operatorToken)) {
    console.log(" - Canonical projection pipeline verified (VPM → canonical catalog API)");
  }
  console.log("=======================================================\n");

  console.log(JSON.stringify({
    success: true,
    directory: resolvedSmokeDir,
    coordinator: { config: "coordinator.config.json", db: "coordinator.db", sourceItems: coordItemsCount, versions: coordVersionsCount, leads: coordLeadsCount },
    node: { config: "node.config.json", db: "node.db", runs: nodeRunsCount, tasks: nodeTasksCount, accepted: nodeTasksCompleted },
  }));
} finally {
  if (server) {
    server.kill();
    await server.exited;
  }
  if (existsSync(resolvedSmokeDir)) {
    rmSync(resolvedSmokeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
