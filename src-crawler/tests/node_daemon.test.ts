import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { CoordinatorClient } from "../src/client/node_client.ts";
import { CrawlerNodeDaemon } from "../src/runner/daemon.ts";
import { LocalNodeStore } from "../src/storage/local_sqlite.ts";
import type { NodeRuntimeConfig } from "../src/config/runtime_config.ts";
import { ClaimRequestSchema, ClaimResponseSchema, CrawlJobSchema, HeartbeatRequestSchema,
  HeartbeatResponseSchema, ResultRequestSchema, ResultResponseSchema,
  type ClaimResponse, type ResultRequest } from "vrc-packages-network/node";

const config: NodeRuntimeConfig = { nodeId: "daemon-fixture", token: "fixture-only-not-a-live-credential",
  capabilities: ["vpm"], baseUrl: "https://coordinator.invalid", databasePath: ":memory:" };
const job = CrawlJobSchema.parse({ jobId: "daemon-job", leaseId: crypto.randomUUID(), platform: "vpm",
  purpose: "metadata", url: "https://example.org/index.json", origin: "https://example.org",
  leaseExpiresAt: "2099-01-01T00:00:00.000Z", retainClasses: ["normalized_facts"], etag: null, lastModified: null });
const leased: ClaimResponse = { schemaVersion: 1, status: "leased", job };
const empty: ClaimResponse = { schemaVersion: 1, status: "empty", retryAfterMs: 1000 };
const client = () => new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities,
  { maxRetries: 0 });
const source = async () => Response.json({ name: "com.example.daemon", version: "1.0.0",
  description: "Creator prose excluded by this fixture lease" });

/** Node-only transport seam. No coordinator implementation or comparator server. */
async function withWire(
  claim: ClaimResponse,
  run: () => Promise<void>,
  result?: (payload: ResultRequest, wire: string) => Promise<Response>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init);
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe(`Bearer ${config.token}`);
    const wire = await request.text();
    const payload: unknown = JSON.parse(wire);
    switch (new URL(request.url).pathname) {
      case "/v1/node/jobs/claim":
        expect(ClaimRequestSchema.parse(payload).nodeId).toBe(config.nodeId);
        return Response.json(ClaimResponseSchema.parse(claim));
      case "/v1/node/heartbeat":
        expect(HeartbeatRequestSchema.parse(payload).nodeId).toBe(config.nodeId);
        return Response.json(HeartbeatResponseSchema.parse({ schemaVersion: 1, status: "alive",
          serverTime: new Date().toISOString() }));
      case "/v1/node/jobs/result": {
        const parsed = ResultRequestSchema.parse(payload);
        expect(parsed.nodeId).toBe(config.nodeId);
        return result ? result(parsed, wire) : Response.json(ResultResponseSchema.parse({ schemaVersion: 1,
          status: "accepted", jobId: parsed.jobId, duplicate: false, sourceVersionCreated: true }));
      }
      default: throw new Error("Unexpected node protocol route");
    }
  }) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

