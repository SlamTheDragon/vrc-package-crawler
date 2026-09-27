import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../src/worker/local_sqlite.ts";
import { handleNodeRequest } from "../src/worker/handler.ts";
import { CoordinatorClient } from "../src/node/coordinator_client.ts";
import { runLeasedJob } from "../src/node/lease_runner.ts";
import { CrawlJobSchema, type ResultResponse } from "../src/shared/node_protocol.ts";

const fixtureJob = CrawlJobSchema.parse({ jobId: "lease-runner-job", leaseId: crypto.randomUUID(),
  platform: "vpm", url: "https://example.org/index.json", origin: "https://example.org",
  leaseExpiresAt: "2026-09-27T00:05:00.000Z", etag: null, lastModified: null });

describe("standalone node lease runner", () => {
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
    store.seedJob(url, "vpm", 0);
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
