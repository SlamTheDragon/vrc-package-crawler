import { describe, it, expect } from "bun:test";
import { db } from "../src/db.ts";
import { RobotsEnforcer } from "../src/utils/robots.ts";
import { sanitizeOutboundUrl } from "../src/utils/image_proxy.ts";

describe("Compliance, Direct Ingestion & Lake Invariants", () => {
  it("ingests queued URLs into frontier with adaptive defaults", () => {
    const testUrl = `https://booth.pm/test-queue-${Date.now()}`;
    db.queueUrl(testUrl, "booth");

    const row = db.query("SELECT url, status, attempts, fetch_interval_sec FROM frontier WHERE url = ?;").get(testUrl) as any;

    expect(row).toBeTruthy();
    expect(row.status).toBe("pending");
    expect(row.fetch_interval_sec).toBe(86400);

    // Clean up
    db.run("DELETE FROM frontier WHERE url = ?;", [testUrl]);
  });

  it("updates status and calls Poisson scheduler on markStatus", () => {
    const testUrl = `https://booth.pm/test-status-${Date.now()}`;
    db.queueUrl(testUrl, "booth");

    db.markStatus(testUrl, "done");

    const row = db.query("SELECT status, attempts, last_fetched_at, next_fetch_at FROM frontier WHERE url = ?;").get(testUrl) as any;

    expect(row.status).toBe("done");
    expect(row.attempts).toBe(1);
    expect(row.last_fetched_at).toBeTruthy();
    expect(row.next_fetch_at).toBeTruthy();

    // Clean up
    db.run("DELETE FROM frontier WHERE url = ?;", [testUrl]);
  });

  it("saves raw entities to entities with authoritative origin timestamps", () => {
    const entId = `test_ent_${Date.now()}`;
    const testUrl = `https://booth.pm/items/${Date.now()}`;
    const originCreated = "2026-05-15T10:00:00.000Z";
    const originUpdated = "2026-06-01T12:00:00.000Z";

    db.saveEntity({
      id: entId,
      platform: "booth",
      url: testUrl,
      title: "Test Shader Asset",
      author: "TestCreator",
      description: "A test shader for VRChat",
      price_currency: "JPY",
      price_amount: 1200,
      tags_json: JSON.stringify(["shader", "vrchat"]),
      external_links_json: "[]",
      raw_json: JSON.stringify({ originCreatedAt: originCreated, originUpdatedAt: originUpdated })
    });

    const row = db.query("SELECT id, title, author, origin_created_at, origin_updated_at FROM entities WHERE id = ?;").get(entId) as any;

    expect(row).toBeTruthy();
    expect(row.title).toBe("Test Shader Asset");
    expect(row.origin_created_at).toBe(originCreated);
    expect(row.origin_updated_at).toBe(originUpdated);

    // Clean up
    db.run("DELETE FROM entities WHERE id = ?;", [entId]);
  });

  it("respects creator opt-out registrations via exact match and regex", () => {
    const creatorName = "OptOutArtist";
    const pattern = "^optoutartist$";

    expect(db.isCreatorOptedOut(creatorName)).toBe(false);

    db.registerOptOut(creatorName, "booth", pattern, "Creator requested takedown");

    expect(db.isCreatorOptedOut(creatorName)).toBe(true);
    expect(db.isCreatorOptedOut("optoutartist")).toBe(true);
    expect(db.isCreatorOptedOut("AnotherCreator")).toBe(false);

    // Clean up
    db.run("DELETE FROM creator_opt_outs WHERE creator_name = ?;", [creatorName]);
  });

  it("robots enforcer handles network timeouts gracefully without site-wide lockout", async () => {
    const enforcer = new RobotsEnforcer();
    // Simulate invalid non-existent domain to trigger network failure branch
    const record = await enforcer.getRobots("http://invalid-unreachable-domain-12345.local");
    expect(record.statusCode).toBe(599);
    // Rules must be empty, not blanket disallow /
    expect(record.rules.length).toBe(0);
    // Path should remain allowed rather than permanently breaking all crawls
    expect(enforcer.isPathAllowed("/test/path", record.rules)).toBe(true);
  });

  it("strips tracking and affiliate parameters from canonical URLs", () => {
    const dirty = "https://booth.pm/ja/items/123456?aff=scam_partner&utm_source=twitter&ref=bad_hub";
    const clean = sanitizeOutboundUrl(dirty);
    expect(clean).toBe("https://booth.pm/ja/items/123456");
  });
});
