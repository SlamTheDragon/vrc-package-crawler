import { existsSync, unlinkSync } from "node:fs";
import { CoordinatorClient } from "../client/node_client.ts";
import { runLeasedJob } from "./lease_runner.ts";
import { fetchPublicMetadata } from "../client/public_metadata_fetch.ts";
import type { NodeRuntimeConfig } from "../config/runtime_config.ts";
import type { LocalNodeStore } from "../storage/local_sqlite.ts";
import type { HeartbeatRequest } from "../shared/protocol/node_protocol.ts";
import { logger } from "../utils/logging/logger.ts";

export interface CrawlerNodeDaemonOptions {
  runOnce?: boolean;
  fetchFn?: typeof fetchPublicMetadata;
  stopFilePath?: string;
  sleepFn?: (ms: number) => Promise<void>;
  heartbeatIntervalMs?: number;
}

/**
 * OOP encapsulation of crawler node lifecycle and job consumption loop.
 * Coordinates heartbeat maintenance, job claims, leased execution,
 * local execution recording in LocalNodeStore, and graceful shutdown.
 */
export class CrawlerNodeDaemon {
  private stopping: boolean = false;
  private lastHeartbeatAt: number = 0;
  private lastRetryAfterMs: number = 5_000;
  private runId: string;

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
    try {
      await this.client.heartbeat(state);
      this.lastHeartbeatAt = Date.now();
    } catch (err) {
      logger.warn(`Heartbeat failure for state '${state}'`, err);
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

    const claim = await this.client.claim();
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

    try {
      const { outcome, result } = await runLeasedJob(job, this.client, fetchFn);
      const durationMs = Math.round(performance.now() - startTime);
      this.nodeStore.recordTaskSuccess(taskId, outcome.kind, result, { durationMs });
      logger.info("Task completed successfully", {
        jobId: job.jobId,
        outcome: outcome.kind,
        accepted: result.status,
        sourceVersionCreated: result.sourceVersionCreated,
        durationMs
      });
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      this.nodeStore.recordTaskFailure(taskId, error instanceof Error ? error.message : String(error), { durationMs });
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

    await this.heartbeat();

    try {
      while (!this.stopping) {
        if (this.options.stopFilePath && existsSync(this.options.stopFilePath)) {
          this.stop();
          break;
        }

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
              if (this.options.stopFilePath && existsSync(this.options.stopFilePath)) {
                this.stop();
                break;
              }
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
      throw err;
    } finally {
      this.stop();
    }
  }
}
