import { Database } from "bun:sqlite";
import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";

export type PlatformType = "booth" | "github" | "vpm" | "gumroad" | "jinxxy" | "itch";

export interface FrontierItem {
  url: string;
  platform: PlatformType;
  status: "pending" | "fetching" | "done" | "failed";
  attempts: number;
  discovered_at: string;
  updated_at: string;
}

export interface EntityRecord {
  id: string;
  platform: string;
  url: string;
  title: string;
  author: string;
  price_currency?: string;
  price_amount?: number;
  description: string;
  tags_json?: string;
  external_links_json?: string;
  raw_json?: string;
}

export class CrawlerDB {
  private db: Database;

  constructor() {
    this.db = new Database(CONFIG.dbPath, { create: true });
    this.initSchema();
  }

  prepare(sql: string) {
    return this.db.prepare(sql);
  }

  query(sql: string) {
    return this.db.query(sql);
  }

  run(sql: string, params?: any[]) {
    return this.db.run(sql, params);
  }

  transaction(fn: (...args: any[]) => any) {
    return this.db.transaction(fn);
  }

  private initSchema() {
    // Enable WAL mode for high concurrency and crash resilience
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA synchronous = NORMAL;");
    this.db.run("PRAGMA busy_timeout = 5000;");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS frontier (
        url TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        discovered_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

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
        tags_json TEXT,
        external_links_json TEXT,
        raw_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        total_discovered INTEGER NOT NULL,
        total_entities INTEGER NOT NULL,
        saturation_score REAL NOT NULL,
        notes TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS quarantined_entities (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        reasons_json TEXT,
        quarantined_at TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS qualified_discards (
        url TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        reason TEXT NOT NULL,
        attempts INTEGER DEFAULT 1,
        discarded_at TEXT NOT NULL
      );
    `);
  }

  public discardFailedUrl(url: string, platform: string, reason: string): boolean {
    const now = new Date().toISOString();
    try {
      this.db.run(`
        INSERT OR REPLACE INTO qualified_discards (url, platform, reason, attempts, discarded_at)
        VALUES (?, ?, ?, COALESCE((SELECT attempts FROM frontier WHERE url = ?), 1), ?);
      `, [url, platform, reason, url, now]);
      this.db.run("DELETE FROM frontier WHERE url = ?;", [url]);
      return true;
    } catch {
      return false;
    }
  }

  public resetStaleFetching(): number {
    const reset = this.db.run("UPDATE frontier SET status = 'pending' WHERE status = 'fetching';");
    if (reset.changes > 0) {
      logger.info(`Recovered from previous interruption: Reset ${reset.changes} hanging URLs to 'pending'.`);
    }
    return reset.changes;
  }

  private sanitizeUrl(rawUrl: string): string | null {
    if (!rawUrl || typeof rawUrl !== "string") return null;
    let clean = rawUrl.trim();
    if (clean.startsWith("(") && clean.endsWith(")")) {
      clean = clean.slice(1, -1).trim();
    }
    clean = clean.replace(/^https?:\/\/https?:\/\//i, "https://");
    clean = clean.replace(/^https?:\/\/\(https?:\/\//i, "https://");
    clean = clean.replace(/^(https?:\/\/)(https?:\/\/)/i, "$1");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) return null;
    try {
      const parsed = new URL(clean);
      if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  queueUrl(url: string, platform: PlatformType): boolean {
    const cleanUrl = this.sanitizeUrl(url);
    if (!cleanUrl) return false;

    const now = new Date().toISOString();
    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO frontier (url, platform, status, attempts, discovered_at, updated_at)
        VALUES (?, ?, 'pending', 0, ?, ?);
      `);
      const result = stmt.run(cleanUrl, platform, now, now);
      return result.changes > 0;
    } catch (e) {
      return false;
    }
  }

  queueBatchUrls(items: { url: string; platform: PlatformType }[]): number {
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO frontier (url, platform, status, attempts, discovered_at, updated_at)
      VALUES (?, ?, 'pending', 0, ?, ?);
    `);

    let count = 0;
    this.db.transaction(() => {
      for (const item of items) {
        const cleanUrl = this.sanitizeUrl(item.url);
        if (!cleanUrl) continue;
        const res = insert.run(cleanUrl, item.platform, now, now);
        if (res.changes > 0) count++;
      }
    })();
    return count;
  }

  getNextPending(limit: number = 10): FrontierItem[] {
    const stmt = this.db.prepare(`
      SELECT url, platform, status, attempts, discovered_at, updated_at
      FROM frontier
      WHERE status = 'pending'
      ORDER BY discovered_at ASC
      LIMIT ?;
    `);
    return stmt.all(limit) as FrontierItem[];
  }

  getNextPendingForPlatform(platform: PlatformType, limit: number = 5): FrontierItem[] {
    const genLimit = Math.max(1, Math.floor(limit * 0.2));
    const genItems = this.db.prepare(`
      SELECT url, platform, status, attempts, discovered_at, updated_at
      FROM frontier
      WHERE platform = ? AND status = 'pending' AND (url LIKE '%?query=%' OR url LIKE '%/browse/%' OR url LIKE '%/search%' OR url LIKE '%page=%')
      ORDER BY discovered_at ASC
      LIMIT ?;
    `).all(platform, genLimit) as FrontierItem[];

    const itemRows = this.db.prepare(`
      SELECT url, platform, status, attempts, discovered_at, updated_at
      FROM frontier
      WHERE platform = ? AND status = 'pending' AND NOT (url LIKE '%?query=%' OR url LIKE '%/browse/%' OR url LIKE '%/search%' OR url LIKE '%page=%')
      ORDER BY discovered_at ASC
      LIMIT ?;
    `).all(platform, limit - genItems.length) as FrontierItem[];

    return [...genItems, ...itemRows];
  }

  markStatus(url: string, status: "fetching" | "done" | "failed", reason: string = "Request failed or 404") {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE frontier
      SET status = ?, attempts = attempts + 1, updated_at = ?
      WHERE url = ?;
    `);
    stmt.run(status, now, url);