function fixtureDirectory(): string {
  const output = resolve(import.meta.dir, "../dist/tests/daemon");
  mkdirSync(output, { recursive: true });
  return mkdtempSync(join(realpathSync(output), "vrcp-daemon-"));
}
function removeFixture(directory: string): void {
  const root = realpathSync(resolve(import.meta.dir, "../dist/tests/daemon"));
  if (!realpathSync(directory).startsWith(root + sep)) throw new Error("Unexpected fixture path");
  rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

describe("node-owned daemon lifecycle through serialized contracts", () => {
  test("records initialization, heartbeat and idempotent stop", async () => {
    const store = new LocalNodeStore(":memory:");
    const daemon = new CrawlerNodeDaemon(config, store, client());
    try {
      expect(store.getRun(daemon.currentRunId)).toMatchObject({ status: "running", tasksCompleted: 0, tasksFailed: 0 });
      expect(daemon.lastHeartbeatTimestamp).toBe(0);
      await withWire(empty, async () => { await daemon.heartbeat(); });
      expect(daemon.lastHeartbeatTimestamp).toBeGreaterThan(0);
      daemon.stop();
      const stopped = store.getRun(daemon.currentRunId);
      expect(stopped).toMatchObject({ status: "completed" });
      expect(stopped?.finishedAt).not.toBeNull();
      daemon.stop();
      expect(store.getRun(daemon.currentRunId)).toEqual(stopped);
    } finally { daemon.stop(); store.close(); }
  });

  test("an empty claim creates no tasks", async () => {
    const store = new LocalNodeStore(":memory:");
    const daemon = new CrawlerNodeDaemon(config, store, client());
    try {
      await withWire(empty, async () => { expect(await daemon.step()).toBe("empty"); });
      expect(store.listTasksForRun(daemon.currentRunId)).toEqual([]);
    } finally { daemon.stop(); store.close(); }
  });

  test("accepted work records task success and counters", async () => {
    const store = new LocalNodeStore(":memory:");
    const daemon = new CrawlerNodeDaemon(config, store, client(), { fetchFn: source });
    try {
      await withWire(leased, async () => { expect(await daemon.step()).toBe("claimed"); });
      expect(store.getRun(daemon.currentRunId)).toMatchObject({ tasksCompleted: 1, tasksFailed: 0 });
      expect(store.listTasksForRun(daemon.currentRunId)).toMatchObject([
        { platform: "vpm", url: job.url, status: "completed", accepted: 1 }
      ]);
    } finally { daemon.stop(); store.close(); }
  });

  test("submission failure records a failed task and propagates", async () => {
    const store = new LocalNodeStore(":memory:");
    const daemon = new CrawlerNodeDaemon(config, store, client(), { fetchFn: source });
    try {
      await withWire(leased, async () => {
        await expect(daemon.step()).rejects.toThrow("Coordinator 409");
      }, async () => Response.json({ error: "Offline refusal" }, { status: 409 }));
      expect(store.getRun(daemon.currentRunId)).toMatchObject({ tasksCompleted: 0, tasksFailed: 1 });
      expect(store.listTasksForRun(daemon.currentRunId)).toMatchObject([
        { status: "failed", errorMessage: "Coordinator 409" }
      ]);
    } finally { daemon.stop(); store.close(); }
  });

  test("an existing stop file stops before authority or source requests", async () => {
    const directory = fixtureDirectory();
    const stopFilePath = join(directory, "node.stop");
    const store = new LocalNodeStore(":memory:");
    const daemon = new CrawlerNodeDaemon(config, store, client(), { stopFilePath,
      fetchFn: async () => { throw new Error("Stopped node reached source"); } });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(async () => { throw new Error("Stopped node reached coordinator"); }, { preconnect() {} });
    try {
      writeFileSync(stopFilePath, "stop");
      expect(await daemon.step()).toBe("stopped");
      expect(await daemon.step()).toBe("stopped");
      expect(existsSync(stopFilePath)).toBe(false);
      expect(store.listTasksForRun(daemon.currentRunId)).toEqual([]);
    } finally { globalThis.fetch = originalFetch; daemon.stop(); store.close(); removeFixture(directory); }
  });

  test("one-shot mode completes after one empty step", async () => {
    const store = new LocalNodeStore(":memory:");
    const daemon = new CrawlerNodeDaemon(config, store, client(), { runOnce: true });
    try {
      await withWire(empty, async () => { await daemon.start(); });
      expect(daemon.isStopping).toBe(true);
      expect(store.getRun(daemon.currentRunId)?.status).toBe("completed");
    } finally { daemon.stop(); store.close(); }
  });

  test("a continuous idle loop consumes a stop file", async () => {
    const directory = fixtureDirectory();
    const stopFilePath = join(directory, "node.stop");
    const store = new LocalNodeStore(":memory:");
    const daemon = new CrawlerNodeDaemon(config, store, client(), { stopFilePath,
      sleepFn: async () => { writeFileSync(stopFilePath, "stop"); await Bun.sleep(110); } });
    try {
      await withWire(empty, async () => { await daemon.start(); });
      expect(daemon.isStopping).toBe(true);
      expect(existsSync(stopFilePath)).toBe(false);
      expect(store.getRun(daemon.currentRunId)?.status).toBe("completed");
    } finally { daemon.stop(); store.close(); removeFixture(directory); }
  }, 2000);

  test("a schema-valid expired lease fails before source execution", async () => {
    const store = new LocalNodeStore(":memory:");
    let sourceCalls = 0;
    const daemon = new CrawlerNodeDaemon(config, store, client(), {
      fetchFn: async () => { sourceCalls++; return source(); } });
    const expired = ClaimResponseSchema.parse({ ...leased,
      job: { ...job, leaseExpiresAt: new Date(Date.now() - 30_000).toISOString() } });
    try {
      await withWire(expired, async () => { expect(await daemon.step()).toBe("empty"); });
      expect(sourceCalls).toBe(0);
      expect(store.listTasksForRun(daemon.currentRunId)[0]?.errorMessage).toContain("expired before execution");
      expect(store.getRun(daemon.currentRunId)?.tasksFailed).toBe(1);
    } finally { daemon.stop(); store.close(); }
  });

  test("coordinator loss keeps source idle and uses reconnect backoff", async () => {
    const store = new LocalNodeStore(":memory:");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(async () => { throw new Error("fetch failed"); }, { preconnect() {} });
    let sourceCalls = 0;
    const delays: number[] = [];
    const daemon = new CrawlerNodeDaemon(config, store, client(), {
      fetchFn: async () => { sourceCalls++; return source(); },
      sleepFn: async ms => { delays.push(ms); daemon.stop(); } });
    try {
      await daemon.start();
      expect(delays).toEqual([5000]);
      expect(sourceCalls).toBe(0);
      expect(store.listTasksForRun(daemon.currentRunId)).toEqual([]);
    } finally { globalThis.fetch = originalFetch; daemon.stop(); store.close(); }
  });

  test("lost ACK survives restart but receipt replay still needs the fixture-retained payload", async () => {
    const directory = fixtureDirectory();
    const databasePath = join(directory, "node.db");
    let store = new LocalNodeStore(databasePath);
    const daemon = new CrawlerNodeDaemon({ ...config, databasePath }, store, client(), { fetchFn: source });
    let captured: ResultRequest | undefined;
    let originalWire = "";
    try {
      await withWire(leased, async () => {
        await expect(daemon.step()).rejects.toThrow("Coordinator 503");
      }, async (payload, wire) => {
        captured = payload;
        originalWire = wire;
        return new Response(null, { status: 503 });
      });
      const task = store.listTasksForRun(daemon.currentRunId)[0]!;
      daemon.stop();
      store.close();
      store = new LocalNodeStore(databasePath);
      expect(store.getTask(task.taskId)?.status).toBe("failed");
      if (!captured) throw new Error("Expected fixture-retained result payload");
      await withWire(empty, async () => {
        expect((await client().submit(captured!)).duplicate).toBe(true);
      }, async (payload, wire) => {
        expect(wire).toBe(originalWire);
        return Response.json(ResultResponseSchema.parse({ schemaVersion: 1, status: "accepted",
          jobId: payload.jobId, duplicate: true, sourceVersionCreated: false }));
      });
      expect(store.getTask(task.taskId)?.status).toBe("failed");
      // This diagnoses missing durable recovery. It does not prove coordinator idempotency.
    } finally { daemon.stop(); store.close(); removeFixture(directory); }
  });

  test("durable outbox restart recovery: daemon autonomously replays pending outbox on restart", async () => {
    const directory = fixtureDirectory();
    const databasePath = join(directory, "node_recovery.db");
    let store: LocalNodeStore | null = null;
    let daemon1: CrawlerNodeDaemon | null = null;
    let daemon2: CrawlerNodeDaemon | null = null;
    try {
      store = new LocalNodeStore(databasePath);
      daemon1 = new CrawlerNodeDaemon({ ...config, databasePath }, store, client(), { fetchFn: source });
      let originalIdempotencyKey = "";

      // Step fails due to transient 503 on submission
      await withWire(leased, async () => {
        await expect(daemon1!.step()).rejects.toThrow("Coordinator 503");
      }, async (payload) => {
        originalIdempotencyKey = payload.idempotencyKey;
        return new Response(null, { status: 503 });
      });

      // Verify outbox entry was durably staged with status 'pending'
      const tasks = store.listTasksForRun(daemon1!.currentRunId);
      expect(tasks.length).toBe(1);
      const taskId = tasks[0]!.taskId;
      const outboxEntry = store.getOutboxEntryByTaskId(taskId);
      expect(outboxEntry).not.toBeNull();
      expect(outboxEntry?.idempotencyKey).toBe(originalIdempotencyKey);
      expect(outboxEntry?.status).toBe("pending");
      expect(outboxEntry?.retryCount).toBe(1);

      daemon1!.stop();
      store.close();
      store = null;

      // Restart node daemon with the same SQLite database
      store = new LocalNodeStore(databasePath);
      // Fast-forward retry backoff time so entry is immediately eligible
      const pending = store.getOutboxEntryByTaskId(taskId)!;
      store.markOutboxFailed(pending.outboxId, "fast-forward", -10_000);

      // Now it appears in pending outbox entries
      const eligibleEntries = store.getPendingOutboxEntries();
      expect(eligibleEntries.length).toBe(1);

      daemon2 = new CrawlerNodeDaemon({ ...config, databasePath }, store, client(), { fetchFn: source });
      let replaySawSameKey = false;

      // Replay via daemon flush
      await withWire(empty, async () => {
        const flushed = await daemon2!.flushOutbox();
        expect(flushed).toBe(1);
      }, async (payload) => {
        if (payload.idempotencyKey === originalIdempotencyKey) {
          replaySawSameKey = true;
        }
        return Response.json(ResultResponseSchema.parse({
          schemaVersion: 1,
          status: "accepted",
          jobId: payload.jobId,
          duplicate: false,
          sourceVersionCreated: true
        }));
      });

      expect(replaySawSameKey).toBe(true);
      const deliveredEntry = store.getOutboxEntryByTaskId(taskId)!;
      expect(deliveredEntry.status).toBe("sent");
      expect(deliveredEntry.receipt).toMatchObject({ status: "accepted", jobId: job.jobId });
      expect(store.getTask(taskId)?.status).toBe("completed");
      expect(store.getTask(taskId)?.accepted).toBe(1);
    } finally {
      daemon1?.stop();
      daemon2?.stop();
      try { store?.close(); } catch {}
      removeFixture(directory);
    }
  });

  test("durable outbox terminal failure: non-retryable 403 transitions outbox entry to dead", async () => {
    const store = new LocalNodeStore(":memory:");
    const daemon = new CrawlerNodeDaemon(config, store, client(), { fetchFn: source });
    try {
      await withWire(leased, async () => {
        await expect(daemon.step()).rejects.toThrow("Coordinator 403");
      }, async () => Response.json({ error: "Lease expired or forbidden" }, { status: 403 }));

      const tasks = store.listTasksForRun(daemon.currentRunId);
      expect(tasks.length).toBe(1);
      const outboxEntry = store.getOutboxEntryByTaskId(tasks[0]!.taskId);
      expect(outboxEntry).not.toBeNull();
      expect(outboxEntry?.status).toBe("dead");
      expect(outboxEntry?.lastError).toContain("Coordinator 403");

      // Verify that flushOutbox ignores dead entries
      const flushed = await daemon.flushOutbox();
      expect(flushed).toBe(0);
    } finally {
      daemon.stop();
      store.close();
    }
  });
});
