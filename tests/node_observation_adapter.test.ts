import { describe, expect, test } from "bun:test";
import { parseGitHubRepository, parseObservation, parseVpmListingRecipe, parseVpmRepository, fetchJobOutcome } from "../src/node/observation_adapter.ts";
import { CrawlJobSchema } from "../src/shared/node_protocol.ts";
import { CRAWLER_USER_AGENT, CRAWLER_ROBOTS_TOKEN } from "../src/shared/crawler_identity.ts";
import { CONFIG } from "../src/config.ts";

const job = CrawlJobSchema.parse({
  jobId: "test", leaseId: "c2dd6562-6fa4-4cd2-84ae-0c090ba29733", platform: "vpm",
  url: "https://example.org/package.json", origin: "https://example.org",
  leaseExpiresAt: "2026-09-27T00:05:00.000Z", etag: null, lastModified: null
});

describe("standalone node observation adapter", () => {
  test("uses the same declared identity as the legacy crawler and robots matcher", async () => {
    const suppliedHeaders: Headers[] = [];
    await fetchJobOutcome(job, async (_input, init) => {
      suppliedHeaders.push(new Headers(init?.headers));
      return new Response("{}", { headers: { "content-type": "application/json" } });
    });
    expect(suppliedHeaders[0]?.get("user-agent")).toBe(CRAWLER_USER_AGENT);
    expect(CONFIG.userAgent).toBe(CRAWLER_USER_AGENT);
    expect(CRAWLER_USER_AGENT.startsWith(`${CRAWLER_ROBOTS_TOKEN}/`)).toBe(true);
  });

  test("extracts one direct VPM package and its actual release version", () => {
    expect(parseObservation(job, JSON.stringify({ name: "com.example.tool", version: "1.2.3",
      displayName: "Useful Tool", author: { name: "Creator" }, description: "A tool",
      url: "https://example.org/tool" }), "application/json")).toEqual({
      sourceItemKey: "com.example.tool", title: "Useful Tool", author: "Creator",
      summary: "A tool", outboundLinks: ["https://example.org/tool"], originUpdatedAt: null,
      release: { version: "1.2.3", dependencyRanges: {}, downloadUrl: "https://example.org/tool" }
    });
  });

  test("rejects malformed direct VPM identities instead of truncating them into different evidence", async () => {
    const prefix = "com.example." + "x".repeat(188);
    const malformedManifests = [
      { name: `${prefix}a`, version: "1.0.0" },
      { name: `${prefix}b`, version: "1.0.0" },
      { name: "com.example.tool", version: "v".repeat(101) },
      { name: "", version: "1.0.0" },
      { name: "com.example.tool", version: " " },
      { name: " com.example.tool", version: "1.0.0" }
    ];
    for (const manifest of malformedManifests) {
      const body = JSON.stringify(manifest);
      expect(parseObservation(job, body, "application/json")).toBeNull();
      expect(await fetchJobOutcome(job, async () => new Response(body,
        { headers: { "content-type": "application/json" } })))
        .toEqual({ kind: "temporary_failure", reason: "No item observation in response" });
    }
  });

  test("extracts a VCC repository as bounded distinct source items with real version keys", async () => {
    const listing = JSON.stringify({ name: "Example VPM", url: "https://example.org/index.json", packages: {
      "com.example.tool": { versions: {
        "1.2.3": { name: "com.example.tool", version: "1.2.3", displayName: "Useful Tool",
          author: { name: "Creator" }, vpmDependencies: { "com.vrchat.avatars": "3.x" },
          url: "https://example.org/com.example.tool-1.2.3.zip", zipSHA256: "a".repeat(64) },
        "1.2.2": { name: "com.example.tool", version: "1.2.2", displayName: "Useful Tool" }
      } },
      "com.example.other": { versions: { "0.4.0": { name: "com.example.other", version: "0.4.0" } } }
    } });
    const parsed = parseVpmRepository(job, listing);
    expect(parsed?.length).toBe(2);
    expect(parsed?.[0].sourceItemKey).toBe("com.example.tool");
    expect(parsed?.[0].releases?.map((release) => release.version)).toEqual(["1.2.3", "1.2.2"]);
    expect(parsed?.[0].releases?.[0]).toEqual({ version: "1.2.3",
      dependencyRanges: { "com.vrchat.avatars": "3.x" },
      downloadUrl: "https://example.org/com.example.tool-1.2.3.zip", zipSha256: "a".repeat(64) });
    const outcome = await fetchJobOutcome(job, async () => new Response(listing, { headers: { "content-type": "application/json" } }));
    expect(outcome.kind).toBe("batch");
    expect(parseVpmRepository(job, listing.replace('"version":"1.2.3"', '"version":"9.9.9"'))).toBeNull();
  });

  test("turns template source.json into leads, never package/version observations", async () => {
    const recipe = JSON.stringify({ name: "Example Listing", id: "com.example.listing",
      url: "https://example.org/index.json", githubRepos: ["example/tool"],
      packages: [{ name: "com.example.tool", releases: ["https://example.org/tool.zip"] }] });
    expect(parseVpmRepository(job, recipe)).toBeNull();
    expect(parseVpmListingRecipe(job, recipe)).toEqual([
      { kind: "vpm_listing", url: "https://example.org/index.json" },
      { kind: "github_repository", url: "https://github.com/example/tool" },
      { kind: "release_zip", url: "https://example.org/tool.zip", claimedPackageId: "com.example.tool" }
    ]);
    const outcome = await fetchJobOutcome(job, async () => new Response(recipe, { headers: { "content-type": "application/json" } }));
    expect(outcome.kind).toBe("discovery");
    expect(parseVpmListingRecipe(job, recipe.replace("example/tool", "../internal"))).toBeNull();
  });

  test("marks a listing incomplete while retaining valid releases and bounded issue codes", async () => {
    const listing = JSON.stringify({ name: "Example", packages: {
      "com.example.good": { versions: {
        "1.0.0": { name: "com.example.good", version: "1.0.0" },
        "1.1.0": { name: "com.example.other", version: "1.1.0" }
      } },
      "com.example.broken": { versions: { "2.0.0": null } }
    } });
    expect(parseVpmRepository(job, listing)).toBeNull();
    const outcome = await fetchJobOutcome(job, async () => new Response(listing, { headers: { "content-type": "application/json" } }));
    expect(outcome.kind).toBe("partial_batch");
    if (outcome.kind !== "partial_batch") throw new Error("Expected incomplete listing");
    expect(outcome.observations.map((item) => [item.sourceItemKey, item.releases?.map((release) => release.version)]))
      .toEqual([["com.example.good", ["1.0.0"]]]);
    expect(outcome.issues).toEqual([
      { sourceItemKey: "com.example.good", version: "1.1.0", code: "identity_mismatch" },
      { sourceItemKey: "com.example.broken", version: "2.0.0", code: "invalid_manifest" }
    ]);
  });

  test("does not treat a project-local VPM manifest as a public package or repository", async () => {
    const projectManifest = JSON.stringify({ dependencies: { "com.example.tool": { version: "1.0.0" } },
      locked: { "com.example.tool": { version: "1.0.0" } } });
    expect(parseVpmRepository(job, projectManifest)).toBeNull();
    expect(parseObservation(job, projectManifest, "application/json")).toBeNull();
    expect((await fetchJobOutcome(job, async () => new Response(projectManifest))).kind).toBe("temporary_failure");
  });

  test("uses the public GitHub repository API for stable metadata evidence only", async () => {
    const githubJob = { ...job, platform: "github" as const,
      url: "https://api.github.com/repos/vrc-get/vrc-get", origin: "https://api.github.com" };
    const body = JSON.stringify({ id: 12345, full_name: "vrc-get/vrc-get", name: "vrc-get",
      owner: { login: "vrc-get" }, private: false, html_url: "https://github.com/vrc-get/vrc-get",
      description: "Open-source VRChat package management", homepage: "https://vrc-get.anatawa12.com",
      updated_at: "2026-09-26T01:02:03Z" });
    const observation = parseGitHubRepository(githubJob, body);
    if (!observation) throw new Error("Expected GitHub metadata observation");
    expect(observation).toEqual({ sourceItemKey: "github:12345", title: "vrc-get", author: "vrc-get",
      summary: "Open-source VRChat package management",
      outboundLinks: ["https://github.com/vrc-get/vrc-get", "https://vrc-get.anatawa12.com"],
      originUpdatedAt: "2026-09-26T01:02:03.000Z" });
    const outcome = await fetchJobOutcome(githubJob, async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("accept")).toBe("application/vnd.github+json");
      expect(headers.get("x-github-api-version")).toBe("2026-03-10");
      expect(headers.has("authorization")).toBe(false);
      return new Response(body, { headers: { "content-type": "application/json" } });
    });
    expect(outcome).toEqual({ kind: "changed", observation });
    expect(parseGitHubRepository(githubJob, body.replace('"private":false', '"private":true'))).toBeNull();
    expect(parseGitHubRepository(githubJob, body.replace("vrc-get/vrc-get", "other/repo"))).toBeNull();
    const htmlJob = { ...githubJob, url: "https://github.com/vrc-get/vrc-get", origin: "https://github.com" };
    expect(await fetchJobOutcome(htmlJob, async () => { throw new Error("Should not fetch HTML"); }))
      .toEqual({ kind: "blocked", reason: "GitHub jobs require a public REST repository metadata endpoint" });
    expect(await fetchJobOutcome({ ...githubJob, platform: "curated" }, async () => { throw new Error("Wrong-scope API fetch"); }))
      .toEqual({ kind: "blocked", reason: "GitHub jobs require a public REST repository metadata endpoint" });
    expect(await fetchJobOutcome(githubJob, async () => new Response(
      JSON.stringify({ message: "You have exceeded a secondary rate limit. Please wait." }),
      { status: 403, headers: { "content-type": "application/json" } }
    ))).toEqual({ kind: "rate_limited", retryAfterSeconds: 60 });
  });

  test("uses Cheerio for structured product metadata on a storefront", () => {
    const storefront = { ...job, platform: "booth" as const, url: "https://booth.pm/items/123", origin: "https://booth.pm" };
    const html = `<html><head><link rel="canonical" href="https://booth.pm/ja/items/123">
      <script type="application/ld+json">{"@type":"Product","name":"Avatar Asset","brand":{"name":"Maker"},"description":"For avatars"}</script></head></html>`;
    expect(parseObservation(storefront, html, "text/html")?.title).toBe("Avatar Asset");
    expect(parseObservation(storefront, html, "text/html")?.sourceItemKey).toBe("booth.pm/ja/items/123");
  });

  test("classifies rate limits and unparseable responses without submitting product data", async () => {
    const limited = await fetchJobOutcome(job, async () => new Response("", { status: 429, headers: { "Retry-After": "42" } }));
    expect(limited).toEqual({ kind: "rate_limited", retryAfterSeconds: 42 });
    const deniedTemporarily = await fetchJobOutcome(job, async () => new Response("", { status: 403, headers: { "Retry-After": "9" } }));
    expect(deniedTemporarily).toEqual({ kind: "rate_limited", retryAfterSeconds: 9 });
    const reset = Math.floor(Date.now() / 1000) + 120;
    const githubLimit = await fetchJobOutcome(job, async () => new Response("", { status: 403,
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } }));
    expect(githubLimit.kind).toBe("rate_limited");
    if (githubLimit.kind === "rate_limited") expect(githubLimit.retryAfterSeconds).toBeGreaterThanOrEqual(118);
    const challenge = await fetchJobOutcome(job, async () => new Response("", { status: 200, headers: { "cf-mitigated": "challenge" } }));
    expect(challenge.kind).toBe("blocked");
    const redirect = await fetchJobOutcome(job, async () => new Response(null, { status: 302,
      headers: { location: "https://127.0.0.1/private" } }));
    expect(redirect).toEqual({ kind: "blocked", reason: "Redirect requires source review" });
    const malformed = await fetchJobOutcome(job, async () => new Response("<html>search listing</html>", { headers: { "Content-Type": "text/html" } }));
    expect(malformed.kind).toBe("temporary_failure");
  });
});
