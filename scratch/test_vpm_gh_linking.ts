import { Database } from "bun:sqlite";

const db = new Database("crawler_state.db", { readonly: true });
const vpmEntities = db.query("SELECT id, title, author, url FROM entities WHERE platform = 'vpm' LIMIT 50").all() as any[];
const ghRepos = new Set(db.query("SELECT id FROM entities WHERE platform = 'github'").all().map((r: any) => r.id.replace(/^github:/, "").toLowerCase()));

let matched = 0;
for (const v of vpmEntities) {
  const pkgId = v.id.replace(/^vpm:/, "");
  const parts = pkgId.split(".").filter((p: string) => p !== "com" && p !== "net" && p !== "org" && p !== "dev" && p !== "io" && p !== "users");
  if (parts.length >= 2) {
    const candidateOwner = parts[0];
    const candidateRepo = parts[1];
    const full = `${candidateOwner}/${candidateRepo}`.toLowerCase();
    if (ghRepos.has(full)) {
      matched++;
      console.log(`MATCH: ${pkgId} -> https://github.com/${full}`);
    }
  }
}
console.log(`Matched ${matched}/50 sample VPM packages directly to GitHub repos!`);
db.close();
