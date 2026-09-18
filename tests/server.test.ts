import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import crypto from "crypto";
import { startServer } from "../src/server/index.ts";
import { db } from "../src/db.ts";

describe("Headless API Server (Schemas 1, 2, 4 & Gateway Controls)", () => {
  const testPort = 8091;
  const baseUrl = `http://127.0.0.1:${testPort}`;
  let serverInstance: any;

  beforeAll(() => {
    serverInstance = startServer({ port: testPort, host: "127.0.0.1" });
  });

  afterAll(() => {
    if (serverInstance) {
      serverInstance.stop(true);
    }
    db.rawDb.run("DELETE FROM user_reports WHERE target_package_id = 'com-vrchat-sample-cat' OR target_package_id = 'test-pkg' OR report_id LIKE 'rep_cat_%' OR report_id LIKE 'rep_rate_%';");
    db.rawDb.run("DELETE FROM curator_overrides WHERE canonical_id = 'com-vrchat-sample-cat' OR canonical_id = 'test-pkg';");
  });

  it("handles GET /v1/health with metrics and uptime", async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe("healthy");
    expect(body.version).toBe("2.0.0");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.metrics).toBeDefined();
  });

  it("handles CORS OPTIONS preflight correctly", async () => {
    const res = await fetch(`${baseUrl}/v1/reports`, {
      method: "OPTIONS",
      headers: { "Origin": "http://localhost:3000" }
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("ingests a valid Schema 4 categorization report", async () => {
    const report = {
      reportId: `rep_cat_${Date.now()}`,
      targetPackageId: "com-vrchat-sample-cat",
      targetPackageName: "Sample Avatar Tool",
      branch: "categorization",
      submittedAt: new Date().toISOString(),
      reporterNotes: "Belongs in Tools & Utilities",
      branchPayload: {
        suggestedClass: "Tools & Utilities",
        suggestedSubcategory: "Avatars / Setup & Optimization"
      }
    };

    const res = await fetch(`${baseUrl}/v1/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report)
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.reportId).toBe(report.reportId);
    expect(body.status).toBe("pending");

    // Clean up
    db.rawDb.run("DELETE FROM user_reports WHERE report_id = ?;", [report.reportId]);
  });

  it("rejects invalid Schema 4 report missing mandatory fields with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/v1/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true })
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("Schema 4 Validation Failed");
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  it("rejects invalid branchPayload structure with HTTP 400", async () => {
    const res = await fetch(`${baseUrl}/v1/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportId: "rep-invalid-branch",
        targetPackageId: "pkg-1",
        targetPackageName: "Pkg 1",
        branch: "categorization",
        submittedAt: new Date().toISOString(),
        branchPayload: {} // Missing suggestedClass
      })
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.details[0]).toContain("suggestedClass");
  });

  it("serves Schema 1 cursor-paginated delta stream with SHA-256 digest", async () => {
    const res = await fetch(`${baseUrl}/v1/catalog/delta?cursor=0&limit=5`);
    expect(res.status).toBe(200);

    const deltaReport = (await res.json()) as any;
    expect(deltaReport.cursor).toBe("0");
    expect(deltaReport.nextCursor).toBeDefined();
    expect(deltaReport.generatedAt).toBeDefined();
    expect(typeof deltaReport.deltaCount).toBe("number");
    expect(typeof deltaReport.sha256Digest).toBe("string");
    expect(Array.isArray(deltaReport.deltas)).toBe(true);

    // Verify SHA-256 tamper verification
    const expectedDigest = crypto.createHash("sha256").update(JSON.stringify(deltaReport.deltas)).digest("hex");
    expect(deltaReport.sha256Digest).toBe(expectedDigest);

    if (deltaReport.deltas.length > 0) {
      const item = deltaReport.deltas[0];
      expect(["ADDED", "UPDATED", "DELISTED"]).toContain(item.action);
      expect(item.canonicalId).toBeDefined();
      expect(item.timestamp).toBeDefined();
      expect(item.package).toBeDefined();
      expect(item.package.name).toBeDefined();
      expect(item.package.url).toBeDefined();
    }
  });

  it("serves Schema 2 VCC/ALCOM community repository manifest (index.json)", async () => {
    const res = await fetch(`${baseUrl}/v1/vpm/index.json`);
    expect(res.status).toBe(200);

    const manifest = (await res.json()) as any;
    expect(manifest.name).toBe("VRChat Community Asset Catalog");
    expect(manifest.id).toBe("net.vrc-catalog.community");
    expect(manifest.url).toBeDefined();
    expect(manifest.author).toBeDefined();
    expect(manifest.packages).toBeDefined();
    expect(typeof manifest.packages).toBe("object");

    const pkgKeys = Object.keys(manifest.packages);
    if (pkgKeys.length > 0) {
      const firstPkg = manifest.packages[pkgKeys[0]];
      expect(firstPkg.versions).toBeDefined();
      const versionKeys = Object.keys(firstPkg.versions);
      expect(versionKeys.length).toBeGreaterThan(0);
      const vData = firstPkg.versions[versionKeys[0]];
      expect(vData.name).toBeDefined();
      expect(vData.version).toBeDefined();
      expect(vData.displayName).toBeDefined();
      expect(vData.url).toBeDefined();
    }
  });

  it("serves low-resolution WebP images via GET /v1/media/:id", async () => {
    const testMediaId = `media_test_${Date.now()}`;
    const testBuffer = Buffer.from("fake-webp-bytes");
    db.run(`
      INSERT OR REPLACE INTO media_cache (
        id, source_url, webp_data, webp_size_bytes, content_type, last_processed_at
      ) VALUES (?, 'https://test.local/image.png', ?, ?, 'image/webp', datetime('now'));
    `, [testMediaId, testBuffer, testBuffer.length]);

    const res = await fetch(`${baseUrl}/v1/media/${testMediaId}.webp`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/webp");
    const data = await res.arrayBuffer();
    expect(data.byteLength).toBe(testBuffer.length);

    // Clean up
    db.run("DELETE FROM media_cache WHERE id = ?;", [testMediaId]);
  });

  it("enforces sliding-window rate limit of 10 reports/min per client fingerprint", async () => {
    const fingerprint = `test-rate-limit-${Date.now()}`;
    const makeReq = () => fetch(`${baseUrl}/v1/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Fingerprint": fingerprint
      },
      body: JSON.stringify({
        reportId: `rep_rate_${Date.now()}_${Math.random()}`,
        targetPackageId: "test-pkg",
        targetPackageName: "Test Pkg",
        branch: "listing",
        submittedAt: new Date().toISOString(),
        branchPayload: { nameOverride: "Valid Name" }
      })
    });

    // 10 requests should succeed (status 201)
    for (let i = 0; i < 10; i++) {
      const r = await makeReq();
      expect(r.status).toBe(201);
    }

    // 11th request must receive HTTP 429 Too Many Requests
    const throttled = await makeReq();
    expect(throttled.status).toBe(429);
    const throttledJson = (await throttled.json()) as any;
    expect(throttledJson.error).toContain("Rate limit");
  });
});