    if (status === "failed") {
      const row = this.db.prepare("SELECT platform, attempts FROM frontier WHERE url = ?;").get(url) as any;
      if (row && (row.attempts >= 3 || url.includes(".booth.pm/") || url.includes("example.github.io"))) {
        this.discardFailedUrl(url, row.platform, reason);
      }
    }
  }

  saveEntity(entity: EntityRecord): boolean {
    const now = new Date().toISOString();
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO entities (
          id, platform, url, title, author, price_currency, price_amount,
          description, tags_json, external_links_json, raw_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);
      const res = stmt.run(
        String(entity.id || ""),
        String(entity.platform || ""),
        String(entity.url || ""),
        String(entity.title || "Untitled"),
        String(entity.author || "Unknown"),
        entity.price_currency ? String(entity.price_currency) : null,
        typeof entity.price_amount === "number" && !isNaN(entity.price_amount) ? entity.price_amount : null,
        String(entity.description || ""),
        String(entity.tags_json || "[]"),
        String(entity.external_links_json || "[]"),
        String(entity.raw_json || "{}"),
        now,
        now
      );
      return res.changes > 0;
    } catch (err) {
      logger.error(`Failed to save entity ${entity.id}`, err);
      return false;
    }
  }

  quarantineEntity(
    id: string,
    platform: string,
    url: string,
    title: string,
    author: string,
    reasons: string[]
  ): boolean {
    const now = new Date().toISOString();
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO quarantined_entities (
          id, platform, url, title, author, reasons_json, quarantined_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?);
      `);
      const res = stmt.run(
        String(id || ""),
        String(platform || ""),
        String(url || ""),
        String(title || "Untitled"),
        String(author || "Unknown"),
        JSON.stringify(reasons || []),
        now
      );
      return res.changes > 0;
    } catch (err) {
      logger.error(`Failed to quarantine entity ${id}`, err);
      return false;
    }
  }

  getMetrics() {
    const totalDiscovered = (this.db.prepare("SELECT COUNT(*) as c FROM frontier;").get() as any).c;
    const totalPending = (this.db.prepare("SELECT COUNT(*) as c FROM frontier WHERE status = 'pending';").get() as any).c;
    const totalDone = (this.db.prepare("SELECT COUNT(*) as c FROM frontier WHERE status = 'done';").get() as any).c;
    const totalFailed = (this.db.prepare("SELECT COUNT(*) as c FROM frontier WHERE status = 'failed';").get() as any).c;
    const totalEntities = (this.db.prepare("SELECT COUNT(*) as c FROM entities;").get() as any).c;
    const totalQuarantined = (this.db.prepare("SELECT COUNT(*) as c FROM quarantined_entities;").get() as any).c;

    const platforms = ["booth", "github", "vpm", "gumroad", "jinxxy", "itch"];
    const platformStats: Record<string, { pending: number; done: number; entities: number }> = {};

    for (const p of platforms) {
      const pending = (this.db.prepare("SELECT COUNT(*) as c FROM frontier WHERE platform = ? AND status = 'pending';").get(p) as any).c;
      const done = (this.db.prepare("SELECT COUNT(*) as c FROM frontier WHERE platform = ? AND status = 'done';").get(p) as any).c;
      const entities = (this.db.prepare("SELECT COUNT(*) as c FROM entities WHERE platform = ?;").get(p) as any).c;
      platformStats[p] = { pending, done, entities };
    }

    return {
      totalDiscovered,
      totalPending,
      totalDone,
      totalFailed,
      totalEntities,
      totalQuarantined,
      platformStats
    };
  }

  recordCheckpoint(saturation: number, notes: string = "") {
    const metrics = this.getMetrics();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (timestamp, total_discovered, total_entities, saturation_score, notes)
      VALUES (?, ?, ?, ?, ?);
    `);
    stmt.run(now, metrics.totalDiscovered, metrics.totalEntities, saturation, notes);
  }

  close() {
    this.db.close();
  }
}

export const db = new CrawlerDB();
