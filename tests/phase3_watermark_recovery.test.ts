import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { CrawlerDB } from "../src/db.ts";
import { runProjection } from "../src/crawler/projection.ts";
import { runEdgeSync } from "../src/sync/index.ts";
import { exportCatalog } from "../src/sync/exporter.ts";
import path from "path";
import fs from "fs";

describe("Phase 3 - Task 3.4: Edge Sync Watermark Recovery & Data Loss Prevention", () => {
  const fixturePath = path.resolve(__dirname, `../dist/test_sync_watermark_${Date.now()}.db`);
  let testDb: CrawlerDB;

  beforeAll(() => {
    testDb = new CrawlerDB(fixturePath);
  });

  afterAll(() => {
    try { testDb?.close(); } catch (_) {}
    if (fs.existsSync(fixturePath)) {
      try { fs.unlinkSync(fixturePath); } catch (_) {}
    }
  });

  it("runProjection records unique projection_epoch in catalog_metadata", async () => {
    // Run projection against testDb
    await runProjection({ targetDb: testDb.rawDb });

    const epochRow = testDb.rawDb.prepare("SELECT value FROM catalog_metadata WHERE key = 'projection_epoch' LIMIT 1;").get() as any;
    expect(epochRow).toBeDefined();
    expect(epochRow.value).toMatch(/^epoch_\d+_[a-z0-9]+$/);
  });

  it("runEdgeSync persists projection_epoch to sync_checkpoints in local_backup mode", async () => {
    // Seed test canonical package
    testDb.rawDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, category, subcategory, type,
        description, primary_platform, platforms_json, url, vcc_url,
        price_currency, price_amount, is_vcc, tags_json, dependencies_json,
        source_ids_json, origin_created_at, origin_updated_at, created_at_confidence,
        lifecycle, lifecycle_updated_at, created_at, updated_at
      ) VALUES (
        'pkg-epoch-1', 'epoch-tool', 'Epoch Tool', 'EpochDev', 'tool', 'general', 'tool',
        'Epoch test tool', 'github', '["github"]', 'https://github.com/epoch/tool', NULL,
        'USD', 0, 0, '["test"]', '{}',
        '["github:epoch/tool"]', NULL, NULL, 'unknown',
        'published', NULL, datetime('now'), datetime('now')
      );
    `);

    const currentEpoch = "epoch_1790000000000_test123";
    testDb.rawDb.run("INSERT OR REPLACE INTO catalog_metadata (key, value) VALUES ('projection_epoch', ?);", [currentEpoch]);

    // Run local backup sync
    const res = await runEdgeSync({ isDryRun: false, batchSize: 50 }, testDb);
    expect(res.status).toBe("backed_up");
    expect(res.backedUpPackages).toBe(1);

    // Verify checkpoint has projection_epoch recorded
    const checkpoint = testDb.rawDb.prepare(`
      SELECT sync_target, last_synced_rowid, projection_epoch, status
      FROM sync_checkpoints
      WHERE sync_target = 'local_backup'
      ORDER BY id DESC LIMIT 1;
    `).get() as any;

    expect(checkpoint).toBeDefined();
    expect(checkpoint.projection_epoch).toBe(currentEpoch);
    expect(checkpoint.status).toBe("success");
  });

  it("resets watermark to 0 on projection epoch mismatch preventing silent data omission", async () => {
    // Simulate previous checkpoint with an old epoch and rowid 5
    const oldEpoch = "epoch_1780000000000_oldold";
    const newEpoch = "epoch_1795000000000_newnew";

    testDb.rawDb.run(`
      INSERT INTO sync_checkpoints (
        sync_target, last_synced_id, last_synced_rowid, records_synced, synced_at, status, projection_epoch
      ) VALUES ('local_backup', 'old-pkg', 5, 5, datetime('now'), 'success', ?);
    `, [oldEpoch]);

    // Table is wiped and rebuilt, now having 5 fresh packages whose rowids are 1..5.
    // If watermark wasn't reset, rowids 1..5 would be silently skipped!
    testDb.rawDb.run("DELETE FROM canonical_packages;");
    for (let i = 1; i <= 3; i++) {
      testDb.rawDb.run(`
        INSERT INTO canonical_packages (
          id, canonical_id, name, author, category, subcategory, type,
          description, primary_platform, platforms_json, url, vcc_url,
          price_currency, price_amount, is_vcc, tags_json, dependencies_json,
          source_ids_json, origin_created_at, origin_updated_at, created_at_confidence,
          lifecycle, lifecycle_updated_at, created_at, updated_at
        ) VALUES (
          'pkg-new-${i}', 'tool-${i}', 'Tool ${i}', 'Author', 'tool', 'general', 'tool',
          'Desc', 'github', '["github"]', 'https://github.com/author/tool-${i}', NULL,
          'USD', 0, 0, '["test"]', '{}',
          '["github:author/tool-${i}"]', NULL, NULL, 'unknown',
          'published', NULL, datetime('now'), datetime('now')
        );
      `);
    }

    // Update catalog_metadata with new projection epoch
    testDb.rawDb.run("INSERT OR REPLACE INTO catalog_metadata (key, value) VALUES ('projection_epoch', ?);", [newEpoch]);

    // Run edge sync
    const res = await runEdgeSync({ isDryRun: false, batchSize: 50 }, testDb);
    expect(res.status).toBe("backed_up");
    expect(res.backedUpPackages).toBe(3);

    // Verify all 3 newly inserted rows were synced rather than skipped
    const latestCheckpoint = testDb.rawDb.prepare(`
      SELECT sync_target, last_synced_rowid, records_synced, projection_epoch
      FROM sync_checkpoints
      WHERE sync_target = 'local_backup'
      ORDER BY id DESC LIMIT 1;
    `).get() as any;

    expect(latestCheckpoint.records_synced).toBe(3);
    expect(latestCheckpoint.projection_epoch).toBe(newEpoch);
  });

  it("resets watermark unconditionally when resetWatermark: true is specified", async () => {
    // Run edge sync with explicit resetWatermark
    const res = await runEdgeSync({ isDryRun: true, resetWatermark: true }, testDb);
    expect(res.status).toBe("dry_run");
    expect(res.validatedPackages).toBe(3);
  });

  it("resets watermark to 0 when migrating from un-epoched (null projection_epoch) checkpoint", async () => {
    // Insert a legacy checkpoint with NULL projection_epoch
    const now = new Date().toISOString();
    testDb.rawDb.run(`
      INSERT INTO sync_checkpoints (
        sync_target, last_synced_id, last_synced_rowid, records_synced, synced_at, status, projection_epoch
      ) VALUES ('local_backup', 'pkg-legacy', 2, 2, ?, 'success', NULL);
    `, [now]);

    // Current epoch exists in catalog_metadata
    testDb.rawDb.run("INSERT OR REPLACE INTO catalog_metadata (key, value) VALUES ('projection_epoch', ?);", ["epoch_active_now"]);

    const res = await runEdgeSync({ isDryRun: false, batchSize: 50 }, testDb);
    expect(res.status).toBe("backed_up");
    // All 3 packages should be backed up from beginning
    expect(res.backedUpPackages).toBe(3);
  });

  it("exportCatalog excludes delisted packages and their fronts from exported vrc_catalog.db", async () => {
    const exportOut = path.resolve(__dirname, `../dist/test_catalog_export_${Date.now()}.db`);

    // Ensure we have a published package and a delisted package in testDb
    testDb.rawDb.run(`
      INSERT OR REPLACE INTO canonical_packages (
        id, canonical_id, name, author, category, subcategory, type,
        description, primary_platform, platforms_json, url, vcc_url,
        price_currency, price_amount, is_vcc, tags_json, dependencies_json,
        source_ids_json, media_id, origin_created_at, origin_updated_at,
        created_at_confidence, lifecycle, lifecycle_updated_at, created_at, updated_at
      ) VALUES
      (
        'pkg-pub-1', 'pub-tool', 'Published Tool', 'AuthorPub', 'tool', 'general', 'tool',
        'Active tool', 'github', '["github"]', 'https://github.com/author/pub-tool', NULL,
        'USD', 0, 0, '[]', '{}', '["github:author/pub-tool"]', NULL, NULL, NULL,
        'unknown', 'published', NULL, datetime('now'), datetime('now')
      ),
      (
        'pkg-del-1', 'del-tool', 'Delisted Tool', 'AuthorDel', 'tool', 'general', 'tool',
        'Delisted tool', 'github', '["github"]', 'https://github.com/author/del-tool', NULL,
        'USD', 0, 0, '[]', '{}', '["github:author/del-tool"]', NULL, NULL, NULL,
        'unknown', 'delisted', datetime('now'), datetime('now'), datetime('now')
      );

      INSERT OR REPLACE INTO package_fronts (
        id, canonical_id, platform, platform_item_id, url, title, author,
        price_currency, price_amount, origin_created_at, origin_updated_at,
        raw_entity_id, media_urls_json, youtube_urls_json, created_at, updated_at
      ) VALUES
      (
        'front-pub-1', 'pub-tool', 'github', 'author/pub-tool', 'https://github.com/author/pub-tool',
        'Published Front', 'AuthorPub', 'USD', 0, NULL, NULL, 'raw-1', '[]', '[]', datetime('now'), datetime('now')
      ),
      (
        'front-del-1', 'del-tool', 'github', 'author/del-tool', 'https://github.com/author/del-tool',
        'Delisted Front', 'AuthorDel', 'USD', 0, NULL, NULL, 'raw-2', '[]', '[]', datetime('now'), datetime('now')
      );
    `);

    try {
      await exportCatalog(exportOut, testDb.rawDb);

      const exportedDb = new Database(exportOut);
      const pkgs = exportedDb.query("SELECT canonical_id, lifecycle FROM canonical_packages;").all() as any[];
      const fronts = exportedDb.query("SELECT canonical_id FROM package_fronts;").all() as any[];

      const canonicalIds = pkgs.map(p => p.canonical_id);
      expect(canonicalIds).toContain("pub-tool");
      expect(canonicalIds).not.toContain("del-tool");

      const frontIds = fronts.map(f => f.canonical_id);
      expect(frontIds).toContain("pub-tool");
      expect(frontIds).not.toContain("del-tool");

      exportedDb.close();
    } finally {
      if (fs.existsSync(exportOut)) {
        try { fs.unlinkSync(exportOut); } catch (_) {}
      }
    }
  });
});
