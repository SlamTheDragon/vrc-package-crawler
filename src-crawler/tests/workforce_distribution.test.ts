import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalCoordinatorStore } from "../src/worker/storage/local_sqlite.ts";
import { handleOperatorRequest } from "../src/worker/api/operator_handler.ts";
import { handleNodeRequest } from "../src/worker/api/handler.ts";
import { parseCapabilityToken } from "../src/shared/protocol/capability_token.ts";
import { PROTOCOL_VERSION, type Platform } from "../src/shared/protocol/node_protocol.ts";
import { OPERATOR_PROTOCOL_VERSION } from "../src/shared/protocol/operator_protocol.ts";

describe("Workforce Distribution & Capability-Encoded Node Tokens", () => {
  let tempDir: string;
  let dbPath: string;
  let store: LocalCoordinatorStore;
  const operatorToken = "a".repeat(64);

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "vrc-workforce-test-"));
    dbPath = join(tempDir, "coordinator.db");
    store = new LocalCoordinatorStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("issueNodeCredential issues vrcp_<auth_token><capability> token matching assigned capabilities", () => {
    const token = store.issueNodeCredential({
      schemaVersion: OPERATOR_PROTOCOL_VERSION,
      nodeId: "node-vpm-gh",
      capabilities: ["vpm", "github"],
      reason: "Provision vpm worker"
    }, "admin-operator");

    expect(token.startsWith("vrcp_")).toBe(true);
    expect(token.length).toBe(73); // 5 (vrcp_) + 64 (entropy) + 4 (code)

    const parsed = parseCapabilityToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.capabilities.sort()).toEqual(["github", "vpm"] as Platform[]);

    // Node can authenticate with the capability token
    const principal = store.authenticate("node-vpm-gh", token);
    expect(principal).not.toBeNull();
    expect(principal!.capabilities.sort()).toEqual(["github", "vpm"] as Platform[]);
  });

  test("POST /v1/operator/nodes issues capability-encoded token and auto-evaluates workforce when omitted", async () => {
    // Seed high-priority pending jobs for booth and shopify
    const now = new Date().toISOString();
    store.db.exec(`
      INSERT INTO crawl_jobs (job_id, platform, url, origin, state, next_fetch_at, created_at)
      VALUES
        ('job-b1', 'booth', 'https://booth.pm/items/1', 'https://booth.pm', 'pending', '${now}', '${now}'),
        ('job-b2', 'booth', 'https://booth.pm/items/2', 'https://booth.pm', 'pending', '${now}', '${now}'),
        ('job-s1', 'shopify', 'https://shopify.com/products/1', 'https://shopify.com', 'pending', '${now}', '${now}');
    `);

    // Operator registers node without explicit capabilities — coordinator auto-balances workforce
    const req = new Request("http://127.0.0.1:8787/v1/operator/nodes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${operatorToken}`
      },
      body: JSON.stringify({
        schemaVersion: OPERATOR_PROTOCOL_VERSION,
        nodeId: "node-auto-balanced",
        reason: "Auto balanced node deployment"
      })
    });

    const res = await handleOperatorRequest(req, store, operatorToken);
    expect(res.status).toBe(201);
    const data = await res.json() as any;

    expect(data.nodeId).toBe("node-auto-balanced");
    expect(data.token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
    // Because booth had 2 pending jobs, booth must be in the enabled capabilities
    expect(data.capabilities).toContain("booth");

    // Token decodes to the exact same capabilities returned
    const parsed = parseCapabilityToken(data.token);
    expect(parsed).not.toBeNull();
    expect(parsed!.capabilities.sort()).toEqual(data.capabilities.sort());
  });

  test("Node claim rejects unauthorized capabilities not granted by capability token", async () => {
    // Node only granted 'vpm'
    const token = store.createNodeCredential("node-vpm-only", ["vpm"]);

    // Attempting to claim with 'booth' capability must fail with 403
    const claimReq = new Request("http://127.0.0.1:8787/v1/node/jobs/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        schemaVersion: PROTOCOL_VERSION,
        nodeId: "node-vpm-only",
        capabilities: ["booth"] // Not granted!
      })
    });

    const res = await handleNodeRequest(claimReq, store);
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toContain("Capability not granted to node");
  });

  test("Downstream demand feedback signal dynamically reorients workforce distribution", async () => {
    // 1. Register downstream app
    const app = store.registerApp({
      schemaVersion: 1,
      appName: "VRC Community Client"
    });

    // 2. Submit high demand for sellfy
    store.recordDownstreamFeedback(app.appId, {
      schemaVersion: 1,
      signalType: "search_miss",
      requestedPlatform: "sellfy",
      query: "custom 3D avatar rig"
    });
    store.recordDownstreamFeedback(app.appId, {
      schemaVersion: 1,
      signalType: "search_miss",
      requestedPlatform: "sellfy",
      query: "face tracking blendshapes"
    });

    // 3. Coordinator evaluates workforce distribution
    const enabledCaps = store.evaluateWorkforceDistribution();
    // sellfy received 2 demand signals, giving it heavy priority boost
    expect(enabledCaps).toContain("sellfy");
  });
});
