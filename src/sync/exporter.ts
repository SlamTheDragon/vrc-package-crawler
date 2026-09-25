import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { db } from "../db.ts";

export interface ExportOptions {
  mode: "catalog" | "lake";
  outputPath?: string;
}

/**
 * Generates an exportable SQLite database:
 * - 'catalog': Single-file defragmented database containing canonical packages,
 *             fronts, media metadata, and pre-indexed SQLite FTS5 for offline / Tauri search.
 * - 'lake': Full disaster-recovery snapshot of the entire raw observation lake via VACUUM INTO.
 */
export async function runDatabaseExport(mode: "catalog" | "lake" = "catalog", customOut?: string, sourceDb?: Database): Promise<string> {
  const targetFile = customOut || (mode === "catalog" ? "vrc_catalog.db" : "vrc_lake_snapshot.db");
  const fullTargetPath = path.isAbsolute(targetFile) ? targetFile : path.resolve(CONFIG.baseDir, targetFile);

  logger.info(`[Exporter] Starting export in mode '${mode}' to: ${fullTargetPath}`);

  if (fs.existsSync(fullTargetPath)) {
    try {
      fs.unlinkSync(fullTargetPath);
      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      logger.warn(`[Exporter] Could not delete existing ${fullTargetPath}, will attempt overwrite: ${e}`);
    }
  }

  if (mode === "lake") {
    // Atomic SQLite VACUUM INTO snapshot of crawler_state.db
    const escaped = fullTargetPath.replace(/'/g, "''");
    logger.info("[Exporter] Executing native SQLite VACUUM INTO for lake snapshot...");
    (sourceDb || db.rawDb).run(`VACUUM INTO '${escaped}';`);
    const stats = fs.statSync(fullTargetPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    logger.info(`[Exporter] Lake snapshot complete! File: ${fullTargetPath} (${sizeMb} MB)`);
    return fullTargetPath;
  }

  // Catalog mode: Curated, defragmented single-file database with FTS5
  logger.info("[Exporter] Building lightweight defragmented catalog database with SQLite FTS5...");
  const catDb = new Database(fullTargetPath, { create: true });

  catDb.run("PRAGMA busy_timeout = 10000;");
  catDb.run("PRAGMA journal_mode = DELETE;");
  catDb.run("PRAGMA synchronous = OFF;");

  // Create clean schema in export database
  catDb.run(`
    CREATE TABLE canonical_packages (
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
      created_at_confidence TEXT DEFAULT 'unknown',
      lifecycle TEXT DEFAULT 'published',
      lifecycle_updated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  catDb.run(`
    CREATE TABLE package_fronts (
      id TEXT PRIMARY KEY,
      canonical_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_item_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      price_currency TEXT,
      price_amount REAL,
      origin_created_at TEXT,
      origin_updated_at TEXT,
      raw_entity_id TEXT NOT NULL,
      media_urls_json TEXT DEFAULT '[]',
      youtube_urls_json TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  catDb.run(`
    CREATE TABLE media_cache (
      id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL UNIQUE,
      blurhash TEXT,
      phash_64 TEXT,
      width INTEGER,
      height INTEGER,
      content_type TEXT,
      etag TEXT,
      last_processed_at TEXT NOT NULL
    );
  `);

  // Downstream terms notice and catalog metadata (LEGAL.md §10.1, §10.7)
  catDb.run(`
    CREATE TABLE IF NOT EXISTS catalog_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR REPLACE INTO catalog_metadata VALUES 
      ('terms_of_use_url', 'https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md'),
      ('terms_version', '1.1'),
      ('repository_url', 'https://github.com/SlamTheDragon/vrc-package-crawler'),
      ('catalog_name', 'vrc-package-crawler Catalog Index'),
      ('license_framework', 'Layer-A: AGPL-3.0 / Layer-B: Database Compilation Terms / Layer-C: Origin Author Rights'),
      ('export_epoch', strftime('%s', 'now'));
  `);

  // Stream canonical_packages in chunks (excluding delisted & DMCA-removed packages per LEGAL.md §9.5)
  const srcDb = sourceDb || db.rawDb;
  const packages = srcDb.query("SELECT * FROM canonical_packages WHERE lifecycle NOT IN ('delisted', 'dmca_removed', 'creator_opted_out');").all() as any[];
  logger.info(`[Exporter] Copying ${packages.length} canonical packages...`);

  const insertPkg = catDb.prepare(`
    INSERT INTO canonical_packages (
      id, canonical_id, name, author, authors_json, category, subcategory, type,
      description, primary_platform, platforms_json, url, vcc_url,
      price_currency, price_amount,
      is_vcc, tags_json, dependencies_json, source_ids_json, media_id,
      media_urls_json, youtube_urls_json, origin_created_at, origin_updated_at,
      created_at_confidence, lifecycle, lifecycle_updated_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    );
  `);

  catDb.transaction(() => {
    for (const p of packages) {
      insertPkg.run(
        p.id, p.canonical_id, p.name, p.author, p.authors_json, p.category, p.subcategory, p.type,
        p.description, p.primary_platform, p.platforms_json, p.url, p.vcc_url,
        p.price_currency || "USD", p.price_amount || 0,
        p.is_vcc || 0, p.tags_json || "[]", p.dependencies_json || "{}", p.source_ids_json, p.media_id,
        p.media_urls_json || "[]", p.youtube_urls_json || "[]", p.origin_created_at, p.origin_updated_at,
        p.created_at_confidence || "unknown", p.lifecycle || "published", p.lifecycle_updated_at,
        p.created_at, p.updated_at
      );
    }
  })();

  // Stream package_fronts (only for published/active canonical packages)
  const fronts = srcDb.query(`
    SELECT pf.*
    FROM package_fronts pf
    JOIN canonical_packages cp ON pf.canonical_id = cp.canonical_id
    WHERE cp.lifecycle NOT IN ('delisted', 'dmca_removed', 'creator_opted_out');
  `).all() as any[];
  logger.info(`[Exporter] Copying ${fronts.length} storefront records...`);

  const insertFront = catDb.prepare(`
    INSERT INTO package_fronts (
      id, canonical_id, platform, platform_item_id, url, title, author,
      price_currency, price_amount, origin_created_at, origin_updated_at,
      raw_entity_id, media_urls_json, youtube_urls_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  catDb.transaction(() => {
    for (const f of fronts) {
      insertFront.run(
        f.id, f.canonical_id, f.platform, f.platform_item_id, f.url, f.title, f.author,
        f.price_currency, f.price_amount, f.origin_created_at, f.origin_updated_at,
        f.raw_entity_id, f.media_urls_json || "[]", f.youtube_urls_json || "[]",
        f.created_at, f.updated_at
      );
    }
  })();

  // Stream media_cache (pure origin metadata without any BLOBs, eliminating dangling foreign keys - OVERLOOKED-4)
  const mediaRecords = srcDb.query(`
    SELECT DISTINCT mc.*
    FROM media_cache mc
    JOIN canonical_packages cp ON cp.media_id = mc.id
    WHERE cp.lifecycle NOT IN ('delisted', 'dmca_removed', 'creator_opted_out');
  `).all() as any[];
  logger.info(`[Exporter] Copying ${mediaRecords.length} media metadata records...`);

  const insertMedia = catDb.prepare(`
    INSERT INTO media_cache (
      id, source_url, blurhash, phash_64, width, height, content_type, etag, last_processed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  catDb.transaction(() => {
    for (const m of mediaRecords) {
      insertMedia.run(
        m.id, m.source_url, m.blurhash || null, m.phash_64 || null,
        m.width || null, m.height || null, m.content_type || "image/webp",
        m.etag || null, m.last_processed_at
      );
    }
  })();

  // Create SQLite FTS5 Full-Text Search Virtual Table
  logger.info("[Exporter] Constructing pre-indexed SQLite FTS5 search index...");
  catDb.run(`
    CREATE VIRTUAL TABLE packages_fts USING fts5(
      canonical_id UNINDEXED,
      name,
      author,
      category,
      subcategory,
      description,
      tags_json,
      content='canonical_packages',
      content_rowid='rowid'
    );
  `);

  catDb.run(`
    INSERT INTO packages_fts(rowid, canonical_id, name, author, category, subcategory, description, tags_json)
    SELECT rowid, canonical_id, name, author, category, subcategory, description, tags_json
    FROM canonical_packages;
  `);

  // Optimize and defragment SQLite catalog
  logger.info("[Exporter] Defragmenting and running VACUUM...");
  catDb.run("VACUUM;");
  catDb.close();

  const stats = fs.statSync(fullTargetPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  logger.info(`[Exporter] Export successful! Catalog ready at: ${fullTargetPath} (${sizeMb} MB, ${packages.length} packages pre-indexed with FTS5).`);
  return fullTargetPath;
}

export const exportCatalog = (customOut?: string, sourceDb?: Database) => runDatabaseExport("catalog", customOut, sourceDb);

if (import.meta.main) {
  const mode = process.argv.includes("--lake") ? "lake" : "catalog";
  runDatabaseExport(mode).then((path) => {
    console.log(`[CLI] Export finished successfully: ${path}`);
    process.exit(0);
  }).catch((err) => {
    console.error("[CLI] Export failed:", err);
    process.exit(1);
  });
}
