import { describe, expect, test } from "bun:test";
import { runLeasedJob } from "../src/runner/lease_runner.ts";
import { CrawlJobSchema, ResultRequestSchema, type ResultRequest, type ResultResponse } from "../src/shared/protocol/node_protocol.ts";

const fixtureJob = CrawlJobSchema.parse({ jobId: "lease-runner-job", leaseId: crypto.randomUUID(),
  platform: "vpm", purpose: "metadata", url: "https://example.org/index.json", origin: "https://example.org",
  leaseExpiresAt: "2099-01-01T00:05:00.000Z", retainClasses: ["normalized_facts", "creator_prose"],
  etag: null, lastModified: null });

describe("node lease runner", () => {
  test("omits unapproved creator prose before the serialized result submission", async () => {
    const submitted: ResultRequest[] = [];
    const client = {
      heartbeat: async () => {},
      submit: async (request: Omit<ResultRequest, "schemaVersion" | "nodeId">): Promise<ResultResponse> => {
        submitted.push(ResultRequestSchema.parse({ ...request, schemaVersion: 1, nodeId: "runner-fixture" }));
        return { schemaVersion: 1, status: "accepted", jobId: fixtureJob.jobId,
          duplicate: false, sourceVersionCreated: true };
      }
    };
    const job = { ...fixtureJob, retainClasses: ["normalized_facts" as const] };
    const run = await runLeasedJob(job, client, async () => new Response(JSON.stringify({
      name: "com.example.tool", version: "1.0.0", description: "Creator-authored copy"
    }), { headers: { "content-type": "application/json" } }), 10);
    expect(run.outcome.kind).toBe("changed");
    if (run.outcome.kind !== "changed") throw new Error("Expected parsed observation");
    expect(run.outcome.observation.summary).toBe("");
    expect(submitted).toHaveLength(1);
    const payload = submitted[0];
    if (payload?.outcome.kind !== "changed") throw new Error("Expected submitted observation");
    expect(payload.outcome.observation.summary).toBe("");
  });

  test("validates the lease again before submitting a completed fetch", async () => {
    let heartbeats = 0;
    let submissions = 0;
    const client = {
      heartbeat: async () => { heartbeats++; },
      submit: async (): Promise<ResultResponse> => {
        submissions++;
        return { schemaVersion: 1, status: "accepted", jobId: fixtureJob.jobId,
          duplicate: false, sourceVersionCreated: false };
      }
    };
    const { outcome } = await runLeasedJob(fixtureJob, client,
      async () => new Response(null, { status: 304 }), 10);
    expect(outcome.kind).toBe("unchanged");
    expect(heartbeats).toBe(2);
    expect(submissions).toBe(1);
  });

  test("lost coordinator heartbeat aborts a pending request and skips submission", async () => {
    let heartbeats = 0;
    let submissions = 0;
    let aborted = false;
    const client = {
      heartbeat: async () => {
        heartbeats++;
        if (heartbeats > 1) throw new Error("coordinator offline");
      },
      submit: async () => {
        submissions++;
        throw new Error("submission must not happen");
      }
    };
    const fetcher = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("request aborted"));
      }, { once: true }));
    await expect(runLeasedJob(fixtureJob, client, fetcher, 10)).rejects.toThrow("coordinator offline");
    expect(aborted).toBe(true);
    expect(submissions).toBe(0);
  });
});
