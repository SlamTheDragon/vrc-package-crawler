import { describe, it, expect, beforeEach, afterEach, beforeAll } from "bun:test";
import { Database } from "bun:sqlite";
import { CrawlerDB } from "../src/db.ts";
import { runProjection } from "../src/crawler/projection.ts";
import * as fs from "fs";
import * as path from "path";

describe("Phase 1 / Task 4.1: Database Schema Deduplication & 2 URL Columns Rule", () => {
  let db: Database;
  let crawlerDb: CrawlerDB;

  beforeAll(() => {
    try {
      const distDir = path.resolve(process.cwd(), "dist");
      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir);
        for (const f of files) {
          if (f.startsWith("test_catalog_") && f.endsWith(".db")) {
            try { fs.unlinkSync(path.join(distDir, f)); } catch (_) {}
          }
        }
      }
    } catch (_) {}
  });

  beforeEach(() => {
    db = new Database(":memory:");
    crawlerDb = new CrawlerDB(":memory:");
  });

  afterEach(() => {
    try { db.close(); } catch (_) {}
    try { crawlerDb.close(); } catch (_) {}
  });

  it("ensures canonical_packages has exactly 2 URL columns (url and vcc_url) and no redundant platform URL columns", () => {
    const tableInfo = crawlerDb.rawDb.query("PRAGMA table_info(canonical_packages);").all() as any[];
    const columnNames = tableInfo.map(c => c.name);

    // 1. Mandatory 2 URL columns must exist
    expect(columnNames).toContain("url");
    expect(columnNames).toContain("vcc_url");

    // 2. Redundant flat URL columns must NOT exist
    expect(columnNames).not.toContain("github_url");
    expect(columnNames).not.toContain("booth_url");
    expect(columnNames).not.toContain("gumroad_url");
    expect(columnNames).not.toContain("jinxxy_url");
    expect(columnNames).not.toContain("itch_url");

    // 3. Platform discriminator column must exist
    expect(columnNames).toContain("primary_platform");
    expect(columnNames).toContain("platforms_json");

    // 4. Media and video gallery arrays must be in canonical schema
    expect(columnNames).toContain("media_urls_json");
    expect(columnNames).toContain("youtube_urls_json");

    // 5. Verify media_cache on primary crawlerDb has ZERO webp_data or webp_size_bytes BLOB columns
    const mediaTableInfo = crawlerDb.rawDb.query("PRAGMA table_info(media_cache);").all() as any[];
    const mediaCols = mediaTableInfo.map(c => c.name);
    expect(mediaCols).not.toContain("webp_data");
    expect(mediaCols).not.toContain("webp_size_bytes");
    expect(mediaCols).toContain("source_url");
    expect(mediaCols).toContain("blurhash");
    expect(mediaCols).toContain("phash_64");
  });

  it("ensures curator_overrides uses name_override and removes redundant title_override", () => {
    const tableInfo = crawlerDb.rawDb.query("PRAGMA table_info(curator_overrides);").all() as any[];
    const columnNames = tableInfo.map(c => c.name);

    expect(columnNames).toContain("name_override");
    expect(columnNames).not.toContain("title_override");
    expect(columnNames).toContain("url_override");

    // Verify upsert works cleanly with name_override
    const success = crawlerDb.upsertCuratorOverride({
      canonicalId: "test-package",
      nameOverride: "Curated Test Package Name",
      categoryOverride: "Tools",
      reason: "Standardized title"
    });
    expect(success).toBe(true);

    const row = crawlerDb.getCuratorOverride("test-package");
    expect(row).toBeDefined();
    expect(row?.name_override).toBe("Curated Test Package Name");
  });

  it("verifies projection engine populates canonical_packages with 2 URL columns and decouples storefronts to package_fronts", async () => {
    // Insert raw entities: a VPM package that links to GitHub, and a Booth storefront
    const now = new Date().toISOString();
    const rawVpm = JSON.stringify({
      manifest_url: "https://vpm.example.com/index.json",
      repo_url: "https://github.com/example/awesome-tool",
      download_url: "https://github.com/example/awesome-tool/releases/download/v1.0.0/tool.zip"
    });

    crawlerDb.saveEntity({
      id: "vpm:com.example.awesome-tool",
      platform: "vpm",
      url: "https://vpm.example.com/index.json",
      title: "Awesome Tool",
      author: "ExampleDev",
      price_currency: "USD",
      price_amount: 0,
      description: "A great tool for VRChat avatars",
      tags_json: JSON.stringify(["tool", "vpm"]),
      external_links_json: JSON.stringify(["https://github.com/example/awesome-tool"]),
      raw_json: rawVpm,
      observed_at: now
    });

    crawlerDb.saveEntity({
      id: "booth:123456",
      platform: "booth",
      url: "https://booth.pm/ja/items/123456",
      title: "Awesome Tool (Booth Mirror)",
      author: "ExampleDev",
      price_currency: "JPY",
      price_amount: 1500,
      description: "Booth store mirror for Awesome Tool",
      tags_json: JSON.stringify(["booth", "tool"]),
      external_links_json: JSON.stringify(["https://github.com/example/awesome-tool"]),
      raw_json: JSON.stringify({}),
      observed_at: now
    });

    // Run projection pipeline against the DB
    await runProjection({ targetDb: crawlerDb });

    // Verify canonical_packages entry
    const pkgs = crawlerDb.rawDb.query("SELECT * FROM canonical_packages;").all() as any[];
    expect(pkgs.length).toBeGreaterThanOrEqual(1);

    const mainPkg = pkgs.find(p => p.name.includes("Awesome Tool"));
    expect(mainPkg).toBeDefined();

    // Canonical package has exactly 2 URL columns populated
    expect(mainPkg.primary_platform).toBe("vpm");
    expect(mainPkg.url).toBe("https://vpm.example.com/index.json");
    expect(mainPkg.vcc_url).toContain("vcc://vpm/addRepo");

    // Redundant properties should be undefined in query result
    expect(mainPkg.github_url).toBeUndefined();
    expect(mainPkg.booth_url).toBeUndefined();

    // Verify package_fronts has decoupled entries for both storefronts
    const allFronts = crawlerDb.rawDb.query("SELECT * FROM package_fronts;").all() as any[];
    const fronts = allFronts.filter(f => f.canonical_id === mainPkg.canonical_id);
    expect(fronts.length).toBeGreaterThanOrEqual(2);

    const platforms = fronts.map(f => f.platform);
    expect(platforms).toContain("vpm");
    expect(platforms).toContain("booth");

    const boothFront = fronts.find(f => f.platform === "booth");
    expect(boothFront).toBeDefined();
    expect(boothFront.url).toBe("https://booth.pm/ja/items/123456");
    expect(boothFront.raw_entity_id).toBe("booth:123456");
    expect(boothFront.platform_item_id).toBe("123456");
  });

  it("verifies exported SQLite catalog (vrc_catalog.db) contains 2 URL columns, zero WebP BLOBs, and in-band terms metadata", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const { runDatabaseExport } = await import("../src/sync/exporter.ts");

    const tmpExportPath = path.resolve(process.cwd(), `dist/test_catalog_${Date.now()}.db`);
    try {
      await runProjection({ targetDb: crawlerDb });
      const exportedPath = await runDatabaseExport("catalog", tmpExportPath, crawlerDb.rawDb);
      expect(fs.existsSync(exportedPath)).toBe(true);

      const expDb = new Database(exportedPath, { readonly: true });
      try {
        // 1. Verify canonical_packages schema in exported DB
        const pkgCols = (expDb.query("PRAGMA table_info(canonical_packages);").all() as any[]).map(c => c.name);
        expect(pkgCols).toContain("url");
        expect(pkgCols).toContain("vcc_url");
        expect(pkgCols).not.toContain("github_url");
        expect(pkgCols).not.toContain("booth_url");
        expect(pkgCols).not.toContain("gumroad_url");
        expect(pkgCols).not.toContain("jinxxy_url");
        expect(pkgCols).not.toContain("itch_url");

        // 2. Verify media_cache is slimmed with NO webp_data BLOB
        const mediaCols = (expDb.query("PRAGMA table_info(media_cache);").all() as any[]).map(c => c.name);
        expect(mediaCols).not.toContain("webp_data");
        expect(mediaCols).not.toContain("webp_size_bytes");
        expect(mediaCols).toContain("source_url");
        expect(mediaCols).toContain("blurhash");
        expect(mediaCols).toContain("phash_64");

        // 3. Verify catalog_metadata contains legal terms notice
        const metaRows = expDb.query("SELECT * FROM catalog_metadata;").all() as any[];
        expect(metaRows.length).toBeGreaterThanOrEqual(4);
        const termsRow = metaRows.find(r => r.key === "terms_of_use_url");
        expect(termsRow?.value).toContain("LEGAL.md");
      } finally {
        expDb.close();
      }
    } finally {
      await new Promise(r => setTimeout(r, 50));
      try {
        if (fs.existsSync(tmpExportPath)) fs.unlinkSync(tmpExportPath);
      } catch (e) {
        // file lock in Windows process might release on process exit
      }
    }
  });
});
