import { Database } from "bun:sqlite";
const db = new Database("crawler_state.db", { readonly: true });
const failedVpm = db.query("SELECT url, attempts, updated_at FROM frontier WHERE platform = 'vpm' AND status = 'failed' LIMIT 20").all();
console.log("Failed VPM count:", (db.query("SELECT COUNT(*) as c FROM frontier WHERE platform = 'vpm' AND status = 'failed'").get()).c);
console.log("Sample failed VPM URLs:");
for (const f of failedVpm) {
  console.log(f);
}
