import { Database } from "bun:sqlite";

const db = new Database("crawler_state.db", { readonly: true });
const vpmEntities = db.query("SELECT id, title, author, url FROM entities WHERE platform = 'vpm'").all() as any[];
const ghList = db.query("SELECT id, url, title, author FROM entities WHERE platform = 'github'").all() as any[];
const ghMap = new Map<string, any>();
const ghRepoOnlyMap = new Map<string, any[]>();

for (const g of ghList) {
  const repoFull = g.id.replace(/^github:/, "").toLowerCase();
  ghMap.set(repoFull, g);
  const repoName = repoFull.split("/")[1];
  if (!ghRepoOnlyMap.has(repoName)) ghRepoOnlyMap.set(repoName, []);
  ghRepoOnlyMap.get(repoName).push(g);
}

let matched = 0;
for (const v of vpmEntities) {
  const pkgId = v.id.replace(/^vpm:/, "");
  const parts = pkgId.split(".").filter((p: string) => p !== "com" && p !== "net" && p !== "org" && p !== "dev" && p !== "io" && p !== "users");
  const lastPart = parts[parts.length - 1]?.toLowerCase();
  const firstPart = parts[0]?.toLowerCase();
  
  if (ghMap.has(`${firstPart}/${lastPart}`)) {
    matched++;
  } else if (ghRepoOnlyMap.has(lastPart)) {
    const candidates = ghRepoOnlyMap.get(lastPart);
    if (candidates.length === 1) {
      matched++;
    }
  }
}
console.log(`Total VPM packages in DB: ${vpmEntities.length}`);
console.log(`Total matched to GitHub repos: ${matched}`);
db.close();
