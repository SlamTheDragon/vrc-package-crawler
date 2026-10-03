import { describe, expect, it } from "bun:test";
import { AdaptiveRateLimiter } from "../src/utils/resilience/adaptive_limiter.ts";
import { DomainCircuitBreaker } from "../src/utils/resilience/circuit_breaker.ts";
import { circuitBreaker } from "../src/utils/resilience/circuit_breaker.ts";
import { applyAccessFailure, isChallengeResponse, type AccessStatusSink } from "../src/client/fetch_outcome.ts";

describe("Gate 1 safety baseline", () => {
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
    const statuses: Record<string, string> = {};
    const mockSink: AccessStatusSink = {
      markStatus: (url, status) => { statuses[url] = status; }
    };
    const originalFetch = globalThis.fetch;
    const url = "https://gumroad.com/l/challenged-product";
    circuitBreaker.reset("gumroad.com");
    globalThis.fetch = (async () => new Response("Not a product", {
      status: 403, headers: { "cf-mitigated": "challenge", "Content-Type": "text/html" }
    })) as unknown as typeof fetch;
    try {
      const resp = await fetch(url);
      const failure = applyAccessFailure(resp, url, "gumroad.com", "gumroad.com", mockSink, await resp.text());
      expect(failure).toBe("challenge");
      expect(statuses[url]).toBe("blocked");
      expect(circuitBreaker.getState("gumroad.com")).toBe("OPEN");
      expect(isChallengeResponse(new Response("", { status: 200 }), "<script src='/cdn-cgi/challenge-platform/h/b/orchestrate'></script>")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      circuitBreaker.reset("gumroad.com");
    }
  });

  it("distinguishes timed 429 backoff from a 403 access objection", () => {
    const statuses: Record<string, string> = {};
    const mockSink: AccessStatusSink = {
      markStatus: (url, status) => { statuses[url] = status; }
    };
    try {
      const throttled = "https://example.org/rate-limited";
      const forbidden = "https://example.org/forbidden";
      expect(applyAccessFailure(new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
        throttled, "example.org", "example.org", mockSink)).toBe("rate_limited");
      expect(statuses[throttled]).toBe("backoff");
      expect(applyAccessFailure(new Response(null, { status: 403 }),
        forbidden, "example.org", "example.org", mockSink)).toBe("forbidden");
      expect(statuses[forbidden]).toBe("blocked");
    } finally {
      circuitBreaker.reset("example.org");
    }
  });
});
