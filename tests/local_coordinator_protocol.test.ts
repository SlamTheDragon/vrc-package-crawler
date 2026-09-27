import { afterEach, describe, expect, test } from "bun:test";
import { handleNodeRequest } from "../src/worker/handler.ts";
import { LocalCoordinatorStore } from "../src/worker/local_sqlite.ts";
import { ClaimResponseSchema, NODE_API_JSON_SCHEMAS, PROTOCOL_VERSION, ResultResponseSchema } from "../src/shared/node_protocol.ts";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => { server?.stop(true); server = undefined; });

function request(path: string, body: unknown, token: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

describe("local coordinator protocol", () => {
  test("operator seeding rejects obvious private and credential-bearing targets", () => {
    const store = new LocalCoordinatorStore();
    try {
      for (const url of ["https://127.0.0.1/data", "https://[::1]/data", "https://localhost/data",
        "https://user:pass@example.org/data", "https://example.org:8443/data", "https://example.org/data#fragment",
        "https://example.org./data"]) {
        expect(() => store.seedJob(url, "vpm")).toThrow();
      }
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(0);
    } finally { store.close(); }
  });

  test("GitHub seeding permits only the public repository API and applies unauthenticated pacing", () => {
    const store = new LocalCoordinatorStore();
    try {
      for (const url of ["https://github.com/vrc-get/vrc-get", "https://api.github.com/search/repositories?q=vrc",
        "https://api.github.com/repos/vrc-get/vrc-get/readme", "https://api.github.com/repos/vrc-get/vrc-get?x=1"]) {
        expect(() => store.seedJob(url, "github")).toThrow();
      }
      expect(() => store.seedJob("https://api.github.com/repos/vrc-get/vrc-get", "curated")).toThrow();
      store.seedJob("https://api.github.com/repos/vrc-get/vrc-get", "github", 1000);
      expect((store.db.prepare("SELECT min_delay_ms FROM origin_leases WHERE origin=?")
        .get("https://api.github.com") as { min_delay_ms: number }).min_delay_ms).toBe(60_000);
    } finally { store.close(); }
  });

  test("upgrades an existing local source_versions table with a completeness marker", () => {
    const directory = mkdtempSync(join(tmpdir(), "vrc-coordinator-migrate-"));
    const databasePath = join(directory, "coordinator.db");
    const old = new Database(databasePath, { create: true });
    old.run(`CREATE TABLE source_versions (
      version_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, version_no INTEGER NOT NULL,
      digest TEXT NOT NULL, payload_json TEXT NOT NULL, observed_at TEXT NOT NULL)`);
    old.close(true);
    try {
      const store = new LocalCoordinatorStore(databasePath);
      try {
        const columns = store.db.prepare("PRAGMA table_info(source_versions)").all() as { name: string }[];
        expect(columns.some((column) => column.name === "complete")).toBe(true);
      } finally { store.db.close(true); }
    } finally { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  });

  test("exports the production runtime schemas as JSON Schema", () => {
    expect(NODE_API_JSON_SCHEMAS.claimRequest.type).toBe("object");
    expect(NODE_API_JSON_SCHEMAS.resultRequest.type).toBe("object");
    expect(NODE_API_JSON_SCHEMAS.heartbeatRequest.oneOf?.length).toBe(2);
  });

  test("heartbeat is schema-validated, scoped, and bound to a live claimed job", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("node-a", ["vpm"]);
    store.seedJob("https://example.org/index.json", "vpm", 0);
    const post = async (path: string, body: unknown, credential = token) => {
      const response = await handleNodeRequest(request(path, body, credential), store);
      return { status: response.status, body: await response.json() as any };
    };
    const idle = { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"], state: "idle" };
    try {
      expect((await post("/v1/node/heartbeat", idle)).body).toEqual({ schemaVersion: 1,
        status: "alive", serverTime: "2026-09-27T00:00:00.000Z" });
      expect((store.db.prepare("SELECT state,last_seen_at FROM node_heartbeats").get() as any))
        .toEqual({ state: "idle", last_seen_at: "2026-09-27T00:00:00.000Z" });
      expect((await post("/v1/node/heartbeat", { ...idle, activeJobId: "job" })).status).toBe(400);
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching" })).status).toBe(400);
      expect((await post("/v1/node/heartbeat", { ...idle, schemaVersion: 2 })).status).toBe(400);
      expect((await post("/v1/node/heartbeat", idle, "wrong-token")).status).toBe(401);
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching", activeJobId: "not-held" })).status).toBe(403);
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] });
      expect(claim.body.status).toBe("leased");
      now += 1000;
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching", activeJobId: claim.body.job.jobId })).status).toBe(200);
      expect((store.db.prepare("SELECT state,active_job_id,last_seen_at FROM node_heartbeats").get() as any))
        .toEqual({ state: "fetching", active_job_id: claim.body.job.jobId,
          last_seen_at: "2026-09-27T00:00:01.000Z" });
      store.revokeNode("node-a");
      expect((await post("/v1/node/heartbeat", idle)).status).toBe(401);
    } finally { store.close(); }
  });

  test("in-process and loopback HTTP enforce the same malformed and wrong-version boundary", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("node-a", ["vpm"]);
    const fetchHandler = (req: Request) => handleNodeRequest(req, store);
    server = Bun.serve({ port: 0, fetch: fetchHandler });
    try {
      const bodies: unknown[] = [
        { schemaVersion: 999, nodeId: "node-a", capabilities: ["vpm"] },
        { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"], extra: true },
        { schemaVersion: 1, nodeId: "node-a", capabilities: ["not-a-driver"] }
      ];
      for (const body of bodies) {
        const internal = await fetchHandler(request("/v1/node/jobs/claim", body, token));
        const external = await fetch(`http://localhost:${server.port}/v1/node/jobs/claim`, request("/v1/node/jobs/claim", body, token));
        expect(external.status).toBe(internal.status);
        expect(await external.json()).toEqual(await internal.json());
      }
      const invalidHeartbeat = { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"],
        state: "idle", activeJobId: "not-allowed" };
      const internalHeartbeat = await fetchHandler(request("/v1/node/heartbeat", invalidHeartbeat, token));
      const externalHeartbeat = await fetch(`http://localhost:${server.port}/v1/node/heartbeat`,
        request("/v1/node/heartbeat", invalidHeartbeat, token));
      expect(externalHeartbeat.status).toBe(internalHeartbeat.status);
      expect(await externalHeartbeat.json()).toEqual(await internalHeartbeat.json());
      const malformed = new Request("http://localhost/v1/node/jobs/claim", { method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: "{" });
      expect((await fetchHandler(malformed)).status).toBe(400);
      const oversized = new Request("http://localhost/v1/node/jobs/claim", { method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: " ".repeat(256 * 1024 + 1) });
      expect((await fetchHandler(oversized)).status).toBe(413);
    } finally { store.close(); }
  });

  test("scoped credentials, origin leases, change-only versions, idempotency, and revocation", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const aToken = store.createNodeCredential("node-a", ["vpm"]);
    const bToken = store.createNodeCredential("node-b", ["vpm"]);
    store.seedJob("https://example.com/one", "vpm", 1000);
    store.seedJob("https://example.com/two", "vpm", 1000);
    const claimBody = (nodeId: string) => ({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] });
    const post = async (path: string, body: unknown, token: string) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      expect((await post("/v1/node/jobs/claim", claimBody("node-a"), "bad-token")).status).toBe(401);
      expect((await post("/v1/node/jobs/claim", { ...claimBody("node-a"), capabilities: ["booth"] }, aToken)).status).toBe(403);
      const first = await post("/v1/node/jobs/claim", claimBody("node-a"), aToken);
      expect(first.status).toBe(200);
      const job = ClaimResponseSchema.parse(first.body);
      expect(job.status).toBe("leased");
      if (job.status !== "leased") throw new Error("Expected lease");
      expect((await post("/v1/node/jobs/claim", claimBody("node-b"), bToken)).body.status).toBe("empty");

      const result = {
        schemaVersion: PROTOCOL_VERSION, nodeId: "node-a", jobId: job.job.jobId,
        leaseId: job.job.leaseId, idempotencyKey: "test-result-key-001",
        outcome: { kind: "changed", observation: { sourceItemKey: "com.example.tool", title: "Tool",
          author: "Author", summary: "Useful", outboundLinks: [], originUpdatedAt: null } }
      };
      expect((await post("/v1/node/jobs/result", result, bToken)).status).toBe(401);
      const accepted = await post("/v1/node/jobs/result", result, aToken);
      expect(ResultResponseSchema.parse(accepted.body).sourceVersionCreated).toBe(true);
      const duplicate = await post("/v1/node/jobs/result", result, aToken);
      expect(duplicate.body.duplicate).toBe(true);
      expect((await post("/v1/node/jobs/result", { ...result, outcome: { kind: "gone" } }, aToken)).status).toBe(409);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(1);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_events").get() as any).n).toBe(1);

      now += 1000;
      const second = await post("/v1/node/jobs/claim", claimBody("node-b"), bToken);
      expect(second.body.status).toBe("leased");
      store.revokeNode("node-b");
      expect((await post("/v1/node/jobs/claim", claimBody("node-b"), bToken)).status).toBe(401);
    } finally { store.close(); }
  });

  test("a principal authenticated before credential rotation cannot later claim or submit", () => {
    const store = new LocalCoordinatorStore();
    const oldToken = store.createNodeCredential("node-a", ["vpm"]);
    const oldPrincipal = store.authenticate("node-a", oldToken)!;
    store.seedJob("https://example.org/package.json", "vpm", 0);
    const claimRequest = { schemaVersion: 1 as const, nodeId: "node-a", capabilities: ["vpm" as const] };
    try {
      const claim = store.claim(claimRequest, oldPrincipal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected lease");
      const newToken = store.createNodeCredential("node-a", ["vpm"]);
      expect(() => store.claim(claimRequest, oldPrincipal)).toThrow();
      const resultRequest = { schemaVersion: 1 as const, nodeId: "node-a", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: "credential-rotation-result-001",
        outcome: { kind: "unchanged" as const } };
      expect(() => store.submit(resultRequest, oldPrincipal)).toThrow();
      const newPrincipal = store.authenticate("node-a", newToken)!;
      expect(store.submit(resultRequest, newPrincipal).status).toBe("accepted");
      store.revokeNode("node-a");
      expect(() => store.claim(claimRequest, newPrincipal)).toThrow();
    } finally { store.close(); }
  });

  test("operator suppression invalidates an outstanding lease and prevents reseeding", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("node-a", ["booth"]);
    const url = "https://booth.pm/items/42";
    store.seedJob(url, "booth");
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["booth"] });
      expect(claim.body.status).toBe("leased");
      store.suppressUrl(url, "creator opt-out");
      const result = await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "node-a",
        jobId: claim.body.job.jobId, leaseId: claim.body.job.leaseId,
        idempotencyKey: "suppressed-result-001", outcome: { kind: "gone" } });
      expect(result.status).toBe(403);
      expect((await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["booth"] })).body.status).toBe("empty");
      expect(() => store.seedJob(url, "booth")).toThrow();
    } finally { store.close(); }
  });

  test("a later identical observation creates a check event but no duplicate version", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("node-a", ["vpm"]);
    store.seedJob("https://example.org/package.json", "vpm", 1);
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return await response.json() as any;
    };
    const observation = { sourceItemKey: "com.example.tool", title: "Tool", author: "Creator",
      summary: "Summary", outboundLinks: [], originUpdatedAt: null };
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] });
        expect(claim.status).toBe("leased");
        const result = await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "node-a",
          jobId: claim.job.jobId, leaseId: claim.job.leaseId, idempotencyKey: `same-content-attempt-${attempt}`,
          outcome: { kind: "changed", observation } });
        expect(result.sourceVersionCreated).toBe(attempt === 0);
        now += 24 * 60 * 60 * 1000 + 1000;
      }
      expect((store.db.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(1);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_events").get() as any).n).toBe(2);
      expect((store.db.prepare("SELECT kind FROM source_events ORDER BY event_id DESC LIMIT 1").get() as any).kind).toBe("unchanged");
    } finally { store.close(); }
  });

  test("an expired lease cannot submit, and rate-limit backoff is shared by origin", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const aToken = store.createNodeCredential("node-a", ["vpm"]);
    const bToken = store.createNodeCredential("node-b", ["vpm"]);
    store.seedJob("https://example.org/a", "vpm", 1000);
    store.seedJob("https://example.org/b", "vpm", 1000);
    const post = async (path: string, body: unknown, token: string) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const a = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, aToken);
      now += 5 * 60 * 1000 + 1;
      const expired = await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "node-a",
        jobId: a.body.job.jobId, leaseId: a.body.job.leaseId, idempotencyKey: "expired-lease-key-001",
        outcome: { kind: "unchanged" } }, aToken);
      expect(expired.status).toBe(403);
      const b = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-b", capabilities: ["vpm"] }, bToken);
      expect(b.body.status).toBe("leased");
      const rateLimit = await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "node-b",
        jobId: b.body.job.jobId, leaseId: b.body.job.leaseId, idempotencyKey: "rate-limited-key-001",
        outcome: { kind: "rate_limited", retryAfterSeconds: 60 } }, bToken);
      expect(rateLimit.status).toBe(200);
      expect((await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, aToken)).body.status).toBe("empty");
      now += 60_001;
      expect((await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, aToken)).body.status).toBe("leased");
    } finally { store.close(); }
  });

  test("one busy origin cannot starve another behind 100 ready jobs", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("node-a", ["vpm"]);
    for (let i = 0; i < 101; i++) store.seedJob(`https://busy.example.org/${i}`, "vpm", 1000);
    store.seedJob("https://free.example.org/item", "vpm", 1000);
    const claim = async () => {
      const response = await handleNodeRequest(request("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] }, token), store);
      return await response.json() as any;
    };
    try {
      expect((await claim()).job.origin).toBe("https://busy.example.org");
      expect((await claim()).job.origin).toBe("https://free.example.org");
    } finally { store.close(); }
  });

  test("one repository result persists each embedded VPM package atomically", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("vpm-node", ["vpm"]);
    store.seedJob("https://example.org/index.json", "vpm");
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    const observation = (sourceItemKey: string) => ({ sourceItemKey, title: sourceItemKey,
      author: "Creator", summary: "", outboundLinks: [], originUpdatedAt: null,
      releases: [{ version: "1.2.3", dependencyRanges: {} }] });
    try {
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
      const result = { schemaVersion: 1, nodeId: "vpm-node", jobId: claim.body.job.jobId,
        leaseId: claim.body.job.leaseId, idempotencyKey: "repo-batch-result-001",
        outcome: { kind: "batch", observations: [observation("com.example.one"), observation("com.example.two")] } };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_items").get() as any).n).toBe(2);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(2);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_events").get() as any).n).toBe(2);
      expect((await post("/v1/node/jobs/result", result)).body.duplicate).toBe(true);
    } finally { store.close(); }
  });

  test("partial repository evidence records diagnostics without inventing missing versions", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("vpm-node", ["vpm"]);
    store.seedJob("https://example.org/index.json", "vpm", 0);
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
      const result = { schemaVersion: 1, nodeId: "vpm-node", jobId: claim.body.job.jobId,
        leaseId: claim.body.job.leaseId, idempotencyKey: "partial-listing-result-001",
        outcome: { kind: "partial_batch", observations: [{ sourceItemKey: "com.example.good", title: "Good",
          author: "Creator", summary: "", outboundLinks: [], originUpdatedAt: null,
          releases: [{ version: "1.0.0", dependencyRanges: {} }] }],
          issues: [{ sourceItemKey: "com.example.good", version: "2.0.0", code: "invalid_manifest" }] } };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(1);
      expect((store.db.prepare("SELECT complete FROM source_versions").get() as any).complete).toBe(0);
      expect(store.listCompleteVpmEvidence()).toEqual([]);
      expect((store.db.prepare("SELECT source_item_key,version_key,code FROM source_issues").get() as any))
        .toEqual({ source_item_key: "com.example.good", version_key: "2.0.0", code: "invalid_manifest" });
      expect((store.db.prepare("SELECT count(*) AS n FROM source_events WHERE kind='incomplete_listing'").get() as any).n).toBe(1);
      expect((await post("/v1/node/jobs/result", result)).body.duplicate).toBe(true);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_issues").get() as any).n).toBe(1);
      now += 24 * 60 * 60 * 1000;
      const retry = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
      expect(retry.body.status).toBe("leased");
      const complete = { ...result, leaseId: retry.body.job.leaseId, idempotencyKey: "complete-listing-result-001",
        outcome: { kind: "batch", observations: result.outcome.observations } };
      expect((await post("/v1/node/jobs/result", complete)).status).toBe(200);
      expect((store.db.prepare("SELECT version_no,complete FROM source_versions ORDER BY version_no").all() as any[]))
        .toEqual([{ version_no: 1, complete: 0 }, { version_no: 2, complete: 1 }]);
      expect(store.listCompleteVpmEvidence().map((item) => [item.sourceUrl, item.sourceVersionNo,
        item.observation.releases?.map((release) => release.version)]))
        .toEqual([["https://example.org/index.json", 2, ["1.0.0"]]]);
    } finally { store.close(); }
  });

  test("an incomplete later fetch cannot replace the last complete VPM read model", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("vpm-node", ["vpm"]);
    const url = "https://example.org/index.json";
    store.seedJob(url, "vpm", 0);
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    const claim = () => post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
    const observation = (version: string) => ({ sourceItemKey: "com.example.tool", title: "Tool", author: "Creator",
      summary: "", outboundLinks: [], originUpdatedAt: null, releases: [{ version, dependencyRanges: {} }] });
    try {
      const first = await claim();
      expect((await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "vpm-node",
        jobId: first.body.job.jobId, leaseId: first.body.job.leaseId, idempotencyKey: "complete-older-result-001",
        outcome: { kind: "batch", observations: [observation("1.0.0")] } })).status).toBe(200);
      now += 24 * 60 * 60 * 1000;
      const second = await claim();
      expect((await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "vpm-node",
        jobId: second.body.job.jobId, leaseId: second.body.job.leaseId, idempotencyKey: "partial-newer-result-001",
        outcome: { kind: "partial_batch", observations: [observation("1.1.0")],
          issues: [{ sourceItemKey: "com.example.tool", version: "1.2.0", code: "invalid_manifest" }] } })).status).toBe(200);
      expect((store.db.prepare("SELECT version_no,complete FROM source_versions ORDER BY version_no").all() as any[]))
        .toEqual([{ version_no: 1, complete: 1 }, { version_no: 2, complete: 0 }]);
      expect(store.listCompleteVpmEvidence()[0].observation.releases?.map((release) => release.version)).toEqual(["1.0.0"]);
      store.suppressUrl(url, "operator stop");
      expect(store.listCompleteVpmEvidence()).toEqual([]);
    } finally { store.close(); }
  });

  test("the same package ID in two listings retains separate source evidence", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("vpm-node", ["vpm"]);
    store.seedJob("https://first.example.org/index.json", "vpm", 0);
    store.seedJob("https://second.example.org/index.json", "vpm", 0);
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      for (const version of ["1.0.0", "2.0.0"]) {
        const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
        expect(claim.body.status).toBe("leased");
        const result = { schemaVersion: 1, nodeId: "vpm-node", jobId: claim.body.job.jobId,
          leaseId: claim.body.job.leaseId, idempotencyKey: `listing-result-${version}`,
          outcome: { kind: "changed", observation: { sourceItemKey: "com.example.shared",
            title: "Shared", author: "Creator", summary: "", outboundLinks: [], originUpdatedAt: null,
            release: { version, dependencyRanges: {} } } } };
        expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      }
      const rows = store.db.prepare("SELECT source_key,source_url FROM source_items ORDER BY source_url").all() as any[];
      expect(rows).toHaveLength(2);
      expect(rows[0].source_key).not.toBe(rows[1].source_key);
      expect(rows.map((row) => row.source_url)).toEqual([
        "https://first.example.org/index.json", "https://second.example.org/index.json"]);
    } finally { store.close(); }
  });

  test("recipe leads cross the result schema and await review without becoming crawl jobs", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("vpm-node", ["vpm"]);
    store.seedJob("https://example.org/source.json", "vpm", 0);
    const post = async (path: string, body: unknown) => {
      const response = await handleNodeRequest(request(path, body, token), store);
      return { status: response.status, body: await response.json() as any };
    };
    try {
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] });
      const result = { schemaVersion: 1, nodeId: "vpm-node", jobId: claim.body.job.jobId,
        leaseId: claim.body.job.leaseId, idempotencyKey: "template-recipe-leads-001",
        outcome: { kind: "discovery", leads: [
          { kind: "vpm_listing", url: "https://example.org/index.json" },
          { kind: "github_repository", url: "https://github.com/example/tool" },
          { kind: "release_zip", url: "https://example.org/tool.zip", claimedPackageId: "com.example.tool" }
        ] } };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      expect((await post("/v1/node/jobs/result", result)).body.duplicate).toBe(true);
      const leads = store.db.prepare("SELECT kind,target_url,status FROM source_leads ORDER BY kind").all() as any[];
      expect(leads).toEqual([
        { kind: "github_repository", target_url: "https://github.com/example/tool", status: "pending_review" },
        { kind: "release_zip", target_url: "https://example.org/tool.zip", status: "pending_review" },
        { kind: "vpm_listing", target_url: "https://example.org/index.json", status: "pending_review" }
      ]);
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(1);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_items").get() as any).n).toBe(0);
      expect((store.db.prepare("SELECT kind FROM source_events").get() as any).kind).toBe("discovery");
      const listingLead = store.db.prepare("SELECT lead_key FROM source_leads WHERE kind='vpm_listing'").get() as { lead_key: string };
      const zipLead = store.db.prepare("SELECT lead_key FROM source_leads WHERE kind='release_zip'").get() as { lead_key: string };
      expect(() => store.approveVpmListingLead(zipLead.lead_key)).toThrow();
      const listingJobId = store.approveVpmListingLead(listingLead.lead_key);
      expect(typeof listingJobId).toBe("string");
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(2);
      expect((store.db.prepare("SELECT status FROM source_leads WHERE lead_key=?").get(listingLead.lead_key) as any).status).toBe("approved");
    } finally { store.close(); }
  });
});
