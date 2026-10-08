import { existsSync, unlinkSync } from "node:fs";
import { CoordinatorClient } from "../client/node_client.ts";
import { runLeasedJob } from "./lease_runner.ts";
import { fetchPublicMetadata } from "../client/public_metadata_fetch.ts";
import type { NodeRuntimeConfig } from "../config/runtime_config.ts";
import type { LocalNodeStore } from "../storage/local_sqlite.ts";
import type { HeartbeatRequest } from "vrc-packages-network/node";
import { logger } from "../utils/logging/logger.ts";

export interface CrawlerNodeDaemonOptions {
  runOnce?: boolean;
  fetchFn?: typeof fetchPublicMetadata;
  stopFilePath?: string;
  sleepFn?: (ms: number) => Promise<void>;
  heartbeatIntervalMs?: number;
  maxPendingOutboxQuota?: number;
  outboxTtlMs?: number;
}

/**
 * OOP encapsulation of crawler node lifecycle and job consumption loop.
 * Coordinates heartbeat maintenance, job claims, leased execution,
 * local execution recording in LocalNodeStore, and graceful shutdown.
 */
export class CrawlerNodeDaemon {
  private stopping: boolean = false;
  private readonly stopController = new AbortController();
  private lastHeartbeatAt: number = 0;
  private lastRetryAfterMs: number = 5_000;
  private runId: string;
  private isFlushingOutbox: boolean = false;

  constructor(
    private readonly config: NodeRuntimeConfig,
    private readonly nodeStore: LocalNodeStore,
    private readonly client: CoordinatorClient,
    private readonly options: CrawlerNodeDaemonOptions = {}
  ) {
    this.runId = this.nodeStore.startRun(this.config.nodeId);
  }

  public get currentRunId(): string {
    return this.runId;
  }

  public get isStopping(): boolean {
    return this.stopping;
  }

  public get lastHeartbeatTimestamp(): number {
    return this.lastHeartbeatAt;
  }

  public stop(status: "completed" | "failed" = "completed"): void {
    if (this.stopping) return;
    this.stopping = true;
    this.stopController.abort(new Error("Crawler node stopped"));
    logger.info(`Crawler node daemon stopping with status: ${status}`, { runId: this.runId });
    if (this.options.stopFilePath && existsSync(this.options.stopFilePath)) {
      try {
        unlinkSync(this.options.stopFilePath);
      } catch {}
    }
    try {
      this.nodeStore.finishRun(this.runId, status);
    } catch (err) {
      logger.error("Failed to finish run in nodeStore", err);
    }
  }

  public async heartbeat(state: HeartbeatRequest["state"] = "idle"): Promise<void> {
    if (this.stopping) return;
    try {
      await this.client.heartbeat(state);
      this.lastHeartbeatAt = Date.now();
    } catch (err) {
      logger.warn(`Heartbeat failure for state '${state}'`, err);
    }
  }

