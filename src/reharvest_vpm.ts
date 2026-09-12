import { Database } from "bun:sqlite";
import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";
import { VpmIndexDriver } from "./drivers/vpm_index.ts";

console.log("\x1b[36m==================================================================");
console.log("   VRC PACKAGE CRAWLER — REHARVESTING ALL VPM MANIFESTS           ");
console.log("==================================================================\x1b[0m");

const db = new Database(CONFIG.dbPath);
let isReharvestInterrupted = false;

const shutdownReharvest = (signal: string) => {
  if (isReharvestInterrupted) process.exit(130);
  isReharvestInterrupted = true;
  console.log(`\n\x1b[33m[REHARVEST] Received ${signal}. Stopping workers and closing database...\x1b[0m`);
  try {
    db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    db.close();
  } catch (_) {}
  process.exit(0);
};

process.on("SIGINT", () => shutdownReharvest("SIGINT"));
process.on("SIGTERM", () => shutdownReharvest("SIGTERM"));

try {
  const vpmUrls = db.query(`
    SELECT DISTINCT url FROM frontier
    WHERE platform = 'vpm' AND url LIKE '%.json'
  `).all() as { url: string }[];

  console.log(`Found ${vpmUrls.length} VPM JSON manifest URLs to reharvest with fixed parser.`);

  let processed = 0;
  let succeeded = 0;
  const CONCURRENCY = 8;

  async function worker(urls: string[]) {
    for (const item of urls) {
      if (isReharvestInterrupted) break;
      try {
        const ok = await VpmIndexDriver.crawlManifest(item);
        if (ok) succeeded++;
      } catch (err) {
        // ignore
      }
      processed++;
      if (processed % 25 === 0 || processed === vpmUrls.length) {
        console.log(`Progress: ${processed}/${vpmUrls.length} manifests reharvested (${succeeded} valid).`);
      }
    }
  }

  const chunks: string[][] = Array.from({ length: CONCURRENCY }, () => []);
  vpmUrls.forEach((u, i) => chunks[i % CONCURRENCY].push(u.url));

  await Promise.all(chunks.map(chunk => worker(chunk)));

  console.log(`\nReharvest complete! Succeeded: ${succeeded}/${vpmUrls.length}`);
} finally {
  try {
    db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    db.close();
  } catch (_) {}
}
