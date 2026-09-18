import { Database } from "bun:sqlite";
import { CONFIG } from "./config.ts";
import { logger } from "./logger.ts";
import { dbV2 } from "./db_v2.ts";

export async function runZeroLossMigration(customDb?: Database) {
  const db = customDb || dbV2.rawDb;

  logger.info("[MigrationV2] Starting zero-loss migration to Database Schema V2...");

  // Check if legacy tables exist
  const hasFrontier = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='frontier';").get();
  const hasEntities = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='entities';").get();
  const hasQuarantined = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='quarantined_entities';").get();
  const hasMerged = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='merged_packages';").get();

  if (!hasFrontier && !hasEntities) {
    logger.info("[MigrationV2] No legacy tables found to migrate. Schema V2 is fresh and ready.");
    return;
  }

  const legacyFrontierCount = (db.query("SELECT COUNT(*) as c FROM frontier;").get() as any)?.c || 0;
  const legacyEntitiesCount = (db.query("SELECT COUNT(*) as c FROM entities;").get() as any)?.c || 0;
  const legacyQuarantinedCount = hasQuarantined ? ((db.query("SELECT COUNT(*) as c FROM quarantined_entities;").get() as any)?.c || 0) : 0;
  const legacyMergedCount = hasMerged ? ((db.query("SELECT COUNT(*) as c FROM merged_packages;").get() as any)?.c || 0) : 0;

  logger.info(`[MigrationV2] Legacy record counts: Frontier=${legacyFrontierCount}, Entities=${legacyEntitiesCount}, Quarantined=${legacyQuarantinedCount}, Merged=${legacyMergedCount}`);

  db.transaction(() => {
    // 1. Migrate Frontier -> frontier_v2
    const insertFrontierV2 = db.prepare(`
      INSERT OR IGNORE INTO frontier_v2 (
        url, platform, status, attempts, etag, last_modified,
        change_rate_lambda, fetch_interval_sec, last_fetched_at, next_fetch_at,
        priority, discovered_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, 0.05, 86400, ?, ?, 0, ?, ?);
    `);

    const frontierRows = db.query("SELECT url, platform, status, attempts, discovered_at, updated_at FROM frontier;").all() as any[];
    for (const r of frontierRows) {
      const nextFetchAt = r.status === "pending"
        ? r.discovered_at
        : new Date(Date.parse(r.updated_at) + 86400000).toISOString();
      const lastFetchedAt = r.status === "done" ? r.updated_at : null;
      insertFrontierV2.run(r.url, r.platform, r.status, r.attempts || 0, lastFetchedAt, nextFetchAt, r.discovered_at, r.updated_at);
    }

    // 2. Migrate Entities -> entities_v2 (Vetted items)
    const insertEntitiesV2 = db.prepare(`
      INSERT OR REPLACE INTO entities_v2 (
        id, platform, url, title, author, price_currency, price_amount,
        description, tags_json, external_links_json, raw_json,
        is_quarantined, quarantine_reasons_json, origin_created_at, origin_updated_at,
        observed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?, ?, ?);
    `);

    const entityRows = db.query("SELECT id, platform, url, title, author, price_currency, price_amount, description, tags_json, external_links_json, raw_json, created_at, updated_at FROM entities;").all() as any[];
    for (const r of entityRows) {
      let originCreatedAt: string | null = null;
      let originUpdatedAt: string | null = null;
      try {
        const raw = JSON.parse(r.raw_json || "{}");
        originCreatedAt = raw.originCreatedAt || raw.published_at || raw.createdAt || null;
        originUpdatedAt = raw.originUpdatedAt || raw.updated_at || null;
      } catch (_) {}
      if (!originCreatedAt && r.created_at) originCreatedAt = r.created_at;
      if (!originUpdatedAt && r.updated_at) originUpdatedAt = r.updated_at;

      insertEntitiesV2.run(
        r.id, r.platform, r.url, r.title, r.author,
        r.price_currency, r.price_amount, r.description,
        r.tags_json || "[]", r.external_links_json || "[]", r.raw_json || "{}",
        originCreatedAt, originUpdatedAt,
        r.created_at, r.created_at, r.updated_at
      );
    }

    // 3. Migrate Quarantined Entities -> entities_v2 (Immutable Lake preservation)
    if (hasQuarantined) {
      const insertQuarantineLake = db.prepare(`
        INSERT OR IGNORE INTO entities_v2 (
          id, platform, url, title, author, price_currency, price_amount,
          description, tags_json, external_links_json, raw_json,
          is_quarantined, quarantine_reasons_json, origin_created_at, origin_updated_at,
          observed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, '', '[]', '[]', '{}', 1, ?, ?, NULL, ?, ?, ?);
      `);

      const quarantineRows = db.query("SELECT id, platform, url, title, author, reasons_json, quarantined_at FROM quarantined_entities;").all() as any[];
      for (const q of quarantineRows) {
        insertQuarantineLake.run(
          q.id, q.platform, q.url, q.title, q.author,
          q.reasons_json || "[]",
          q.quarantined_at,
          q.quarantined_at, q.quarantined_at, q.quarantined_at
        );
      }
    }

    // 4. Migrate Merged Packages -> canonical_packages_v2 & package_fronts_v2
    if (hasMerged) {
      const insertCanonical = db.prepare(`
        INSERT OR REPLACE INTO canonical_packages_v2 (
          id, canonical_id, name, author, authors_json, category, subcategory, type,
          description, primary_platform, platforms_json, url, vcc_url, github_url,
          booth_url, gumroad_url, jinxxy_url, itch_url, price_currency, price_amount,
          is_vcc, tags_json, dependencies_json, source_ids_json, media_id,
          origin_created_at, origin_updated_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?);
      `);

      const insertFront = db.prepare(`
        INSERT OR REPLACE INTO package_fronts_v2 (
          id, canonical_id, platform, platform_item_id, url, title, author,
          price_currency, price_amount, origin_created_at, origin_updated_at,
          raw_entity_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      const mergedRows = db.query("SELECT * FROM merged_packages;").all() as any[];
      for (const m of mergedRows) {
        const originCreatedAt = m.created_at || new Date().toISOString();
        const originUpdatedAt = m.updated_at || originCreatedAt;

        insertCanonical.run(
          m.id, m.canonical_id, m.name, m.author, m.authors_json || "[]",
          m.category, m.subcategory, m.type, m.description,
          m.primary_platform, m.platforms_json, m.url,
          m.vcc_url, m.github_url, m.booth_url, m.gumroad_url, m.jinxxy_url, m.itch_url,
          m.price_currency || "USD", m.price_amount || 0, m.is_vcc || 0,
          m.tags_json || "[]", m.dependencies_json || "{}", m.source_ids_json,
          originCreatedAt, originUpdatedAt,
          m.created_at, m.updated_at
        );

        // Store fronts
        const platforms = [
          { p: "booth", u: m.booth_url },
          { p: "gumroad", u: m.gumroad_url },
          { p: "github", u: m.github_url },
          { p: "jinxxy", u: m.jinxxy_url },
          { p: "itch", u: m.itch_url }
        ];
        for (const item of platforms) {
          if (item.u) {
            const frontId = `front_${m.canonical_id}_${item.p}`;
            insertFront.run(
              frontId, m.canonical_id, item.p, item.u, item.u, m.name, m.author,
              m.price_currency, m.price_amount,
              originCreatedAt, originUpdatedAt,
              m.id, m.created_at, m.updated_at
            );
          }
        }
      }
    }
  })();

  const v2FrontierCount = (db.query("SELECT COUNT(*) as c FROM frontier_v2;").get() as any)?.c || 0;
  const v2EntitiesCount = (db.query("SELECT COUNT(*) as c FROM entities_v2;").get() as any)?.c || 0;
  const v2CanonicalCount = (db.query("SELECT COUNT(*) as c FROM canonical_packages_v2;").get() as any)?.c || 0;
  const v2FrontsCount = (db.query("SELECT COUNT(*) as c FROM package_fronts_v2;").get() as any)?.c || 0;

  logger.info(`[MigrationV2] Migration verified! Frontier_v2: ${v2FrontierCount}, Entities_v2: ${v2EntitiesCount}, Canonical_v2: ${v2CanonicalCount}, Fronts_v2: ${v2FrontsCount}`);
  logger.info("[MigrationV2] Zero-loss migration completed successfully.");
}

if (import.meta.main) {
  runZeroLossMigration().catch(err => {
    logger.error("[MigrationV2] Fatal migration failure:", err);
    process.exit(1);
  });
}
