import { Database } from "bun:sqlite";
const db = new Database("crawler_state.db", { readonly: true });
const emptyOrDummy = db.query("SELECT id, title, author, description, raw_json FROM entities WHERE platform = 'github' AND description LIKE '%VRChat tool repository by%' LIMIT 10").all();
console.log("Count of defaulted descriptions in github entities:", (db.query("SELECT COUNT(*) as c FROM entities WHERE platform = 'github' AND description LIKE '%VRChat tool repository by%'").get()).c);
for (const e of emptyOrDummy) {
  console.log(e);
}
