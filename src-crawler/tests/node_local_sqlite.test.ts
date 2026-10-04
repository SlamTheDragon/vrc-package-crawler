import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";
import { LocalNodeStore } from "../src/storage/local_sqlite.ts";
import type { CrawlJob, ResultResponse } from "vrc-packages-network/node";
const outputPath = resolve(import.meta.dir, "../dist/tests");
mkdirSync(outputPath, { recursive: true });
const tempRoot = realpathSync(outputPath);
function fixtureDirectory(): string { return mkdtempSync(join(tempRoot, "vrcp-crawler-node-store-")); }
function removeFixtureDirectory(directory: string): void {
  if (!realpathSync(directory).startsWith(tempRoot + sep)) throw new Error("Unexpected fixture path");
  rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

describe("LocalNodeStore database behavior", () => {
  test("terminal writes roll back with counters and accepted recovery counts once after restart", () => {
    const directory = fixtureDirectory();
    const dbPath = join(directory, "node.db");
    let store = new LocalNodeStore(dbPath);
    const control = new Database(dbPath);
    try {
      const runId = store.startRun("atomic-node");
      const job: CrawlJob = { jobId: "atomic-job", leaseId: crypto.randomUUID(), platform: "vpm",
        purpose: "metadata", url: "https://example.org/index.json", origin: "https://example.org",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z", retainClasses: ["normalized_facts"], etag: null, lastModified: null };
      const taskId = store.recordClaimedJob(runId, job);
      store.recordTaskProgress(taskId, "fetching");
      const before = store.getTask(taskId);
      control.run("CREATE TRIGGER reject_failure_counter BEFORE UPDATE OF tasks_failed ON node_runs BEGIN SELECT RAISE(ABORT,'Failure counter rejected'); END;");
      expect(() => store.recordTaskFailure(taskId, "ACK lost")).toThrow("Failure counter rejected");
      expect(store.getTask(taskId)).toEqual(before);
      expect(store.getRun(runId)?.tasksFailed).toBe(0);
      control.run("DROP TRIGGER reject_failure_counter;");
      store.recordTaskFailure(taskId, "ACK lost");
      const failed = store.getTask(taskId);
      store.recordTaskFailure(taskId, "Repeat failure");
      store.recordTaskProgress(taskId, "submitting");
      expect(store.getTask(taskId)).toEqual(failed);
      expect(store.getRun(runId)?.tasksFailed).toBe(1);
      const receipt: ResultResponse = { schemaVersion: 1, status: "accepted", jobId: job.jobId,
        duplicate: true, sourceVersionCreated: false };
      expect(() => store.recordTaskSuccess(taskId, "changed", { ...receipt, jobId: "another-job" }))
        .toThrow("Result receipt does not match task job");
      expect(() => store.recordTaskSuccess(taskId, "changed", { ...receipt, schemaVersion: 999 } as never)).toThrow();
      expect(store.getTask(taskId)).toEqual(failed);
      control.run("CREATE TRIGGER reject_success_counter BEFORE UPDATE OF tasks_completed ON node_runs BEGIN SELECT RAISE(ABORT,'Success counter rejected'); END;");
      expect(() => store.recordTaskSuccess(taskId, "changed", receipt)).toThrow("Success counter rejected");
      expect(store.getTask(taskId)).toEqual(failed);
      expect(store.getRun(runId)?.tasksCompleted).toBe(0);
      control.run("DROP TRIGGER reject_success_counter;");
      store.close();
      store = new LocalNodeStore(dbPath);
      store.recordTaskSuccess(taskId, "changed", receipt, { durationMs: 10 });
      const completed = store.getTask(taskId);
      expect(completed?.status).toBe("completed");
      expect(completed?.errorMessage).toBeNull();
      store.recordTaskSuccess(taskId, "changed", receipt, { durationMs: 999 });
      store.recordTaskFailure(taskId, "Late failure");
      store.recordTaskProgress(taskId, "fetching");
      expect(store.getTask(taskId)).toEqual(completed);
      expect(store.getRun(runId)).toMatchObject({ tasksCompleted: 1, tasksFailed: 1 });
    } finally {
      control.close();
      store.close();
      removeFixtureDirectory(directory);
    }
  });

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
