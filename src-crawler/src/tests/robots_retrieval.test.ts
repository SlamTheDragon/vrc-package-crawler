import { describe, expect, test } from "bun:test";
import { CRAWLER_USER_AGENT } from "../shared/crawler_identity.ts";
import { MAX_ROBOTS_BYTES } from "../shared/robots_snapshot.ts";
import { retrieveRobotsSnapshot, type RobotsFetcher } from "../shared/robots_retrieval.ts";
import { fetchPublicMetadata } from "../node/public_metadata_fetch.ts";

describe("coordinator robots retrieval", () => {
  test("follows five HTTPS redirects across hosts and keeps the initial origin", async () => {
    const seen: string[] = [];
    const fetcher: RobotsFetcher = async (url, init) => {
      seen.push(url);
      expect(init.redirect).toBe("manual");
      expect(new Headers(init.headers).get("user-agent")).toBe(CRAWLER_USER_AGENT);
      return seen.length <= 5
        ? new Response(null, { status: 302, headers: { location: `https://redirect-${seen.length}.example.org/rules.txt` } })
        : new Response("User-agent: *\nDisallow: /private", { status: 200,
          headers: { "content-type": "text/plain" } });
    };
    const result = await retrieveRobotsSnapshot("https://start.example.org", fetcher);
    expect(result).toEqual({ origin: "https://start.example.org", statusCode: 200,
      body: "User-agent: *\nDisallow: /private", redirects: [1, 2, 3, 4, 5].map((n) =>
        `https://redirect-${n}.example.org/rules.txt`) });
    expect(seen).toHaveLength(6);
  });

  test("denies a sixth redirect and never fetches its target", async () => {
    let calls = 0;
    const result = await retrieveRobotsSnapshot("https://start.example.org", async () => {
      calls++;
      return new Response(null, { status: 301, headers: { location: `/rule-${calls}` } });
    });
    expect(result.statusCode).toBe(599);
    expect(result.error).toContain("limit");
    expect(calls).toBe(6);
  });

  test("rejects unsafe, missing, and malformed redirects before another fetch", async () => {
    for (const location of ["http://example.org/robots.txt", "https://localhost/robots.txt",
      "https://example.org:8443/robots.txt", "https://user:secret@example.org/robots.txt", "https://example.org/a#b", "http://["]) {
      let calls = 0;
      const result = await retrieveRobotsSnapshot("https://start.example.org", async () => {
        calls++;
        return new Response(null, { status: 302, headers: { location } });
      });
      expect(result.statusCode).toBe(599);
      expect(calls).toBe(1);
    }
    const missing = await retrieveRobotsSnapshot("https://start.example.org", async () =>
      new Response(null, { status: 302 }));
    expect(missing.statusCode).toBe(599);
  });

  test("a redirected host is checked again by the pinned transport", async () => {
    const seen: string[] = [];
    const result = await retrieveRobotsSnapshot("https://start.example.org", async (url, init) => {
      seen.push(url);
      if (seen.length === 1) return new Response(null, { status: 302,
        headers: { location: "https://internal.example.org/robots.txt" } });
      return fetchPublicMetadata(url, init, async () => [{ address: "127.0.0.1", family: 4 }]);
    });
    expect(seen).toEqual(["https://start.example.org/robots.txt", "https://internal.example.org/robots.txt"]);
    expect(result.statusCode).toBe(599);
    expect(result.error).toContain("private or reserved");
  });

  test("treats missing as unavailable but server errors and network failures as denied", async () => {
    for (const status of [404, 410, 403, 429, 503]) {
      const result = await retrieveRobotsSnapshot("https://start.example.org", async () =>
        new Response("ignored", { status }));
      expect(result.statusCode).toBe(status);
      expect(result.body).toBe("");
    }
    const offline = await retrieveRobotsSnapshot("https://start.example.org", async () => {
      throw new Error("offline");
    });
    expect(offline.statusCode).toBe(599);
    expect(offline.error).toContain("offline");
  });

  test("bounds body by declared and streamed bytes, and rejects partial, HTML, and invalid UTF-8", async () => {
    const large = "a".repeat(MAX_ROBOTS_BYTES + 1);
    for (const response of [
      new Response("small", { status: 200, headers: { "content-length": String(MAX_ROBOTS_BYTES + 1) } }),
      new Response(large, { status: 200 }),
      new Response("half", { status: 206 }),
      new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
      new Response(new Uint8Array([0xff]), { status: 200 })
    ]) {
      const result = await retrieveRobotsSnapshot("https://start.example.org", async () => response);
      expect(result.statusCode).toBe(599);
    }
    const exact = await retrieveRobotsSnapshot("https://start.example.org", async () =>
      new Response("a".repeat(MAX_ROBOTS_BYTES), { status: 200 }));
    expect(exact.statusCode).toBe(200);
    expect(new TextEncoder().encode(exact.body).byteLength).toBe(MAX_ROBOTS_BYTES);
  });
});
