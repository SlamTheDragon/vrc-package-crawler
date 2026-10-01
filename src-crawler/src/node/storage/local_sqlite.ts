import { Database } from "bun:sqlite";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CrawlJob, ResultResponse } from "../../shared/protocol/node_protocol.ts";

export interface NodeRunRecord {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed";
  tasksCompleted: number;
  tasksFailed: number;
}

export interface NodeTaskRecord {
  taskId: string;
  runId: string;
  jobId: string;
  leaseId: string;
  platform: string;
  url: string;
  claimedAt: string;
  status: "claimed" | "fetching" | "submitting" | "completed" | "failed";
  httpStatus: number | null;
  durationMs: number | null;
  bytesFetched: number | null;
  outcomeKind: string | null;
  submittedAt: string | null;
  accepted: number | null;
  errorMessage: string | null;
}

export class LocalNodeStore {
  private readonly db: Database;
  private readonly now: () => number;

  constructor(databasePath: string = ":memory:", now: () => number = Date.now) {
    if (databasePath !== ":memory:" && databasePath !== "") {
      mkdirSync(dirname(resolve(databasePath)), { recursive: true });
    }
    this.db = new Database(databasePath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA foreign_keys = ON;");
    this.db.run("PRAGMA busy_timeout = 10000;");
    this.now = now;
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS node_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS node_runs (
        run_id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        tasks_completed INTEGER NOT NULL DEFAULT 0,
        tasks_failed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS node_tasks (
        task_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES node_runs(run_id) ON DELETE CASCADE,
        job_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        status TEXT NOT NULL,
        http_status INTEGER,
        duration_ms INTEGER,
        bytes_fetched INTEGER,
        outcome_kind TEXT,
        submitted_at TEXT,
        accepted INTEGER,
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_node_tasks_job ON node_tasks(job_id);
      CREATE INDEX IF NOT EXISTS idx_node_tasks_run ON node_tasks(run_id);
    `);
    this.db.prepare("INSERT OR IGNORE INTO node_metadata (key, value) VALUES ('schema_version', '1')").run();
  }

  public startRun(nodeId: string): string {
    const runId = `run_${this.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const startedAt = new Date(this.now()).toISOString();
    this.db.prepare(`
      INSERT INTO node_runs (run_id, started_at, status, tasks_completed, tasks_failed)
      VALUES (?, ?, 'running', 0, 0)
    `).run(runId, startedAt);
    this.db.prepare("INSERT OR REPLACE INTO node_metadata (key, value) VALUES ('last_node_id', ?)").run(nodeId);
    return runId;
  }

  public recordClaimedJob(runId: string, job: CrawlJob): string {
    const taskId = `task_${this.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const claimedAt = new Date(this.now()).toISOString();
    this.db.prepare(`
      INSERT INTO node_tasks (task_id, run_id, job_id, lease_id, platform, url, claimed_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'claimed')
    `).run(taskId, runId, job.jobId, job.leaseId, job.platform, job.url, claimedAt);
    return taskId;
  }

  public recordTaskProgress(taskId: string, status: "fetching" | "submitting"): void {
    this.db.prepare("UPDATE node_tasks SET status = ? WHERE task_id = ?").run(status, taskId);
  }

  public recordTaskSuccess(
    taskId: string,
    outcomeKind: string,
    result: ResultResponse,
    metrics?: { durationMs?: number; httpStatus?: number; bytesFetched?: number }
  ): void {
    const submittedAt = new Date(this.now()).toISOString();
    const accepted = result.status === "accepted" ? 1 : 0;
    this.db.prepare(`
      UPDATE node_tasks
      SET status = 'completed', outcome_kind = ?, submitted_at = ?, accepted = ?,
          duration_ms = ?, http_status = ?, bytes_fetched = ?
      WHERE task_id = ?
    `).run(
      outcomeKind,
      submittedAt,
      accepted,
      metrics?.durationMs ?? null,
      metrics?.httpStatus ?? null,
      metrics?.bytesFetched ?? null,
      taskId
    );

    const task = this.db.prepare("SELECT run_id FROM node_tasks WHERE task_id = ?").get(taskId) as { run_id: string } | null;
    if (task) {
      this.db.prepare("UPDATE node_runs SET tasks_completed = tasks_completed + 1 WHERE run_id = ?").run(task.run_id);
    }
  }

  public recordTaskFailure(
    taskId: string,
    errorMessage: string,
    metrics?: { durationMs?: number; httpStatus?: number }
  ): void {
    this.db.prepare(`
      UPDATE node_tasks
      SET status = 'failed', error_message = ?, duration_ms = ?, http_status = ?
      WHERE task_id = ?
    `).run(errorMessage, metrics?.durationMs ?? null, metrics?.httpStatus ?? null, taskId);

    const task = this.db.prepare("SELECT run_id FROM node_tasks WHERE task_id = ?").get(taskId) as { run_id: string } | null;
    if (task) {
      this.db.prepare("UPDATE node_runs SET tasks_failed = tasks_failed + 1 WHERE run_id = ?").run(task.run_id);
    }
  }

  public finishRun(runId: string, status: "completed" | "failed" = "completed"): void {
    const finishedAt = new Date(this.now()).toISOString();
    this.db.prepare("UPDATE node_runs SET finished_at = ?, status = ? WHERE run_id = ?").run(finishedAt, status, runId);
  }

  public getRun(runId: string): NodeRunRecord | null {
    const row = this.db.prepare("SELECT * FROM node_runs WHERE run_id = ?").get(runId) as any;
    if (!row) return null;
    return {
      runId: row.run_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      tasksCompleted: row.tasks_completed,
      tasksFailed: row.tasks_failed,
    };
  }

  public getTask(taskId: string): NodeTaskRecord | null {
    const row = this.db.prepare("SELECT * FROM node_tasks WHERE task_id = ?").get(taskId) as any;
    if (!row) return null;
    return {
      taskId: row.task_id,
      runId: row.run_id,
      jobId: row.job_id,
      leaseId: row.lease_id,
      platform: row.platform,
      url: row.url,
      claimedAt: row.claimed_at,
      status: row.status,
      httpStatus: row.http_status,
      durationMs: row.duration_ms,
      bytesFetched: row.bytes_fetched,
      outcomeKind: row.outcome_kind,
      submittedAt: row.submitted_at,
      accepted: row.accepted,
      errorMessage: row.error_message,
    };
  }

  public listTasksForRun(runId: string): NodeTaskRecord[] {
    const rows = this.db.prepare("SELECT * FROM node_tasks WHERE run_id = ? ORDER BY claimed_at ASC").all(runId) as any[];
    return rows.map((row) => ({
      taskId: row.task_id,
      runId: row.run_id,
      jobId: row.job_id,
      leaseId: row.lease_id,
      platform: row.platform,
      url: row.url,
      claimedAt: row.claimed_at,
      status: row.status,
      httpStatus: row.http_status,
      durationMs: row.duration_ms,
      bytesFetched: row.bytes_fetched,
      outcomeKind: row.outcome_kind,
      submittedAt: row.submitted_at,
      accepted: row.accepted,
      errorMessage: row.error_message,
    }));
  }

  public close(): void {
    this.db.close(true);
  }
}
