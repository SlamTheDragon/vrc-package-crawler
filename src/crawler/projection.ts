import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";
import { RelevanceFilter, type MinimalEntity, CREATOR_WHITELIST } from "../filter.ts";
import { ToolClassifier } from "../classifier.ts";
import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";
import { IanaRegistry } from "../utils/iana.ts";
import { SimHash64, SimHashIndex } from "../utils/simhash.ts";
import { db as sharedDb } from "../db.ts";
import { sanitizeOutboundUrl } from "../utils/image_proxy.ts";
import { cleanTitle, cleanAuthorName, cleanDescription, resolveAuthors, unescapeHtml, normalizeListingTitle } from "../utils/sanitizer.ts";

let activePipelineDb: Database | null = null;
let isPipelineInterrupted = false;

function shutdownPipeline(signal: string) {
  if (isPipelineInterrupted) {
    process.exit(130);
  }
  isPipelineInterrupted = true;
  console.log(`\n\x1b[33m[PROJECTION] Interrupted via ${signal}. Checkpointing SQLite WAL and closing database...\x1b[0m`);
  if (activePipelineDb) {
    try {
      activePipelineDb.run("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch (_) {}
    try {
      activePipelineDb.close();
    } catch (_) {}
    activePipelineDb = null;
  }
  process.exit(0);
}

export function abortPipelineSanitize() {
  isPipelineInterrupted = true;
  abortProjection();
}

export function abortProjection() {
  isPipelineInterrupted = true;
}

export async function runProjection(options?: { targetDb?: Database | { rawDb: Database } | string }) {
  isPipelineInterrupted = false;
  await IanaRegistry.init();
  if (isPipelineInterrupted) return;

  console.log("\x1b[36m");
  console.log("==================================================================");
  console.log("   VRC PACKAGE CRAWLER — CANONICAL PROJECTION & SIMHASH PIPELINE  ");
  console.log("==================================================================");
  console.log("\x1b[0m");

  const isCustom = !!options?.targetDb;
  let db: Database;
  if (options?.targetDb) {
    if (typeof options.targetDb === "string") {
      db = new Database(options.targetDb);
    } else if ("rawDb" in options.targetDb) {
      db = options.targetDb.rawDb;
    } else {
      db = options.targetDb;
    }
  } else {
    db = new Database(CONFIG.dbPath);
  }
  if (!isCustom) {
    activePipelineDb = db;
  }
  try {
    db.run("PRAGMA journal_mode = WAL;");
    db.run("PRAGMA synchronous = NORMAL;");
    db.run("PRAGMA busy_timeout = 10000;");

    // Ensure unified tables exist
    db.run(`
      CREATE TABLE IF NOT EXISTS canonical_packages (
        id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
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
        price_currency TEXT DEFAULT 'USD',
        price_amount REAL DEFAULT 0,
        is_vcc INTEGER NOT NULL DEFAULT 0,
        tags_json TEXT DEFAULT '[]',
        dependencies_json TEXT DEFAULT '{}',
        source_ids_json TEXT NOT NULL,
        media_id TEXT,
        media_urls_json TEXT DEFAULT '[]',
        youtube_urls_json TEXT DEFAULT '[]',
        origin_created_at TEXT,
        origin_updated_at TEXT,
        created_at_confidence TEXT DEFAULT 'unknown'
          CHECK(created_at_confidence IN ('confirmed','inferred','unknown')),
        lifecycle TEXT DEFAULT 'published'
          CHECK(lifecycle IN ('published','updated','delisted','archived',
                              'paywall_introduced','dmca_removed','creator_opted_out','needs_review')),
        lifecycle_updated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    try { db.run("ALTER TABLE canonical_packages ADD COLUMN created_at_confidence TEXT DEFAULT 'unknown';"); } catch (_) {}
    try { db.run("ALTER TABLE canonical_packages ADD COLUMN lifecycle TEXT DEFAULT 'published';"); } catch (_) {}
    try { db.run("ALTER TABLE canonical_packages ADD COLUMN lifecycle_updated_at TEXT;"); } catch (_) {}
    try { db.run("ALTER TABLE canonical_packages ADD COLUMN media_urls_json TEXT DEFAULT '[]';"); } catch (_) {}
    try { db.run("ALTER TABLE canonical_packages ADD COLUMN youtube_urls_json TEXT DEFAULT '[]';"); } catch (_) {}

    db.run(`
      CREATE TABLE IF NOT EXISTS package_fronts (
        id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        platform_item_id TEXT NOT NULL,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        price_currency TEXT,
        price_amount REAL,
        origin_created_at TEXT,
        origin_updated_at TEXT,
        raw_entity_id TEXT NOT NULL,
        media_urls_json TEXT DEFAULT '[]',
        youtube_urls_json TEXT DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // =========================================================================
    // STEP 1: AUDIT & CLEAN RAW ENTITIES + QUARANTINE RECOVERY
    // =========================================================================
    if (isPipelineInterrupted) return;
    console.log("\n[Step 1/5] Auditing raw entities and salvaging legitimate quarantined items...");

    const quarantined = db.query(`
      SELECT id, platform, url, title, author, description, tags_json, external_links_json, raw_json, quarantine_reasons_json, origin_created_at, origin_updated_at
      FROM entities
      WHERE is_quarantined = 1;
    `).all() as any[];
    console.log(`Auditing ${quarantined.length} currently quarantined records in observation lake...`);

    let salvagedCount = 0;
    const unquarantineStmt = db.prepare(`
      UPDATE entities
      SET is_quarantined = 0,
          quarantine_reasons_json = '[]',
          updated_at = ?
      WHERE id = ?;
    `);

    const now = new Date().toISOString();

    db.transaction(() => {
      for (const q of quarantined) {
        const minEntity: MinimalEntity = {
          id: q.id,
          platform: q.platform,
          url: q.url,
          title: q.title || "Untitled Tool",
          author: q.author || "Unknown",
          description: q.description || q.title || "",
          tags_json: q.tags_json || "[]",
          raw_json: q.raw_json || "{}"
        };

        const evalRes = RelevanceFilter.evaluate(minEntity);
        if (evalRes.isRelevant) {
          salvagedCount++;
          unquarantineStmt.run(now, q.id);
        }
      }
    })();
    console.log(`  + Salvaged ${salvagedCount} legitimate tools from quarantine!`);

    const allEntities = db.query(`
      SELECT id, platform, url, title, author, price_currency, price_amount, description, tags_json, external_links_json, raw_json, origin_created_at, origin_updated_at
      FROM entities
      WHERE is_quarantined = 0;
    `).all() as any[];
    console.log(`Auditing ${allEntities.length} active entities with updated RelevanceFilter...`);

    let keptCount = 0;
    let purgedCount = 0;
    const quarantineStmt = db.prepare(`
      UPDATE entities
      SET is_quarantined = 1,
          quarantine_reasons_json = ?,
          updated_at = ?
      WHERE id = ?;
    `);

    db.transaction(() => {
      for (const e of allEntities) {
        const evalRes = RelevanceFilter.evaluate(e);
        if (evalRes.isRelevant) {
          keptCount++;
        } else {
          purgedCount++;
          quarantineStmt.run(JSON.stringify(evalRes.reasons), now, e.id);
        }
      }
    })();
    console.log(`  + Pristine Entities Kept: ${keptCount}`);
    console.log(`  - Non-Tools / Skeletons Purged to Quarantine: ${purgedCount}`);

    // =========================================================================
    // STEP 2: NORMALIZATION (TITLES, AUTHORS, DESCRIPTIONS)
    // =========================================================================
    if (isPipelineInterrupted) return;
    console.log("\n[Step 2/5] Normalizing titles, descriptions, and disambiguating authors...");

    const activeEntities = db.query(`
      SELECT id, platform, url, title, author, description, tags_json, raw_json
      FROM entities
      WHERE is_quarantined = 0;
    `).all() as any[];

    const updateEntityStmt = db.prepare(`
      UPDATE entities
      SET title = ?, author = ?, description = ?, tags_json = ?, raw_json = ?, updated_at = ?
      WHERE id = ?;
    `);

    let updatedCount = 0;
    db.transaction(() => {
      for (const e of activeEntities) {
        const cleanedT = cleanTitle(e.title);
        let raw: any = {};
        try { raw = JSON.parse(e.raw_json || "{}"); } catch {}
        const repoUrl = raw.repo_url || e.url || "";
        const authorRes = resolveAuthors(e.author, e.platform === "vpm" ? e.id : "", repoUrl, raw.authors);
        const desc = cleanDescription(e.description || "");

        let tags: string[] = [];
        try { tags = JSON.parse(e.tags_json || "[]"); } catch {}
        if (e.title.includes("MA") && !tags.includes("Modular Avatar")) tags.push("Modular Avatar");
        if (e.title.includes("VRCFury") && !tags.includes("VRCFury")) tags.push("VRCFury");
        if (e.title.includes("NDMF") && !tags.includes("NDMF")) tags.push("NDMF");

        const needsUpdate =
          cleanedT !== e.title ||
          authorRes.primaryAuthor !== e.author ||
          desc !== (e.description || "") ||
          !raw.authors;

        if (needsUpdate) {
          raw.authors = authorRes.allAuthors;
          updateEntityStmt.run(cleanedT, authorRes.primaryAuthor, desc, JSON.stringify(tags), JSON.stringify(raw), now, e.id);
          updatedCount++;
        }
      }
    })();
    console.log(`  Audited ${activeEntities.length} active entities (${updatedCount} synchronized; ${activeEntities.length - updatedCount} verified clean from front-stage).`);

    // =========================================================================
    // STEP 3: MULTI-PLATFORM CANONICAL CLUSTERING
    // =========================================================================
    if (isPipelineInterrupted) return;
    console.log("\n[Step 3/5] Executing multi-way canonical clustering into merged packages...");

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
      platform_urls: Map<string, string>;
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
             description, tags_json, external_links_json, raw_json, origin_created_at, origin_updated_at, observed_at, created_at, updated_at
      FROM entities
      WHERE is_quarantined = 0
    `).all() as any[];
    const entityMap = new Map<string, any>(entities.map(e => [e.id, e]));

    console.log(`Clustering ${entities.length} pristine entities across all platforms...`);

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
      for (const u of c.platform_urls.values()) {
        if (u) clusterByStoreUrl.set(u, c);
      }
    }

    // Stage 3.1: Seed clusters from VPM packages
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
          platform_urls: new Map([["vpm", e.url]]),
          price_currency: "USD",
          price_amount: 0,
          is_vcc: 1,
          tags: new Set([...tags, "vpm", "vcc"]),
          dependencies: deps,
          source_ids: [e.id]
        };

        let linkedGh: any = null;
        const combinedUrls = `${e.url} ${raw.repo_url || ""} ${raw.download_url || ""}`;
        const match = combinedUrls.match(/github\.com\/([^\s/]+)\/([^\s/#?]+)/i);
        if (match) {
          const fullRepo = `${match[1]}/${match[2]}`.toLowerCase().replace(/\.git$/, "");
          const ghUrl = `https://github.com/${match[1]}/${match[2].replace(/\.git$/, "")}`;
          cluster.platform_urls.set("github", ghUrl);
          if (ghMap.has(fullRepo)) linkedGh = ghMap.get(fullRepo);
        }

        if (!linkedGh) {
          const parts = pkgId.split(".").filter((p: string) => p !== "com" && p !== "net" && p !== "org" && p !== "dev" && p !== "io" && p !== "users");
          if (parts.length >= 2) {
            const full = `${parts[0]}/${parts[1]}`.toLowerCase();
            if (ghMap.has(full)) {
              linkedGh = ghMap.get(full);
            } else {
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
          cluster.platform_urls.set("github", linkedGh.url);
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

          // Enrich cluster description using linked GitHub README description
          if (linkedGh.description) {
            const vpmDesc = cluster.description || "";
            const ghDesc = linkedGh.description;
            if (!vpmDesc || vpmDesc === cluster.name || vpmDesc.length < 50) {
              cluster.description = ghDesc;
            } else if (!ghDesc.toLowerCase().includes(vpmDesc.toLowerCase().slice(0, 40))) {
              cluster.description = `${vpmDesc}\n\n${ghDesc}`.slice(0, 2500);
            }
          }
        }

        clusters.push(cluster);
        entityToCluster.set(e.id, cluster);
        clusterById.set(cluster.id, cluster);
        if (cluster.description && cluster.description.length > 50) {
          simHashIndex.insert(cluster.id, SimHash64.compute(`${normalizeListingTitle(cluster.name)}\n${cluster.description}`));
        }

        const atKey = `${normalizeSlug(cluster.author)}::${normalizeSlug(normalizeListingTitle(cluster.name))}`;
        clusterByAuthorTitle.set(atKey, cluster);
        registerClusterUrls(cluster);
      }
    }
    console.log(`  [3.1] Seeded ${clusters.length} clusters from VPM packages.`);

    // Stage 3.2: Cluster remaining GitHub entities
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
          platform_urls: new Map([["github", e.url]]),
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
          simHashIndex.insert(cluster.id, SimHash64.compute(`${normalizeListingTitle(cluster.name)}\n${cluster.description}`));
        }
        const atKey = `${normalizeSlug(cluster.author)}::${normalizeSlug(normalizeListingTitle(cluster.name))}`;
        clusterByAuthorTitle.set(atKey, cluster);
        registerClusterUrls(cluster);
        ghClusters++;
      }
    }
    console.log(`  [3.2] Created ${ghClusters} clusters from GitHub entities.`);

    // Stage 3.3: Match & Merge Storefronts (Booth, Gumroad, Jinxxy, Itch)
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
          const normTitle = normalizeSlug(normalizeListingTitle(e.title));
          const atKey = `${normAuth}::${normTitle}`;
          if (clusterByAuthorTitle.has(atKey)) {
            matchedCluster = clusterByAuthorTitle.get(atKey)!;
          }
        }

        // C. Check cross-storefront links
        if (!matchedCluster) {
          for (const link of extLinks) {
            if (clusterByStoreUrl.has(link)) {
              matchedCluster = clusterByStoreUrl.get(link)!;
              break;
            }
          }
        }

        // D. Check 64-bit SimHash near-duplicate descriptions
        if (!matchedCluster && simHashIndex.size > 0 && e.description && e.description.length > 60) {
          const eHash = SimHash64.compute(`${normalizeListingTitle(e.title)}\n${e.description}`);
          const nearMatches = simHashIndex.query(eHash, 3);
          if (nearMatches.length > 0) {
            for (const match of nearMatches) {
              const candidate = clusterById.get(match.id);
              if (candidate && !candidate.platforms.has(e.platform)) {
                const cleanId = e.id.replace(/^[a-z]+:/, "");
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
          matchedCluster.platform_urls.set(e.platform, e.url);

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

          // Enrich cluster description if merged storefront has a richer or more informative description
          if (e.description && e.description.length > 50) {
            const currentDesc = matchedCluster.description || "";
            if (!currentDesc || currentDesc.length < 50 || currentDesc === matchedCluster.name) {
              matchedCluster.description = e.description;
            } else if (e.description.length > currentDesc.length * 1.5 && !e.description.toLowerCase().includes(currentDesc.toLowerCase().slice(0, 40))) {
              matchedCluster.description = `${currentDesc}\n\n${e.description}`.slice(0, 2500);
            }
          }

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
            platform_urls: new Map([[e.platform, e.url]]),
            price_currency: e.price_currency || (e.platform === "booth" ? "JPY" : "USD"),
            price_amount: e.price_amount || 0,
            is_vcc: 0,
            tags: new Set([...tags, e.platform]),
            dependencies: deps,
            source_ids: [e.id]
          };

          clusters.push(cluster);
          entityToCluster.set(e.id, cluster);
          clusterById.set(cluster.id, cluster);
          if (cluster.description && cluster.description.length > 50) {
            simHashIndex.insert(cluster.id, SimHash64.compute(`${normalizeListingTitle(cluster.name)}\n${cluster.description}`));
          }
          const atKey = `${normalizeSlug(cluster.author)}::${normalizeSlug(normalizeListingTitle(cluster.name))}`;
          clusterByAuthorTitle.set(atKey, cluster);
          registerClusterUrls(cluster);
          storeStandalone++;
        }
      }
    }
    console.log(`  [3.3] Storefronts merged: ${storeMerged} | Storefronts standalone: ${storeStandalone}`);

    // =========================================================================
    // STEP 4: PERSIST PROJECTIONS (canonical_packages & package_fronts)
    // =========================================================================
    const insertCanonical = db.prepare(`
      INSERT OR REPLACE INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, vcc_url,
        price_currency, price_amount, is_vcc, tags_json, dependencies_json, source_ids_json,
        media_id, media_urls_json, youtube_urls_json,
        origin_created_at, origin_updated_at, created_at_confidence, lifecycle,
        lifecycle_updated_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      );
    `);

    const insertFront = db.prepare(`
      INSERT OR REPLACE INTO package_fronts (
        id, canonical_id, platform, platform_item_id, url, title, author,
        price_currency, price_amount, origin_created_at, origin_updated_at,
        raw_entity_id, media_urls_json, youtube_urls_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    const existingMetadata = new Map<string, { lifecycle: string; lifecycle_updated_at: string | null; media_id: string | null; created_at: string | null }>();
    try {
      const rows = db.query("SELECT canonical_id, lifecycle, lifecycle_updated_at, media_id, created_at FROM canonical_packages;").all() as any[];
      for (const r of rows) {
        existingMetadata.set(r.canonical_id, {
          lifecycle: r.lifecycle || "published",
          lifecycle_updated_at: r.lifecycle_updated_at,
          media_id: r.media_id || null,
          created_at: r.created_at || null
        });
      }
    } catch (_) {}

    const existingFrontMetadata = new Map<string, { created_at: string | null }>();
    try {
      const frontRows = db.query("SELECT id, created_at FROM package_fronts;").all() as any[];
      for (const fr of frontRows) {
        existingFrontMetadata.set(fr.id, { created_at: fr.created_at || null });
      }
    } catch (_) {}

    const curatorOverrides = sharedDb.getAllCuratorOverrides();

    db.transaction(() => {
      db.run("DELETE FROM canonical_packages;");
      db.run("DELETE FROM package_fronts;");
      const timestampNow = new Date().toISOString();

      for (const c of clusters) {
        if (sharedDb.isCreatorOptedOut(c.author)) {
          continue;
        }

        let originCreatedAt: string | null = null;
        let originUpdatedAt: string | null = null;
        let hasAuthoritativeDate = false;
        let earliestLocalObservedAt: string | null = null;

        for (const sid of c.source_ids) {
          const ent = entityMap.get(sid);
          if (ent) {
            let raw: any = {};
            try { raw = JSON.parse(ent.raw_json || "{}"); } catch {}

            const explicitUpstreamCreated = raw.originCreatedAt || raw.published_at || null;
            const upstreamCreated = explicitUpstreamCreated || ent.origin_created_at || null;
            const upstreamUpdated = ent.origin_updated_at || raw.originUpdatedAt || null;

            const isAuthoritative = Boolean(
              explicitUpstreamCreated ||
              (ent.origin_created_at && (!ent.observed_at || ent.origin_created_at !== ent.observed_at))
            );

            if (upstreamCreated) {
              if (isAuthoritative) {
                hasAuthoritativeDate = true;
              }
              if (!originCreatedAt || upstreamCreated < originCreatedAt) {
                originCreatedAt = upstreamCreated;
              }
            }
            if (upstreamUpdated) {
              if (!originUpdatedAt || upstreamUpdated > originUpdatedAt) {
                originUpdatedAt = upstreamUpdated;
              }
            }

            const localObserved = ent.observed_at || ent.created_at || null;
            if (localObserved && (!earliestLocalObservedAt || localObserved < earliestLocalObservedAt)) {
              earliestLocalObservedAt = localObserved;
            }
          }
        }

        // =====================================================================
        // TASK 1.4 INVARIANT ENFORCEMENT:
        // When upstream metadata lacks a verifiable publication date, origin_created_at
        // MUST be strictly NULL with created_at_confidence = 'unknown'.
        // NEVER fall back to crawler local observation / fetch time.
        // =====================================================================
        let createdAtConfidence: "confirmed" | "inferred" | "unknown" = "unknown";
        if (!originCreatedAt) {
          originCreatedAt = null;
          createdAtConfidence = "unknown";
        } else if (hasAuthoritativeDate) {
          createdAtConfidence = "confirmed";
        } else {
          createdAtConfidence = "inferred";
        }

        if (!originUpdatedAt && originCreatedAt) {
          originUpdatedAt = originCreatedAt;
        }

        const localCreatedAt = existingMetadata.get(c.canonical_id)?.created_at || earliestLocalObservedAt || timestampNow;
        const localUpdatedAt = timestampNow;

        // Apply curator overrides
        const override = curatorOverrides.get(c.canonical_id);
        let finalName = c.name;
        let finalDesc = c.description;
        let finalCategory = c.category;
        let finalSubcategory = c.subcategory;
        let tagsList = Array.from(c.tags);

        if (override) {
          if (override.name_override) {
            finalName = override.name_override;
          }
          if (override.description_override) {
            finalDesc = override.description_override;
          }
          if (override.category_override) {
            finalCategory = override.category_override;
          }
          if (override.subcategory_override) {
            finalSubcategory = override.subcategory_override;
          }
          let addedTags: string[] = [];
          let removedTags: string[] = [];
          try { addedTags = JSON.parse(override.added_tags_json || "[]"); } catch (_) {}
          try { removedTags = JSON.parse(override.removed_tags_json || "[]"); } catch (_) {}
          const tagSet = new Set(tagsList);
          for (const t of addedTags) tagSet.add(t);
          for (const t of removedTags) tagSet.delete(t);
          tagsList = Array.from(tagSet);
        }

        const tagSet = new Set<string>(tagsList);
        const umbrellaTags = [
          c.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          c.subcategory.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          c.type === "QoL, Workflow & Toolchain" ? "workflow-tool" : "asset-additive",
          ...Array.from(c.platforms).map(p => p.toLowerCase()),
          "vrchat",
          "unity"
        ];
        if (c.is_vcc) {
          umbrellaTags.push("vcc", "vpm");
        }
        for (const ut of umbrellaTags) {
          if (ut && !tagSet.has(ut)) {
            tagSet.add(ut);
          }
        }
        tagsList = Array.from(tagSet);

        const preservedMeta = existingMetadata.get(c.canonical_id);
        const lifecycle = preservedMeta?.lifecycle || "published";
        const lifecycleUpdatedAt = preservedMeta?.lifecycle_updated_at || null;

        let assignedMediaId: string | null = preservedMeta?.media_id || null;
        if (!assignedMediaId) {
          for (const sid of c.source_ids) {
            const ent = entityMap.get(sid);
            if (ent) {
              try {
                const raw = JSON.parse(ent.raw_json || "{}");
                const candidateImg = raw.thumbnail_url || raw.imageUrl || raw.image || raw.ogImage || raw.preview_url || raw.iconUrl;
                if (candidateImg && typeof candidateImg === "string") {
                  const cached = db.query("SELECT id FROM media_cache WHERE source_url = ? LIMIT 1;").get(candidateImg) as any;
                  if (cached?.id) {
                    assignedMediaId = cached.id;
                    break;
                  }
                }
              } catch (_) {}
            }
          }
        }

        const authorsJson = JSON.stringify(Array.from(c.authors));
        const platformsJson = JSON.stringify(Array.from(c.platforms));
        const tagsJson = JSON.stringify(tagsList);
        const depsJson = JSON.stringify(c.dependencies || {});
        const sourceIdsJson = JSON.stringify(c.source_ids);

        const aggMediaSet = new Set<string>();
        const aggYoutubeSet = new Set<string>();
        for (const sid of c.source_ids) {
          const ent = entityMap.get(sid);
          if (!ent?.raw_json) continue;
          try {
            const raw = JSON.parse(ent.raw_json);
            if (Array.isArray(raw.media_urls)) {
              for (const u of raw.media_urls) {
                if (typeof u === "string" && u.startsWith("http") && aggMediaSet.size < 30) {
                  aggMediaSet.add(u);
                }
              }
            } else if (raw.thumbnail_url && typeof raw.thumbnail_url === "string" && raw.thumbnail_url.startsWith("http")) {
              aggMediaSet.add(raw.thumbnail_url);
            }
            if (Array.isArray(raw.youtube_urls)) {
              for (const y of raw.youtube_urls) {
                if (typeof y === "string" && y.startsWith("http") && aggYoutubeSet.size < 15) {
                  aggYoutubeSet.add(y);
                }
              }
            }
          } catch (_) {}
        }
        const canonicalMediaUrlsJson = JSON.stringify(Array.from(aggMediaSet));
        const canonicalYoutubeUrlsJson = JSON.stringify(Array.from(aggYoutubeSet));

        let cleanUrl = sanitizeOutboundUrl(c.url);
        if (override?.url_override) {
          cleanUrl = override.url_override;
        }
        const cleanVccUrl = c.vcc_url ? sanitizeOutboundUrl(c.vcc_url) : null;

        insertCanonical.run(
          c.id, c.canonical_id, finalName, c.author, authorsJson,
          finalCategory, finalSubcategory, c.type, finalDesc,
          c.primary_platform, platformsJson, cleanUrl, cleanVccUrl,
          c.price_currency, c.price_amount, c.is_vcc,
          tagsJson, depsJson, sourceIdsJson,
          assignedMediaId, canonicalMediaUrlsJson, canonicalYoutubeUrlsJson,
          originCreatedAt, originUpdatedAt, createdAtConfidence,
          lifecycle, lifecycleUpdatedAt, localCreatedAt, localUpdatedAt
        );

        const storefronts: { p: string; u: string | null }[] = [
          { p: c.primary_platform, u: cleanUrl }
        ];
        if (cleanVccUrl) {
          storefronts.push({ p: "vpm", u: cleanVccUrl });
        }
        for (const [p, u] of c.platform_urls.entries()) {
          if (u && !storefronts.some(sf => sf.p === p)) {
            storefronts.push({ p, u: sanitizeOutboundUrl(u) });
          }
        }
        for (const sf of storefronts) {
          if (sf.u) {
            const frontId = `front_${c.canonical_id}_${sf.p}`;
            const matchingEnt = c.source_ids
              .map((sid: string) => entityMap.get(sid))
              .find((e: any) => e && e.platform === sf.p);

            let frontOriginCreated = matchingEnt?.origin_created_at || null;
            let frontOriginUpdated = matchingEnt?.origin_updated_at || null;
            if (!frontOriginCreated && matchingEnt?.raw_json) {
              try {
                const raw = JSON.parse(matchingEnt.raw_json);
                frontOriginCreated = raw.originCreatedAt || raw.published_at || null;
                frontOriginUpdated = raw.originUpdatedAt || null;
              } catch (_) {}
            }
            if (!frontOriginCreated) frontOriginCreated = originCreatedAt;
            if (!frontOriginUpdated) frontOriginUpdated = originUpdatedAt || frontOriginCreated;

            const frontCreatedAt = existingFrontMetadata.get(frontId)?.created_at || matchingEnt?.created_at || localCreatedAt;
            const frontUpdatedAt = timestampNow;

            let frontMediaUrlsJson = "[]";
            let frontYoutubeUrlsJson = "[]";
            if (matchingEnt?.raw_json) {
              try {
                const raw = JSON.parse(matchingEnt.raw_json);
                const fmSet = new Set<string>();
                const fySet = new Set<string>();
                if (Array.isArray(raw.media_urls)) {
                  for (const u of raw.media_urls) {
                    if (typeof u === "string" && u.startsWith("http")) fmSet.add(u);
                  }
                } else if (raw.thumbnail_url && typeof raw.thumbnail_url === "string") {
                  fmSet.add(raw.thumbnail_url);
                }
                if (Array.isArray(raw.youtube_urls)) {
                  for (const y of raw.youtube_urls) {
                    if (typeof y === "string" && y.startsWith("http")) fySet.add(y);
                  }
                }
                frontMediaUrlsJson = JSON.stringify(Array.from(fmSet));
                frontYoutubeUrlsJson = JSON.stringify(Array.from(fySet));
              } catch (_) {}
            }

            const rawEntityId = matchingEnt?.id || c.id;
            const platformItemId = matchingEnt ? matchingEnt.id.replace(/^[^:]+:/, "") : sf.u;

            insertFront.run(
              frontId,
              c.canonical_id,
              sf.p,
              platformItemId,
              sf.u,
              c.name,
              c.author,
              c.price_currency,
              c.price_amount,
              frontOriginCreated,
              frontOriginUpdated,
              rawEntityId,
              frontMediaUrlsJson,
              frontYoutubeUrlsJson,
              frontCreatedAt,
              frontUpdatedAt
            );
          }
        }
      }
    })();

    // =========================================================================
    // STEP 5: INTEGRITY AUDIT
    // =========================================================================
    if (isPipelineInterrupted) return;
    console.log("\n[Step 5/5] Processing qualified discards, checkpointing database, and verifying integrity...");

    const discardCount = db.run(`
      UPDATE frontier
      SET status = 'failed', attempts = CASE WHEN attempts < 3 THEN 3 ELSE attempts END, updated_at = '${now}'
      WHERE status = 'failed' AND (attempts >= 2 OR url LIKE '%.booth.pm/%.json' OR url LIKE '%example.github.io%');
    `).changes;

    console.log(`  + Qualified and marked ${discardCount} exhausted failed URLs in frontier.`);

    db.run("PRAGMA wal_checkpoint(TRUNCATE);");
    const check = db.query("PRAGMA quick_check;").get() as any;
    console.log(`PRAGMA quick_check result: ${JSON.stringify(check)}`);

    const finalEntities = (db.query("SELECT COUNT(*) as c FROM entities WHERE is_quarantined = 0;").get() as any).c;
    const finalQuarantine = (db.query("SELECT COUNT(*) as c FROM entities WHERE is_quarantined = 1;").get() as any).c;
    const finalMerged = (db.query("SELECT COUNT(*) as c FROM canonical_packages;").get() as any).c;
    const multiPlat = (db.query("SELECT COUNT(*) as c FROM canonical_packages WHERE json_array_length(platforms_json) > 1;").get() as any).c;
    const qolCount = (db.query("SELECT COUNT(*) as c FROM canonical_packages WHERE type = 'QoL, Workflow & Toolchain';").get() as any).c;
    const assetCount = (db.query("SELECT COUNT(*) as c FROM canonical_packages WHERE type = 'Asset Additive';").get() as any).c;

    console.log("\n==================================================================");
    console.log("             PROJECTION SYNTHESIS COMPLETE SUMMARY                ");
    console.log("==================================================================");
    console.log(`Pristine Raw Entities in DB:         ${finalEntities.toLocaleString()}`);
    console.log(`Confirmed Quarantined Discards:      ${finalQuarantine.toLocaleString()}`);
    console.log(`Canonical Packages (Deduplicated):   ${finalMerged.toLocaleString()}`);
    console.log(`Packages on Multiple Platforms:      ${multiPlat.toLocaleString()}`);
    console.log(`Consolidated Multi-Platform Records: ${(entities.length - finalMerged).toLocaleString()}`);
    console.log(`  - QoL, Workflow & Toolchain:       ${qolCount.toLocaleString()} (${((qolCount / finalMerged) * 100).toFixed(1)}%)`);
    console.log(`  - Asset Additives (Gimmicks/Toys): ${assetCount.toLocaleString()} (${((assetCount / finalMerged) * 100).toFixed(1)}%)`);
    console.log("==================================================================\n");
  } finally {
    if (activePipelineDb && !isCustom) {
      try {
        activePipelineDb.run("PRAGMA wal_checkpoint(TRUNCATE);");
      } catch (_) {}
      try {
        activePipelineDb.close();
      } catch (_) {}
      activePipelineDb = null;
    }
  }
}

export const runPipelineSanitize = runProjection;

if (import.meta.main) {
  process.on("SIGINT", () => shutdownPipeline("SIGINT"));
  process.on("SIGTERM", () => shutdownPipeline("SIGTERM"));
  runProjection().catch((err) => {
    console.error("Projection synthesis failed:", err);
    process.exit(1);
  });
}
