import { Database } from "bun:sqlite";
import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";

export type PlatformType = "booth" | "github" | "vpm" | "gumroad" | "jinxxy";

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
  }

  public resetStaleFetching(): number {
    const reset = this.db.run("UPDATE frontier SET status = 'pending' WHERE status = 'fetching';");
    if (reset.changes > 0) {
      logger.info(`Recovered from previous interruption: Reset ${reset.changes} hanging URLs to 'pending'.`);
    }
    return reset.changes;
  }

  queueUrl(url: string, platform: PlatformType): boolean {
    const now = new Date().toISOString();
    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO frontier (url, platform, status, attempts, discovered_at, updated_at)
        VALUES (?, ?, 'pending', 0, ?, ?);
      `);
      const result = stmt.run(url, platform, now, now);
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
        const res = insert.run(item.url, item.platform, now, now);
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
    const stmt = this.db.prepare(`
      SELECT url, platform, status, attempts, discovered_at, updated_at
      FROM frontier
      WHERE platform = ? AND status = 'pending'
      ORDER BY discovered_at ASC
      LIMIT ?;
    `);
    return stmt.all(platform, limit) as FrontierItem[];
  }

  markStatus(url: string, status: "fetching" | "done" | "failed") {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE frontier
      SET status = ?, attempts = attempts + 1, updated_at = ?
      WHERE url = ?;
    `);
    stmt.run(status, now, url);
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
        entity.id,
        entity.platform,
        entity.url,
        entity.title,
        entity.author,
        entity.price_currency || null,
        entity.price_amount !== undefined ? entity.price_amount : null,
        entity.description || "",
        entity.tags_json || "[]",
        entity.external_links_json || "[]",
        entity.raw_json || "{}",
        now,
        now
      );
      return res.changes > 0;
    } catch (err) {
      logger.error(`Failed to save entity ${entity.id}`, err);
      return false;
    }
  }

  getMetrics() {
    const totalDiscovered = (this.db.prepare("SELECT COUNT(*) as c FROM frontier;").get() as any).c;
    const totalPending = (this.db.prepare("SELECT COUNT(*) as c FROM frontier WHERE status = 'pending';").get() as any).c;
    const totalDone = (this.db.prepare("SELECT COUNT(*) as c FROM frontier WHERE status = 'done';").get() as any).c;
    const totalFailed = (this.db.prepare("SELECT COUNT(*) as c FROM frontier WHERE status = 'failed';").get() as any).c;
    const totalEntities = (this.db.prepare("SELECT COUNT(*) as c FROM entities;").get() as any).c;

    const platforms = ["booth", "github", "vpm", "gumroad", "jinxxy"];
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
