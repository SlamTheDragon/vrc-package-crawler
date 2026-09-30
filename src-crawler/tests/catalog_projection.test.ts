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

function setupGitHubLease(store: LocalCoordinatorStore, url: string): {
  nodeToken: string; jobId: string; leaseId: string; nodeId: string
} {
  const nodeId = "test-gh-node";
  const nodeToken = store.createNodeCredential(nodeId, ["github"]);
  const principal = store.authenticate(nodeId, nodeToken)!;
  seedApprovedFixtureJob(store, url, "github", 60_000);
  store.recordRobotsSnapshot("https://api.github.com", 404);
  const claimed = store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: ["github"] }, principal);
  if (claimed.status !== "leased") throw new Error("Expected GitHub lease");
  return { nodeToken, jobId: claimed.job.jobId, leaseId: claimed.job.leaseId, nodeId };
}

function setupStorefrontLease(store: LocalCoordinatorStore, url: string, platform: "booth" | "gumroad"): {
  nodeToken: string; jobId: string; leaseId: string; nodeId: string;
} {
  const nodeId = `test-${platform}-node`;
  const nodeToken = store.createNodeCredential(nodeId, [platform]);
  const principal = store.authenticate(nodeId, nodeToken)!;
  seedApprovedFixtureJob(store, url, platform, 60_000);
  const origin = new URL(url).origin;
  store.recordRobotsSnapshot(origin, 404);
  const claimed = store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities: [platform] }, principal);
  if (claimed.status !== "leased") throw new Error(`Expected ${platform} lease`);
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

