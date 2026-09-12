import { Database } from "bun:sqlite";
const db = new Database("crawler_state.db", { readonly: true });
const vpmEntities = db.query("SELECT id, title, author, url, raw_json FROM entities WHERE platform = 'vpm' LIMIT 15").all();
for (const v of vpmEntities) {
  console.log(v);
}
