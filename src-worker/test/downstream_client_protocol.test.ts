import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { getTestOutputDir } from "./helpers/test_directory.ts";
import { LocalCoordinatorStore } from "./support/local_sqlite.js";
import { handleDownstreamRequest } from "../src/api/downstream_handler.ts";
import { DOWNSTREAM_PROTOCOL_VERSION } from "vrc-packages-api";
import { VRCPackageClient } from "vrc-packages-api";
import { type ReportSubmissionRequest } from "vrc-packages-api";

describe("Downstream Client Protocol & Demand Feedback Signals", () => {
  test("actual report HTTP receipts satisfy the SDK for demand, issue and removal", async () => {
    const app = store.registerApp({ schemaVersion: 1, appName: "Receipt fixture" });
    const statuses: number[] = [];
    const client = new VRCPackageClient({ baseUrl: "https://worker.example", appToken: app.appToken,
      fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await handleDownstreamRequest(new Request(input, init), store);
        statuses.push(response.status);
        expect(response.headers.get("cache-control")).toBe("no-store");
        return response;
      }, { preconnect() {} }) });
    const reports: ReportSubmissionRequest[] = [
      { schemaVersion: 1, reportType: "demand_signal", signalKind: "search_miss", query: "receipt fixture", zeroHits: true, reason: "Expected tool missing" },
      { schemaVersion: 1, reportType: "issue_report", reportKind: "broken_link", targetUrl: "https://receipt.example/product",
        reason: " Product link returns 404 ", metadata: { reason: "Caller metadata must not replace the report reason", source: "fixture" } },
      { schemaVersion: 1, reportType: "removal_request", canonicalId: "receipt-target", reason: "Incorrect attribution" }
    ];
    for (const report of reports) {
      const receipt = await client.reports.submit(report);
      expect(Object.keys(receipt).sort()).toEqual(["schemaVersion", "status", "reportId", "recordedAt"].sort());
      const table = report.reportType === "removal_request" ? "catalog_reports" : "downstream_demand_signals";
      const column = report.reportType === "removal_request" ? "report_id" : "signal_id";
      expect((store.db.prepare(`SELECT app_id FROM ${table} WHERE ${column}=?`).get(receipt.reportId) as { app_id: string }).app_id).toBe(app.appId);
      if (report.reportType !== "removal_request") {
        const row = store.db.prepare("SELECT metadata_json FROM downstream_demand_signals WHERE signal_id=?")
          .get(receipt.reportId) as { metadata_json: string };
        const metadata = JSON.parse(row.metadata_json);
        expect(metadata.reason).toBe(report.reason!.trim());
        expect(metadata.reportType).toBe(report.reportType);
        if (report.metadata) expect(metadata.source).toBe("fixture");
      }
    }
    expect(statuses).toEqual([200, 200, 202]);
  });
  test("app registration rejects anonymous callers and records authenticated ownership", async () => {
    const input = { schemaVersion: 1, appName: "Owned app" };
    const anonymous = new Request("https://worker.example/v1/app/register", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    expect((await handleDownstreamRequest(anonymous, store)).status).toBe(401);
    const user = store.issueUserToken("app-owner");
    const response = await handleDownstreamRequest(request("/v1/app/register", "POST", input, user.token), store);
    expect(response.status).toBe(201);
    const app = await response.json() as { appId: string };
    const owner = store.db.prepare("SELECT user_id FROM user_app_ownership WHERE app_id=?").get(app.appId) as any;
    expect(owner.user_id).toBe(user.userId);
    const activeUser = store.issueUserToken("rollback-owner");
    store.db.exec("CREATE TRIGGER reject_app_owner BEFORE INSERT ON user_app_ownership BEGIN SELECT RAISE(ABORT,'Owner write rejected'); END;");
    expect(() => store.registerApp(input, activeUser.userId)).toThrow("Owner write rejected");
    store.db.exec("DROP TRIGGER reject_app_owner;");
    store.db.prepare("UPDATE registered_users SET revoked_at=? WHERE user_id=?").run(new Date().toISOString(), user.userId);
    expect(() => store.registerApp(input, user.userId)).toThrow();
    expect((store.db.prepare("SELECT COUNT(*) AS count FROM registered_apps").get() as any).count).toBe(1);
    const operatorToken = "a".repeat(64);
    expect((await handleDownstreamRequest(request("/v1/app/register", "POST", input, "b".repeat(64)), store, operatorToken)).status).toBe(401);
    expect((await handleDownstreamRequest(request("/v1/app/register", "POST", input, operatorToken), store, operatorToken)).status).toBe(201);
    expect((store.db.prepare("SELECT COUNT(*) AS count FROM user_app_ownership").get() as any).count).toBe(1);
  });
  test("singular report records removal for review without catalog or demand changes", async () => {
    const registered = store.registerApp({ schemaVersion: 1, appName: "Removal test" });
    const payload = { schemaVersion: 1, reportType: "removal_request", canonicalId: "target-1", reason: "Incorrect attribution" };
    expect((await handleDownstreamRequest(request("/v1/app/report", "POST", payload), store)).status).toBe(401);
    expect((await handleDownstreamRequest(request("/v1/app/report", "POST", { ...payload, reason: "" }, registered.appToken), store)).status).toBe(400);
    expect((await handleDownstreamRequest(request("/v1/app/report", "POST", { schemaVersion: 1, reportType: "removal_request", reason: "No target" }, registered.appToken), store)).status).toBe(400);
    const response = await handleDownstreamRequest(request("/v1/app/report", "POST", payload, registered.appToken), store);
    expect(response.status).toBe(202);
    const body = await response.json() as { reportId: string };
    const row = store.db.prepare("SELECT app_id, review_status, payload_json FROM catalog_reports WHERE report_id=?").get(body.reportId) as any;
    expect(row.app_id).toBe(registered.appId);
    expect(row.review_status).toBe("pending");
    expect(JSON.parse(row.payload_json)).toEqual(payload);
    for (const table of ["downstream_demand_signals", "creator_opt_outs", "suppressed_urls", "canonical_packages", "crawl_jobs"]) {
      expect((store.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as any).count).toBe(0);
    }
    expect((await handleDownstreamRequest(request("/v1/app/reports", "POST", payload, registered.appToken), store)).status).toBe(404);
  });
  let tempDir: string;
  let dbPath: string;
  let store: LocalCoordinatorStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(getTestOutputDir(), "vrcp-downstream-test-"));
    expect(dirname(tempDir)).toBe(getTestOutputDir());
    dbPath = join(tempDir, "coordinator.db");
    store = new LocalCoordinatorStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const request = (path: string, method: string, body?: unknown, token?: string): Request => {
    if (path === "/v1/app/register" && token === undefined) token = store.issueUserToken("registration-fixture").token;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return new Request(`http://127.0.0.1:8787${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  };

  test("POST /v1/app/register creates downstream application with vrcp_app_ token", async () => {
    const res = await handleDownstreamRequest(
      request("/v1/app/register", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        appName: "ALCOM Desktop Manager",
        contactEmail: "alcom@example.org",
        description: "Package discovery client for VRChat"
      }),
      store
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.schemaVersion).toBe(1);
    expect(data.appName).toBe("ALCOM Desktop Manager");
    expect(data.appId).toBeDefined();
    expect(data.appToken).toMatch(/^vrcp_app_[a-f0-9]{64}$/);
    expect(data.permissions).toContain("catalog:search");
    expect(data.permissions).toContain("demand:feedback");

    // Legacy route must return 404
    const legacyRes = await handleDownstreamRequest(
      request("/v1/apps/register", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        appName: "Legacy App"
      }),
      store
    );
    expect(legacyRes.status).toBe(404);
  });

  test("POST /v1/app/report requires authentication and ingests demand signals", async () => {
    // 1. Register app
    const regRes = await handleDownstreamRequest(
      request("/v1/app/register", "POST", {
        schemaVersion: 1,
        appName: "VCC Mobile Companion"
      }),
      store
    );
    const { appToken } = await regRes.json() as { appToken: string };

    // 2. Reject unauthenticated feedback
    const unauthRes = await handleDownstreamRequest(
      request("/v1/app/report", "POST", {
        schemaVersion: 1,
        signalType: "search_miss",
        query: "physbone optimizer"
      }),
      store
    );
    expect(unauthRes.status).toBe(401);

    // 3. Reject invalid token
    const badTokenRes = await handleDownstreamRequest(
      request("/v1/app/report", "POST", {
        schemaVersion: 1,
        signalType: "search_miss",
        query: "physbone optimizer"
      }, "vrcp_app_0000000000000000000000000000000000000000000000000000000000000000"),
      store
    );
    expect(badTokenRes.status).toBe(401);

    // 4. Accept valid search miss feedback signal
    const feedbackRes = await handleDownstreamRequest(
      request("/v1/app/report", "POST", {
        schemaVersion: 1,
        signalType: "search_miss",
        query: "novel shader generator",
        zeroHits: true,
        requestedPlatform: "booth",
        category: "shader"
      }, appToken),
      store
    );
    expect(feedbackRes.status).toBe(200);
    const feedbackData = await feedbackRes.json() as any;
    expect(feedbackData.schemaVersion).toBe(1);
    expect(feedbackData.status).toBe("accepted");
    expect(feedbackData.reportId).toBeDefined();
    expect(feedbackData.signalId).toBeUndefined();
    expect(feedbackData.recordedAt).toBeDefined();

    // 5. Accept refresh demand signal for specific target
    const refreshRes = await handleDownstreamRequest(
      request("/v1/app/report", "POST", {
        schemaVersion: 1,
        signalType: "refresh_demand",
        requestedPlatform: "github",
        targetUrl: "https://github.com/example-author/stale-tool"
      }, appToken),
      store
    );
    expect(refreshRes.status).toBe(200);

    // Legacy route must return 404
    const legacyRes = await handleDownstreamRequest(
      request("/v1/apps/feedback", "POST", {
        schemaVersion: 1,
        signalType: "search_miss",
        query: "physbone optimizer"
      }, appToken),
      store
    );
    expect(legacyRes.status).toBe(404);
  });

  test("removed random sampling routes return 404", async () => {
    for (const path of ["/v1/app/index/random", "/v1/app/index/random?limit=2", "/v1/catalog/random"]) {
      const response = await handleDownstreamRequest(request(path, "GET"), store);
      expect(response.status).toBe(404);
    }
  });

  test("POST /v1/app/index/search performs text search and keyset pagination", async () => {
    // Register app
    const reg = await handleDownstreamRequest(
      request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Search Tester" }),
      store
    );
    const { appToken } = await reg.json() as { appToken: string };

    const t1 = new Date(Date.now() - 3000).toISOString();
    const t2 = new Date(Date.now() - 2000).toISOString();
    const t3 = new Date(Date.now() - 1000).toISOString();

    store.db.exec(`
      INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
      VALUES
        ('pkg-1', 'tools', 'editor_tool', 'active', 'Super VRChat Tool', 'com.vrc.tool', '${t1}', '${t1}'),
        ('pkg-2', 'tools', 'avatar_tool', 'active', 'Avatar Optimizer', 'com.vrc.opt', '${t2}', '${t2}'),
        ('pkg-3', 'assets', 'shader', 'active', 'Toon Water Shader', NULL, '${t3}', '${t3}');
    `);

    // Search query
    const searchRes = await handleDownstreamRequest(
      request("/v1/app/index/search", "POST", {
        schemaVersion: 1,
        query: "Optimizer",
        queryOrigin: "user_authored"
      }, appToken),
      store
    );
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json() as any;
    expect(searchBody.items.length).toBe(1);
    expect(searchBody.items[0].displayName).toBe("Avatar Optimizer");
    expect(searchBody.totalEstimated).toBe(1);

    // Search with limit and pagination
    const pageRes = await handleDownstreamRequest(
      request("/v1/app/index/search", "POST", {
        schemaVersion: 1,
        umbrella: "tools",
        limit: 1,
        queryOrigin: "user_authored"
      }, appToken),
      store
    );
    expect(pageRes.status).toBe(200);
    const pageBody = await pageRes.json() as any;
    expect(pageBody.items.length).toBe(1);
    expect(pageBody.nextCursor).toBeDefined();
    expect(pageBody.totalEstimated).toBe(2);

    // Legacy route must return 404
    const legacySearch = await handleDownstreamRequest(
      request("/v1/catalog/search", "POST", {
        schemaVersion: 1,
        query: "Optimizer"
      }, appToken),
      store
    );
    expect(legacySearch.status).toBe(404);
  });

  test("delegated creator attestation intake accepts valid claims and enforces replay protection", async () => {
    const reg = await handleDownstreamRequest(
      request("/v1/app/register", "POST", {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        appName: "VRChat Creator Companion",
        contactEmail: "creator@companion.test"
      }),
      store
    );
    expect(reg.status).toBe(201);
    const { appId, appToken } = await reg.json() as { appId: string; appToken: string };

    const nowSec = Math.floor(Date.now() / 1000);
    const validAttestation = {
      appId,
      action: "creator_ownership_claim" as const,
      frontUrl: "https://shop.booth.pm/items/999888",
      creatorId: "creator_booth_123",
      challengeToken: "chal_valid_tok_123456",
      expiresAt: nowSec + 3600,
      nonce: "nonce_unique_123456"
    };
    const validSignature = "sig_ed25519_valid_signature_123";

    // 1. Rejects unauthenticated requests
    const anonRes = await handleDownstreamRequest(
      request("/v1/app/claims/intake", "POST", {
        schemaVersion: 1,
        attestation: validAttestation,
        signature: validSignature
      }),
      store
    );
    expect(anonRes.status).toBe(401);

    // 2. Rejects application lacking 'claims:delegate' permission (403)
    const unauthorizedAppRes = await handleDownstreamRequest(
      request("/v1/app/claims/intake", "POST", {
        schemaVersion: 1,
        attestation: validAttestation,
        signature: validSignature
      }, appToken),
      store
    );
    expect(unauthorizedAppRes.status).toBe(403);
    const unauthData = await unauthorizedAppRes.json() as any;
    expect(unauthData.error).toBe("Application is not authorized for delegated creator claims");

    // Grant delegation authority to the application
    store.setAppDelegation(appId, true, "operator");

    // 3. Rejects attestation appId mismatch
    const mismatchRes = await handleDownstreamRequest(
      request("/v1/app/claims/intake", "POST", {
        schemaVersion: 1,
        attestation: {
          ...validAttestation,
          appId: "00000000-0000-4000-8000-000000000000"
        },
        signature: validSignature
      }, appToken),
      store
    );
    expect(mismatchRes.status).toBe(403);

    // 3. Rejects expired attestation (400)
    const expiredRes = await handleDownstreamRequest(
      request("/v1/app/claims/intake", "POST", {
        schemaVersion: 1,
        attestation: {
          ...validAttestation,
          nonce: "nonce_expired_123456",
          expiresAt: nowSec - 10
        },
        signature: validSignature
      }, appToken),
      store
    );
    expect(expiredRes.status).toBe(400);

    // 4. Accepts valid claim intake (202)
    const acceptRes = await handleDownstreamRequest(
      request("/v1/app/claims/intake", "POST", {
        schemaVersion: 1,
        attestation: validAttestation,
        signature: validSignature,
        reason: "Authoritative storefront claim",
        contactEmail: "creator@booth.test"
      }, appToken),
      store
    );
    expect(acceptRes.status).toBe(202);
    const acceptData = await acceptRes.json() as any;
    expect(acceptData.schemaVersion).toBe(1);
    expect(acceptData.status).toBe("accepted");
    expect(acceptData.claimId).toBeDefined();
    expect(acceptData.reviewStatus).toBe("pending");
    expect(acceptData.recordedAt).toBeDefined();

    // Verify row in DB
    const claimRow = store.db.prepare("SELECT * FROM delegated_creator_claims WHERE claim_id = ?")
      .get(acceptData.claimId) as any;
    expect(claimRow.app_id).toBe(appId);
    expect(claimRow.action).toBe("creator_ownership_claim");
    expect(claimRow.front_url).toBe("https://shop.booth.pm/items/999888");
    expect(claimRow.creator_id).toBe("creator_booth_123");
    expect(claimRow.challenge_token).toBe("chal_valid_tok_123456");
    expect(claimRow.expires_at).toBe(validAttestation.expiresAt);
    expect(claimRow.nonce).toBe("nonce_unique_123456");
    expect(claimRow.signature).toBe(validSignature);
    expect(claimRow.review_status).toBe("pending");
    expect(claimRow.reason).toBe("Authoritative storefront claim");
    expect(claimRow.contact_email).toBe("creator@booth.test");

    // Zero crawl egress invariant: no crawl jobs, origin leases, or suppressed URLs queued
    expect((store.db.prepare("SELECT COUNT(*) AS c FROM crawl_jobs").get() as any).c).toBe(0);
    expect((store.db.prepare("SELECT COUNT(*) AS c FROM suppressed_urls").get() as any).c).toBe(0);

    // 5. Exact duplicate replay returns same receipt idempotently (202)
    const duplicateRes = await handleDownstreamRequest(
      request("/v1/app/claims/intake", "POST", {
        schemaVersion: 1,
        attestation: validAttestation,
        signature: validSignature,
        reason: "Authoritative storefront claim",
        contactEmail: "creator@booth.test"
      }, appToken),
      store
    );
    expect(duplicateRes.status).toBe(202);
    const duplicateData = await duplicateRes.json() as any;
    expect(duplicateData.claimId).toBe(acceptData.claimId);
    expect(duplicateData.recordedAt).toBe(acceptData.recordedAt);

    // 6. Replay attack with same nonce but altered payload/signature is rejected with 409 conflict
    const tamperedRes = await handleDownstreamRequest(
      request("/v1/app/claims/intake", "POST", {
        schemaVersion: 1,
        attestation: validAttestation,
        signature: "tampered_signature_xyz_123456",
        reason: "Authoritative storefront claim",
        contactEmail: "creator@booth.test"
      }, appToken),
      store
    );
    expect(tamperedRes.status).toBe(409);
    const tamperedData = await tamperedRes.json() as any;
    expect(tamperedData.code).toBe("conflict");

    // 7. Revoking delegation authority restores 403 rejection
    store.setAppDelegation(appId, false, "operator");
    const revokedRes = await handleDownstreamRequest(
      request("/v1/app/claims/intake", "POST", {
        schemaVersion: 1,
        attestation: validAttestation,
        signature: validSignature
      }, appToken),
      store
    );
    expect(revokedRes.status).toBe(403);
  });

  test("catalog search enforces age rating boundary based on user age verification", async () => {
    // 1. Seed canonical packages with ratings
    const now = new Date(store["now"]()).toISOString();
    const pkgs = [
      { id: "pkg-general-1", rating: "general", name: "Safe Tool" },
      { id: "pkg-mature-1", rating: "mature", name: "Mature Shader" },
      { id: "pkg-adult-1", rating: "adult_restricted", name: "Explicit Avatar Asset" },
      { id: "pkg-prohibited-1", rating: "prohibited", name: "Prohibited Malicious Asset" }
    ];
    for (const p of pkgs) {
      store.db.prepare(`
        INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at, content_rating)
        VALUES (?, 'tools', 'tool', 'active', ?, ?, ?, ?, ?)
      `).run(p.id, p.name, p.id, now, now, p.rating);
    }

    // 2. Register App owned by user without age verification (unverified / minor)
    const userUnverified = store.issueUserToken("unverified-user", undefined, false);
    const regRes1 = await handleDownstreamRequest(
      request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Unverified App" }, userUnverified.token),
      store
    );
    expect(regRes1.status).toBe(201);
    const app1 = await regRes1.json() as { appToken: string };

    // Search without rating filter only receives 'general' content
    const searchRes1 = await handleDownstreamRequest(
      request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app1.appToken),
      store
    );
    expect(searchRes1.status).toBe(200);
    const searchData1 = await searchRes1.json() as any;
    expect(searchData1.items.map((i: any) => i.canonicalId)).toEqual(["pkg-general-1"]);
    expect(searchData1.items[0].contentRating).toBe("general");

    // Search explicitly asking for adult content returns empty (fails closed)
    const searchResAdultUnverified = await handleDownstreamRequest(
      request("/v1/app/index/search", "POST", { schemaVersion: 1, rating: "adult_restricted" }, app1.appToken),
      store
    );
    expect(searchResAdultUnverified.status).toBe(200);
    const searchDataAdultUnverified = await searchResAdultUnverified.json() as any;
    expect(searchDataAdultUnverified.items).toHaveLength(0);

    // 3. Register App owned by user with verified age
    const userVerified = store.issueUserToken("verified-adult-user", undefined, true);
    const regRes2 = await handleDownstreamRequest(
      request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Verified App" }, userVerified.token),
      store
    );
    expect(regRes2.status).toBe(201);
    const app2 = await regRes2.json() as { appToken: string };

    // Search without rating filter receives all non-prohibited packages
    const searchRes2 = await handleDownstreamRequest(
      request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app2.appToken),
      store
    );
    expect(searchRes2.status).toBe(200);
    const searchData2 = await searchRes2.json() as any;
    const ids = searchData2.items.map((i: any) => i.canonicalId);
    expect(ids).toContain("pkg-general-1");
    expect(ids).toContain("pkg-mature-1");
    expect(ids).toContain("pkg-adult-1");
    // Invariant: Prohibited content is NEVER served to any downstream consumer
    expect(ids).not.toContain("pkg-prohibited-1");

    // Filtered search for adult_restricted
    const searchResAdultVerified = await handleDownstreamRequest(
      request("/v1/app/index/search", "POST", { schemaVersion: 1, rating: "adult_restricted" }, app2.appToken),
      store
    );
    expect(searchResAdultVerified.status).toBe(200);
    const searchDataAdultVerified = await searchResAdultVerified.json() as any;
    expect(searchDataAdultVerified.items.map((i: any) => i.canonicalId)).toEqual(["pkg-adult-1"]);

    // Attempting to query prohibited returns 0 items
    const searchResProhibited = await handleDownstreamRequest(
      request("/v1/app/index/search", "POST", { schemaVersion: 1, rating: "prohibited" }, app2.appToken),
      store
    );
    expect(searchResProhibited.status).toBe(200);
    const searchDataProhibited = await searchResProhibited.json() as any;
    expect(searchDataProhibited.items).toHaveLength(0);
  });

  test("tracks downstream application request activity and flags intensive-use candidates at threshold (R54-C38A2)", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const user = store.issueUserToken("active-developer", "dev@example.com", false);
      const regRes = await handleDownstreamRequest(
        request("/v1/app/register", "POST", { schemaVersion: 1, appName: "Intensive App" }, user.token),
        store
      );
      expect(regRes.status).toBe(201);
      const app = await regRes.json() as { appId: string; appToken: string };

      // Initial state
      let row = store.db.prepare("SELECT request_count, last_active_at, candidate_status, candidate_flags_json FROM registered_apps WHERE app_id = ?").get(app.appId) as any;
      expect(row.request_count).toBe(0);
      expect(row.last_active_at).toBeNull();
      expect(row.candidate_status).toBe("none");
      expect(JSON.parse(row.candidate_flags_json)).toEqual([]);

      // 1st request
      const searchRes1 = await handleDownstreamRequest(
        request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
        store
      );
      expect(searchRes1.status).toBe(200);

      row = store.db.prepare("SELECT request_count, last_active_at, candidate_status, candidate_flags_json FROM registered_apps WHERE app_id = ?").get(app.appId) as any;
      expect(row.request_count).toBe(1);
      expect(row.last_active_at).not.toBeNull();
      expect(row.candidate_status).toBe("none");

      // Loop up to 49 total requests
      for (let i = 2; i <= 49; i++) {
        await handleDownstreamRequest(
          request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
          store
        );
      }

      row = store.db.prepare("SELECT request_count, candidate_status FROM registered_apps WHERE app_id = ?").get(app.appId) as any;
      expect(row.request_count).toBe(49);
      expect(row.candidate_status).toBe("none");

      // 50th request triggers threshold
      await handleDownstreamRequest(
        request("/v1/app/index/search", "POST", { schemaVersion: 1 }, app.appToken),
        store
      );

      row = store.db.prepare("SELECT request_count, candidate_status, candidate_flags_json FROM registered_apps WHERE app_id = ?").get(app.appId) as any;
      expect(row.request_count).toBe(50);
      expect(row.candidate_status).toBe("review_pending");
      const flags = JSON.parse(row.candidate_flags_json);
      expect(flags).toContain("intensive_usage");
      expect(flags).toContain("high_frequency_api");
    } finally {
      store.close();
    }
  });
});