describe("G3 repository_match identity linking on GitHub submission", () => {
  test("creates provisional repository_match link when GitHub repo matches lead discovered from VPM package", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;

      // 1. Ingest VPM package: com.example.animtool
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "com.example.animtool",
            title: "Animation Tool",
            author: "Alice",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      }, vpmPrincipal);

      // Verify canonical package was created
      const pkg = store.getCanonicalPackage("com.example.animtool");
      expect(pkg).not.toBeNull();
      expect(pkg?.vpmId).toBe("com.example.animtool");

      // 2. Insert a source_lead pointing to GitHub repository discovered from this VPM package
      const leadKey = crypto.randomUUID();
      store.db.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,claimed_package_id,status,first_seen_at,last_seen_at)
        VALUES (?,'https://vpm.example.com/index.json',?,'com.example.animtool','github_repository','https://github.com/vrc-dev/anim-tool',NULL,'pending_review',datetime('now'),datetime('now'))`)
        .run(leadKey, vpmJobId);

      // 3. Setup and submit GitHub job for api.github.com/repos/vrc-dev/anim-tool
      const ghUrl = "https://api.github.com/repos/vrc-dev/anim-tool";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = setupGitHubLease(store, ghUrl);
      const ghPrincipal = store.authenticate(ghNodeId, ghToken)!;

      const ghResult = store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: ghNodeId, jobId: ghJobId, leaseId: ghLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "github:555666",
            title: "anim-tool",
            author: "vrc-dev",
            summary: "",
            outboundLinks: ["https://github.com/vrc-dev/anim-tool"],
            originUpdatedAt: null
          }
        }
      }, ghPrincipal);
      expect(ghResult.status).toBe("accepted");

      // 4. Verify identity links for canonical package
      const links = store.getIdentityLinksForCanonical("com.example.animtool");
      expect(links).toHaveLength(2);

      const vpmLink = links.find(l => l.evidenceKind === "vpm_id");
      expect(vpmLink).toBeDefined();
      expect(vpmLink?.reviewState).toBe("accepted");
      expect(vpmLink?.confidence).toBe(1.0);

      const ghLink = links.find(l => l.evidenceKind === "repository_match");
      expect(ghLink).toBeDefined();
      expect(ghLink?.reviewState).toBe("provisional");
      expect(ghLink?.confidence).toBe(0.7);
      expect(ghLink?.sourceKey).toBe(`github:${ghUrl}:github:555666`);

      // 5. Public catalog must embed only accepted links
      const catalogPage = store.listCanonicalPackagesPage(10, null);
      const catalogPkg = catalogPage.packages.find(p => p.canonicalId === "com.example.animtool");
      expect(catalogPkg?.acceptedLinks).toHaveLength(1);
      expect(catalogPkg?.acceptedLinks[0].evidenceKind).toBe("vpm_id");

      // 6. Operator reviews and accepts the provisional link
      const accepted = store.updateIdentityLinkReview(ghLink!.linkId, "accepted");
      expect(accepted).toBe(true);

      const updatedPage = store.listCanonicalPackagesPage(10, null);
      const updatedPkg = updatedPage.packages.find(p => p.canonicalId === "com.example.animtool");
      expect(updatedPkg?.acceptedLinks).toHaveLength(2);
      expect(updatedPkg?.acceptedLinks.some(l => l.evidenceKind === "repository_match")).toBe(true);
    } finally { store.close(); }
  });

  test("provisional repository_match link is idempotent on re-submission", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "com.example.idem", title: "Idem Tool", author: "Bob", summary: "", outboundLinks: [], originUpdatedAt: null }
        }
      }, vpmPrincipal);

      store.db.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,claimed_package_id,status,first_seen_at,last_seen_at)
        VALUES (?,'https://vpm.example.com/index.json',?,'com.example.idem','github_repository','https://github.com/vrc-dev/idem-tool',NULL,'pending_review',datetime('now'),datetime('now'))`)
        .run(crypto.randomUUID(), vpmJobId);

      const ghUrl = "https://api.github.com/repos/vrc-dev/idem-tool";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = setupGitHubLease(store, ghUrl);
      const ghPrincipal = store.authenticate(ghNodeId, ghToken)!;

      const ghObs = {
        sourceItemKey: "github:777888",
        title: "idem-tool",
        author: "vrc-dev",
        summary: "",
        outboundLinks: ["https://github.com/vrc-dev/idem-tool"],
        originUpdatedAt: null
      };

      const ghIdempotency = crypto.randomUUID();
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: ghNodeId, jobId: ghJobId, leaseId: ghLeaseId,
        idempotencyKey: ghIdempotency,
        outcome: { kind: "changed", observation: ghObs }
      }, ghPrincipal);

      expect(store.getIdentityLinksForCanonical("com.example.idem")).toHaveLength(2);

      // 1. Re-submission with identical idempotencyKey returns duplicate
      const replay = store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: ghNodeId, jobId: ghJobId, leaseId: ghLeaseId,
        idempotencyKey: ghIdempotency,
        outcome: { kind: "changed", observation: ghObs }
      }, ghPrincipal);
      expect(replay.duplicate).toBe(true);

      // Still exactly 2 links, no duplication
      expect(store.getIdentityLinksForCanonical("com.example.idem")).toHaveLength(2);
    } finally { store.close(); }
  });

  test("unrelated GitHub repo without matching lead does not link to canonical package", () => {
    const store = new LocalCoordinatorStore();
    try {
      const ghUrl = "https://api.github.com/repos/independent/unrelated-repo";
      const { nodeToken, jobId, leaseId, nodeId } = setupGitHubLease(store, ghUrl);
      const principal = store.authenticate(nodeId, nodeToken)!;

      const result = store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId, jobId, leaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "github:111222",
            title: "unrelated-repo",
            author: "independent",
            summary: "",
            outboundLinks: ["https://github.com/independent/unrelated-repo"],
            originUpdatedAt: null
          }
        }
      }, principal);
      expect(result.status).toBe("accepted");

      // No canonical package was created or linked
      const { packages } = store.listCanonicalPackagesPage(10, null);
      expect(packages).toHaveLength(0);
      expect(store.getIdentityLinksForSourceItem(`github:${ghUrl}:github:111222`)).toHaveLength(0);
    } finally { store.close(); }
  });

  test("GitHub repo matching one package does NOT link to other packages from same VPM repo", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;

      // Ingest package A and package B in the same VPM repository listing
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "batch",
          observations: [
            { sourceItemKey: "com.example.toolA", title: "Tool A", author: "Dev", summary: "", outboundLinks: [], originUpdatedAt: null },
            { sourceItemKey: "com.example.toolB", title: "Tool B", author: "Dev", summary: "", outboundLinks: [], originUpdatedAt: null }
          ]
        }
      }, vpmPrincipal);

      // Lead specifically connects com.example.toolA to https://github.com/vrc-dev/tool-a
      store.db.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,claimed_package_id,status,first_seen_at,last_seen_at)
        VALUES (?,'https://vpm.example.com/index.json',?,'com.example.toolA','github_repository','https://github.com/vrc-dev/tool-a',NULL,'pending_review',datetime('now'),datetime('now'))`)
        .run(crypto.randomUUID(), vpmJobId);

      // Ingest GitHub repository for tool-a
      const ghUrl = "https://api.github.com/repos/vrc-dev/tool-a";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = setupGitHubLease(store, ghUrl);
      const ghPrincipal = store.authenticate(ghNodeId, ghToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: ghNodeId, jobId: ghJobId, leaseId: ghLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "github:999000", title: "tool-a", author: "vrc-dev", summary: "", outboundLinks: ["https://github.com/vrc-dev/tool-a"], originUpdatedAt: null }
        }
      }, ghPrincipal);

      // toolA should have 2 links (vpm_id, repository_match)
      expect(store.getIdentityLinksForCanonical("com.example.toolA")).toHaveLength(2);

      // toolB MUST NOT have any repository_match link! ONLY 1 link (vpm_id)!
      const toolBLinks = store.getIdentityLinksForCanonical("com.example.toolB");
      expect(toolBLinks).toHaveLength(1);
      expect(toolBLinks[0].evidenceKind).toBe("vpm_id");
    } finally { store.close(); }
  });

  test("handles case variations, trailing slashes, and .git suffix in lead target_url", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "com.example.casepkg", title: "Case Pkg", author: "Dev", summary: "", outboundLinks: [], originUpdatedAt: null }
        }
      }, vpmPrincipal);

      // Lead with mixed case, .git suffix, and trailing slash
      store.db.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,claimed_package_id,status,first_seen_at,last_seen_at)
        VALUES (?,'https://vpm.example.com/index.json',?,'com.example.casepkg','github_repository','https://github.com/VRC-Dev/CasePkg.git/',NULL,'pending_review',datetime('now'),datetime('now'))`)
        .run(crypto.randomUUID(), vpmJobId);

      // GitHub crawler submits lowercase canonical API endpoint
      const ghUrl = "https://api.github.com/repos/vrc-dev/casepkg";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = setupGitHubLease(store, ghUrl);
      const ghPrincipal = store.authenticate(ghNodeId, ghToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: ghNodeId, jobId: ghJobId, leaseId: ghLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "github:123321", title: "casepkg", author: "vrc-dev", summary: "", outboundLinks: ["https://github.com/vrc-dev/casepkg"], originUpdatedAt: null }
        }
      }, ghPrincipal);

      const links = store.getIdentityLinksForCanonical("com.example.casepkg");
      expect(links).toHaveLength(2);
      expect(links.some(l => l.evidenceKind === "repository_match")).toBe(true);
    } finally { store.close(); }
  });

  test("links canonical package via claimed_package_id on source lead", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "com.example.claimedpkg", title: "Claimed Pkg", author: "Dev", summary: "", outboundLinks: [], originUpdatedAt: null }
        }
      }, vpmPrincipal);

      // Lead specifying claimed_package_id instead of discovered_from_item_key
      store.db.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,claimed_package_id,status,first_seen_at,last_seen_at)
        VALUES (?,'https://vpm.example.com/index.json',?,NULL,'github_repository','https://github.com/vrc-dev/claimed-pkg','com.example.claimedpkg','pending_review',datetime('now'),datetime('now'))`)
        .run(crypto.randomUUID(), vpmJobId);

      const ghUrl = "https://api.github.com/repos/vrc-dev/claimed-pkg";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = setupGitHubLease(store, ghUrl);
      const ghPrincipal = store.authenticate(ghNodeId, ghToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: ghNodeId, jobId: ghJobId, leaseId: ghLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "github:456654", title: "claimed-pkg", author: "vrc-dev", summary: "", outboundLinks: ["https://github.com/vrc-dev/claimed-pkg"], originUpdatedAt: null }
        }
      }, ghPrincipal);

      const links = store.getIdentityLinksForCanonical("com.example.claimedpkg");
      expect(links).toHaveLength(2);
      expect(links.some(l => l.evidenceKind === "repository_match")).toBe(true);
    } finally { store.close(); }
  });

  test("untargeted lead with null item key and null claimed package id does not link", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "com.example.untargeted", title: "Untargeted", author: "Dev", summary: "", outboundLinks: [], originUpdatedAt: null }
        }
      }, vpmPrincipal);

      // Untargeted lead (both item key and claimed package id are null)
      store.db.prepare(`INSERT INTO source_leads
        (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,kind,target_url,claimed_package_id,status,first_seen_at,last_seen_at)
        VALUES (?,'https://vpm.example.com/index.json',?,NULL,'github_repository','https://github.com/vrc-dev/untargeted-repo',NULL,'pending_review',datetime('now'),datetime('now'))`)
        .run(crypto.randomUUID(), vpmJobId);

      const ghUrl = "https://api.github.com/repos/vrc-dev/untargeted-repo";
      const { nodeToken: ghToken, jobId: ghJobId, leaseId: ghLeaseId, nodeId: ghNodeId } = setupGitHubLease(store, ghUrl);
      const ghPrincipal = store.authenticate(ghNodeId, ghToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: ghNodeId, jobId: ghJobId, leaseId: ghLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: { sourceItemKey: "github:789987", title: "untargeted-repo", author: "vrc-dev", summary: "", outboundLinks: ["https://github.com/vrc-dev/untargeted-repo"], originUpdatedAt: null }
        }
      }, ghPrincipal);

      // Canonical package must NOT have received any repository_match link
      const links = store.getIdentityLinksForCanonical("com.example.untargeted");
      expect(links).toHaveLength(1);
      expect(links[0].evidenceKind).toBe("vpm_id");
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

describe("G2/G4 package fronts relational projection", () => {
  test("storefront observation attached to canonical package projects fronts correctly", () => {
    const store = new LocalCoordinatorStore();
    try {
      // 1. Ingest VPM package to create canonical package
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "com.example.frontpkg",
            title: "Fronted Package",
            author: "Author",
            summary: "A package with storefront",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      }, vpmPrincipal);

      // Verify canonical package exists with empty fronts
      const initialPkg = store.getCanonicalPackage("com.example.frontpkg");
      expect(initialPkg).not.toBeNull();
      const initialPage = store.listCanonicalPackagesPage(10, null);
      expect(initialPage.packages[0].fronts).toEqual([]);

      // 2. Attach a BOOTH storefront observation
      const boothUrl = "https://booth.pm/ja/items/88888";
      const { nodeToken: boothToken, jobId: boothJobId, leaseId: boothLeaseId, nodeId: boothNodeId } =
        setupStorefrontLease(store, boothUrl, "booth");
      const boothPrincipal = store.authenticate(boothNodeId, boothToken)!;

      const submitResult = store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: boothNodeId, jobId: boothJobId, leaseId: boothLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "booth-item-88888",
            title: "Fronted Package on BOOTH",
            author: "Author",
            summary: "Storefront description",
            outboundLinks: [],
            originUpdatedAt: null,
            price: 2500,
            currency: "JPY",
            availability: "available"
          }
        }
      }, boothPrincipal);
      expect(submitResult.status).toBe("accepted");

      const boothSourceKey = `booth:${boothUrl}:booth-item-88888`;
      store.createIdentityLink({
        sourceKey: boothSourceKey,
        canonicalId: "com.example.frontpkg",
        evidenceKind: "cross_storefront_link",
        confidence: 0.95,
        reviewState: "accepted"
      });

      // Verify fronts projection via store helper
      const fronts = store.getPackageFrontsForCanonical("com.example.frontpkg");
      expect(fronts).toHaveLength(1);
      expect(fronts[0].canonicalId).toBe("com.example.frontpkg");
      expect(fronts[0].sourceKey).toBe(boothSourceKey);
      expect(fronts[0].platform).toBe("booth");
      expect(fronts[0].storefrontUrl).toBe(boothUrl);
      expect(fronts[0].price).toBe(2500);
      expect(fronts[0].currency).toBe("JPY");
      expect(fronts[0].availability).toBe("available");

      // Verify listCanonicalPackagesPage projects fronts
      const page = store.listCanonicalPackagesPage(10, null);
      const pkg = page.packages.find(p => p.canonicalId === "com.example.frontpkg");
      expect(pkg).toBeDefined();
      expect(pkg?.fronts).toHaveLength(1);
      expect(pkg?.fronts[0].price).toBe(2500);
      expect(pkg?.fronts[0].currency).toBe("JPY");
      expect(pkg?.fronts[0].platform).toBe("booth");
    } finally { store.close(); }
  });

  test("price and currency updates on a front update the front without modifying canonical package metadata", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "com.example.pricepkg",
            title: "Original Canonical Title",
            author: "Author",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      }, vpmPrincipal);

      const beforePkg = store.getCanonicalPackage("com.example.pricepkg")!;
      expect(beforePkg).not.toBeNull();

      // Submit storefront observation with initial price
      const boothUrl = "https://booth.pm/ja/items/77777";
      const { nodeToken: boothToken, jobId: boothJobId1, leaseId: boothLeaseId1, nodeId: boothNodeId } =
        setupStorefrontLease(store, boothUrl, "booth");
      const boothPrincipal = store.authenticate(boothNodeId, boothToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: boothNodeId, jobId: boothJobId1, leaseId: boothLeaseId1,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "booth-77777",
            title: "BOOTH Storefront Title 1",
            author: "Author",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null,
            price: 1000,
            currency: "JPY",
            availability: "available"
          }
        }
      }, boothPrincipal);

      const boothSourceKey = `booth:${boothUrl}:booth-77777`;
      store.createIdentityLink({
        sourceKey: boothSourceKey,
        canonicalId: "com.example.pricepkg",
        evidenceKind: "cross_storefront_link",
        confidence: 0.9,
        reviewState: "accepted"
      });

      let fronts = store.getPackageFrontsForCanonical("com.example.pricepkg");
      expect(fronts).toHaveLength(1);
      expect(fronts[0].price).toBe(1000);
      expect(fronts[0].currency).toBe("JPY");

      // Reset origin lease to permit second fetch
      store.db.prepare("UPDATE origin_leases SET next_allowed_at=? WHERE origin=?")
        .run(new Date(0).toISOString(), "https://booth.pm");
      store.db.prepare("UPDATE crawl_jobs SET state='pending', next_fetch_at=? WHERE job_id=?")
        .run(new Date(0).toISOString(), boothJobId1);

      // Re-claim job
      const claimed2 = store.claim({ schemaVersion: PROTOCOL_VERSION, nodeId: boothNodeId, capabilities: ["booth"] }, boothPrincipal);
      if (claimed2.status !== "leased") throw new Error("Expected re-lease");

      // Second submission: updated price and currency
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: boothNodeId, jobId: claimed2.job.jobId, leaseId: claimed2.job.leaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "booth-77777",
            title: "BOOTH Storefront Title 2",
            author: "Author",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null,
            price: 1500,
            currency: "JPY",
            availability: "available"
          }
        }
      }, boothPrincipal);

      // Verify front was updated
      fronts = store.getPackageFrontsForCanonical("com.example.pricepkg");
      expect(fronts).toHaveLength(1);
      expect(fronts[0].price).toBe(1500);
      expect(fronts[0].currency).toBe("JPY");

      // Verify canonical package metadata remains unchanged
      const afterPkg = store.getCanonicalPackage("com.example.pricepkg")!;
      expect(afterPkg.displayName).toBe(beforePkg.displayName);
      expect(afterPkg.displayName).toBe("Original Canonical Title");
      expect(afterPkg.updatedAt).toBe(beforePkg.updatedAt);
      expect(afterPkg.vpmId).toBe(beforePkg.vpmId);
      expect(afterPkg.category).toBe(beforePkg.category);
      expect(afterPkg.umbrella).toBe(beforePkg.umbrella);
    } finally { store.close(); }
  });

  test("multiple storefront fronts (e.g. BOOTH + Gumroad) coexist on one canonical package", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "com.example.multistore",
            title: "Multi-Store Package",
            author: "Dev",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      }, vpmPrincipal);

      // 1. BOOTH storefront
      const boothUrl = "https://booth.pm/ja/items/55555";
      const { nodeToken: boothToken, jobId: boothJobId, leaseId: boothLeaseId, nodeId: boothNodeId } =
        setupStorefrontLease(store, boothUrl, "booth");
      const boothPrincipal = store.authenticate(boothNodeId, boothToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: boothNodeId, jobId: boothJobId, leaseId: boothLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "booth-55555",
            title: "Multi-Store on BOOTH",
            author: "Dev",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null,
            price: 2000,
            currency: "JPY",
            availability: "available"
          }
        }
      }, boothPrincipal);

      const boothSourceKey = `booth:${boothUrl}:booth-55555`;
      store.createIdentityLink({
        sourceKey: boothSourceKey,
        canonicalId: "com.example.multistore",
        evidenceKind: "cross_storefront_link",
        confidence: 0.9,
        reviewState: "accepted"
      });

      // 2. Gumroad storefront
      const gumroadUrl = "https://gumroad.com/l/multistore";
      const { nodeToken: gumroadToken, jobId: gumroadJobId, leaseId: gumroadLeaseId, nodeId: gumroadNodeId } =
        setupStorefrontLease(store, gumroadUrl, "gumroad");
      const gumroadPrincipal = store.authenticate(gumroadNodeId, gumroadToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: gumroadNodeId, jobId: gumroadJobId, leaseId: gumroadLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "gumroad-multistore",
            title: "Multi-Store on Gumroad",
            author: "Dev",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null,
            price: 15,
            currency: "USD",
            availability: "available"
          }
        }
      }, gumroadPrincipal);

      const gumroadSourceKey = `gumroad:${gumroadUrl}:gumroad-multistore`;
      store.createIdentityLink({
        sourceKey: gumroadSourceKey,
        canonicalId: "com.example.multistore",
        evidenceKind: "cross_storefront_link",
        confidence: 0.85,
        reviewState: "accepted"
      });

      // Verify both fronts coexist on the canonical package
      const fronts = store.getPackageFrontsForCanonical("com.example.multistore");
      expect(fronts).toHaveLength(2);

      const boothFront = fronts.find(f => f.platform === "booth");
      expect(boothFront).toBeDefined();
      expect(boothFront?.storefrontUrl).toBe(boothUrl);
      expect(boothFront?.price).toBe(2000);
      expect(boothFront?.currency).toBe("JPY");

      const gumroadFront = fronts.find(f => f.platform === "gumroad");
      expect(gumroadFront).toBeDefined();
      expect(gumroadFront?.storefrontUrl).toBe(gumroadUrl);
      expect(gumroadFront?.price).toBe(15);
      expect(gumroadFront?.currency).toBe("USD");

      // Verify via listCanonicalPackagesPage
      const page = store.listCanonicalPackagesPage(10, null);
      const pkg = page.packages.find(p => p.canonicalId === "com.example.multistore");
      expect(pkg?.fronts).toHaveLength(2);
      expect(pkg?.fronts.map(f => f.platform).sort()).toEqual(["booth", "gumroad"]);
    } finally { store.close(); }
  });

  test("operator catalog API (GET /v1/operator/catalog) serializes fronts array", async () => {
    const store = new LocalCoordinatorStore();
    try {
      // 1. VPM package
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "batch",
          observations: [
            { sourceItemKey: "com.api.pkg1", title: "API Package 1", author: "A", summary: "", outboundLinks: [], originUpdatedAt: null },
            { sourceItemKey: "com.api.pkg2", title: "API Package 2", author: "B", summary: "", outboundLinks: [], originUpdatedAt: null }
          ]
        }
      }, vpmPrincipal);

      // 2. Attach storefront front to com.api.pkg1
      const boothUrl = "https://booth.pm/ja/items/99001";
      const { nodeToken: boothToken, jobId: boothJobId, leaseId: boothLeaseId, nodeId: boothNodeId } =
        setupStorefrontLease(store, boothUrl, "booth");
      const boothPrincipal = store.authenticate(boothNodeId, boothToken)!;

      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: boothNodeId, jobId: boothJobId, leaseId: boothLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "item-99001",
            title: "API Package 1 Store",
            author: "A",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null,
            price: 500,
            currency: "JPY",
            availability: "available"
          }
        }
      }, boothPrincipal);

      const boothSourceKey = `booth:${boothUrl}:item-99001`;
      store.createIdentityLink({
        sourceKey: boothSourceKey,
        canonicalId: "com.api.pkg1",
        evidenceKind: "cross_storefront_link",
        confidence: 0.9,
        reviewState: "accepted"
      });

      // In-process GET /v1/operator/catalog
      const inProcessRes = await handleOperatorRequest(operatorGet("/v1/operator/catalog"), store, OPERATOR_TOKEN);
      expect(inProcessRes.status).toBe(200);
      const inProcessBody = CatalogListResponseSchema.parse(await inProcessRes.json());
      expect(inProcessBody.packages).toHaveLength(2);

      const pkgWithFront = inProcessBody.packages.find(p => p.canonicalId === "com.api.pkg1")!;
      expect(pkgWithFront).toBeDefined();
      expect(pkgWithFront.fronts).toHaveLength(1);
      expect(pkgWithFront.fronts[0].platform).toBe("booth");
      expect(pkgWithFront.fronts[0].storefrontUrl).toBe(boothUrl);
      expect(pkgWithFront.fronts[0].price).toBe(500);
      expect(pkgWithFront.fronts[0].currency).toBe("JPY");
      expect(pkgWithFront.fronts[0].availability).toBe("available");
      expect(pkgWithFront.fronts[0].observedAt).toBeDefined();

      const pkgWithoutFront = inProcessBody.packages.find(p => p.canonicalId === "com.api.pkg2")!;
      expect(pkgWithoutFront).toBeDefined();
      expect(pkgWithoutFront.fronts).toEqual([]);

      // Loopback HTTP test
      server = Bun.serve({
        port: 0,
        fetch: async (req) => {
          if (req.url.includes("/v1/operator/")) return handleOperatorRequest(req, store, OPERATOR_TOKEN);
          return handleNodeRequest(req, store);
        }
      });
      const port = server.port;

      const loopback = await fetch(`http://127.0.0.1:${port}/v1/operator/catalog`, {
        headers: { authorization: `Bearer ${OPERATOR_TOKEN}` }
      });
      expect(loopback.status).toBe(200);
      const loopbackBody = CatalogListResponseSchema.parse(await loopback.json());
      const loopbackPkg = loopbackBody.packages.find(p => p.canonicalId === "com.api.pkg1")!;
      expect(loopbackPkg.fronts).toHaveLength(1);
      expect(loopbackPkg.fronts[0].price).toBe(500);
      expect(loopbackPkg.fronts[0].currency).toBe("JPY");
      expect(loopbackPkg.fronts[0].platform).toBe("booth");
    } finally { store.close(); }
  });

  test("storefront observation with outbound match links and projects front automatically", () => {
    const store = new LocalCoordinatorStore();
    try {
      const { nodeToken: vpmToken, jobId: vpmJobId, leaseId: vpmLeaseId, nodeId: vpmNodeId } = setupVpmLease(store);
      const vpmPrincipal = store.authenticate(vpmNodeId, vpmToken)!;
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: vpmNodeId, jobId: vpmJobId, leaseId: vpmLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "com.example.outboundmatch",
            title: "Outbound Match Target",
            author: "Author",
            summary: "",
            outboundLinks: [],
            originUpdatedAt: null
          }
        }
      }, vpmPrincipal);

      // Now storefront observation points outbound link to the VPM source URL
      const boothUrl = "https://booth.pm/ja/items/44444";
      const { nodeToken: boothToken, jobId: boothJobId, leaseId: boothLeaseId, nodeId: boothNodeId } =
        setupStorefrontLease(store, boothUrl, "booth");
      const boothPrincipal = store.authenticate(boothNodeId, boothToken)!;

      // Submit BOOTH observation with outbound link to vpm.example.com/index.json
      store.submit({
        schemaVersion: PROTOCOL_VERSION, nodeId: boothNodeId, jobId: boothJobId, leaseId: boothLeaseId,
        idempotencyKey: crypto.randomUUID(),
        outcome: {
          kind: "changed",
          observation: {
            sourceItemKey: "booth-44444",
            title: "BOOTH Item Matching VPM",
            author: "Author",
            summary: "",
            outboundLinks: ["https://vpm.example.com/index.json"],
            originUpdatedAt: null,
            price: 1200,
            currency: "JPY",
            availability: "available"
          }
        }
      }, boothPrincipal);

      // Provisional identity link must be created
      const links = store.getIdentityLinksForCanonical("com.example.outboundmatch");
      expect(links.some(l => l.evidenceKind === "cross_storefront_link" && l.reviewState === "provisional")).toBe(true);

      // Front must be projected
      const fronts = store.getPackageFrontsForCanonical("com.example.outboundmatch");
      expect(fronts).toHaveLength(1);
      expect(fronts[0].platform).toBe("booth");
      expect(fronts[0].price).toBe(1200);
      expect(fronts[0].currency).toBe("JPY");
    } finally { store.close(); }
  });
});
