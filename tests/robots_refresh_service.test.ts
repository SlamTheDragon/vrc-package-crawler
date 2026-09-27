import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../src/worker/local_sqlite.ts";
import { refreshDueRobots } from "../src/worker/robots_refresh_service.ts";

describe("automatic coordinator robots refresh service", () => {
  test("refreshes only seeded due origins in bounded passes, then permits claims", async () => {
    const store = new LocalCoordinatorStore();
    const token = store.createNodeCredential("vpm-node", ["vpm"]);
    const principal = store.authenticate("vpm-node", token)!;
    store.seedJob("https://first.example.org/index.json", "vpm", 0);
    store.seedJob("https://second.example.org/index.json", "vpm", 0);
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
      expect(store.claim({ schemaVersion: 1, nodeId: "vpm-node", capabilities: ["vpm"] }, principal).status).toBe("leased");
    } finally { store.close(); }
  });

  test("a failed origin is cached briefly rather than retried in a tight loop", async () => {
    let now = Date.parse("2026-09-27T00:00:00.000Z");
    const store = new LocalCoordinatorStore(":memory:", () => now);
    store.seedJob("https://failure.example.org/index.json", "vpm", 0);
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
    store.seedJob("https://cancelled.example.org/index.json", "vpm", 0);
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
