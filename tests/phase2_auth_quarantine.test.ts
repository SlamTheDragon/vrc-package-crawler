import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { CrawlerDB } from "../src/db.ts";
import { startServer } from "../src/server/index.ts";
import { processPendingReports } from "../src/crawler/steering.ts";
import path from "path";
import fs from "fs";

describe("Phase 2 - Task 2.2: Enforce Mandatory API_SECRET_TOKEN Auth & Quarantine Delisting Reports", () => {
  const TEST_SECRET = "test_secret_token_at_least_256_bits_for_security_testing";
  const fixturePath = path.resolve(__dirname, `../dist/test_auth_${Date.now()}.db`);
  let testDb: CrawlerDB;
  let serverInstance: any;
  let baseUrl: string;

  beforeAll(async () => {
    testDb = new CrawlerDB(fixturePath);

    // Seed a canonical package
    testDb.rawDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, category, subcategory, type,
        description, primary_platform, platforms_json, url, vcc_url,
        price_currency, price_amount, is_vcc, tags_json, dependencies_json,
        source_ids_json, origin_created_at, origin_updated_at, created_at_confidence,
        lifecycle, lifecycle_updated_at, created_at, updated_at
      ) VALUES (
        'pkg-test-1', 'test-tool', 'Test Tool', 'TestAuthor', 'tool', 'general', 'tool',
        'A test tool description', 'github', '["github"]', 'https://github.com/test/tool', NULL,
        'USD', 0, 0, '["test"]', '{}',
        '["github:test/tool"]', NULL, NULL, 'unknown',
        'published', NULL, datetime('now'), datetime('now')
      );
    `);

    // Launch server on random port with isolated test DB and test secret
    const port = 19000 + Math.floor(Math.random() * 1000);
    serverInstance = startServer({
      port,
      host: "127.0.0.1",
      apiToken: TEST_SECRET,
      db: testDb
    });
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    try { serverInstance?.stop(); } catch (_) {}
    try { testDb?.close(); } catch (_) {}
    if (fs.existsSync(fixturePath)) {
      try { fs.unlinkSync(fixturePath); } catch (_) {}
    }
  });

  it("rejects unauthenticated POST /v1/reports with 401 Unauthorized", async () => {
    const resp = await fetch(`${baseUrl}/v1/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportId: "rep-anon-1",
        targetPackageId: "test-tool",
        targetPackageName: "Test Tool",
        submittedAt: new Date().toISOString(),
        branch: "irrelevance",
        branchPayload: { irrelevanceReason: "malicious_or_scam" }
      })
    });

    expect(resp.status).toBe(401);
    const body = await resp.json() as any;
    expect(body.error).toContain("Administrative bearer token required");
  });

  it("rejects invalid bearer token with 401 Unauthorized", async () => {
    const resp = await fetch(`${baseUrl}/v1/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer wrong_secret_token"
      },
      body: JSON.stringify({
        reportId: "rep-anon-2",
        targetPackageId: "test-tool",
        targetPackageName: "Test Tool",
        submittedAt: new Date().toISOString(),
        branch: "irrelevance",
        branchPayload: { irrelevanceReason: "malicious_or_scam" }
      })
    });

    expect(resp.status).toBe(401);
    const body = await resp.json() as any;
    expect(body.error).toContain("Invalid administrative bearer token");
  });

  it("accepts authenticated report submission with valid Bearer token", async () => {
    const resp = await fetch(`${baseUrl}/v1/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${TEST_SECRET}`
      },
      body: JSON.stringify({
        reportId: "rep-auth-1",
        targetPackageId: "test-tool",
        targetPackageName: "Test Tool",
        submittedAt: new Date().toISOString(),
        branch: "irrelevance",
        branchPayload: {
          irrelevanceReason: "malicious_or_scam",
          negativeTokens: ["scam-token"]
        }
      })
    });

    expect(resp.status).toBe(201);
    const body = await resp.json() as any;
    expect(body.status).toBe("pending");
    expect(body.reportId).toBe("rep-auth-1");
  });

  it("routes irrelevance report into 'needs_review' quarantine buffer instead of executing immediate delisting", async () => {
    // Process the pending report that was submitted
    const res = await processPendingReports(testDb);
    expect(res.processed).toBe(1);

    // Verify report record in user_reports has status 'needs_review'
    const reportRow = testDb.rawDb.prepare("SELECT status FROM user_reports WHERE report_id = 'rep-auth-1';").get() as any;
    expect(reportRow?.status).toBe("needs_review");

    // Verify package in canonical_packages is marked 'needs_review' rather than 'delisted'
    const pkgRow = testDb.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = 'test-tool';").get() as any;
    expect(pkgRow?.lifecycle).toBe("needs_review");
    expect(pkgRow?.lifecycle).not.toBe("delisted");
  });
});
