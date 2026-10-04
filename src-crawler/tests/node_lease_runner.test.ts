import { describe, expect, test } from "bun:test";
import { runLeasedJob } from "../src/runner/lease_runner.ts";
import { CoordinatorClient } from "../src/client/node_client.ts";
import { HeartbeatRequestSchema, HeartbeatResponseSchema } from "vrc-packages-network/node";
import { CrawlJobSchema, ResultRequestSchema, type ResultRequest, type ResultResponse } from "vrc-packages-network/node";

const fixtureJob = CrawlJobSchema.parse({ jobId: "lease-runner-job", leaseId: crypto.randomUUID(),
  platform: "vpm", purpose: "metadata", url: "https://example.org/index.json", origin: "https://example.org",
  leaseExpiresAt: "2099-01-01T00:05:00.000Z", retainClasses: ["normalized_facts", "creator_prose"],
  etag: null, lastModified: null });

describe("node lease runner", () => {
  test("HTTP authority refusal aborts an active fetch without submission", async () => {
    const originalFetch = globalThis.fetch;
    let heartbeats = 0;
    let submissions = 0;
    let aborted = false;
    globalThis.fetch = (async (input, init) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init);
      if (new URL(request.url).pathname !== "/v1/node/heartbeat") {
        submissions++;
        throw new Error("Refused lease attempted submission");
      }
      expect(HeartbeatRequestSchema.parse(await request.json())).toMatchObject({ state: "fetching",
        activeJobId: fixtureJob.jobId, activeLeaseId: fixtureJob.leaseId });
      return ++heartbeats === 1 ? Response.json(HeartbeatResponseSchema.parse({ schemaVersion: 1,
        status: "alive", serverTime: new Date().toISOString() })) :
        Response.json({ schemaVersion: 1, code: "forbidden", error: "Lease suppressed" }, { status: 403 });
    }) as typeof fetch;
    const client = new CoordinatorClient("https://coordinator.invalid", "fixture-only-not-a-live-credential",
      "abort-node", ["vpm"], { maxRetries: 0 });
    try {
      await expect(runLeasedJob(fixtureJob, client, async (_input, init) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("request aborted"));
        }, { once: true })), 10)).rejects.toThrow("Coordinator 403");
      expect(aborted).toBe(true);
      expect(submissions).toBe(0);
    } finally { globalThis.fetch = originalFetch; }
  });

  test("a BOOTH browse lease submits discovery leads through the wire contract", async () => {
    const job = CrawlJobSchema.parse({ ...fixtureJob, platform: "booth", purpose: "discovery",
      url: "https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0?page=1",
      origin: "https://booth.pm", retainClasses: ["normalized_facts"] });
    const submitted: ResultRequest[] = [];
    let heartbeats = 0;
    const client = {
      heartbeat: async () => { heartbeats++; },
      submit: async (payload: Omit<ResultRequest, "schemaVersion" | "nodeId">): Promise<ResultResponse> => {
        submitted.push(ResultRequestSchema.parse(JSON.parse(JSON.stringify({ ...payload,
          schemaVersion: 1, nodeId: "browse-runner" }))));
        return { schemaVersion: 1, status: "accepted", jobId: job.jobId,
          duplicate: false, sourceVersionCreated: false };
      }
    };
    const { outcome, result } = await runLeasedJob(job, client,
      async () => new Response('<a href="/ja/items/12345">item</a>',
        { headers: { "content-type": "text/html" } }), 10);
    expect(outcome).toEqual({ kind: "discovery", leads: [
      { kind: "storefront_product", url: "https://booth.pm/ja/items/12345" }
    ] });
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.outcome).toEqual(outcome);
    expect(result).toMatchObject({ status: "accepted", sourceVersionCreated: false });
    expect(heartbeats).toBe(2);
  });

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
