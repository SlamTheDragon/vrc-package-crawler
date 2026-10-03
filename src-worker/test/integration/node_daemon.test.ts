import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LocalCoordinatorStore } from "../support/local_sqlite.ts";
import { handleNodeRequest } from "../../src/api/handler.ts";
import { CoordinatorClient } from "../../../src-crawler/src/client/node_client.js";
import { LocalNodeStore } from "../../../src-crawler/src/storage/local_sqlite.js";
import { CrawlerNodeDaemon } from "../../../src-crawler/src/runner/daemon.js";
import type { NodeRuntimeConfig } from "../../../src-crawler/src/config/runtime_config.js";
import { ResultRequestSchema, type ResultRequest } from "../../../src-crawler/src/shared/protocol/node_protocol.js";
import { seedApprovedFixtureJob } from "../helpers/source_access_fixture.ts";
import { getTestOutputDir } from "../helpers/test_directory.ts";

function createTempDir(): string {
  return mkdtempSync(join(getTestOutputDir(), "vrc-daemon-test-"));
}

describe("CrawlerNodeDaemon OOP daemon encapsulation", () => {
  test("lost acknowledgement survives restart as a failed task but exact wire replay recovers the receipt", async () => {
    const directory = createTempDir();
    const databasePath = join(directory, "node.db");
    const coordinatorStore = new LocalCoordinatorStore(":memory:");
    const nodeId = "daemon-ack-loss";
    const token = coordinatorStore.createNodeCredential(nodeId, ["vpm"]);
    seedApprovedFixtureJob(coordinatorStore, "https://example.org/vpm/ack.json", "vpm", 0, "metadata");
    coordinatorStore.recordRobotsSnapshot("https://example.org", 404);
    let captured: ResultRequest | undefined;
    let acceptedResponse: unknown;
    const server = Bun.serve({ port: 0, fetch: async request => {
      const isResult = new URL(request.url).pathname === "/v1/node/jobs/result";
      const wire = isResult ? ResultRequestSchema.parse(await request.clone().json()) : undefined;
      const response = await handleNodeRequest(request, coordinatorStore);
      if (isResult && response.ok && !captured) {
        captured = wire;
        acceptedResponse = await response.json();
        return Response.json({ error: "Acknowledgement lost after commit" }, { status: 503 });
      }
      return response;
    } });
    let nodeStore = new LocalNodeStore(databasePath);
    let sourceFetches = 0;
    try {
      const config: NodeRuntimeConfig = { nodeId, token, capabilities: ["vpm"],
        baseUrl: server.url.href, databasePath };
      const client = new CoordinatorClient(config.baseUrl, token, nodeId, ["vpm"], { maxRetries: 0 });
      const daemon = new CrawlerNodeDaemon(config, nodeStore, client, { fetchFn: async () => {
        sourceFetches++;
        return Response.json({ name: "com.example.ack-loss", version: "1.0.0",
          description: "Creator text not permitted for retention" });
      } });
      await expect(daemon.step()).rejects.toThrow("Coordinator 503");
      expect(captured).toBeDefined();
      expect(acceptedResponse).toMatchObject({ status: "accepted", duplicate: false });
      const task = nodeStore.listTasksForRun(daemon.currentRunId)[0]!;
      expect(task.status).toBe("failed");
      daemon.stop();
      nodeStore.close();
      nodeStore = new LocalNodeStore(databasePath);
      expect(nodeStore.getTask(task.taskId)?.status).toBe("failed");
      const replayClient = new CoordinatorClient(config.baseUrl, token, nodeId, ["vpm"], { maxRetries: 0 });
      const result = await replayClient.submit(captured!);
      expect(result).toMatchObject({ status: "accepted", duplicate: true, jobId: captured!.jobId });
      expect(sourceFetches).toBe(1);
      // Diagnostic boundary: the server receipt is recoverable, but no node outbox repaired the task.
      expect(nodeStore.getTask(task.taskId)?.status).toBe("failed");
    } finally {
      server.stop();
      nodeStore.close();
      coordinatorStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  test("initializes run tracking in node store and handles heartbeat & stop lifecycle", async () => {
    const coordinatorStore = new LocalCoordinatorStore(":memory:");
    const token = coordinatorStore.createNodeCredential("daemon-node-1", ["vpm"]);
    const server = Bun.serve({ port: 0, fetch: req => handleNodeRequest(req, coordinatorStore) });
    const nodeStore = new LocalNodeStore(":memory:");

    try {
      const config: NodeRuntimeConfig = {
        nodeId: "daemon-node-1",
        baseUrl: server.url.href,
        capabilities: ["vpm"],
        token,
        databasePath: ":memory:",
      };
      const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities);
      const daemon = new CrawlerNodeDaemon(config, nodeStore, client);

      expect(daemon.currentRunId).toMatch(/^run_/);
      expect(daemon.isStopping).toBe(false);
      expect(daemon.lastHeartbeatTimestamp).toBe(0);

      const initialRun = nodeStore.getRun(daemon.currentRunId);
      expect(initialRun).not.toBeNull();
      expect(initialRun?.status).toBe("running");
      expect(initialRun?.tasksCompleted).toBe(0);
      expect(initialRun?.tasksFailed).toBe(0);

      await daemon.heartbeat();
      expect(daemon.lastHeartbeatTimestamp).toBeGreaterThan(0);

      daemon.stop();
      expect(daemon.isStopping).toBe(true);

      const stoppedRun = nodeStore.getRun(daemon.currentRunId);
      expect(stoppedRun?.status).toBe("completed");
      expect(stoppedRun?.finishedAt).not.toBeNull();

      // Idempotent stop
      daemon.stop();
      expect(daemon.isStopping).toBe(true);
    } finally {
      server.stop();
      coordinatorStore.close();
      nodeStore.close();
    }
  });

  test("step() returns 'empty' when no jobs are available", async () => {
    const coordinatorStore = new LocalCoordinatorStore(":memory:");
    const token = coordinatorStore.createNodeCredential("daemon-node-empty", ["vpm"]);
    const server = Bun.serve({ port: 0, fetch: req => handleNodeRequest(req, coordinatorStore) });
    const nodeStore = new LocalNodeStore(":memory:");

    try {
      const config: NodeRuntimeConfig = {
        nodeId: "daemon-node-empty",
        baseUrl: server.url.href,
        capabilities: ["vpm"],
        token,
        databasePath: ":memory:",
      };
      const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities);
      const daemon = new CrawlerNodeDaemon(config, nodeStore, client);

      const outcome = await daemon.step();
      expect(outcome).toBe("empty");

      const run = nodeStore.getRun(daemon.currentRunId);
      expect(run?.tasksCompleted).toBe(0);
      expect(run?.tasksFailed).toBe(0);
    } finally {
      server.stop();
      coordinatorStore.close();
      nodeStore.close();
    }
  });

  test("step() claims and executes a leased job, persisting task success to node store", async () => {
    const coordinatorStore = new LocalCoordinatorStore(":memory:");
    const token = coordinatorStore.createNodeCredential("daemon-node-work", ["vpm"]);
    const url = "https://example.org/vpm/index.json";
    seedApprovedFixtureJob(coordinatorStore, url, "vpm", 0, "metadata");
    coordinatorStore.recordRobotsSnapshot("https://example.org", 404);

    const server = Bun.serve({ port: 0, fetch: req => handleNodeRequest(req, coordinatorStore) });
    const nodeStore = new LocalNodeStore(":memory:");

    const mockFetch = async () => new Response(JSON.stringify({
      name: "com.example.daemon-test-tool",
      version: "1.0.0",
      description: "Sample daemon test package"
    }), { headers: { "content-type": "application/json" } });

    try {
      const config: NodeRuntimeConfig = {
        nodeId: "daemon-node-work",
        baseUrl: server.url.href,
        capabilities: ["vpm"],
        token,
        databasePath: ":memory:",
      };
      const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities);
      const daemon = new CrawlerNodeDaemon(config, nodeStore, client, {
        fetchFn: mockFetch as any,
      });

      const outcome = await daemon.step();
      expect(outcome).toBe("claimed");

      const run = nodeStore.getRun(daemon.currentRunId);
      expect(run?.tasksCompleted).toBe(1);
      expect(run?.tasksFailed).toBe(0);

      const tasks = nodeStore.listTasksForRun(daemon.currentRunId);
      expect(tasks.length).toBe(1);
      expect(tasks[0].platform).toBe("vpm");
      expect(tasks[0].url).toBe(url);
      expect(tasks[0].status).toBe("completed");
      expect(tasks[0].accepted).toBe(1);
    } finally {
      server.stop();
      coordinatorStore.close();
      nodeStore.close();
    }
  });

  test("step() records task failure in node store when lease runner fails and rethrows error", async () => {
    const coordinatorStore = new LocalCoordinatorStore(":memory:");
    const token = coordinatorStore.createNodeCredential("daemon-node-fail", ["vpm"]);
    const url = "https://example.org/vpm/broken.json";
    seedApprovedFixtureJob(coordinatorStore, url, "vpm", 0, "metadata");
    coordinatorStore.recordRobotsSnapshot("https://example.org", 404);

    const server = Bun.serve({ port: 0, fetch: req => handleNodeRequest(req, coordinatorStore) });
    const nodeStore = new LocalNodeStore(":memory:");

    const mockFetch = async () => new Response(JSON.stringify({
      name: "com.example.broken",
      version: "1.0.0",
      description: "Sample package"
    }), { headers: { "content-type": "application/json" } });

    try {
      const config: NodeRuntimeConfig = {
        nodeId: "daemon-node-fail",
        baseUrl: server.url.href,
        capabilities: ["vpm"],
        token,
        databasePath: ":memory:",
      };
      const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities);
      // Simulate coordinator submission failure
      client.submit = async () => {
        throw new Error("Coordinator submission rejected");
      };

      const daemon = new CrawlerNodeDaemon(config, nodeStore, client, {
        fetchFn: mockFetch as any,
      });

      await expect(daemon.step()).rejects.toThrow("Coordinator submission rejected");

      const run = nodeStore.getRun(daemon.currentRunId);
      expect(run?.tasksCompleted).toBe(0);
      expect(run?.tasksFailed).toBe(1);

      const tasks = nodeStore.listTasksForRun(daemon.currentRunId);
      expect(tasks.length).toBe(1);
      expect(tasks[0].status).toBe("failed");
      expect(tasks[0].errorMessage).toContain("Coordinator submission rejected");
    } finally {
      server.stop();
      coordinatorStore.close();
      nodeStore.close();
    }
  });

  test("step() honors existing stop state and stopFilePath", async () => {
    const coordinatorStore = new LocalCoordinatorStore(":memory:");
    const token = coordinatorStore.createNodeCredential("daemon-node-stop", ["vpm"]);
    const server = Bun.serve({ port: 0, fetch: req => handleNodeRequest(req, coordinatorStore) });
    const nodeStore = new LocalNodeStore(":memory:");
    const tempDir = createTempDir();
    const stopFilePath = join(tempDir, "node.stop");

    try {
      const config: NodeRuntimeConfig = {
        nodeId: "daemon-node-stop",
        baseUrl: server.url.href,
        capabilities: ["vpm"],
        token,
        databasePath: ":memory:",
      };
      const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities);
      const daemon = new CrawlerNodeDaemon(config, nodeStore, client, { stopFilePath });

      daemon.stop();
      expect(await daemon.step()).toBe("stopped");

      // Reset daemon with stop file present on disk
      const daemon2 = new CrawlerNodeDaemon(config, nodeStore, client, { stopFilePath });
      writeFileSync(stopFilePath, "stop\n");
      expect(existsSync(stopFilePath)).toBe(true);

      expect(await daemon2.step()).toBe("stopped");
      expect(daemon2.isStopping).toBe(true);
      expect(existsSync(stopFilePath)).toBe(false); // Cleaned up
    } finally {
      server.stop();
      coordinatorStore.close();
      nodeStore.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("start() with runOnce: true exits after one step", async () => {
    const coordinatorStore = new LocalCoordinatorStore(":memory:");
    const token = coordinatorStore.createNodeCredential("daemon-node-once", ["vpm"]);
    const server = Bun.serve({ port: 0, fetch: req => handleNodeRequest(req, coordinatorStore) });
    const nodeStore = new LocalNodeStore(":memory:");

    try {
      const config: NodeRuntimeConfig = {
        nodeId: "daemon-node-once",
        baseUrl: server.url.href,
        capabilities: ["vpm"],
        token,
        databasePath: ":memory:",
      };
      const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities);
      const daemon = new CrawlerNodeDaemon(config, nodeStore, client, {
        runOnce: true,
      });

      await daemon.start();

      expect(daemon.isStopping).toBe(true);
      const run = nodeStore.getRun(daemon.currentRunId);
      expect(run?.status).toBe("completed");
    } finally {
      server.stop();
      coordinatorStore.close();
      nodeStore.close();
    }
  });

  test("start() continuous loop terminates cleanly when stopFilePath is written", async () => {
    const coordinatorStore = new LocalCoordinatorStore(":memory:");
    const token = coordinatorStore.createNodeCredential("daemon-node-loop", ["vpm"]);
    const server = Bun.serve({ port: 0, fetch: req => handleNodeRequest(req, coordinatorStore) });
    const nodeStore = new LocalNodeStore(":memory:");
    const tempDir = createTempDir();
    const stopFilePath = join(tempDir, "node.stop");

    try {
      const config: NodeRuntimeConfig = {
        nodeId: "daemon-node-loop",
        baseUrl: server.url.href,
        capabilities: ["vpm"],
        token,
        databasePath: ":memory:",
      };
      const client = new CoordinatorClient(config.baseUrl, config.token, config.nodeId, config.capabilities);
      const daemon = new CrawlerNodeDaemon(config, nodeStore, client, {
        runOnce: false,
        stopFilePath,
      });

      // Write stop file after a short delay
      setTimeout(() => {
        writeFileSync(stopFilePath, "stop\n");
      }, 30);

      await daemon.start();

      expect(daemon.isStopping).toBe(true);
      const run = nodeStore.getRun(daemon.currentRunId);
      expect(run?.status).toBe("completed");
      expect(existsSync(stopFilePath)).toBe(false);
    } finally {
      server.stop();
      coordinatorStore.close();
      nodeStore.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("step() fails closed and refuses execution when claimed job lease is already expired", async () => {
    const nodeStore = new LocalNodeStore(":memory:");
    let fetchCalled = false;
    const dummyFetcher = async () => {
      fetchCalled = true;
      return new Response("OK");
    };

    const mockClient = {
      claim: async () => ({
        schemaVersion: 1,
        status: "leased" as const,
        job: {
          jobId: "job-expired-1",
          platform: "vpm" as const,
          url: "https://vpm.example.com/expired",
          origin: "https://vpm.example.com",
          nextFetchAt: new Date().toISOString(),
          claimedBy: "daemon-node-test",
          leaseId: "lease-expired-1",
          leaseExpiresAt: new Date(Date.now() - 30_000).toISOString(), // Expired 30s ago!
          retainClasses: ["creator_prose"],
          publishClasses: ["creator_prose"],
        }
      }),
      heartbeat: async () => ({ schemaVersion: 1, status: "ok" as const }),
      submit: async () => { throw new Error("Should not submit"); }
    } as any;

    const config: NodeRuntimeConfig = {
      nodeId: "daemon-node-test",
      baseUrl: "https://vrc-coordinator.workers.dev",
      capabilities: ["vpm"],
      token: "dummy",
      databasePath: ":memory:",
    };

    const daemon = new CrawlerNodeDaemon(config, nodeStore, mockClient, {
      fetchFn: dummyFetcher as any,
      runOnce: true,
    });

    const outcome = await daemon.step();
    expect(outcome).toBe("empty");
    expect(fetchCalled).toBe(false);

    const tasks = nodeStore.listTasksForRun(daemon.currentRunId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("failed");
    expect(tasks[0].errorMessage).toContain("expired before execution");
    nodeStore.close();
  });

  test("start() continuous loop backs off safely when coordinator connection is lost", async () => {
    const nodeStore = new LocalNodeStore(":memory:");
    const tempDir = createTempDir();
    const stopFilePath = join(tempDir, "node.stop");
    let sleepCalls: number[] = [];

    const mockClient = {
      claim: async () => {
        throw new Error("Coordinator connection dropped (522 Connection Timed Out)");
      },
      heartbeat: async () => {
        throw new Error("Heartbeat timeout");
      },
    } as any;

    const config: NodeRuntimeConfig = {
      nodeId: "daemon-node-disconnect",
      baseUrl: "https://vrc-coordinator.workers.dev",
      capabilities: ["vpm"],
      token: "dummy",
      databasePath: ":memory:",
    };

    const daemon = new CrawlerNodeDaemon(config, nodeStore, mockClient, {
      runOnce: false,
      stopFilePath,
      sleepFn: async (ms) => {
        sleepCalls.push(ms);
        // Write stop file after first backoff sleep to cleanly terminate
        writeFileSync(stopFilePath, "stop\n");
      }
    });

    await daemon.start();

    expect(daemon.isStopping).toBe(true);
    expect(sleepCalls.length).toBeGreaterThanOrEqual(1);
    expect(sleepCalls[0]).toBe(5_000);
    nodeStore.close();
    rmSync(tempDir, { recursive: true, force: true });
  });
});
