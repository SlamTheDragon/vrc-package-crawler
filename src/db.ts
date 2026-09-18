import { Database } from "bun:sqlite";
import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";

export type PlatformType = "booth" | "github" | "vpm" | "gumroad" | "jinxxy" | "itch";

export interface PlatformMetrics {
  pending: number;
  retrying: number;
  fetching: number;
  done: number;
  failed: number;
  entities: number;
}

export interface SystemMetrics {
  totalDiscovered: number;
  totalPending: number;
  totalFreshPending: number;
  totalRetrying: number;
  totalFetching: number;
  totalDone: number;
  totalFailed: number;
  totalDiscarded: number;
  totalEntities: number;
  totalQuarantined: number;
  totalMerged: number;
  totalCanonical: number;
  platformStats: Record<PlatformType, PlatformMetrics>;
}

export interface FrontierItem {
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

export interface EntityRecord {
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
  observed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CanonicalPackage {
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
  created_at_confidence?: "confirmed" | "inferred" | "unknown" | null;
  lifecycle?: "published" | "updated" | "delisted" | "archived" | "paywall_introduced" | "dmca_removed" | "creator_opted_out";
  lifecycle_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CuratorOverride {
  id: string;
  canonical_id: string;
  name_override?: string | null;
  title_override?: string | null;
  url_override?: string | null;
  description_override?: string | null;
  category_override?: string | null;
  subcategory_override?: string | null;
  added_tags_json?: string;
  removed_tags_json?: string;
  reason?: string | null;
  reporter_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserReport {
  report_id: string;
  target_package_id: string;
  target_package_name: string;
  branch: "categorization" | "irrelevance" | "listing" | "tags" | "discovery_query";
  branch_payload_json: string;
  reporter_notes?: string | null;
  client_fingerprint?: string | null;
  trust_tier?: "anonymous" | "verified_creator" | "trusted_curator";
  status: "pending" | "applied" | "rejected";
  applied_at?: string | null;
  submitted_at: string;
  created_at: string;
}

export interface SearchPattern {
  id: string;
  query: string;
  query_intent?: string | null;
  relevance_vote: "boost" | "suppress";
  negative_tokens_json: string;
  suggested_seeds_json: string;
  weight?: number;
  created_at: string;
  updated_at: string;
}

export interface PackageFront {
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

export interface CreatorOptOut {
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

// Backwards compatibility aliases
export type FrontierV2Item = FrontierItem;
export type EntityV2Record = EntityRecord;
export type CanonicalPackageV2 = CanonicalPackage;
export type CuratorOverrideV2 = CuratorOverride;
export type UserReportV2 = UserReport;
export type SearchPatternV2 = SearchPattern;
export type PackageFrontV2 = PackageFront;
export type CreatorOptOutV2 = CreatorOptOut;

export class CrawlerDB {
  private db: Database;
  private _isClosed: boolean = false;

  public get isClosed(): boolean {
    return this._isClosed;
  }

  public get closed(): boolean {
    return this._isClosed;
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

    // Seamless automatic table rename from legacy _v2 tables to unified clean names
    const tableRenames: [string, string][] = [
      ["frontier_v2", "frontier"],
      ["entities_v2", "entities"],
      ["creator_opt_outs_v2", "creator_opt_outs"],
      ["canonical_packages_v2", "canonical_packages"],
      ["package_fronts_v2", "package_fronts"],
      ["media_cache_v2", "media_cache"],
      ["curator_overrides_v2", "curator_overrides"],
      ["user_reports_v2", "user_reports"],
      ["search_patterns_v2", "search_patterns"],
    ];

    for (const [oldName, newName] of tableRenames) {
      try {
        const hasOld = this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?;").get(oldName);
        const hasNew = this.db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?;").get(newName);
        if (hasOld && !hasNew) {
          logger.info(`[DB] Upgrading legacy table '${oldName}' -> '${newName}'...`);
          this.db.run(`ALTER TABLE ${oldName} RENAME TO ${newName};`);
        } else if (hasOld && hasNew) {
          this.db.run(`DROP TABLE IF EXISTS ${oldName};`);
        }
      } catch (err) {
        logger.warn(`[DB] Notice during table rename ${oldName} -> ${newName}:`, err);
      }
    }

    // 1. Frontier with Poisson adaptive change rate & ETag/Last-Modified headers
    this.db.run(`
      CREATE TABLE IF NOT EXISTS frontier (
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_frontier_status_next ON frontier(status, next_fetch_at);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_frontier_platform_status ON frontier(platform, status);");

    // 2. Entities: Immutable Observation Lake
    this.db.run(`
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_entities_platform ON entities(platform);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_entities_author ON entities(author);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_entities_quarantined ON entities(is_quarantined);");

    // 3. Creator Opt-Outs
    this.db.run(`
      CREATE TABLE IF NOT EXISTS creator_opt_outs (
        id TEXT PRIMARY KEY,
        creator_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        pattern TEXT NOT NULL,
        reason TEXT NOT NULL,
        opted_out_at TEXT NOT NULL,
        verified INTEGER DEFAULT 1
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_opt_outs_creator ON creator_opt_outs(creator_name);");

    // 4. Canonical Packages Projections
    this.db.run(`
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_category ON canonical_packages(category);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_subcategory ON canonical_packages(subcategory);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_type ON canonical_packages(type);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_is_vcc ON canonical_packages(is_vcc);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_primary_platform ON canonical_packages(primary_platform);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_canonical_updated_at ON canonical_packages(updated_at);");

    try { this.db.run("ALTER TABLE canonical_packages ADD COLUMN created_at_confidence TEXT DEFAULT 'unknown';"); } catch (_) {}
    try { this.db.run("ALTER TABLE canonical_packages ADD COLUMN lifecycle TEXT DEFAULT 'published';"); } catch (_) {}
    try { this.db.run("ALTER TABLE canonical_packages ADD COLUMN lifecycle_updated_at TEXT;"); } catch (_) {}

    // 5. Package Fronts (Decoupled store fronts per package)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS package_fronts (
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_fronts_canonical_id ON package_fronts(canonical_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_fronts_platform ON package_fronts(platform);");

    // 6. Media Cache (Independent table for WebP thumbnails, BlurHash, and 64-bit pHash)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS media_cache (
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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_media_source_url ON media_cache(source_url);");

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

    // 8. Curator Overrides (Persistent user/curator overrides for name, description, tags, categories)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS curator_overrides (
        id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL UNIQUE,
        name_override TEXT,
        title_override TEXT,
        url_override TEXT,
        description_override TEXT,
        category_override TEXT,
        subcategory_override TEXT,
        added_tags_json TEXT DEFAULT '[]',
        removed_tags_json TEXT DEFAULT '[]',
        reason TEXT,
        reporter_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_curator_overrides_canonical ON curator_overrides(canonical_id);");

    // 9. User Reports (Schema 4 Branched User Steering Reports)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_reports (
        report_id TEXT PRIMARY KEY,
        target_package_id TEXT NOT NULL,
        target_package_name TEXT NOT NULL,
        branch TEXT NOT NULL CHECK(branch IN ('categorization','irrelevance','listing','tags','discovery_query')),
        branch_payload_json TEXT NOT NULL,
        reporter_notes TEXT,
        client_fingerprint TEXT,
        trust_tier TEXT DEFAULT 'anonymous' CHECK(trust_tier IN ('anonymous','verified_creator','trusted_curator')),
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','applied','rejected')),
        applied_at TEXT,
        submitted_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_user_reports_target ON user_reports(target_package_id);");

    // 10. Search Patterns (Dynamic closed-loop search queries, negative tokens, and boost/suppress rules)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS search_patterns (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL UNIQUE,
        query_intent TEXT,
        relevance_vote TEXT NOT NULL CHECK(relevance_vote IN ('boost','suppress')),
        negative_tokens_json TEXT DEFAULT '[]',
        suggested_seeds_json TEXT DEFAULT '[]',
        weight REAL DEFAULT 1.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    try {
      this.db.run(`
        DELETE FROM search_patterns WHERE rowid NOT IN (
          SELECT MIN(rowid) FROM search_patterns GROUP BY query
        );
      `);
      this.db.run("DROP INDEX IF EXISTS idx_search_patterns_query;");
      this.db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_search_patterns_query ON search_patterns(query);");
    } catch (_) {}
  }

  public resetStaleFetching(): number {
    if (this.isClosed) return 0;
    try {
      const reset = this.db.run("UPDATE frontier SET status = 'pending' WHERE status = 'fetching';");
      return reset.changes;
    } catch {
      return 0;
    }
  }

  public isCreatorOptedOut(creatorName: string, platform?: string): boolean {
    if (!creatorName) return false;
    const cleanName = creatorName.trim().toLowerCase();
    const records = this.db.prepare("SELECT creator_name, pattern, verified FROM creator_opt_outs WHERE verified = 1;").all() as any[];
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
        INSERT OR REPLACE INTO creator_opt_outs (id, creator_name, platform, pattern, reason, opted_out_at, verified)
        VALUES (?, ?, ?, ?, ?, ?, 1);
      `, [id, creatorName, platform, pattern, reason, now]);
      return true;
    } catch (err) {
      logger.error(`Failed to register opt-out for ${creatorName}`, err);
      return false;
    }
  }

  public sanitizeUrl(rawUrl: string): string | null {
    if (!rawUrl || typeof rawUrl !== "string") return null;
    let clean = rawUrl.trim();
    clean = clean.replace(/^[(\[<"']+|[)\]>"']+$/g, "").trim();
    clean = clean.replace(/^https?:\/\/[(\s]*https?:?\/?\/?/i, "https://");
    clean = clean.replace(/^https?:\/\/https?:\/\//i, "https://");
    clean = clean.replace(/^(https?:\/\/)(https?:\/\/)/i, "$1");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) return null;
    try {
      const parsed = new URL(clean);
      if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
      if (/[:/\\()\[\]{}<>]/.test(parsed.hostname)) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  public queueUrl(url: string, platform: PlatformType, priority: number = 0): boolean {
    if (this._isClosed) return false;
    const cleanUrl = this.sanitizeUrl(url);
    if (!cleanUrl) return false;
    const now = new Date().toISOString();
    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO frontier (
          url, platform, status, attempts, change_rate_lambda, fetch_interval_sec,
          next_fetch_at, priority, discovered_at, updated_at
        ) VALUES (?, ?, 'pending', 0, 0.05, 86400, ?, ?, ?, ?);
      `);
      const res = stmt.run(cleanUrl, platform, now, priority, now, now);
      return res.changes > 0;
    } catch {
      return false;
    }
  }

  public queueBatchUrls(items: { url: string; platform: PlatformType; priority?: number }[]): number {
    if (this._isClosed) return 0;
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO frontier (
        url, platform, status, attempts, etag, last_modified,
        change_rate_lambda, fetch_interval_sec, last_fetched_at, next_fetch_at,
        priority, discovered_at, updated_at
      ) VALUES (?, ?, 'pending', 0, NULL, NULL, 0.05, 86400, NULL, ?, ?, ?, ?);
    `);

    let count = 0;
    this.db.transaction(() => {
      for (const item of items) {
        const cleanUrl = this.sanitizeUrl(item.url);
        if (!cleanUrl) continue;
        const res = insert.run(cleanUrl, item.platform, now, item.priority || 0, now, now);
        if (res.changes > 0) count++;
      }
    })();
    return count;
  }

  public getNextPending(limit: number = 10): FrontierItem[] {
    const now = new Date().toISOString();
    return this.db.prepare(`
      SELECT url, platform, status, attempts, etag, last_modified, change_rate_lambda,
             fetch_interval_sec, last_fetched_at, next_fetch_at, priority, discovered_at, updated_at
      FROM frontier
      WHERE status = 'pending' AND next_fetch_at <= ?
      ORDER BY priority DESC, next_fetch_at ASC
      LIMIT ?;
    `).all(now, limit) as FrontierItem[];
  }

  public getNextPendingForPlatform(platform: PlatformType, limit: number = 5): FrontierItem[] {
    const now = new Date().toISOString();
    const genLimit = Math.max(1, Math.floor(limit * 0.2));
    const genItems = this.db.prepare(`
      SELECT url, platform, status, attempts, etag, last_modified, change_rate_lambda,
             fetch_interval_sec, last_fetched_at, next_fetch_at, priority, discovered_at, updated_at
      FROM frontier
      WHERE platform = ? AND status = 'pending' AND next_fetch_at <= ?
        AND (url LIKE '%/search%' OR url LIKE '%/browse%' OR url LIKE '%?query=%' OR url LIKE '%?q=%' OR url LIKE '%/items?%' OR url LIKE '%/tools%')
      ORDER BY priority DESC, next_fetch_at ASC
      LIMIT ?;
    `).all(platform, now, genLimit) as FrontierItem[];

    const itemLimit = limit - genItems.length;
    const directItems = this.db.prepare(`
      SELECT url, platform, status, attempts, etag, last_modified, change_rate_lambda,
             fetch_interval_sec, last_fetched_at, next_fetch_at, priority, discovered_at, updated_at
      FROM frontier
      WHERE platform = ? AND status = 'pending' AND next_fetch_at <= ?
        AND NOT (url LIKE '%/search%' OR url LIKE '%/browse%' OR url LIKE '%?query=%' OR url LIKE '%?q=%' OR url LIKE '%/items?%' OR url LIKE '%/tools%')
      ORDER BY priority DESC, next_fetch_at ASC
      LIMIT ?;
    `).all(platform, now, itemLimit) as FrontierItem[];

    return [...genItems, ...directItems];
  }

  public markStatus(
    url: string,
    status: "pending" | "fetching" | "done" | "failed",
    notes?: string,
    etag?: string | null,
    lastModified?: string | null
  ): void {
    if (this._isClosed) return;
    const now = new Date().toISOString();
    try {
      if (status === "done") {
        this.db.run(`
          UPDATE frontier
          SET status = 'done',
              attempts = attempts + 1,
              etag = COALESCE(?, etag),
              last_modified = COALESCE(?, last_modified),
              last_fetched_at = ?,
              next_fetch_at = datetime('now', '+' || fetch_interval_sec || ' seconds'),
              updated_at = ?
          WHERE url = ?;
        `, [etag ?? null, lastModified ?? null, now, now, url]);
      } else if (status === "failed") {
        this.db.run(`
          UPDATE frontier
          SET status = 'failed',
              attempts = attempts + 1,
              next_fetch_at = datetime('now', '+3600 seconds'),
              updated_at = ?
          WHERE url = ?;
        `, [now, url]);
      } else {
        this.db.run(`
          UPDATE frontier
          SET status = ?,
              updated_at = ?
          WHERE url = ?;
        `, [status, now, url]);
      }
    } catch (_) {}
  }

  public discardFailedUrl(url: string, platform: string, reason: string): boolean {
    if (this._isClosed) return false;
    const now = new Date().toISOString();
    try {
      this.db.run(`
        UPDATE frontier
        SET status = 'failed',
            attempts = 99,
            next_fetch_at = datetime('now', '+1 year'),
            updated_at = ?
        WHERE url = ?;
      `, [now, url]);
      return true;
    } catch {
      return false;
    }
  }

  public requeueForReaudit(limit: number = 100): number {
    if (this._isClosed) return 0;
    const now = new Date().toISOString();
    try {
      const res = this.db.run(`
        UPDATE frontier
        SET status = 'pending',
            next_fetch_at = ?,
            updated_at = ?
        WHERE status = 'done'
        ORDER BY last_fetched_at ASC
        LIMIT ?;
      `, [now, now, limit]);
      return res.changes;
    } catch {
      return 0;
    }
  }

  public saveEntity(record: EntityRecord): boolean {
    if (this._isClosed) return false;
    const now = new Date().toISOString();
    let originCreated = record.origin_created_at || null;
    let originUpdated = record.origin_updated_at || null;
    if ((!originCreated || !originUpdated) && record.raw_json) {
      try {
        const parsed = JSON.parse(record.raw_json);
        if (!originCreated) originCreated = parsed.originCreatedAt || parsed.published_at || null;
        if (!originUpdated) originUpdated = parsed.originUpdatedAt || parsed.updated_at || null;
      } catch (_) {}
    }

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO entities (
          id, platform, url, title, author, price_currency, price_amount,
          description, tags_json, external_links_json, raw_json,
          is_quarantined, quarantine_reasons_json, origin_created_at, origin_updated_at,
          observed_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          0, '[]', ?, ?, ?, COALESCE((SELECT created_at FROM entities WHERE id = ?), ?), ?
        );
      `);
      stmt.run(
        record.id,
        record.platform,
        record.url,
        record.title,
        record.author,
        record.price_currency || null,
        record.price_amount || null,
        record.description || "",
        record.tags_json || "[]",
        record.external_links_json || "[]",
        record.raw_json || "{}",
        originCreated,
        originUpdated,
        now,
        record.id,
        record.created_at || now,
        now
      );
      return true;
    } catch (err) {
      logger.error(`Failed to save entity ${record.id}`, err);
      return false;
    }
  }

  public quarantineEntity(
    id: string,
    platform: string,
    url: string,
    title: string,
    author: string,
    reasons: string[]
  ): boolean {
    if (this._isClosed) return false;
    const now = new Date().toISOString();
    try {
      const reasonsJson = JSON.stringify(reasons);
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO entities (
          id, platform, url, title, author, is_quarantined, quarantine_reasons_json,
          observed_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, 1, ?,
          ?, COALESCE((SELECT created_at FROM entities WHERE id = ?), ?), ?
        );
      `);
      stmt.run(id, platform, url, title, author, reasonsJson, now, id, now, now);
      return true;
    } catch {
      return false;
    }
  }

  public getMetrics(): SystemMetrics {
    const platformStats: Record<PlatformType, PlatformMetrics> = {
      booth: { pending: 0, retrying: 0, fetching: 0, done: 0, failed: 0, entities: 0 },
      github: { pending: 0, retrying: 0, fetching: 0, done: 0, failed: 0, entities: 0 },
      vpm: { pending: 0, retrying: 0, fetching: 0, done: 0, failed: 0, entities: 0 },
      gumroad: { pending: 0, retrying: 0, fetching: 0, done: 0, failed: 0, entities: 0 },
      jinxxy: { pending: 0, retrying: 0, fetching: 0, done: 0, failed: 0, entities: 0 },
      itch: { pending: 0, retrying: 0, fetching: 0, done: 0, failed: 0, entities: 0 }
    };

    try {
      const fRows = this.db.query(`
        SELECT platform,
          SUM(CASE WHEN status = 'pending' AND attempts = 0 THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'pending' AND attempts > 0 THEN 1 ELSE 0 END) as retrying,
          SUM(CASE WHEN status = 'fetching' THEN 1 ELSE 0 END) as fetching,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM frontier
        GROUP BY platform;
      `).all() as any[];

      for (const r of fRows) {
        const p = r.platform as PlatformType;
        if (platformStats[p]) {
          platformStats[p].pending = r.pending || 0;
          platformStats[p].retrying = r.retrying || 0;
          platformStats[p].fetching = r.fetching || 0;
          platformStats[p].done = r.done || 0;
          platformStats[p].failed = r.failed || 0;
        }
      }

      const eRows = this.db.query(`
        SELECT platform, COUNT(*) as c
        FROM entities
        WHERE is_quarantined = 0
        GROUP BY platform;
      `).all() as any[];

      for (const r of eRows) {
        const p = r.platform as PlatformType;
        if (platformStats[p]) {
          platformStats[p].entities = r.c || 0;
        }
      }

      const fTotals = this.db.query(`
        SELECT
          COUNT(*) as totalDiscovered,
          SUM(CASE WHEN status = 'pending' AND attempts = 0 THEN 1 ELSE 0 END) as totalFreshPending,
          SUM(CASE WHEN status = 'pending' AND attempts > 0 THEN 1 ELSE 0 END) as totalRetrying,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as totalPending,
          SUM(CASE WHEN status = 'fetching' THEN 1 ELSE 0 END) as totalFetching,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as totalDone,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as totalFailed
        FROM frontier;
      `).get() as any;

      const eTotals = this.db.query(`
        SELECT
          SUM(CASE WHEN is_quarantined = 0 THEN 1 ELSE 0 END) as totalEntities,
          SUM(CASE WHEN is_quarantined = 1 THEN 1 ELSE 0 END) as totalQuarantined
        FROM entities;
      `).get() as any;

      const cTotal = (this.db.query("SELECT COUNT(*) as c FROM canonical_packages;").get() as any)?.c || 0;

      const totalDiscovered = fTotals?.totalDiscovered || 0;
      const totalFreshPending = fTotals?.totalFreshPending || 0;
      const totalRetrying = fTotals?.totalRetrying || 0;
      const totalPending = fTotals?.totalPending || 0;
      const totalFetching = fTotals?.totalFetching || 0;
      const totalDone = fTotals?.totalDone || 0;
      const totalFailed = fTotals?.totalFailed || 0;
      const totalEntities = eTotals?.totalEntities || 0;
      const totalQuarantined = eTotals?.totalQuarantined || 0;

      return {
        totalDiscovered,
        totalPending,
        totalFreshPending,
        totalRetrying,
        totalFetching,
        totalDone,
        totalFailed,
        totalDiscarded: 0,
        totalEntities,
        totalQuarantined,
        totalMerged: cTotal,
        totalCanonical: cTotal,
        platformStats
      };
    } catch {
      return {
        totalDiscovered: 0,
        totalPending: 0,
        totalFreshPending: 0,
        totalRetrying: 0,
        totalFetching: 0,
        totalDone: 0,
        totalFailed: 0,
        totalDiscarded: 0,
        totalEntities: 0,
        totalQuarantined: 0,
        totalMerged: 0,
        totalCanonical: 0,
        platformStats
      };
    }
  }

  public recordCheckpoint(saturation: number, notes: string = ""): void {
    if (this._isClosed) return;
    try {
      const now = new Date().toISOString();
      this.db.run(`
        INSERT INTO sync_checkpoints (
          sync_target, last_synced_id, last_synced_rowid, records_synced, synced_at, status, error_message
        ) VALUES ('crawler_saturation', ?, ?, ?, ?, 'success', ?);
      `, [
        `saturation_${(saturation * 100).toFixed(1)}%`,
        0,
        0,
        now,
        notes
      ]);
    } catch (_) {}
  }

  public getAllCuratorOverrides(): Map<string, CuratorOverride> {
    const map = new Map<string, CuratorOverride>();
    try {
      const rows = this.db.query("SELECT * FROM curator_overrides;").all() as CuratorOverride[];
      for (const r of rows) {
        map.set(r.canonical_id, r);
      }
    } catch (_) {}
    return map;
  }

  public getCuratorOverride(canonicalId: string): CuratorOverride | null {
    try {
      const row = this.db.prepare("SELECT * FROM curator_overrides WHERE canonical_id = ?;").get(canonicalId);
      return (row as CuratorOverride) || null;
    } catch {
      return null;
    }
  }

  public upsertCuratorOverride(override: {
    canonicalId: string;
    nameOverride?: string | null;
    titleOverride?: string | null;
    urlOverride?: string | null;
    descriptionOverride?: string | null;
    categoryOverride?: string | null;
    subcategoryOverride?: string | null;
    addedTags?: string[];
    removedTags?: string[];
    reason?: string | null;
    reporterId?: string | null;
  }): boolean {
    const now = new Date().toISOString();
    const id = `ovr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const addedTagsJson = override.addedTags ? JSON.stringify(override.addedTags) : "[]";
    const removedTagsJson = override.removedTags ? JSON.stringify(override.removedTags) : "[]";

    try {
      this.db.run(`
        INSERT INTO curator_overrides (
          id, canonical_id, name_override, title_override, url_override,
          description_override, category_override, subcategory_override,
          added_tags_json, removed_tags_json, reason, reporter_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(canonical_id) DO UPDATE SET
          name_override = COALESCE(excluded.name_override, curator_overrides.name_override),
          title_override = COALESCE(excluded.title_override, curator_overrides.title_override),
          url_override = COALESCE(excluded.url_override, curator_overrides.url_override),
          description_override = COALESCE(excluded.description_override, curator_overrides.description_override),
          category_override = COALESCE(excluded.category_override, curator_overrides.category_override),
          subcategory_override = COALESCE(excluded.subcategory_override, curator_overrides.subcategory_override),
          added_tags_json = CASE WHEN excluded.added_tags_json != '[]' THEN excluded.added_tags_json ELSE curator_overrides.added_tags_json END,
          removed_tags_json = CASE WHEN excluded.removed_tags_json != '[]' THEN excluded.removed_tags_json ELSE curator_overrides.removed_tags_json END,
          reason = COALESCE(excluded.reason, curator_overrides.reason),
          reporter_id = COALESCE(excluded.reporter_id, curator_overrides.reporter_id),
          updated_at = excluded.updated_at;
      `, [
        id, override.canonicalId, override.nameOverride || null, override.titleOverride || null,
        override.urlOverride || null, override.descriptionOverride || null,
        override.categoryOverride || null, override.subcategoryOverride || null,
        addedTagsJson, removedTagsJson, override.reason || null, override.reporterId || null,
        now, now
      ]);
      return true;
    } catch (err) {
      logger.error(`Failed to upsert curator override for ${override.canonicalId}`, err);
      return false;
    }
  }

  public insertReport(report: {
    reportId: string;
    targetPackageId: string;
    targetPackageName: string;
    branch: "categorization" | "irrelevance" | "listing" | "tags" | "discovery_query";
    branchPayload: any;
    reporterNotes?: string | null;
    clientFingerprint?: string | null;
    trustTier?: "anonymous" | "verified_creator" | "trusted_curator";
    submittedAt?: string | null;
  }): boolean {
    const now = new Date().toISOString();
    const payloadJson = typeof report.branchPayload === "string"
      ? report.branchPayload
      : JSON.stringify(report.branchPayload);

    try {
      this.db.run(`
        INSERT OR REPLACE INTO user_reports (
          report_id, target_package_id, target_package_name, branch, branch_payload_json,
          reporter_notes, client_fingerprint, trust_tier, status, applied_at, submitted_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?);
      `, [
        report.reportId, report.targetPackageId, report.targetPackageName,
        report.branch, payloadJson, report.reporterNotes || null,
        report.clientFingerprint || null, report.trustTier || "anonymous",
        report.submittedAt || now, now
      ]);
      return true;
    } catch (err) {
      logger.error(`Failed to insert report ${report.reportId}`, err);
      return false;
    }
  }

  public getPendingReports(limit: number = 50): UserReport[] {
    try {
      return this.db.prepare(`
        SELECT * FROM user_reports
        WHERE status = 'pending'
        ORDER BY submitted_at ASC
        LIMIT ?;
      `).all(limit) as UserReport[];
    } catch {
      return [];
    }
  }

  public markReportStatus(reportId: string, status: "applied" | "rejected"): boolean {
    const now = new Date().toISOString();
    try {
      const res = this.db.run(`
        UPDATE user_reports
        SET status = ?, applied_at = ?
        WHERE report_id = ?;
      `, [status, now, reportId]);
      return res.changes > 0;
    } catch {
      return false;
    }
  }

  public upsertSearchPattern(pattern: {
    query: string;
    queryIntent?: string | null;
    relevanceVote: "boost" | "suppress";
    negativeTokens?: string[];
    suggestedSeeds?: string[];
    weight?: number;
  }): boolean {
    const now = new Date().toISOString();
    const id = `pat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const negJson = JSON.stringify(pattern.negativeTokens || []);
    const seedJson = JSON.stringify(pattern.suggestedSeeds || []);

    try {
      this.db.run(`
        INSERT INTO search_patterns (
          id, query, query_intent, relevance_vote, negative_tokens_json,
          suggested_seeds_json, weight, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(query) DO UPDATE SET
          query_intent = COALESCE(excluded.query_intent, search_patterns.query_intent),
          relevance_vote = excluded.relevance_vote,
          negative_tokens_json = excluded.negative_tokens_json,
          suggested_seeds_json = excluded.suggested_seeds_json,
          weight = excluded.weight,
          updated_at = excluded.updated_at;
      `, [
        id, pattern.query, pattern.queryIntent || null, pattern.relevanceVote,
        negJson, seedJson, pattern.weight || 1.0, now, now
      ]);
      return true;
    } catch (err) {
      logger.error(`Failed to upsert search pattern ${pattern.query}`, err);
      return false;
    }
  }

  public getSearchPatterns(): SearchPattern[] {
    try {
      return this.db.query("SELECT * FROM search_patterns ORDER BY weight DESC;").all() as SearchPattern[];
    } catch {
      return [];
    }
  }

  public getDeltaCanonicalPackages(cursorRowid: number = 0, limit: number = 50): { packages: CanonicalPackage[]; nextCursor: number } {
    try {
      const rows = this.db.prepare(`
        SELECT rowid as cursor_id, *
        FROM canonical_packages
        WHERE rowid > ?
        ORDER BY rowid ASC
        LIMIT ?;
      `).all(cursorRowid, limit) as any[];

      const nextCursor = rows.length > 0 ? rows[rows.length - 1].cursor_id : cursorRowid;
      return { packages: rows as CanonicalPackage[], nextCursor };
    } catch {
      return { packages: [], nextCursor: cursorRowid };
    }
  }

  public getVpmPackages(): CanonicalPackage[] {
    try {
      return this.db.query(`
        SELECT * FROM canonical_packages
        WHERE is_vcc = 1 AND lifecycle != 'delisted' AND lifecycle != 'dmca_removed'
        ORDER BY name ASC;
      `).all() as CanonicalPackage[];
    } catch {
      return [];
    }
  }

  public close(): void {
    if (!this._isClosed) {
      this._isClosed = true;
      try {
        this.db.close();
      } catch (_) {}
    }
  }
}

export const db = new CrawlerDB();
export const dbV2 = db;
export const CrawlerDBV2 = CrawlerDB;
export default db;
