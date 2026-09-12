import { Database } from "bun:sqlite";
import { ToolClassifier } from "./classifier.ts";
import { CONFIG } from "./config.ts";

console.log("\x1b[36m");
console.log("==================================================================");
console.log("   VRC PACKAGE CRAWLER — CROSS-REFERENCING & CANONICAL MERGE     ");
console.log("==================================================================");
console.log("\x1b[0m");

const db = new Database(CONFIG.dbPath);
try {
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA busy_timeout = 10000;");

// Initialize merged_packages table
db.run(`
  CREATE TABLE IF NOT EXISTS merged_packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    canonical_id TEXT NOT NULL,
    author TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    primary_platform TEXT NOT NULL,
    platforms_json TEXT NOT NULL,
    url TEXT NOT NULL,
    vcc_url TEXT,
    github_url TEXT,
    booth_url TEXT,
    gumroad_url TEXT,
    jinxxy_url TEXT,
    itch_url TEXT,
    price_currency TEXT DEFAULT 'USD',
    price_amount REAL DEFAULT 0,
    is_vcc INTEGER NOT NULL DEFAULT 0,
    tags_json TEXT DEFAULT '[]',
    source_ids_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create indices for fast lookup and sorted querying
db.run("CREATE INDEX IF NOT EXISTS idx_merged_category ON merged_packages(category);");
db.run("CREATE INDEX IF NOT EXISTS idx_merged_subcategory ON merged_packages(subcategory);");
db.run("CREATE INDEX IF NOT EXISTS idx_merged_type ON merged_packages(type);");
db.run("CREATE INDEX IF NOT EXISTS idx_merged_author ON merged_packages(author);");
db.run("CREATE INDEX IF NOT EXISTS idx_merged_is_vcc ON merged_packages(is_vcc);");

// Clear any existing merged packages for a clean rebuild
// Note: Base provenance tables (entities, quarantined_entities) remain immutable; only the derived canonical view is rebuilt
db.run("DELETE FROM merged_packages;");

function normalizeSlug(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// 1. Fetch all pristine entities
const entities = db.query(`
  SELECT id, platform, url, title, author, price_currency, price_amount,
         description, tags_json, external_links_json, raw_json
  FROM entities
`).all() as any[];

console.log(`Processing ${entities.length} pristine entities...`);

// Index GitHub repos by owner/repo lowercase
const ghMap = new Map<string, any>();
for (const e of entities) {
  if (e.platform === "github") {
    const match = e.url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (match) {
      const fullRepo = `${match[1]}/${match[2]}`.toLowerCase().replace(/\.git$/, "");
      ghMap.set(fullRepo, e);
    }
  }
}

interface PackageCluster {
  id: string;
  name: string;
  canonical_id: string;
  author: string;
  category: string;
  subcategory: string;
  type: string;
  description: string;
  primary_platform: string;
  platforms: Set<string>;
  url: string;
  vcc_url?: string;
  github_url?: string;
  booth_url?: string;
  gumroad_url?: string;
  jinxxy_url?: string;
  itch_url?: string;
  price_currency: string;
  price_amount: number;
  is_vcc: number;
  tags: Set<string>;
  source_ids: string[];
}

const clusters: PackageCluster[] = [];
const entityToCluster = new Map<string, PackageCluster>();

// =========================================================================
// STAGE 1: Seed clusters from VPM packages (highest canonical fidelity)
// =========================================================================
for (const e of entities) {
  if (e.platform === "vpm") {
    let raw: any = {};
    try { raw = JSON.parse(e.raw_json || "{}"); } catch {}

    const pkgId = e.id.replace(/^vpm:/, "");
    let tags: string[] = [];
    try { tags = JSON.parse(e.tags_json || "[]"); } catch {}

    const classification = ToolClassifier.classify(e.title, e.description, tags);

    const cluster: PackageCluster = {
      id: pkgId,
      name: e.title,
      canonical_id: normalizeSlug(pkgId),
      author: e.author,
      category: classification.category,
      subcategory: classification.subcategory,
      type: classification.type,
      description: e.description || e.title,
      primary_platform: "vpm",
      platforms: new Set(["vpm"]),
      url: e.url,
      vcc_url: raw.repo_url ? `vcc://vpm/addRepo?url=${encodeURIComponent(raw.repo_url)}` : undefined,
      price_currency: "USD",
      price_amount: 0,
      is_vcc: 1,
      tags: new Set([...tags, "vpm", "vcc"]),
      source_ids: [e.id]
    };

    // Empirically link canonical upstream repository from manifest URL, repo_url, or release download endpoints
    const match = (e.url + " " + (raw.repo_url || "")).match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (match) {
      const fullRepo = `${match[1]}/${match[2]}`.toLowerCase().replace(/\.git$/, "");
      if (ghMap.has(fullRepo)) {
        const gh = ghMap.get(fullRepo);
        cluster.platforms.add("github");
        cluster.github_url = gh.url;
        cluster.source_ids.push(gh.id);
        entityToCluster.set(gh.id, cluster);
      }
    }

    clusters.push(cluster);
    entityToCluster.set(e.id, cluster);
  }
}
console.log(`[Stage 1] Seeded ${clusters.length} clusters from VPM packages.`);

