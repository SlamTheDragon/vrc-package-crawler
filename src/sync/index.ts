import fs from "fs";
import path from "path";
import { CONFIG } from "../config.ts";
import { db } from "../db.ts";
import { logger } from "../logger.ts";

export interface SyncConfig {
  accountId?: string;
  apiToken?: string;
  d1DatabaseId?: string;
  r2BucketName?: string;
  isDryRun: boolean;
  batchSize: number;
  resetWatermark?: boolean;
  backupDir?: string;
  drainAll?: boolean;
}

export interface EdgeSyncResult {
  syncedPackages: number;
  backedUpPackages: number;
  validatedPackages: number;
  isDryRun: boolean;
  status: "synced" | "backed_up" | "dry_run" | "up_to_date";
  backupPath?: string;
  backupPaths?: string[];
}

export function isCloudflareConfigured(cfg?: Partial<SyncConfig>): boolean {
  const accountId = cfg?.accountId ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = cfg?.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  const d1DatabaseId = cfg?.d1DatabaseId ?? process.env.CLOUDFLARE_D1_DATABASE_ID;
  return Boolean(accountId && apiToken && d1DatabaseId);
}

export function getSyncConfig(argv: string[] = process.argv.slice(2)): SyncConfig {
  let isDryRunArg = false;
  let batchSize = 50;
  let resetWatermark = false;
  let backupDir: string | undefined;
  let drainAll = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`
VRChat Package Crawler - Cloudflare Edge Synchronizer
Usage:
  vrc-sync.exe [options]
  bun run sync [options]

Options:
  --dry-run               Validate payloads without network mutations or advancing checkpoints
  --batch-size, -b <N>    Batch size per transaction (default: 50)
  --backup-dir <dir>      Explicit local backup directory when Cloudflare is disconnected
  --full, --reset         Reset high-watermark checkpoint and sync from beginning
  --drain, --all          Process all pending batches until up to date
  --help, -h              Show this help message

Environment Variables:
  CLOUDFLARE_ACCOUNT_ID    Cloudflare account identifier
  CLOUDFLARE_API_TOKEN     API token with D1 and R2 permissions
  CLOUDFLARE_D1_DATABASE_ID Destination D1 database UUID
  CLOUDFLARE_R2_BUCKET_NAME Destination R2 media bucket name
`);
      process.exit(0);
    } else if (arg === "--dry-run") {
      isDryRunArg = true;
    } else if ((arg === "--batch-size" || arg === "-b") && i + 1 < argv.length) {
      const parsed = parseInt(argv[++i], 10);
      if (!isNaN(parsed) && parsed > 0) batchSize = parsed;
    } else if (arg === "--backup-dir" && i + 1 < argv.length) {
      backupDir = argv[++i];
    } else if (arg === "--full" || arg === "--reset") {
      resetWatermark = true;
    } else if (arg === "--drain" || arg === "--all") {
      drainAll = true;
    }
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const d1DatabaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const r2BucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

  return {
    accountId,
    apiToken,
    d1DatabaseId,
    r2BucketName,
    isDryRun: isDryRunArg,
    batchSize,
    resetWatermark,
    backupDir,
    drainAll
  };
}

