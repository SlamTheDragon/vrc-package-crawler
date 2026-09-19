import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import { runEdgeSync } from "../src/sync/index.ts";
import { db } from "../src/db.ts";
import { CONFIG } from "../src/config.ts";

describe("Decoupled Cloudflare Edge Sync & Local Backup Conduit", () => {
  const createdBackupFiles: string[] = [];

  beforeEach(() => {
    db.run("DELETE FROM sync_checkpoints;");
  });

  afterAll(() => {
    db.run("DELETE FROM sync_checkpoints;");
    for (const f of createdBackupFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (_) {}
    }
  });

  it("never performs fake syncs: dry-run validates packages without advancing remote checkpoints", async () => {
    // Run sync in dry-run mode
    const result = await runEdgeSync({ isDryRun: true, batchSize: 5 });
    expect(result.isDryRun).toBe(true);
    expect(result.status).toBe("dry_run");
    expect(result.syncedPackages).toBe(0);
    expect(result.validatedPackages).toBeGreaterThan(0);

    // Verify absolutely NO checkpoint was recorded in sync_checkpoints
    const checkpoint = db.query(`
      SELECT * FROM sync_checkpoints
      WHERE sync_target = 'cloudflare_d1' AND status = 'success'
      ORDER BY id DESC
      LIMIT 1;
    `).get() as any;

    expect(checkpoint).toBeNull();
  });

  it("reroutes incremental deltas to local backup directory when Cloudflare is disconnected", async () => {
    const customBackupDir = path.resolve(CONFIG.baseDir, "backups/test_deltas");
    if (!fs.existsSync(customBackupDir)) {
      fs.mkdirSync(customBackupDir, { recursive: true });
    }

    // Ensure no Cloudflare credentials in config
    const result = await runEdgeSync({
      accountId: undefined,
      apiToken: undefined,
      d1DatabaseId: undefined,
      isDryRun: false,
      batchSize: 5,
      backupDir: customBackupDir
    });

    expect(result.isDryRun).toBe(false);
    expect(result.status).toBe("backed_up");
    expect(result.backedUpPackages).toBeGreaterThan(0);
    expect(result.syncedPackages).toBe(0);
    expect(result.backupPath).toBeDefined();

    if (result.backupPath) {
      createdBackupFiles.push(result.backupPath);
      expect(fs.existsSync(result.backupPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(result.backupPath, "utf-8"));
      expect(content.conduit).toBe("local_backup_conduit");
      expect(content.reason).toBe("cloudflare_unconfigured");
      expect(content.packages.length).toBe(result.backedUpPackages);
    }

    // Crucial: Remote Cloudflare watermark checkpoint must NOT be written
    const cfCheckpoint = db.query(`
      SELECT * FROM sync_checkpoints
      WHERE sync_target = 'cloudflare_d1' AND status = 'success'
      ORDER BY id DESC
      LIMIT 1;
    `).get() as any;
    expect(cfCheckpoint).toBeNull();

    // Local backup checkpoint is recorded
    const localCheckpoint = db.query(`
      SELECT * FROM sync_checkpoints
      WHERE sync_target = 'local_backup' AND status = 'success'
      ORDER BY id DESC
      LIMIT 1;
    `).get() as any;
    expect(localCheckpoint).toBeDefined();
    expect(localCheckpoint.records_synced).toBe(result.backedUpPackages);
  });

  it("recovers from table rebuilds when local_backup checkpoint exceeds table max rowid", async () => {
    const customBackupDir = path.resolve(CONFIG.baseDir, "backups/test_deltas");
    if (!fs.existsSync(customBackupDir)) {
      fs.mkdirSync(customBackupDir, { recursive: true });
    }

    // Insert an artificially high stale watermark simulating a table rebuild
    db.run(`
      INSERT INTO sync_checkpoints (
        sync_target, last_synced_id, last_synced_rowid, records_synced, synced_at, status
      ) VALUES ('local_backup', 'stale_id', 99999999, 100, '2026-01-01T00:00:00.000Z', 'success');
    `);

    const result = await runEdgeSync({
      accountId: undefined,
      apiToken: undefined,
      d1DatabaseId: undefined,
      isDryRun: false,
      batchSize: 3,
      backupDir: customBackupDir
    });

    expect(result.status).toBe("backed_up");
    expect(result.backedUpPackages).toBe(3);
    if (result.backupPath) createdBackupFiles.push(result.backupPath);
  });

  it("drains multiple batches to local backup conduit when drainAll is enabled", async () => {
    const customBackupDir = path.resolve(CONFIG.baseDir, "backups/test_deltas");
    if (!fs.existsSync(customBackupDir)) {
      fs.mkdirSync(customBackupDir, { recursive: true });
    }

    // Set high-watermark to 4 rows before the end so drainAll processes exactly 4 rows in 2 batches
    const maxRow = (db.query("SELECT MAX(rowid) as max_r FROM canonical_packages;").get() as any)?.max_r || 0;
    expect(maxRow).toBeGreaterThan(5);

    db.run(`
      INSERT INTO sync_checkpoints (
        sync_target, last_synced_id, last_synced_rowid, records_synced, synced_at, status
      ) VALUES ('local_backup', 'prior_id', ?, 50, '2026-01-01T00:00:00.000Z', 'success');
    `, [maxRow - 4]);

    const result = await runEdgeSync({
      accountId: undefined,
      apiToken: undefined,
      d1DatabaseId: undefined,
      isDryRun: false,
      batchSize: 2,
      drainAll: true,
      backupDir: customBackupDir
    });

    expect(result.status).toBe("backed_up");
    expect(result.backedUpPackages).toBe(4);
    expect(result.backupPaths).toBeDefined();
    expect(result.backupPaths!.length).toBe(2);

    if (result.backupPaths) {
      for (const p of result.backupPaths) {
        createdBackupFiles.push(p);
        expect(fs.existsSync(p)).toBe(true);
      }
    }
  });
});
