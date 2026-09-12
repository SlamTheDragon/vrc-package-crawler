import { Database } from "bun:sqlite";
import { RelevanceFilter, type MinimalEntity } from "./filter.ts";

console.log("\x1b[36m");
console.log("==================================================================");
console.log("   VRC PACKAGE CRAWLER — QUARANTINE VERIFICATION & SALVAGE PASS   ");
console.log("==================================================================");
console.log("\x1b[0m");

const db = new Database("crawler_state.db");
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA busy_timeout = 10000;");

const quarantined = db.query("SELECT id, platform, url, title, author, reasons_json, quarantined_at FROM quarantined_entities").all() as any[];
console.log(`Auditing ${quarantined.length} quarantined entities with central RelevanceFilter...`);

let salvagedCount = 0;
let discardedCount = 0;
const salvagedByPlatform: Record<string, number> = { booth: 0, github: 0, gumroad: 0, jinxxy: 0, itch: 0 };
const discardedByPlatform: Record<string, number> = { booth: 0, github: 0, gumroad: 0, jinxxy: 0, itch: 0 };

const insertEntity = db.prepare(`
  INSERT OR REPLACE INTO entities (
    id, platform, url, title, author, price_currency, price_amount,
    description, tags_json, external_links_json, raw_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`);

const deleteQuarantine = db.prepare("DELETE FROM quarantined_entities WHERE id = ?;");
const updateQuarantineReason = db.prepare("UPDATE quarantined_entities SET reasons_json = ? WHERE id = ?;");

const now = new Date().toISOString();

db.transaction(() => {
  for (const item of quarantined) {
    const minEntity: MinimalEntity = {
      id: item.id,
      platform: item.platform,
      url: item.url,
      title: item.title || "Untitled Tool",
      author: item.author || "Unknown",
      description: item.title || "",
      tags_json: "[]",
      raw_json: "{}"
    };

    const evalRes = RelevanceFilter.evaluate(minEntity);
    if (evalRes.isRelevant) {
      salvagedCount++;
      salvagedByPlatform[item.platform] = (salvagedByPlatform[item.platform] || 0) + 1;
      const currency = item.platform === "booth" ? "JPY" : "USD";
      insertEntity.run(
        item.id,
        item.platform,
        item.url,
        item.title || "Untitled Tool",
        item.author || "Unknown",
        currency,
        0,
        item.title || "",
        JSON.stringify(["salvaged"]),
        "[]",
        JSON.stringify({ salvaged_from_quarantine: true, eval_reasons: evalRes.reasons }),
        item.quarantined_at || now,
        now
      );
      deleteQuarantine.run(item.id);
    } else {
      discardedCount++;
      discardedByPlatform[item.platform] = (discardedByPlatform[item.platform] || 0) + 1;
      updateQuarantineReason.run(JSON.stringify(evalRes.reasons), item.id);
    }
  }
})();

console.log("\n==================================================================");
console.log("             QUARANTINE AUDIT & SALVAGE COMPLETE                  ");
console.log("==================================================================");
console.log(`Total Audited:                      ${quarantined.length}`);
console.log(`  + Salvaged & Reinstated Tools:    ${salvagedCount}`);
console.log(`  - Confirmed Quarantined Discards: ${discardedCount}`);

console.log("\nPlatform Breakdown (Salvaged vs Confirmed Discarded):");
for (const p of Object.keys(salvagedByPlatform)) {
  const s = salvagedByPlatform[p] || 0;
  const d = discardedByPlatform[p] || 0;
  const tot = s + d;
  const pct = tot > 0 ? ((s / tot) * 100).toFixed(1) : "0.0";
  console.log(`  [${p.toUpperCase().padEnd(7)}] Salvaged: ${s.toString().padStart(5)} (${pct.padStart(5)}%) | Discarded: ${d.toString().padStart(5)}`);
}

// Checkpoint and verify integrity
db.run("PRAGMA wal_checkpoint(TRUNCATE);");
const totalEntities = (db.query("SELECT COUNT(*) as c FROM entities;").get() as any).c;
const remainingQuarantined = (db.query("SELECT COUNT(*) as c FROM quarantined_entities;").get() as any).c;

console.log("\nUpdated Database State:");
console.log(`  Pristine Entities in DB:    ${totalEntities}`);
console.log(`  Confirmed Quarantined:      ${remainingQuarantined}`);

db.close();
console.log("\nPhase 1: Quarantine Verification Pass completed successfully.\n");
