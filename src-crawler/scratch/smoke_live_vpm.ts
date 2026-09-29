import { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { unusedLoopbackPort } from "./loopback_port.ts";

// Explicitly opt in: two distinct VRChat-community template examples, never release ZIP requests.
if (process.env.LIVE_VPM_SMOKE !== "1") {
  throw new Error("Set LIVE_VPM_SMOKE=1 to run the official-listing network smoke test");
}
const reviewReference = process.env.LIVE_SOURCE_REVIEW_REFERENCE;
const retainClasses = process.env.LIVE_SOURCE_RETAIN_CLASSES?.split(",").filter(Boolean);
if (!reviewReference || !retainClasses?.length) {
  throw new Error("Set LIVE_SOURCE_REVIEW_REFERENCE and LIVE_SOURCE_RETAIN_CLASSES for this reviewed live scope");
}

const listingUrl = "https://vrchat-community.github.io/template-package/index.json";
const recipeUrl = "https://raw.githubusercontent.com/vrchat-community/template-package-listing/main/source.json";
const smokeDir = mkdtempSync(join(tmpdir(), "vrc-live-vpm-"));
const resolvedSmokeDir = realpathSync(smokeDir);
if (!resolvedSmokeDir.startsWith(resolve(tmpdir()) + sep)) throw new Error("Smoke directory escaped system temp");
const dbPath = join(resolvedSmokeDir, "coordinator.db");
const coordinatorBinary = resolve(existsSync("dist/local-coordinator/vrc-coordinator.exe") ?
  "dist/local-coordinator/vrc-coordinator.exe" : "dist/vrc-coordinator.exe");
const nodeBinary = resolve(existsSync("dist/local-node/vrc-node.exe") ?
  "dist/local-node/vrc-node.exe" : "dist/vrc-node.exe");
const env: Record<string, string | undefined> = { ...process.env, COORDINATOR_DB_PATH: dbPath };
let server: ReturnType<typeof Bun.spawn> | undefined;
const nodes: Array<ReturnType<typeof Bun.spawn>> = [];

function command(binary: string, args: string[], commandEnv = env): string {
  const result = Bun.spawnSync([binary, ...args], { env: commandEnv });
  if (result.exitCode !== 0) {
    throw new Error(`${binary} exited ${result.exitCode}: ${new TextDecoder().decode(result.stderr)}`);
  }
  return new TextDecoder().decode(result.stdout);
}

try {
  const nodeIds = ["live-smoke-node-a", "live-smoke-node-b"];
  const tokens = nodeIds.map((nodeId) =>
    (JSON.parse(command(coordinatorBinary, ["register", nodeId, "vpm"])) as { token: string }).token);
  for (const target of [listingUrl, recipeUrl]) {
    const url = new URL(target);
    command(coordinatorBinary, ["profile-create", JSON.stringify({ schemaVersion: 1, platform: "vpm",
      origin: url.origin, pathScope: url.pathname, method: "GET", purpose: "discovery",
      minDelayMs: 1000, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      reviewReference, reason: "Explicit bounded live VPM metadata smoke",
      retainClasses, publishClasses: [] })]);
    command(coordinatorBinary, ["seed", "vpm", target, "1000", "discovery"]);
  }
  const expectedOrigins = [new URL(listingUrl).origin, new URL(recipeUrl).origin];
  const port = await unusedLoopbackPort();
  server = Bun.spawn([coordinatorBinary, "serve", String(port)], { env, stdout: "pipe", stderr: "pipe" });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/node/jobs/claim`);
      if (response.status === 404) { ready = true; break; }
    } catch { /* Wait for process startup. */ }
    await Bun.sleep(100);
  }
  if (!ready) {
    server.kill();
    await server.exited;
    const stderr = server.stderr && typeof server.stderr !== "number" ?
      await new Response(server.stderr).text() : "no stderr pipe";
    throw new Error(`Compiled coordinator did not start: ${stderr.slice(0, 1000)}`);
  }
  let robots: Array<{ origin: string; status_code: number }> = [];
  for (let i = 0; i < 200; i++) {
    const inspection = JSON.parse(command(coordinatorBinary, ["inspect"])) as {
      robots: Array<{ origin: string; status_code: number }>
    };
    robots = inspection.robots;
    if (expectedOrigins.every((origin) => robots.some((result) => result.origin === origin))) break;
    await Bun.sleep(250);
  }
  if (expectedOrigins.some((origin) => !robots.some((result) => result.origin === origin &&
      (result.status_code >= 200 && result.status_code < 300 || result.status_code === 404 || result.status_code === 410)))) {
    throw new Error(`Compiled serve did not automatically refresh both VPM robots origins: ${JSON.stringify(robots)}`);
  }
  const paceDb = new Database(dbPath, { readonly: true });
  try {
    const row = paceDb.prepare(`SELECT MAX(next_allowed_at) AS due FROM origin_leases
      WHERE origin IN (?,?)`).get(...expectedOrigins) as { due: string | null };
    if (!row.due) throw new Error("VPM origin pacing rows missing after robots preflight");
    await Bun.sleep(Math.max(0, Date.parse(row.due) - Date.now()) + 100);
  } finally { paceDb.close(true); }
  const { COORDINATOR_DB_PATH: _coordinatorDbPath,
    COORDINATOR_OPERATOR_TOKEN: _coordinatorOperatorToken, ...nodeBaseEnv } = env;
  for (const [index, nodeId] of nodeIds.entries()) {
    nodes.push(Bun.spawn([nodeBinary, "--once"], { env: {
      ...nodeBaseEnv, NODE_ID: nodeId, NODE_TOKEN: tokens[index], NODE_CAPABILITIES: "vpm",
      COORDINATOR_URL: `http://127.0.0.1:${port}`
    }, stdout: "pipe", stderr: "pipe" }));
  }
  const processIds = [process.pid, server.pid, ...nodes.map((node) => node.pid)];
  if (new Set(processIds).size !== processIds.length) {
    throw new Error(`Coordinator and live nodes did not have distinct PIDs: ${processIds.join(", ")}`);
  }
  const outputs = await Promise.all(nodes.map(async (node, index) => {
    if (!node.stdout || typeof node.stdout === "number" || !node.stderr || typeof node.stderr === "number") {
      throw new Error("Compiled node output pipes were unavailable");
    }
    const [exitCode, output, error] = await Promise.all([
      node.exited, new Response(node.stdout).text(), new Response(node.stderr).text()
    ]);
    if (exitCode !== 0) throw new Error(`Compiled node ${nodeIds[index]} failed: ${error}`);
    return output;
  }));
  if (!outputs.some((output) => output.includes('"outcome":"batch"')) ||
      !outputs.some((output) => output.includes('"outcome":"discovery"'))) {
    throw new Error(`Compiled nodes did not separately ingest listing and recipe: ${JSON.stringify(outputs)}`);
  }
  const completeEvidence = JSON.parse(command(coordinatorBinary, ["vpm-evidence"])) as Array<{
    sourceUrl: string; observation: { sourceItemKey: string; releases?: Array<{ version: string }> }
  }>;
  if (completeEvidence.length !== 1 || completeEvidence[0].sourceUrl !== listingUrl ||
      !completeEvidence[0].observation.sourceItemKey || !completeEvidence[0].observation.releases?.length) {
    throw new Error("Compiled coordinator did not expose the complete upstream VPM evidence");
  }
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db.prepare("SELECT payload_json,source_profile_id FROM source_versions LIMIT 1").get() as {
      payload_json: string; source_profile_id: string | null
    } | null;
    if (!row) throw new Error("No package evidence persisted from official listing");
    const payload = JSON.parse(row.payload_json) as {
      sourceItemKey: string; summary: string;
      releases?: Array<{ version: string; downloadUrl?: string; zipSha256?: string }>
    };
    if (!row.source_profile_id || payload.summary !== "" ||
        !db.prepare("SELECT 1 FROM source_access_profiles WHERE profile_id=?").get(row.source_profile_id)) {
      throw new Error("Listing evidence lacks reviewed profile attribution or prose minimization");
    }
    if (completeEvidence[0].observation.sourceItemKey !== payload.sourceItemKey ||
        JSON.stringify(completeEvidence[0].observation.releases?.map((release) => release.version)) !==
          JSON.stringify(payload.releases?.map((release) => release.version))) {
      throw new Error("Operator read model differs from persisted complete source evidence");
    }
    if (!payload.releases?.length || !payload.releases.every((release) => release.version && release.downloadUrl)) {
      throw new Error("Release evidence missing a version or URL");
    }
    const pendingLeads = (db.prepare("SELECT count(*) AS n FROM source_leads WHERE status='pending_review'").get() as { n: number }).n;
    if (pendingLeads !== 4) throw new Error(`Expected four distinct recipe leads, found ${pendingLeads}`);
    const attributedLeads = (db.prepare(`SELECT count(*) AS n FROM source_leads
      WHERE status='pending_review' AND first_seen_profile_id IS NOT NULL`).get() as { n: number }).n;
    if (attributedLeads !== pendingLeads) throw new Error("Recipe leads lack reviewed profile attribution");
    console.log(JSON.stringify({ source: listingUrl, packageId: payload.sourceItemKey,
      releaseVersions: payload.releases.map((release) => release.version),
      hashesPresent: payload.releases.filter((release) => release.zipSha256).length,
      sourceItems: (db.prepare("SELECT count(*) AS n FROM source_items").get() as { n: number }).n,
      recipeSource: recipeUrl, pendingLeads, nodePids: nodes.map((node) => node.pid) }));
  } finally { db.close(true); }
} finally {
  for (const node of nodes) { node.kill(); await node.exited; }
  if (server) { server.kill(); await server.exited; }
  if (realpathSync(smokeDir) !== resolvedSmokeDir || !resolvedSmokeDir.startsWith(resolve(tmpdir()) + sep)) {
    throw new Error("Refusing to remove unexpected smoke path");
  }
  rmSync(resolvedSmokeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
