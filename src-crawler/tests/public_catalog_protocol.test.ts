import { afterEach, describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../src/worker/storage/local_sqlite.ts";
import { handlePublicCatalogRequest } from "../src/worker/api/public_handler.ts";
import {
  CATALOG_PROTOCOL_VERSION,
  PublicCatalogListResponseSchema,
  CatalogDeltaResponseSchema,
  decodeCatalogDeltaCursor,
  type CatalogDelta
} from "../src/shared/protocol/catalog_protocol.ts";
import { decodeCatalogCursor } from "../src/shared/protocol/operator_protocol.ts";
import { PROTOCOL_VERSION } from "../src/shared/protocol/node_protocol.ts";
import { seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";

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

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => {
  server?.stop(true);
  server = undefined;
});

describe("Public Consumer Catalog Protocol (/v1/catalog & /v1/catalog/delta)", () => {
  test("GET /v1/catalog: returns empty catalog when no packages indexed", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const response = await handlePublicCatalogRequest(publicGet("/v1/catalog"), store);
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

  test("GET /v1/catalog: rejects invalid query parameters", async () => {
    const store = new LocalCoordinatorStore();
    try {
      // Invalid limit
      const res1 = await handlePublicCatalogRequest(publicGet("/v1/catalog?limit=0"), store);
      expect(res1.status).toBe(400);

      const res2 = await handlePublicCatalogRequest(publicGet("/v1/catalog?limit=101"), store);
      expect(res2.status).toBe(400);

      const res3 = await handlePublicCatalogRequest(publicGet("/v1/catalog?limit=abc"), store);
      expect(res3.status).toBe(400);

      // Invalid cursor
      const res4 = await handlePublicCatalogRequest(publicGet("/v1/catalog?cursor=invalid!cursor"), store);
      expect(res4.status).toBe(400);

      // Unexpected query parameters
      const res5 = await handlePublicCatalogRequest(publicGet("/v1/catalog?unknown=param"), store);
      expect(res5.status).toBe(400);
    } finally {
      store.close();
    }
  });

  test("GET /v1/catalog: supports keyset pagination", async () => {
    const store = new LocalCoordinatorStore();
    try {
      seedVpmAndCatalogItem(store, "pkg.one", "com.example.pkg1", "Package 1");
      seedVpmAndCatalogItem(store, "pkg.two", "com.example.pkg2", "Package 2");
      seedVpmAndCatalogItem(store, "pkg.three", "com.example.pkg3", "Package 3");

      const page1Res = await handlePublicCatalogRequest(publicGet("/v1/catalog?limit=2"), store);
      expect(page1Res.status).toBe(200);
      const page1 = PublicCatalogListResponseSchema.parse(await page1Res.json());
      expect(page1.packages).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const decodedCursor = decodeCatalogCursor(page1.nextCursor!);
      expect(decodedCursor).not.toBeNull();

      const page2Res = await handlePublicCatalogRequest(
        publicGet(`/v1/catalog?limit=2&cursor=${page1.nextCursor}`),
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

  test("GET /v1/catalog/delta: emits upserts and delist tombstones with epoch", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const initialEpoch = store.getCatalogEpoch();
      expect(initialEpoch.length).toBeGreaterThan(0);

      seedVpmAndCatalogItem(store, "pkg.active", "com.example.active", "Active Tool", "active");
      seedVpmAndCatalogItem(store, "pkg.delisted", "com.example.delisted", "Delisted Tool", "delisted");

      const res = await handlePublicCatalogRequest(publicGet("/v1/catalog/delta?limit=10"), store);
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

  test("GET /v1/catalog/delta: supports keyset delta cursor pagination", async () => {
    const store = new LocalCoordinatorStore();
    try {
      seedVpmAndCatalogItem(store, "pkg.one", "com.example.pkg1", "Package 1");
      seedVpmAndCatalogItem(store, "pkg.two", "com.example.pkg2", "Package 2");
      seedVpmAndCatalogItem(store, "pkg.three", "com.example.pkg3", "Package 3");

      const page1Res = await handlePublicCatalogRequest(publicGet("/v1/catalog/delta?limit=2"), store);
      expect(page1Res.status).toBe(200);
      const page1 = CatalogDeltaResponseSchema.parse(await page1Res.json());
      expect(page1.deltas).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const decodedDeltaCursor = decodeCatalogDeltaCursor(page1.nextCursor!);
      expect(decodedDeltaCursor).not.toBeNull();

      const page2Res = await handlePublicCatalogRequest(
        publicGet(`/v1/catalog/delta?limit=2&cursor=${page1.nextCursor}`),
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

  test("Loopback HTTP: unauthenticated requests succeed on /v1/catalog and /v1/catalog/delta", async () => {
    const store = new LocalCoordinatorStore();
    try {
      seedVpmAndCatalogItem(store, "pkg.http", "com.example.http", "HTTP Package");

      server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: (request) => handlePublicCatalogRequest(request, store)
      });
      const port = server.port;

      // GET /v1/catalog without token
      const catRes = await fetch(`http://127.0.0.1:${port}/v1/catalog`);
      expect(catRes.status).toBe(200);
      const catBody = PublicCatalogListResponseSchema.parse(await catRes.json());
      expect(catBody.packages).toHaveLength(1);
      expect(catBody.packages[0].canonicalId).toBe("com.example.http");

      // GET /v1/catalog/delta without token
      const deltaRes = await fetch(`http://127.0.0.1:${port}/v1/catalog/delta`);
      expect(deltaRes.status).toBe(200);
      const deltaBody = CatalogDeltaResponseSchema.parse(await deltaRes.json());
      expect(deltaBody.deltas).toHaveLength(1);
      expect(deltaBody.deltas[0].action).toBe("upsert");
      expect(deltaBody.deltas[0].canonicalId).toBe("com.example.http");

      // Canonical API_ROUTES /v1/app/index route
      const appIndexRes = await fetch(`http://127.0.0.1:${port}/v1/app/index`);
      expect(appIndexRes.status).toBe(200);
      const appIndexBody = PublicCatalogListResponseSchema.parse(await appIndexRes.json());
      expect(appIndexBody.packages).toHaveLength(1);

      // Canonical API_ROUTES /v1/app/index/delta route
      const appDeltaRes = await fetch(`http://127.0.0.1:${port}/v1/app/index/delta`);
      expect(appDeltaRes.status).toBe(200);
      const appDeltaBody = CatalogDeltaResponseSchema.parse(await appDeltaRes.json());
      expect(appDeltaBody.deltas).toHaveLength(1);
    } finally {
      store.close();
    }
  });
});