// =========================================================================
// STAGE 2: Cluster remaining GitHub entities
// =========================================================================
let ghClustersCreated = 0;
for (const e of entities) {
  if (e.platform === "github" && !entityToCluster.has(e.id)) {
    const slug = e.id.replace(/^github:/, "");
    let tags: string[] = [];
    try { tags = JSON.parse(e.tags_json || "[]"); } catch {}

    const classification = ToolClassifier.classify(e.title, e.description, tags);

    const cluster: PackageCluster = {
      id: e.id,
      name: e.title,
      canonical_id: normalizeSlug(slug),
      author: e.author,
      category: classification.category,
      subcategory: classification.subcategory,
      type: classification.type,
      description: e.description || e.title,
      primary_platform: "github",
      platforms: new Set(["github"]),
      url: e.url,
      github_url: e.url,
      price_currency: "USD",
      price_amount: 0,
      is_vcc: 0,
      tags: new Set([...tags, "github", "open-source"]),
      source_ids: [e.id]
    };

    clusters.push(cluster);
    entityToCluster.set(e.id, cluster);
    ghClustersCreated++;
  }
}
console.log(`[Stage 2] Created ${ghClustersCreated} clusters from GitHub entities.`);

// =========================================================================
// STAGE 3: Match & Merge Storefronts (BOOTH, Gumroad, Jinxxy, Itch)
// =========================================================================
let storeMergedCount = 0;
let storeStandaloneCount = 0;

// Semantic cross-storefront deduplication: normalize camelCase slugs, match external links, and align author aliases
for (const e of entities) {
  if (["booth", "gumroad", "jinxxy", "itch"].includes(e.platform)) {
    let extLinks: string[] = [];
    try { extLinks = JSON.parse(e.external_links_json || "[]"); } catch {}

    let matchedCluster: PackageCluster | null = null;

    // Check direct external GitHub link with name/author verification
    for (const link of extLinks) {
      const match = link.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
      if (match) {
        const fullRepo = `${match[1]}/${match[2]}`.toLowerCase().replace(/\.git$/, "");
        const repoName = match[2].toLowerCase().replace(/\.git$/, "");
        const gh = ghMap.get(fullRepo);

        if (gh && entityToCluster.has(gh.id)) {
          const normTitle = normalizeSlug(e.title);
          const normGh = normalizeSlug(gh.title);
          const normRepo = normalizeSlug(repoName);
          const normAuthor = normalizeSlug(e.author);
          const normGhOwner = normalizeSlug(match[1]);

          const titleMatch = normTitle.includes(normGh) || normGh.includes(normTitle) || normTitle.includes(normRepo);
          const authorMatch = normAuthor.includes(normGhOwner) || normGhOwner.includes(normAuthor);

          if (titleMatch || authorMatch) {
            matchedCluster = entityToCluster.get(gh.id)!;
            break;
          }
        }
      }
    }

    if (matchedCluster) {
      // Merge storefront entry into existing cluster
      matchedCluster.platforms.add(e.platform);
      if (e.platform === "booth") matchedCluster.booth_url = e.url;
      else if (e.platform === "gumroad") matchedCluster.gumroad_url = e.url;
      else if (e.platform === "jinxxy") matchedCluster.jinxxy_url = e.url;
      else if (e.platform === "itch") matchedCluster.itch_url = e.url;

      matchedCluster.source_ids.push(e.id);

      if (e.price_amount > 0) {
        matchedCluster.price_amount = e.price_amount;
        matchedCluster.price_currency = e.price_currency || matchedCluster.price_currency;
      }

      let tags: string[] = [];
      try { tags = JSON.parse(e.tags_json || "[]"); } catch {}
      tags.forEach(t => matchedCluster!.tags.add(t));

      entityToCluster.set(e.id, matchedCluster);
      storeMergedCount++;
    } else {
      // Standalone storefront tool / asset
      let tags: string[] = [];
      try { tags = JSON.parse(e.tags_json || "[]"); } catch {}

      const classification = ToolClassifier.classify(e.title, e.description, tags);

      const cluster: PackageCluster = {
        id: e.id,
        name: e.title,
        canonical_id: normalizeSlug(e.id),
        author: e.author,
        category: classification.category,
        subcategory: classification.subcategory,
        type: classification.type,
        description: e.description || e.title,
        primary_platform: e.platform,
        platforms: new Set([e.platform]),
        url: e.url,
        price_currency: e.price_currency || (e.platform === "booth" ? "JPY" : "USD"),
        price_amount: e.price_amount || 0,
        is_vcc: 0,
        tags: new Set([...tags, e.platform]),
        source_ids: [e.id]
      };

      if (e.platform === "booth") cluster.booth_url = e.url;
      else if (e.platform === "gumroad") cluster.gumroad_url = e.url;
      else if (e.platform === "jinxxy") cluster.jinxxy_url = e.url;
      else if (e.platform === "itch") cluster.itch_url = e.url;

      clusters.push(cluster);
      entityToCluster.set(e.id, cluster);
      storeStandaloneCount++;
    }
  }
}

