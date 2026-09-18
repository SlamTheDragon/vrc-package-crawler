import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { CrawlerDB } from "../src/db.ts";

describe("Database Schema Unification & Legacy V2 Auto-Upgrade", () => {
  it("automatically upgrades legacy _v2 tables to unified clean names without data loss", () => {
    // Create an in-memory test database with legacy _v2 tables and records
    const testDbPath = `test_legacy_${Date.now()}.db`;
    const setupDb = new Database(testDbPath);

    setupDb.run(`
      CREATE TABLE frontier_v2 (
        url TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        etag TEXT,
        last_modified TEXT,
        change_rate_lambda REAL DEFAULT 0.05,
        fetch_interval_sec INTEGER DEFAULT 86400,
        last_fetched_at TEXT,
        next_fetch_at TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        discovered_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    setupDb.run(`
      CREATE TABLE entities_v2 (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        price_currency TEXT,
        price_amount REAL,
        description TEXT,
        tags_json TEXT DEFAULT '[]',
        external_links_json TEXT DEFAULT '[]',
        raw_json TEXT DEFAULT '{}',
        is_quarantined INTEGER DEFAULT 0,
        quarantine_reasons_json TEXT DEFAULT '[]',
        origin_created_at TEXT,
        origin_updated_at TEXT,
        observed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    setupDb.run(`
      CREATE TABLE canonical_packages_v2 (
        id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        author TEXT NOT NULL,
        authors_json TEXT DEFAULT '[]',
        category TEXT NOT NULL,
        subcategory TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        primary_platform TEXT NOT NULL,
        platforms_json TEXT NOT NULL,
        url TEXT NOT NULL,
        price_currency TEXT DEFAULT 'USD',
        price_amount REAL DEFAULT 0,
        is_vcc INTEGER NOT NULL DEFAULT 0,
        tags_json TEXT DEFAULT '[]',
        dependencies_json TEXT DEFAULT '{}',
        source_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Insert mock legacy records
    setupDb.run("INSERT INTO frontier_v2 (url, platform, status, next_fetch_at, discovered_at, updated_at) VALUES ('https://booth.pm/1', 'booth', 'done', '2026-01-01', '2026-01-01', '2026-01-01');");
    setupDb.run("INSERT INTO entities_v2 (id, platform, url, title, author, observed_at, created_at, updated_at) VALUES ('ent_1', 'booth', 'https://booth.pm/1', 'Legacy Item', 'Legacy Author', '2026-01-01', '2026-01-01', '2026-01-01');");
    setupDb.run("INSERT INTO canonical_packages_v2 (id, canonical_id, name, author, category, subcategory, type, primary_platform, platforms_json, url, source_ids_json, created_at, updated_at) VALUES ('pkg_1', 'legacy-item', 'Legacy Item', 'Legacy Author', 'Tools & Utilities', 'General', 'QoL', 'booth', '[\"booth\"]', 'https://booth.pm/1', '[\"ent_1\"]', '2026-01-01', '2026-01-01');");

    setupDb.close();

    // Now instantiate CrawlerDB on that existing DB file
    const crawlerDb = new CrawlerDB(testDbPath);

    // Verify all 10 unified tables exist with clean names
    const tables = (crawlerDb.rawDb.query("SELECT name FROM sqlite_master WHERE type='table';").all() as any[]).map(t => t.name);
    expect(tables).toContain("frontier");
    expect(tables).toContain("entities");
    expect(tables).toContain("canonical_packages");

    // Verify legacy _v2 tables are gone
    expect(tables).not.toContain("frontier_v2");
    expect(tables).not.toContain("entities_v2");
    expect(tables).not.toContain("canonical_packages_v2");

    // Verify data was 100% preserved
    const fCount = (crawlerDb.rawDb.query("SELECT COUNT(*) as c FROM frontier;").get() as any).c;
    const eCount = (crawlerDb.rawDb.query("SELECT COUNT(*) as c FROM entities;").get() as any).c;
    const cCount = (crawlerDb.rawDb.query("SELECT COUNT(*) as c FROM canonical_packages;").get() as any).c;

    expect(fCount).toBe(1);
    expect(eCount).toBe(1);
    expect(cCount).toBe(1);

    crawlerDb.close();

    // Clean up temporary test db file
    try {
      const fs = require("fs");
      fs.unlinkSync(testDbPath);
      fs.unlinkSync(`${testDbPath}-wal`);
      fs.unlinkSync(`${testDbPath}-shm`);
    } catch (_) {}
  });
});
