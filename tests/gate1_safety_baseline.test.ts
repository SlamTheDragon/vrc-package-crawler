import { describe, expect, it } from "bun:test";
import { CrawlerDB } from "../src/db.ts";
import { fetchStorefrontProofWithRedirects, startServer } from "../src/server/index.ts";
import { ImageProxyService } from "../src/utils/image_proxy.ts";
import sharp from "sharp";
import dns from "node:dns/promises";
import { PoissonScheduler } from "../src/utils/poisson_scheduler.ts";
import { AdaptiveRateLimiter } from "../src/utils/adaptive_limiter.ts";
import { DomainCircuitBreaker } from "../src/utils/circuit_breaker.ts";
import { circuitBreaker } from "../src/ratelimit.ts";
import { crawlProduct as crawlGumroadProduct } from "../src/drivers/gumroad/harvesting.ts";
import { applyAccessFailure, isChallengeResponse } from "../src/node/fetch_outcome.ts";

describe("Gate 1 safety baseline", () => {
  it("rejects both protected writes when no token is configured", async () => {
    const fixture = new CrawlerDB(":memory:");
    const port = 20000 + Math.floor(Math.random() * 1000);
    const server = startServer({ host: "127.0.0.1", port, apiToken: "", db: fixture });
    try {
      for (const route of ["/v1/reports", "/v1/telemetry"]) {
        const response = await fetch(`http://127.0.0.1:${server.port}${route}`, {
          method: "POST",
          headers: { Authorization: "Bearer vrc-secret-telemetry-token", "Content-Type": "application/json" },
          body: "{}"
        });
        expect(response.status).toBe(401);
      }
    } finally {
      server.stop();
      fixture.close();
    }
  });

  it("does not publish a fabricated installable VPM release", async () => {
    const fixture = new CrawlerDB(":memory:");
    const server = startServer({ host: "127.0.0.1", port: 21000 + Math.floor(Math.random() * 1000), apiToken: "", db: fixture });
    try {
      for (const path of ["/v1/vpm/index.json", "/index.json"]) {
        const response = await fetch(`http://127.0.0.1:${server.port}${path}`);
        expect(response.status).toBe(410);
        expect((await response.json() as any).packages).toBeUndefined();
      }
    } finally { server.stop(); fixture.close(); }
  });

  it("manual recrawl preserves in-flight, blocked, dead-letter and timed retry states", () => {
    const fixture = new CrawlerDB(":memory:");
    try {
      const statuses = ["pending", "fetching", "done", "failed", "blocked", "dead_letter", "circuit_broken", "backoff"] as const;
      for (const status of statuses) {
        const url = `https://example.org/${status}`;
        fixture.queueUrl(url, "booth");
        fixture.rawDb.run(
          "UPDATE frontier SET status = ?, attempts = 3, etag = 'old', last_modified = 'old', next_fetch_at = '2030-01-01T00:00:00.000Z' WHERE url = ?",
          [status, url]
        );
      }

      expect(fixture.resetFrontierForRecrawl()).toBe(3);
      for (const status of statuses) {
        const row = fixture.rawDb.prepare("SELECT status, attempts, etag, last_modified, next_fetch_at FROM frontier WHERE url = ?")
          .get(`https://example.org/${status}`) as { status: string; attempts: number; etag: string | null; last_modified: string | null; next_fetch_at: string };
        if (["pending", "done", "failed"].includes(status)) {
          expect(row.status).toBe("pending");
          expect(row.attempts).toBe(0);
          expect(row.etag).toBeNull();
          expect(row.last_modified).toBeNull();
          expect(row.next_fetch_at).not.toBe("2030-01-01T00:00:00.000Z");
        } else {
          expect(row.status).toBe(status);
          expect(row.attempts).toBe(3);
          expect(row.etag).toBe("old");
          expect(row.next_fetch_at).toBe("2030-01-01T00:00:00.000Z");
        }
      }
    } finally {
      fixture.close();
    }
  });

  it("late completion and periodic recovery cannot reopen blocked or dead-letter URLs", () => {
    const fixture = new CrawlerDB(":memory:");
    const scheduler = new PoissonScheduler();
    try {
      for (const status of ["blocked", "dead_letter", "backoff", "circuit_broken"] as const) {
        const url = `https://gumroad.com/l/${status}`;
        fixture.queueUrl(url, "gumroad");
        fixture.rawDb.run(
          "UPDATE frontier SET status = ?, next_fetch_at = datetime('now', '-1 second') WHERE url = ?",
          [status, url]
        );
      }

      expect(fixture.drainExpiredRetryQueue()).toBe(2);
      for (const status of ["blocked", "dead_letter"] as const) {
        const url = `https://gumroad.com/l/${status}`;
        fixture.markStatus(url, "done");
        fixture.markStatus(url, "failed");
        fixture.markStatus(url, "pending");
        fixture.markStatus(url, "backoff");
        scheduler.adjustAfterFetch(url, true, undefined, undefined, fixture);
        fixture.saveEntity({
          id: `gumroad:${status}`, platform: "gumroad", url,
          title: "Shallow test product", author: "Test creator", description: "Fixture",
          raw_json: "{}"
        });
      }
      expect(fixture.requeueShallowGumroadEntities().promoted).toBe(0);
      for (const status of ["blocked", "dead_letter"] as const) {
        const row = fixture.rawDb.prepare("SELECT status FROM frontier WHERE url = ?")
          .get(`https://gumroad.com/l/${status}`) as { status: string };
        expect(row.status).toBe(status);
      }
    } finally {
      fixture.close();
    }
  });

  it("stores source media metadata and hashes without a generated WebP payload", async () => {
    const fixture = new CrawlerDB(":memory:");
    const originalFetch = globalThis.fetch;
    const png = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#325787" } }).png().toBuffer();
    globalThis.fetch = (async () => new Response(png, {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": String(png.length) }
    })) as unknown as typeof fetch;
    try {
      const record = await ImageProxyService.processAndCacheImage("https://example.org/preview.png", fixture);
      expect(record?.content_type).toBe("image/png");
      expect(record?.width).toBe(320);
      expect(record?.height).toBe(240);
      expect(record?.blurhash).toBeTruthy();
      expect(record?.phash_64).toHaveLength(16);
      const columns = fixture.rawDb.prepare("PRAGMA table_info(media_cache)").all() as { name: string }[];
      expect(columns.some((column) => column.name === "webp_data")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      fixture.close();
      ImageProxyService.shutdown();
    }
  });

  it("keeps missing media as NULL and defers rechecks without a dangling sentinel", async () => {
    const fixture = new CrawlerDB(":memory:");
    try {
      fixture.rawDb.run(`
        INSERT INTO canonical_packages (
          id, canonical_id, name, author, category, subcategory, type,
          primary_platform, platforms_json, url, source_ids_json, created_at, updated_at
        ) VALUES (
          'missing-media', 'missing-media', 'No preview', 'Fixture', 'tool', 'general', 'tool',
          'github', '["github"]', 'https://github.com/example/no-preview', '[]', datetime('now'), datetime('now')
        );
      `);
      expect(await ImageProxyService.indexPendingMedia(10, fixture)).toBe(0);
      const first = fixture.rawDb.prepare("SELECT media_id, media_checked_at FROM canonical_packages WHERE canonical_id = 'missing-media'")
        .get() as { media_id: string | null; media_checked_at: string | null };
      expect(first.media_id).toBeNull();
      expect(first.media_checked_at).toBeTruthy();
      expect(await ImageProxyService.indexPendingMedia(10, fixture)).toBe(0);
      const second = fixture.rawDb.prepare("SELECT media_checked_at FROM canonical_packages WHERE canonical_id = 'missing-media'")
        .get() as { media_checked_at: string | null };
      expect(second.media_checked_at).toBe(first.media_checked_at);
    } finally {
      fixture.close();
    }
  });

  it("bounds Retry-After so one origin cannot suspend the crawler indefinitely", () => {
    const limiter = new AdaptiveRateLimiter();
    const response = new Response(null, { status: 429, headers: { "Retry-After": "999999999" } });
    const applied = limiter.handleRateLimit("gumroad.com", response);
    expect(applied).toBe(300000);
    expect(limiter.getRemainingBackoffMs("gumroad.com")).toBeLessThanOrEqual(300000);
  });

  it("does not clear an open origin circuit on a late concurrent success", () => {
    const breaker = new DomainCircuitBreaker({ baseBackoffMs: 1000, jitterRatio: 0 });
    breaker.trip("gumroad.com", 403, "Challenge");
    breaker.recordSuccess("gumroad.com");
    breaker.recordSuccess("gumroad.com");
    expect(breaker.getState("gumroad.com")).toBe("OPEN");
    expect(breaker.canExecute("gumroad.com")).toBe(false);
    const holdBefore = breaker.getRemainingBackoffMs("gumroad.com");
    breaker.recordFailure("gumroad.com", 500, "Late worker error");
    expect(breaker.getRemainingBackoffMs("gumroad.com")).toBeGreaterThan(holdBefore - 100);
  });

  it("classifies challenge headers before HTTP status or product parsing", async () => {
    const fixture = new CrawlerDB(":memory:");
    const originalFetch = globalThis.fetch;
    const url = "https://gumroad.com/l/challenged-product";
    fixture.queueUrl(url, "gumroad");
    circuitBreaker.reset("gumroad.com");
    globalThis.fetch = (async () => new Response("Not a product", {
      status: 403, headers: { "cf-mitigated": "challenge", "Content-Type": "text/html" }
    })) as unknown as typeof fetch;
    try {
      const result = await crawlGumroadProduct({ isAborted: false, sleep: async () => {} }, url, fixture);
      expect(result).toBe(false);
      const row = fixture.rawDb.prepare("SELECT status FROM frontier WHERE url = ?").get(url) as { status: string };
      expect(row.status).toBe("blocked");
      expect(circuitBreaker.getState("gumroad.com")).toBe("OPEN");
      expect(fixture.rawDb.prepare("SELECT COUNT(*) AS count FROM entities").get()).toMatchObject({ count: 0 });
      expect(isChallengeResponse(new Response("", { status: 200 }), "<script src='/cdn-cgi/challenge-platform/h/b/orchestrate'></script>")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      circuitBreaker.reset("gumroad.com");
      fixture.close();
    }
  });

  it("distinguishes timed 429 backoff from a 403 access objection", () => {
    const fixture = new CrawlerDB(":memory:");
    try {
      const throttled = "https://example.org/rate-limited";
      const forbidden = "https://example.org/forbidden";
      fixture.queueUrl(throttled, "booth");
      fixture.queueUrl(forbidden, "booth");
      expect(applyAccessFailure(new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
        throttled, "example.org", "example.org", fixture)).toBe("rate_limited");
      fixture.markStatus(throttled, "failed", "Late worker failure");
      fixture.markStatus(throttled, "done", "Late worker success");
      expect((fixture.rawDb.prepare("SELECT status FROM frontier WHERE url = ?").get(throttled) as any).status).toBe("backoff");
      expect(applyAccessFailure(new Response(null, { status: 403 }),
        forbidden, "example.org", "example.org", fixture)).toBe("forbidden");
      expect((fixture.rawDb.prepare("SELECT status FROM frontier WHERE url = ?").get(forbidden) as any).status).toBe("blocked");
    } finally {
      circuitBreaker.reset("example.org");
      fixture.close();
    }
  });

  it("follows same-origin storefront redirects with a fresh DNS check per hop", async () => {
    const originalFetch = globalThis.fetch;
    const originalLookup = dns.lookup;
    const requested: string[] = [];
    let lookups = 0;
    (dns as any).lookup = async () => ({ address: ++lookups === 1 ? "1.1.1.1" : "127.0.0.1", family: 4 });
    globalThis.fetch = (async (target: string, options: RequestInit) => {
      requested.push(String(target));
      expect(options.redirect).toBe("manual");
      return new Response(null, { status: 302, headers: { Location: "/ja/items/123" } });
    }) as unknown as typeof fetch;
    try {
      await expect(fetchStorefrontProofWithRedirects("https://booth.pm/items/123"))
        .rejects.toThrow("private/reserved IP");
      expect(requested).toEqual(["https://booth.pm/items/123"]);
      expect(lookups).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
      (dns as any).lookup = originalLookup;
    }
  });

  it("rejects storefront redirects to another origin", async () => {
    const originalFetch = globalThis.fetch;
    const originalLookup = dns.lookup;
    (dns as any).lookup = async () => ({ address: "1.1.1.1", family: 4 });
    globalThis.fetch = (async () => new Response(null, {
      status: 302,
      headers: { Location: "https://example.org/claimed-profile" }
    })) as unknown as typeof fetch;
    try {
      await expect(fetchStorefrontProofWithRedirects("https://booth.pm/items/123"))
        .rejects.toThrow("original HTTPS origin");
    } finally {
      globalThis.fetch = originalFetch;
      (dns as any).lookup = originalLookup;
    }
  });

  it("accepts a same-origin language redirect for proof content", async () => {
    const originalFetch = globalThis.fetch;
    const originalLookup = dns.lookup;
    const requested: string[] = [];
    (dns as any).lookup = async () => ({ address: "1.1.1.1", family: 4 });
    globalThis.fetch = (async (target: string) => {
      requested.push(String(target));
      return requested.length === 1
        ? new Response(null, { status: 302, headers: { Location: "/ja/items/123" } })
        : new Response("creator proof token", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const response = await fetchStorefrontProofWithRedirects("https://booth.pm/items/123");
      expect(response.status).toBe(200);
      expect(response.body.toString()).toContain("creator proof token");
      expect(requested).toEqual(["https://booth.pm/items/123", "https://booth.pm/ja/items/123"]);
    } finally {
      globalThis.fetch = originalFetch;
      (dns as any).lookup = originalLookup;
    }
  });
});
