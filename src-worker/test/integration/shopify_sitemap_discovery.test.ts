import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../support/local_sqlite.ts";
import { handleNodeRequest } from "../../src/api/handler.ts";
import { CoordinatorClient } from "../../../src-crawler/src/client/node_client.js";
import { runLeasedJob } from "../../../src-crawler/src/runner/lease_runner.js";
import { fetchJobOutcome } from "../../../src-crawler/src/adapters/observation_adapter.js";
import { CrawlJobSchema } from "../../../src-crawler/src/shared/protocol/node_protocol.js";
import { approveFixtureSource } from "../helpers/source_access_fixture.ts";

const sitemapUrl = "https://merchant.example/sitemap_products_1.xml?from=1&to=100";
const productUrl = "https://merchant.example/products/vrchat-tool";
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${productUrl}</loc></url>
  <url><loc>${productUrl}</loc></url>
  <url><loc>https://unrelated.example/products/copied-title</loc></url>
  <url><loc>https://merchant.example/collections/avatars</loc></url>
</urlset>`;

describe("coordinator-leased Shopify product sitemap discovery", () => {
  test("requires a product-sitemap discovery lease before any fetch and bounds leads", async () => {
    const job = CrawlJobSchema.parse({ jobId: "shopify-test", leaseId: crypto.randomUUID(),
      platform: "shopify", purpose: "discovery", url: sitemapUrl, origin: "https://merchant.example",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z", retainClasses: ["normalized_facts"],
      etag: null, lastModified: null });
    let accept = "";
    expect(await fetchJobOutcome(job, async (_input, init) => {
      accept = new Headers(init?.headers).get("accept") || "";
      return new Response(xml, { headers: { "content-type": "application/xml" } });
    })).toEqual({ kind: "discovery", leads: [
      { kind: "storefront_product", url: productUrl }
    ] });
    expect(accept).toContain("application/xml");
    for (const invalid of [{ ...job, purpose: "metadata" as const },
      { ...job, url: "https://merchant.example/sitemap.xml" }]) {
      expect((await fetchJobOutcome(invalid, async () => {
        throw new Error("Invalid Shopify job reached network");
      })).kind).toBe("blocked");
    }
    const many = `<urlset>${Array.from({ length: 101 }, (_, index) =>
      `<url><loc>https://merchant.example/products/item-${index}</loc></url>`).join("")}</urlset>`;
    expect((await fetchJobOutcome(job, async () => new Response(many,
      { headers: { "content-type": "application/xml" } }))).kind).toBe("temporary_failure");
    for (const bad of ["<sitemapindex><sitemap><loc>https://merchant.example/sitemap_products_2.xml</loc></sitemap></sitemapindex>",
      `<!DOCTYPE urlset [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><urlset><url><loc>${productUrl}</loc></url></urlset>`,
      `<urlset><url><loc>${productUrl}</loc></url>`]) {
      expect((await fetchJobOutcome(job, async () => new Response(bad,
        { headers: { "content-type": "application/xml" } }))).kind).toBe("temporary_failure");
    }
    expect((await fetchJobOutcome(job, async () => new Response(xml,
      { headers: { "content-type": "text/html" } }))).kind).toBe("temporary_failure");
  });

  test("rejects forged product facts and foreign leads, then persists only pending same-origin leads", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    const token = store.createNodeCredential("shopify-node", ["shopify"]);
    expect(() => store.seedJob(sitemapUrl, "shopify", 1000, undefined, "metadata")).toThrow();
    expect(() => store.seedJob("https://merchant.example/sitemap.xml", "shopify", 1000, undefined, "discovery")).toThrow();
    store.seedJob(sitemapUrl, "shopify", 0, undefined, "discovery");
    store.recordRobotsSnapshot("https://merchant.example", 404);
    const server = Bun.serve({ port: 0, fetch: request => handleNodeRequest(request, store) });
    try {
      const client = new CoordinatorClient(server.url.href, token, "shopify-node", ["shopify"]);
      expect((await client.claim()).status).toBe("empty");
      approveFixtureSource(store, sitemapUrl, "shopify", "discovery");
      const claim = await client.claim();
      if (claim.status !== "leased") throw new Error("Expected a Shopify sitemap lease");
      await expect(client.submit({ jobId: claim.job.jobId, leaseId: claim.job.leaseId,
        idempotencyKey: "shopify-forged-lead-001", outcome: { kind: "discovery", leads: [
          { kind: "storefront_product", url: "https://unrelated.example/products/copied-title" }
        ] } })).rejects.toThrow("Coordinator 409");
      const forged = { schemaVersion: 1, nodeId: "shopify-node", jobId: claim.job.jobId,
        leaseId: claim.job.leaseId, idempotencyKey: "shopify-forged-parity-001",
        outcome: { kind: "discovery", leads: [{ kind: "storefront_product",
          url: "https://unrelated.example/products/copied-title" }] } };
      const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
      const internal = await handleNodeRequest(new Request("http://localhost/v1/node/jobs/result",
        { method: "POST", headers, body: JSON.stringify(forged) }), store);
      expect(internal.status).toBe(409);
      expect(await internal.json()).toMatchObject({ schemaVersion: 1, code: "conflict" });
      await expect(client.submit({ jobId: claim.job.jobId, leaseId: claim.job.leaseId,
        idempotencyKey: "shopify-forged-query-lead-001", outcome: { kind: "discovery", leads: [
          { kind: "storefront_product", url: `${productUrl}?ref=unreviewed` }
        ] } })).rejects.toThrow("Coordinator 409");
      await expect(client.submit({ jobId: claim.job.jobId, leaseId: claim.job.leaseId,
        idempotencyKey: "shopify-forged-facts-001", outcome: { kind: "changed", observation: {
          sourceItemKey: "shopify:fake", title: "Forged", author: "Unknown", summary: "",
          outboundLinks: [], originUpdatedAt: null
        } } })).rejects.toThrow("Coordinator 409");
      const { outcome, result } = await runLeasedJob(claim.job, client, async () => new Response(xml,
        { headers: { "content-type": "application/xml" } }), 10);
      expect(outcome).toEqual({ kind: "discovery", leads: [{ kind: "storefront_product", url: productUrl }] });
      expect(result.status).toBe("accepted");
      expect(result.sourceVersionCreated).toBe(false);
      expect(store.db.query("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      expect(store.db.query("SELECT count(*) AS n FROM crawl_jobs").get()).toEqual({ n: 1 });
      expect(store.db.query("SELECT kind,target_url,status FROM source_leads").all()).toEqual([
        { kind: "storefront_product", target_url: productUrl, status: "pending_review" }
      ]);
      expect(store.db.query("SELECT first_seen_node_id,first_seen_lease_id,first_seen_profile_id FROM source_leads").get())
        .toEqual({ first_seen_node_id: "shopify-node", first_seen_lease_id: claim.job.leaseId,
          first_seen_profile_id: store.activeSourceAccessProfileForTarget("shopify", sitemapUrl, "discovery")?.profileId });
    } finally { server.stop(); store.close(); }
  });
});
