import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { Coordinator } from "../src/worker/d1/coordinator.ts";
import {
  type D1Database,
  type D1PreparedStatement,
  type D1Result,
  type D1ExecResult
} from "../src/worker/d1/definitions.ts";
import workerEntry, { type Env } from "../src/worker/worker_entry.ts";
import { decodeCatalogCursor } from "../src/shared/operator_protocol.ts";

export function createMockD1Database(db = new Database(":memory:")): D1Database {
  db.run("PRAGMA foreign_keys = ON;");
  return {
    prepare(query: string): D1PreparedStatement {
      let boundValues: unknown[] = [];
      const stmt: D1PreparedStatement = {
        bind(...values: unknown[]): D1PreparedStatement {
          boundValues = values.map((v) => (v === undefined ? null : v));
          return stmt;
        },
        async first<T = unknown>(colName?: string): Promise<T | null> {
          const prepared = db.prepare(query);
          const row = prepared.get(...(boundValues as any)) as Record<string, unknown> | null;
          if (!row) return null;
          if (colName) return (row[colName] as T) ?? null;
          return row as T;
        },
        async run<T = unknown>(): Promise<D1Result<T>> {
          const prepared = db.prepare(query);
          prepared.run(...(boundValues as any));
          return { success: true };
        },
        async all<T = unknown>(): Promise<D1Result<T>> {
          const prepared = db.prepare(query);
          const results = prepared.all(...(boundValues as any)) as T[];
          return { success: true, results };
        }
      };
      (stmt as any)._execute = () => {
        const prepared = db.prepare(query);
        prepared.run(...(boundValues as any));
        return { success: true };
      };
      return stmt;
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const results: D1Result<T>[] = [];
      db.transaction(() => {
        for (const s of statements) {
          if (typeof (s as any)._execute === "function") {
            results.push((s as any)._execute());
          } else {
            results.push({ success: true });
          }
        }
      })();
      return results;
    },
    async exec(query: string): Promise<D1ExecResult> {
      db.exec(query);
      return { count: 1, duration: 0 };
    }
  };
}

