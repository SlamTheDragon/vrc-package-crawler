import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../../src-web/tests/support/local_sqlite.js";
import { refreshDueRobots } from "../../src-web/tests/support/robots_refresh_service.js";
import { seedApprovedFixtureJob } from "../../src-web/tests/helpers/source_access_fixture.js";

describe("automatic coordinator robots refresh service", () => {
  test("robots preflight and product claims share an origin lease and profile pacing floor", () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const origin = "https://paced.example.org";
    try {
      store.createSourceAccessProfile({ schemaVersion: 1, platform: "vpm", origin,
        pathScope: "/index.json", method: "GET", purpose: "metadata", minDelayMs: 5000,
        expiresAt: "2099-01-01T00:00:00.000Z", reviewReference: "offline-fixture-only",
        reason: "Synthetic origin pacing case", retainClasses: ["normalized_facts"], publishClasses: [] },
      "test-fixture");
      store.createSourceAccessProfile({ schemaVersion: 1, platform: "vpm", origin,
        pathScope: "/other.json", method: "GET", purpose: "metadata", minDelayMs: 9000,
        expiresAt: "2099-01-01T00:00:00.000Z", reviewReference: "offline-fixture-only",
        reason: "Stricter same-origin pacing case", retainClasses: ["normalized_facts"], publishClasses: [] },
      "test-fixture");
      store.seedJob(`${origin}/index.json`, "vpm", 0);
      store.seedJob(`${origin}/other.json`, "vpm", 0);
      store.recordRobotsSnapshot(origin, 404);
      const token = store.createNodeCredential("paced-node", ["vpm"]);
      const principal = store.authenticate("paced-node", token)!;
      const request = { schemaVersion: 1 as const, nodeId: "paced-node", capabilities: ["vpm" as const] };
      const refreshLease = store.reserveRobotsRefresh(origin);
      expect(refreshLease).not.toBeNull();
      expect(store.claim(request, principal).status).toBe("empty");
      expect(store.completeRobotsRefresh(origin, refreshLease!, 404)).toBe(true);
      now += 8999;
      expect(store.claim(request, principal).status).toBe("empty");
      expect(store.reserveRobotsRefresh(origin)).toBeNull();
      now += 1;
      expect(store.claim(request, principal).status).toBe("leased");
    } finally { store.close(); }
  });

  test("refreshes only seeded due origins in bounded passes, then permits claims", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    const token = store.createNodeCredential("vpm-node", ["vpm"]);
    const principal = store.authenticate("vpm-node", token)!;
    seedApprovedFixtureJob(store, "https://first.example.org/index.json", "vpm", 0);
    seedApprovedFixtureJob(store, "https://second.example.org/index.json", "vpm", 0);
    const fetched: string[] = [];
    const fetcher = async (url: string) => {
      fetched.push(url);
      return new Response(null, { status: 404 });
    };
    try {
      expect((await refreshDueRobots(store, fetcher, 1))).toHaveLength(1);
      expect((await refreshDueRobots(store, fetcher, 1))).toHaveLength(1);
      expect((await refreshDueRobots(store, fetcher, 1))).toHaveLength(0);
      expect(fetched.sort()).toEqual([
        "https://first.example.org/robots.txt", "https://second.example.org/robots.txt"
      ]);
      expect(store.claim({ schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] }, principal).status).toBe("empty");
      now += 1000;
      expect(store.claim({ schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] }, principal).status).toBe("leased");
    } finally { store.close(); }
  });

  test("a failed origin is cached briefly rather than retried in a tight loop", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    seedApprovedFixtureJob(store, "https://failure.example.org/index.json", "vpm", 0);
    let requests = 0;
    const fetcher = async () => {
      requests++;
      throw new Error("network unavailable");
    };
    try {
      expect((await refreshDueRobots(store, fetcher))[0]).toMatchObject({ statusCode: 599, usable: false });
      expect((await refreshDueRobots(store, fetcher))).toHaveLength(0);
      expect(requests).toBe(1);
      now += 60 * 60 * 1000 + 1;
      expect((await refreshDueRobots(store, fetcher))).toHaveLength(1);
      expect(requests).toBe(2);
    } finally { store.close(); }
  });

  test("shutdown cancellation releases the lease without recording a false origin failure", async () => {
    const store = new LocalCoordinatorStore();
    const controller = new AbortController();
    seedApprovedFixtureJob(store, "https://cancelled.example.org/index.json", "vpm", 0);
    const fetcher = async () => {
      controller.abort();
      throw new Error("cancelled");
    };
    try {
      await expect(refreshDueRobots(store, fetcher, 1, controller.signal)).rejects.toThrow("cancelled");
      expect((store.db.prepare("SELECT count(*) AS n FROM origin_robots").get() as { n: number }).n).toBe(0);
      expect((store.db.prepare("SELECT count(*) AS n FROM origin_robots_refresh_leases").get() as { n: number }).n).toBe(0);
    } finally { store.close(); }
  });
});
