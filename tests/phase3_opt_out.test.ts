import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { CrawlerDB } from "../src/db.ts";
import { startServer } from "../src/server/index.ts";
import crypto from "crypto";
import dns from "node:dns/promises";
import path from "path";
import fs from "fs";

describe("Phase 3 - Task 3.1: Automated Non-Scraping Opt-Out Endpoint (POST /v1/opt-out)", () => {
  const fixturePath = path.resolve(__dirname, `../dist/test_opt_out_${Date.now()}.db`);
  let testDb: CrawlerDB;
  let serverInstance: any;
  let baseUrl: string;
  const originalFetch = globalThis.fetch;
  const originalResolveTxt = dns.resolveTxt;
  const originalLookup = dns.lookup;

  beforeAll(async () => {
    testDb = new CrawlerDB(fixturePath);

    // Seed canonical packages for creators
    testDb.rawDb.run(`
      INSERT INTO canonical_packages (
        id, canonical_id, name, author, category, subcategory, type,
        description, primary_platform, platforms_json, url, vcc_url,
        price_currency, price_amount, is_vcc, tags_json, dependencies_json,
        source_ids_json, origin_created_at, origin_updated_at, created_at_confidence,
        lifecycle, lifecycle_updated_at, created_at, updated_at
      ) VALUES 
      (
        'pkg-bio-1', 'bio-tool', 'Bio Tool', 'BoothCreator', 'tool', 'general', 'tool',
        'A test tool by BoothCreator', 'booth', '["booth"]', 'https://booth.pm/ja/items/999001', NULL,
        'JPY', 1000, 0, '["test"]', '{}',
        '["booth:999001"]', NULL, NULL, 'unknown',
        'published', NULL, datetime('now'), datetime('now')
      ),
      (
        'pkg-dns-1', 'dns-tool', 'DNS Tool', 'DnsCreator', 'tool', 'general', 'tool',
        'A test tool by DnsCreator', 'booth', '["booth"]', 'https://booth.pm/ja/items/999002', NULL,
        'JPY', 2000, 0, '["test"]', '{}',
        '["booth:999002"]', NULL, NULL, 'unknown',
        'published', NULL, datetime('now'), datetime('now')
      ),
      (
        'pkg-sig-1', 'sig-tool', 'Sig Tool', 'GitCreator', 'tool', 'general', 'tool',
        'A test tool by GitCreator', 'github', '["github"]', 'https://github.com/GitCreator/repo', NULL,
        'USD', 0, 0, '["test"]', '{}',
        '["github:GitCreator/repo"]', NULL, NULL, 'unknown',
        'published', NULL, datetime('now'), datetime('now')
      );
    `);

    const port = 19100 + Math.floor(Math.random() * 800);
    serverInstance = startServer({
      port,
      host: "127.0.0.1",
      db: testDb
    });
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    dns.resolveTxt = originalResolveTxt;
    dns.lookup = originalLookup;
    try { serverInstance?.stop(); } catch (_) {}
    try { testDb?.close(); } catch (_) {}
    if (fs.existsSync(fixturePath)) {
      try { fs.unlinkSync(fixturePath); } catch (_) {}
    }
  });

  it("rejects invalid request payloads with 400 Bad Request", async () => {
    const headers = { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.1" };
    // Missing vendorId
    let resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers,
      body: JSON.stringify({ proofType: "dns_txt", proofValue: "example.com" })
    });
    expect(resp.status).toBe(400);
    let json = await resp.json() as any;
    expect(json.error).toContain("vendorId");

    // Invalid proofType
    resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers,
      body: JSON.stringify({ vendorId: "creator1", proofType: "invalid_type", proofValue: "foo" })
    });
    expect(resp.status).toBe(400);
    json = await resp.json() as any;
    expect(json.error).toContain("proofType");

    // Missing proofValue
    resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers,
      body: JSON.stringify({ vendorId: "creator1", proofType: "dns_txt" })
    });
    expect(resp.status).toBe(400);
    json = await resp.json() as any;
    expect(json.error).toContain("proofValue");
  });

  it("rejects storefront_bio_token with non-whitelisted domain or SSRF attempt", async () => {
    const headers = { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.2" };
    // Non-whitelisted domain
    let resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        vendorId: "BoothCreator",
        proofType: "storefront_bio_token",
        proofValue: "#vrc-opt-out-BoothCreator",
        storefrontUrl: "https://evil-phishing.com/creator"
      })
    });
    expect(resp.status).toBe(400);
    let json = await resp.json() as any;
    expect(json.error).toContain("authorized storefront domains");

    // SSRF attempt to private IP
    (dns as any).lookup = async (hostname: string) => {
      return { address: "127.0.0.1", family: 4 };
    };

    resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        vendorId: "BoothCreator",
        proofType: "storefront_bio_token",
        proofValue: "#vrc-opt-out-BoothCreator",
        storefrontUrl: "https://booth.pm/ja/items/999001"
      })
    });
    expect(resp.status).toBe(400);
    json = await resp.json() as any;
    expect(json.error).toContain("SSRF blocked");
  });

  it("verifies storefront_bio_token, registers opt-out and delists matching packages", async () => {
    // Restore safe mock dns.lookup
    (dns as any).lookup = async (hostname: string) => {
      return { address: "104.18.25.40", family: 4 }; // Cloudflare public IP
    };

    // Mock fetch for storefront URL containing bio token
    const testToken = "#vrc-opt-out-BoothCreator";
    globalThis.fetch = (async (url: any, opts: any) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.startsWith(baseUrl)) {
        return originalFetch(url, opts);
      }
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head><title>Booth Store Profile</title></head>
          <body>
            <div class="user-bio">Welcome to my shop! ${testToken} All rights reserved.</div>
          </body>
        </html>
      `, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }) as any;

    const resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.10"
      },
      body: JSON.stringify({
        vendorId: "BoothCreator",
        proofType: "storefront_bio_token",
        proofValue: testToken,
        storefrontUrl: "https://booth.pm/@boothcreator"
      })
    });

    expect(resp.status).toBe(200);
    const json = await resp.json() as any;
    expect(json.success).toBe(true);
    expect(json.vendorId).toBe("BoothCreator");
    expect(json.status).toBe("opted_out");
    expect(json.packagesDelisted).toBe(1);

    // Verify DB state
    expect(testDb.isOptedOut("BoothCreator")).toBe(true);
    const pkg = testDb.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE id = 'pkg-bio-1';").get() as any;
    expect(pkg.lifecycle).toBe("delisted");
  });

  it("verifies dns_txt records matching vrc-opt-out=<vendorId>", async () => {
    (dns as any).resolveTxt = async (hostname: string) => {
      if (hostname === "_vrc-opt-out.dnscreator.dev") {
        return [["vrc-opt-out=DnsCreator"]];
      }
      throw new Error("ENOTFOUND");
    };

    const resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.11"
      },
      body: JSON.stringify({
        vendorId: "DnsCreator",
        proofType: "dns_txt",
        proofValue: "dnscreator.dev"
      })
    });

    expect(resp.status).toBe(200);
    const json = await resp.json() as any;
    expect(json.success).toBe(true);
    expect(json.vendorId).toBe("DnsCreator");
    expect(json.packagesDelisted).toBe(1);

    expect(testDb.isOptedOut("DnsCreator")).toBe(true);
    const pkg = testDb.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE id = 'pkg-dns-1';").get() as any;
    expect(pkg.lifecycle).toBe("delisted");
  });

  it("verifies signed_commit cryptographic signatures", async () => {
    // Generate test RSA key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });

    const vendorId = "GitCreator";
    const signer = crypto.createSign("SHA256");
    signer.update(vendorId);
    signer.end();
    const signature = signer.sign(privateKey, "hex");

    const proofValue = JSON.stringify({
      publicKey,
      signature
    });

    const resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.12"
      },
      body: JSON.stringify({
        vendorId,
        proofType: "signed_commit",
        proofValue
      })
    });

    expect(resp.status).toBe(200);
    const json = await resp.json() as any;
    expect(json.success).toBe(true);
    expect(json.vendorId).toBe(vendorId);
    expect(json.packagesDelisted).toBe(1);

    expect(testDb.isOptedOut(vendorId)).toBe(true);
    const pkg = testDb.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE id = 'pkg-sig-1';").get() as any;
    expect(pkg.lifecycle).toBe("delisted");
  });

  it("rejects signed_commit with invalid signature", async () => {
    const { publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" }
    });

    const resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.13"
      },
      body: JSON.stringify({
        vendorId: "AnotherCreator",
        proofType: "signed_commit",
        proofValue: JSON.stringify({
          publicKey,
          signature: "deadbeefcafebabe"
        })
      })
    });

    expect(resp.status).toBe(400);
    const json = await resp.json() as any;
    expect(json.error).toContain("Verification failed: Invalid cryptographic commit signature");
  });

  it("enforces sliding-window rate limit of 5 opt-out requests per minute", async () => {
    // Send 6 requests in rapid succession from the same client IP
    const clientHeaders = {
      "Content-Type": "application/json",
      "X-Forwarded-For": "203.0.113.42"
    };

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const resp = await fetch(`${baseUrl}/v1/opt-out`, {
        method: "POST",
        headers: clientHeaders,
        body: JSON.stringify({
          vendorId: `SpamVendor${i}`,
          proofType: "dns_txt",
          proofValue: "invalid-domain"
        })
      });
      lastStatus = resp.status;
    }

    expect(lastStatus).toBe(429);
  });

  it("rejects DNS TXT verification when record is a substring or prefix extension", async () => {
    (dns as any).resolveTxt = async (hostname: string) => {
      if (hostname === "_vrc-opt-out.prefix-test.dev") {
        return [["vrc-opt-out=AliceCorp"]];
      }
      throw new Error("ENOTFOUND");
    };

    const resp = await fetch(`${baseUrl}/v1/opt-out`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.99"
      },
      body: JSON.stringify({
        vendorId: "Alice",
        proofType: "dns_txt",
        proofValue: "prefix-test.dev"
      })
    });

    expect(resp.status).toBe(400);
    const json = await resp.json() as any;
    expect(json.error).toContain("DNS verification failed");
  });

  it("delistCreatorPackages does not accidentally delist unrelated packages with substring URLs", () => {
    // Seed test packages
    testDb.rawDb.run(`
      INSERT OR REPLACE INTO canonical_packages (
        id, canonical_id, name, author, authors_json, category, subcategory, type,
        description, primary_platform, platforms_json, url, vcc_url,
        price_currency, price_amount, is_vcc, tags_json, dependencies_json,
        source_ids_json, media_id, origin_created_at, origin_updated_at,
        created_at_confidence, lifecycle, lifecycle_updated_at, created_at, updated_at
      ) VALUES
      (
        'pkg-safe-booth-1', 'safe-booth-item', 'Safe Booth Item', 'OtherAuthor', '["OtherAuthor", "CoAuthorAlice"]', 'tool', 'general', 'tool',
        'Unrelated package with booth url', 'booth', '["booth"]', 'https://booth.pm/ja/items/888001', NULL,
        'JPY', 500, 0, '[]', '{}', '["booth:888001"]', NULL, NULL, NULL, 'unknown', 'published', NULL, datetime('now'), datetime('now')
      ),
      (
        'pkg-safe-git-1', 'safe-git-item', 'Safe Git Item', 'GitHubOrg', '["GitHubOrg"]', 'tool', 'general', 'tool',
        'Unrelated git tool', 'github', '["github"]', 'https://github.com/vrc-dev/tool', NULL,
        'USD', 0, 0, '[]', '{}', '["github:vrc-dev/tool"]', NULL, NULL, NULL, 'unknown', 'published', NULL, datetime('now'), datetime('now')
      );
    `);

    // Delist creator "booth" or "tool" should not delist pkg-safe-booth-1 or pkg-safe-git-1
    const delisted = testDb.delistCreatorPackages("booth");
    expect(delisted).toBe(0);

    const safe1 = testDb.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE id = 'pkg-safe-booth-1';").get() as any;
    expect(safe1.lifecycle).toBe("published");

    const safe2 = testDb.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE id = 'pkg-safe-git-1';").get() as any;
    expect(safe2.lifecycle).toBe("published");

    // Delisting co-author "CoAuthorAlice" should successfully delist pkg-safe-booth-1
    const delistedCo = testDb.delistCreatorPackages("CoAuthorAlice");
    expect(delistedCo).toBe(1);
    const updatedSafe1 = testDb.rawDb.prepare("SELECT lifecycle FROM canonical_packages WHERE id = 'pkg-safe-booth-1';").get() as any;
    expect(updatedSafe1.lifecycle).toBe("delisted");
  });
});
