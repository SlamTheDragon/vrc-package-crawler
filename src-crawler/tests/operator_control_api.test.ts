import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../src/worker/local_sqlite.ts";
import { handleOperatorRequest } from "../src/worker/operator_handler.ts";
import { OPERATOR_API_JSON_SCHEMAS } from "../src/shared/operator_protocol.ts";
import { approveFixtureSource, seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";

const operatorToken = "a".repeat(64);

function operatorRequest(path: string, method = "GET", body?: unknown, token = operatorToken): Request {
  return new Request(`http://localhost${path}`, { method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

describe("separate operator control API", () => {
  test("exports the operator request and response contracts as JSON Schema", () => {
    expect(OPERATOR_API_JSON_SCHEMAS.approveLead.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.rejectLead.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.leadListResponse.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.leadActionResponse.oneOf?.length).toBe(2);
    expect(OPERATOR_API_JSON_SCHEMAS.createAutoQueueRule.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.disableAutoQueueRule.type).toBe("object");
    expect(OPERATOR_API_JSON_SCHEMAS.autoQueueRuleResponse.type).toBe("object");
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
      const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
        fetch: (request) => handleOperatorRequest(request, store, operatorToken) });
      try {
        const path = `/v1/operator/leads?status=pending_review&limit=60&cursor=${firstCursor}`;
        const inProcess = await handleOperatorRequest(operatorRequest(path), store, operatorToken);
        const overHttp = await fetch(`http://127.0.0.1:${server.port}${path}`, operatorRequest(path));
        expect(overHttp.status).toBe(inProcess.status);
        expect(await overHttp.json()).toEqual(await inProcess.json());
      } finally { server.stop(true); }
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

  test("malformed operator payloads fail identically in-process and over loopback HTTP", async () => {
    const store = new LocalCoordinatorStore();
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch: (request) => handleOperatorRequest(request, store, operatorToken) });
    try {
      const path = `/v1/operator/leads/${"0".repeat(64)}/approve`;
      const invalid = { schemaVersion: 2, reason: "No source review" };
      const inProcess = await handleOperatorRequest(operatorRequest(path, "POST", invalid), store, operatorToken);
      const overHttp = await fetch(`http://127.0.0.1:${server.port}${path}`, operatorRequest(path, "POST", invalid));
      expect(overHttp.status).toBe(inProcess.status);
      expect(await overHttp.json()).toEqual(await inProcess.json());
    } finally { server.stop(true); store.close(); }
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
});
