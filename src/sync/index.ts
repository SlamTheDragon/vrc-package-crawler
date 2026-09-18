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
}

export function getSyncConfig(argv: string[] = process.argv.slice(2)): SyncConfig {
  let isDryRunArg = false;
  let batchSize = 50;
  let resetWatermark = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`
VRChat Package Crawler - Cloudflare Edge Synchronizer
Usage:
  vrc-sync.exe [options]
  bun run sync [options]

Options:
  --dry-run               Validate payloads without network mutations
  --batch-size, -b <N>    Batch size per transaction (default: 50)
  --full, --reset         Reset high-watermark checkpoint and sync from beginning
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
    } else if (arg === "--full" || arg === "--reset") {
      resetWatermark = true;
    }
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const d1DatabaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const r2BucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

  const isConfigured = Boolean(accountId && apiToken && d1DatabaseId);

  return {
    accountId,
    apiToken,
    d1DatabaseId,
    r2BucketName,
    isDryRun: !isConfigured || isDryRunArg,
    batchSize,
    resetWatermark
  };
}

export async function runEdgeSync(customConfig?: Partial<SyncConfig>): Promise<{ syncedPackages: number; isDryRun: boolean }> {
  const config: SyncConfig = { ...getSyncConfig(), ...customConfig };

  logger.info(`[EdgeSync] Initializing Cloudflare edge sync (Dry-run: ${config.isDryRun}, Batch: ${config.batchSize})...`);

  // 1. Get high-watermark from sync_checkpoints
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
    const maxRowInDb = (db.query("SELECT MAX(rowid) as max_r FROM canonical_packages;").get() as any)?.max_r || 0;
    if (watermarkRowId > maxRowInDb && maxRowInDb > 0) {
      logger.warn(`[EdgeSync] Watermark rowid (${watermarkRowId}) exceeds table max (${maxRowInDb}). Table was rebuilt; resetting sync from beginning.`);
      watermarkRowId = 0;
    }
  }

  logger.info(`[EdgeSync] High-watermark rowid: ${watermarkRowId}`);

  // 2. Fetch incremental records from canonical_packages
  const pendingRows = db.query(`
    SELECT rowid, *
    FROM canonical_packages
    WHERE rowid > ?
    ORDER BY rowid ASC
    LIMIT ?;
  `).all(watermarkRowId, config.batchSize) as any[];

  if (pendingRows.length === 0) {
    logger.info("[EdgeSync] Up to date. No new canonical packages require edge synchronization.");
    return { syncedPackages: 0, isDryRun: config.isDryRun };
  }

  logger.info(`[EdgeSync] Discovered ${pendingRows.length} incremental records to synchronize.`);

  let maxRowId = watermarkRowId;
  let lastId = "";

  if (config.isDryRun) {
    logger.info(`[EdgeSync:DryRun] Validated batch of ${pendingRows.length} packages for D1 push.`);
    for (const r of pendingRows) {
      if (r.rowid > maxRowId) maxRowId = r.rowid;
      lastId = r.id;
    }
  } else {
    // Push batch to Cloudflare D1 via REST API
    const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.d1DatabaseId}/query`;
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
      } catch (err) {
        logger.error(`[EdgeSync] Failed to sync record ${r.canonical_id}`, err);
        throw err;
      }

      if (r.rowid > maxRowId) maxRowId = r.rowid;
      lastId = r.id;
    }
  }

  // 3. Record watermark checkpoint
  const now = new Date().toISOString();
  db.run(`
    INSERT INTO sync_checkpoints (
      sync_target, last_synced_id, last_synced_rowid, records_synced, synced_at, status
    ) VALUES ('cloudflare_d1', ?, ?, ?, ?, 'success');
  `, [lastId, maxRowId, pendingRows.length, now]);

  logger.info(`[EdgeSync] Edge synchronization complete: synced ${pendingRows.length} records. New watermark: ${maxRowId}.`);
  return { syncedPackages: pendingRows.length, isDryRun: config.isDryRun };
}

if (import.meta.main) {
  runEdgeSync().then((res) => {
    console.log(`[CLI] Sync finished (Synced: ${res.syncedPackages}, Dry-run: ${res.isDryRun})`);
    process.exit(0);
  }).catch((err) => {
    console.error("[CLI] Sync failed:", err);
    process.exit(1);
  });
}