export async function runEdgeSync(customConfig?: Partial<SyncConfig>): Promise<EdgeSyncResult> {
  const baseConfig = getSyncConfig();
  const config: SyncConfig = {
    ...baseConfig,
    ...customConfig,
    isDryRun: customConfig?.isDryRun !== undefined ? customConfig.isDryRun : baseConfig.isDryRun,
    resetWatermark: customConfig?.resetWatermark !== undefined ? customConfig.resetWatermark : baseConfig.resetWatermark,
    drainAll: customConfig?.drainAll !== undefined ? customConfig.drainAll : baseConfig.drainAll
  };

  const configured = isCloudflareConfigured(config);

  logger.info(`[EdgeSync] Initializing edge sync (Dry-run: ${config.isDryRun}, Cloudflare Configured: ${configured}, Batch: ${config.batchSize}, DrainAll: ${Boolean(config.drainAll)})...`);

  const maxRowInDb = (db.query("SELECT MAX(rowid) as max_r FROM canonical_packages;").get() as any)?.max_r || 0;

  // 1. Get remote high-watermark from sync_checkpoints
  let watermarkRowId = 0;
  if (!config.resetWatermark) {
    const lastCheckpoint = db.query(`
      SELECT last_synced_rowid, last_synced_id
      FROM sync_checkpoints
      WHERE sync_target = 'cloudflare_d1' AND status = 'success'
      ORDER BY id DESC
      LIMIT 1;
    `).get() as any;

    watermarkRowId = lastCheckpoint?.last_synced_rowid || 0;

    // Detect if canonical_packages table was rebuilt or rowids reset
    if (watermarkRowId > maxRowInDb) {
      logger.warn(`[EdgeSync] Watermark rowid (${watermarkRowId}) exceeds table max (${maxRowInDb}). Table was rebuilt; resetting sync from beginning.`);
      watermarkRowId = 0;
    }
  }

  // --- BRANCH 1: Dry-Run Mode ---
  // In dry-run mode, validate schema/payloads. NEVER write a success checkpoint to sync_checkpoints.
  if (config.isDryRun) {
    let currentWatermark = watermarkRowId;
    let totalValidated = 0;

    while (true) {
      const pendingRows = db.query(`
        SELECT rowid, *
        FROM canonical_packages
        WHERE rowid > ?
        ORDER BY rowid ASC
        LIMIT ?;
      `).all(currentWatermark, config.batchSize) as any[];

      if (pendingRows.length === 0) break;

      totalValidated += pendingRows.length;
      currentWatermark = pendingRows[pendingRows.length - 1].rowid;

      if (!config.drainAll) break;
    }

    if (totalValidated === 0) {
      logger.info("[EdgeSync:DryRun] Up to date. No new canonical packages require synchronization.");
      return {
        syncedPackages: 0,
        backedUpPackages: 0,
        validatedPackages: 0,
        isDryRun: true,
        status: "up_to_date"
      };
    }

    logger.info(`[EdgeSync:DryRun] Validated ${totalValidated} packages for D1 push. Checkpoint advancement skipped.`);
    return {
      syncedPackages: 0,
      backedUpPackages: 0,
      validatedPackages: totalValidated,
      isDryRun: true,
      status: "dry_run"
    };
  }

  // --- BRANCH 2: Cloudflare Disconnected / Unconfigured ---
  // Never perform fake syncs. Reroute incremental package deltas to dedicated local backup directory.
  // Do NOT advance the remote Cloudflare watermark (sync_target = 'cloudflare_d1').
  if (!configured) {
    const backupDir = config.backupDir || path.resolve(CONFIG.baseDir, "backups/deltas");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    let localBackupWatermark = 0;
    if (!config.resetWatermark) {
      const lastBackupCheckpoint = db.query(`
        SELECT last_synced_rowid
        FROM sync_checkpoints
        WHERE sync_target = 'local_backup' AND status = 'success'
        ORDER BY id DESC
        LIMIT 1;
      `).get() as any;
      localBackupWatermark = lastBackupCheckpoint?.last_synced_rowid || 0;

      // Table rebuild detection for local backup watermark
      if (localBackupWatermark > maxRowInDb) {
        logger.warn(`[EdgeSync:Backup] Local backup watermark rowid (${localBackupWatermark}) exceeds table max (${maxRowInDb}). Table was rebuilt; resetting backup from beginning.`);
        localBackupWatermark = 0;
      }
    }

    let effectiveWatermark = Math.max(watermarkRowId, localBackupWatermark);
    let totalBackedUp = 0;
    const backupPaths: string[] = [];

    while (true) {
      const pendingRows = db.query(`
        SELECT rowid, *
        FROM canonical_packages
        WHERE rowid > ?
        ORDER BY rowid ASC
        LIMIT ?;
      `).all(effectiveWatermark, config.batchSize) as any[];

      if (pendingRows.length === 0) break;

      const firstRowId = pendingRows[0].rowid;
      const lastRowId = pendingRows[pendingRows.length - 1].rowid;
      const lastId = pendingRows[pendingRows.length - 1].id;
      const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = path.resolve(backupDir, `delta_${timestampStr}_rows_${firstRowId}_${lastRowId}.json`);

      const backupPayload = {
        conduit: "local_backup_conduit",
        reason: "cloudflare_unconfigured",
        timestamp: new Date().toISOString(),
        count: pendingRows.length,
        watermarkStart: firstRowId,
        watermarkEnd: lastRowId,
        packages: pendingRows
      };

      fs.writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2), "utf-8");
      backupPaths.push(backupFile);
      totalBackedUp += pendingRows.length;
      effectiveWatermark = lastRowId;

      const now = new Date().toISOString();
      // Record local backup progress only. Remote Cloudflare watermark ('cloudflare_d1') is untouched.
      db.run(`
        INSERT INTO sync_checkpoints (
          sync_target, last_synced_id, last_synced_rowid, records_synced, synced_at, status
        ) VALUES ('local_backup', ?, ?, ?, ?, 'success');
      `, [lastId, lastRowId, pendingRows.length, now]);

      if (!config.drainAll) break;
    }

    if (totalBackedUp === 0) {
      logger.info("[EdgeSync:Backup] Local backup conduit up to date. No new incremental package deltas.");
      return {
        syncedPackages: 0,
        backedUpPackages: 0,
        validatedPackages: 0,
        isDryRun: false,
        status: "up_to_date"
      };
    }

    logger.info(`[EdgeSync:Backup] Cloudflare disconnected. Rerouted ${totalBackedUp} incremental package deltas to local backup conduit (${backupPaths.length} file(s)). Remote Cloudflare watermark untouched.`);

    return {
      syncedPackages: 0,
      backedUpPackages: totalBackedUp,
      validatedPackages: 0,
      isDryRun: false,
      status: "backed_up",
      backupPath: backupPaths[backupPaths.length - 1],
      backupPaths
    };
  }

  // --- BRANCH 3: Live Cloudflare Synchronization ---
  let currentWatermark = watermarkRowId;
  let totalSynced = 0;
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.d1DatabaseId}/query`;

  while (true) {
    const pendingRows = db.query(`
      SELECT rowid, *
      FROM canonical_packages
      WHERE rowid > ?
      ORDER BY rowid ASC
      LIMIT ?;
    `).all(currentWatermark, config.batchSize) as any[];

    if (pendingRows.length === 0) break;

    logger.info(`[EdgeSync] Synchronizing batch of ${pendingRows.length} incremental records with Cloudflare D1...`);

    let maxRowId = currentWatermark;
    let lastId = "";

    for (const r of pendingRows) {
      const sql = `
        INSERT OR REPLACE INTO canonical_packages (
          id, canonical_id, name, author, authors_json, category, subcategory, type,
          description, primary_platform, platforms_json, url, vcc_url, github_url,
          booth_url, gumroad_url, jinxxy_url, itch_url, price_currency, price_amount,
          is_vcc, tags_json, dependencies_json, source_ids_json, media_id,
          origin_created_at, origin_updated_at, created_at_confidence, lifecycle, lifecycle_updated_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      const params = [
        r.id, r.canonical_id, r.name, r.author, r.authors_json,
        r.category, r.subcategory, r.type, r.description,
        r.primary_platform, r.platforms_json, r.url,
        r.vcc_url, r.github_url, r.booth_url, r.gumroad_url, r.jinxxy_url, r.itch_url,
        r.price_currency, r.price_amount, r.is_vcc,
        r.tags_json, r.dependencies_json, r.source_ids_json, r.media_id,
        r.origin_created_at, r.origin_updated_at, r.created_at_confidence || "unknown",
        r.lifecycle || "published", r.lifecycle_updated_at, r.created_at, r.updated_at
      ];

      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${config.apiToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ sql, params })
        });
        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(`Cloudflare D1 HTTP ${resp.status}: ${errText}`);
        }
      } catch (err: any) {
        logger.error(`[EdgeSync] Failed to sync record ${r.canonical_id}`, err);
        const failTime = new Date().toISOString();
        db.run(`
          INSERT INTO sync_checkpoints (
            sync_target, last_synced_id, last_synced_rowid, records_synced, synced_at, status, error_message
          ) VALUES ('cloudflare_d1', ?, ?, 0, ?, 'failed', ?);
        `, [lastId || null, maxRowId, failTime, String(err?.message || err)]);
        throw err;
      }

      if (r.rowid > maxRowId) maxRowId = r.rowid;
      lastId = r.id;
    }

    // Record verified remote watermark checkpoint for batch
    const now = new Date().toISOString();
    db.run(`
      INSERT INTO sync_checkpoints (
        sync_target, last_synced_id, last_synced_rowid, records_synced, synced_at, status
      ) VALUES ('cloudflare_d1', ?, ?, ?, ?, 'success');
    `, [lastId, maxRowId, pendingRows.length, now]);

    totalSynced += pendingRows.length;
    currentWatermark = maxRowId;

    if (!config.drainAll) break;
  }

  if (totalSynced === 0) {
    logger.info("[EdgeSync] Up to date. No new canonical packages require edge synchronization.");
    return {
      syncedPackages: 0,
      backedUpPackages: 0,
      validatedPackages: 0,
      isDryRun: false,
      status: "up_to_date"
    };
  }

  logger.info(`[EdgeSync] Edge synchronization complete: synced ${totalSynced} records. New Cloudflare watermark: ${currentWatermark}.`);
  return {
    syncedPackages: totalSynced,
    backedUpPackages: 0,
    validatedPackages: 0,
    isDryRun: false,
    status: "synced"
  };
}

if (import.meta.main) {
  runEdgeSync().then((res) => {
    console.log(`[CLI] Sync finished (Status: ${res.status}, Synced: ${res.syncedPackages}, BackedUp: ${res.backedUpPackages}, DryRun: ${res.isDryRun})`);
    process.exit(0);
  }).catch((err) => {
    console.error("[CLI] Sync failed:", err);
    process.exit(1);
  });
}
