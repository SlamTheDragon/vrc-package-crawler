import { Database } from "bun:sqlite";

const dbCurrent = new Database("crawler_state.db", { readonly: true });
const dbArch1 = new Database("crawler cache archive-1/crawler_state.db", { readonly: true });

const currIds = new Set(dbCurrent.query("SELECT id FROM entities").all().map((r: any) => r.id));
const arch1Rows = dbArch1.query("SELECT id, platform, title, author, url FROM entities").all() as any[];

const missingInCurrent = arch1Rows.filter(r => !currIds.has(r.id));
console.log(`Archive-1 has ${arch1Rows.length} entities.`);
console.log(`Current has ${currIds.size} entities.`);
console.log(`Entities in Archive-1 but NOT in Current: ${missingInCurrent.length}`);

// Breakdown by platform of missing items
const missingByPlatform: Record<string, number> = {};
for (const m of missingInCurrent) {
  missingByPlatform[m.platform] = (missingByPlatform[m.platform] || 0) + 1;
}
console.log("Missing by platform:", missingByPlatform);

// Check if these missing items were quarantined in Current
const currQuarantineIds = new Set(dbCurrent.query("SELECT id FROM quarantined_entities").all().map((r: any) => r.id));
let inCurrentQuarantine = 0;
let completelyLost = 0;
for (const m of missingInCurrent) {
  if (currQuarantineIds.has(m.id)) inCurrentQuarantine++;
  else completelyLost++;
}
console.log(`Of the ${missingInCurrent.length} missing entities:`);
console.log(`  - Quarantined in Current: ${inCurrentQuarantine}`);
console.log(`  - Completely absent in Current (lost/pruned): ${completelyLost}`);

dbCurrent.close();
dbArch1.close();
