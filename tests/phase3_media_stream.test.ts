import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { CrawlerDB } from "../src/db.ts";
import { startServer } from "../src/server/index.ts";
import dns from "node:dns/promises";
import path from "path";
import fs from "fs";

describe("Phase 3 - Task 3.2: Pure Media Pointer Migration & In-Memory Streaming Proxy", () => {
  const fixturePath = path.resolve(__dirname, `../dist/test_media_stream_${Date.now()}.db`);
  let testDb: CrawlerDB;
  let serverInstance: any;
  let baseUrl: string;
  const originalFetch = globalThis.fetch;
  const originalLookup = dns.lookup;

  // 1x1 transparent PNG buffer for mock image payloads
  const MOCK_PNG_BUFFER = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  beforeAll(async () => {
    testDb = new CrawlerDB(fixturePath);

    // Seed media_cache without any BLOBs (pure origin pointer)
    testDb.rawDb.run(`
      INSERT INTO media_cache (
        id, source_url, blurhash, phash_64, width, height, content_type, etag, last_processed_at
      ) VALUES (
        'media_test_123',
        'https://assets.jinxxy.com/products/tool-preview.png',
        'L6PZfSi_.AyE_3t7t7R**0o#DgR4',
        'a1b2c3d4e5f60718',
        800, 600, 'image/png', '"etag123"', datetime('now')
      );
    `);

    // Seed canonical package referencing this media
    testDb.rawDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, category, subcategory, type,
        description, primary_platform, platforms_json, url, vcc_url,
        price_currency, price_amount, is_vcc, tags_json, dependencies_json,
        source_ids_json, media_id, origin_created_at, origin_updated_at, created_at_confidence,
        lifecycle, lifecycle_updated_at, created_at, updated_at
      ) VALUES (
        'pkg-media-1', 'media-tool', 'Media Tool', 'MediaAuthor', 'tool', 'general', 'tool',
        'A test tool with media', 'jinxxy', '["jinxxy"]', 'https://jinxxy.com/market/media-tool', NULL,
        'USD', 10, 0, '["test"]', '{}',
        '["jinxxy:media-tool"]', 'media_test_123', NULL, NULL, 'unknown',
        'published', NULL, datetime('now'), datetime('now')
      );
    `);

    const port = 19200 + Math.floor(Math.random() * 700);
    serverInstance = startServer({
      port,
      host: "127.0.0.1",
      db: testDb
    });
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    dns.lookup = originalLookup;
    try { serverInstance?.stop(); } catch (_) {}
    try { testDb?.close(); } catch (_) {}
    if (fs.existsSync(fixturePath)) {
      try { fs.unlinkSync(fixturePath); } catch (_) {}
    }
  });

  it("verifies media_cache schema has zero webp_data BLOB column", () => {
    const columns = testDb.rawDb.prepare("PRAGMA table_info(media_cache);").all() as any[];
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain("source_url");
    expect(colNames).toContain("blurhash");
    expect(colNames).toContain("phash_64");
    expect(colNames).not.toContain("webp_data");
  });

  it("rejects GET /v1/media/stream with missing or invalid url parameters", async () => {
    // Missing url parameter
    let resp = await fetch(`${baseUrl}/v1/media/stream`);
    expect(resp.status).toBe(400);
    let json = await resp.json() as any;
    expect(json.error).toContain("Missing required 'url' query parameter");

    // Invalid scheme (http instead of https)
    resp = await fetch(`${baseUrl}/v1/media/stream?url=${encodeURIComponent("http://assets.jinxxy.com/pic.png")}`);
    expect(resp.status).toBe(400);
    json = await resp.json() as any;
    expect(json.error).toContain("Scheme must be https");
  });

  it("rejects GET /v1/media/stream with non-whitelisted CDN host with 403 Forbidden", async () => {
    const evilUrl = "https://malicious-external-site.com/image.png";
    const resp = await fetch(`${baseUrl}/v1/media/stream?url=${encodeURIComponent(evilUrl)}`);
    expect(resp.status).toBe(403);
    const json = await resp.json() as any;
    expect(json.error).toContain("Origin host not in media CDN whitelist");
  });

  it("blocks SSRF attempts in GET /v1/media/stream resolving to private/reserved IP", async () => {
    // Mock DNS lookup resolving to loopback
    (dns as any).lookup = async (hostname: string) => {
      return { address: "127.0.0.1", family: 4 };
    };

    const targetUrl = "https://raw.githubusercontent.com/internal/resource.png";
    const resp = await fetch(`${baseUrl}/v1/media/stream?url=${encodeURIComponent(targetUrl)}`);
    expect(resp.status).toBe(400);
    const json = await resp.json() as any;
    expect(json.error).toContain("SSRF blocked");
  });

  it("handles upstream 404 and 502 gracefully without leaking internal traces", async () => {
    (dns as any).lookup = async (hostname: string) => {
      return { address: "185.199.108.133", family: 4 }; // Valid GitHub CDN IP
    };

    // Mock upstream 404
    globalThis.fetch = (async (url: any, opts: any) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.startsWith(baseUrl)) return originalFetch(url, opts);
      return new Response("Not Found", { status: 404 });
    }) as any;

    const notFoundUrl = "https://raw.githubusercontent.com/test/repo/missing.png";
    let resp = await fetch(`${baseUrl}/v1/media/stream?url=${encodeURIComponent(notFoundUrl)}`);
    expect(resp.status).toBe(404);
    let json = await resp.json() as any;
    expect(json.error).toContain("Media not found on origin CDN");

    // Mock upstream 500
    globalThis.fetch = (async (url: any, opts: any) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.startsWith(baseUrl)) return originalFetch(url, opts);
      return new Response("Internal Server Error", { status: 500 });
    }) as any;

    resp = await fetch(`${baseUrl}/v1/media/stream?url=${encodeURIComponent(notFoundUrl)}`);
    expect(resp.status).toBe(502);
    json = await resp.json() as any;
    expect(json.error).toContain("Bad Gateway");
  });

  it("streams whitelisted origin media in-memory with private client cache and security headers", async () => {
    (dns as any).lookup = async (hostname: string) => {
      return { address: "185.199.108.133", family: 4 };
    };

    // Mock successful origin CDN fetch
    globalThis.fetch = (async (url: any, opts: any) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.startsWith(baseUrl)) return originalFetch(url, opts);
      return new Response(MOCK_PNG_BUFFER, {
        status: 200,
        headers: { "Content-Type": "image/png" }
      });
    }) as any;

    const cdnUrl = "https://raw.githubusercontent.com/test/repo/valid-avatar.png";
    const resp = await fetch(`${baseUrl}/v1/media/stream?url=${encodeURIComponent(cdnUrl)}`);

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Cache-Control")).toBe("private, max-age=86400, stale-while-revalidate=3600");
    expect(resp.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(resp.headers.get("VRC-Packages-Terms-Of-Use")).toBe("https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md");

    const imgBytes = await resp.arrayBuffer();
    expect(imgBytes.byteLength).toBeGreaterThan(0);
  });

  it("serves direct origin CDN URLs by default in GET /v1/catalog/delta feed", async () => {
    const resp = await fetch(`${baseUrl}/v1/catalog/delta`);
    expect(resp.status).toBe(200);
    const json = await resp.json() as any;

    expect(json.deltas.length).toBeGreaterThanOrEqual(1);
    const item = json.deltas.find((d: any) => d.canonicalId === "media-tool");
    expect(item).toBeDefined();
    expect(item.package.media).toBeDefined();

    // Invariant: thumbnailUrl defaults to origin source_url, sourceUrl is populated
    expect(item.package.media.thumbnailUrl).toBe("https://assets.jinxxy.com/products/tool-preview.png");
    expect(item.package.media.sourceUrl).toBe("https://assets.jinxxy.com/products/tool-preview.png");
    expect(item.package.media.blurhash).toBe("L6PZfSi_.AyE_3t7t7R**0o#DgR4");
  });
});
