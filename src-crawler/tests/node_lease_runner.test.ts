import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../src/worker/local_sqlite.ts";
import { handleNodeRequest } from "../src/worker/handler.ts";
import { CoordinatorClient } from "../src/node/client/coordinator_client.ts";
import { runLeasedJob } from "../src/node/runner/lease_runner.ts";
import { CrawlJobSchema, type ResultResponse } from "../src/shared/protocol/node_protocol.ts";
import { seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";

const fixtureJob = CrawlJobSchema.parse({ jobId: "lease-runner-job", leaseId: crypto.randomUUID(),
  platform: "vpm", purpose: "metadata", url: "https://example.org/index.json", origin: "https://example.org",
  leaseExpiresAt: "2026-09-27T00:05:00.000Z", retainClasses: ["normalized_facts", "creator_prose"],
  etag: null, lastModified: null });

describe("standalone node lease runner", () => {
  test("a BOOTH browse lease travels through loopback claim, heartbeat, parse and submission", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    const token = store.createNodeCredential("browse-runner", ["booth"]);
    const url = "https://booth.pm/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0?page=1";
    seedApprovedFixtureJob(store, url, "booth", 0, "discovery");
    store.recordRobotsSnapshot("https://booth.pm", 404);
    const server = Bun.serve({ port: 0, fetch: request => handleNodeRequest(request, store) });
    try {
      const client = new CoordinatorClient(server.url.href, token, "browse-runner", ["booth"]);
      const claim = await client.claim();
      if (claim.status !== "leased") throw new Error("Expected BOOTH browse lease");
      expect(claim.job.purpose).toBe("discovery");
      const { outcome, result } = await runLeasedJob(claim.job, client,
        async () => new Response('<a href="/ja/items/12345">item</a>',
          { headers: { "content-type": "text/html" } }), 10);
      expect(outcome).toEqual({ kind: "discovery", leads: [
        { kind: "storefront_product", url: "https://booth.pm/ja/items/12345" }
      ] });
      expect(result.status).toBe("accepted");
      expect(result.sourceVersionCreated).toBe(false);
      expect(store.db.query("SELECT COUNT(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      expect(store.db.query("SELECT COUNT(*) AS n FROM source_leads").get()).toEqual({ n: 1 });
      expect(store.db.query("SELECT COUNT(*) AS n FROM crawl_jobs").get()).toEqual({ n: 1 });
    } finally { server.stop(); store.close(); }
  });

  test("omits unapproved creator prose before the serialized result submission", async () => {
    let submitted: unknown;
    const client = {
      heartbeat: async () => {},
      submit: async (request: unknown) => {
        submitted = request;
        return { schemaVersion: 1, status: "accepted", jobId: fixtureJob.jobId,
          duplicate: false, sourceVersionCreated: true } as ResultResponse;
      }
    };
    const job = { ...fixtureJob, retainClasses: ["normalized_facts" as const] };
    const run = await runLeasedJob(job, client, async () => new Response(JSON.stringify({
      name: "com.example.tool", version: "1.0.0", description: "Creator-authored copy"
    }), { headers: { "content-type": "application/json" } }), 10);
    expect(run.outcome.kind).toBe("changed");
    if (run.outcome.kind !== "changed") throw new Error("Expected parsed observation");
    expect(run.outcome.observation.summary).toBe("");
    expect((submitted as {outcome: {observation: {summary: string}}}).outcome.observation.summary).toBe("");
  });

  test("validates the lease again before submitting a completed fetch", async () => {
    let heartbeats = 0;
    let submissions = 0;
    const client = {
      heartbeat: async () => { heartbeats++; },
      submit: async () => {
        submissions++;
        return { schemaVersion: 1, status: "accepted", jobId: fixtureJob.jobId,
          duplicate: false, sourceVersionCreated: false } as ResultResponse;
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

  test("operator suppression aborts an active fetch over the loopback protocol without submitting", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("abort-node", ["vpm"]);
    const url = "https://example.org/index.json";
    seedApprovedFixtureJob(store, url, "vpm", 0);
    store.recordRobotsSnapshot("https://example.org", 404);
    const server = Bun.serve({ port: 0, fetch: (request) => handleNodeRequest(request, store) });
    const client = new CoordinatorClient(server.url.href, token, "abort-node", ["vpm"]);
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
    let aborted = false;
    try {
      const claim = await client.claim();
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected leased job");
      const fetcher = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("request aborted"));
          }, { once: true });
          resolveStarted();
        });
      const running = runLeasedJob(claim.job, client, fetcher, 10);
      await started;
      store.suppressUrl(url, "operator opt-out");
      await expect(running).rejects.toThrow("Coordinator 403");
      expect(aborted).toBe(true);
      expect((store.db.prepare("SELECT count(*) AS n FROM job_results").get() as { n: number }).n).toBe(0);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_versions").get() as { n: number }).n).toBe(0);
    } finally { server.stop(); store.close(); }
  });
});
