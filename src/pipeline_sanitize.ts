import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";
import { RelevanceFilter, type MinimalEntity, CREATOR_WHITELIST } from "./filter.ts";
import { ToolClassifier } from "./classifier.ts";
import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";
import { IanaRegistry } from "./utils/iana.ts";
import { SimHash64, SimHashIndex } from "./utils/simhash.ts";

export async function runPipelineSanitize() {
  await IanaRegistry.init();

  console.log("\x1b[36m");
  console.log("==================================================================");
  console.log("   VRC PACKAGE CRAWLER — UNIFIED DETERMINISTIC SANITIZATION PASS  ");
  console.log("==================================================================");
  console.log("\x1b[0m");

  const db = new Database(CONFIG.dbPath);
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA synchronous = NORMAL;");
db.run("PRAGMA busy_timeout = 10000;");

// Ensure tables exist
db.run(`
  CREATE TABLE IF NOT EXISTS quarantined_entities (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    reasons_json TEXT,
    quarantined_at TEXT NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS merged_packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    canonical_id TEXT NOT NULL,
    author TEXT NOT NULL,
    authors_json TEXT DEFAULT '[]',
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
    dependencies_json TEXT DEFAULT '{}',
    source_ids_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  db.run("ALTER TABLE merged_packages ADD COLUMN authors_json TEXT DEFAULT '[]';");
} catch {}
try {
  db.run("ALTER TABLE merged_packages ADD COLUMN dependencies_json TEXT DEFAULT '{}';");
} catch {}

// =========================================================================
// STEP 1: AUDIT & CLEAN RAW ENTITIES + QUARANTINE RECOVERY
// =========================================================================
console.log("\n[Step 1/5] Auditing raw entities and salvaging legitimate quarantined items...");

// 1.1 Recover falsely quarantined items (e.g. MagmaVRC/SimplXP, prominent creators)
const quarantined = db.query("SELECT id, platform, url, title, author, reasons_json, quarantined_at FROM quarantined_entities").all() as any[];
console.log(`Auditing ${quarantined.length} currently quarantined records...`);

let salvagedCount = 0;
const insertEntity = db.prepare(`
  INSERT OR REPLACE INTO entities (
    id, platform, url, title, author, price_currency, price_amount,
    description, tags_json, external_links_json, raw_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`);
const deleteQuarantine = db.prepare("DELETE FROM quarantined_entities WHERE id = ?;");

const now = new Date().toISOString();

db.transaction(() => {
  for (const q of quarantined) {
    const minEntity: MinimalEntity = {
      id: q.id,
      platform: q.platform,
      url: q.url,
      title: q.title || "Untitled Tool",
      author: q.author || "Unknown",
      description: q.title || "",
      tags_json: "[]",
      raw_json: "{}"
    };

    const evalRes = RelevanceFilter.evaluate(minEntity);
    if (evalRes.isRelevant) {
      salvagedCount++;
      const currency = q.platform === "booth" ? "JPY" : "USD";
      insertEntity.run(
        q.id,
        q.platform,
        q.url,
        q.title || "Untitled Tool",
        q.author || "Unknown",
        currency,
        0,
        q.title || "",
        JSON.stringify(["salvaged"]),
        "[]",
        JSON.stringify({ salvaged_from_quarantine: true, eval_reasons: evalRes.reasons }),
        q.quarantined_at || now,
        now
      );
      deleteQuarantine.run(q.id);
    }
  }
})();
console.log(`  + Salvaged ${salvagedCount} legitimate tools from quarantine!`);

// 1.2 Audit all current entities and purge true false positives (e.g. skeleton repos, dummy templates)
const allEntities = db.query("SELECT id, platform, url, title, author, price_currency, price_amount, description, tags_json, external_links_json, raw_json FROM entities").all() as any[];
console.log(`Auditing ${allEntities.length} active entities with updated RelevanceFilter...`);

let keptCount = 0;
let purgedCount = 0;
const insertQuarantine = db.prepare(`
  INSERT OR REPLACE INTO quarantined_entities (id, platform, url, title, author, reasons_json, quarantined_at)
  VALUES (?, ?, ?, ?, ?, ?, ?);
`);
const deleteEntity = db.prepare("DELETE FROM entities WHERE id = ?;");

db.transaction(() => {
  for (const e of allEntities) {
    const evalRes = RelevanceFilter.evaluate(e);
    if (evalRes.isRelevant) {
      keptCount++;
    } else {
      purgedCount++;
      insertQuarantine.run(
        e.id,
        e.platform,
        e.url,
        e.title || "Untitled",
        e.author || "Unknown",
        JSON.stringify(evalRes.reasons),
        now
      );
      deleteEntity.run(e.id);
    }
  }
})();
console.log(`  + Pristine Entities Kept: ${keptCount}`);
console.log(`  - Non-Tools / Skeletons Purged to Quarantine: ${purgedCount}`);

// =========================================================================
// STEP 2: NORMALIZATION (TITLES, AUTHORS, DESCRIPTIONS)
// =========================================================================
console.log("\n[Step 2/5] Normalizing titles, descriptions, and disambiguating authors...");

function unescapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

const MARKETING_BRACKETS = [
  /^[【\[(]?(?:VRC(?:hat)?|Unity|3Dモデル|3D衣装|VRC想定|3Dシステム|3Dアバター|VRC向け)[】\])]\s*/gi,
  /[【\[(]?(?:VRC(?:hat)?|Unity|3Dモデル|3D衣装|VRC想定|3Dシステム|3Dアバター|VRC向け)[】\])]$/gi,
  /^[【\[(]?(?:無料|FREE|Free|Sale|セール|VerUP|早急用|簡単導入|全アバター対応|汎用|MA対応|Modular Avatar対応|VRCFury対応|非公式)[】\])]\s*/gi,
  /[【\[(]?(?:無料|FREE|Free|Sale|セール|VerUP|早急用|簡単導入|全アバター対応|汎用|MA対応|Modular Avatar対応|VRCFury対応|非公式)[】\])]$/gi,
  /\s*[【\[(](?:VRC(?:hat)?|Unity|3Dモデル|3D衣装|無料|FREE|Free|Sale|セール|VerUP|早急用)[】\])]/gi
];

function cleanTitle(rawTitle: string): string {
  let title = unescapeHtml(rawTitle || "Untitled");
  for (let i = 0; i < 3; i++) {
    for (const pat of MARKETING_BRACKETS) {
      title = title.replace(pat, " ");
    }
  }
  title = title.replace(/\s+v?[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\s*beta|\s*alpha)?$/i, "");
  title = title.replace(/\s+/g, " ").trim();
  return title.length > 0 ? title : unescapeHtml(rawTitle);
}

function cleanSingleAuthorName(rawName: string): string {
  if (!rawName) return "";
  let a = unescapeHtml(rawName);
  a = a.replace(/<[^>]+>/g, "").replace(/\([^)]+\)/g, "");
  a = a.replace(/[@#].*$/, "");
  a = a.replace(/\s+/g, " ").trim();
  return a;
}

interface AuthorResolution {
  primaryAuthor: string;
  allAuthors: string[];
}

function resolveAuthors(
  rawAuthor: string,
  pkgId: string = "",
  repoUrl: string = "",
  rawAuthorsList?: any[]
): AuthorResolution {
  const authorsSet = new Set<string>();

  // 1. Process structured rawAuthorsList (from manifest authors/contributors)
  if (Array.isArray(rawAuthorsList)) {
    for (const item of rawAuthorsList) {
      const name = typeof item === "string" ? item : item?.name;
      if (name && typeof name === "string") {
        const cleaned = cleanSingleAuthorName(name);
        if (cleaned && !IanaRegistry.isTld(cleaned) && cleaned.toLowerCase() !== "unknown") {
          authorsSet.add(cleaned);
        }
      }
    }
  }

  // 2. Process rawAuthor string (may be comma-separated e.g. "Author1, Author2")
  if (rawAuthor) {
    const parts = rawAuthor.split(/[,;\/&]+/).map(cleanSingleAuthorName).filter(Boolean);
    for (const p of parts) {
      if (p && !IanaRegistry.isTld(p) && p.toLowerCase() !== "unknown") {
        authorsSet.add(p);
      }
    }
  }

  // 3. Empirical Repository Ground Truth: If repoUrl provides an exact GitHub repo owner, verify/augment
  let ghOwner: string | null = null;
  if (repoUrl) {
    const ghMatch = repoUrl.match(/github\.com\/([a-zA-Z0-9_-]+)\//i);
    if (ghMatch && ghMatch[1]) {
      const owner = ghMatch[1];
      if (owner.toLowerCase() === "vrchat") {
        ghOwner = "VRChat";
      } else if (owner.length >= 2 && !IanaRegistry.isTld(owner)) {
        ghOwner = owner;
      }
    }
  }

  // 4. VRChat SDK Components: com.vrchat.* is authored by "VRChat"
  const cleanId = pkgId.replace(/^vpm:/i, "");
  const isVRChatOfficial = cleanId.startsWith("com.vrchat.") || cleanId.startsWith("vrchat.");

  let primaryAuthor = "";

  if (isVRChatOfficial) {
    primaryAuthor = "VRChat";
    authorsSet.add("VRChat");
  } else if (ghOwner) {
    if (authorsSet.size === 0 || Array.from(authorsSet).every(a => a.toLowerCase() === "vrchat" || a.toLowerCase() === "community")) {
      primaryAuthor = ghOwner;
      authorsSet.add(ghOwner);
    } else {
      const firstValid = Array.from(authorsSet).find(a => a.toLowerCase() !== "community" && a.toLowerCase() !== "vrchat");
      primaryAuthor = firstValid || ghOwner;
    }
  }

  // 5. Author Disambiguation for VPM packages with generic, missing, or TLD-polluted authors
  if (!primaryAuthor || primaryAuthor.toLowerCase() === "vrchat" || primaryAuthor.toLowerCase() === "community" || IanaRegistry.isTld(primaryAuthor)) {
    if (pkgId) {
      const parts = IanaRegistry.cleanReverseDnsSegments(cleanId);
      if (parts.length > 0) {
        const candidate = parts[0];
        if (candidate.toLowerCase() === "vrchat") {
          primaryAuthor = "VRChat";
        } else if (candidate.length >= 2 && !IanaRegistry.isTld(candidate)) {
          primaryAuthor = candidate;
        }
      }
    }
  }

  if (!primaryAuthor) {
    const list = Array.from(authorsSet);
    primaryAuthor = list.length > 0 ? list[0] : (cleanSingleAuthorName(rawAuthor) || "Unknown");
  }

  if (primaryAuthor && primaryAuthor !== "Unknown" && !authorsSet.has(primaryAuthor)) {
    authorsSet.add(primaryAuthor);
  }

  const allAuthors = Array.from(authorsSet).filter(a => {
    if (a.toLowerCase() === "community") return false;
    if (a.toLowerCase() === "vrchat" && !isVRChatOfficial && (ghOwner !== "VRChat")) return false;
    return true;
  });

  if (allAuthors.length === 0) {
    allAuthors.push(primaryAuthor);
  }

  return {
    primaryAuthor,
    allAuthors
  };
}

function cleanAuthor(rawAuthor: string, pkgId: string = "", repoUrl: string = "", rawAuthorsList?: any[]): string {
  return resolveAuthors(rawAuthor, pkgId, repoUrl, rawAuthorsList).primaryAuthor;
}

const activeEntities = db.query(`
  SELECT id, platform, url, title, author, description, tags_json, raw_json
  FROM entities
`).all() as any[];

const updateEntityStmt = db.prepare(`
  UPDATE entities
  SET title = ?, author = ?, description = ?, tags_json = ?, raw_json = ?, updated_at = ?
  WHERE id = ?;
`);

db.transaction(() => {
  for (const e of activeEntities) {
    const cleanedT = cleanTitle(e.title);
    let raw: any = {};
    try { raw = JSON.parse(e.raw_json || "{}"); } catch {}
    const repoUrl = raw.repo_url || e.url || "";
    const authorRes = resolveAuthors(e.author, e.platform === "vpm" ? e.id : "", repoUrl, raw.authors);
    let desc = unescapeHtml(e.description || "");
    desc = desc.replace(/!\[.*?\]\(.*?\)/g, "").replace(/(?:https?:\/\/discord\.gg\/\S+)/gi, "").trim();

    let tags: string[] = [];
    try { tags = JSON.parse(e.tags_json || "[]"); } catch {}
    if (e.title.includes("MA") && !tags.includes("Modular Avatar")) tags.push("Modular Avatar");
    if (e.title.includes("VRCFury") && !tags.includes("VRCFury")) tags.push("VRCFury");
    if (e.title.includes("NDMF") && !tags.includes("NDMF")) tags.push("NDMF");

    raw.authors = authorRes.allAuthors;

    updateEntityStmt.run(cleanedT, authorRes.primaryAuthor, desc, JSON.stringify(tags), JSON.stringify(raw), now, e.id);
  }
})();
console.log(`  Normalized ${activeEntities.length} active entities.`);

// =========================================================================
// STEP 3: RECONCILE MISSING ITEMS FROM ARCHIVE-1 (RAW DELTA ONLY)
// =========================================================================
console.log("\n[Step 3/5] Computing asymmetric raw delta from Archive-1...");
const ARCHIVE_1_PATH = CONFIG.archive1Path;
let archive1Reconciled = 0;

if (fs.existsSync(ARCHIVE_1_PATH)) {
  const dbArch1 = new Database(ARCHIVE_1_PATH, { readonly: true });
  const currentEntityIds = new Set(db.query("SELECT id FROM entities").all().map((r: any) => r.id));
  const currentQuarantinedIds = new Set(db.query("SELECT id FROM quarantined_entities").all().map((r: any) => r.id));

  const arch1Rows = dbArch1.query(`
    SELECT id, platform, url, title, author, price_currency, price_amount, description, tags_json, external_links_json, raw_json
    FROM entities
  `).all() as any[];
  dbArch1.close();

  console.log(`Found ${arch1Rows.length} entities in Archive-1. Evaluating unobserved delta...`);

  db.transaction(() => {
    for (const r of arch1Rows) {
      // If already in pristine entities table, skip
      if (currentEntityIds.has(r.id)) continue;

      // Evaluate raw candidate with current truth engine using full metadata
      const evalRes = RelevanceFilter.evaluate(r);
      if (evalRes.isRelevant) {
        const cleanedT = cleanTitle(r.title);
        let raw: any = {};
        try { raw = JSON.parse(r.raw_json || "{}"); } catch {}
        const repoUrl = raw.repo_url || r.url || "";
        const authorRes = resolveAuthors(r.author, r.platform === "vpm" ? r.id : "", repoUrl, raw.authors);
        raw.authors = authorRes.allAuthors;
        insertEntity.run(
          r.id,
          r.platform,
          r.url,
          cleanedT,
          authorRes.primaryAuthor,
          r.price_currency || (r.platform === "booth" ? "JPY" : "USD"),
          r.price_amount || 0,
          r.description || "",
          r.tags_json || "[]",
          r.external_links_json || "[]",
          JSON.stringify({ ...raw, reconciled_from_archive1: true }),
          now,
          now
        );
        deleteQuarantine.run(r.id);
        archive1Reconciled++;
        currentEntityIds.add(r.id);
      } else if (!currentQuarantinedIds.has(r.id)) {
        insertQuarantine.run(
          r.id,
          r.platform,
          r.url,
          r.title || "Untitled",
          r.author || "Unknown",
          JSON.stringify(evalRes.reasons),
          now
        );
        currentQuarantinedIds.add(r.id);
      }
    }
  })();
  console.log(`  + Reconciled ${archive1Reconciled} verified tools from Archive-1 without dirty metadata!`);
} else {
  console.log("  Archive-1 database not found, skipping delta reconciliation.");
}

// =========================================================================
// STEP 4: MULTI-PLATFORM CANONICAL CLUSTERING (merged_packages)
// =========================================================================
console.log("\n[Step 4/5] Executing multi-way canonical clustering into merged_packages...");

db.run("DELETE FROM merged_packages;");

function normalizeSlug(str: string): string {
  if (!str) return "";
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface PackageCluster {
  id: string;
  name: string;
  canonical_id: string;
  author: string;
  authors: Set<string>;
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
  dependencies: Record<string, string>;
  source_ids: string[];
}

function extractDependencies(rawJsonStr: string): Record<string, string> {
  if (!rawJsonStr) return {};
  try {
    const raw = JSON.parse(rawJsonStr);
    const deps = raw.vpmDependencies || raw.dependencies;
    if (deps && typeof deps === "object" && !Array.isArray(deps)) {
      const cleanDeps: Record<string, string> = {};
      for (const [k, v] of Object.entries(deps)) {
        if (typeof k === "string" && k.trim()) {
          cleanDeps[k.trim()] = typeof v === "string" ? v.trim() : String(v);
        }
      }
      return cleanDeps;
    }
  } catch {}
  return {};
}

const entities = db.query(`
  SELECT id, platform, url, title, author, price_currency, price_amount,
         description, tags_json, external_links_json, raw_json
  FROM entities
`).all() as any[];

console.log(`Clustering ${entities.length} pristine entities across all platforms...`);

// Index GitHub repos by owner/repo lowercase
const ghMap = new Map<string, any>();
const ghRepoOnlyMap = new Map<string, any[]>();
for (const e of entities) {
  if (e.platform === "github") {
    const match = e.url.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
    if (match) {
      const fullRepo = `${match[1]}/${match[2]}`.toLowerCase().replace(/\.git$/, "");
      const repoOnly = match[2].toLowerCase().replace(/\.git$/, "");
      ghMap.set(fullRepo, e);
      if (!ghRepoOnlyMap.has(repoOnly)) ghRepoOnlyMap.set(repoOnly, []);
      ghRepoOnlyMap.get(repoOnly)!.push(e);
    }
  }
}

const clusters: PackageCluster[] = [];
const entityToCluster = new Map<string, PackageCluster>();
const clusterByAuthorTitle = new Map<string, PackageCluster>();
const clusterByStoreUrl = new Map<string, PackageCluster>();
const simHashIndex = new SimHashIndex();
const clusterById = new Map<string, PackageCluster>();

function registerClusterUrls(c: PackageCluster) {
  if (c.url) clusterByStoreUrl.set(c.url, c);
  if (c.booth_url) clusterByStoreUrl.set(c.booth_url, c);
  if (c.gumroad_url) clusterByStoreUrl.set(c.gumroad_url, c);
  if (c.jinxxy_url) clusterByStoreUrl.set(c.jinxxy_url, c);
  if (c.itch_url) clusterByStoreUrl.set(c.itch_url, c);
}

// Stage 4.1: Seed clusters from VPM packages (highest fidelity)
for (const e of entities) {
  if (e.platform === "vpm") {
    let raw: any = {};
    try { raw = JSON.parse(e.raw_json || "{}"); } catch {}

    const pkgId = e.id.replace(/^vpm:/, "");
    let tags: string[] = [];
    try { tags = JSON.parse(e.tags_json || "[]"); } catch {}

    const classification = ToolClassifier.classify(e.title, e.description, tags);
    const deps = extractDependencies(e.raw_json);
    const authorRes = resolveAuthors(e.author, e.id, raw.repo_url || e.url, raw.authors);

    const cluster: PackageCluster = {
      id: pkgId,
      name: e.title,
      canonical_id: normalizeSlug(pkgId),
      author: authorRes.primaryAuthor,
      authors: new Set(authorRes.allAuthors),
      category: classification.category,
      subcategory: classification.subcategory,
      type: classification.type,
      description: e.description || e.title,
      primary_platform: "vpm",
      platforms: new Set(["vpm"]),
      url: e.url,
      vcc_url: raw.manifest_url ? `vcc://vpm/addRepo?url=${encodeURIComponent(raw.manifest_url)}` : undefined,
      price_currency: "USD",
      price_amount: 0,
      is_vcc: 1,
      tags: new Set([...tags, "vpm", "vcc"]),
      dependencies: deps,
      source_ids: [e.id]
    };

    // Link to GitHub repo:
    // A. Direct repo URL in manifest, entity url, or download url
    let linkedGh: any = null;
    const combinedUrls = `${e.url} ${raw.repo_url || ""} ${raw.download_url || ""}`;
    const match = combinedUrls.match(/github\.com\/([^\s/]+)\/([^\s/#?]+)/i);
    if (match) {
      const fullRepo = `${match[1]}/${match[2]}`.toLowerCase().replace(/\.git$/, "");
      cluster.github_url = `https://github.com/${match[1]}/${match[2].replace(/\.git$/, "")}`;
      if (ghMap.has(fullRepo)) linkedGh = ghMap.get(fullRepo);
    }

    // B. Reverse-DNS namespace matching (e.g. dev.onevr.vrworldtoolkit -> onevr/vrworldtoolkit, com.anatawa12.avatar-optimizer -> anatawa12/AvatarOptimizer)
    if (!linkedGh) {
      const parts = pkgId.split(".").filter((p: string) => p !== "com" && p !== "net" && p !== "org" && p !== "dev" && p !== "io" && p !== "users");
      if (parts.length >= 2) {
        const full = `${parts[0]}/${parts[1]}`.toLowerCase();
        if (ghMap.has(full)) {
          linkedGh = ghMap.get(full);
        } else {
          // Normalized matching (camelCase vs hyphenated)
          const normFull = `${normalizeSlug(parts[0])}/${normalizeSlug(parts[1])}`;
          for (const [k, v] of ghMap.entries()) {
            if (normalizeSlug(k) === normFull) {
              linkedGh = v;
              break;
            }
          }
        }
      }
      if (!linkedGh && parts.length > 0) {
        const lastPartNorm = normalizeSlug(parts[parts.length - 1]);
        for (const [k, v] of ghRepoOnlyMap.entries()) {
          if (normalizeSlug(k) === lastPartNorm && v.length === 1) {
            linkedGh = v[0];
            break;
          }
        }
      }
    }

    if (linkedGh) {
      cluster.platforms.add("github");
      cluster.github_url = linkedGh.url;
      cluster.source_ids.push(linkedGh.id);
      let ghRaw: any = {};
      try { ghRaw = JSON.parse(linkedGh.raw_json || "{}"); } catch {}
      const ghAuthorRes = resolveAuthors(linkedGh.author, "", linkedGh.url, ghRaw.authors);
      ghAuthorRes.allAuthors.forEach(a => cluster.authors.add(a));
      const ghDeps = extractDependencies(linkedGh.raw_json);
      for (const [k, v] of Object.entries(ghDeps)) {
        if (!cluster.dependencies[k]) {
          cluster.dependencies[k] = v;
        }
      }
      entityToCluster.set(linkedGh.id, cluster);
    }

    clusters.push(cluster);
    entityToCluster.set(e.id, cluster);
    clusterById.set(cluster.id, cluster);
    if (cluster.description && cluster.description.length > 50) {
      simHashIndex.insert(cluster.id, SimHash64.compute(`${cluster.name}\n${cluster.description}`));
    }

    const atKey = `${normalizeSlug(cluster.author)}::${normalizeSlug(cluster.name)}`;
    clusterByAuthorTitle.set(atKey, cluster);
    registerClusterUrls(cluster);
  }
}
console.log(`  [4.1] Seeded ${clusters.length} clusters from VPM packages.`);

// Stage 4.2: Cluster remaining GitHub entities
let ghClusters = 0;
for (const e of entities) {
  if (e.platform === "github" && !entityToCluster.has(e.id)) {
    const slug = e.id.replace(/^github:/, "");
    let tags: string[] = [];
    try { tags = JSON.parse(e.tags_json || "[]"); } catch {}

    let raw: any = {};
    try { raw = JSON.parse(e.raw_json || "{}"); } catch {}
    const authorRes = resolveAuthors(e.author, "", e.url, raw.authors);
    const classification = ToolClassifier.classify(e.title, e.description, tags);
    const deps = extractDependencies(e.raw_json);

    const cluster: PackageCluster = {
      id: e.id,
      name: e.title,
      canonical_id: normalizeSlug(slug),
      author: authorRes.primaryAuthor,
      authors: new Set(authorRes.allAuthors),
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
      dependencies: deps,
      source_ids: [e.id]
    };

    clusters.push(cluster);
    entityToCluster.set(e.id, cluster);
    clusterById.set(cluster.id, cluster);
    if (cluster.description && cluster.description.length > 50) {
      simHashIndex.insert(cluster.id, SimHash64.compute(`${cluster.name}\n${cluster.description}`));
    }
    const atKey = `${normalizeSlug(cluster.author)}::${normalizeSlug(cluster.name)}`;
    clusterByAuthorTitle.set(atKey, cluster);
    registerClusterUrls(cluster);
    ghClusters++;
  }
}
console.log(`  [4.2] Created ${ghClusters} clusters from GitHub entities.`);

// Stage 4.3: Match & Merge Storefronts (Booth, Gumroad, Jinxxy, Itch)
let storeMerged = 0;
let storeStandalone = 0;

for (const e of entities) {
  if (["booth", "gumroad", "jinxxy", "itch"].includes(e.platform)) {
    let extLinks: string[] = [];
    try { extLinks = JSON.parse(e.external_links_json || "[]"); } catch {}

    let matchedCluster: PackageCluster | null = null;

    // A. Check external GitHub link
    for (const link of extLinks) {
      const match = link.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
      if (match) {
        const fullRepo = `${match[1]}/${match[2]}`.toLowerCase().replace(/\.git$/, "");
        const gh = ghMap.get(fullRepo);
        if (gh && entityToCluster.has(gh.id)) {
          matchedCluster = entityToCluster.get(gh.id)!;
          break;
        }
      }
    }

    // B. Check Author + Title normalized match
    if (!matchedCluster) {
      const normAuth = normalizeSlug(e.author);
      const normTitle = normalizeSlug(e.title);
      const atKey = `${normAuth}::${normTitle}`;
      if (clusterByAuthorTitle.has(atKey)) {
        matchedCluster = clusterByAuthorTitle.get(atKey)!;
      }
    }

    // C. Check cross-storefront links (O(1) URL lookup)
    if (!matchedCluster) {
      for (const link of extLinks) {
        if (clusterByStoreUrl.has(link)) {
          matchedCluster = clusterByStoreUrl.get(link)!;
          break;
        }
      }
    }

    // D. Check 64-bit SimHash near-duplicate descriptions (Henzinger 2006)
    if (!matchedCluster && simHashIndex.size > 0 && e.description && e.description.length > 60) {
      const eHash = SimHash64.compute(`${e.title}\n${e.description}`);
      const nearMatches = simHashIndex.query(eHash, 3);
      if (nearMatches.length > 0) {
        for (const match of nearMatches) {
          const candidate = clusterById.get(match.id);
          if (candidate && !candidate.platforms.has(e.platform)) {
            const cleanId = e.id.replace(/^[a-z]+:/, "");
            // Dependency anti-merge invariant: never merge if entity is in dependencies
            if (!candidate.dependencies[cleanId]) {
              const normAuthE = normalizeSlug(e.author);
              const normAuthC = normalizeSlug(candidate.author);
              if (
                normAuthE === normAuthC ||
                normAuthE.includes(normAuthC) ||
                normAuthC.includes(normAuthE) ||
                candidate.author === "Unknown" ||
                e.author === "Unknown"
              ) {
                matchedCluster = candidate;
                break;
              }
            }
          }
        }
      }
    }

    if (matchedCluster) {
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

      let raw: any = {};
      try { raw = JSON.parse(e.raw_json || "{}"); } catch {}
      const storeAuthorRes = resolveAuthors(e.author, "", e.url, raw.authors);
      storeAuthorRes.allAuthors.forEach(a => matchedCluster!.authors.add(a));
      if (matchedCluster.author === "Unknown" && storeAuthorRes.primaryAuthor !== "Unknown") {
        matchedCluster.author = storeAuthorRes.primaryAuthor;
      }

      let tags: string[] = [];
      try { tags = JSON.parse(e.tags_json || "[]"); } catch {}
      tags.forEach(t => matchedCluster!.tags.add(t));

      const extraDeps = extractDependencies(e.raw_json);
      for (const [k, v] of Object.entries(extraDeps)) {
        if (!matchedCluster.dependencies[k]) {
          matchedCluster.dependencies[k] = v;
        }
      }

      entityToCluster.set(e.id, matchedCluster);
      registerClusterUrls(matchedCluster);
      storeMerged++;
    } else {
      let raw: any = {};
      try { raw = JSON.parse(e.raw_json || "{}"); } catch {}
      const authorRes = resolveAuthors(e.author, "", e.url, raw.authors);
      let tags: string[] = [];
      try { tags = JSON.parse(e.tags_json || "[]"); } catch {}

      const classification = ToolClassifier.classify(e.title, e.description, tags);
      const deps = extractDependencies(e.raw_json);

      const cluster: PackageCluster = {
        id: e.id,
        name: e.title,
        canonical_id: normalizeSlug(e.id),
        author: authorRes.primaryAuthor,
        authors: new Set(authorRes.allAuthors),
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
        dependencies: deps,
        source_ids: [e.id]
      };

      if (e.platform === "booth") cluster.booth_url = e.url;
      else if (e.platform === "gumroad") cluster.gumroad_url = e.url;
      else if (e.platform === "jinxxy") cluster.jinxxy_url = e.url;
      else if (e.platform === "itch") cluster.itch_url = e.url;

      clusters.push(cluster);
      entityToCluster.set(e.id, cluster);
      clusterById.set(cluster.id, cluster);
      if (cluster.description && cluster.description.length > 50) {
        simHashIndex.insert(cluster.id, SimHash64.compute(`${cluster.name}\n${cluster.description}`));
      }
      const atKey = `${normalizeSlug(cluster.author)}::${normalizeSlug(cluster.name)}`;
      clusterByAuthorTitle.set(atKey, cluster);
      registerClusterUrls(cluster);
      storeStandalone++;
    }
  }
}
console.log(`  [4.3] Storefronts merged: ${storeMerged} | Storefronts standalone: ${storeStandalone}`);

// Insert into merged_packages
const insertMerged = db.prepare(`
  INSERT INTO merged_packages (
    id, name, canonical_id, author, authors_json, category, subcategory, type,
    description, primary_platform, platforms_json, url, vcc_url,
    github_url, booth_url, gumroad_url, jinxxy_url, itch_url,
    price_currency, price_amount, is_vcc, tags_json, dependencies_json, source_ids_json
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  );
`);

db.transaction(() => {
  for (const c of clusters) {
    insertMerged.run(
      c.id,
      c.name,
      c.canonical_id,
      c.author,
      JSON.stringify(Array.from(c.authors)),
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
      JSON.stringify(c.dependencies || {}),
      JSON.stringify(c.source_ids)
    );
  }
})();

// =========================================================================
// STEP 5: DISCARD MANAGEMENT, OPTIMIZATION & INTEGRITY AUDIT
// =========================================================================
console.log("\n[Step 5/5] Processing qualified discards, checkpointing database, and verifying integrity...");

// Ensure qualified_discards table exists
db.run(`
  CREATE TABLE IF NOT EXISTS qualified_discards (
    url TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    reason TEXT NOT NULL,
    attempts INTEGER DEFAULT 1,
    discarded_at TEXT NOT NULL
  );
`);

// Migrate failed URLs with >= 3 attempts or invalid speculative endpoints
const discardCount = db.run(`
  INSERT OR REPLACE INTO qualified_discards (url, platform, reason, attempts, discarded_at)
  SELECT url, platform, 'Maximum retry attempts exceeded or endpoint dead (404)', attempts, '${now}'
  FROM frontier
  WHERE status = 'failed' AND (attempts >= 2 OR url LIKE '%.booth.pm/%.json' OR url LIKE '%example.github.io%');
`).changes;

db.run(`
  DELETE FROM frontier
  WHERE status = 'failed' AND (attempts >= 2 OR url LIKE '%.booth.pm/%.json' OR url LIKE '%example.github.io%');
`);

console.log(`  + Migrated ${discardCount} exhausted failed URLs to qualified_discards.`);

db.run("PRAGMA wal_checkpoint(TRUNCATE);");
const check = db.query("PRAGMA quick_check;").get() as any;
console.log(`PRAGMA quick_check result: ${JSON.stringify(check)}`);

const finalEntities = (db.query("SELECT COUNT(*) as c FROM entities;").get() as any).c;
const finalQuarantine = (db.query("SELECT COUNT(*) as c FROM quarantined_entities;").get() as any).c;
const finalMerged = (db.query("SELECT COUNT(*) as c FROM merged_packages;").get() as any).c;
const multiPlat = (db.query("SELECT COUNT(*) as c FROM merged_packages WHERE json_array_length(platforms_json) > 1;").get() as any).c;
const qolCount = (db.query("SELECT COUNT(*) as c FROM merged_packages WHERE type = 'QoL, Workflow & Toolchain';").get() as any).c;
const assetCount = (db.query("SELECT COUNT(*) as c FROM merged_packages WHERE type = 'Asset Additive';").get() as any).c;

console.log("\n==================================================================");
console.log("             PIPELINE SANITIZATION COMPLETE SUMMARY               ");
console.log("==================================================================");
console.log(`Pristine Raw Entities in DB:         ${finalEntities.toLocaleString()}`);
console.log(`Confirmed Quarantined Discards:      ${finalQuarantine.toLocaleString()}`);
console.log(`Canonical Packages (Deduplicated):   ${finalMerged.toLocaleString()}`);
console.log(`Packages on Multiple Platforms:      ${multiPlat.toLocaleString()}`);
console.log(`Consolidated Multi-Platform Records: ${(entities.length - finalMerged).toLocaleString()}`);
console.log(`  - QoL, Workflow & Toolchain:       ${qolCount.toLocaleString()} (${((qolCount / finalMerged) * 100).toFixed(1)}%)`);
console.log(`  - Asset Additives (Gimmicks/Toys): ${assetCount.toLocaleString()} (${((assetCount / finalMerged) * 100).toFixed(1)}%)`);
console.log("==================================================================\n");

  db.close();
}

if (import.meta.main) {
  runPipelineSanitize().catch(console.error);
}
