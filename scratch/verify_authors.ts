import { Database } from "bun:sqlite";
const db = new Database("crawler_state.db", { readonly: true });
console.log(db.query("SELECT id, name, author, primary_platform, github_url FROM merged_packages WHERE id IN ('com.llealloo.audiolink', 'dev.onevr.vrworldtoolkit', 'vrchat.blackstartx.gesture-manager')").all());
