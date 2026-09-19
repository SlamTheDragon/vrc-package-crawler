/**
 * requeue_media.ts
 *
 * Dedicated administrative backfill & requeue tool for the proxied media pipeline.
 * Iterates across canonical packages lacking a media_id, applies the fixed 10MB
 * guardrail, SharpWebP transcoding, and source-fallback indexing to drain unindexed media.
 *
 * Usage:
 *   bun run src/tools/requeue_media.ts [--batch=50] [--max=1000]
 */

import { db } from "../db.ts";
import { logger } from "../logger.ts";
import { ImageProxyService } from "../utils/image_proxy.ts";

export async function runMediaRequeue(options: {
  batchSize?: number;
  maxPackages?: number;
} = {}): Promise<{
  batchesRun: number;
  packagesIndexed: number;
  remainingPending: number;
  totalCachedMedia: number;
}> {
  const batchSize = options.batchSize || 25;
  const maxPackages = options.maxPackages || 5000;

  logger.info(`[RequeueMedia] Initiating media backfill (batchSize: ${batchSize}, max: ${maxPackages})...`);

  let totalProcessed = 0;
  let batches = 0;

  while (totalProcessed < maxPackages) {
    const pendingCount = (db.rawDb.prepare(`
      SELECT count(*) as count FROM canonical_packages WHERE media_id IS NULL;
    `).get() as any)?.count || 0;

    if (pendingCount === 0) {
      logger.info("[RequeueMedia] No canonical packages remain without media_id. Catalog is fully indexed.");
      break;
    }

    const currentBatchLimit = Math.min(batchSize, maxPackages - totalProcessed);
    const indexedInBatch = await ImageProxyService.indexPendingMedia(currentBatchLimit, db);
    batches++;
    totalProcessed += currentBatchLimit;

    logger.info(`[RequeueMedia] Batch ${batches}: processed ${currentBatchLimit} packages (${indexedInBatch} with media, remaining pending: ${Math.max(0, pendingCount - currentBatchLimit)})`);

    if (pendingCount <= currentBatchLimit) {
      break;
    }
  }

  const remainingPending = (db.rawDb.prepare(`
    SELECT count(*) as count FROM canonical_packages WHERE media_id IS NULL;
  `).get() as any)?.count || 0;

  const totalCachedMedia = (db.rawDb.prepare(`
    SELECT count(*) as count FROM media_cache;
  `).get() as any)?.count || 0;

  const totalWithMedia = (db.rawDb.prepare(`
    SELECT count(*) as count FROM canonical_packages WHERE media_id IS NOT NULL AND media_id != 'none';
  `).get() as any)?.count || 0;

  logger.info(`[RequeueMedia] Backfill complete! Packages with media: ${totalWithMedia}, Media cache records: ${totalCachedMedia}, Remaining pending packages: ${remainingPending}`);

  return {
    batchesRun: batches,
    packagesIndexed: totalProcessed,
    remainingPending,
    totalCachedMedia
  };
}

// CLI entrypoint
if (import.meta.main) {
  const args = process.argv.slice(2);
  let batchSize = 25;
  let maxPackages = 200;

  for (const arg of args) {
    if (arg.startsWith("--batch=")) {
      batchSize = parseInt(arg.split("=")[1], 10) || 25;
    } else if (arg.startsWith("--max=")) {
      maxPackages = parseInt(arg.split("=")[1], 10) || 200;
    }
  }

  runMediaRequeue({ batchSize, maxPackages })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      logger.error("[RequeueMedia] Fatal error during media backfill", err);
      process.exit(1);
    });
}
