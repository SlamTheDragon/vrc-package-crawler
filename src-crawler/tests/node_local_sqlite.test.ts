import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, sep } from "node:path";
import { LocalNodeStore } from "../src/storage/local_sqlite.ts";
import type { CrawlJob, ResultResponse } from "../src/shared/protocol/node_protocol.ts";
import { getTestOutputDir } from "../../src-worker/test/helpers/test_directory.ts";

const tempRoot = getTestOutputDir();
function fixtureDirectory(): string { return mkdtempSync(join(tempRoot, "vrcp-crawler-node-store-")); }
function removeFixtureDirectory(directory: string): void {
  if (!realpathSync(directory).startsWith(tempRoot + sep)) throw new Error("Unexpected fixture path");
  rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

describe("LocalNodeStore database behavior", () => {
  test("creates schema, records runs and tasks, and tracks metrics correctly", () => {
    const directory = fixtureDirectory();
    const dbPath = join(directory, "node.db");
    try {
      const store = new LocalNodeStore(dbPath);
      const runId = store.startRun("test-node-1");
      expect(runId).toMatch(/^run_/);

      const runBefore = store.getRun(runId);
      expect(runBefore).not.toBeNull();
      expect(runBefore?.status).toBe("running");
      expect(runBefore?.tasksCompleted).toBe(0);
      expect(runBefore?.tasksFailed).toBe(0);

      const sampleJob: CrawlJob = {
        jobId: "job-101",
        leaseId: "00000000-0000-0000-0000-000000000101",
        platform: "vpm",
        purpose: "discovery",
        url: "https://example.org/vpm/index.json",
        origin: "https://example.org",
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
        retainClasses: ["normalized_facts"],
        etag: null,
        lastModified: null,
      };

      const taskId = store.recordClaimedJob(runId, sampleJob);
      expect(taskId).toMatch(/^task_/);

      const taskBefore = store.getTask(taskId);
      expect(taskBefore?.status).toBe("claimed");
      expect(taskBefore?.jobId).toBe("job-101");
      expect(taskBefore?.url).toBe("https://example.org/vpm/index.json");

      store.recordTaskProgress(taskId, "fetching");
      expect(store.getTask(taskId)?.status).toBe("fetching");

      const fakeResult: ResultResponse = {
        schemaVersion: 1,
        status: "accepted",
        jobId: "job-101",
        duplicate: false,
        sourceVersionCreated: true,
      };

      store.recordTaskSuccess(taskId, "batch", fakeResult, { durationMs: 450, httpStatus: 200, bytesFetched: 12000 });
      const taskAfter = store.getTask(taskId);
      expect(taskAfter?.status).toBe("completed");
      expect(taskAfter?.accepted).toBe(1);
      expect(taskAfter?.outcomeKind).toBe("batch");
      expect(taskAfter?.durationMs).toBe(450);
      expect(taskAfter?.httpStatus).toBe(200);
      expect(taskAfter?.bytesFetched).toBe(12000);

      const runAfterTask = store.getRun(runId);
      expect(runAfterTask?.tasksCompleted).toBe(1);
      expect(runAfterTask?.tasksFailed).toBe(0);

      // Record a failed task
      const failJob: CrawlJob = {
        jobId: "job-102",
        leaseId: "00000000-0000-0000-0000-000000000102",
        platform: "github",
        purpose: "metadata",
        url: "https://api.github.com/repos/example/pkg",
        origin: "https://api.github.com",
        leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
        retainClasses: ["normalized_facts"],
        etag: null,
        lastModified: null,
      };
      const failTaskId = store.recordClaimedJob(runId, failJob);
      store.recordTaskFailure(failTaskId, "Network timeout connecting to host", { durationMs: 5000, httpStatus: 504 });

      const failedTask = store.getTask(failTaskId);
      expect(failedTask?.status).toBe("failed");
      expect(failedTask?.errorMessage).toBe("Network timeout connecting to host");
      expect(failedTask?.httpStatus).toBe(504);

      const allTasks = store.listTasksForRun(runId);
      expect(allTasks.length).toBe(2);

      store.finishRun(runId, "completed");
      const finalRun = store.getRun(runId);
      expect(finalRun?.status).toBe("completed");
      expect(finalRun?.finishedAt).not.toBeNull();
      expect(finalRun?.tasksCompleted).toBe(1);
      expect(finalRun?.tasksFailed).toBe(1);

      store.close();
    } finally {
      removeFixtureDirectory(directory);
    }
  });

  test("auto-creates nested directories if database path is inside non-existent subdirectory", () => {
    const directory = fixtureDirectory();
    const nestedDbPath = join(directory, "sub", "deep", "node.db");
    try {
      const store = new LocalNodeStore(nestedDbPath);
      const runId = store.startRun("deep-node");
      expect(store.getRun(runId)?.status).toBe("running");
      store.close();
    } finally {
      removeFixtureDirectory(directory);
    }
  });
});
