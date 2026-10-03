import { describe, expect, test } from "bun:test";
import { CreateSourceAccessProfileSchema, SourceAccessProfileSchema,
  sourceAccessProfileMatches, type CreateSourceAccessProfile } from "../../src-crawler/src/shared/policy/source_access_profile.js";
import { LocalCoordinatorStore } from "../../src-web/tests/support/local_sqlite.js";
import { handleOperatorRequest } from "../../src/worker/api/operator_handler.ts";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getTestOutputDir } from "../../src-web/tests/helpers/test_directory.js";
import { CreateSourceAccessProfileSchema as ConsumerProfileSchema } from "../../src-package/src/protocol/operator.js";

const input = {
  schemaVersion: 1 as const, platform: "vpm" as const, origin: "https://packages.example.org",
  pathScope: "/vpm/", method: "GET" as const, purpose: "discovery" as const,
  minDelayMs: 1000, expiresAt: "2030-01-01T00:00:00.000Z",
  reviewReference: "review-2026-09-28", reason: "Published package listing review",
  retainClasses: ["normalized_facts"], publishClasses: []
} satisfies CreateSourceAccessProfile;

describe("source-access profile contract", () => {
  test("inherits the consumer contract without weakening public-origin safety", () => {
    const variants = [input, { ...input, pathScope: "/vpm/*" },
      { ...input, exactQuery: "page=1" }, { ...input, retainClasses: [] },
      { ...input, publishClasses: ["creator_prose"] },
      { ...input, pathScope: "/vpm/%E3%81%82" }];
    for (const profile of variants) {
      expect(CreateSourceAccessProfileSchema.safeParse(profile).success)
        .toBe(ConsumerProfileSchema.safeParse(profile).success);
    }
    for (const origin of ["https://127.0.0.1", "https://[::1]", "https://192.168.1.1"]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, origin }).success).toBe(false);
    }
  });
  test("matches only a canonical exact target within its reviewed purpose and path", () => {
    const profile = SourceAccessProfileSchema.parse({ ...input, profileId: crypto.randomUUID(),
      createdAt: "2026-09-28T00:00:00.000Z", disabledAt: null });
    expect(sourceAccessProfileMatches(profile, "vpm", "https://packages.example.org/vpm/index.json",
      "discovery", Date.parse("2026-09-28T00:00:00Z"))).toBe(true);
    for (const [platform, target, purpose] of [
      ["vpm", "https://packages.example.org/vpmm/index.json", "discovery"],
      ["vpm", "https://sub.packages.example.org/vpm/index.json", "discovery"],
      ["vpm", "https://packages.example.org/vpm/index.json?next=1", "discovery"],
      ["vpm", "https://packages.example.org/vpm/%2e%2e/secret", "discovery"],
      ["vpm", "https://packages.example.org/vpm/index.json", "metadata"],
      ["curated", "https://packages.example.org/vpm/index.json", "discovery"]
    ] as const) {
      expect(sourceAccessProfileMatches(profile, platform, target, purpose,
        Date.parse("2026-09-28T00:00:00Z"))).toBe(false);
    }
    expect(sourceAccessProfileMatches(profile, "vpm", "https://packages.example.org/vpm/index.json",
      "discovery", Date.parse(input.expiresAt))).toBe(false);
    expect(sourceAccessProfileMatches({ ...profile, disabledAt: "2026-09-28T00:00:01.000Z" },
      "vpm", "https://packages.example.org/vpm/index.json", "discovery",
      Date.parse("2026-09-28T00:00:02Z"))).toBe(false);
  });

  test("rejects broad or ambiguous grants and publication beyond retention", () => {
    for (const origin of ["http://packages.example.org", "https://localhost", "https://127.0.0.1",
      "https://packages.example.org:8443", "https://packages.example.org/path"] ) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, origin }).success).toBe(false);
    }
    for (const pathScope of ["/vpm//", "/vpm/../", "/vpm/%2f", "/vpm?next=1"]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, pathScope }).success).toBe(false);
    }
    expect(CreateSourceAccessProfileSchema.safeParse({ ...input, publishClasses: ["creator_prose"] }).success)
      .toBe(false);
    expect(CreateSourceAccessProfileSchema.safeParse({ ...input, retainClasses: ["normalized_facts", "normalized_facts"] }).success)
      .toBe(false);
  });

  test("a BOOTH browse query needs its own exact, reviewed URL scope", () => {
    const pathScope = "/ja/browse/3D%E3%83%84%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0";
    const target = `https://booth.pm${pathScope}?page=1`;
    const boothInput = { ...input, platform: "booth" as const, origin: "https://booth.pm",
      pathScope, exactQuery: "page=1", purpose: "discovery" as const };
    for (const invalid of ["/ja/browse/%2F", "/ja/browse/%2E", "/ja/browse/%C0%AF",
      "/ja/browse/3D%e3%83%84%E3%83%BC%E3%83%AB", `${pathScope}/`]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...boothInput, pathScope: invalid }).success)
        .toBe(false);
    }
    expect(CreateSourceAccessProfileSchema.safeParse({ ...boothInput, exactQuery: "page=1&next=%2F" }).success)
      .toBe(false);
    const now = Date.parse("2026-09-28T00:00:00Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    try {
      store.seedJob(target, "booth", 0, undefined, "discovery");
      expect(store.claimDueRobotsRefresh()).toBeNull();
      const token = store.createNodeCredential("booth-fixture", ["booth"]);
      const principal = store.authenticate("booth-fixture", token)!;
      const request = { schemaVersion: 1 as const, nodeId: "booth-fixture", capabilities: ["booth" as const] };
      store.recordRobotsSnapshot("https://booth.pm", 404);
      expect(store.claim(request, principal).status).toBe("empty");
      const profile = store.createSourceAccessProfile(boothInput, "offline-test");
      expect(profile.exactQuery).toBe("page=1");
      store.createSourceAccessProfile({ ...boothInput, pathScope: "/ja/", exactQuery: undefined },
        "offline-test");
      expect(store.activeSourceAccessProfileForTarget("booth", `https://booth.pm${pathScope}`,
        "discovery")).toBeNull();
      expect(store.activeSourceAccessProfileForTarget("booth", target, "discovery")?.profileId)
        .toBe(profile.profileId);
      for (const denied of [`https://booth.pm${pathScope}?page=2`,
        `https://booth.pm${pathScope}?page=01`, `https://booth.pm${pathScope}?page=1&sort=new`,
        `https://booth.pm${pathScope}`, `https://booth.pm/ja/browse/other?page=1`]) {
        expect(store.activeSourceAccessProfileForTarget("booth", denied, "discovery")).toBeNull();
      }
      expect(store.activeSourceAccessProfileForTarget("booth", target, "metadata")).toBeNull();
      expect(store.claim(request, principal).status).toBe("leased");
      store.disableSourceAccessProfile(profile.profileId, "offline-test", "Browse review withdrawn");
      expect(store.activeSourceAccessProfileForTarget("booth", target, "discovery")).toBeNull();
    } finally { store.close(); }
  });

  test("authenticated operator API creates, pages and disables audited profiles without defaults", async () => {
    const store = new LocalCoordinatorStore(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    const token = "a".repeat(64);
    const request = (path: string, method = "GET", body?: unknown, bearer = token) =>
      handleOperatorRequest(new Request(`http://localhost${path}`, { method,
        headers: { authorization: `Bearer ${bearer}`, ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) }), store, token);
    try {
      expect(store.db.query("SELECT COUNT(*) AS n FROM source_access_profiles").get()).toEqual({ n: 0 });
      expect(store.activeSourceAccessProfileForTarget("vpm",
        "https://packages.example.org/vpm/index.json", "discovery")).toBeNull();
      expect((await request("/v1/operator/source-profiles", "POST", input, "b".repeat(64))).status).toBe(401);
      expect((await request("/v1/operator/source-profiles", "POST",
        { ...input, publishClasses: ["creator_prose"] })).status).toBe(400);
      const first = await request("/v1/operator/source-profiles", "POST", input);
      expect(first.status).toBe(201);
      const created = (await first.json()) as { profile: { profileId: string; disabledAt: string | null } };
      expect(created.profile.disabledAt).toBeNull();
      expect(store.activeSourceAccessProfileForTarget("vpm",
        "https://packages.example.org/vpm/index.json", "discovery")?.profileId)
        .toBe(created.profile.profileId);
      expect(store.activeSourceAccessProfileForTarget("vpm",
        "https://packages.example.org/vpm/index.json?x=1", "discovery")).toBeNull();
      expect((await request("/v1/operator/source-profiles", "POST",
        { ...input, pathScope: "/vpm/second/" })).status).toBe(409);
      expect((await request("/v1/operator/source-profiles", "POST",
        { ...input, pathScope: "/other/" })).status).toBe(201);
      const pageOne = await request("/v1/operator/source-profiles?limit=1");
      expect(pageOne.status).toBe(200);
      const page = await pageOne.json() as { profiles: {profileId: string}[]; nextCursor: string | null };
      expect(page.profiles).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
      const pageTwo = await request(`/v1/operator/source-profiles?limit=1&cursor=${page.nextCursor}`);
      expect(pageTwo.status).toBe(200);
      const second = await pageTwo.json() as { profiles: {profileId: string}[]; nextCursor: string | null };
      expect(second.profiles).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(second.profiles[0]?.profileId).not.toBe(page.profiles[0]?.profileId);
      expect((await request("/v1/operator/source-profiles?cursor=bad!" )).status).toBe(400);
      const disabled = await request(`/v1/operator/source-profiles/${created.profile.profileId}/disable`,
        "POST", { schemaVersion: 1, reason: "Access review withdrawn" });
      expect(disabled.status).toBe(200);
      expect(((await disabled.json()) as {profile: {disabledAt: string | null}}).profile.disabledAt).toBeTruthy();
      expect(store.activeSourceAccessProfileForTarget("vpm",
        "https://packages.example.org/vpm/index.json", "discovery")).toBeNull();
      expect((await request("/v1/operator/source-profiles", "POST", input)).status).toBe(201);
      expect(store.db.query("SELECT action FROM source_access_profile_actions ORDER BY action_id")
        .all()).toEqual([{ action: "create" }, { action: "create" }, { action: "disable" },
          { action: "create" }]);
    } finally { store.close(); }
  });

  test("an unapproved manual seed cannot refresh robots or lease despite a permissive snapshot", () => {
    const store = new LocalCoordinatorStore(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    const target = "https://packages.example.org/vpm/index.json";
    try {
      store.seedJob(target, "vpm", 0, undefined, "discovery");
      expect(store.claimDueRobotsRefresh()).toBeNull();
      expect(store.reserveRobotsRefresh("https://packages.example.org")).toBeNull();
      store.recordRobotsSnapshot("https://packages.example.org", 404);
      const token = store.createNodeCredential("unapproved", ["vpm"]);
      const principal = store.authenticate("unapproved", token)!;
      expect(store.claim({ schemaVersion: 1, nodeId: "unapproved", capabilities: ["vpm"] }, principal).status)
        .toBe("empty");
      store.createSourceAccessProfile(input, "test-fixture");
      expect(store.claim({ schemaVersion: 1, nodeId: "unapproved", capabilities: ["vpm"] }, principal).status)
        .toBe("leased");
    } finally { store.close(); }
  });

  test("purpose, expiry and revocation gate claims, fetching heartbeats and new submissions", () => {
    let now = Date.parse("2026-09-28T00:00:00Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const target = "https://packages.example.org/vpm/index.json";
    try {
      store.seedJob(target, "vpm", 0, undefined, "discovery");
      store.recordRobotsSnapshot("https://packages.example.org", 404);
      const token = store.createNodeCredential("authorized", ["vpm"]);
      const principal = store.authenticate("authorized", token)!;
      store.createSourceAccessProfile({ ...input, purpose: "metadata" }, "test-fixture");
      const claimRequest = { schemaVersion: 1 as const, nodeId: "authorized", capabilities: ["vpm" as const] };
      expect(store.claim(claimRequest, principal).status).toBe("empty");
      const profile = store.createSourceAccessProfile(input, "test-fixture");
      const claim = store.claim(claimRequest, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected reviewed lease");
      expect((store.db.query("SELECT lease_profile_id FROM crawl_jobs WHERE job_id=?")
        .get(claim.job.jobId) as {lease_profile_id: string}).lease_profile_id).toBe(profile.profileId);
      const heartbeat = { schemaVersion: 1 as const, nodeId: "authorized", capabilities: ["vpm" as const],
        state: "fetching" as const, activeJobId: claim.job.jobId, activeLeaseId: claim.job.leaseId };
      expect(store.heartbeat(heartbeat, principal).status).toBe("alive");
      store.disableSourceAccessProfile(profile.profileId, "test-fixture", "Review withdrawn");
      expect(() => store.heartbeat(heartbeat, principal)).toThrow("authorized active job");
      expect(() => store.submit({ schemaVersion: 1, nodeId: "authorized", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: "revoked-policy-result", outcome: { kind: "unchanged" } },
      principal)).toThrow();
      expect(store.claim(claimRequest, principal).status).toBe("empty");
      expect(store.db.query("SELECT COUNT(*) AS n FROM job_results").get()).toEqual({ n: 0 });
      const short = store.createSourceAccessProfile({ ...input, expiresAt: "2026-09-28T00:00:01.000Z" },
        "test-fixture");
      now += 1001;
      expect(store.activeSourceAccessProfileForTarget("vpm", target, "discovery")).toBeNull();
      expect(store.claim(claimRequest, principal).status).toBe("empty");
      expect(short.profileId).toBeTruthy();
    } finally { store.close(); }
  });

  test("retention scope denies creator prose without storing a version", () => {
    const store = new LocalCoordinatorStore(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    try {
      const target = "https://packages.example.org/vpm/index.json";
      store.seedJob(target, "vpm", 0, undefined, "discovery");
      store.createSourceAccessProfile(input, "test-fixture");
      store.recordRobotsSnapshot("https://packages.example.org", 404);
      const token = store.createNodeCredential("prose-node", ["vpm"]);
      const principal = store.authenticate("prose-node", token)!;
      const claim = store.claim({ schemaVersion: 1, nodeId: "prose-node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected reviewed lease");
      expect(() => store.submit({ schemaVersion: 1, nodeId: "prose-node", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: "unapproved-prose-result",
        outcome: { kind: "changed", observation: { sourceItemKey: "com.example.tool",
          title: "Tool", author: "Creator", summary: "Publisher description", outboundLinks: [],
          originUpdatedAt: null } } }, principal)).toThrow("creator prose");
      expect(store.db.query("SELECT COUNT(*) AS n FROM source_versions").get()).toEqual({ n: 0 });
    } finally { store.close(); }
  });

  test("accepted observation records the reviewed profile on durable evidence", () => {
    const store = new LocalCoordinatorStore(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    try {
      const target = "https://packages.example.org/vpm/index.json";
      const profile = store.createSourceAccessProfile({ ...input,
        retainClasses: ["normalized_facts", "creator_prose"] }, "test-fixture");
      store.seedJob(target, "vpm", 0, undefined, "discovery");
      store.recordRobotsSnapshot("https://packages.example.org", 404);
      const token = store.createNodeCredential("evidence-node", ["vpm"]);
      const principal = store.authenticate("evidence-node", token)!;
      const claim = store.claim({ schemaVersion: 1, nodeId: "evidence-node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected reviewed lease");
      expect(claim.job.retainClasses).toEqual(["normalized_facts", "creator_prose"]);
      store.submit({ schemaVersion: 1, nodeId: "evidence-node", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: "reviewed-evidence-result",
        outcome: { kind: "changed", observation: { sourceItemKey: "com.example.tool",
          title: "Tool", author: "Creator", summary: "Approved prose", outboundLinks: [],
          originUpdatedAt: null } } }, principal);
      expect(store.db.query("SELECT source_profile_id FROM source_versions").get())
        .toEqual({ source_profile_id: profile.profileId });
      expect(store.db.query("SELECT source_profile_id FROM source_events WHERE kind='changed'").get())
        .toEqual({ source_profile_id: profile.profileId });
    } finally { store.close(); }
  });

  test("an older coordinator database gains no implicit grants or valid old leases", () => {
    const directory = mkdtempSync(join(getTestOutputDir(), "vrc-profile-migration-"));
    const dbPath = join(directory, "legacy.db");
    const old = new Database(dbPath, { create: true });
    try {
      old.run(`CREATE TABLE crawl_jobs (
        job_id TEXT PRIMARY KEY, platform TEXT NOT NULL, url TEXT NOT NULL UNIQUE, origin TEXT NOT NULL,
        state TEXT NOT NULL, next_fetch_at TEXT NOT NULL, claimed_by TEXT, lease_id TEXT,
        lease_expires_at TEXT, etag TEXT, last_modified TEXT, created_at TEXT NOT NULL,
        robots_deferred_until TEXT, source_rule_id TEXT)`);
      old.run(`CREATE TABLE origin_leases (
        origin TEXT PRIMARY KEY, active_job_id TEXT, lease_expires_at TEXT,
        next_allowed_at TEXT NOT NULL, min_delay_ms INTEGER NOT NULL)`);
      old.prepare(`INSERT INTO crawl_jobs
        (job_id,platform,url,origin,state,next_fetch_at,created_at) VALUES (?,?,?,?,?,?,?)`)
        .run("old-job", "vpm", "https://packages.example.org/vpm/index.json",
          "https://packages.example.org", "pending", "2026-09-27T00:00:00.000Z",
          "2026-09-27T00:00:00.000Z");
      old.prepare(`UPDATE crawl_jobs SET state='leased',claimed_by='old-node',lease_id='old-lease',
        lease_expires_at='2026-09-28T00:05:00.000Z' WHERE job_id='old-job'`).run();
      old.prepare(`INSERT INTO origin_leases
        (origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms) VALUES (?,?,?,?,1000)`)
        .run("https://packages.example.org", "old-job", "2026-09-28T00:05:00.000Z",
          "2026-09-27T00:00:00.000Z");
    } finally { old.close(); }
    const store = new LocalCoordinatorStore(dbPath, () => Date.parse("2026-09-28T00:00:00Z"));
    try {
      expect(store.db.query("SELECT COUNT(*) AS n FROM source_access_profiles").get()).toEqual({ n: 0 });
      const columns = store.db.query("PRAGMA table_info(crawl_jobs)").all() as {name: string}[];
      expect(columns.map(column => column.name)).toContain("lease_profile_id");
      expect(columns.map(column => column.name)).toContain("job_purpose");
      expect(store.db.query("SELECT state,lease_id,lease_profile_id FROM crawl_jobs WHERE job_id='old-job'").get())
        .toEqual({ state: "pending", lease_id: null, lease_profile_id: null });
      expect(store.db.query(`SELECT active_job_id,lease_expires_at FROM origin_leases
        WHERE origin='https://packages.example.org'`).get())
        .toEqual({ active_job_id: null, lease_expires_at: null });
      store.recordRobotsSnapshot("https://packages.example.org", 404);
      const token = store.createNodeCredential("old-node", ["vpm"]);
      const principal = store.authenticate("old-node", token)!;
      const claimRequest = { schemaVersion: 1 as const, nodeId: "old-node", capabilities: ["vpm" as const] };
      expect(store.claim(claimRequest, principal).status).toBe("empty");
      const oldLease = crypto.randomUUID();
      store.db.prepare(`UPDATE crawl_jobs SET state='leased',claimed_by=?,lease_id=?,lease_expires_at=?
        WHERE job_id='old-job'`).run("old-node", oldLease, "2026-09-28T00:05:00.000Z");
      expect(() => store.heartbeat({ schemaVersion: 1, nodeId: "old-node", capabilities: ["vpm"],
        state: "fetching", activeJobId: "old-job", activeLeaseId: oldLease }, principal)).toThrow();
      expect(() => store.submit({ schemaVersion: 1, nodeId: "old-node", jobId: "old-job",
        leaseId: oldLease, idempotencyKey: "pre-policy-old-result", outcome: { kind: "unchanged" } },
      principal)).toThrow("Source profile");
      store.db.prepare(`UPDATE crawl_jobs SET state='pending',claimed_by=NULL,lease_id=NULL,
        lease_expires_at=NULL WHERE job_id='old-job'`).run();
      store.createSourceAccessProfile({ ...input, purpose: "metadata" }, "test-fixture");
      expect(store.claim(claimRequest, principal).status).toBe("leased");
    } finally {
      store.close();
      // Bun/SQLite can retain a Windows test handle until this process exits.
      try { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
      catch (_) { /* Best-effort cleanup for the isolated system-temp fixture. */ }
    }
  });

  test("a pre-query profile table gains a nullable query column without a grant", () => {
    const directory = mkdtempSync(join(getTestOutputDir(), "vrc-query-profile-migration-"));
    const dbPath = join(directory, "old-profile.db");
    const old = new Database(dbPath, { create: true });
    try {
      old.run(`CREATE TABLE source_access_profiles (
        profile_id TEXT PRIMARY KEY, platform TEXT NOT NULL, origin TEXT NOT NULL,
        path_scope TEXT NOT NULL, method TEXT NOT NULL,
        purpose TEXT NOT NULL, min_delay_ms INTEGER NOT NULL, expires_at TEXT NOT NULL,
        review_reference TEXT NOT NULL, reason TEXT NOT NULL,
        retain_classes_json TEXT NOT NULL, publish_classes_json TEXT NOT NULL,
        created_at TEXT NOT NULL, disabled_at TEXT)`);
    } finally { old.close(); }
    const store = new LocalCoordinatorStore(dbPath, () => Date.parse("2026-09-28T00:00:00Z"));
    try {
      const columns = store.db.query("PRAGMA table_info(source_access_profiles)").all() as {name: string}[];
      expect(columns.map(column => column.name)).toContain("query_scope");
      expect(store.db.query("SELECT COUNT(*) AS n FROM source_access_profiles").get()).toEqual({ n: 0 });
      const profile = store.createSourceAccessProfile({ ...input, pathScope: "/vpm/index.json",
        exactQuery: "page=1" }, "offline-test");
      expect(profile.exactQuery).toBe("page=1");
    } finally {
      store.close();
      try { rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
      catch (_) { /* Best-effort cleanup for the isolated system-temp fixture. */ }
    }
  });

  test("an auto-queue rule may enqueue a lead but cannot grant its destination fetch", () => {
    let now = Date.parse("2026-09-28T00:00:00Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    try {
      store.createSourceAccessProfile({ ...input, pathScope: "/source.json", purpose: "metadata" },
        "test-fixture");
      store.createAutoQueueRule({ schemaVersion: 1, leadKind: "vpm_listing",
        origin: input.origin, pathScope: "/vpm/index.json", minDelayMs: 1000,
        expiresAt: "2026-10-01T00:00:00.000Z", reviewReference: "offline-fixture-review",
        reason: "Synthetic listing promotion" }, "test-fixture");
      store.seedJob("https://packages.example.org/source.json", "vpm", 0);
      store.recordRobotsSnapshot(input.origin, 404);
      const token = store.createNodeCredential("auto-node", ["vpm"]);
      const principal = store.authenticate("auto-node", token)!;
      const claimRequest = { schemaVersion: 1 as const, nodeId: "auto-node", capabilities: ["vpm" as const] };
      const source = store.claim(claimRequest, principal);
      expect(source.status).toBe("leased");
      if (source.status !== "leased") throw new Error("Expected source lease");
      store.submit({ schemaVersion: 1, nodeId: "auto-node", jobId: source.job.jobId,
        leaseId: source.job.leaseId, idempotencyKey: "autoqueue-source-result",
        outcome: { kind: "discovery", leads: [{ kind: "vpm_listing",
          url: "https://packages.example.org/vpm/index.json" }] } }, principal);
      expect(store.db.query("SELECT COUNT(*) AS n FROM crawl_jobs").get()).toEqual({ n: 2 });
      now += 1000;
      expect(store.claim(claimRequest, principal).status).toBe("empty");
      store.createSourceAccessProfile(input, "test-fixture");
      const target = store.claim(claimRequest, principal);
      expect(target.status).toBe("leased");
      if (target.status !== "leased") throw new Error("Expected approved target lease");
      expect(target.job.url).toBe("https://packages.example.org/vpm/index.json");
    } finally { store.close(); }
  });

  test("a previously accepted identical result remains idempotent after profile disable", () => {
    const store = new LocalCoordinatorStore(":memory:", () => Date.parse("2026-09-28T00:00:00Z"));
    try {
      const profile = store.createSourceAccessProfile({ ...input, purpose: "metadata" }, "test-fixture");
      store.seedJob("https://packages.example.org/vpm/index.json", "vpm", 0);
      store.recordRobotsSnapshot(input.origin, 404);
      const token = store.createNodeCredential("repeat-node", ["vpm"]);
      const principal = store.authenticate("repeat-node", token)!;
      const claim = store.claim({ schemaVersion: 1, nodeId: "repeat-node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected reviewed lease");
      const request = { schemaVersion: 1 as const, nodeId: "repeat-node", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: "identical-before-and-after-revoke" as const,
        outcome: { kind: "unchanged" as const } };
      expect(store.submit(request, principal).duplicate).toBe(false);
      store.disableSourceAccessProfile(profile.profileId, "test-fixture", "Review withdrawn");
      expect(store.submit(request, principal).duplicate).toBe(true);
      expect(store.db.query("SELECT COUNT(*) AS n FROM job_results").get()).toEqual({ n: 1 });
    } finally { store.close(); }
  });
});
