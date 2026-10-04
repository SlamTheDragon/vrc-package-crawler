import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CoordinatorClient } from "../src/client/node_client.ts";
import { CrawlerNodeDaemon } from "../src/runner/daemon.ts";
import { runLeasedJob } from "../src/runner/lease_runner.ts";
import { LocalNodeStore } from "../src/storage/local_sqlite.ts";
import { CrawlJobSchema, type ClaimResponse } from "vrc-packages-network/node";
import type { NodeRuntimeConfig } from "../src/config/runtime_config.ts";

const config: NodeRuntimeConfig = { nodeId: "lifecycle-node", baseUrl: "https://coordinator.example",
  token: "fixture-only-not-a-live-credential", capabilities: ["vpm"], databasePath: ":memory:" };
const job = CrawlJobSchema.parse({ jobId: "lifecycle-job", leaseId: crypto.randomUUID(), platform: "vpm",
  purpose: "metadata", url: "https://example.org/index.json", origin: "https://example.org",
  leaseExpiresAt: "2099-01-01T00:00:00.000Z", retainClasses: ["normalized_facts"], etag: null, lastModified: null });
const receipt = { schemaVersion: 1 as const, status: "accepted" as const, jobId: job.jobId,
  duplicate: false, sourceVersionCreated: false };

function fixtureClient(overrides: Partial<Pick<CoordinatorClient, "claim" | "heartbeat" | "submit">> = {}) {
  return Object.assign(new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities), {
    claim: async (): Promise<ClaimResponse> => ({ schemaVersion: 1, status: "leased", job }),
    heartbeat: async () => ({ schemaVersion: 1 as const, status: "alive" as const, serverTime: new Date().toISOString() }),
    submit: async () => { throw new Error("Unexpected result submission"); },
  }, overrides);
}

