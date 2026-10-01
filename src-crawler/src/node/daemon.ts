import { existsSync, unlinkSync } from "node:fs";
import { CoordinatorClient } from "./coordinator_client.ts";
import { runLeasedJob } from "./lease_runner.ts";
import { fetchPublicMetadata } from "./public_metadata_fetch.ts";
import type { NodeRuntimeConfig } from "./runtime_config.ts";
import type { LocalNodeStore } from "./local_sqlite.ts";
import type { HeartbeatRequest } from "../shared/node_protocol.ts";
import { logger } from "../utils/logger.ts";

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
    if (this.options.stopFilePath && existsSync(this.options.stopFilePath)) {
      try {
        unlinkSync(this.options.stopFilePath);
      } catch {}
    }
    this.nodeStore.finishRun(this.runId, status);
  }

  public async heartbeat(state: HeartbeatRequest["state"] = "idle"): Promise<void> {
    await this.client.heartbeat(state);
    this.lastHeartbeatAt = Date.now();
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
      return "empty";
    }

    const { job } = claim;
    console.log(`Fetching ${job.platform} ${job.url}`);
    const taskId = this.nodeStore.recordClaimedJob(this.runId, job);
    this.nodeStore.recordTaskProgress(taskId, "fetching");
    const startTime = performance.now();
    const fetchFn = this.options.fetchFn ?? fetchPublicMetadata;

    try {
      const { outcome, result } = await runLeasedJob(job, this.client, fetchFn);
      const durationMs = Math.round(performance.now() - startTime);
      this.nodeStore.recordTaskSuccess(taskId, outcome.kind, result, { durationMs });
      console.log(JSON.stringify({
        jobId: job.jobId,
        outcome: outcome.kind,
        accepted: result.status,
        sourceVersionCreated: result.sourceVersionCreated,
      }));
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      this.nodeStore.recordTaskFailure(taskId, error instanceof Error ? error.message : String(error), { durationMs });
      throw error;
    }

    await this.heartbeat();
    return "claimed";
  }

  public async start(): Promise<void> {
    await this.heartbeat();
    const runOnce = this.options.runOnce ?? false;
    const sleepFn = this.options.sleepFn ?? Bun.sleep;

    try {
      while (!this.stopping) {
        if (this.options.stopFilePath && existsSync(this.options.stopFilePath)) {
          this.stop();
          break;
        }

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
      }
    } finally {
      this.stop();
    }
  }
}
