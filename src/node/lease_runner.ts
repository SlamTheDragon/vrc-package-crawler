import type { CrawlJob, ResultRequest, ResultResponse } from "../shared/node_protocol.ts";
import { fetchJobOutcome } from "./observation_adapter.ts";

type Outcome = ResultRequest["outcome"];
type LeaseClient = {
  heartbeat: (state: "fetching", activeJobId: string, activeLeaseId: string) => Promise<unknown>;
  submit: (request: Omit<ResultRequest, "schemaVersion" | "nodeId">) => Promise<ResultResponse>;
};
type MetadataFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** An active lease must remain observable throughout egress, not just at submission. */
export async function runLeasedJob(
  job: CrawlJob, client: LeaseClient, fetcher: MetadataFetcher, heartbeatIntervalMs = 5_000
): Promise<{ outcome: Outcome; result: ResultResponse }> {
  if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1) throw new Error("Invalid heartbeat interval");
  await client.heartbeat("fetching", job.jobId, job.leaseId);
  const authority = new AbortController();
  let authorityError: unknown;
  let pulsePromise: Promise<void> | null = null;
  const pulse = () => {
    if (pulsePromise || authorityError) return;
    pulsePromise = client.heartbeat("fetching", job.jobId, job.leaseId)
      .then(() => {})
      .catch((error: unknown) => { authorityError = error; authority.abort(); })
      .finally(() => { pulsePromise = null; });
  };
  const timer = setInterval(pulse, heartbeatIntervalMs);
  try {
    const outcome = await fetchJobOutcome(job, fetcher, authority.signal);
    clearInterval(timer);
    if (pulsePromise) await pulsePromise;
    if (authorityError) throw authorityError;
    // A final lease check closes the race between the last periodic pulse and submission.
    await client.heartbeat("fetching", job.jobId, job.leaseId);
    const result = await client.submit({ jobId: job.jobId, leaseId: job.leaseId,
      idempotencyKey: crypto.randomUUID(), outcome });
    return { outcome, result };
  } catch (error) {
    throw authorityError || error;
  } finally {
    clearInterval(timer);
    authority.abort();
    if (pulsePromise) await pulsePromise;
  }
}
