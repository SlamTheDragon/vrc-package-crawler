import { Database } from "bun:sqlite";
import { RelevanceFilter, type MinimalEntity } from "./filter.ts";

console.log("\x1b[36m");
console.log("==================================================================");
console.log("   VRC PACKAGE CRAWLER — CROSS-PLATFORM RELEVANCE PURGE & AUDIT   ");
console.log("==================================================================");
console.log("\x1b[0m");

const db = new Database("crawler_state.db");
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA busy_timeout = 10000;");

// Ensure quarantined_entities exists
db.run(`
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

// 1. Fetch all current entities
const allEntities = db.query("SELECT id, platform, url, title, author, description, tags_json, raw_json FROM entities").all() as MinimalEntity[];
console.log(`Auditing ${allEntities.length} existing entities in database...`);

let keptCount = 0;
let quarantinedCount = 0;
const platformKept: Record<string, number> = { booth: 0, github: 0, gumroad: 0, jinxxy: 0, vpm: 0 };
const platformQuarantined: Record<string, number> = { booth: 0, github: 0, gumroad: 0, jinxxy: 0, vpm: 0 };

const insertQuarantine = db.prepare(`
  INSERT OR REPLACE INTO quarantined_entities (id, platform, url, title, author, reasons_json, quarantined_at)
  VALUES (?, ?, ?, ?, ?, ?, ?);
`);

const deleteEntity = db.prepare("DELETE FROM entities WHERE id = ?;");

const now = new Date().toISOString();

db.transaction(() => {
  for (const e of allEntities) {
    const evalRes = RelevanceFilter.evaluate(e);
    if (evalRes.isRelevant) {
      keptCount++;
      platformKept[e.platform] = (platformKept[e.platform] || 0) + 1;
    } else {
      quarantinedCount++;
      platformQuarantined[e.platform] = (platformQuarantined[e.platform] || 0) + 1;

      insertQuarantine.run(
        e.id,
        e.platform,
        e.url,
        e.title || "Untitled",
        e.author || "Unknown",
        JSON.stringify(evalRes.reasons),
        now
      );
      deleteEntity.run(e.id);
    }
  }
})();

console.log("\nEntity Audit & Quarantine Complete:");
console.log(`  + Total Vetted Tools Kept: ${keptCount}`);
console.log(`  - Total Entities Quarantined: ${quarantinedCount}`);

console.log("\nPlatform Breakdown (Kept vs Quarantined):");
for (const p of Object.keys(platformKept)) {
  const k = platformKept[p] || 0;
  const q = platformQuarantined[p] || 0;
  const total = k + q;
  const pct = total > 0 ? ((k / total) * 100).toFixed(1) : "0.0";
  console.log(`  [${p.toUpperCase().padEnd(7)}] Kept: ${k.toString().padStart(5)} (${pct.padStart(5)}%) | Quarantined: ${q.toString().padStart(5)}`);
}

// 2. Clean up pending URLs in frontier matching irrelevant candidates
console.log("\nAuditing pending frontier URLs...");
const pendingUrls = db.query("SELECT url, platform FROM frontier WHERE status = 'pending'").all() as { url: string; platform: string }[];
console.log(`Examining ${pendingUrls.length} pending URLs...`);

let prunedFrontier = 0;
const deleteFrontier = db.prepare("DELETE FROM frontier WHERE url = ?;");

db.transaction(() => {
  for (const p of pendingUrls) {
    if (!RelevanceFilter.isUrlCandidateRelevant(p.url, p.platform)) {
      deleteFrontier.run(p.url);
      prunedFrontier++;
    }
  }
})();

console.log(`  - Pruned ${prunedFrontier} irrelevant pending URLs from frontier.`);

// 3. Truncate WAL and run quick check
console.log("\nOptimizing database checkpoint & verifying integrity...");
db.run("PRAGMA wal_checkpoint(TRUNCATE);");
const checkRes = db.query("PRAGMA quick_check;").get() as any;
console.log(`PRAGMA quick_check result: ${JSON.stringify(checkRes)}`);

const finalEntities = (db.query("SELECT COUNT(*) as c FROM entities;").get() as any).c;
const finalQuarantined = (db.query("SELECT COUNT(*) as c FROM quarantined_entities;").get() as any).c;
const finalFrontier = (db.query("SELECT COUNT(*) as c FROM frontier;").get() as any).c;
const finalPending = (db.query("SELECT COUNT(*) as c FROM frontier WHERE status = 'pending';").get() as any).c;

console.log("\n=== FINAL REVENUE OF POST-PURGE DATABASE ===");
console.log(`  Entities (Pristine Tools):   ${finalEntities}`);
console.log(`  Quarantined Records:         ${finalQuarantined}`);
console.log(`  Frontier Total:              ${finalFrontier}`);
console.log(`  Frontier Pending:            ${finalPending}`);

db.close();
console.log("\nPurge process completed successfully.");