console.log(`[Stage 3] Storefronts Merged into Existing Clusters: ${storeMergedCount}`);
console.log(`[Stage 3] Storefronts Standalone Clusters:          ${storeStandaloneCount}`);

// =========================================================================
// STAGE 4: Populate merged_packages table with strict QoL-first ordering
// =========================================================================
console.log("\nPopulating merged_packages table in SQLite...");

const insertMerged = db.prepare(`
  INSERT INTO merged_packages (
    id, name, canonical_id, author, category, subcategory, type,
    description, primary_platform, platforms_json, url, vcc_url,
    github_url, booth_url, gumroad_url, jinxxy_url, itch_url,
    price_currency, price_amount, is_vcc, tags_json, source_ids_json
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  );
`);

db.transaction(() => {
  for (const c of clusters) {
    insertMerged.run(
      c.id,
      c.name,
      c.canonical_id,
      c.author,
      c.category,
      c.subcategory,
      c.type,
      c.description,
      c.primary_platform,
      JSON.stringify(Array.from(c.platforms)),
      c.url,
      c.vcc_url || null,
      c.github_url || null,
      c.booth_url || null,
      c.gumroad_url || null,
      c.jinxxy_url || null,
      c.itch_url || null,
      c.price_currency,
      c.price_amount,
      c.is_vcc,
      JSON.stringify(Array.from(c.tags)),
      JSON.stringify(c.source_ids)
    );
  }
})();

console.log("\n==================================================================");
console.log("             CROSS-REFERENCING & MERGE COMPLETE                  ");
console.log("==================================================================");

const finalCount = (db.query("SELECT COUNT(*) as c FROM merged_packages;").get() as any).c;
const multiPlatformCount = (db.query("SELECT COUNT(*) as c FROM merged_packages WHERE json_array_length(platforms_json) > 1;").get() as any).c;
const vccCount = (db.query("SELECT COUNT(*) as c FROM merged_packages WHERE is_vcc = 1;").get() as any).c;
const qolCount = (db.query("SELECT COUNT(*) as c FROM merged_packages WHERE type = 'QoL, Workflow & Toolchain';").get() as any).c;
const assetCount = (db.query("SELECT COUNT(*) as c FROM merged_packages WHERE type = 'Asset Additive';").get() as any).c;

console.log(`Raw Pristine Entities Ingested:    ${entities.length}`);
console.log(`Canonical Packages Output:          ${finalCount}`);
console.log(`Entities Consolidated (Merged):     ${entities.length - finalCount}`);
console.log(`Packages on Multiple Platforms:     ${multiPlatformCount}`);
console.log(`VCC / VPM Compatible Packages:      ${vccCount}`);
console.log(`Traditional Community Packages:     ${finalCount - vccCount}`);

console.log(`\nTool Type Breakdown (Sorted QoL First, Asset Additive Last):`);
console.log(`  * QoL, Workflow & Toolchain:       ${qolCount} (${((qolCount / finalCount) * 100).toFixed(1)}%)`);
console.log(`  * Asset Additive (Gimmicks/Toys):   ${assetCount} (${((assetCount / finalCount) * 100).toFixed(1)}%)`);

console.log("\nCategory & Subcategory Breakdown:");
const subcats = db.query(`
  SELECT category, subcategory, type, COUNT(*) as cnt
  FROM merged_packages
  GROUP BY category, subcategory, type
  ORDER BY 
    CASE category 
      WHEN 'Avatars' THEN 1 
      WHEN 'World Creation' THEN 2 
      WHEN 'Shaders & Visuals' THEN 3 
      WHEN 'Tools & Utilities' THEN 4 
      ELSE 5 
    END,
    CASE type 
      WHEN 'QoL, Workflow & Toolchain' THEN 1 
      ELSE 2 
    END,
    cnt DESC;
`).all() as any[];

let currentCat = "";
for (const row of subcats) {
  if (row.category !== currentCat) {
    currentCat = row.category;
    console.log(`\n[${currentCat}]`);
  }
    const typeBadge = row.type === "QoL, Workflow & Toolchain" ? "[QoL]  " : "[Asset]";
    console.log(`  ${typeBadge} ${row.subcategory.padEnd(45)}: ${row.cnt.toString().padStart(5)}`);
  }
} finally {
  try {
    db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    db.close();
  } catch (_) {}
}

console.log("\nPhase 3 & 4 completed successfully.\n");
