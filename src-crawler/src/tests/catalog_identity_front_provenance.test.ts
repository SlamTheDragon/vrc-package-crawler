import { afterAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { CrawlerDB } from "../db.ts";
import { runProjection } from "../crawler/projection.ts";
import { exportCatalog } from "../sync/exporter.ts";

describe("catalog front provenance", () => {
  const suffix = `${process.pid}_${Date.now()}`;
  const fixturePath = path.resolve(__dirname, `../dist/test_front_provenance_${suffix}.db`);
  const exportPath = path.resolve(__dirname, `../dist/test_front_provenance_export_${suffix}.db`);
  const fixture = new CrawlerDB(fixturePath);

  afterAll(() => {
    fixture.close();
    for (const file of [fixturePath, `${fixturePath}-wal`, `${fixturePath}-shm`, exportPath]) {
      // Bun/SQLite can retain a Windows handle until the test process exits.
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
    }
  });

  it("retains each observed storefront's price through merge, reprojection, and export", async () => {
    const now = new Date().toISOString();
    const insert = fixture.rawDb.prepare(`
      INSERT INTO entities (
        id, platform, url, title, author, price_currency, price_amount,
        description, tags_json, external_links_json, raw_json,
        is_quarantined, observed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '{}', 0, ?, ?, ?)
    `);
    insert.run("booth:12345", "booth", "https://example.booth.pm/items/12345",
      "VRChat Avatar Tool", "Ada", "JPY", 1800,
      "VRChat avatar tool with configurable animation controls and editor workflow.", '["vpm-package"]', now, now, now);
    insert.run("gumroad:avatar-tool", "gumroad", "https://ada.gumroad.com/l/avatar-tool",
      "VRChat Avatar Tool", "Ada", "USD", 18,
      "VRChat avatar tool with configurable animation controls and editor workflow.", '["vpm-package"]', now, now, now);

    const fronts = () => fixture.rawDb.query(`
      SELECT platform, raw_entity_id, price_currency, price_amount, canonical_id
      FROM package_fronts WHERE raw_entity_id IN ('booth:12345', 'gumroad:avatar-tool')
      ORDER BY platform
    `).all() as Array<{platform: string; raw_entity_id: string; price_currency: string; price_amount: number; canonical_id: string}>;

    await runProjection({ targetDb: fixture.rawDb });
    expect(fronts().map(f => [f.platform, f.raw_entity_id, f.price_currency, f.price_amount])).toEqual([
      ["booth", "booth:12345", "JPY", 1800],
      ["gumroad", "gumroad:avatar-tool", "USD", 18]
    ]);
    expect(new Set(fronts().map(f => f.canonical_id)).size).toBe(1);

    // Reprojection must also repair rows produced by older aggregate-copy logic.
    fixture.rawDb.run("UPDATE package_fronts SET price_currency = 'USD', price_amount = 18 WHERE raw_entity_id = 'booth:12345'");
    await runProjection({ targetDb: fixture.rawDb });
    expect(fronts()[0]?.price_currency).toBe("JPY");
    expect(fronts()[0]?.price_amount).toBe(1800);

    await exportCatalog(exportPath, fixture.rawDb);
    const exported = new Database(exportPath);
    try {
      const rows = exported.query(`
        SELECT platform, raw_entity_id, price_currency, price_amount
        FROM package_fronts ORDER BY platform
      `).all() as Array<{platform: string; raw_entity_id: string; price_currency: string; price_amount: number}>;
      expect(rows.map(f => [f.platform, f.raw_entity_id, f.price_currency, f.price_amount])).toEqual([
        ["booth", "booth:12345", "JPY", 1800],
        ["gumroad", "gumroad:avatar-tool", "USD", 18]
      ]);
    } finally {
      exported.close();
    }
  });
});
