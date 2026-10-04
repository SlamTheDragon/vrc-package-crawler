import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "./support/local_sqlite.js";
import { handlePublicCatalogRequest } from "../src/api/public_handler.ts";
import {
  CATALOG_PROTOCOL_VERSION,
  PublicCatalogListResponseSchema,
  CatalogDeltaResponseSchema,
  decodeCatalogDeltaCursor,
  type CatalogDelta,
  decodeCatalogCursor, encodeCatalogCursor, VRCPackageClient
} from "vrc-packages-api";
import { PROTOCOL_VERSION } from "../../src-crawler/src/shared/protocol/node_protocol.js";
import { seedApprovedFixtureJob } from "./helpers/source_access_fixture.js";

function publicGet(path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET"
  });
}

function seedVpmAndCatalogItem(
  store: LocalCoordinatorStore,
  pkgId: string,
  canonicalId: string,
  displayName: string,
  lifecycle: "active" | "deprecated" | "quarantined" | "delisted" = "active"
): void {
  const sourceKey = `vpm:${pkgId}`;
  const now = new Date(store["now"]()).toISOString();

  // Create source item
  store.db.prepare(`
    INSERT INTO source_items (source_key, platform, source_url, latest_digest, latest_version_no, gone_at)
    VALUES (?, 'vpm', ?, 'digest-1', 1, NULL)
  `).run(sourceKey, `https://vpm.example.com/${pkgId}.json`);

  // Create canonical package
  store.db.prepare(`
    INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
    VALUES (?, 'tools', 'tool', ?, ?, ?, ?, ?)
  `).run(canonicalId, lifecycle, displayName, pkgId, now, now);

  // Link source to canonical
  store.db.prepare(`
    INSERT INTO identity_links (link_id, source_key, canonical_id, evidence_kind, confidence, review_state, created_at)
    VALUES (?, ?, ?, 'vpm_id', 1.0, 'accepted', ?)
  `).run(crypto.randomUUID(), sourceKey, canonicalId, now);

  // Add front
  store.db.prepare(`
    INSERT INTO package_fronts (front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at)
    VALUES (?, ?, ?, 'vpm', ?, NULL, NULL, 'available', ?)
  `).run(crypto.randomUUID(), canonicalId, sourceKey, `https://vpm.example.com/${pkgId}`, now);
}

