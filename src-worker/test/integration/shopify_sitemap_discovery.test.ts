import { describe, expect, test } from "bun:test";
import { LocalCoordinatorStore } from "../support/local_sqlite.ts";
import { handleNodeRequest } from "../../src/api/handler.ts";
import { ClaimRequestSchema, ClaimResponseSchema, ResultRequestSchema, ResultResponseSchema,
  ProtocolErrorSchema, type ResultRequest } from "vrc-packages-network/node";
import { approveFixtureSource } from "../helpers/source_access_fixture.ts";

const sitemapUrl = "https://merchant.example/sitemap_products_1.xml?from=1&to=100";
const productUrl = "https://merchant.example/products/vrchat-tool";

describe("Worker-owned Shopify discovery policy through wire payloads", () => {
  test("rejects product facts and foreign leads, then commits only pending same-origin leads", async () => {
    const store = new LocalCoordinatorStore(":memory:");
    const nodeId = "shopify-node";
    const token = store.createNodeCredential(nodeId, ["shopify"]);
    const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
    const post = (path: string, payload: unknown) => handleNodeRequest(
      new Request(`https://coordinator.invalid${path}`, {
        method: "POST", headers, body: JSON.stringify(payload)
      }), store);
    const claimRequest = ClaimRequestSchema.parse({ schemaVersion: 1, nodeId, capabilities: ["shopify"] });
    try {
      expect(() => store.seedJob(sitemapUrl, "shopify", 1000, undefined, "metadata")).toThrow();
      expect(() => store.seedJob("https://merchant.example/sitemap.xml", "shopify", 1000, undefined, "discovery")).toThrow();
      store.seedJob(sitemapUrl, "shopify", 0, undefined, "discovery");
      store.recordRobotsSnapshot("https://merchant.example", 404);
      expect(ClaimResponseSchema.parse(await (await post("/v1/node/jobs/claim", claimRequest)).json()).status).toBe("empty");
      approveFixtureSource(store, sitemapUrl, "shopify", "discovery");
      const claimed = await post("/v1/node/jobs/claim", claimRequest);
      expect(claimed.status).toBe(200);
      const claim = ClaimResponseSchema.parse(await claimed.json());
      if (claim.status !== "leased") throw new Error("Expected a Shopify sitemap lease");
      const submit = (outcome: ResultRequest["outcome"], key: string) => post("/v1/node/jobs/result",
        ResultRequestSchema.parse({ schemaVersion: 1, nodeId, jobId: claim.job.jobId,
          leaseId: claim.job.leaseId, idempotencyKey: key, outcome }));
      for (const [url, key] of [
        ["https://unrelated.example/products/copied-title", "shopify-foreign-lead-001"],
        [`${productUrl}?ref=unreviewed`, "shopify-query-lead-001"]
      ] as const) {
        const rejected = await submit({ kind: "discovery", leads: [
          { kind: "storefront_product", url }
        ] }, key);
        expect(rejected.status).toBe(409);
        expect(ProtocolErrorSchema.parse(await rejected.json()).code).toBe("conflict");
      }
      const facts = await submit({ kind: "changed", observation: {
        sourceItemKey: "shopify:fake", title: "Forged", author: "Unknown", summary: "",
        outboundLinks: [], originUpdatedAt: null
      } }, "shopify-forged-facts-001");
      expect(facts.status).toBe(409);
      expect(ProtocolErrorSchema.parse(await facts.json()).code).toBe("conflict");
      expect(store.db.query("SELECT count(*) AS n FROM source_leads").get()).toEqual({ n: 0 });
      const accepted = await submit({ kind: "discovery", leads: [
        { kind: "storefront_product", url: productUrl }
      ] }, "shopify-approved-lead-001");
      expect(accepted.status).toBe(200);
      expect(ResultResponseSchema.parse(await accepted.json())).toMatchObject({
        jobId: claim.job.jobId, status: "accepted", sourceVersionCreated: false
      });
      expect(store.db.query("SELECT count(*) AS n FROM source_items").get()).toEqual({ n: 0 });
      expect(store.db.query("SELECT count(*) AS n FROM crawl_jobs").get()).toEqual({ n: 1 });
      expect(store.db.query("SELECT kind,target_url,status FROM source_leads").all()).toEqual([
        { kind: "storefront_product", target_url: productUrl, status: "pending_review" }
      ]);
      expect(store.db.query("SELECT first_seen_node_id,first_seen_lease_id,first_seen_profile_id FROM source_leads").get())
        .toEqual({ first_seen_node_id: nodeId, first_seen_lease_id: claim.job.leaseId,
          first_seen_profile_id: store.activeSourceAccessProfileForTarget("shopify", sitemapUrl, "discovery")?.profileId });
    } finally { store.close(); }
  });
});
