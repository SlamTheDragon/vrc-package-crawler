import { describe, it, expect } from "bun:test";
import { db } from "../src/db.ts";
import { dbV2 } from "../src/db_v2.ts";
import { RobotsEnforcer } from "../src/utils/robots.ts";
import { sanitizeOutboundUrl } from "../src/utils/image_proxy.ts";

describe("Compliance, Two-Way Sync & Lake Invariants", () => {
  it("dual-writes queued URLs to both frontier and frontier_v2", () => {
    const testUrl = `https://booth.pm/test-dual-${Date.now()}`;
    db.queueUrl(testUrl, "booth");

    const rowV1 = db.query("SELECT url, status, attempts FROM frontier WHERE url = ?;").get(testUrl) as any;
    const rowV2 = dbV2.query("SELECT url, status, attempts, fetch_interval_sec FROM frontier_v2 WHERE url = ?;").get(testUrl) as any;

    expect(rowV1).toBeTruthy();
    expect(rowV1.status).toBe("pending");
    expect(rowV2).toBeTruthy();
    expect(rowV2.status).toBe("pending");
    expect(rowV2.fetch_interval_sec).toBe(86400);

    // Clean up
    db.run("DELETE FROM frontier WHERE url = ?;", [testUrl]);
    dbV2.run("DELETE FROM frontier_v2 WHERE url = ?;", [testUrl]);
  });

  it("dual-updates status and calls Poisson scheduler on markStatus", () => {
    const testUrl = `https://booth.pm/test-status-${Date.now()}`;
    db.queueUrl(testUrl, "booth");

    db.markStatus(testUrl, "done");

    const rowV1 = db.query("SELECT status, attempts FROM frontier WHERE url = ?;").get(testUrl) as any;
    const rowV2 = dbV2.query("SELECT status, attempts, last_fetched_at, next_fetch_at FROM frontier_v2 WHERE url = ?;").get(testUrl) as any;

    expect(rowV1.status).toBe("done");
    expect(rowV1.attempts).toBe(1);
    expect(rowV2.status).toBe("done");
    expect(rowV2.last_fetched_at).toBeTruthy();
    expect(rowV2.next_fetch_at).toBeTruthy();

    // Clean up
    db.run("DELETE FROM frontier WHERE url = ?;", [testUrl]);
    dbV2.run("DELETE FROM frontier_v2 WHERE url = ?;", [testUrl]);
  });

  it("dual-writes saved entities to entities and entities_v2 with origin timestamps", () => {
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

    const v1 = db.query("SELECT id, title, author FROM entities WHERE id = ?;").get(entId) as any;
    const v2 = dbV2.query("SELECT id, title, author, origin_created_at, origin_updated_at FROM entities_v2 WHERE id = ?;").get(entId) as any;

    expect(v1).toBeTruthy();
    expect(v1.title).toBe("Test Shader Asset");
    expect(v2).toBeTruthy();
    expect(v2.origin_created_at).toBe(originCreated);
    expect(v2.origin_updated_at).toBe(originUpdated);

    // Clean up
    db.run("DELETE FROM entities WHERE id = ?;", [entId]);
    dbV2.run("DELETE FROM entities_v2 WHERE id = ?;", [entId]);
  });

  it("respects creator opt-out registrations via exact match and regex", () => {
    const creatorName = "OptOutArtist";
    const pattern = "^optoutartist$";

    expect(dbV2.isCreatorOptedOut(creatorName)).toBe(false);

    dbV2.registerOptOut(creatorName, "booth", pattern, "Creator requested takedown");

    expect(dbV2.isCreatorOptedOut(creatorName)).toBe(true);
    expect(dbV2.isCreatorOptedOut("optoutartist")).toBe(true);
    expect(dbV2.isCreatorOptedOut("AnotherCreator")).toBe(false);

    // Clean up
    dbV2.run("DELETE FROM creator_opt_outs_v2 WHERE creator_name = ?;", [creatorName]);
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

    const cleanAlready = "https://github.com/bdunderscore/modular-avatar";
    expect(sanitizeOutboundUrl(cleanAlready)).toBe(cleanAlready);
  });
});
