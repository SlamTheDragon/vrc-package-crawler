import { seedAllDomains } from "./index.ts";
import { db } from "./db.ts";

console.log("\x1b[36m==================================================================");
console.log("   VRC PACKAGE CRAWLER — EXECUTING SEED EXPANSION                 ");
console.log("==================================================================\x1b[0m");

await seedAllDomains();

const metrics = db.getMetrics();
console.log("\nExpansion Results:");
console.log(`Total Discovered:  ${metrics.totalDiscovered.toLocaleString()}`);
console.log(`Pending in Queue:  ${metrics.totalPending.toLocaleString()}`);
console.log("\nBreakdown by Platform:");
for (const [p, s] of Object.entries(metrics.platformStats)) {
  console.log(`  • ${p.toUpperCase().padEnd(8)} : Pending = ${s.pending.toLocaleString().padStart(5)} | Done = ${s.done.toLocaleString().padStart(5)} | Vetted = ${s.entities.toLocaleString().padStart(5)}`);
}

db.close();
process.exit(0);
