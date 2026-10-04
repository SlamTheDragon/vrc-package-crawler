import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "./support/local_sqlite.js";
import { handleOperatorRequest } from "../src/api/operator_handler.ts";
import { handleNodeRequest } from "../src/api/handler.ts";
import { OPERATOR_API_JSON_SCHEMAS, TakedownListResponseSchema, VerifyTakedownResponseSchema } from "../src/api/protocol/operator_protocol.js";
import { approveFixtureSource, seedApprovedFixtureJob } from "./helpers/source_access_fixture.js";

const operatorToken = "a".repeat(64);

function operatorRequest(path: string, method = "GET", body?: unknown, token = operatorToken): Request {
  return new Request(`http://localhost${path}`, { method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe("separate operator control API", () => {
  test("operator pagination normalizes decoded UUIDs without changing timestamps or accepting noncanonical cursors", async () => {
    const store = new LocalCoordinatorStore();
    const id = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    const timestamp = "2026-10-04T00:00:00.000Z";
    const calls: unknown[] = [];
    store.listAutoQueueRulesPage = (_limit, cursor) => { calls.push(cursor); return { rules: [], nextCursor: null }; };
    store.listSourceAccessProfilesPage = (_limit, cursor) => { calls.push(cursor); return { profiles: [], nextCursor: null }; };
    store.listTakedownsPage = (_type, _limit, cursor) => { calls.push(cursor); return { records: [], nextCursor: null }; };
    try {
      for (const [route, timeField, idField] of [
        ["autoqueue-rules", "createdAt", "ruleId"],
        ["source-profiles", "createdAt", "profileId"],
        ["takedowns", "recordedAt", "takedownId"]
      ] as const) {
        for (const value of [id, id.toUpperCase(), id.replace("abcdefab", "AbCdEfAb")]) {
          const encoded = btoa(JSON.stringify({ [timeField]: timestamp, [idField]: value }))
            .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
          const path = `/v1/operator/${route}?cursor=${encoded}`;
          const before = calls.length;
          expect((await handleOperatorRequest(operatorRequest(path), store, operatorToken)).status).toBe(200);
          expect(calls.slice(before)).toEqual([{ [timeField]: timestamp, [idField]: id }]);
          for (const invalid of [encoded + "=", "invalid-cursor"]) {
            expect((await handleOperatorRequest(operatorRequest(`/v1/operator/${route}?cursor=${encodeURIComponent(invalid)}`), store, operatorToken)).status).toBe(400);
          }
          expect(calls.length).toBe(before + 1);
        }
      }
    } finally { store.close(); }
  });
  test("UUID action paths normalize case and reject malformed IDs before storage", async () => {
    const store = new LocalCoordinatorStore();
    const id = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    const calls: string[] = [];
    store.disableSourceAccessProfile = (value) => { calls.push(value); throw new Error("Source profile not found"); };
    store.disableAutoQueueRule = (value) => { calls.push(value); throw new Error("Rule not found"); };
    store.verifyTakedown = (value) => { calls.push(value); throw new Error("Takedown not found"); };
    try {
      for (const [route, action, body] of [
        ["source-profiles", "disable", { schemaVersion: 1, reason: "Reviewed profile" }],
        ["autoqueue-rules", "disable", { schemaVersion: 1, reason: "Reviewed rule" }],
        ["takedowns", "verify", { schemaVersion: 1, verdict: "accepted" }]
      ] as const) {
        const path = `/v1/operator/${route}/${id.toUpperCase()}/${action}`;
        expect((await handleOperatorRequest(operatorRequest(path, "POST", body, "b".repeat(64)), store, operatorToken)).status).toBe(401);
        const before = calls.length;
        expect((await handleOperatorRequest(operatorRequest(path, "POST", body), store, operatorToken)).status).toBe(404);
        expect(calls.slice(before)).toEqual([id]);
        for (const malformed of ["-".repeat(36), "a".repeat(36), "not-a-uuid"]) {
          const invalid = `/v1/operator/${route}/${malformed}/${action}`;
          expect((await handleOperatorRequest(operatorRequest(invalid, "POST", body), store, operatorToken)).status).toBe(404);
        }
        expect(calls.length).toBe(before + 1);
      }
    } finally { store.close(); }
  });
  test("manual enqueue audits atomically and preserves existing job state in the SQLite comparator", async () => {
    const store = new LocalCoordinatorStore();
    const input = { schemaVersion: 1, url: "https://queue.example/index.json", platform: "vpm", purpose: "metadata", minDelayMs: 1000, reason: "Offline fixture" };
    try {
      const first = await handleOperatorRequest(operatorRequest("/v1/operator/jobs", "POST", input), store, operatorToken);
      expect(first.status).toBe(200);
      const body = await first.json() as { jobId: string };
      store.db.run("UPDATE crawl_jobs SET state='done' WHERE job_id=?", [body.jobId]);
      const second = await handleOperatorRequest(operatorRequest("/v1/operator/jobs", "POST", input), store, operatorToken);
      expect(second.status).toBe(200);
      expect((await second.json() as { jobId: string }).jobId).toBe(body.jobId);
      expect(store.db.query("SELECT state FROM crawl_jobs").get()).toEqual({ state: "done" });
      expect(store.db.query("SELECT COUNT(*) AS count FROM job_seed_actions").get()).toEqual({ count: 2 });
      store.db.run("CREATE TRIGGER reject_seed_audit BEFORE INSERT ON job_seed_actions BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;");
      const failed = await handleOperatorRequest(operatorRequest("/v1/operator/jobs", "POST", { ...input, minDelayMs: 50000 }), store, operatorToken);
      expect(failed.status).toBe(409);
      expect(store.db.query("SELECT min_delay_ms FROM origin_leases").get()).toEqual({ min_delay_ms: 1000 });
    } finally { store.close(); }
  });
  test("exports the operator request and response contracts as JSON Schema", () => {
    expect(OPERATOR_API_JSON_SCHEMAS.approveLead.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.rejectLead.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.leadListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.leadActionResponse.oneOf?.length).toBe(2);
    expect(OPERATOR_API_JSON_SCHEMAS.createAutoQueueRule.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.disableAutoQueueRule.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.autoQueueRuleResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.issueNodeCredential.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.nodeCredentialResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.takedownListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.verifyTakedownRequest.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.verifyTakedownResponse.type).toBe("object");
  });

  test("only the operator can issue an audited node key; rotation invalidates the old key", async () => {
    const store = new LocalCoordinatorStore();
    const path = "/v1/operator/nodes";
    const input = { schemaVersion: 1, nodeId: "desktop-1", capabilities: ["vpm"],
      reason: "Approve this local desktop node" };
    const claim = (token: string) => handleNodeRequest(new Request("http://localhost/v1/node/jobs/claim", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, nodeId: input.nodeId, capabilities: input.capabilities })
    }), store);
    try {
      expect((await handleOperatorRequest(operatorRequest(path, "POST", input), store, "")).status).toBe(401);
      expect((await handleOperatorRequest(operatorRequest(path, "POST", input, "b".repeat(64)),
        store, operatorToken)).status).toBe(401);
      expect((await handleOperatorRequest(operatorRequest(path, "POST", { ...input, extra: true }),
        store, operatorToken)).status).toBe(400);
      expect(store.db.prepare("SELECT COUNT(*) AS count FROM node_credentials").get()).toEqual({ count: 0 });
      const first = await handleOperatorRequest(operatorRequest(path, "POST", input), store, operatorToken);
      expect(first.status).toBe(201);
      expect(first.headers.get("cache-control")).toBe("no-store");
      const firstBody = await first.json() as { token: string; nodeId: string };
      expect(firstBody.nodeId).toBe(input.nodeId);
      expect(firstBody.token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
      expect((await claim(firstBody.token)).status).toBe(200);
      expect((await handleOperatorRequest(operatorRequest(path, "POST", input, firstBody.token),
        store, operatorToken)).status).toBe(401);
      const second = await handleOperatorRequest(operatorRequest(path, "POST", input), store, operatorToken);
      expect(second.status).toBe(201);
      const secondBody = await second.json() as { token: string };
      expect(secondBody.token).not.toBe(firstBody.token);
      expect((await claim(firstBody.token)).status).toBe(401);
      expect((await claim(secondBody.token)).status).toBe(200);
      const actions = store.db.prepare("SELECT node_id,actor,action,reason FROM node_credential_actions ORDER BY action_id")
        .all() as Array<{ node_id: string; actor: string; action: string; reason: string }>;
      expect(actions).toEqual([1, 2].map(() => ({ node_id: input.nodeId, actor: "operator-api",
        action: "issue", reason: input.reason })));
      expect(JSON.stringify(actions)).not.toContain(secondBody.token);
    } finally { store.close(); }
  });

  test("node issuance rejects the wrong schema version before creating credentials", async () => {
    const store = new LocalCoordinatorStore();
    const path = "/v1/operator/nodes";
    const invalid = { schemaVersion: 2, nodeId: "unknown", capabilities: ["vpm"], reason: "Local approval" };
    try {
      const rejected = await handleOperatorRequest(operatorRequest(path, "POST", invalid), store, operatorToken);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ schemaVersion: 1, code: "invalid_payload", error: "Node credential body is invalid" });
      expect(store.db.prepare("SELECT COUNT(*) AS count FROM node_credentials").get()).toEqual({ count: 0 });
      const valid = { ...invalid, schemaVersion: 1 };
      const issued = await handleOperatorRequest(operatorRequest(path, "POST", valid), store, operatorToken);
      expect(issued.status).toBe(201);
      expect((await issued.json() as { token: string }).token).toMatch(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/);
    } finally { store.close(); }
  });

  test("fails closed without a configured operator token and never accepts node credentials", async () => {
    const store = new LocalCoordinatorStore();
    const nodeToken = store.createNodeCredential("node", ["vpm"]);
    try {
      const request = operatorRequest("/v1/operator/leads");
      expect((await handleOperatorRequest(request, store, "")).status).toBe(401);
      expect((await handleOperatorRequest(operatorRequest("/v1/operator/leads", "GET", undefined, nodeToken),
        store, operatorToken)).status).toBe(401);
      expect((await handleOperatorRequest(request, store, operatorToken)).status).toBe(200);
      expect((await handleOperatorRequest(operatorRequest("/v1/operator/leads?limit=101"),
        store, operatorToken)).status).toBe(400);
    } finally { store.close(); }
  });

  test("paginates more than 100 pending leads without hiding later rows", async () => {
    const store = new LocalCoordinatorStore();
    const jobId = seedApprovedFixtureJob(store, "https://index.example.org/source.json", "curated", 0);
    try {
      const insert = store.db.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,kind,target_url,claimed_package_id,
          status,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,NULL,?,?,?)`);
      for (let index = 0; index < 205; index++) {
        insert.run(index.toString(16).padStart(64, "0"), "https://index.example.org/source.json", jobId,
          "publisher_site", `https://creator-${index}.example.org/`, "pending_review",
          "2026-09-28T00:00:00.000Z", "2026-09-28T00:00:00.000Z");
      }
      insert.run("f".repeat(64), "https://index.example.org/source.json", jobId,
        "publisher_site", "https://rejected.example.org/", "rejected",
        "2026-09-28T00:00:00.000Z", "2026-09-28T00:00:00.000Z");
      const seen = new Set<string>();
      const pageSizes: number[] = [];
      let cursor: string | null = null;
      let firstCursor: string | null = null;
      do {
        const path = `/v1/operator/leads?status=pending_review&limit=60${cursor ? `&cursor=${cursor}` : ""}`;
        const response = await handleOperatorRequest(operatorRequest(path), store, operatorToken);
        expect(response.status).toBe(200);
        const page = await response.json() as { leads: { lead_key: string }[]; nextCursor: string | null };
        pageSizes.push(page.leads.length);
        for (const lead of page.leads) {
          expect(seen.has(lead.lead_key)).toBe(false);
          seen.add(lead.lead_key);
        }
        cursor = page.nextCursor;
        firstCursor ??= cursor;
      } while (cursor);
      expect(pageSizes).toEqual([60, 60, 60, 25]);
      expect(seen.size).toBe(205);
      const plan = store.db.prepare(`EXPLAIN QUERY PLAN SELECT lead_key FROM source_leads
        WHERE status=? AND (first_seen_at,lead_key)>(?,?)
        ORDER BY first_seen_at,lead_key LIMIT ?`)
        .all("pending_review", "2026-09-28T00:00:00.000Z", "0".repeat(64), 61) as { detail: string }[];
      expect(plan.some((step) => step.detail.includes("idx_source_leads_page"))).toBe(true);
      expect((await handleOperatorRequest(operatorRequest(
        `/v1/operator/leads?status=rejected&cursor=${firstCursor}`), store, operatorToken)).status).toBe(400);
      expect((await handleOperatorRequest(operatorRequest(
        "/v1/operator/leads?cursor=not-a-valid-cursor"), store, operatorToken)).status).toBe(400);
      const replay = await handleOperatorRequest(operatorRequest(
        `/v1/operator/leads?status=pending_review&limit=60&cursor=${firstCursor}`), store, operatorToken);
      expect(replay.status).toBe(200);
      const replayPage = await replay.json() as { leads: { lead_key: string }[]; nextCursor: string | null };
      expect(replayPage.leads).toHaveLength(60);
      expect(replayPage.leads.map((lead) => lead.lead_key)).toEqual(
        Array.from({ length: 60 }, (_, index) => (index + 60).toString(16).padStart(64, "0")));
      expect(replayPage.nextCursor).not.toBeNull();
    } finally { store.close(); }
  });

  test("paginates the complete auto-queue rule inventory", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const insert = store.db.prepare(`INSERT INTO lead_autoqueue_rules
        (rule_id,lead_kind,origin,path_scope,min_delay_ms,expires_at,review_reference,
          reason,created_at,disabled_at) VALUES (?,'vpm_listing','https://example.org',?,1000,?,
          'fixture-review','Fixture rule',?,NULL)`);
      for (let index = 0; index < 105; index++) {
        insert.run(crypto.randomUUID(), `/listing-${index}.json`, "2027-09-28T00:00:00.000Z",
          "2026-09-28T00:00:00.000Z");
      }
      const seen = new Set<string>();
      const sizes: number[] = [];
      let cursor: string | null = null;
      do {
        const path = `/v1/operator/autoqueue-rules?limit=40${cursor ? `&cursor=${cursor}` : ""}`;
        const response = await handleOperatorRequest(operatorRequest(path), store, operatorToken);
        expect(response.status).toBe(200);
        const page = await response.json() as { rules: { ruleId: string }[]; nextCursor: string | null };
        sizes.push(page.rules.length);
        for (const rule of page.rules) {
          expect(seen.has(rule.ruleId)).toBe(false);
          seen.add(rule.ruleId);
        }
        cursor = page.nextCursor;
      } while (cursor);
      expect(sizes).toEqual([40, 40, 25]);
      expect(seen.size).toBe(105);
      expect((await handleOperatorRequest(operatorRequest(
        "/v1/operator/autoqueue-rules?cursor=bad"), store, operatorToken)).status).toBe(400);
      const plan = store.db.prepare(`EXPLAIN QUERY PLAN SELECT rule_id FROM lead_autoqueue_rules
        WHERE (created_at,rule_id)<(?,?) ORDER BY created_at DESC,rule_id DESC LIMIT ?`)
        .all("2026-09-28T00:00:00.000Z", "00000000-0000-4000-8000-000000000000", 41) as { detail: string }[];
      expect(plan.some((step) => step.detail.includes("idx_lead_autoqueue_rules_page"))).toBe(true);
    } finally { store.close(); }
  });

  test("malformed lead approval payloads fail before changing leads or queue state", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const path = `/v1/operator/leads/${"0".repeat(64)}/approve`;
      const invalid = { schemaVersion: 2, reason: "No source review" };
      const rejected = await handleOperatorRequest(operatorRequest(path, "POST", invalid), store, operatorToken);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ schemaVersion: 1, code: "invalid_payload", error: "Approval body is invalid" });
      expect(store.db.prepare("SELECT COUNT(*) AS count FROM source_leads").get()).toEqual({ count: 0 });
      expect(store.db.prepare("SELECT COUNT(*) AS count FROM crawl_jobs").get()).toEqual({ count: 0 });
      expect(store.db.prepare("SELECT COUNT(*) AS count FROM operator_actions").get()).toEqual({ count: 0 });
    } finally { store.close(); }
  });

  test("reviews a node-discovered listing through versioned requests with an audit record", async () => {
    const store = new LocalCoordinatorStore();
    const nodeToken = store.createNodeCredential("node", ["vpm"]);
    const principal = store.authenticate("node", nodeToken)!;
    seedApprovedFixtureJob(store, "https://example.org/source.json", "vpm", 0);
    store.recordRobotsSnapshot("https://example.org", 404);
    try {
      const claim = store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected recipe lease");
      store.submit({ schemaVersion: 1, nodeId: "node", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: "operator-api-discovery-result",
        outcome: { kind: "discovery", leads: [
          { kind: "vpm_listing", url: "https://example.org/index.json" },
          { kind: "github_repository", url: "https://github.com/example/tool",
            discoveredFromItemKey: "recipe-tool" }
        ] } }, principal);
      const list = await handleOperatorRequest(operatorRequest("/v1/operator/leads"), store, operatorToken);
      expect(list.status).toBe(200);
      const pending = await list.json() as { schemaVersion: number;
        leads: { lead_key: string; kind: string; discovered_from_item_key: string | null }[] };
      expect(pending.schemaVersion).toBe(1);
      expect(pending.leads).toHaveLength(2);
      expect(pending.leads.find((lead) => lead.kind === "github_repository")?.discovered_from_item_key)
        .toBe("recipe-tool");
      expect(pending.leads.find((lead) => lead.kind === "vpm_listing")?.discovered_from_item_key)
        .toBeNull();
      const listingKey = pending.leads.find((lead) => lead.kind === "vpm_listing")!.lead_key;
      const githubKey = pending.leads.find((lead) => lead.kind === "github_repository")!.lead_key;
      expect((await handleOperatorRequest(operatorRequest(`/v1/operator/leads/${listingKey}/approve`, "POST",
        { schemaVersion: 2, reason: "Reviewed source" }), store, operatorToken)).status).toBe(400);
      const approve = await handleOperatorRequest(operatorRequest(`/v1/operator/leads/${listingKey}/approve`, "POST",
        { schemaVersion: 1, reason: "Reviewed listing host and path", minDelayMs: 1200 }), store, operatorToken);
      expect(approve.status).toBe(200);
      expect((await approve.json() as { status: string }).status).toBe("approved");
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      expect((await handleOperatorRequest(operatorRequest(`/v1/operator/leads/${listingKey}/approve`, "POST",
        { schemaVersion: 1, reason: "Repeated review" }), store, operatorToken)).status).toBe(200);
      const reject = await handleOperatorRequest(operatorRequest(`/v1/operator/leads/${githubKey}/reject`, "POST",
        { schemaVersion: 1, reason: "No approved job mapping" }), store, operatorToken);
      expect(reject.status).toBe(200);
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      expect((store.db.prepare("SELECT action FROM operator_actions ORDER BY action_id").all() as { action: string }[])
        .map((row) => row.action)).toEqual(["approve_lead", "reject_lead"]);
      expect((await handleOperatorRequest(operatorRequest("/v1/operator/leads?status=pending_review"),
        store, operatorToken).then((response) => response.json()) as { leads: unknown[] }).leads).toEqual([]);
    } finally { store.close(); }
  });

  test("a reviewed exact-scope rule queues matching VPM leads and disabling it revokes their leases", async () => {
    let now = Date.parse("2026-09-28T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const nodeToken = store.createNodeCredential("node", ["vpm"]);
    const principal = store.authenticate("node", nodeToken)!;
    seedApprovedFixtureJob(store, "https://reviewed.example.org/source.json", "vpm", 0);
    approveFixtureSource(store, "https://reviewed.example.org/index.json", "vpm", "discovery");
    store.recordRobotsSnapshot("https://reviewed.example.org", 404);
    try {
      const create = await handleOperatorRequest(operatorRequest("/v1/operator/autoqueue-rules", "POST", {
        schemaVersion: 1, leadKind: "vpm_listing", origin: "https://reviewed.example.org",
        pathScope: "/index.json", minDelayMs: 1200, expiresAt: "2026-10-01T00:00:00.000Z",
        reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm", reason: "Reviewed this listing endpoint"
      }), store, operatorToken);
      expect(create.status).toBe(201);
      expect((await handleOperatorRequest(operatorRequest("/v1/operator/autoqueue-rules", "POST", {
        schemaVersion: 1, leadKind: "vpm_listing", origin: "https://reviewed.example.org",
        pathScope: "/private/../index.json", minDelayMs: 1200, expiresAt: "2026-10-01T00:00:00.000Z",
        reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm", reason: "Invalid traversal scope"
      }), store, operatorToken)).status).toBe(400);
      const rule = (await create.json() as { rule: { ruleId: string } }).rule;
      expect((await handleOperatorRequest(operatorRequest("/v1/operator/autoqueue-rules"),
        store, operatorToken).then((response) => response.json()) as { rules: unknown[] }).rules).toHaveLength(1);
      const recipe = store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(recipe.status).toBe("leased");
      if (recipe.status !== "leased") throw new Error("Expected recipe lease");
      store.submit({ schemaVersion: 1, nodeId: "node", jobId: recipe.job.jobId,
        leaseId: recipe.job.leaseId, idempotencyKey: "reviewed-autoqueue-discovery",
        outcome: { kind: "discovery", leads: [
          { kind: "vpm_listing", url: "https://reviewed.example.org/index.json" },
          { kind: "vpm_listing", url: "https://reviewed.example.org/index-v2.json" },
          { kind: "vpm_listing", url: "https://reviewed.example.org/index.json?variant=other" },
          { kind: "vpm_listing", url: "https://unknown.example.org/index.json" },
          { kind: "github_repository", url: "https://github.com/example/tool" }
        ] } }, principal);
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_leads WHERE status='approved'")
        .get() as { n: number }).n).toBe(1);
      expect((store.db.prepare("SELECT count(*) AS n FROM source_leads WHERE status='pending_review'")
        .get() as { n: number }).n).toBe(4);
      expect((store.db.prepare("SELECT source_rule_id FROM crawl_jobs WHERE url=?")
        .get("https://reviewed.example.org/index.json") as { source_rule_id: string }).source_rule_id)
        .toBe(rule.ruleId);
      now += 1200;
      const listing = store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(listing.status).toBe("leased");
      if (listing.status !== "leased") throw new Error("Expected listing lease");
      const disable = await handleOperatorRequest(operatorRequest(
        `/v1/operator/autoqueue-rules/${rule.ruleId}/disable`, "POST",
        { schemaVersion: 1, reason: "Access review withdrawn" }), store, operatorToken);
      expect(disable.status).toBe(200);
      expect((await handleOperatorRequest(operatorRequest(
        `/v1/operator/autoqueue-rules/${rule.ruleId}/disable`, "POST",
        { schemaVersion: 1, reason: "Repeated disable" }), store, operatorToken)).status).toBe(200);
      expect(() => store.heartbeat({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"],
        state: "fetching", activeJobId: listing.job.jobId, activeLeaseId: listing.job.leaseId }, principal)).toThrow();
      expect(() => store.submit({ schemaVersion: 1, nodeId: "node", jobId: listing.job.jobId,
        leaseId: listing.job.leaseId, idempotencyKey: "disabled-rule-stale-result",
        outcome: { kind: "unchanged" } }, principal)).toThrow("rule");
      expect((store.db.prepare("SELECT action FROM operator_rule_actions ORDER BY action_id").all() as { action: string }[])
        .map((row) => row.action)).toEqual(["create", "disable"]);
    } finally { store.close(); }
  });

  test("an expired auto-queue rule withholds its queued job and robots refresh", async () => {
    let now = Date.parse("2026-09-28T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("node", ["vpm"]);
    const principal = store.authenticate("node", token)!;
    seedApprovedFixtureJob(store, "https://expiry.example.org/source.json", "vpm", 0);
    approveFixtureSource(store, "https://expiry.example.org/index.json", "vpm", "discovery");
    store.recordRobotsSnapshot("https://expiry.example.org", 404);
    try {
      store.createAutoQueueRule({ schemaVersion: 1, leadKind: "vpm_listing",
        origin: "https://expiry.example.org", pathScope: "/index.json", minDelayMs: 1000,
        expiresAt: "2026-09-28T01:00:00.000Z", reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm",
        reason: "One-hour fixture review" }, "operator-api");
      const recipe = store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal);
      expect(recipe.status).toBe("leased");
      if (recipe.status !== "leased") throw new Error("Expected recipe lease");
      store.submit({ schemaVersion: 1, nodeId: "node", jobId: recipe.job.jobId,
        leaseId: recipe.job.leaseId, idempotencyKey: "expiry-recipe-result",
        outcome: { kind: "discovery", leads: [{ kind: "vpm_listing", url: "https://expiry.example.org/index.json" }] } },
      principal);
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      now += 60 * 60 * 1000 + 1;
      expect(store.claim({ schemaVersion: 1, nodeId: "node", capabilities: ["vpm"] }, principal).status).toBe("empty");
      expect(store.claimDueRobotsRefresh()).toBeNull();
    } finally { store.close(); }
  });

  test("a new rule does not silently promote old leads, and a rejected lead stays rejected on rediscovery", () => {
    let now = Date.parse("2026-09-28T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("node", ["vpm"]);
    const principal = store.authenticate("node", token)!;
    seedApprovedFixtureJob(store, "https://reviewed.example.org/source.json", "vpm", 0);
    const claimRequest = { schemaVersion: 1 as const, nodeId: "node", capabilities: ["vpm" as const] };
    const leads = [
      { kind: "vpm_listing" as const, url: "https://reviewed.example.org/index.json" },
      { kind: "vpm_listing" as const, url: "https://reviewed.example.org/rejected.json" }
    ];
    const discover = (key: string) => {
      store.recordRobotsSnapshot("https://reviewed.example.org", 404);
      const claim = store.claim(claimRequest, principal);
      expect(claim.status).toBe("leased");
      if (claim.status !== "leased") throw new Error("Expected recipe lease");
      store.submit({ schemaVersion: 1, nodeId: "node", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: key, outcome: { kind: "discovery", leads } }, principal);
    };
    try {
      discover("first-discovery-before-rule");
      const rejected = (store.listLeads().find((lead: any) => lead.target_url.endsWith("/rejected.json")) as any).lead_key;
      store.rejectLead(rejected, "operator-api", "Reviewed and rejected");
      store.createAutoQueueRule({ schemaVersion: 1, leadKind: "vpm_listing",
        origin: "https://reviewed.example.org", pathScope: "/", minDelayMs: 1000,
        expiresAt: "2026-10-01T00:00:00.000Z", reviewReference: "docs/SOURCE_ACCESS_REVIEW.md#vpm",
        reason: "Reviewed this host for VPM listings" }, "operator-api");
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(1);
      now += 24 * 60 * 60 * 1000 + 1;
      discover("rediscovery-after-rule");
      expect((store.db.prepare("SELECT count(*) AS n FROM crawl_jobs").get() as { n: number }).n).toBe(2);
      expect((store.db.prepare("SELECT status FROM source_leads WHERE lead_key=?")
        .get(rejected) as { status: string }).status).toBe("rejected");
      expect((store.db.prepare("SELECT count(*) AS n FROM source_leads WHERE status='approved'")
        .get() as { n: number }).n).toBe(1);
    } finally { store.close(); }
  });

  test("GET /v1/operator/takedowns lists recorded creator opt-outs and supports requesterType filter and pagination", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      // 1. Submit takedowns
      const t1 = store.submitDelistRequest({
        targetUrl: "https://booth.pm/en/items/111",
        reason: "Creator bio opt-out",
        requesterType: "unauthenticated_creator",
        proofKind: "storefront_bio_token",
        proofValue: "proof-bio-111"
      });
      const t2 = store.submitDelistRequest({
        canonicalId: "canonical-pkg-222",
        reason: "User requested removal",
        requesterType: "user",
        requesterId: "user-dan"
      });
      const t3 = store.submitDelistRequest({
        targetUrl: "https://example.org/bad-pkg",
        reason: "Malware removal",
        requesterType: "admin_operator"
      });

      // 2. Query all takedowns
      const resAll = await handleOperatorRequest(operatorRequest("/v1/operator/takedowns"), store, operatorToken);
      expect(resAll.status).toBe(200);
      const dataAll = await resAll.json() as any;
      expect(dataAll.schemaVersion).toBe(1);
      expect(dataAll.records.length).toBe(3);
      // Verify reviewStatus values
      const rec1 = dataAll.records.find((r: any) => r.takedownId === t1.takedownId);
      const rec2 = dataAll.records.find((r: any) => r.takedownId === t2.takedownId);
      const rec3 = dataAll.records.find((r: any) => r.takedownId === t3.takedownId);
      expect(rec1.reviewStatus).toBe("pending");
      expect(rec2.reviewStatus).toBe("accepted");
      expect(rec3.reviewStatus).toBe("accepted");

      // Validate response against schema
      expect(() => TakedownListResponseSchema.parse(dataAll)).not.toThrow();

      // 3. Filter by requesterType
      const resFiltered = await handleOperatorRequest(
        operatorRequest("/v1/operator/takedowns?requesterType=unauthenticated_creator"),
        store,
        operatorToken
      );
      expect(resFiltered.status).toBe(200);
      const dataFiltered = await resFiltered.json() as any;
      expect(dataFiltered.records.length).toBe(1);
      expect(dataFiltered.records[0].takedownId).toBe(t1.takedownId);

      // 4. Test pagination
      const resPage1 = await handleOperatorRequest(
        operatorRequest("/v1/operator/takedowns?limit=2"),
        store,
        operatorToken
      );
      expect(resPage1.status).toBe(200);
      const dataPage1 = await resPage1.json() as any;
      expect(dataPage1.records.length).toBe(2);
      expect(dataPage1.nextCursor).toBeTruthy();

      const resPage2 = await handleOperatorRequest(
        operatorRequest(`/v1/operator/takedowns?limit=2&cursor=${dataPage1.nextCursor}`),
        store,
        operatorToken
      );
      expect(resPage2.status).toBe(200);
      const dataPage2 = await resPage2.json() as any;
      expect(dataPage2.records.length).toBe(1);
      expect(dataPage2.nextCursor).toBeNull();

      // 5. Invalid query parameters
      expect((await handleOperatorRequest(
        operatorRequest("/v1/operator/takedowns?requesterType=invalid_type"),
        store,
        operatorToken
      )).status).toBe(400);

      expect((await handleOperatorRequest(
        operatorRequest("/v1/operator/takedowns?limit=0"),
        store,
        operatorToken
      )).status).toBe(400);

      expect((await handleOperatorRequest(
        operatorRequest("/v1/operator/takedowns?cursor=invalid_base64!"),
        store,
        operatorToken
      )).status).toBe(400);
    } finally {
      store.close();
    }
  });

  test("POST /v1/operator/takedowns/{id}/verify allows operator to accept or reject creator proof and restore lifecycle on rejection", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      // 1. Seed a canonical package and storefront front
      const canonicalId = "pkg-verification-target";
      const storefrontUrl = "https://booth.pm/en/items/888888";
      store.db.prepare(`
        INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
        VALUES (?, 'tools', 'editor_tool', 'active', 'Target Package', 'com.target.pkg', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')
      `).run(canonicalId);
      // 2. Creator submits delist request
      const delist = store.submitDelistRequest({
        canonicalId,
        targetUrl: storefrontUrl,
        reason: "Suspected copyright infringement",
        requesterType: "unauthenticated_creator",
        proofKind: "storefront_bio_token",
        proofValue: "claim-bio-123"
      });

      // Package lifecycle is currently delisted and URL is suppressed
      const pkgRowDelisted = store.db.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = ?").get(canonicalId) as any;
      expect(pkgRowDelisted.lifecycle).toBe("delisted");
      const suppressedRow = store.db.prepare("SELECT reason FROM suppressed_urls WHERE url = ?").get(storefrontUrl) as any;
      expect(suppressedRow).toBeTruthy();

      // 3. Validation errors
      // Missing token
      const reqNoAuth = operatorRequest(`/v1/operator/takedowns/${delist.takedownId}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "rejected"
      }, "");
      expect((await handleOperatorRequest(reqNoAuth, store, operatorToken)).status).toBe(401);

      // Invalid verdict
      const reqBadBody = operatorRequest(`/v1/operator/takedowns/${delist.takedownId}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "maybe"
      });
      expect((await handleOperatorRequest(reqBadBody, store, operatorToken)).status).toBe(400);

      // Nonexistent takedown ID
      const reqNotFound = operatorRequest(`/v1/operator/takedowns/${crypto.randomUUID()}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "rejected"
      });
      expect((await handleOperatorRequest(reqNotFound, store, operatorToken)).status).toBe(404);

      // 4. Operator rejects unauthenticated takedown (false claim)
      const reqReject = operatorRequest(`/v1/operator/takedowns/${delist.takedownId}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "rejected",
        notes: "Bio token did not match storefront profile"
      });
      const resReject = await handleOperatorRequest(reqReject, store, operatorToken);
      expect(resReject.status).toBe(200);
      const dataReject = await resReject.json() as any;
      expect(dataReject.status).toBe("rejected");
      expect(dataReject.takedownId).toBe(delist.takedownId);
      expect(() => VerifyTakedownResponseSchema.parse(dataReject)).not.toThrow();

      // Verification: review_status and review_notes updated in DB
      const takedownRow = store.db.prepare("SELECT review_status, review_notes FROM creator_opt_outs WHERE takedown_id = ?")
        .get(delist.takedownId) as any;
      expect(takedownRow.review_status).toBe("rejected");
      expect(takedownRow.review_notes).toBe("Bio token did not match storefront profile");

      // Verification: package lifecycle restored to 'active'
      const pkgRowRestored = store.db.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = ?").get(canonicalId) as any;
      expect(pkgRowRestored.lifecycle).toBe("active");

      // Verification: URL unsuppressed
      const suppressedAfter = store.db.prepare("SELECT reason FROM suppressed_urls WHERE url = ?").get(storefrontUrl);
      expect(suppressedAfter).toBeNull();

      // 5. Operator accepts a legitimate takedown
      const canonicalId2 = "pkg-legit-target";
      store.db.prepare(`
        INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
        VALUES (?, 'tools', 'editor_tool', 'active', 'Legit Target', 'com.legit.pkg', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')
      `).run(canonicalId2);

      const delist2 = store.submitDelistRequest({
        canonicalId: canonicalId2,
        reason: "Valid creator withdrawal",
        requesterType: "unauthenticated_creator",
        proofKind: "dns_txt",
        proofValue: "valid-txt-record"
      });

      const reqAccept = operatorRequest(`/v1/operator/takedowns/${delist2.takedownId}/verify`, "POST", {
        schemaVersion: 1,
        verdict: "accepted",
        notes: "DNS TXT record verified"
      });
      const resAccept = await handleOperatorRequest(reqAccept, store, operatorToken);
      expect(resAccept.status).toBe(200);
      const dataAccept = await resAccept.json() as any;
      expect(dataAccept.status).toBe("accepted");

      const takedownRow2 = store.db.prepare("SELECT review_status, review_notes FROM creator_opt_outs WHERE takedown_id = ?")
        .get(delist2.takedownId) as any;
      expect(takedownRow2.review_status).toBe("accepted");
      expect(takedownRow2.review_notes).toBe("DNS TXT record verified");

      // Package remains delisted
      const pkgRow2 = store.db.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = ?").get(canonicalId2) as any;
      expect(pkgRow2.lifecycle).toBe("delisted");
    } finally {
      store.close();
    }
  });
});
