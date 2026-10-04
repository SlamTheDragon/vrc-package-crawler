import type { CrawlJob, ResultRequest, ResultResponse } from "vrc-packages-network/node";
import { fetchJobOutcome } from "../adapters/observation_adapter.ts";
import { logger } from "../utils/logging/logger.ts";

type Outcome = ResultRequest["outcome"];
type LeaseClient = {
  heartbeat: (state: "fetching", activeJobId: string, activeLeaseId: string) => Promise<unknown>;
  submit: (request: Omit<ResultRequest, "schemaVersion" | "nodeId">) => Promise<ResultResponse>;
};
type MetadataFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function minimizeOutcome(job: CrawlJob, outcome: Outcome): Outcome {
  if (job.retainClasses.includes("creator_prose")) return outcome;
  if (outcome.kind === "changed") return { ...outcome,
    observation: { ...outcome.observation, summary: "" } };
  if (outcome.kind === "batch" || outcome.kind === "partial_batch") return { ...outcome,
    observations: outcome.observations.map(observation => ({ ...observation, summary: "" })) };
  return outcome;
}

/** An active lease must remain observable throughout egress, not just at submission. */
export async function runLeasedJob(
  job: CrawlJob, client: LeaseClient, fetcher: MetadataFetcher, heartbeatIntervalMs = 5_000,
  stopSignal?: AbortSignal
): Promise<{ outcome: Outcome; result: ResultResponse }> {
  if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1) throw new Error("Invalid heartbeat interval");
  stopSignal?.throwIfAborted();
  await client.heartbeat("fetching", job.jobId, job.leaseId);
  stopSignal?.throwIfAborted();
  const authority = new AbortController();
  const signal = stopSignal ? AbortSignal.any([authority.signal, stopSignal]) : authority.signal;
  let authorityError: unknown;
  let pulsePromise: Promise<void> | null = null;
  const pulse = () => {
    if (pulsePromise || authorityError || signal.aborted) return;
    pulsePromise = client.heartbeat("fetching", job.jobId, job.leaseId)
      .then(() => {})
      .catch((error: unknown) => {
        logger.warn(`Heartbeat pulse lost for leased job ${job.jobId}`, error);
        authorityError = error;
        authority.abort();
      })
      .finally(() => { pulsePromise = null; });
  };
  const timer = setInterval(pulse, heartbeatIntervalMs);
  try {
    const outcome = minimizeOutcome(job, await fetchJobOutcome(job, fetcher, signal));
    clearInterval(timer);
    if (pulsePromise) await pulsePromise;
    if (authorityError) throw authorityError;
    signal.throwIfAborted();
    // A final lease check closes the race between the last periodic pulse and submission.
    await client.heartbeat("fetching", job.jobId, job.leaseId);
    signal.throwIfAborted();
    const result = await client.submit({ jobId: job.jobId, leaseId: job.leaseId,
      idempotencyKey: crypto.randomUUID(), outcome });
    return { outcome, result };
  } catch (error) {
    throw authorityError || (stopSignal?.aborted ? stopSignal.reason : error);
  } finally {
    clearInterval(timer);
    authority.abort();
    if (pulsePromise) await pulsePromise;
  }
}
