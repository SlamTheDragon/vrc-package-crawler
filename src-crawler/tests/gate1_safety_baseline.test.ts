import { describe, expect, it } from "bun:test";
import { CrawlerDB } from "../src/db/db.ts";
import { PoissonScheduler } from "../src/utils/poisson_scheduler.ts";
import { AdaptiveRateLimiter } from "../src/utils/adaptive_limiter.ts";
import { DomainCircuitBreaker } from "../src/utils/circuit_breaker.ts";
import { circuitBreaker } from "../src/utils/circuit_breaker.ts";
import { applyAccessFailure, isChallengeResponse } from "../src/node/fetch_outcome.ts";

describe("Gate 1 safety baseline", () => {

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
      const resp = await fetch(url);
      const failure = applyAccessFailure(resp, url, "gumroad.com", "gumroad.com", fixture, await resp.text());
      expect(failure).toBe("challenge");
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
});
