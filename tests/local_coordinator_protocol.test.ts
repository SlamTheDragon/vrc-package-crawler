import { afterEach, describe, expect, test } from "bun:test";
import { handleNodeRequest } from "../src/worker/handler.ts";
import { LocalCoordinatorStore } from "../src/worker/local_sqlite.ts";
import { ClaimResponseSchema, NODE_API_JSON_SCHEMAS, PROTOCOL_VERSION, ResultResponseSchema } from "../src/shared/node_protocol.ts";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";

function allowFixtureOrigin(store: LocalCoordinatorStore, ...origins: string[]): void {
  for (const origin of origins) store.recordRobotsSnapshot(origin, 404);
}

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
  test("queued robots batch ignores origins without a currently due job", () => {
    const store = new LocalCoordinatorStore();
    try {
      store.seedJob("https://dormant.example.org/item", "vpm", 0);
      store.db.prepare("UPDATE crawl_jobs SET next_fetch_at=? WHERE origin=?")
        .run(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), "https://dormant.example.org");
      expect(store.claimDueRobotsRefresh()).toBeNull();
    } finally { store.close(); }
  });

  test("two coordinator processes lease queued robots refreshes and reject stale completions", () => {
    const directory = mkdtempSync(join(tmpdir(), "vrc-robots-refresh-"));
    const databasePath = join(directory, "coordinator.db");
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const firstStore = new LocalCoordinatorStore(databasePath, () => now);
    const secondStore = new LocalCoordinatorStore(databasePath, () => now);
    try {
      firstStore.seedJob("https://queued.example.org/item", "vpm", 0);
      firstStore.seedJob("https://blocked.example.org/item", "vpm", 0);
      firstStore.suppressUrl("https://blocked.example.org/item", "fixture suppression");
      const first = firstStore.claimDueRobotsRefresh();
      expect(first?.origin).toBe("https://queued.example.org");
      expect(secondStore.claimDueRobotsRefresh()).toBeNull();
      expect(secondStore.reserveRobotsRefresh("https://queued.example.org")).toBeNull();
      if (!first) throw new Error("Expected first refresh lease");
      now += 45_001;
      const replacement = secondStore.claimDueRobotsRefresh();
      expect(replacement?.origin).toBe(first.origin);
      expect(replacement?.leaseId).not.toBe(first.leaseId);
      if (!replacement) throw new Error("Expected replacement refresh lease");
      expect(firstStore.completeRobotsRefresh(first.origin, first.leaseId, 200, "User-agent: *\nAllow: /")).toBe(false);
      expect(firstStore.releaseRobotsRefresh(first.origin, first.leaseId)).toBe(false);
      expect(secondStore.completeRobotsRefresh(replacement.origin, replacement.leaseId, 404)).toBe(true);
      expect(firstStore.claimDueRobotsRefresh()).toBeNull();
      const token = firstStore.createNodeCredential("queued-node", ["vpm"]);
      const principal = firstStore.authenticate("queued-node", token)!;
      expect(firstStore.claim({ schemaVersion: 1, nodeId: "queued-node", capabilities: ["vpm"] }, principal).status)
        .toBe("leased");
      expect(secondStore.reserveRobotsRefresh("https://queued.example.org")).toBeNull();
      now += 24 * 60 * 60 * 1000 + 1;
      expect(firstStore.claimDueRobotsRefresh()?.origin).toBe("https://queued.example.org");
    } finally {
      firstStore.close();
      secondStore.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  test("a restarted coordinator reclaims an expired node lease without accepting the old result", () => {
    const directory = mkdtempSync(join(tmpdir(), "vrc-job-recovery-"));
    const databasePath = join(directory, "coordinator.db");
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    let store = new LocalCoordinatorStore(databasePath, () => now);
    try {
      store.seedJob("https://recovery.example.org/item", "vpm", 1000);
      allowFixtureOrigin(store, "https://recovery.example.org");
      const oldToken = store.createNodeCredential("old-node", ["vpm"]);
      const newToken = store.createNodeCredential("new-node", ["vpm"]);
      const oldPrincipal = store.authenticate("old-node", oldToken)!;
      const first = store.claim({ schemaVersion: 1, nodeId: "old-node", capabilities: ["vpm"] }, oldPrincipal);
      expect(first.status).toBe("leased");
      if (first.status !== "leased") throw new Error("Expected initial job lease");
      store.close();
      now += 5 * 60 * 1000 + 1;
      store = new LocalCoordinatorStore(databasePath, () => now);
      const newPrincipal = store.authenticate("new-node", newToken)!;
      const replacement = store.claim({ schemaVersion: 1, nodeId: "new-node", capabilities: ["vpm"] }, newPrincipal);
      expect(replacement.status).toBe("leased");
      if (replacement.status !== "leased") throw new Error("Expected replacement job lease");
      expect(replacement.job.jobId).toBe(first.job.jobId);
      expect(replacement.job.leaseId).not.toBe(first.job.leaseId);
      const stalePrincipal = store.authenticate("old-node", oldToken)!;
      expect(() => store.submit({ schemaVersion: 1, nodeId: "old-node", jobId: first.job.jobId,
        leaseId: first.job.leaseId, idempotencyKey: "stale-after-restart", outcome: { kind: "unchanged" } },
      stalePrincipal)).toThrow("live lease");
      expect(store.submit({ schemaVersion: 1, nodeId: "new-node", jobId: replacement.job.jobId,
        leaseId: replacement.job.leaseId, idempotencyKey: "replacement-after-restart",
        outcome: { kind: "unchanged" } }, newPrincipal).duplicate).toBe(false);
      expect((store.db.prepare("SELECT count(*) AS n FROM job_results").get() as { n: number }).n).toBe(1);
    } finally {
      store.close();
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  test("robots snapshots gate exact URLs, fail closed, expire, and reconsider deferred jobs", () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("robots-node", ["vpm"]);
    const principal = store.authenticate("robots-node", token)!;
    const claimRequest = { schemaVersion: 1 as const, nodeId: "robots-node", capabilities: ["vpm" as const] };
    try {
      store.seedJob("https://denied.example.org/private/one", "vpm", 0);
      store.seedJob("https://allowed.example.org/public", "vpm", 0);
      expect(store.claim(claimRequest, principal).status).toBe("empty");
      expect(() => store.recordRobotsSnapshot("http://denied.example.org", 200, "")).toThrow();
      store.recordRobotsSnapshot("https://denied.example.org", 200,
        "User-agent: VRCDiscoveryBot\nDisallow: /private/\nAllow: /public/");
      store.recordRobotsSnapshot("https://allowed.example.org", 503);
      expect(store.claim(claimRequest, principal).status).toBe("empty");
      const denied = store.db.prepare("SELECT robots_deferred_until FROM crawl_jobs WHERE url=?")
        .get("https://denied.example.org/private/one") as { robots_deferred_until: string | null };
      expect(denied.robots_deferred_until).toBeTruthy();
      store.recordRobotsSnapshot("https://allowed.example.org", 404);
      const allowed = store.claim(claimRequest, principal);
      expect(allowed.status).toBe("leased");
      if (allowed.status !== "leased") throw new Error("Expected allowed URL lease");
      expect(allowed.job.url).toBe("https://allowed.example.org/public");
      store.recordRobotsSnapshot("https://allowed.example.org", 200,
        "User-agent: *\nDisallow: /public");
      expect(() => store.submit({ schemaVersion: 1, nodeId: "robots-node", jobId: allowed.job.jobId,
        leaseId: allowed.job.leaseId, idempotencyKey: "robots-revoked-before-submit", outcome: { kind: "unchanged" } },
      principal)).toThrow("robots policy");
      store.recordRobotsSnapshot("https://denied.example.org", 404);
      const reconsidered = store.claim(claimRequest, principal);
      expect(reconsidered.status).toBe("leased");
      if (reconsidered.status === "leased") expect(reconsidered.job.url).toBe("https://denied.example.org/private/one");
      now += 25 * 60 * 60 * 1000;
      expect(store.claim(claimRequest, principal).status).toBe("empty");
    } finally { store.close(); }
  });

  test("more than 100 robots-denied ready jobs cannot hide an allowed job", () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("robots-node", ["vpm"]);
    const principal = store.authenticate("robots-node", token)!;
    try {
      for (let index = 0; index < 101; index++) {
        store.seedJob(`https://denied.example.org/private/${index}`, "vpm", 0);
      }
      store.seedJob("https://allowed.example.org/public", "vpm", 0);
      store.recordRobotsSnapshot("https://denied.example.org", 200, "User-agent: *\nDisallow: /private/");
      store.recordRobotsSnapshot("https://allowed.example.org", 404);
      const claim = store.claim({ schemaVersion: 1, nodeId: "robots-node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status === "leased") expect(claim.job.url).toBe("https://allowed.example.org/public");
    } finally { store.close(); }
  });

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

  test("operator cannot seed a known robots-disallowed itch search path", () => {
    const store = new LocalCoordinatorStore();
    try {
      expect(() => store.seedJob("https://itch.io/search?q=vrchat", "itch")).toThrow("disallowed");
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(0);
      expect(store.seedJob("https://itch.io/tools/tag-vrchat", "itch")).toBeTruthy();
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

  test("upgrades existing local evidence tables with nullable provenance markers", () => {
    const directory = mkdtempSync(join(tmpdir(), "vrc-coordinator-migrate-"));
    const databasePath = join(directory, "coordinator.db");
    const old = new Database(databasePath, { create: true });
    old.run(`CREATE TABLE crawl_jobs (
      job_id TEXT PRIMARY KEY, platform TEXT NOT NULL, url TEXT NOT NULL UNIQUE, origin TEXT NOT NULL,
      state TEXT NOT NULL, next_fetch_at TEXT NOT NULL, claimed_by TEXT, lease_id TEXT,
      lease_expires_at TEXT, etag TEXT, last_modified TEXT, created_at TEXT NOT NULL,
      robots_deferred_until TEXT)`);
    old.run(`CREATE TABLE source_items (
      source_key TEXT PRIMARY KEY, platform TEXT NOT NULL, source_url TEXT NOT NULL,
      latest_digest TEXT NOT NULL, latest_version_no INTEGER NOT NULL)`);
    old.run(`CREATE TABLE source_versions (
      version_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, version_no INTEGER NOT NULL,
      digest TEXT NOT NULL, payload_json TEXT NOT NULL, observed_at TEXT NOT NULL)`);
    old.run(`CREATE TABLE source_events (
      event_id INTEGER PRIMARY KEY, job_id TEXT NOT NULL, source_key TEXT, kind TEXT NOT NULL,
      observed_at TEXT NOT NULL, version_id TEXT)`);
    old.run(`CREATE TABLE source_issues (
      issue_id INTEGER PRIMARY KEY, job_id TEXT NOT NULL, source_item_key TEXT NOT NULL,
      version_key TEXT, code TEXT NOT NULL, observed_at TEXT NOT NULL)`);
    old.run(`CREATE TABLE source_leads (
      lead_key TEXT PRIMARY KEY, discovered_from_url TEXT NOT NULL,
      discovered_from_job_id TEXT NOT NULL, kind TEXT NOT NULL, target_url TEXT NOT NULL,
      claimed_package_id TEXT, status TEXT NOT NULL, first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL)`);
    old.prepare(`INSERT INTO source_versions
      (version_id,source_key,version_no,digest,payload_json,observed_at) VALUES (?,?,?,?,?,?)`)
      .run("old-version", "old-source", 1, "digest", "{}", "2026-01-01T00:00:00.000Z");
    old.prepare(`INSERT INTO source_items
      (source_key,platform,source_url,latest_digest,latest_version_no) VALUES (?,?,?,?,?)`)
      .run("old-source", "vpm", "https://example.org/index.json", "digest", 1);
    old.close(true);
    try {
      const store = new LocalCoordinatorStore(databasePath);
      try {
        const columns = store.db.prepare("PRAGMA table_info(source_versions)").all() as { name: string }[];
        expect(columns.some((column) => column.name === "complete")).toBe(true);
        expect(columns.some((column) => column.name === "contributor_node_id")).toBe(true);
        expect(columns.some((column) => column.name === "submission_lease_id")).toBe(true);
        expect((store.db.prepare("SELECT gone_at FROM source_items WHERE source_key='old-source'")
          .get() as { gone_at: string | null }).gone_at).toBeNull();
        expect((store.db.prepare("PRAGMA table_info(crawl_jobs)").all() as { name: string }[])
          .map((column) => column.name)).toContain("source_rule_id");
        for (const table of ["source_events", "source_issues"]) {
          const names = (store.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
            .map((column) => column.name);
          expect(names).toContain("contributor_node_id");
          expect(names).toContain("submission_lease_id");
        }
        const leadNames = (store.db.prepare("PRAGMA table_info(source_leads)").all() as { name: string }[])
          .map((column) => column.name);
        for (const name of ["first_seen_node_id", "first_seen_lease_id", "last_seen_node_id", "last_seen_lease_id",
          "discovered_from_item_key"]) {
          expect(leadNames).toContain(name);
        }
        expect((store.db.prepare(`SELECT contributor_node_id,submission_lease_id FROM source_versions
          WHERE version_id='old-version'`).get() as any)).toEqual({
            contributor_node_id: null, submission_lease_id: null
          });
        for (const [table, index] of [
          ["source_versions", "idx_source_versions_contributor"],
          ["source_events", "idx_source_events_contributor"],
          ["source_issues", "idx_source_issues_contributor"],
          ["source_leads", "idx_source_leads_first_node"],
          ["source_leads", "idx_source_leads_last_node"]
        ]) {
          const indexes = store.db.prepare(`PRAGMA index_list(${table})`).all() as { name: string }[];
          expect(indexes.map((entry) => entry.name)).toContain(index);
        }
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
    allowFixtureOrigin(store, "https://example.org");
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
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching", activeJobId: "not-held",
        activeLeaseId: crypto.randomUUID() })).status).toBe(403);
      const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] });
      expect(claim.body.status).toBe("leased");
      now += 1000;
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching", activeJobId: claim.body.job.jobId,
        activeLeaseId: crypto.randomUUID() })).status).toBe(403);
      expect((await post("/v1/node/heartbeat", { ...idle, state: "fetching", activeJobId: claim.body.job.jobId,
        activeLeaseId: claim.body.job.leaseId })).status).toBe(200);
      expect((store.db.prepare("SELECT state,active_job_id,last_seen_at FROM node_heartbeats").get() as any))
        .toEqual({ state: "fetching", active_job_id: claim.body.job.jobId,
          last_seen_at: "2026-09-27T00:00:01.000Z" });
      store.revokeNode("node-a");
      expect((await post("/v1/node/heartbeat", idle)).status).toBe(401);
    } finally { store.close(); }
  });

  test("a replaced lease held by the same node cannot keep an old fetch alive", () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("same-node", ["vpm"]);
    const principal = store.authenticate("same-node", token)!;
    store.seedJob("https://example.org/index.json", "vpm", 0);
    allowFixtureOrigin(store, "https://example.org");
    const request = { schemaVersion: 1 as const, nodeId: "same-node", capabilities: ["vpm" as const] };
    try {
      const first = store.claim(request, principal);
      expect(first.status).toBe("leased");
      if (first.status !== "leased") throw new Error("Expected first lease");
      now += 5 * 60 * 1000 + 1;
      const replacement = store.claim(request, principal);
      expect(replacement.status).toBe("leased");
      if (replacement.status !== "leased") throw new Error("Expected replacement lease");
      expect(replacement.job.jobId).toBe(first.job.jobId);
      expect(replacement.job.leaseId).not.toBe(first.job.leaseId);
      expect(() => store.heartbeat({ ...request, state: "fetching", activeJobId: first.job.jobId,
        activeLeaseId: first.job.leaseId }, principal)).toThrow("active job");
      expect(store.heartbeat({ ...request, state: "fetching", activeJobId: replacement.job.jobId,
        activeLeaseId: replacement.job.leaseId }, principal).status).toBe("alive");
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
    allowFixtureOrigin(store, "https://example.com");
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
      expect((store.db.prepare("SELECT contributor_node_id,submission_lease_id FROM source_versions").get() as any))
        .toEqual({ contributor_node_id: "node-a", submission_lease_id: job.job.leaseId });
      expect((store.db.prepare("SELECT contributor_node_id,submission_lease_id FROM source_events").get() as any))
        .toEqual({ contributor_node_id: "node-a", submission_lease_id: job.job.leaseId });
      expect(store.inspectNodeEvidence("node-a")).toMatchObject({
        totals: { submissions: 1, versions: 1, events: 1, issues: 0,
          leadsFirstSeen: 0, leadsLastSeen: 0 },
        versions: [{ source_key: expect.any(String), submission_lease_id: job.job.leaseId }]
      });
      expect(() => store.inspectNodeEvidence("unknown-node")).toThrow("Node not found");

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
    allowFixtureOrigin(store, "https://example.org");
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
    allowFixtureOrigin(store, "https://booth.pm");
    const post = async (path: string, body: unknown, credential = token) => {
      const response = await handleNodeRequest(request(path, body, credential), store);
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
      expect((store.db.prepare(`SELECT kind,contributor_node_id,submission_lease_id
        FROM source_events WHERE kind='suppressed'`).get() as any)).toEqual({
          kind: "suppressed", contributor_node_id: null, submission_lease_id: null
        });
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
      let latestLeaseId = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        allowFixtureOrigin(store, "https://example.org");
        const claim = await post("/v1/node/jobs/claim", { schemaVersion: 1, nodeId: "node-a", capabilities: ["vpm"] });
        expect(claim.status).toBe("leased");
        latestLeaseId = claim.job.leaseId;
        const result = await post("/v1/node/jobs/result", { schemaVersion: 1, nodeId: "node-a",
          jobId: claim.job.jobId, leaseId: claim.job.leaseId, idempotencyKey: `same-content-attempt-${attempt}`,
          outcome: { kind: "changed", observation } });
        expect(result.sourceVersionCreated).toBe(attempt === 0);
        now += 24 * 60 * 60 * 1000 + 1000;
      }
      expect((store.db.prepare("SELECT count(*) AS n FROM source_versions").get() as any).n).toBe(1);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_events").get() as any).n).toBe(2);
      expect((store.db.prepare("SELECT kind FROM source_events ORDER BY event_id DESC LIMIT 1").get() as any).kind).toBe("unchanged");
      expect((store.db.prepare(`SELECT contributor_node_id,submission_lease_id FROM source_events
        ORDER BY event_id DESC LIMIT 1`).get() as any)).toEqual({
          contributor_node_id: "node-a", submission_lease_id: latestLeaseId
        });
    } finally { store.close(); }
  });

  test("gone source evidence disappears and an identical later observation restores it without a new version", () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("vpm-node", ["vpm"]);
    const principal = store.authenticate("vpm-node", token)!;
    store.seedJob("https://example.org/index.json", "vpm", 0);
    const claimRequest = { schemaVersion: 1 as const, nodeId: "vpm-node", capabilities: ["vpm" as const] };
    const firstObservation = { sourceItemKey: "com.example.first", title: "First", author: "Creator",
      summary: "A tool", outboundLinks: [], originUpdatedAt: null };
    const secondObservation = { ...firstObservation, sourceItemKey: "com.example.second", title: "Second" };
    const submit = (outcome: { kind: "batch"; observations: typeof firstObservation[] } |
      { kind: "partial_batch"; observations: typeof firstObservation[];
        issues: { sourceItemKey: string; code: "invalid_release_evidence" }[] } | { kind: "gone" }, key: string) => {
      allowFixtureOrigin(store, "https://example.org");
      const claim = store.claim(claimRequest, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected job lease");
      return store.submit({ schemaVersion: 1, nodeId: "vpm-node", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: key, outcome }, principal);
    };
    try {
      expect(submit({ kind: "batch", observations: [firstObservation, secondObservation] },
        "initial-vpm-listing").sourceVersionCreated).toBe(true);
      expect(store.listCompleteVpmEvidence().length).toBe(2);
      now += 24 * 60 * 60 * 1000 + 1;
      expect(submit({ kind: "gone" }, "entire-listing-gone").sourceVersionCreated).toBe(false);
      expect(store.listCompleteVpmEvidence()).toEqual([]);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_items WHERE gone_at IS NOT NULL")
        .get() as { n: number }).n).toBe(2);
      now += 24 * 60 * 60 * 1000 + 1;
      submit({ kind: "partial_batch", observations: [firstObservation],
        issues: [{ sourceItemKey: firstObservation.sourceItemKey, code: "invalid_release_evidence" }] },
      "incomplete-listing-after-gone");
      expect(store.listCompleteVpmEvidence()).toEqual([]);
      now += 24 * 60 * 60 * 1000 + 1;
      expect(submit({ kind: "batch", observations: [firstObservation] },
        "listing-returns-one-item").sourceVersionCreated).toBe(false);
      expect(store.listCompleteVpmEvidence().map((item) => item.observation.sourceItemKey))
        .toEqual(["com.example.first"]);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_versions").get() as { n: number }).n).toBe(2);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_events WHERE kind='restored'")
        .get() as { n: number }).n).toBe(1);
    } finally { store.close(); }
  });

  test("an expired lease cannot submit, and rate-limit backoff is shared by origin", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const aToken = store.createNodeCredential("node-a", ["vpm"]);
    const bToken = store.createNodeCredential("node-b", ["vpm"]);
    store.seedJob("https://example.org/a", "vpm", 1000);
    store.seedJob("https://example.org/b", "vpm", 1000);
    allowFixtureOrigin(store, "https://example.org");
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
    allowFixtureOrigin(store, "https://busy.example.org", "https://free.example.org");
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
    allowFixtureOrigin(store, "https://example.org");
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
    allowFixtureOrigin(store, "https://example.org");
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
      expect((store.db.prepare("SELECT contributor_node_id,submission_lease_id FROM source_issues").get() as any))
        .toEqual({ contributor_node_id: "vpm-node", submission_lease_id: claim.body.job.leaseId });
      expect((store.db.prepare("SELECT count(*) AS n FROM source_events WHERE kind='incomplete_listing'").get() as any).n).toBe(1);
      expect((await post("/v1/node/jobs/result", result)).body.duplicate).toBe(true);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_issues").get() as any).n).toBe(1);
      now += 24 * 60 * 60 * 1000;
      allowFixtureOrigin(store, "https://example.org");
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
      expect(store.listCompleteVpmEvidence()[0]).toMatchObject({ contributorNodeId: "vpm-node",
        submissionLeaseId: retry.body.job.leaseId });
    } finally { store.close(); }
  });

  test("an incomplete later fetch cannot replace the last complete VPM read model", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("vpm-node", ["vpm"]);
    const url = "https://example.org/index.json";
    store.seedJob(url, "vpm", 0);
    allowFixtureOrigin(store, "https://example.org");
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
      allowFixtureOrigin(store, "https://example.org");
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
    allowFixtureOrigin(store, "https://first.example.org", "https://second.example.org");
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
    allowFixtureOrigin(store, "https://example.org");
    const post = async (path: string, body: unknown, credential = token) => {
      const response = await handleNodeRequest(request(path, body, credential), store);
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
      expect((store.db.prepare(`SELECT first_seen_node_id,first_seen_lease_id,
        last_seen_node_id,last_seen_lease_id FROM source_leads LIMIT 1`).get() as any)).toEqual({
          first_seen_node_id: "vpm-node", first_seen_lease_id: claim.body.job.leaseId,
          last_seen_node_id: "vpm-node", last_seen_lease_id: claim.body.job.leaseId
        });
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(1);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_items").get() as any).n).toBe(0);
      expect((store.db.prepare("SELECT kind FROM source_events").get() as any).kind).toBe("discovery");
      const secondToken = store.createNodeCredential("second-vpm-node", ["vpm"]);
      store.db.prepare("UPDATE crawl_jobs SET next_fetch_at=? WHERE job_id=?")
        .run("1970-01-01T00:00:00.000Z", claim.body.job.jobId);
      const secondClaim = await post("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "second-vpm-node", capabilities: ["vpm"] }, secondToken);
      expect(secondClaim.body.status).toBe("leased");
      expect((await post("/v1/node/jobs/result", {
        ...result, nodeId: "second-vpm-node", leaseId: secondClaim.body.job.leaseId,
        idempotencyKey: "template-recipe-leads-002"
      }, secondToken)).status).toBe(200);
      expect((store.db.prepare(`SELECT first_seen_node_id,first_seen_lease_id,
        last_seen_node_id,last_seen_lease_id FROM source_leads LIMIT 1`).get() as any)).toEqual({
          first_seen_node_id: "vpm-node", first_seen_lease_id: claim.body.job.leaseId,
          last_seen_node_id: "second-vpm-node", last_seen_lease_id: secondClaim.body.job.leaseId
        });
      expect(store.inspectNodeEvidence("vpm-node").totals).toMatchObject({
        leadsFirstSeen: 3, leadsLastSeen: 0
      });
      expect(store.inspectNodeEvidence("second-vpm-node").totals).toMatchObject({
        leadsFirstSeen: 0, leadsLastSeen: 3
      });
      const listingLead = store.db.prepare("SELECT lead_key FROM source_leads WHERE kind='vpm_listing'").get() as { lead_key: string };
      const zipLead = store.db.prepare("SELECT lead_key FROM source_leads WHERE kind='release_zip'").get() as { lead_key: string };
      expect(() => store.approveVpmListingLead(zipLead.lead_key)).toThrow();
      const listingJobId = store.approveVpmListingLead(listingLead.lead_key);
      expect(typeof listingJobId).toBe("string");
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(2);
      expect((store.db.prepare("SELECT status FROM source_leads WHERE lead_key=?").get(listingLead.lead_key) as any).status).toBe("approved");
    } finally { store.close(); }
  });

  test("creator and storefront candidate leads remain separate and cannot become fetch jobs", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("curated-node", ["curated"]);
    store.seedJob("https://directory.example.org/avatars", "curated", 0);
    allowFixtureOrigin(store, "https://directory.example.org");
    const post = async (path: string, body: unknown) => handleNodeRequest(request(path, body, token), store);
    try {
      const claim = await post("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "curated-node", capabilities: ["curated"] });
      const leased = await claim.json() as any;
      expect(leased.status).toBe("leased");
      const result = { schemaVersion: 1, nodeId: "curated-node", jobId: leased.job.jobId,
        leaseId: leased.job.leaseId, idempotencyKey: "creator-link-chain-001",
        outcome: { kind: "discovery", leads: [
          { kind: "creator_profile", url: "https://profiles.example.org/artist" },
          { kind: "publisher_site", url: "https://artist.example.org/" },
          { kind: "storefront_product", url: "https://artist.example.org/shop/avatar" }
        ] } };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      const leads = store.db.prepare(`SELECT kind,target_url,discovered_from_url,status
        FROM source_leads ORDER BY kind`).all() as any[];
      expect(leads).toEqual([
        { kind: "creator_profile", target_url: "https://profiles.example.org/artist",
          discovered_from_url: "https://directory.example.org/avatars", status: "pending_review" },
        { kind: "publisher_site", target_url: "https://artist.example.org/",
          discovered_from_url: "https://directory.example.org/avatars", status: "pending_review" },
        { kind: "storefront_product", target_url: "https://artist.example.org/shop/avatar",
          discovered_from_url: "https://directory.example.org/avatars", status: "pending_review" }
      ]);
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(1);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_items").get() as any).n).toBe(0);
      for (const lead of store.db.prepare("SELECT lead_key FROM source_leads").all() as { lead_key: string }[]) {
        expect(() => store.approveVpmListingLead(lead.lead_key)).toThrow();
      }
    } finally { store.close(); }
  });

  test("two source items linking one author site retain separate lead provenance", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("avatar-index-node", ["curated"]);
    store.seedJob("https://index.example.org/avatars", "curated", 0);
    allowFixtureOrigin(store, "https://index.example.org");
    const post = async (path: string, body: unknown) => handleNodeRequest(request(path, body, token), store);
    try {
      const claim = await post("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "avatar-index-node", capabilities: ["curated"] });
      const leased = await claim.json() as any;
      expect(leased.status).toBe("leased");
      const result = { schemaVersion: 1, nodeId: "avatar-index-node", jobId: leased.job.jobId,
        leaseId: leased.job.leaseId, idempotencyKey: "separate-avatar-author-leads",
        outcome: { kind: "discovery", leads: [
          { kind: "publisher_site", url: "https://artist.example.org/", discoveredFromItemKey: "avtr_a" },
          { kind: "publisher_site", url: "https://artist.example.org/", discoveredFromItemKey: "avtr_b" }
        ] } };
      expect((await post("/v1/node/jobs/result", result)).status).toBe(200);
      const leads = store.listLeads() as { lead_key: string; target_url: string;
        discovered_from_item_key: string | null; status: string }[];
      expect(leads).toHaveLength(2);
      expect(new Set(leads.map((lead) => lead.lead_key)).size).toBe(2);
      expect(leads.map((lead) => lead.discovered_from_item_key).sort()).toEqual(["avtr_a", "avtr_b"]);
      expect(leads.every((lead) => lead.target_url === "https://artist.example.org/" &&
        lead.status === "pending_review")).toBe(true);
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as any).n).toBe(1);
    } finally { store.close(); }
  });

  test("rediscovery keeps the pre-anchor identity of an unanchored lead", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("legacy-lead-node", ["vpm"]);
    const sourceUrl = "https://listing.example.org/source.json";
    const targetUrl = "https://listing.example.org/index.json";
    const leadKey = crypto.createHash("sha256")
      .update(JSON.stringify([sourceUrl, "vpm_listing", targetUrl, null])).digest("hex");
    store.seedJob(sourceUrl, "vpm", 0);
    allowFixtureOrigin(store, "https://listing.example.org");
    try {
      const claim = await handleNodeRequest(request("/v1/node/jobs/claim",
        { schemaVersion: 1, nodeId: "legacy-lead-node", capabilities: ["vpm"] }, token), store);
      const leased = await claim.json() as any;
      expect(leased.status).toBe("leased");
      store.db.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,kind,target_url,claimed_package_id,status,
          first_seen_at,last_seen_at)
        VALUES (?,?,?,?,?,NULL,'pending_review',?,?)`)
        .run(leadKey, sourceUrl, leased.job.jobId, "vpm_listing", targetUrl,
          "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      const result = await handleNodeRequest(request("/v1/node/jobs/result", {
        schemaVersion: 1, nodeId: "legacy-lead-node", jobId: leased.job.jobId,
        leaseId: leased.job.leaseId, idempotencyKey: "legacy-unanchored-rediscovery",
        outcome: { kind: "discovery", leads: [{ kind: "vpm_listing", url: targetUrl }] }
      }, token), store);
      expect(result.status).toBe(200);
      const leads = store.db.prepare("SELECT lead_key,discovered_from_item_key FROM source_leads").all() as any[];
      expect(leads).toEqual([{ lead_key: leadKey, discovered_from_item_key: null }]);
    } finally { store.close(); }
  });
});
