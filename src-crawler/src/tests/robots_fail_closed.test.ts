import { afterEach, describe, expect, test } from "bun:test";
import { RobotsEnforcer } from "../utils/robots.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("robots access failures", () => {
  test("a network failure disallows the origin instead of silently allowing it", async () => {
    globalThis.fetch = (async () => { throw new Error("offline"); }) as any;
    const robots = new RobotsEnforcer();
    expect(await robots.isAllowed("https://example.org/catalog")).toBe(false);
    expect((await robots.getRobots("https://example.org")).statusCode).toBe(599);
  });

  test("a missing robots file permits only under the RFC's unavailable rule", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 404 })) as any;
    expect(await new RobotsEnforcer().isAllowed("https://example.org/catalog")).toBe(true);
  });

  test("merges repeated bot groups and rejects an unchecked robots redirect", async () => {
    const robots = new RobotsEnforcer();
    globalThis.fetch = (async () => new Response(
      "User-agent: VRCDiscoveryBot\nDisallow: /first\nUser-agent: OtherBot\nAllow: /\nUser-agent: VRCDiscoveryBot\nDisallow: /second"
    )) as any;
    expect(await robots.isAllowed("https://example.org/first/item")).toBe(false);
    expect(await robots.isAllowed("https://example.org/second/item")).toBe(false);
    expect(await robots.isAllowed("https://example.org/elsewhere")).toBe(true);

    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      expect(init.redirect).toBe("manual");
      return new Response(null, {
        status: 302, headers: { location: "http://127.0.0.1/private" }
      });
    }) as any;
    expect(await new RobotsEnforcer().isAllowed("https://redirect.example.org/item")).toBe(false);
  });

  test("does not infer allow from a truncated robots document", async () => {
    globalThis.fetch = (async () => new Response("User-agent: *\nAllow: /\n" + "x".repeat(512 * 1024))) as any;
    const robots = new RobotsEnforcer();
    expect(await robots.isAllowed("https://large.example.org/item")).toBe(false);
    expect((await robots.getRobots("https://large.example.org")).truncated).toBe(true);
  });

  test("an invalid target URL does not bypass the policy gate", async () => {
    expect(await new RobotsEnforcer().isAllowed("not a URL")).toBe(false);
  });
});
