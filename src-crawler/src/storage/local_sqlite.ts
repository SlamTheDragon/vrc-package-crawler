import { Database } from "bun:sqlite";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ResultResponseSchema, type CrawlJob, type ResultRequest, type ResultResponse
} from "vrc-packages-network/node";

export interface NodeRunRecord {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed";
  tasksCompleted: number;
  tasksFailed: number;
}

export interface NodeOutboxRecord {
  outboxId: string;
  runId: string;
  taskId: string;
  jobId: string;
  leaseId: string;
  idempotencyKey: string;
  outcome: ResultRequest["outcome"];
  createdAt: string;
  retryCount: number;
  nextRetryAt: string;
  status: "pending" | "submitting" | "sent" | "dead";
  lastError: string | null;
  receipt: ResultResponse | null;
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
      CREATE TABLE IF NOT EXISTS node_outbox (
        outbox_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES node_runs(run_id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES node_tasks(task_id) ON DELETE CASCADE,
        job_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        outcome_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        last_error TEXT,
        receipt_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_node_outbox_status_retry ON node_outbox(status, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_node_outbox_job ON node_outbox(job_id);
      CREATE INDEX IF NOT EXISTS idx_node_outbox_task ON node_outbox(task_id);
    `);
    this.db.prepare("INSERT OR REPLACE INTO node_metadata (key, value) VALUES ('schema_version', '2')").run();
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
    this.db.prepare("UPDATE node_tasks SET status = ? WHERE task_id = ? AND status IN ('claimed','fetching','submitting')")
      .run(status, taskId);
  }

  public recordTaskSuccess(
    taskId: string,
    outcomeKind: string,
    result: ResultResponse,
    metrics?: { durationMs?: number; httpStatus?: number; bytesFetched?: number }
  ): void {
    const receipt = ResultResponseSchema.parse(result);
    this.db.transaction(() => {
      const task = this.db.prepare("SELECT run_id,job_id,status FROM node_tasks WHERE task_id = ?").get(taskId) as
        { run_id: string; job_id: string; status: string } | null;
      if (!task) return;
      if (receipt.jobId !== task.job_id) throw new Error("Result receipt does not match task job");
      if (task.status === "completed") return;
      const submittedAt = new Date(this.now()).toISOString();
      this.db.prepare(`
        UPDATE node_tasks
        SET status = 'completed', outcome_kind = ?, submitted_at = ?, accepted = ?,
            duration_ms = ?, http_status = ?, bytes_fetched = ?, error_message = NULL
        WHERE task_id = ?
      `).run(
        outcomeKind,
        submittedAt,
        1,
        metrics?.durationMs ?? null,
        metrics?.httpStatus ?? null,
        metrics?.bytesFetched ?? null,
        taskId
      );

      this.db.prepare("UPDATE node_runs SET tasks_completed = tasks_completed + 1 WHERE run_id = ?").run(task.run_id);
    }).immediate();
  }

  public recordTaskFailure(
    taskId: string,
    errorMessage: string,
    metrics?: { durationMs?: number; httpStatus?: number }
  ): void {
    this.db.transaction(() => {
      const task = this.db.prepare("SELECT run_id,status FROM node_tasks WHERE task_id = ?").get(taskId) as
        { run_id: string; status: string } | null;
      if (!task || task.status === "completed" || task.status === "failed") return;
      this.db.prepare(`
        UPDATE node_tasks
        SET status = 'failed', error_message = ?, duration_ms = ?, http_status = ?
        WHERE task_id = ?
      `).run(errorMessage, metrics?.durationMs ?? null, metrics?.httpStatus ?? null, taskId);

      this.db.prepare("UPDATE node_runs SET tasks_failed = tasks_failed + 1 WHERE run_id = ?").run(task.run_id);
    }).immediate();
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

  public stageOutboxOutcome(
    taskId: string,
    outcome: ResultRequest["outcome"],
    idempotencyKey: string = crypto.randomUUID(),
    maxPendingQuota: number = 1000
  ): string {
    const outboxId = `outbox_${this.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const createdAt = new Date(this.now()).toISOString();
    return this.db.transaction(() => {
      const task = this.db.prepare("SELECT run_id, job_id, lease_id, status FROM node_tasks WHERE task_id = ?").get(taskId) as
        { run_id: string; job_id: string; lease_id: string; status: string } | null;
      if (!task) throw new Error(`Task ${taskId} not found`);

      const pendingCount = (this.db.prepare(
        "SELECT COUNT(*) as count FROM node_outbox WHERE status IN ('pending', 'submitting')"
      ).get() as { count: number }).count;

      if (pendingCount >= maxPendingQuota) {
        throw new Error(`Outbox quota exceeded: ${pendingCount} pending items (limit: ${maxPendingQuota})`);
      }

      this.db.prepare(`
        UPDATE node_tasks
        SET status = 'submitting', outcome_kind = ?
        WHERE task_id = ?
      `).run(outcome.kind, taskId);

      this.db.prepare(`
        INSERT INTO node_outbox (
          outbox_id, run_id, task_id, job_id, lease_id, idempotency_key,
          outcome_json, created_at, retry_count, next_retry_at, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending')
      `).run(
        outboxId, task.run_id, taskId, task.job_id, task.lease_id,
        idempotencyKey, JSON.stringify(outcome), createdAt, createdAt
      );

      return outboxId;
    }).immediate();
  }

  public getPendingOutboxEntries(limit: number = 50): NodeOutboxRecord[] {
    const nowIso = new Date(this.now()).toISOString();
    const rows = this.db.prepare(`
      SELECT * FROM node_outbox
      WHERE status IN ('pending', 'submitting') AND next_retry_at <= ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(nowIso, limit) as any[];

    return rows.map((row) => this.mapOutboxRecord(row));
  }

  public getOutboxEntry(outboxId: string): NodeOutboxRecord | null {
    const row = this.db.prepare("SELECT * FROM node_outbox WHERE outbox_id = ?").get(outboxId) as any;
    if (!row) return null;
    return this.mapOutboxRecord(row);
  }

  public getOutboxEntryByTaskId(taskId: string): NodeOutboxRecord | null {
    const row = this.db.prepare("SELECT * FROM node_outbox WHERE task_id = ?").get(taskId) as any;
    if (!row) return null;
    return this.mapOutboxRecord(row);
  }

  public markOutboxDelivered(
    outboxId: string,
    result: ResultResponse,
    metrics?: { durationMs?: number; httpStatus?: number; bytesFetched?: number }
  ): void {
    const receipt = ResultResponseSchema.parse(result);
    this.db.transaction(() => {
      const outbox = this.db.prepare("SELECT * FROM node_outbox WHERE outbox_id = ?").get(outboxId) as any;
      if (!outbox) return;
      if (receipt.jobId !== outbox.job_id) {
        throw new Error("Result receipt does not match outbox job");
      }
      this.db.prepare(`
        UPDATE node_outbox
        SET status = 'sent', receipt_json = ?, last_error = NULL
        WHERE outbox_id = ?
      `).run(JSON.stringify(receipt), outboxId);

      const outcome = JSON.parse(outbox.outcome_json);
      this.recordTaskSuccess(outbox.task_id, outcome.kind, receipt, metrics);
    }).immediate();
  }

  public markOutboxFailed(outboxId: string, errorMessage: string, retryDelayMs: number = 5_000): void {
    this.db.transaction(() => {
      const nextRetryAt = new Date(this.now() + Math.max(0, retryDelayMs)).toISOString();
      this.db.prepare(`
        UPDATE node_outbox
        SET status = 'pending', retry_count = retry_count + 1, next_retry_at = ?, last_error = ?
        WHERE outbox_id = ?
      `).run(nextRetryAt, errorMessage, outboxId);

      const outbox = this.db.prepare("SELECT task_id FROM node_outbox WHERE outbox_id = ?").get(outboxId) as { task_id: string } | null;
      if (outbox) {
        this.db.prepare("UPDATE node_tasks SET error_message = ? WHERE task_id = ?").run(errorMessage, outbox.task_id);
      }
    }).immediate();
  }

  public markOutboxTerminal(outboxId: string, terminalReason: string): void {
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE node_outbox
        SET status = 'dead', last_error = ?
        WHERE outbox_id = ?
      `).run(terminalReason, outboxId);

      const outbox = this.db.prepare("SELECT task_id FROM node_outbox WHERE outbox_id = ?").get(outboxId) as { task_id: string } | null;
      if (outbox) {
        this.recordTaskFailure(outbox.task_id, terminalReason);
      }
    }).immediate();
  }

  public pruneOutbox(ttlMs: number = 86_400_000): { expiredDead: number; deleted: number } {
    const cutoffIso = new Date(this.now() - ttlMs).toISOString();
    return this.db.transaction(() => {
      const expiredPending = this.db.prepare(`
        SELECT task_id, outbox_id FROM node_outbox
        WHERE status IN ('pending', 'submitting') AND created_at < ?
      `).all(cutoffIso) as { task_id: string; outbox_id: string }[];

      for (const row of expiredPending) {
        this.markOutboxTerminal(row.outbox_id, "Outbox TTL expired");
      }

      const deleted = this.db.prepare(`
        DELETE FROM node_outbox
        WHERE status IN ('sent', 'dead') AND created_at < ?
      `).run(cutoffIso).changes;

      return { expiredDead: expiredPending.length, deleted };
    }).immediate();
  }

  private mapOutboxRecord(row: any): NodeOutboxRecord {
    return {
      outboxId: row.outbox_id,
      runId: row.run_id,
      taskId: row.task_id,
      jobId: row.job_id,
      leaseId: row.lease_id,
      idempotencyKey: row.idempotency_key,
      outcome: JSON.parse(row.outcome_json),
      createdAt: row.created_at,
      retryCount: row.retry_count,
      nextRetryAt: row.next_retry_at,
      status: row.status,
      lastError: row.last_error,
      receipt: row.receipt_json ? JSON.parse(row.receipt_json) : null,
    };
  }

  public close(): void {
    this.db.close(true);
  }
}