describe("Public Consumer Catalog Protocol (/v1/app/index & /v1/app/index/delta)", () => {
  test("SDK public index sends limit 100 and cursor unchanged through the real handler", async () => {
    const store = new LocalCoordinatorStore();
    const cursor = encodeCatalogCursor({ createdAt: "2026-10-03T00:00:00.000Z", canonicalId: "page-boundary" });
    const listPage = store.listCanonicalPackagesPage.bind(store);
    let calls = 0;
    store.listCanonicalPackagesPage = (limit, decoded) => {
      calls++;
      expect(limit).toBe(100);
      expect(decoded).toEqual(decodeCatalogCursor(cursor));
      return listPage(limit, decoded);
    };
    const client = new VRCPackageClient({ baseUrl: "https://coordinator.invalid",
      fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        expect(request.method).toBe("GET");
        expect(request.headers.has("authorization")).toBe(false);
        expect(request.body).toBeNull();
        expect([...url.searchParams.keys()].sort()).toEqual(["cursor", "limit"]);
        expect(url.searchParams.get("limit")).toBe("100");
        expect(url.searchParams.get("cursor")).toBe(cursor);
        return handlePublicCatalogRequest(request, store);
      }, { preconnect() {} }) });
    try {
      const params = { limit: 100, cursor };
      expect(PublicCatalogListResponseSchema.parse(await client.index.query(params))).toEqual({
        schemaVersion: 1, packages: [], nextCursor: null
      });
      expect(calls).toBe(1);
    } finally { store.close(); }
  });

  test("SDK public index preserves the wire receipt and continues to the next catalog page", async () => {
    const store = new LocalCoordinatorStore();
    const requests: URL[] = [];
    const client = new VRCPackageClient({ baseUrl: "https://coordinator.invalid",
      fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(new URL(request.url));
        expect(request.method).toBe("GET");
        expect(request.headers.has("authorization")).toBe(false);
        return handlePublicCatalogRequest(request, store);
      }, { preconnect() {} }) });
    try {
      seedVpmAndCatalogItem(store, "sdk.one", "com.example.sdk1", "SDK Package 1");
      seedVpmAndCatalogItem(store, "sdk.two", "com.example.sdk2", "SDK Package 2");
      seedVpmAndCatalogItem(store, "sdk.three", "com.example.sdk3", "SDK Package 3");
      const first = PublicCatalogListResponseSchema.parse(await client.index.query({ limit: 2 }));
      expect(first.schemaVersion).toBe(1);
      expect(first.packages).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const params = { limit: 2, cursor: first.nextCursor! };
      const second = PublicCatalogListResponseSchema.parse(await client.index.query(params));
      expect(second.schemaVersion).toBe(1);
      expect(second.packages).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(requests).toHaveLength(2);
      expect([...requests[0]!.searchParams.keys()]).toEqual(["limit"]);
      expect([...requests[1]!.searchParams.keys()].sort()).toEqual(["cursor", "limit"]);
      expect(requests[1]!.searchParams.get("cursor")).toBe(first.nextCursor);
      expect(new Set([...first.packages, ...second.packages].map(item => item.canonicalId)).size).toBe(3);
    } finally { store.close(); }
  });

  test("SDK public index rejects malformed success receipts instead of inventing a catalog", async () => {
    const store = new LocalCoordinatorStore();
    let calls = 0;
    try {
      for (const malformed of [
        { packages: [], nextCursor: null },
        { schemaVersion: 1, packages: [] },
        { schemaVersion: 1, packages: [], nextCursor: null, count: 0 },
        { schemaVersion: 1, packages: [{ canonicalId: "incomplete-package" }], nextCursor: null }
      ]) {
        const client = new VRCPackageClient({ baseUrl: "https://coordinator.invalid",
          fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            calls++;
            const response = await handlePublicCatalogRequest(new Request(input, init), store);
            expect(response.status).toBe(200);
            return Response.json(malformed);
          }, { preconnect() {} }) });
        await expect(client.index.query()).rejects.toThrow();
      }
      expect(calls).toBe(4);
    } finally { store.close(); }
  });

  test("GET /v1/app/index: returns empty catalog when no packages indexed", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const response = await handlePublicCatalogRequest(publicGet("/v1/app/index"), store);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toContain("public, max-age=60");

      const body = PublicCatalogListResponseSchema.parse(await response.json());
      expect(body.schemaVersion).toBe(CATALOG_PROTOCOL_VERSION);
      expect(body.packages).toHaveLength(0);
      expect(body.nextCursor).toBeNull();
    } finally {
      store.close();
    }
  });

  test("GET /v1/app/index: rejects invalid query parameters", async () => {
    const store = new LocalCoordinatorStore();
    try {
      // Invalid limit
      const res1 = await handlePublicCatalogRequest(publicGet("/v1/app/index?limit=0"), store);
      expect(res1.status).toBe(400);

      const res2 = await handlePublicCatalogRequest(publicGet("/v1/app/index?limit=101"), store);
      expect(res2.status).toBe(400);

      const res3 = await handlePublicCatalogRequest(publicGet("/v1/app/index?limit=abc"), store);
      expect(res3.status).toBe(400);

      // Invalid cursor
      const res4 = await handlePublicCatalogRequest(publicGet("/v1/app/index?cursor=invalid!cursor"), store);
      expect(res4.status).toBe(400);

      // Unexpected query parameters
      const res5 = await handlePublicCatalogRequest(publicGet("/v1/app/index?unknown=param"), store);
      expect(res5.status).toBe(400);
    } finally {
      store.close();
    }
  });

  test("GET /v1/app/index: supports keyset pagination", async () => {
    const store = new LocalCoordinatorStore();
    try {
      seedVpmAndCatalogItem(store, "pkg.one", "com.example.pkg1", "Package 1");
      seedVpmAndCatalogItem(store, "pkg.two", "com.example.pkg2", "Package 2");
      seedVpmAndCatalogItem(store, "pkg.three", "com.example.pkg3", "Package 3");

      const page1Res = await handlePublicCatalogRequest(publicGet("/v1/app/index?limit=2"), store);
      expect(page1Res.status).toBe(200);
      const page1 = PublicCatalogListResponseSchema.parse(await page1Res.json());
      expect(page1.packages).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const decodedCursor = decodeCatalogCursor(page1.nextCursor!);
      expect(decodedCursor).not.toBeNull();

      const page2Res = await handlePublicCatalogRequest(
        publicGet(`/v1/app/index?limit=2&cursor=${page1.nextCursor}`),
        store
      );
      expect(page2Res.status).toBe(200);
      const page2 = PublicCatalogListResponseSchema.parse(await page2Res.json());
      expect(page2.packages).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    } finally {
      store.close();
    }
  });

  test("GET /v1/app/index/delta: emits upserts and delist tombstones with epoch", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const initialEpoch = store.getCatalogEpoch();
      expect(initialEpoch.length).toBeGreaterThan(0);

      seedVpmAndCatalogItem(store, "pkg.active", "com.example.active", "Active Tool", "active");
      seedVpmAndCatalogItem(store, "pkg.delisted", "com.example.delisted", "Delisted Tool", "delisted");

      const res = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta?limit=10"), store);
      expect(res.status).toBe(200);

      const body = CatalogDeltaResponseSchema.parse(await res.json());
      expect(body.schemaVersion).toBe(CATALOG_PROTOCOL_VERSION);
      expect(body.epoch).toBe(initialEpoch);
      expect(body.deltas).toHaveLength(2);

      const activeDelta = body.deltas.find((d) => d.canonicalId === "com.example.active");
      expect(activeDelta?.action).toBe("upsert");
      expect(activeDelta?.package).toBeDefined();
      expect(activeDelta?.package?.displayName).toBe("Active Tool");
      expect(activeDelta?.package?.fronts).toHaveLength(1);

      const delistedDelta = body.deltas.find((d) => d.canonicalId === "com.example.delisted");
      expect(delistedDelta?.action).toBe("delist");
      expect(delistedDelta?.package).toBeUndefined();
    } finally {
      store.close();
    }
  });

  test("GET /v1/app/index/delta: supports keyset delta cursor pagination", async () => {
    const store = new LocalCoordinatorStore();
    try {
      seedVpmAndCatalogItem(store, "pkg.one", "com.example.pkg1", "Package 1");
      seedVpmAndCatalogItem(store, "pkg.two", "com.example.pkg2", "Package 2");
      seedVpmAndCatalogItem(store, "pkg.three", "com.example.pkg3", "Package 3");

      const page1Res = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta?limit=2"), store);
      expect(page1Res.status).toBe(200);
      const page1 = CatalogDeltaResponseSchema.parse(await page1Res.json());
      expect(page1.deltas).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const decodedDeltaCursor = decodeCatalogDeltaCursor(page1.nextCursor!);
      expect(decodedDeltaCursor).not.toBeNull();

      const page2Res = await handlePublicCatalogRequest(
        publicGet(`/v1/app/index/delta?limit=2&cursor=${page1.nextCursor}`),
        store
      );
      expect(page2Res.status).toBe(200);
      const page2 = CatalogDeltaResponseSchema.parse(await page2Res.json());
      expect(page2.deltas).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    } finally {
      store.close();
    }
  });

  test("resetCatalogEpoch: invalidates epoch after catalog reset", () => {
    const store = new LocalCoordinatorStore();
    try {
      const epoch1 = store.getCatalogEpoch();
      const epoch2 = store.resetCatalogEpoch();
      expect(epoch2).not.toBe(epoch1);
      expect(store.getCatalogEpoch()).toBe(epoch2);
    } finally {
      store.close();
    }
  });

  test("public catalog requests serialize without authentication and retired aliases return 404", async () => {
    const store = new LocalCoordinatorStore();
    try {
      seedVpmAndCatalogItem(store, "pkg.http", "com.example.http", "HTTP Package");

      // Canonical API_ROUTES /v1/app/index route
      const appIndexRes = await handlePublicCatalogRequest(publicGet("/v1/app/index"), store);
      expect(appIndexRes.status).toBe(200);
      const appIndexBody = PublicCatalogListResponseSchema.parse(await appIndexRes.json());
      expect(appIndexBody.packages).toHaveLength(1);
      expect(appIndexBody.packages[0].canonicalId).toBe("com.example.http");

      // Canonical API_ROUTES /v1/app/index/delta route
      const appDeltaRes = await handlePublicCatalogRequest(publicGet("/v1/app/index/delta"), store);
      expect(appDeltaRes.status).toBe(200);
      const appDeltaBody = CatalogDeltaResponseSchema.parse(await appDeltaRes.json());
      expect(appDeltaBody.deltas).toHaveLength(1);
      expect(appDeltaBody.deltas[0].action).toBe("upsert");
      expect(appDeltaBody.deltas[0].canonicalId).toBe("com.example.http");

      // Retired aliases must return 404.
      const retiredCatalog = await handlePublicCatalogRequest(publicGet("/v1/catalog"), store);
      expect(retiredCatalog.status).toBe(404);

      const retiredDelta = await handlePublicCatalogRequest(publicGet("/v1/catalog/delta"), store);
      expect(retiredDelta.status).toBe(404);
    } finally {
      store.close();
    }
  });
});
