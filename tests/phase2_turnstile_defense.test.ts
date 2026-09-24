import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { CrawlerDB } from "../src/db.ts";
import { GumroadDriver } from "../src/drivers/gumroad.ts";
import { JinxxyDriver } from "../src/drivers/jinxxy.ts";
import { circuitBreaker } from "../src/ratelimit.ts";
import path from "path";
import fs from "fs";

describe("Phase 2 - Task 2.3: Cloudflare Turnstile Detection & Poisson Acceleration Guard", () => {
  const fixturePath = path.resolve(__dirname, `../dist/test_turnstile_${Date.now()}.db`);
  let testDb: CrawlerDB;
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    testDb = new CrawlerDB(fixturePath);
    circuitBreaker.reset();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    try { testDb?.close(); } catch (_) {}
    if (fs.existsSync(fixturePath)) {
      try { fs.unlinkSync(fixturePath); } catch (_) {}
    }
    circuitBreaker.reset();
  });

  const TURNSTILE_PAYLOAD = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Just a moment...</title>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
      </head>
      <body>
        <div class="cf-mitigated: challenge">Please verify you are human</div>
      </body>
    </html>
  `;

  it("detects Cloudflare Managed Challenge on Gumroad and trips circuit breaker without accelerating crawl rate", async () => {
    const testUrl = "https://gumroad.com/l/test-turnstile-product";
    testDb.queueUrl(testUrl, "gumroad", 10);

    // Mock fetch returning Turnstile challenge HTML with HTTP 200 (Cloudflare Managed Challenge pattern)
    globalThis.fetch = (async () => {
      return new Response(TURNSTILE_PAYLOAD, {
        status: 200,
        headers: { "Content-Type": "text/html" }
      });
    }) as any;

    const res = await GumroadDriver.crawlProduct(testUrl, testDb);
    expect(res).toBe(false);

    // Verify circuit breaker tripped to OPEN for gumroad.com
    expect(circuitBreaker.getState("gumroad.com")).toBe("OPEN");

    // Verify url in frontier is marked 'blocked'
    const item = testDb.rawDb.prepare("SELECT status, last_failure_code, last_failure_reason FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(item?.status).toBe("blocked");
    expect(item?.last_failure_code).toBe(403);
    expect(item?.last_failure_reason).toContain("Turnstile");
  });

  it("detects Cloudflare Managed Challenge on Jinxxy and halts domain crawl", async () => {
    circuitBreaker.reset("jinxxy.com");
    const testUrl = "https://jinxxy.com/market/scripts-tools";
    testDb.queueUrl(testUrl, "jinxxy", 10);

    // Mock fetch returning Turnstile challenge HTML
    globalThis.fetch = (async () => {
      return new Response(TURNSTILE_PAYLOAD, {
        status: 200,
        headers: { "Content-Type": "text/html" }
      });
    }) as any;

    const urls = await JinxxyDriver.crawlBrowsePage(testUrl, testDb);
    expect(urls.length).toBe(0);

    // Verify circuit breaker tripped to OPEN for jinxxy.com
    expect(circuitBreaker.getState("jinxxy.com")).toBe("OPEN");

    // Verify frontier url marked 'blocked'
    const item = testDb.rawDb.prepare("SELECT status FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(item?.status).toBe("blocked");
  });
});
