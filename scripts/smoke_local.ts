import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { unusedLoopbackPort } from "./loopback_port.ts";

const smokeDir = mkdtempSync(join(tmpdir(), "vrc-local-smoke-"));
const resolvedSmokeDir = realpathSync(smokeDir);
if (!resolvedSmokeDir.startsWith(resolve(tmpdir()) + sep)) throw new Error("Smoke directory escaped system temp");
const dbPath = join(resolvedSmokeDir, "coordinator.db");
const binary = resolve("dist/vrc-coordinator.exe");
const nodeBinary = resolve("dist/vrc-node.exe");
const operatorToken = "b".repeat(64); // Isolated smoke fixture, never a deployment credential.
const env = { ...process.env, COORDINATOR_DB_PATH: dbPath, COORDINATOR_OPERATOR_TOKEN: operatorToken };
let server: ReturnType<typeof Bun.spawn> | undefined;
const nodes: Array<ReturnType<typeof Bun.spawn>> = [];

try {
  const nodeIds = ["smoke-node-a", "smoke-node-b"];
  const tokens = nodeIds.map((nodeId) => {
    const registration = Bun.spawnSync([binary, "register", nodeId, "vpm"], { env });
    if (registration.exitCode !== 0) throw new Error(new TextDecoder().decode(registration.stderr));
    return (JSON.parse(new TextDecoder().decode(registration.stdout)) as { token: string }).token;
  });
  const port = await unusedLoopbackPort();
  server = Bun.spawn([binary, "serve", String(port)], { env, stdout: "pipe", stderr: "pipe" });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/node/jobs/claim`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tokens[0]}` },
        body: JSON.stringify({ schemaVersion: 1, nodeId: nodeIds[0], capabilities: ["vpm"] })
      });
      if (response.ok && (await response.json() as any).status === "empty") { ready = true; break; }
    } catch { /* Wait for process startup. */ }
    await Bun.sleep(100);
  }
  if (!ready) throw new Error("Compiled coordinator did not accept a claim over loopback HTTP");
  const operatorDenied = await fetch(`http://127.0.0.1:${port}/v1/operator/leads`,
    { headers: { authorization: `Bearer ${tokens[0]}` } });
  const operatorAllowed = await fetch(`http://127.0.0.1:${port}/v1/operator/leads`,
    { headers: { authorization: `Bearer ${operatorToken}` } });
  if (operatorDenied.status !== 401 || operatorAllowed.status !== 200 ||
      (await operatorAllowed.json() as { schemaVersion: number }).schemaVersion !== 1) {
    throw new Error("Compiled operator API did not separate node and operator credentials");
  }
  const ruleResponse = await fetch(`http://127.0.0.1:${port}/v1/operator/autoqueue-rules`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${operatorToken}` },
    body: JSON.stringify({ schemaVersion: 1, leadKind: "vpm_listing", origin: "https://example.org",
      pathScope: "/index.json", minDelayMs: 1000,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reviewReference: "isolated-smoke-fixture", reason: "Compiled operator contract smoke" })
  });
  if (ruleResponse.status !== 201 || !(await ruleResponse.json() as { rule?: { ruleId?: string } }).rule?.ruleId) {
    throw new Error("Compiled operator API did not create a scoped rule");
  }
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
    throw new Error(`Coordinator and nodes did not have distinct process IDs: ${processIds.join(", ")}`);
  }
  await Promise.all(nodes.map(async (node, index) => {
    if (!node.stdout || typeof node.stdout === "number" || !node.stderr || typeof node.stderr === "number") {
      throw new Error("Compiled node output pipes were unavailable");
    }
    const [exitCode, output, error] = await Promise.all([
      node.exited, new Response(node.stdout).text(), new Response(node.stderr).text()
    ]);
    if (exitCode !== 0) throw new Error(`Compiled node ${nodeIds[index]} failed: ${error}`);
    if (!output.includes(`Crawler node ${nodeIds[index]} connected`)) {
      throw new Error(`Compiled node ${nodeIds[index]} did not use coordinator API`);
    }
  }));
  const inspection = Bun.spawnSync([binary, "inspect"], { env });
  if (inspection.exitCode !== 0) throw new Error(new TextDecoder().decode(inspection.stderr));
  const status = JSON.parse(new TextDecoder().decode(inspection.stdout)) as {
    nodes: Array<{ node_id: string; status: string; state: string; last_seen_at: string | null }>
  };
  for (const nodeId of nodeIds) {
    const heartbeat = status.nodes.find((entry) => entry.node_id === nodeId);
    if (!heartbeat || heartbeat.status !== "online" || heartbeat.state !== "idle" || !heartbeat.last_seen_at) {
      throw new Error(`Compiled node ${nodeId} heartbeat not inspectable: ${JSON.stringify(status.nodes)}`);
    }
  }
  console.log(`Compiled local coordinator and two standalone nodes passed loopback protocol smoke (PIDs ${processIds.join(", ")}).`);
} finally {
  for (const node of nodes) { node.kill(); await node.exited; }
  if (server) { server.kill(); await server.exited; }
  if (realpathSync(smokeDir) !== resolvedSmokeDir || !resolvedSmokeDir.startsWith(resolve(tmpdir()) + sep)) {
    throw new Error("Refusing to remove unexpected smoke path");
  }
  rmSync(resolvedSmokeDir, { recursive: true, force: true });
}