describe("Cloudflare D1 Coordinator Store & Edge Worker Adapter", () => {
  it("Node registration and bearer authentication", async () => {
    const mockDb = createMockD1Database();
    const store = new Coordinator(mockDb);
    await store.initSchema();

    const token = await store.issueNodeCredential({
      schemaVersion: 1,
      nodeId: "node-alpha",
      capabilities: ["vpm", "github"],
      reason: "Initial node registration"
    }, "operator-admin");

    expect(typeof token).toBe("string");
    expect(token.length).toBe(64);

    const principal = await store.authenticate("node-alpha", token);
    expect(principal).not.toBeNull();
    expect(principal?.nodeId).toBe("node-alpha");
    expect(principal?.capabilities).toEqual(["vpm", "github"]);
    expect(typeof principal?.credentialVersion).toBe("string");

    const wrongTokenAuth = await store.authenticate("node-alpha", "0".repeat(64));
    expect(wrongTokenAuth).toBeNull();

    const unknownNodeAuth = await store.authenticate("node-unknown", token);
    expect(unknownNodeAuth).toBeNull();
  });

  it("Claiming a job under active source access profile", async () => {
    const mockDb = createMockD1Database();
    const store = new Coordinator(mockDb);
    await store.initSchema();

    const token = await store.issueNodeCredential({
      schemaVersion: 1,
      nodeId: "node-beta",
      capabilities: ["vpm"],
      reason: "VPM crawler node"
    }, "operator-admin");
    const principal = await store.authenticate("node-beta", token);
    expect(principal).not.toBeNull();

    await store.createSourceAccessProfile({
      schemaVersion: 1,
      platform: "vpm",
      origin: "https://vpm.example.com",
      pathScope: "/index.json",
      method: "GET",
      purpose: "metadata",
      minDelayMs: 1000,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      reviewReference: "REV-VPM-01",
      reason: "Permitted community package listing",
      retainClasses: ["normalized_facts", "creator_prose"],
      publishClasses: ["normalized_facts"]
    }, "operator-admin");

    await store.recordRobotsSnapshot("https://vpm.example.com", 200, "User-agent: *\nAllow: /");

    const jobId = await store.seedJob("https://vpm.example.com/index.json", "vpm", 1000, undefined, "metadata");
    expect(typeof jobId).toBe("string");

    const claimRes = await store.claim({
      schemaVersion: 1,
      nodeId: "node-beta",
      capabilities: ["vpm"]
    }, principal!);

    expect(claimRes.status).toBe("leased");
    if (claimRes.status !== "leased") throw new Error("Expected leased status");
    expect(claimRes.job.jobId).toBe(jobId);
    expect(claimRes.job.url).toBe("https://vpm.example.com/index.json");
    expect(claimRes.job.platform).toBe("vpm");
    expect(claimRes.job.retainClasses).toEqual(["normalized_facts", "creator_prose"]);
  });

  it("Heartbeat updates", async () => {
    const mockDb = createMockD1Database();
    const store = new Coordinator(mockDb);
    await store.initSchema();

    const token = await store.issueNodeCredential({
      schemaVersion: 1,
      nodeId: "node-gamma",
      capabilities: ["vpm"],
      reason: "Heartbeat test node"
    }, "operator-admin");
    const principal = (await store.authenticate("node-gamma", token))!;

    await store.createSourceAccessProfile({
      schemaVersion: 1,
      platform: "vpm",
      origin: "https://vpm.example.com",
      pathScope: "/index.json",
      method: "GET",
      purpose: "metadata",
      minDelayMs: 1000,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      reviewReference: "REV-VPM-02",
      reason: "Heartbeat profile",
      retainClasses: ["normalized_facts"],
      publishClasses: ["normalized_facts"]
    }, "operator-admin");

    await store.recordRobotsSnapshot("https://vpm.example.com", 200, "User-agent: *\nAllow: /");
    const jobId = await store.seedJob("https://vpm.example.com/index.json", "vpm", 1000, undefined, "metadata");

    const claimRes = await store.claim({
      schemaVersion: 1,
      nodeId: "node-gamma",
      capabilities: ["vpm"]
    }, principal);

    expect(claimRes.status).toBe("leased");
    if (claimRes.status !== "leased") throw new Error("Expected leased status");

    const fetchHb = await store.heartbeat({
      schemaVersion: 1,
      nodeId: "node-gamma",
      capabilities: ["vpm"],
      state: "fetching",
      activeJobId: claimRes.job.jobId,
      activeLeaseId: claimRes.job.leaseId
    }, principal);
    expect(fetchHb.status).toBe("alive");
    expect(typeof fetchHb.serverTime).toBe("string");

    const idleHb = await store.heartbeat({
      schemaVersion: 1,
      nodeId: "node-gamma",
      capabilities: ["vpm"],
      state: "idle"
    }, principal);
    expect(idleHb.status).toBe("alive");

    await expect(store.heartbeat({
      schemaVersion: 1,
      nodeId: "node-gamma",
      capabilities: ["vpm"],
      state: "fetching",
      activeJobId: "wrong-job-id",
      activeLeaseId: "wrong-lease-id"
    }, principal)).rejects.toThrow();
  });

  it("Submitting a complete observation and canonical package projection", async () => {
    const mockDb = createMockD1Database();
    const store = new Coordinator(mockDb);
    await store.initSchema();

    const token = await store.issueNodeCredential({
      schemaVersion: 1,
      nodeId: "node-delta",
      capabilities: ["vpm"],
      reason: "Submit test node"
    }, "operator-admin");
    const principal = (await store.authenticate("node-delta", token))!;

    await store.createSourceAccessProfile({
      schemaVersion: 1,
      platform: "vpm",
      origin: "https://vpm.example.com",
      pathScope: "/index.json",
      method: "GET",
      purpose: "metadata",
      minDelayMs: 1000,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      reviewReference: "REV-VPM-03",
      reason: "Submit profile",
      retainClasses: ["normalized_facts", "creator_prose"],
      publishClasses: ["normalized_facts"]
    }, "operator-admin");

    await store.recordRobotsSnapshot("https://vpm.example.com", 200, "User-agent: *\nAllow: /");
    const jobId = await store.seedJob("https://vpm.example.com/index.json", "vpm", 1000, undefined, "metadata");

    const claimRes = await store.claim({
      schemaVersion: 1,
      nodeId: "node-delta",
      capabilities: ["vpm"]
    }, principal);
    if (claimRes.status !== "leased") throw new Error("Expected leased status");

    const submitRes = await store.submit({
      schemaVersion: 1,
      nodeId: "node-delta",
      jobId: claimRes.job.jobId,
      leaseId: claimRes.job.leaseId,
      idempotencyKey: "submit-key-001",
      outcome: {
        kind: "changed",
        observation: {
          sourceItemKey: "com.example.avatar-optimizer",
          title: "Avatar Optimizer Pro",
          summary: "Optimizes VRChat avatars automatically",
          author: "VRC Devs",
          outboundLinks: [],
          originUpdatedAt: null
        }
      }
    }, principal);

    expect(submitRes.status).toBe("accepted");
    expect(submitRes.duplicate).toBe(false);
    expect(submitRes.sourceVersionCreated).toBe(true);

    const canonical = await store.getCanonicalPackage("com.example.avatar-optimizer");
    expect(canonical).not.toBeNull();
    expect(canonical?.canonicalId).toBe("com.example.avatar-optimizer");
    expect(canonical?.displayName).toBe("Avatar Optimizer Pro");
    expect(canonical?.vpmId).toBe("com.example.avatar-optimizer");
    expect(canonical?.lifecycle).toBe("active");
    expect(canonical?.umbrella).toBe("tools");

    const dupRes = await store.submit({
      schemaVersion: 1,
      nodeId: "node-delta",
      jobId: claimRes.job.jobId,
      leaseId: claimRes.job.leaseId,
      idempotencyKey: "submit-key-001",
      outcome: {
        kind: "changed",
        observation: {
          sourceItemKey: "com.example.avatar-optimizer",
          title: "Avatar Optimizer Pro",
          summary: "Optimizes VRChat avatars automatically",
          author: "VRC Devs",
          outboundLinks: [],
          originUpdatedAt: null
        }
      }
    }, principal);

    expect(dupRes.status).toBe("accepted");
    expect(dupRes.duplicate).toBe(true);
  });

  it("Operator catalog listing with keyset pagination", async () => {
    const mockDb = createMockD1Database();
    const store = new Coordinator(mockDb);
    await store.initSchema();

    const baseTime = Date.now();
    for (let i = 1; i <= 5; i++) {
      const ts = new Date(baseTime + i * 1000).toISOString();
      await store.upsertCanonicalPackage({
        canonicalId: `pkg-00${i}`,
        umbrella: "tools",
        category: "tooling",
        lifecycle: "active",
        displayName: `Package Number ${i}`,
        vpmId: `com.example.pkg${i}`,
        createdAt: ts,
        updatedAt: ts
      });
      await store.upsertSourceItem({
        sourceKey: `vpm:https://vpm.example.com/index.json:pkg-00${i}`,
        platform: "vpm",
        sourceUrl: "https://vpm.example.com/index.json",
        latestDigest: `digest-00${i}`
      });
      await store.createIdentityLink({
        sourceKey: `vpm:https://vpm.example.com/index.json:pkg-00${i}`,
        canonicalId: `pkg-00${i}`,
        evidenceKind: "vpm_id",
        confidence: 1.0,
        reviewState: "accepted",
        createdAt: ts
      });
    }

    const page1 = await store.listCanonicalPackagesPage(2, null);
    expect(page1.packages.length).toBe(2);
    expect(page1.nextCursor).not.toBeNull();
    expect(page1.packages[0].canonicalId).toBe("pkg-005");
    expect(page1.packages[1].canonicalId).toBe("pkg-004");
    expect(page1.packages[0].acceptedLinks.length).toBe(1);

    const cursor1 = decodeCatalogCursor(page1.nextCursor!);
    expect(cursor1).not.toBeNull();
    const page2 = await store.listCanonicalPackagesPage(2, cursor1);
    expect(page2.packages.length).toBe(2);
    expect(page2.nextCursor).not.toBeNull();
    expect(page2.packages[0].canonicalId).toBe("pkg-003");
    expect(page2.packages[1].canonicalId).toBe("pkg-002");

    const cursor2 = decodeCatalogCursor(page2.nextCursor!);
    expect(cursor2).not.toBeNull();
    const page3 = await store.listCanonicalPackagesPage(2, cursor2);
    expect(page3.packages.length).toBe(1);
    expect(page3.nextCursor).toBeNull();
    expect(page3.packages[0].canonicalId).toBe("pkg-001");
  });

  it("persists avatar compatibilities on submit and lists them (D1)", async () => {
    const mockDb = createMockD1Database();
    const store = new Coordinator(mockDb);
    await store.initSchema();

    const token = await store.issueNodeCredential({
      schemaVersion: 1,
      nodeId: "node-compat",
      capabilities: ["vpm"],
      reason: "Avatar compat test node"
    }, "operator-admin");
    const principal = (await store.authenticate("node-compat", token))!;

    await store.createSourceAccessProfile({
      schemaVersion: 1,
      platform: "vpm",
      origin: "https://vpm.example.com",
      pathScope: "/index.json",
      method: "GET",
      purpose: "metadata",
      minDelayMs: 1000,
      expiresAt: "2099-01-01T00:00:00Z",
      reviewReference: "rev-compat",
      reason: "Allow testing avatar compat persistence",
      retainClasses: ["normalized_facts", "creator_prose"],
      publishClasses: []
    }, "operator-admin");

    await store.recordRobotsSnapshot("https://vpm.example.com", 200, "User-agent: *\nAllow: /");
    await store.seedJob("https://vpm.example.com/index.json", "vpm", 1000, undefined, "metadata");

    const claimRes = await store.claim({
      schemaVersion: 1,
      nodeId: "node-compat",
      capabilities: ["vpm"]
    }, principal);
    if (claimRes.status !== "leased") throw new Error("Expected leased status");

    const submitRes = await store.submit({
      schemaVersion: 1,
      nodeId: "node-compat",
      jobId: claimRes.job.jobId,
      leaseId: claimRes.job.leaseId,
      idempotencyKey: "submit-compat-001",
      outcome: {
        kind: "changed",
        observation: {
          sourceItemKey: "com.example.avatar-dress",
          title: "【桔梗・マヌカ対応】Cute Dress",
          summary: "Clothing for Kikyo and Manuka",
          author: "Dev",
          outboundLinks: [],
          originUpdatedAt: null
        }
      }
    }, principal);

    expect(submitRes.status).toBe("accepted");
    const sourceKey = "vpm:https://vpm.example.com/index.json:com.example.avatar-dress";
    const compat = await store.listAvatarCompatibilities(sourceKey);
    expect(compat.length).toBe(2);
    expect(compat.map((c) => c.targetAvatarBase).sort()).toEqual(["kikyo", "manuka"]);
  });

  it("Worker edge fetch entrypoint routing", async () => {
    const mockDb = createMockD1Database();
    const store = new Coordinator(mockDb);
    await store.initSchema();

    const operatorToken = "a".repeat(64);
    const env: Env = {
      DB: mockDb,
      OPERATOR_TOKEN: operatorToken
    };

    const notFoundRes = await workerEntry.fetch(
      new Request("https://coordinator.internal/not-a-real-endpoint"),
      env
    );
    expect(notFoundRes.status).toBe(404);
    const notFoundJson = (await notFoundRes.json()) as { error: string };
    expect(notFoundJson.error).toBe("Not Found");

    const unauthOperatorRes = await workerEntry.fetch(
      new Request("https://coordinator.internal/v1/operator/source-profiles"),
      env
    );
    expect(unauthOperatorRes.status).toBe(401);

    const authOperatorRes = await workerEntry.fetch(
      new Request("https://coordinator.internal/v1/operator/source-profiles", {
        headers: { Authorization: `Bearer ${operatorToken}` }
      }),
      env
    );
    expect(authOperatorRes.status).toBe(200);
    const operatorJson = (await authOperatorRes.json()) as { profiles: unknown[] };
    expect(Array.isArray(operatorJson.profiles)).toBe(true);

    const nodeReq = await workerEntry.fetch(
      new Request("https://coordinator.internal/v1/node/jobs/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaVersion: 1, nodeId: "unauth", capabilities: ["vpm"] })
      }),
      env
    );
    expect(nodeReq.status).toBe(401);
  });
});
