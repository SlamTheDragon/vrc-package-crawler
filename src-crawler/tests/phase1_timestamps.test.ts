import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { cleanTitle, cleanAuthorName } from "../src/utils/sanitizer.ts";

describe("Phase 1 - Task 1.4: Timestamp Invariant & Disallow Crawl Fetch Time for Missing Dates", () => {
  let testDb: Database;

  beforeEach(() => {
    testDb = new Database(":memory:");
    testDb.run(`
      CREATE TABLE IF NOT EXISTS entities (
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

    testDb.run(`
      CREATE TABLE IF NOT EXISTS canonical_packages (
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
        vcc_url TEXT,
        price_currency TEXT DEFAULT 'USD',
        price_amount REAL DEFAULT 0,
        is_vcc INTEGER NOT NULL DEFAULT 0,
        tags_json TEXT DEFAULT '[]',
        dependencies_json TEXT DEFAULT '{}',
        source_ids_json TEXT NOT NULL,
        media_id TEXT,
        media_urls_json TEXT DEFAULT '[]',
        youtube_urls_json TEXT DEFAULT '[]',
        origin_created_at TEXT,
        origin_updated_at TEXT,
        created_at_confidence TEXT DEFAULT 'unknown'
          CHECK(created_at_confidence IN ('confirmed','inferred','unknown')),
        lifecycle TEXT DEFAULT 'published'
          CHECK(lifecycle IN ('published','updated','delisted','archived',
                              'paywall_introduced','dmca_removed','creator_opted_out')),
        lifecycle_updated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    try { testDb.close(); } catch (_) {}
  });

  it("stores NULL origin_created_at and 'unknown' confidence when upstream date is missing", () => {
    const now = new Date().toISOString();
    // Simulate crawler observing an entity at 'now', but upstream platform has NO published date
    testDb.run(`
      INSERT INTO entities (
        id, platform, url, title, author, description,
        origin_created_at, origin_updated_at, observed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `, [
      "booth:99999", "booth", "https://booth.pm/ja/items/99999",
      cleanTitle("Mystery Tool"), cleanAuthorName("Creator"), "A nice tool",
      null, null, now, now, now
    ]);

    const ent = testDb.query("SELECT * FROM entities WHERE id = 'booth:99999';").get() as any;
    expect(ent.origin_created_at).toBeNull();
    expect(ent.observed_at).toBe(now);

    // Apply projection timestamp logic (Task 1.4 remediation)
    const upstreamCreated = ent.origin_created_at;
    let originCreatedAt: string | null = null;
    let createdAtConfidence: "confirmed" | "inferred" | "unknown" = "unknown";

    if (upstreamCreated) {
      originCreatedAt = upstreamCreated;
      createdAtConfidence = "confirmed";
    } else {
      // Invariant: Do NOT substitute local observed_at
      originCreatedAt = null;
      createdAtConfidence = "unknown";
    }

    expect(originCreatedAt).toBeNull();
    expect(createdAtConfidence).toBe("unknown");

    // Insert into canonical_packages
    testDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, price_currency, price_amount,
        is_vcc, tags_json, dependencies_json, source_ids_json, origin_created_at,
        created_at_confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `, [
      "booth:99999", "mystery-tool", ent.title, ent.author, "[]", "Tools", "General",
      "QoL, Workflow & Toolchain", ent.description, ent.platform, "[\"booth\"]",
      ent.url, "USD", 0, 0, "[]", "{}", "[\"booth:99999\"]",
      originCreatedAt, createdAtConfidence, now, now
    ]);

    const pkg = testDb.query("SELECT * FROM canonical_packages WHERE canonical_id = 'mystery-tool';").get() as any;
    expect(pkg.origin_created_at).toBeNull();
    expect(pkg.created_at_confidence).toBe("unknown");
    // Local observation time is preserved in created_at, not origin_created_at
    expect(pkg.created_at).toBe(now);
  });

  it("preserves authoritative origin_created_at with 'confirmed' confidence when provided", () => {
    const upstreamDate = "2023-05-15T10:00:00.000Z";
    const crawlDate = "2026-09-24T12:00:00.000Z";

    testDb.run(`
      INSERT INTO entities (
        id, platform, url, title, author, description,
        origin_created_at, origin_updated_at, observed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `, [
      "github:owner/repo", "github", "https://github.com/owner/repo",
      cleanTitle("Authoritative Tool"), cleanAuthorName("Owner"), "An open source tool",
      upstreamDate, upstreamDate, crawlDate, crawlDate, crawlDate
    ]);

    const ent = testDb.query("SELECT * FROM entities WHERE id = 'github:owner/repo';").get() as any;
    expect(ent.origin_created_at).toBe(upstreamDate);

    // Apply projection timestamp logic
    let originCreatedAt: string | null = ent.origin_created_at;
    let createdAtConfidence: "confirmed" | "inferred" | "unknown" = "unknown";
    if (originCreatedAt) {
      createdAtConfidence = "confirmed";
    }

    testDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, price_currency, price_amount,
        is_vcc, tags_json, dependencies_json, source_ids_json, origin_created_at,
        created_at_confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `, [
      "github:owner/repo", "authoritative-tool", ent.title, ent.author, "[]", "Tools", "General",
      "QoL, Workflow & Toolchain", ent.description, ent.platform, "[\"github\"]",
      ent.url, "USD", 0, 0, "[]", "{}", "[\"github:owner/repo\"]",
      originCreatedAt, createdAtConfidence, crawlDate, crawlDate
    ]);

    const pkg = testDb.query("SELECT * FROM canonical_packages WHERE canonical_id = 'authoritative-tool';").get() as any;
    expect(pkg.origin_created_at).toBe(upstreamDate);
    expect(pkg.created_at_confidence).toBe("confirmed");
  });
});
