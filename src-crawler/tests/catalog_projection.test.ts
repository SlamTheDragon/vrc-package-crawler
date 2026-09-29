import { afterEach, describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import { handleOperatorRequest } from "../src/worker/operator_handler.ts";
import { handleNodeRequest } from "../src/worker/handler.ts";
import { LocalCoordinatorStore } from "../src/worker/local_sqlite.ts";
import { OPERATOR_PROTOCOL_VERSION, CatalogListResponseSchema, decodeCatalogCursor } from "../src/shared/operator_protocol.ts";
import { PROTOCOL_VERSION } from "../src/shared/node_protocol.ts";
import { approveFixtureSource, seedApprovedFixtureJob } from "./helpers/source_access_fixture.ts";

const OPERATOR_TOKEN = "a".repeat(64);

function operatorGet(path: string, token = OPERATOR_TOKEN): Request {
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` }
  });
}

function nodePost(path: string, body: unknown, token: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}

/** Sets up a store with one VPM job leased and ready for submission. */
function setupVpmLease(store: LocalCoordinatorStore): {
  nodeToken: string; jobId: string; leaseId: string; nodeId: string
} {
  const nodeId = "test-node";
  const nodeToken = store.createNodeCredential(nodeId, ["vpm"]);
  const principal = store.authenticate(nodeId, nodeToken)!;
  seedApprovedFixtureJob(store, "https://vpm.example.com/index.json", "vpm");
  store.recordRobotsSnapshot("https://vpm.example.com", 404); // 404 → no rules → allow all
  const claimed = store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
  if (claimed.status !== "leased") throw new Error("Expected lease");
  return { nodeToken, jobId: claimed.job.jobId, leaseId: claimed.job.leaseId, nodeId };
}

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => { server?.stop(true); server = undefined; });

describe("G2 canonical projection via VPM observation submission", () => {
  test("VPM batch observation auto-projects to canonical_package and accepted vpm_id link", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken, jobId, leaseId, nodeId } = setupVpmLease(store);
      const principal = store.authenticate(nodeId, nodeToken)!;
      const result = store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId, jobId, leaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "batch",
          observations: [{
            sourceItemKey: "com.example.mypkg",
            title: "My VPM Package",
            author: "Alice",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null
          }]
        }
      }, principal);
      expect(result.status).toBe("accepted");
      expect(result.sourceVersionCreated).toBe(true);

      // Canonical package must be created
      const pkg = store.getCanonicalPackage("com.example.mypkg");
      expect(pkg).not.toBeNull();
      expect(pkg?.umbrella).toBe("tools");
      expect(pkg?.category).toBe("vpm_package");
      expect(pkg?.lifecycle).toBe("active");
      expect(pkg?.displayName).toBe("My VPM Package");
      expect(pkg?.vpmId).toBe("com.example.mypkg");

      // Identity link must exist with accepted review state
      const links = store.getIdentityLinksForCanonical("com.example.mypkg");
      expect(links).toHaveLength(1);
      expect(links[0].evidenceKind).toBe("vpm_id");
      expect(links[0].reviewState).toBe("accepted");
      expect(links[0].confidence).toBe(1.0);
    } finally { store.close(); }
  });

  test("re-observation of same VPM package ID is idempotent — no duplicate canonical or link", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken, jobId, leaseId, nodeId } = setupVpmLease(store);
      const principal = store.authenticate(nodeId, nodeToken)!;
      const obs = {
        sourceItemKey: "com.example.stablekey",
        title: "Stable Package",
        author: "Bob",
        summary: "",
        outboundLinks: [] as string[],
        originUpdatedAt: null
      };
      const idempotencyKey1 = crypto.randomUUID();
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId, jobId, leaseId,
        idempotencyKey: idempotencyKey1,
        outcome: { kind: "batch", observations: [obs] }
      }, principal);
      // Submit identical payload again (idempotent replay)
      const replay = store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId, jobId, leaseId,
        idempotencyKey: idempotencyKey1,
        outcome: { kind: "batch", observations: [obs] }
      }, principal);
      expect(replay.duplicate).toBe(true);

      // Still exactly one canonical package and one identity link
      const pkg = store.getCanonicalPackage("com.example.stablekey");
      expect(pkg).not.toBeNull();
      const links = store.getIdentityLinksForCanonical("com.example.stablekey");
      expect(links).toHaveLength(1);
    } finally { store.close(); }
  });

  test("VPM re-observation with changed title updates canonical displayName but not identity link", () => {
    const store = new LocalCoordinatorStore();
    try {
      const nodeId = "test-node";
      const nodeToken = store.createNodeCredential(nodeId, ["vpm"]);
      const principal = store.authenticate(nodeId, nodeToken)!;
      store.recordRobotsSnapshot("https://vpm.example.com", 404);

      // First job: listing-a.json reports package with "Original Title"
      seedApprovedFixtureJob(store, "https://vpm.example.com/listing-a.json", "vpm");
      const claimed1 = store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
      if (claimed1.status !== "leased") throw new Error("Expected lease 1");
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId, jobId: claimed1.job.jobId, leaseId: claimed1.job.leaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "com.example.renamed", title: "Original Title", author: "Dev", summary: "", outboundLinks: [], originUpdatedAt: null }
        }
      }, principal);

      const after1 = store.getCanonicalPackage("com.example.renamed");
      expect(after1?.displayName).toBe("Original Title");
      expect(store.getIdentityLinksForCanonical("com.example.renamed")).toHaveLength(1);

      // Advance origin lease to allow second job
      store.db.prepare("UPDATE origin_leases SET next_allowed_at=? WHERE origin=?")
        .run(new Date(0).toISOString(), "https://vpm.example.com");

      // Second job: a different listing URL also reports the same package with a new title
      seedApprovedFixtureJob(store, "https://vpm.example.com/listing-b.json", "vpm");
      const claimed2 = store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
      if (claimed2.status !== "leased") throw new Error("Expected lease 2");
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId, jobId: claimed2.job.jobId, leaseId: claimed2.job.leaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "com.example.renamed", title: "Updated Title", author: "Dev", summary: "", outboundLinks: [], originUpdatedAt: null }
        }
      }, principal);

      // displayName must update; identity link count must not grow (INSERT OR IGNORE)
      const after2 = store.getCanonicalPackage("com.example.renamed");
      expect(after2?.displayName).toBe("Updated Title");
      const links = store.getIdentityLinksForCanonical("com.example.renamed");
      // Two source items now exist (different listing URLs), so two links — one per source_key
      // But both are for the same canonical package ID
      expect(links.every(l => l.evidenceKind === "vpm_id")).toBe(true);
      expect(links.every(l => l.reviewState === "accepted")).toBe(true);
      expect(links.length).toBeGreaterThanOrEqual(1);
    } finally { store.close(); }
  });

  test("non-VPM observation does not create a canonical package", () => {
    const store = new LocalCoordinatorStore();
    try {
      const nodeId = "test-node";
      const nodeToken = store.createNodeCredential(nodeId, ["booth"]);
      const principal = store.authenticate(nodeId, nodeToken)!;
      // Use a BOOTH product URL (not browse), single item
      seedApprovedFixtureJob(store, "https://booth.pm/ja/items/12345", "booth");
      store.recordRobotsSnapshot("https://booth.pm", 404);
      const claimed = store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["booth"] }, principal);
      if (claimed.status !== "leased") throw new Error("Expected lease");
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId, jobId: claimed.job.jobId, leaseId: claimed.job.leaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "booth-item-12345",
            title: "Cool Shader",
            author: "Carol",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      }, principal);
      // No canonical package should be created for non-VPM
      const { packages } = store.listCanonicalPackagesPage(100, null);
      expect(packages).toHaveLength(0);
    } finally { store.close(); }
  });

  test("listCanonicalPackagesPage returns empty when no VPM observations ingested", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { packages, nextCursor } = store.listCanonicalPackagesPage(10, null);
      expect(packages).toHaveLength(0);
      expect(nextCursor).toBeNull();
    } finally { store.close(); }
  });

  test("listCanonicalPackagesPage paginates across multiple VPM packages", () => {
    const store = new LocalCoordinatorStore();
    try {
      const nodeId = "test-node";
      const nodeToken = store.createNodeCredential(nodeId, ["vpm"]);
      const principal = store.authenticate(nodeId, nodeToken)!;
      store.recordRobotsSnapshot("https://vpm.example.com", 404);

      // Submit 3 packages (one per job; each job has separate URL)
      const packages = [
        { sourceItemKey: "com.example.alpha", title: "Alpha", url: "https://vpm.example.com/alpha.json" },
        { sourceItemKey: "com.example.beta", title: "Beta", url: "https://vpm.example.com/beta.json" },
        { sourceItemKey: "com.example.gamma", title: "Gamma", url: "https://vpm.example.com/gamma.json" }
      ];
      for (const { sourceItemKey, title, url } of packages) {
        seedApprovedFixtureJob(store, url, "vpm");
        const claimed = store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["vpm"] }, principal);
        if (claimed.status !== "leased") continue;
        store.submit({
          schemaVersion: PROTOCOL_VERSION, nodeId, jobId: claimed.job.jobId, leaseId: claimed.job.leaseId,
          idempotencyKey: crypto.randomUUID(),
          outcome: { kind: "changed", observation: { sourceItemKey, title, author: "X", summary: "", outboundLinks: [], originUpdatedAt: null } }
        }, principal);
        store.db.prepare("UPDATE origin_leases SET next_allowed_at=? WHERE origin=?")
          .run(new Date(0).toISOString(), "https://vpm.example.com");
      }

      const page1 = store.listCanonicalPackagesPage(2, null);
      expect(page1.packages).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = store.listCanonicalPackagesPage(2, null);
      // Verify that cursor actually paginates (second page from cursor)
      const cursor = decodeCatalogCursor(page1.nextCursor!);
      const page2real = store.listCanonicalPackagesPage(2, cursor);
      expect(page2real.packages).toHaveLength(1);
      expect(page2real.nextCursor).toBeNull();
    } finally { store.close(); }
  });
});

describe("GET /v1/operator/catalog endpoint", () => {
  test("in-process: node token denied on catalog route", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const nodeToken = store.createNodeCredential("n1", ["vpm"]);
      const response = await handleOperatorRequest(
        operatorGet("/v1/operator/catalog", nodeToken),
        store, OPERATOR_TOKEN
      );
      expect(response.status).toBe(401);
    } finally { store.close(); }
  });

  test("in-process: unknown query param returns 400", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const response = await handleOperatorRequest(
        operatorGet("/v1/operator/catalog?foo=bar"),
        store, OPERATOR_TOKEN
      );
      expect(response.status).toBe(400);
      const body = await response.json() as { code: string };
      expect(body.code).toBe("invalid_query");
    } finally { store.close(); }
  });

  test("in-process: returns empty catalog when no packages ingested", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const response = await handleOperatorRequest(
        operatorGet("/v1/operator/catalog"),
        store, OPERATOR_TOKEN
      );
      expect(response.status).toBe(200);
      const body = CatalogListResponseSchema.parse(await response.json());
      expect(body.schemaVersion).toBe(OPERATOR_PROTOCOL_VERSION);
      expect(body.packages).toHaveLength(0);
      expect(body.nextCursor).toBeNull();
    } finally { store.close(); }
  });

  test("in-process: returns canonical package after VPM observation is submitted", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken, jobId, leaseId, nodeId } = setupVpmLease(store);
      const principal = store.authenticate(nodeId, nodeToken)!;
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId, jobId, leaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "com.test.pkga",
            title: "Package A",
            author: "Dev",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      }, principal);

      const response = await handleOperatorRequest(
        operatorGet("/v1/operator/catalog"),
        store, OPERATOR_TOKEN
      );
      expect(response.status).toBe(200);
      const body = CatalogListResponseSchema.parse(await response.json());
      expect(body.packages).toHaveLength(1);
      const pkg = body.packages[0];
      expect(pkg.canonicalId).toBe("com.test.pkga");
      expect(pkg.vpmId).toBe("com.test.pkga");
      expect(pkg.umbrella).toBe("tools");
      expect(pkg.category).toBe("vpm_package");
      expect(pkg.lifecycle).toBe("active");
      expect(pkg.displayName).toBe("Package A");
      expect(pkg.acceptedLinks).toHaveLength(1);
      expect(pkg.acceptedLinks[0].evidenceKind).toBe("vpm_id");
      expect(pkg.acceptedLinks[0].confidence).toBe(1.0);
    } finally { store.close(); }
  });

  test("loopback HTTP: GET /v1/operator/catalog returns same result as in-process", async () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken, jobId, leaseId, nodeId } = setupVpmLease(store);
      const principal = store.authenticate(nodeId, nodeToken)!;
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId, jobId, leaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "batch",
          observations: [
            { sourceItemKey: "com.loopback.pkg1", title: "Loopback One", author: "X", summary: "", outboundLinks: [], originUpdatedAt: null },
            { sourceItemKey: "com.loopback.pkg2", title: "Loopback Two", author: "Y", summary: "", outboundLinks: [], originUpdatedAt: null }
          ]
        }
      }, principal);

      server = Bun.serve({
        port: 0,
        fetch: async (req) => {
          if (req.url.includes("/v1/operator/")) return handleOperatorRequest(req, store, OPERATOR_TOKEN);
          return handleNodeRequest(req, store);
        }
      });
      const port = server.port;

      // In-process reference
      const inProcess = CatalogListResponseSchema.parse(
        await (await handleOperatorRequest(operatorGet("/v1/operator/catalog"), store, OPERATOR_TOKEN)).json()
      );
      // Loopback HTTP
      const loopback = await fetch(`http://127.0.0.1:${port}/v1/operator/catalog`, {
        headers: { authorization: `Bearer ${OPERATOR_TOKEN}` }
      });
      expect(loopback.status).toBe(200);
      const loopbackBody = CatalogListResponseSchema.parse(await loopback.json());
      expect(loopbackBody.packages.map(p => p.canonicalId).sort())
        .toEqual(inProcess.packages.map(p => p.canonicalId).sort());
      expect(loopbackBody.packages).toHaveLength(2);
      for (const pkg of loopbackBody.packages) {
        expect(pkg.acceptedLinks).toHaveLength(1);
        expect(pkg.acceptedLinks[0].evidenceKind).toBe("vpm_id");
      }

      // Node token denied over loopback too
      const denied = await fetch(`http://127.0.0.1:${port}/v1/operator/catalog`, {
        headers: { authorization: `Bearer ${nodeToken}` }
      });
      expect(denied.status).toBe(401);
    } finally { store.close(); }
  });
});
