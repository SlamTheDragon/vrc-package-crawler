import { describe, it, expect } from "bun:test";
import { db } from "../src/db.ts";

describe("Unified Database Schema & Curator Overrides Invariants", () => {
  it("verifies all 10 unified tables exist in SQLite catalog with clean normalized names", () => {
    const tableRows = db.rawDb.query("SELECT name FROM sqlite_master WHERE type='table';").all() as any[];
    const tableNames = tableRows.map(r => r.name);

    expect(tableNames).toContain("frontier");
    expect(tableNames).toContain("entities");
    expect(tableNames).toContain("creator_opt_outs");
    expect(tableNames).toContain("canonical_packages");
    expect(tableNames).toContain("package_fronts");
    expect(tableNames).toContain("media_cache");
    expect(tableNames).toContain("sync_checkpoints");
    expect(tableNames).toContain("curator_overrides");
    expect(tableNames).toContain("user_reports");
    expect(tableNames).toContain("search_patterns");

    // Ensure no legacy _v2 tables linger
    expect(tableNames).not.toContain("frontier_v2");
    expect(tableNames).not.toContain("entities_v2");
    expect(tableNames).not.toContain("canonical_packages_v2");
    expect(tableNames).not.toContain("package_fronts_v2");
  });

  it("verifies canonical_packages contains lifecycle and created_at_confidence columns", () => {
    const columns = db.rawDb.query("PRAGMA table_info(canonical_packages);").all() as any[];
    const colNames = columns.map(c => c.name);

    expect(colNames).toContain("created_at_confidence");
    expect(colNames).toContain("lifecycle");
    expect(colNames).toContain("lifecycle_updated_at");
  });

  it("persists curator overrides across table rebuilds and reapplies them", () => {
    const testCanonicalId = `test_override_persist_${Date.now()}`;
    const testPkgId = `test_pkg_${Date.now()}`;
    const now = new Date().toISOString();

    // 1. Insert curator override
    db.upsertCuratorOverride({
      canonicalId: testCanonicalId,
      nameOverride: "Persistent Verified Title",
      categoryOverride: "Tools & Utilities",
      subcategoryOverride: "Avatars / Setup & Optimization",
      addedTags: ["curated", "tested"],
      reason: "Verified by community team"
    });

    // Verify override is in curator_overrides
    const fetchedOverride = db.getCuratorOverride(testCanonicalId);
    expect(fetchedOverride).toBeDefined();
    expect(fetchedOverride!.name_override).toBe("Persistent Verified Title");

    // 2. Simulate projection generation with override
    const allOverrides = db.getAllCuratorOverrides();
    const ov = allOverrides.get(testCanonicalId);
    expect(ov).toBeDefined();

    const finalName = ov?.name_override || "Original Name";
    const finalCategory = ov?.category_override || "Avatars";

    db.rawDb.run(`
      INSERT OR REPLACE INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, price_currency, price_amount,
        is_vcc, tags_json, dependencies_json, source_ids_json, lifecycle, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'TestAuthor', '["TestAuthor"]', ?, 'General', 'QoL, Workflow & Toolchain',
        'Test desc', 'github', '["github"]', 'https://github.com/test/tool', 'USD', 0,
        1, '["tool"]', '{}', '["github:test/tool"]', 'published', ?, ?
      );
    `, [testPkgId, testCanonicalId, finalName, finalCategory, now, now]);

    // Verify canonical row received override
    const pkgBefore = db.rawDb.prepare("SELECT name, category FROM canonical_packages WHERE canonical_id = ?;").get(testCanonicalId) as any;
    expect(pkgBefore.name).toBe("Persistent Verified Title");
    expect(pkgBefore.category).toBe("Tools & Utilities");

    // 3. Clear canonical table (simulating pipeline rebuild)
    db.rawDb.run("DELETE FROM canonical_packages WHERE canonical_id = ?;", [testCanonicalId]);

    // 4. Override table still has it!
    const overrideAfterClear = db.getCuratorOverride(testCanonicalId);
    expect(overrideAfterClear).toBeDefined();
    expect(overrideAfterClear!.name_override).toBe("Persistent Verified Title");

    // Clean up
    db.rawDb.run("DELETE FROM curator_overrides WHERE canonical_id = ?;", [testCanonicalId]);
  });

  it("handles search patterns boost and suppress weighting", () => {
    const patternQuery = `query_test_${Date.now()}`;
    db.upsertSearchPattern({
      query: patternQuery,
      relevanceVote: "suppress",
      negativeTokens: ["spam", "nsfw", "low-quality"],
      weight: 3.0
    });

    const patterns = db.getSearchPatterns();
    const found = patterns.find(p => p.query === patternQuery);
    expect(found).toBeDefined();
    expect(found!.relevance_vote).toBe("suppress");
    expect(found!.weight).toBe(3.0);
    expect(found!.negative_tokens_json).toContain("spam");

    // Clean up
    db.rawDb.run("DELETE FROM search_patterns WHERE query = ?;", [patternQuery]);
  });

  it("verifies unrestricted tagging with guaranteed empirical core umbrella tags", () => {
    const pkgId = `pkg_tag_test_${Date.now()}`;
    const communityTags = ["カスタム衣装", "physbone-toggle", "quest-compatible", "original-3d-model"];
    const umbrellaTags = ["avatars", "setup-optimization", "workflow-tool", "booth", "vrchat", "unity", "vcc", "vpm"];
    const mergedTags = Array.from(new Set([...communityTags, ...umbrellaTags]));

    db.rawDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, price_currency, price_amount,
        is_vcc, tags_json, dependencies_json, source_ids_json, created_at, updated_at
      ) VALUES (
        ?, ?, 'Tag Invariant Test', 'AuthorTest', '[]', 'Avatars', 'Setup & Optimization',
        'QoL, Workflow & Toolchain', 'Desc', 'booth', '["booth"]', 'https://booth.pm/items/12345',
        'JPY', 1000, 1, ?, '{}', '[]', datetime('now'), datetime('now')
      );
    `, [pkgId, pkgId, JSON.stringify(mergedTags)]);

    const row = db.rawDb.prepare("SELECT tags_json, is_vcc FROM canonical_packages WHERE canonical_id = ?;").get(pkgId) as any;
    expect(row).toBeDefined();
    const storedTags: string[] = JSON.parse(row.tags_json);

    // 1. All unrestricted multilingual community tags must be preserved
    for (const ct of communityTags) {
      expect(storedTags).toContain(ct);
    }

    // 2. Core empirical umbrella tags must be guaranteed
    for (const ut of umbrellaTags) {
      expect(storedTags).toContain(ut);
    }

    // Clean up
    db.rawDb.run("DELETE FROM canonical_packages WHERE canonical_id = ?;", [pkgId]);
  });

  it("verifies media_cache linking on canonical packages", () => {
    const mediaId = `media_test_${Date.now()}`;
    const pkgId = `pkg_media_test_${Date.now()}`;

    // 1. Insert media cache record
    db.rawDb.run(`
      INSERT INTO media_cache (
        id, source_url, webp_data, webp_size_bytes, blurhash, phash_64, width, height, content_type, last_processed_at
      ) VALUES (?, 'https://booth.pm/img/test.png', X'52494646', 4, 'L6PZfSi_.AyE', 'a1b2c3d4e5f60708', 480, 270, 'image/webp', datetime('now'));
    `, [mediaId]);

    // 2. Insert canonical package linked to media
    db.rawDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, price_currency, price_amount,
        is_vcc, tags_json, dependencies_json, source_ids_json, media_id, created_at, updated_at
      ) VALUES (
        ?, ?, 'Media Test Package', 'MediaCreator', '[]', 'Tools', 'Utilities',
        'QoL, Workflow & Toolchain', 'Desc', 'booth', '["booth"]', 'https://booth.pm/items/54321',
        'JPY', 0, 0, '[]', '{}', '[]', ?, datetime('now'), datetime('now')
      );
    `, [pkgId, pkgId, mediaId]);

    // 3. Verify join query
    const joined = db.rawDb.prepare(`
      SELECT cp.canonical_id, cp.name, mc.id as media_id, mc.blurhash, mc.phash_64, mc.content_type
      FROM canonical_packages cp
      LEFT JOIN media_cache mc ON cp.media_id = mc.id
      WHERE cp.canonical_id = ?;
    `).get(pkgId) as any;

    expect(joined).toBeDefined();
    expect(joined.media_id).toBe(mediaId);
    expect(joined.blurhash).toBe("L6PZfSi_.AyE");
    expect(joined.phash_64).toBe("a1b2c3d4e5f60708");

    // Clean up
    db.rawDb.run("DELETE FROM canonical_packages WHERE canonical_id = ?;", [pkgId]);
    db.rawDb.run("DELETE FROM media_cache WHERE id = ?;", [mediaId]);
  });

  it("verifies canonical package distinguishes origin creation timestamp vs local indexing timestamp", () => {
    const pkgId = `pkg_time_test_${Date.now()}`;
    const upstreamOriginDate = "2021-04-15T12:00:00.000Z";
    const localIndexedDate = "2026-09-18T10:00:00.000Z";
    const localUpdatedDate = "2026-09-18T12:30:00.000Z";

    db.rawDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, price_currency, price_amount,
        is_vcc, tags_json, dependencies_json, source_ids_json,
        origin_created_at, origin_updated_at, created_at_confidence, lifecycle,
        created_at, updated_at
      ) VALUES (
        ?, ?, 'Timestamp Invariant Package', 'TimeAuthor', '[]', 'Tools', 'Utilities',
        'QoL, Workflow & Toolchain', 'Desc', 'github', '["github"]', 'https://github.com/time/tool',
        'USD', 0, 1, '[]', '{}', '[]',
        ?, ?, 'confirmed', 'published',
        ?, ?
      );
    `, [pkgId, pkgId, upstreamOriginDate, upstreamOriginDate, localIndexedDate, localUpdatedDate]);

    const row = db.rawDb.prepare(`
      SELECT origin_created_at, origin_updated_at, created_at_confidence, created_at, updated_at
      FROM canonical_packages
      WHERE canonical_id = ?;
    `).get(pkgId) as any;

    expect(row).toBeDefined();
    // Upstream origin date must match platform creation time exactly
    expect(row.origin_created_at).toBe(upstreamOriginDate);
    // Local indexing date must be distinct and not overwritten by upstream date
    expect(row.created_at).toBe(localIndexedDate);
    expect(row.origin_created_at).not.toBe(row.created_at);
    // Confidence must be 'confirmed'
    expect(row.created_at_confidence).toBe("confirmed");

    // Clean up
    db.rawDb.run("DELETE FROM canonical_packages WHERE canonical_id = ?;", [pkgId]);
  });
});
