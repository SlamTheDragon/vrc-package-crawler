import { Database } from "bun:sqlite";
import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";

export type PlatformType = "booth" | "github" | "vpm" | "gumroad" | "jinxxy" | "itch";

export interface FrontierV2Item {
  url: string;
  platform: PlatformType;
  status: "pending" | "fetching" | "done" | "failed";
  attempts: number;
  etag?: string | null;
  last_modified?: string | null;
  change_rate_lambda: number;
  fetch_interval_sec: number;
  last_fetched_at?: string | null;
  next_fetch_at: string;
  priority: number;
  discovered_at: string;
  updated_at: string;
}

export interface EntityV2Record {
  id: string;
  platform: string;
  url: string;
  title: string;
  author: string;
  price_currency?: string | null;
  price_amount?: number | null;
  description: string;
  tags_json?: string;
  external_links_json?: string;
  raw_json?: string;
  is_quarantined?: number;
  quarantine_reasons_json?: string;
  origin_created_at?: string | null;
  origin_updated_at?: string | null;
  observed_at: string;
  created_at: string;
  updated_at: string;
}

export interface CanonicalPackageV2 {
  id: string;
  canonical_id: string;
  name: string;
  author: string;
  authors_json: string;
  category: string;
  subcategory: string;
  type: string;
  description: string;
  primary_platform: string;
  platforms_json: string;
  url: string;
  vcc_url?: string | null;
  github_url?: string | null;
  booth_url?: string | null;
  gumroad_url?: string | null;
  jinxxy_url?: string | null;
  itch_url?: string | null;
  price_currency: string;
  price_amount: number;
  is_vcc: number;
  tags_json: string;
  dependencies_json: string;
  source_ids_json: string;
  media_id?: string | null;
  origin_created_at?: string | null;
  origin_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackageFrontV2 {
  id: string;
  canonical_id: string;
  platform: string;
  platform_item_id: string;
  url: string;
  title: string;
  author: string;
  price_currency?: string | null;
  price_amount?: number | null;
  origin_created_at?: string | null;
  origin_updated_at?: string | null;
  raw_entity_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreatorOptOutV2 {
  id: string;
  creator_name: string;
  platform: string;
  pattern: string;
  reason: string;
  opted_out_at: string;
  verified: number;
}

export interface MediaCacheRecord {
  id: string;
  source_url: string;
  webp_data?: Buffer | Uint8Array | null;
  webp_size_bytes?: number;
  blurhash?: string | null;
  phash_64?: string | null;
  width?: number;
  height?: number;
  content_type?: string;
  etag?: string | null;
  last_processed_at: string;
}

export class CrawlerDBV2 {
  private db: Database;
  private isClosed: boolean = false;

  public get closed(): boolean {
    return this.isClosed;
  }

  public get rawDb(): Database {
    return this.db;
  }

  constructor(customPath?: string) {
    this.db = new Database(customPath || CONFIG.dbPath, { create: true });
    this.initSchema();
    this.resetStaleFetching();
  }

  public prepare(sql: string) {
    return this.db.prepare(sql);
  }

  public query(sql: string) {
    return this.db.query(sql);
  }

  public run(sql: string, params?: any[]) {
    return params ? (this.db.run as any)(sql, params) : this.db.run(sql);
  }

  public transaction(fn: (...args: any[]) => any) {
    return this.db.transaction(fn);
  }

  private initSchema() {
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA synchronous = NORMAL;");
    this.db.run("PRAGMA busy_timeout = 10000;");

    // 1. Frontier V2 with Poisson adaptive change rate & ETag/Last-Modified headers
    this.db.run(`
      CREATE TABLE IF NOT EXISTS frontier_v2 (
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_frontier_v2_status_next ON frontier_v2(status, next_fetch_at);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_frontier_v2_platform_status ON frontier_v2(platform, status);");

    // 2. Entities V2: Immutable Observation Lake
    this.db.run(`
      CREATE TABLE IF NOT EXISTS entities_v2 (
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_entities_v2_platform ON entities_v2(platform);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_entities_v2_author ON entities_v2(author);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_entities_v2_quarantined ON entities_v2(is_quarantined);");

    // 3. Creator Opt-Outs V2
    this.db.run(`
      CREATE TABLE IF NOT EXISTS creator_opt_outs_v2 (
        id TEXT PRIMARY KEY,
        creator_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        pattern TEXT NOT NULL,
        reason TEXT NOT NULL,
        opted_out_at TEXT NOT NULL,
        verified INTEGER DEFAULT 1
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_opt_outs_creator ON creator_opt_outs_v2(creator_name);");

    // 4. Canonical Packages V2 Projections
    this.db.run(`
      CREATE TABLE IF NOT EXISTS canonical_packages_v2 (
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
        github_url TEXT,
        booth_url TEXT,
        gumroad_url TEXT,
        jinxxy_url TEXT,
        itch_url TEXT,
        price_currency TEXT DEFAULT 'USD',
        price_amount REAL DEFAULT 0,
        is_vcc INTEGER NOT NULL DEFAULT 0,
        tags_json TEXT DEFAULT '[]',
        dependencies_json TEXT DEFAULT '{}',
        source_ids_json TEXT NOT NULL,
        media_id TEXT,
        origin_created_at TEXT,
        origin_updated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_category ON canonical_packages_v2(category);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_subcategory ON canonical_packages_v2(subcategory);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_type ON canonical_packages_v2(type);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_is_vcc ON canonical_packages_v2(is_vcc);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_primary_platform ON canonical_packages_v2(primary_platform);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_updated_at ON canonical_packages_v2(updated_at);");

    // 5. Package Fronts V2 (Decoupled store fronts per package)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS package_fronts_v2 (
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_fronts_canonical_id ON package_fronts_v2(canonical_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_fronts_platform ON package_fronts_v2(platform);");

    // 6. Media Cache V2 (Independent table for WebP thumbnails, BlurHash, and 64-bit pHash)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS media_cache_v2 (
        id TEXT PRIMARY KEY,
        source_url TEXT NOT NULL UNIQUE,
        webp_data BLOB,
        webp_size_bytes INTEGER,
        blurhash TEXT,
        phash_64 TEXT,
        width INTEGER,
        height INTEGER,
        content_type TEXT,
        etag TEXT,
        last_processed_at TEXT NOT NULL
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_media_source_url ON media_cache_v2(source_url);");

    // 7. Sync Checkpoints (High-watermark tracking for incremental edge syncing)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sync_checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_target TEXT NOT NULL,
        last_synced_id TEXT,
        last_synced_rowid INTEGER DEFAULT 0,
        records_synced INTEGER DEFAULT 0,
        synced_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'success',
        error_message TEXT
      );
    `);
  }

  public resetStaleFetching(): number {
    if (this.isClosed) return 0;
    try {
      const reset = this.db.run("UPDATE frontier_v2 SET status = 'pending' WHERE status = 'fetching';");
      return reset.changes;
    } catch {
      return 0;
    }
  }

  public isCreatorOptedOut(creatorName: string, platform?: string): boolean {
    if (!creatorName) return false;
    const cleanName = creatorName.trim().toLowerCase();
    const records = this.db.prepare("SELECT creator_name, pattern, verified FROM creator_opt_outs_v2 WHERE verified = 1;").all() as any[];
    for (const r of records) {
      if (r.creator_name.toLowerCase() === cleanName) return true;
      try {
        const re = new RegExp(r.pattern, "i");
        if (re.test(cleanName)) return true;
      } catch (_) {}
    }
    return false;
  }

  public registerOptOut(creatorName: string, platform: string, pattern: string, reason: string): boolean {
    const id = `optout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    try {
      this.db.run(`
        INSERT OR REPLACE INTO creator_opt_outs_v2 (id, creator_name, platform, pattern, reason, opted_out_at, verified)
        VALUES (?, ?, ?, ?, ?, ?, 1);
      `, [id, creatorName, platform, pattern, reason, now]);
      return true;
    } catch (err) {
      logger.error(`Failed to register opt-out for ${creatorName}`, err);
      return false;
    }
  }

  public queueUrl(url: string, platform: PlatformType, priority: number = 0): boolean {
    if (this.isClosed) return false;
    const now = new Date().toISOString();
    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO frontier_v2 (
          url, platform, status, attempts, change_rate_lambda, fetch_interval_sec,
          next_fetch_at, priority, discovered_at, updated_at
        ) VALUES (?, ?, 'pending', 0, 0.05, 86400, ?, ?, ?, ?);
      `);
      const res = stmt.run(url, platform, now, priority, now, now);
      return res.changes > 0;
    } catch {
      return false;
    }
  }

  public getNextPendingForPlatform(platform: PlatformType, limit: number = 5): FrontierV2Item[] {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT url, platform, status, attempts, etag, last_modified, change_rate_lambda,
             fetch_interval_sec, last_fetched_at, next_fetch_at, priority, discovered_at, updated_at
      FROM frontier_v2
      WHERE platform = ? AND status = 'pending' AND next_fetch_at <= ?
      ORDER BY priority DESC, next_fetch_at ASC
      LIMIT ?;
    `);
    return stmt.all(platform, now, limit) as FrontierV2Item[];
  }

  public recordCrawlResult(
    url: string,
    result: "success_changed" | "success_unchanged" | "failed",
    etag?: string | null,
    lastModified?: string | null
  ) {
    const now = new Date().toISOString();
    const row = this.db.prepare("SELECT fetch_interval_sec, attempts FROM frontier_v2 WHERE url = ?;").get(url) as any;
    const currentInterval = row?.fetch_interval_sec || 86400;

    let newInterval = currentInterval;
    let newStatus = "done";

    if (result === "success_unchanged") {
      // Cho-Garcia-Molina exponential backoff on 304 Not Modified
      newInterval = Math.min(30 * 86400, Math.round(currentInterval * 1.5));
    } else if (result === "success_changed") {
      // Changed resource: refresh sooner
      newInterval = Math.max(6 * 3600, Math.round(currentInterval / 1.5));
    } else {
      // Failed
      newStatus = "failed";
      newInterval = Math.min(7 * 86400, currentInterval * 2);
    }

    const nextFetchTime = new Date(Date.now() + newInterval * 1000).toISOString();

    this.db.run(`
      UPDATE frontier_v2
      SET status = ?,
          attempts = attempts + 1,
          etag = COALESCE(?, etag),
          last_modified = COALESCE(?, last_modified),
          fetch_interval_sec = ?,
          last_fetched_at = ?,
          next_fetch_at = ?,
          updated_at = ?
      WHERE url = ?;
    `, [newStatus, etag, lastModified, newInterval, now, nextFetchTime, now, url]);
  }

  public getMetrics() {
    const totalDiscovered = (this.db.prepare("SELECT COUNT(*) as c FROM frontier_v2;").get() as any).c;
    const totalFreshPending = (this.db.prepare("SELECT COUNT(*) as c FROM frontier_v2 WHERE status = 'pending' AND attempts = 0;").get() as any).c;
    const totalRetrying = (this.db.prepare("SELECT COUNT(*) as c FROM frontier_v2 WHERE status = 'pending' AND attempts > 0;").get() as any).c;
    const totalPending = (this.db.prepare("SELECT COUNT(*) as c FROM frontier_v2 WHERE status = 'pending';").get() as any).c;
    const totalDone = (this.db.prepare("SELECT COUNT(*) as c FROM frontier_v2 WHERE status = 'done';").get() as any).c;
    const totalFailed = (this.db.prepare("SELECT COUNT(*) as c FROM frontier_v2 WHERE status = 'failed';").get() as any).c;
    const totalEntities = (this.db.prepare("SELECT COUNT(*) as c FROM entities_v2 WHERE is_quarantined = 0;").get() as any).c;
    const totalQuarantined = (this.db.prepare("SELECT COUNT(*) as c FROM entities_v2 WHERE is_quarantined = 1;").get() as any).c;
    const totalMerged = (this.db.prepare("SELECT COUNT(*) as c FROM canonical_packages_v2;").get() as any).c;

    const platforms: PlatformType[] = ["booth", "github", "vpm", "gumroad", "jinxxy", "itch"];
    const platformStats: Record<string, { pending: number; retrying: number; done: number; entities: number }> = {};

    for (const p of platforms) {
      const pending = (this.db.prepare("SELECT COUNT(*) as c FROM frontier_v2 WHERE platform = ? AND status = 'pending' AND attempts = 0;").get(p) as any).c;
      const retrying = (this.db.prepare("SELECT COUNT(*) as c FROM frontier_v2 WHERE platform = ? AND status = 'pending' AND attempts > 0;").get(p) as any).c;
      const done = (this.db.prepare("SELECT COUNT(*) as c FROM frontier_v2 WHERE platform = ? AND status = 'done';").get(p) as any).c;
      const entities = (this.db.prepare("SELECT COUNT(*) as c FROM entities_v2 WHERE platform = ? AND is_quarantined = 0;").get(p) as any).c;
      platformStats[p] = { pending, retrying, done, entities };
    }

    return {
      totalDiscovered,
      totalPending,
      totalFreshPending,
      totalRetrying,
      totalDone,
      totalFailed,
      totalDiscarded: 0,
      totalEntities,
      totalQuarantined,
      totalMerged,
      platformStats
    };
  }

  public close() {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      this.db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch (_) {}
    try {
      this.db.close();
    } catch (_) {}
  }
}

export const dbV2 = new CrawlerDBV2();