  public isTerminalOutboxError(error: unknown): boolean {
    if (error instanceof Error) {
      const match = error.message.match(/Coordinator (\d{3})/);
      if (match) {
        const status = parseInt(match[1], 10);
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          return true;
        }
      }
      const lower = error.message.toLowerCase();
      if (lower.includes("expired") || lower.includes("forbidden") || lower.includes("unauthorized")) {
        return true;
      }
    }
    return false;
  }

  public async flushOutbox(batchLimit: number = 50): Promise<number> {
    if (this.stopping || this.isFlushingOutbox) return 0;
    this.isFlushingOutbox = true;
    try {
      const entries = this.nodeStore.getPendingOutboxEntries(batchLimit);
      if (entries.length === 0) return 0;

      logger.info(`Flushing ${entries.length} pending outbox entries...`);
      let flushedCount = 0;

      for (const entry of entries) {
        if (this.stopping) break;
        try {
          const outcome = entry.outcome;
          const result = await this.client.submit({
            jobId: entry.jobId,
            leaseId: entry.leaseId,
            idempotencyKey: entry.idempotencyKey,
            outcome
          });
          this.nodeStore.markOutboxDelivered(entry.outboxId, result);
          flushedCount++;
          logger.info(`Outbox entry ${entry.outboxId} successfully delivered for job ${entry.jobId}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (this.isTerminalOutboxError(error)) {
            logger.warn(`Terminal rejection for outbox entry ${entry.outboxId}: ${errorMsg}`);
            this.nodeStore.markOutboxTerminal(entry.outboxId, errorMsg);
          } else {
            logger.warn(`Failed to deliver outbox entry ${entry.outboxId}, scheduling retry: ${errorMsg}`);
            const delayMs = Math.min(5_000 * Math.pow(2, entry.retryCount), 60_000);
            this.nodeStore.markOutboxFailed(entry.outboxId, errorMsg, delayMs);
          }
        }
      }

      return flushedCount;
    } finally {
      this.isFlushingOutbox = false;
    }
  }

  public async step(): Promise<"claimed" | "empty" | "stopped"> {
    if (this.stopping) {
      return "stopped";
    }
    if (this.options.stopFilePath && existsSync(this.options.stopFilePath)) {
      this.stop();
      return "stopped";
    }

    const heartbeatInterval = this.options.heartbeatIntervalMs ?? 30_000;
    if (Date.now() - this.lastHeartbeatAt >= heartbeatInterval) {
      await this.heartbeat();
    }

    if (this.stopping) return "stopped";

    // Flush pending outbox entries before claiming new leases
    await this.flushOutbox();
    if (this.stopping) return "stopped";

    const claim = await this.client.claim();
    if (this.stopping) return "stopped";
    if (claim.status === "empty") {
      this.lastRetryAfterMs = claim.retryAfterMs;
      logger.debug("No jobs available to claim", { retryAfterMs: this.lastRetryAfterMs });
      return "empty";
    }

    const { job } = claim;

    // Fail closed: enforce lease unexpired preflight check
    const nowMs = Date.now();
    if (new Date(job.leaseExpiresAt).getTime() <= nowMs) {
      const errorMsg = `Lease ${job.leaseId} for job ${job.jobId} expired before execution (expired at ${job.leaseExpiresAt})`;
      logger.warn(errorMsg);
      const taskId = this.nodeStore.recordClaimedJob(this.runId, job);
      this.nodeStore.recordTaskFailure(taskId, errorMsg, { durationMs: 0 });
      return "empty";
    }

    logger.info(`Fetching ${job.platform} ${job.url}`, { jobId: job.jobId });
    const taskId = this.nodeStore.recordClaimedJob(this.runId, job);
    this.nodeStore.recordTaskProgress(taskId, "fetching");
    const startTime = performance.now();
    const fetchFn = this.options.fetchFn ?? fetchPublicMetadata;

    let stagedOutboxId: string | null = null;
    const idempotencyKey = crypto.randomUUID();

    try {
      const { outcome, result } = await runLeasedJob(
        job,
        this.client,
        fetchFn,
        this.options.heartbeatIntervalMs ?? 5_000,
        this.stopController.signal,
        {
          idempotencyKey,
          onOutcome: (outcome, idKey) => {
            stagedOutboxId = this.nodeStore.stageOutboxOutcome(
              taskId,
              outcome,
              idKey,
              this.options.maxPendingOutboxQuota ?? 1000
            );
          }
        }
      );
      const durationMs = Math.round(performance.now() - startTime);
      if (stagedOutboxId) {
        this.nodeStore.markOutboxDelivered(stagedOutboxId, result, { durationMs });
      } else {
        this.nodeStore.recordTaskSuccess(taskId, outcome.kind, result, { durationMs });
      }
      logger.info("Task completed successfully", {
        jobId: job.jobId,
        outcome: outcome.kind,
        accepted: result.status,
        sourceVersionCreated: result.sourceVersionCreated,
        durationMs
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.nodeStore.recordTaskFailure(taskId, errorMsg, { durationMs });
      if (stagedOutboxId) {
        if (this.isTerminalOutboxError(error)) {
          this.nodeStore.markOutboxTerminal(stagedOutboxId, errorMsg);
        } else {
          this.nodeStore.markOutboxFailed(stagedOutboxId, errorMsg);
        }
      }
      logger.error(`Task execution failed for job ${job.jobId} (${durationMs}ms)`, error);
      throw error;
    }

    await this.heartbeat();
    return "claimed";
  }

  public async start(): Promise<void> {
    const runOnce = this.options.runOnce ?? false;
    const sleepFn = this.options.sleepFn ?? Bun.sleep;
    logger.info("Crawler node daemon started", { runId: this.runId, runOnce });
    const stopFilePath = this.options.stopFilePath;
    const stopFilePoll = stopFilePath ? setInterval(() => {
      if (existsSync(stopFilePath)) this.stop();
    }, 100) : undefined;

    try {
      this.nodeStore.pruneOutbox(this.options.outboxTtlMs ?? 86_400_000);
      await this.heartbeat();
      await this.flushOutbox();
      while (!this.stopping) {
        try {
          const outcome = await this.step();
          if (outcome === "stopped") {
            break;
          }
          if (runOnce) {
            break;
          }
          if (outcome === "empty") {
            const sleepTarget = Date.now() + (this.lastRetryAfterMs || 5_000);
            while (!this.stopping && Date.now() < sleepTarget) {
              await sleepFn(Math.min(100, Math.max(0, sleepTarget - Date.now())));
            }
          }
        } catch (stepErr) {
          if (this.stopping) break;
          if (runOnce) throw stepErr;
          logger.warn("Coordinator communication failure, backing off 5s before reconnecting...", stepErr);
          await sleepFn(5_000);
        }
      }
    } catch (err) {
      logger.error("Unexpected error in daemon loop", err);
      this.stop("failed");
      throw err;
    } finally {
      if (stopFilePoll !== undefined) clearInterval(stopFilePoll);
      this.stop();
    }
  }
}
