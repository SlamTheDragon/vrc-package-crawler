import { db } from "./db.ts";
import { CONFIG } from "./config.ts";

const metrics = db.getMetrics();
const S = metrics.totalDiscovered > 0 ? (metrics.totalDone / metrics.totalDiscovered) : 0;

console.log("=================================================");
console.log("       VRC PACKAGE CRAWLER - LIVE STATUS         ");
console.log("=================================================");
console.log(`Database:          ${CONFIG.dbPath}`);
console.log(`Total Discovered:  ${metrics.totalDiscovered}`);
console.log(`Pending Queue:     ${metrics.totalPending}`);
console.log(`Processed (Done):  ${metrics.totalDone}`);
console.log(`Failed / Retrying: ${metrics.totalFailed}`);
console.log(`Ingested Entities: ${metrics.totalEntities}`);
console.log(`Saturation Index:  ${(S * 100).toFixed(2)}% (Target: >= ${CONFIG.targetSaturationScore * 100}%)`);
console.log("-------------------------------------------------");
console.log("Platform Breakdown:");
for (const [p, s] of Object.entries(metrics.platformStats)) {
  console.log(`  - ${p.toUpperCase().padEnd(8)}: Pending=${s.pending.toString().padStart(4)}, Done=${s.done.toString().padStart(4)}, Entities=${s.entities.toString().padStart(4)}`);
}
console.log("=================================================");
