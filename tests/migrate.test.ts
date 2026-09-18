import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runZeroLossMigration } from "../src/migrate_v2.ts";

describe("Database V2 Zero-Loss Migration", () => {
  it("migrates all legacy tables without data loss", async () => {
    const testDb = new Database(":memory:");

    // Setup legacy tables with mock data
    testDb.run(`
      CREATE TABLE frontier (
        url TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        discovered_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    testDb.run(`
      CREATE TABLE entities (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        price_currency TEXT,
        price_amount REAL,
        description TEXT,
        tags_json TEXT,
        external_links_json TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    testDb.run(`
      CREATE TABLE quarantined_entities (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        reasons_json TEXT,
        quarantined_at TEXT NOT NULL
      );
    `);
    testDb.run(`
      CREATE TABLE merged_packages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        canonical_id TEXT NOT NULL,
        author TEXT NOT NULL,
        category TEXT NOT NULL,
        subcategory TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        primary_platform TEXT NOT NULL,
        platforms_json TEXT NOT NULL,
        url TEXT NOT NULL,
        vcc_url TEXT,
        github_url TEXT,
        booth_url TEXT,
        gumroad_url TEXT,
        jinxxy_url TEXT,
        itch_url TEXT,
        price_currency TEXT,
        price_amount REAL,
        is_vcc INTEGER,
        tags_json TEXT,
        source_ids_json TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        dependencies_json TEXT,
        authors_json TEXT
      );
    `);

    // Insert test data
    testDb.run("INSERT INTO frontier VALUES ('https://booth.pm/1', 'booth', 'done', 1, '2026-01-01', '2026-01-02');");
    testDb.run("INSERT INTO entities VALUES ('ent_1', 'booth', 'https://booth.pm/1', 'Item 1', 'Author A', 'JPY', 500, 'Desc 1', '[\"vrc\"]', '[]', '{}', '2026-01-01', '2026-01-02');");
    testDb.run("INSERT INTO quarantined_entities VALUES ('q_1', 'booth', 'https://booth.pm/bad', 'Bad Item', 'Author B', '[\"non_vr\"]', '2026-01-01');");
    testDb.run("INSERT INTO merged_packages VALUES ('pkg_1', 'Tool Package', 'tool-package', 'Author A', 'Tools & Utilities', 'Workflow', 'Tool', 'Test Tool', 'github', '[\"github\"]', 'https://github.com/a/b', NULL, 'https://github.com/a/b', NULL, NULL, NULL, NULL, 'USD', 0, 1, '[]', '[\"ent_1\"]', '2026-01-01', '2026-01-02', '{}', '[\"Author A\"]');");

    // Initialize V2 tables on testDb
    const { CrawlerDBV2 } = await import("../src/db_v2.ts");
    // Run schema creation
    const dummy = new CrawlerDBV2(":memory:");
    // copy schema to testDb
    const schemaRows = dummy.rawDb.query("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL;").all() as any[];
    for (const r of schemaRows) {
      testDb.run(r.sql);
    }
    dummy.close();

    // Execute migration
    await runZeroLossMigration(testDb);

    // Verify record counts
    const fCount = (testDb.query("SELECT COUNT(*) as c FROM frontier_v2;").get() as any).c;
    const eCount = (testDb.query("SELECT COUNT(*) as c FROM entities_v2 WHERE is_quarantined = 0;").get() as any).c;
    const qCount = (testDb.query("SELECT COUNT(*) as c FROM entities_v2 WHERE is_quarantined = 1;").get() as any).c;
    const cCount = (testDb.query("SELECT COUNT(*) as c FROM canonical_packages_v2;").get() as any).c;
    const frontCount = (testDb.query("SELECT COUNT(*) as c FROM package_fronts_v2;").get() as any).c;

    expect(fCount).toBe(1);
    expect(eCount).toBe(1);
    expect(qCount).toBe(1);
    expect(cCount).toBe(1);
    expect(frontCount).toBe(1);

    testDb.close();
  });
});
