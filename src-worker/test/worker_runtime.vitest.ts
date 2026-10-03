import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("configured coordinator Worker", () => {
  it("rejects unauthenticated initialization before writing D1", async () => {
    const response = await exports.default.fetch("https://coordinator.example/v1/operator/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, autoSeed: false })
    });
    expect(response.status).toBe(401);
    const result = await env.VRCP_D1.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='canonical_packages'"
    ).all();
    expect(result.results).toEqual([]);
  });

  it("initializes the actual coordinator with its configured local D1 binding", async () => {
    const response = await exports.default.fetch("https://coordinator.example/v1/operator/init", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPERATOR_TOKEN}`
      },
      body: JSON.stringify({ schemaVersion: 1, autoSeed: false })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: 1, status: "ok", message: "Schema initialized", autoSeed: false
    });
    const count = await env.VRCP_D1.prepare("SELECT COUNT(*) AS count FROM canonical_packages").first("count");
    expect(count).toBe(0);
    const jobs = await env.VRCP_D1.prepare("SELECT COUNT(*) AS count FROM crawl_jobs").first("count");
    expect(jobs).toBe(0);
    const catalog = await exports.default.fetch("https://coordinator.example/v1/app/index");
    expect(catalog.status).toBe(200);
    expect(await catalog.json()).toEqual({ schemaVersion: 1, packages: [], nextCursor: null });
  });

  it("serves JSON 404s instead of the unused Hello World scaffold", async () => {
    const response = await exports.default.fetch("https://coordinator.example/");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Not Found" });
  });
});
