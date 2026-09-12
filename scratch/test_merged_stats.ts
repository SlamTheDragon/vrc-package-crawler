import { Database } from "bun:sqlite";
const db = new Database("crawler_state.db", { readonly: true });
console.log("Total merged_packages:", (db.query("SELECT COUNT(*) as c FROM merged_packages").get()).c);
console.log("Multi-platform packages:", (db.query("SELECT COUNT(*) as c FROM merged_packages WHERE json_array_length(platforms_json) > 1").get()).c);
const sampleMulti = db.query("SELECT name, author, platforms_json, vcc_url, github_url, booth_url, gumroad_url FROM merged_packages WHERE json_array_length(platforms_json) > 1 LIMIT 5").all();
console.log("Sample multi-platform packages:");
for (const s of sampleMulti) {
  console.log(s);
}
