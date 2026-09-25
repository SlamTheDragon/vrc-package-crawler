import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { CrawlerDB } from "../src/db.ts";
import { startServer, fetchWithPinnedIp, isPrivateOrReservedIp } from "../src/server/index.ts";
import { runProjection } from "../src/crawler/projection.ts";
import { processPendingReports } from "../src/crawler/steering.ts";
import { exportCatalog } from "../src/sync/exporter.ts";
import { runEdgeSync } from "../src/sync/index.ts";
import { GumroadDriver } from "../src/drivers/gumroad.ts";
import { JinxxyDriver } from "../src/drivers/jinxxy.ts";
import { ItchDriver } from "../src/drivers/itch.ts";
import { CONFIG } from "../src/config.ts";
import path from "path";
import fs from "fs";

describe("Phase 4 - Blocker Remediation & Verification Suite", () => {
  const fixturePath = path.resolve(__dirname, `../dist/test_phase4_${Date.now()}.db`);
  let testDb: CrawlerDB;
  let serverInstance: any;
  let baseUrl: string;
  const originalFetch = globalThis.fetch;

  beforeAll(async () => {
    testDb = new CrawlerDB(fixturePath);

    const port = 19300 + Math.floor(Math.random() * 500);
    serverInstance = startServer({
      port,
      host: "127.0.0.1",
      db: testDb
    });
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    try { serverInstance?.stop(); } catch (_) {}
    try { testDb?.close(); } catch (_) {}
    if (fs.existsSync(fixturePath)) {
      try { fs.unlinkSync(fixturePath); } catch (_) {}
    }
  });

  // =========================================================================
  // TASK 4.2: Air-Gapped Stateless Architecture Invariants (CANON-6)
  // =========================================================================
  describe("Task 4.2: Air-Gapped Stateless Architecture Invariants (CANON-6)", () => {
    it("architectural audit confirms zero session cookies, password hashes, or user account models exist in src/", () => {
      const srcDir = path.resolve(__dirname, "../src");
      const files: string[] = [];

      function scanDir(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.name.endsWith(".ts")) {
            files.push(fullPath);
          }
        }
      }
      scanDir(srcDir);

      expect(files.length).toBeGreaterThan(0);

      const forbiddenPatterns = [
        /\b(?:class|interface)\s+(?:User|UserAccount|UserProfile|Session)\b/,
        /\b(?:password_hash|hashed_password|salt_rounds|bcrypt|argon2)\b/i,
        /set-cookie/i,
        /\bexpress-session\b/i,
        /\b(?:user_sessions|user_accounts|auth_tokens)\b/
      ];

      for (const f of files) {
        const content = fs.readFileSync(f, "utf-8");
        for (const pat of forbiddenPatterns) {
          expect(content).not.toMatch(pat);
        }
      }
    });
  });

  // =========================================================================
  // TASK 4.3: Schema 5 Telemetry & Route Aliasing
  // =========================================================================
  describe("Task 4.3: Schema 5 Telemetry Ingestion & Route Aliasing", () => {
    it("POST /v1/telemetry rejects unauthenticated requests", async () => {
      const resp = await fetch(`${baseUrl}/v1/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: "b-1", collectedAt: new Date().toISOString(), metrics: {} })
      });
      expect(resp.status).toBe(401);
    });

    it("POST /v1/telemetry rejects PII and user tracking fields", async () => {
      const resp = await fetch(`${baseUrl}/v1/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CONFIG.apiSecretToken}`
        },
        body: JSON.stringify({
          batchId: "b-pii",
          collectedAt: new Date().toISOString(),
          metrics: {
            user_email: "tracked@user.com",
            searchQueries: [{ query: "locomotion", count: 1 }],
            packageInteractions: []
          }
        })
      });
      expect(resp.status).toBe(400);
      const data = await resp.json() as any;
      expect(data.error).toContain("Privacy Violation");
    });

    it("POST /v1/telemetry accepts valid Schema 5 payload and ingests search patterns", async () => {
      const resp = await fetch(`${baseUrl}/v1/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CONFIG.apiSecretToken}`
        },
        body: JSON.stringify({
          batchId: "b-valid",
          collectedAt: new Date().toISOString(),
          metrics: {
            searchQueries: [
              { query: "gesture manager", count: 5 },
              { query: "avatar dynamics", count: 2 }
            ],
            packageInteractions: []
          }
        })
      });
      expect(resp.status).toBe(200);
      const data = await resp.json() as any;
      expect(data.success).toBe(true);
      expect(data.processedQueries).toBe(2);

      // Verify stored in search_patterns table
      const pattern = testDb.rawDb.prepare("SELECT * FROM search_patterns WHERE query = ?").get("gesture manager") as any;
      expect(pattern).toBeDefined();
      expect(pattern.weight).toBe(5);
    });

    it("GET /v1/packages/stream route alias routes to /v1/catalog/delta", async () => {
      const respStream = await fetch(`${baseUrl}/v1/packages/stream?limit=10`);
      const respDelta = await fetch(`${baseUrl}/v1/catalog/delta?limit=10`);

      expect(respStream.status).toBe(200);
      expect(respDelta.status).toBe(200);

      const jsonStream = await respStream.json() as any;
      const jsonDelta = await respDelta.json() as any;

      expect(jsonStream.deltas).toBeDefined();
      expect(Array.isArray(jsonStream.deltas)).toBe(true);
      expect(jsonStream.nextCursor).toBe(jsonDelta.nextCursor);
      expect(jsonStream.sha256Digest).toBe(jsonDelta.sha256Digest);
    });
  });

  // =========================================================================
  // TASK 4.4: Delisting Tombstones & Delta Preservation (OVERLOOKED-1)
  // =========================================================================
  describe("Task 4.4: Incremental Projection & Delisting Tombstone Preservation (OVERLOOKED-1)", () => {
    it("preserves delisting tombstones across projection synthesis cycles", async () => {
      const now = new Date().toISOString();

      // Seed an active entity
      testDb.rawDb.run(`
        INSERT INTO entities (
          id, platform, url, title, author, description, tags_json,
          raw_json, is_quarantined, observed_at, created_at, updated_at
        ) VALUES (
          'github:TombDev/tomb-tool', 'github', 'https://github.com/TombDev/tomb-tool',
          'Tombstone Tool', 'TombDev', 'VRChat world and avatar tool', '["vpm-package", "tool"]',
          '{"vpmDependencies":{"com.vrchat.avatars":"3.0.0"}}', 0, '${now}', '${now}', '${now}'
        );
      `);

      // Run initial projection
      await runProjection({ targetDb: testDb.rawDb });

      const initialPkg = testDb.rawDb.prepare(`
        SELECT rowid, id, canonical_id, lifecycle FROM canonical_packages WHERE id = 'github:TombDev/tomb-tool';
      `).get() as any;

      expect(initialPkg).toBeDefined();
      expect(initialPkg.lifecycle).toBe("published");
      const initialRowid = initialPkg.rowid;

      // Delist the creator via db.delistCreatorPackages
      testDb.delistCreatorPackages("TombDev");

      const delistedPkg = testDb.rawDb.prepare(`
        SELECT rowid, id, canonical_id, lifecycle FROM canonical_packages WHERE id = 'github:TombDev/tomb-tool';
      `).get() as any;

      expect(delistedPkg.lifecycle).toBe("delisted");
      expect(delistedPkg.rowid).toBeGreaterThan(initialRowid);

      // Re-run projection. In previous flawed implementations, DELETE FROM canonical_packages wiped this out!
      await runProjection({ targetDb: testDb.rawDb });

      const preservedPkg = testDb.rawDb.prepare(`
        SELECT rowid, id, canonical_id, lifecycle FROM canonical_packages WHERE id = 'github:TombDev/tomb-tool';
      `).get() as any;

      // Acceptance Criteria: tombstone MUST be preserved with lifecycle = 'delisted'
      expect(preservedPkg).toBeDefined();
      expect(preservedPkg.lifecycle).toBe("delisted");

      // Verify GET /v1/catalog/delta emits DELISTED action for downstream caches
      const deltaResp = await fetch(`${baseUrl}/v1/catalog/delta?cursor=${initialRowid}`);
      expect(deltaResp.status).toBe(200);
      const deltaData = await deltaResp.json() as any;
      const delistedItem = deltaData.deltas.find((p: any) => p.canonicalId === preservedPkg.canonical_id);
      expect(delistedItem).toBeDefined();
      expect(delistedItem.action).toBe("DELISTED");
    });

    it("projection is strictly idempotent: re-running on unchanged data does not bump rowid and produces zero new deltas", async () => {
      // Get max rowid before projection re-run
      const beforeRow = testDb.rawDb.query("SELECT MAX(rowid) as maxRowid FROM canonical_packages;").get() as any;
      const initialMaxRowid = beforeRow?.maxRowid || 0;

      // Re-run projection on unchanged database state
      await runProjection({ targetDb: testDb.rawDb });

      // Verify rowid did not advance
      const afterRow = testDb.rawDb.query("SELECT MAX(rowid) as maxRowid FROM canonical_packages;").get() as any;
      const finalMaxRowid = afterRow?.maxRowid || 0;
      expect(finalMaxRowid).toBe(initialMaxRowid);

      // Verify delta endpoint produces 0 new deltas when cursor is at current watermark
      const deltaResp = await fetch(`${baseUrl}/v1/catalog/delta?cursor=${finalMaxRowid}`);
      expect(deltaResp.status).toBe(200);
      const deltaData = await deltaResp.json() as any;
      expect(deltaData.deltas.length).toBe(0);
    });
  });

  // =========================================================================
  // TASK 4.5: Opt-Out Correctness & DNS Rebinding Security (OVERLOOKED-2, 3)
  // =========================================================================
  describe("Task 4.5: Opt-Out Correctness & Anti-SSRF Socket Hardening", () => {
    it("delistCreatorPackages matches Jinxxy stores and standard BOOTH item URLs (OVERLOOKED-3)", () => {
      const now = new Date().toISOString();

      // Seed Jinxxy package and standard BOOTH package with fronts
      testDb.rawDb.run(`
        INSERT INTO canonical_packages (
          id, canonical_id, name, author, category, subcategory, type,
          description, primary_platform, platforms_json, url, vcc_url,
          price_currency, price_amount, is_vcc, tags_json, dependencies_json,
          source_ids_json, origin_created_at, origin_updated_at, created_at_confidence,
          lifecycle, lifecycle_updated_at, created_at, updated_at
        ) VALUES 
        (
          'pkg-jinxxy-1', 'jinxxy-gadget', 'Jinxxy Gadget', 'JinxxyArtist', 'tool', 'general', 'tool',
          'A Jinxxy asset', 'jinxxy', '["jinxxy"]', 'https://jinxxy.com/JinxxyArtist/gadget', NULL,
          'USD', 15, 0, '["test"]', '{}',
          '["jinxxy:gadget"]', NULL, NULL, 'unknown',
          'published', NULL, '${now}', '${now}'
        ),
        (
          'pkg-booth-standard', 'booth-standard-tool', 'Booth Standard Tool', '猫屋 (Neko-ya)', 'tool', 'general', 'tool',
          'A standard booth item', 'booth', '["booth"]', 'https://booth.pm/ja/items/888777', NULL,
          'JPY', 500, 0, '["test"]', '{}',
          '["booth:888777"]', NULL, NULL, 'unknown',
          'published', NULL, '${now}', '${now}'
        );
      `);

      testDb.rawDb.run(`
        INSERT INTO package_fronts (
          id, canonical_id, platform, platform_item_id, url, title, author,
          price_currency, price_amount, origin_created_at, origin_updated_at,
          raw_entity_id, media_urls_json, youtube_urls_json, created_at, updated_at
        ) VALUES (
          'front_booth_888777', 'booth-standard-tool', 'booth', '888777', 'https://booth.pm/ja/items/888777',
          'Booth Standard Tool', 'nekoya', 'JPY', 500, NULL, NULL,
          'booth:888777', '[]', '[]', '${now}', '${now}'
        );
      `);

      // Test Jinxxy opt out
      const jinxxyCount = testDb.delistCreatorPackages("JinxxyArtist", "https://jinxxy.com/JinxxyArtist");
      expect(jinxxyCount).toBe(1);

      const jinxxyPkg = testDb.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = 'jinxxy-gadget'").get() as any;
      expect(jinxxyPkg.lifecycle).toBe("delisted");

      // Test BOOTH vendor id opt out matching standard booth.pm/ja/items/888777 via package_fronts
      const boothCount = testDb.delistCreatorPackages("nekoya", "https://nekoya.booth.pm");
      expect(boothCount).toBe(1);

      const boothPkg = testDb.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE canonical_id = 'booth-standard-tool'").get() as any;
      expect(boothPkg.lifecycle).toBe("delisted");
    });

    it("fetchWithPinnedIp blocks SSRF attempts to private and loopback IPs (OVERLOOKED-2)", async () => {
      // Direct call to fetchWithPinnedIp with loopback and private IPs
      await expect(fetchWithPinnedIp("http://127.0.0.1:8080/secret", { maxBytes: 3000 })).rejects.toThrow("private/reserved IP");
      await expect(fetchWithPinnedIp("http://169.254.169.254/latest/meta-data/", { maxBytes: 3000 })).rejects.toThrow("private/reserved IP");
      await expect(fetchWithPinnedIp("http://10.0.0.1/admin", { maxBytes: 3000 })).rejects.toThrow("private/reserved IP");
      await expect(fetchWithPinnedIp("http://192.168.1.1/", { maxBytes: 3000 })).rejects.toThrow("private/reserved IP");
    });

    it("isPrivateOrReservedIp detects IPv6 loopback, site-local, unique local, IPv4-mapped, and documentation ranges", () => {
      expect(isPrivateOrReservedIp("::1")).toBe(true);
      expect(isPrivateOrReservedIp("0:0:0:0:0:0:0:1")).toBe(true);
      expect(isPrivateOrReservedIp("::")).toBe(true);
      expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
      expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
      expect(isPrivateOrReservedIp("fd12:3456:789a::1")).toBe(true);
      expect(isPrivateOrReservedIp("fec0::1")).toBe(true);
      expect(isPrivateOrReservedIp("ff02::1")).toBe(true);
      expect(isPrivateOrReservedIp("2001:db8::1")).toBe(true);
      expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("::ffff:7f00:1")).toBe(true);
      expect(isPrivateOrReservedIp("::ffff:10.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("::ffff:192.168.1.1")).toBe(true);

      // Public routable IPs must return false
      expect(isPrivateOrReservedIp("93.184.216.34")).toBe(false);
      expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
      expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
      expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    });

    it("fetchWithPinnedIp enforces maxBytes ceiling and rejects oversized responses immediately", async () => {
      globalThis.fetch = (async () => {
        const largeBuffer = new Uint8Array(100 * 1024); // 100 KB
        return new Response(largeBuffer, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" }
        });
      }) as any;

      await expect(
        fetchWithPinnedIp("https://public-files.gumroad.com/sample.png", { maxBytes: 1024 })
      ).rejects.toThrow("maximum allowed size");
    });

    it("isCreatorOptedOut supports platform-specific scoping and 'all' wildcards", () => {
      // Register an opt-out specifically for Booth
      testDb.registerOptOut("ExclusiveBoothCreator", "booth", "^ExclusiveBoothCreator$", "Booth specific opt-out", "storefront_bio_token");

      // Checking with platform = 'booth' returns true
      expect(testDb.isCreatorOptedOut("ExclusiveBoothCreator", "booth")).toBe(true);
      // Checking with platform = 'gumroad' returns false (not opted out on Gumroad)
      expect(testDb.isCreatorOptedOut("ExclusiveBoothCreator", "gumroad")).toBe(false);
      // Checking with no platform specified returns true
      expect(testDb.isCreatorOptedOut("ExclusiveBoothCreator")).toBe(true);

      // Register an opt-out for all platforms
      testDb.registerOptOut("UniversalCreator", "all", "^UniversalCreator$", "Global opt-out", "dns_txt");
      expect(testDb.isCreatorOptedOut("UniversalCreator", "booth")).toBe(true);
      expect(testDb.isCreatorOptedOut("UniversalCreator", "gumroad")).toBe(true);
      expect(testDb.isCreatorOptedOut("UniversalCreator", "github")).toBe(true);
    });
  });

  // =========================================================================
  // TASK 4.6: Storefront Conditional Requests & D1 Front Sync (OVERLOOKED-9, 10)
  // =========================================================================
  describe("Task 4.6: Storefront Conditional Requests & D1 Front Sync", () => {
    it("GumroadDriver sends conditional headers and returns notModified on HTTP 304 (OVERLOOKED-9)", async () => {
      const url = "https://gumroad.com/l/sample-item";
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = (async (u: any, opts: any) => {
        capturedHeaders = (opts?.headers || {}) as Record<string, string>;
        return new Response(null, {
          status: 304,
          headers: { "etag": '"gum-123"', "last-modified": "Wed, 21 Jan 2026 10:00:00 GMT" }
        });
      }) as any;

      const res = await GumroadDriver.crawlProduct(url, testDb, '"gum-123"', "Wed, 21 Jan 2026 10:00:00 GMT") as any;
      expect(capturedHeaders["If-None-Match"]).toBe('"gum-123"');
      expect(capturedHeaders["If-Modified-Since"]).toBe("Wed, 21 Jan 2026 10:00:00 GMT");
      expect(res.success).toBe(true);
      expect(res.notModified).toBe(true);
    });

    it("JinxxyDriver sends conditional headers and returns notModified on HTTP 304 (OVERLOOKED-9)", async () => {
      const url = "https://jinxxy.com/creator/item";
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = (async (u: any, opts: any) => {
        capturedHeaders = (opts?.headers || {}) as Record<string, string>;
        return new Response(null, {
          status: 304,
          headers: { "etag": '"jinx-456"' }
        });
      }) as any;

      const res = await JinxxyDriver.crawlProduct(url, testDb, '"jinx-456"') as any;
      expect(capturedHeaders["If-None-Match"]).toBe('"jinx-456"');
      expect(res.success).toBe(true);
      expect(res.notModified).toBe(true);
    });

    it("ItchDriver sends conditional headers and returns notModified on HTTP 304 (OVERLOOKED-9)", async () => {
      const url = "https://author.itch.io/tool";
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = (async (u: any, opts: any) => {
        capturedHeaders = (opts?.headers || {}) as Record<string, string>;
        return new Response(null, {
          status: 304,
          headers: { "last-modified": "Fri, 23 Jan 2026 12:00:00 GMT" }
        });
      }) as any;

      const res = await ItchDriver.crawlProduct(url, testDb, undefined, "Fri, 23 Jan 2026 12:00:00 GMT") as any;
      expect(capturedHeaders["If-Modified-Since"]).toBe("Fri, 23 Jan 2026 12:00:00 GMT");
      expect(res.success).toBe(true);
      expect(res.notModified).toBe(true);
    });

    it("runEdgeSync local backup includes package_fronts and catalog_metadata (OVERLOOKED-10)", async () => {
      globalThis.fetch = originalFetch;
      const res = await runEdgeSync({ isDryRun: false, batchSize: 50, resetWatermark: true }, testDb);

      expect(res.status).toBe("backed_up");
      expect(res.backedUpPackages).toBeGreaterThan(0);
      expect(res.backupPath).toBeDefined();

      // Read written backup JSON payload
      const backupJson = JSON.parse(fs.readFileSync(res.backupPath!, "utf-8"));
      expect(backupJson.packages).toBeDefined();
      expect(backupJson.package_fronts).toBeDefined();
      expect(backupJson.catalog_metadata).toBeDefined();
      expect(Array.isArray(backupJson.package_fronts)).toBe(true);
      expect(Array.isArray(backupJson.catalog_metadata)).toBe(true);
    });
  });

  // =========================================================================
  // TASK 4.1: Schema Normalization & Identifier Alignment (OVERLOOKED-4, 5)
  // =========================================================================
  describe("Task 4.1: Schema Normalization & Identifier Alignment", () => {
    it("exportCatalog populates media_cache with origin metadata without BLOBs (OVERLOOKED-4)", async () => {
      const exportPath = path.resolve(__dirname, `../dist/test_catalog_export_p4_${Date.now()}.db`);

      // Seed a media_cache entry in testDb
      testDb.rawDb.run(`
        INSERT OR REPLACE INTO media_cache (
          id, source_url, blurhash, phash_64, width, height, content_type, last_processed_at
        ) VALUES (
          'media_test_1', 'https://booth.pximg.net/test.jpg', 'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
          'phash64abc', 800, 600, 'image/jpeg', datetime('now')
        );
      `);

      // Seed published canonical package referencing media_id
      testDb.rawDb.run(`
        INSERT OR REPLACE INTO canonical_packages (
          id, canonical_id, name, author, category, subcategory, type,
          description, primary_platform, platforms_json, url, vcc_url,
          price_currency, price_amount, is_vcc, tags_json, dependencies_json,
          source_ids_json, media_id, origin_created_at, origin_updated_at, created_at_confidence,
          lifecycle, lifecycle_updated_at, created_at, updated_at
        ) VALUES (
          'pkg_media_export', 'media-export-tool', 'Media Export Tool', 'MediaDev', 'tool', 'general', 'tool',
          'Export test package with media', 'github', '["github"]', 'https://github.com/MediaDev/tool', NULL,
          'USD', 0, 0, '["test"]', '{}',
          '["github:MediaDev/tool"]', 'media_test_1', NULL, NULL, 'unknown',
          'published', NULL, datetime('now'), datetime('now')
        );
      `);

      const exportRes = await exportCatalog(exportPath, testDb.rawDb);

      expect(fs.existsSync(exportPath)).toBe(true);

      const expDb = new (require("bun:sqlite").Database)(exportPath);
      // media_cache table exists and has rows matching referenced media_id
      const mediaRow = expDb.prepare("SELECT * FROM media_cache WHERE id = 'media_test_1'").get() as any;
      expect(mediaRow).toBeDefined();
      expect(mediaRow.source_url).toBe("https://booth.pximg.net/test.jpg");
      expect(mediaRow.blurhash).toBe("L6PZfSi_.AyE_3t7t7R**0o#DgR4");

      // Verify PRAGMA foreign_key_check passes without violation
      const fkViolations = expDb.prepare("PRAGMA foreign_key_check;").all();
      expect(fkViolations.length).toBe(0);

      expDb.close();
      if (fs.existsSync(exportPath)) {
        try { fs.unlinkSync(exportPath); } catch (_) {}
      }
    });

    it("processPendingReports resolves both raw entity id and slug canonical_id (OVERLOOKED-5)", async () => {
      // Seed a test package
      testDb.rawDb.run(`
        INSERT OR REPLACE INTO canonical_packages (
          id, canonical_id, name, author, category, subcategory, type,
          description, primary_platform, platforms_json, url, vcc_url,
          price_currency, price_amount, is_vcc, tags_json, dependencies_json,
          source_ids_json, origin_created_at, origin_updated_at, created_at_confidence,
          lifecycle, lifecycle_updated_at, created_at, updated_at
        ) VALUES (
          'github:SteerDev/awesome-tool', 'awesome-tool', 'Awesome Tool', 'SteerDev', 'tool', 'general', 'tool',
          'A steerable package', 'github', '["github"]', 'https://github.com/SteerDev/awesome-tool', NULL,
          'USD', 0, 0, '["test"]', '{}',
          '["github:SteerDev/awesome-tool"]', NULL, NULL, 'unknown',
          'published', NULL, datetime('now'), datetime('now')
        );
      `);

      // Submit Schema 4 user report using primary ID 'github:SteerDev/awesome-tool'
      testDb.insertReport({
        reportId: "rep_test_01",
        targetPackageId: "github:SteerDev/awesome-tool",
        targetPackageName: "Awesome Tool",
        branch: "categorization",
        branchPayload: { suggestedClass: "avatar_dynamics" },
        reporterNotes: "Category correction"
      });

      // Apply steering
      const steeringRes = await processPendingReports(testDb);
      expect(steeringRes.applied).toBeGreaterThan(0);

      // Verify category was updated on canonical_packages
      const pkg = testDb.rawDb.prepare("SELECT category FROM canonical_packages WHERE canonical_id = 'awesome-tool'").get() as any;
      expect(pkg.category).toBe("avatar_dynamics");
    });

    it("steering updates advance rowid monotonically and emit into GET /v1/catalog/delta", async () => {
      // Get current max rowid
      const beforeRow = testDb.rawDb.query("SELECT MAX(rowid) as maxRowid FROM canonical_packages;").get() as any;
      const priorWatermark = beforeRow?.maxRowid || 0;

      // Submit user report for tag modification
      testDb.insertReport({
        reportId: "rep_test_tags_01",
        targetPackageId: "awesome-tool",
        targetPackageName: "Awesome Tool",
        branch: "tags",
        branchPayload: { addTags: ["curated-tag", "verified"] },
        reporterNotes: "Adding curated tags"
      });

      const res = await processPendingReports(testDb);
      expect(res.applied).toBeGreaterThan(0);

      // Verify rowid was bumped above priorWatermark
      const updatedPkg = testDb.rawDb.prepare("SELECT rowid, tags_json FROM canonical_packages WHERE canonical_id = 'awesome-tool'").get() as any;
      expect(updatedPkg.rowid).toBeGreaterThan(priorWatermark);
      expect(updatedPkg.tags_json).toContain("curated-tag");

      // Verify GET /v1/catalog/delta with cursor=priorWatermark emits the modified package
      const deltaResp = await fetch(`${baseUrl}/v1/catalog/delta?cursor=${priorWatermark}`);
      expect(deltaResp.status).toBe(200);
      const deltaData = await deltaResp.json() as any;
      const deltaItem = deltaData.deltas.find((d: any) => d.canonicalId === "awesome-tool");
      expect(deltaItem).toBeDefined();
      expect(deltaItem.package.tags).toContain("curated-tag");
    });
  });
});
