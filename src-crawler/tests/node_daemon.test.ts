import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalCoordinatorStore } from "../src/worker/local_sqlite.ts";
import { handleNodeRequest } from "../src/worker/handler.ts";
import { CoordinatorClient } from "../src/node/coordinator_client.ts";
import { LocalNodeStore } from "../src/node/local_sqlite.ts";
import { CrawlerNodeDaemon } from "../src/node/daemon.ts";
import type { NodeRuntimeConfig } from "../src/node/runtime_config.ts";
import { seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "vrc-daemon-test-"));
}

describe("CrawlerNodeDaemon OOP daemon encapsulation", () => {
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
});