describe("node-owned lifecycle cancellation", () => {
  test("a stop file aborts an active source fetch without another loop step", async () => {
    const directory = resolve(import.meta.dir, "../dist/tests/lifecycle");
    mkdirSync(directory, { recursive: true });
    const stopFilePath = resolve(directory, `${crypto.randomUUID()}.stop`);
    const store = new LocalNodeStore(":memory:");
    const started = Promise.withResolvers<void>();
    let aborted = false;
    let submissions = 0;
    const daemon = new CrawlerNodeDaemon(config, store,
      fixtureClient({ submit: async () => { submissions++; return receipt; } }), {
        stopFilePath,
        fetchFn: async (_input, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(init.signal?.reason);
          }, { once: true });
          started.resolve();
        }),
      });
    const running = daemon.start();
    try {
      await started.promise;
      writeFileSync(stopFilePath, "stop");
      await running;
      expect(aborted).toBe(true);
      expect(submissions).toBe(0);
      expect(store.listTasksForRun(daemon.currentRunId).map(task => task.status)).toEqual(["failed"]);
      expect(store.getRun(daemon.currentRunId)?.tasksFailed).toBe(1);
    } finally {
      daemon.stop();
      await running;
      store.close();
      rmSync(stopFilePath, { force: true });
    }
  }, 2_000);

  test("a stop file during a pending claim prevents source execution", async () => {
    const directory = resolve(import.meta.dir, "../dist/tests/lifecycle");
    mkdirSync(directory, { recursive: true });
    const stopFilePath = resolve(directory, `${crypto.randomUUID()}.stop`);
    const store = new LocalNodeStore(":memory:");
    const started = Promise.withResolvers<void>();
    const claim = Promise.withResolvers<ClaimResponse>();
    let fetches = 0;
    const daemon = new CrawlerNodeDaemon(config, store, fixtureClient({ claim: () => {
      started.resolve();
      return claim.promise;
    } }), { stopFilePath, fetchFn: async () => { fetches++; return new Response(null, { status: 304 }); } });
    const running = daemon.start();
    try {
      await started.promise;
      writeFileSync(stopFilePath, "stop");
      const deadline = Date.now() + 1_000;
      while (!daemon.isStopping && Date.now() < deadline) await Bun.sleep(10);
      expect(daemon.isStopping).toBe(true);
      claim.resolve({ schemaVersion: 1, status: "leased", job });
      await running;
      expect(fetches).toBe(0);
      expect(store.listTasksForRun(daemon.currentRunId)).toEqual([]);
    } finally {
      daemon.stop();
      claim.resolve({ schemaVersion: 1, status: "empty", retryAfterMs: 1000 });
      await running;
      store.close();
      rmSync(stopFilePath, { force: true });
    }
  }, 2_000);

  test("an already stopped runner makes no authority or source calls", async () => {
    const stop = new AbortController();
    stop.abort(new Error("fixture stop"));
    let calls = 0;
    const client = fixtureClient({ heartbeat: async () => { calls++; throw new Error("Unexpected heartbeat"); } });
    await expect(runLeasedJob(job, client, async () => { calls++; return new Response(null, { status: 304 }); },
      5_000, stop.signal)).rejects.toThrow("fixture stop");
    expect(calls).toBe(0);
  });

  test("stop during the final authority check skips submission", async () => {
    const stop = new AbortController();
    let checks = 0;
    let submissions = 0;
    const client = fixtureClient({ heartbeat: async () => {
      if (++checks === 2) stop.abort(new Error("fixture stop"));
      return { schemaVersion: 1, status: "alive", serverTime: new Date().toISOString() };
    }, submit: async () => { submissions++; return receipt; } });
    await expect(runLeasedJob(job, client, async () => new Response(null, { status: 304 }),
      5_000, stop.signal)).rejects.toThrow("fixture stop");
    expect(checks).toBe(2);
    expect(submissions).toBe(0);
  });

  test("stop during the first authority check prevents source fetch", async () => {
    const stop = new AbortController();
    let fetches = 0;
    const client = fixtureClient({ heartbeat: async () => {
      stop.abort(new Error("fixture stop"));
      return { schemaVersion: 1, status: "alive", serverTime: new Date().toISOString() };
    } });
    await expect(runLeasedJob(job, client, async () => {
      fetches++;
      return new Response(null, { status: 304 });
    }, 5_000, stop.signal)).rejects.toThrow("fixture stop");
    expect(fetches).toBe(0);
  });

  test("stop during idle heartbeat prevents claim", async () => {
    const store = new LocalNodeStore(":memory:");
    let claims = 0;
    let daemon: CrawlerNodeDaemon;
    daemon = new CrawlerNodeDaemon(config, store, fixtureClient({ heartbeat: async () => {
      daemon.stop();
      return { schemaVersion: 1, status: "alive", serverTime: new Date().toISOString() };
    }, claim: async () => {
      claims++;
      return { schemaVersion: 1, status: "leased", job };
    } }));
    try {
      expect(await daemon.step()).toBe("stopped");
      expect(claims).toBe(0);
    } finally { daemon.stop(); store.close(); }
  });

  test("stop aborts a pending fetch and drains failure bookkeeping", async () => {
    const store = new LocalNodeStore(":memory:");
    const started = Promise.withResolvers<void>();
    let aborted = false;
    let submissions = 0;
    const daemon = new CrawlerNodeDaemon(config, store,
      fixtureClient({ submit: async () => { submissions++; return receipt; } }), {
        fetchFn: async (_input, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(init.signal?.reason);
          }, { once: true });
          started.resolve();
        }),
      });
    const running = daemon.start();
    try {
      await started.promise;
      daemon.stop();
      await running;
      expect(aborted).toBe(true);
      expect(submissions).toBe(0);
      expect(store.listTasksForRun(daemon.currentRunId).map(task => task.status)).toEqual(["failed"]);
      expect(store.getRun(daemon.currentRunId)?.tasksFailed).toBe(1);
    } finally { daemon.stop(); await running; store.close(); }
  }, 2_000);

  test("stop while claim is pending prevents task creation and source fetch", async () => {
    const store = new LocalNodeStore(":memory:");
    const started = Promise.withResolvers<void>();
    const claim = Promise.withResolvers<ClaimResponse>();
    let fetches = 0;
    const daemon = new CrawlerNodeDaemon(config, store, fixtureClient({ claim: () => {
      started.resolve();
      return claim.promise;
    } }), { fetchFn: async () => { fetches++; return new Response(null, { status: 304 }); } });
    const running = daemon.start();
    try {
      await started.promise;
      daemon.stop();
      claim.resolve({ schemaVersion: 1, status: "leased", job });
      await running;
      expect(fetches).toBe(0);
      expect(store.listTasksForRun(daemon.currentRunId)).toEqual([]);
    } finally {
      daemon.stop();
      claim.resolve({ schemaVersion: 1, status: "empty", retryAfterMs: 1000 });
      await running;
      store.close();
    }
  }, 2_000);

  test("a fatal one-shot failure remains failed after final cleanup", async () => {
    const store = new LocalNodeStore(":memory:");
    const daemon = new CrawlerNodeDaemon(config, store, fixtureClient({ claim: async () => {
      throw new Error("fixture coordinator offline");
    } }), { runOnce: true });
    try {
      await expect(daemon.start()).rejects.toThrow("fixture coordinator offline");
      daemon.stop();
      expect(store.getRun(daemon.currentRunId)?.status).toBe("failed");
    } finally { daemon.stop(); store.close(); }
  });

  test("stop during an in-flight submission still records its accepted receipt", async () => {
    const store = new LocalNodeStore(":memory:");
    let daemon: CrawlerNodeDaemon;
    daemon = new CrawlerNodeDaemon(config, store, fixtureClient({ submit: async () => {
      daemon.stop();
      return receipt;
    } }), { fetchFn: async () => new Response(null, { status: 304 }) });
    try {
      await daemon.start();
      expect(store.listTasksForRun(daemon.currentRunId).map(task => task.status)).toEqual(["completed"]);
      expect(store.getRun(daemon.currentRunId)?.tasksCompleted).toBe(1);
    } finally { daemon.stop(); store.close(); }
  });
});
