import { describe, it, expect } from "bun:test";
import { computeBlurHash, computePHash64, sanitizeOutboundUrl, ImageProxyService } from "../src/utils/image_proxy.ts";

describe("Proxied Media Pipeline & Invariants", () => {
  it("computes a valid BlurHash string from RGB buffer", () => {
    // 32x32 image with 3 RGB bytes per pixel = 3072 bytes
    const dummyRgb = new Uint8Array(32 * 32 * 3);
    for (let i = 0; i < dummyRgb.length; i += 3) {
      dummyRgb[i] = 120;     // R
      dummyRgb[i + 1] = 180; // G
      dummyRgb[i + 2] = 240; // B
    }

    const hash = computeBlurHash(dummyRgb, 32, 32, 4, 3);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(10);
  });

  it("computes a 16-character 64-bit pHash from grayscale buffer", () => {
    const dummyGray = new Uint8Array(32 * 32);
    for (let i = 0; i < dummyGray.length; i++) {
      dummyGray[i] = (i % 256);
    }

    const phash = computePHash64(dummyGray);
    expect(phash).toBeDefined();
    expect(phash.length).toBe(16);
    expect(/^[0-9a-f]{16}$/.test(phash)).toBe(true);
  });

  it("strips unauthorized affiliate and tracking parameters for canonical routing", () => {
    const dirtyUrl = "https://booth.pm/ja/items/123456?aff=scam_tracker&utm_source=twitter&utm_medium=social&ref=shady_site";
    const cleanUrl = sanitizeOutboundUrl(dirtyUrl);
    expect(cleanUrl).toBe("https://booth.pm/ja/items/123456");
  });

  it("leaves clean URLs unaltered", () => {
    const cleanUrl = "https://github.com/bdunderscore/modular-avatar";
    expect(sanitizeOutboundUrl(cleanUrl)).toBe(cleanUrl);
  });

  it("handles batch indexPendingMedia for canonical packages without images", async () => {
    const { CrawlerDB } = await import("../src/db.ts");
    const testDb = new CrawlerDB(":memory:");
    const testCanonicalId = `can_media_batch_${Date.now()}`;
    const testEntId = `ent_media_batch_${Date.now()}`;

    // 1. Insert constituent entity with thumbnail in raw_json
    testDb.rawDb.run(`
      INSERT INTO entities (
        id, platform, url, title, author, description, tags_json, external_links_json,
        raw_json, is_quarantined, observed_at, created_at, updated_at
      ) VALUES (
        ?, 'booth', 'https://booth.pm/items/998877', 'Image Test Asset', 'ImageCreator', 'Desc', '[]', '[]',
        ?, 0, datetime('now'), datetime('now'), datetime('now')
      );
    `, [testEntId, JSON.stringify({ thumbnail_url: "https://example.com/test-thumbnail.png" })]);

    // 2. Insert canonical package without media_id
    testDb.rawDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, price_currency, price_amount,
        is_vcc, tags_json, dependencies_json, source_ids_json, media_id, created_at, updated_at
      ) VALUES (
        ?, ?, 'Image Test Package', 'ImageCreator', '[]', 'Tools', 'Utilities',
        'QoL, Workflow & Toolchain', 'Desc', 'booth', '["booth"]', 'https://booth.pm/items/998877',
        'JPY', 0, 0, '[]', '{}', ?, NULL, datetime('now'), datetime('now')
      );
    `, [testCanonicalId, testCanonicalId, JSON.stringify([testEntId])]);

    // 3. Mock fetch for image download
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("test-thumbnail.png")) {
        // Return dummy image bytes
        return new Response(new Uint8Array(100), {
          status: 200,
          headers: { "Content-Type": "image/png" }
        });
      }
      return origFetch(input, init);
    }) as any;

    try {
      const indexed = await ImageProxyService.indexPendingMedia(10, testDb);
      expect(indexed).toBe(1);

      // Verify canonical package received media_id
      const updatedPkg = testDb.rawDb.prepare("SELECT media_id FROM canonical_packages WHERE canonical_id = ?;").get(testCanonicalId) as any;
      expect(updatedPkg).toBeDefined();
      expect(updatedPkg.media_id).toBeTruthy();

      // Verify media_cache has the record
      const mediaRecord = testDb.rawDb.prepare("SELECT * FROM media_cache WHERE id = ?;").get(updatedPkg.media_id) as any;
      expect(mediaRecord).toBeDefined();
      expect(mediaRecord.source_url).toBe("https://example.com/test-thumbnail.png");
    } finally {
      globalThis.fetch = origFetch;
      testDb.close();
    }
  });
});
