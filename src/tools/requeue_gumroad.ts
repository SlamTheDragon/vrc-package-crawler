import { db } from "../db.ts";
import { logger } from "../logger.ts";
import { GumroadDriver } from "../drivers/gumroad.ts";
import { runPipelineSanitize } from "./pipeline_sanitize.ts";

/**
 * CLI tool to execute a mandated requeue of shallow Gumroad entities.
 * 
 * Usage:
 *   bun run src/tools/requeue_gumroad.ts
 *   bun run src/tools/requeue_gumroad.ts --url https://haggets.gumroad.com/l/lgamfn
 */
async function main() {
  const args = process.argv.slice(2);
  const urlIdx = args.indexOf("--url");

  if (urlIdx !== -1 && args[urlIdx + 1]) {
    const targetUrl = args[urlIdx + 1];
    logger.info(`[MandatedRequeue] Executing targeted single-product crawl & hydration: ${targetUrl}`);
    const ok = await GumroadDriver.crawlProduct(targetUrl);
    logger.info(`[MandatedRequeue] Product crawl result: ${ok ? "SUCCESS" : "FAILED"}`);

    if (ok) {
      logger.info("[MandatedRequeue] Running pipeline sanitization to project updated canonical packages...");
      await runPipelineSanitize();
      logger.info("[MandatedRequeue] Targeted hydration complete.");
    }
    process.exit(ok ? 0 : 1);
  }

  logger.info("[MandatedRequeue] Starting mandated requeue of all shallow Gumroad entities in SQLite...");
  const result = db.requeueShallowGumroadEntities();
  logger.info(`[MandatedRequeue] Inspection complete: ${result.inspected} Gumroad entities inspected.`);
  logger.info(`[MandatedRequeue] Mandated promotion complete: ${result.promoted} shallow entities promoted to Priority 10 in frontier.`);

  const pendingCount = (db.rawDb.prepare(
    "SELECT COUNT(*) as c FROM frontier WHERE platform = 'gumroad' AND status = 'pending' AND priority = 10;"
  ).get() as any)?.c || 0;

  logger.info(`[MandatedRequeue] Total Gumroad items currently pending at Priority 10: ${pendingCount}`);
  process.exit(0);
}

main().catch((err) => {
  logger.error("[MandatedRequeue] Fatal error during mandated requeue", err);
  process.exit(1);
});
