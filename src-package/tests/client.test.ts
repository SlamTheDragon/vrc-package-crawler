import { describe, it, expect } from "bun:test";
import { VRCPackageClient, VRCPApiError } from "../src/client.ts";
import { encodeLeadCursor, decodeLeadCursor } from "../src/protocol/operator.ts";
import { encodeCatalogCursor } from "../src/types/package.ts";
import { encodeCatalogDeltaCursor } from "../src/protocol/catalog.ts";

describe("VRCPackageClient SDK", () => {
  it("reads owned app metadata through user-authenticated GET routes", async () => {
    const app = { appId: "00000000-0000-4000-8000-000000000002", appName: "Owned app",
      permissions: ["catalog:search"], createdAt: "2026-10-01T00:00:00.000Z", revokedAt: null };
    const client = new VRCPackageClient({ baseUrl: "https://worker.example", userToken: "fixture-user",
      fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        expect(request.method).toBe("GET");
        expect(request.headers.get("authorization")).toBe("Bearer fixture-user");
        expect(request.body).toBeNull();
        return Response.json(new URL(request.url).pathname.endsWith(app.appId)
          ? { schemaVersion: 1, app } : { schemaVersion: 1, apps: [app], nextCursor: null });
      }, { preconnect() {} }) });
    expect((await client.user.apps.list()).apps).toEqual([app]);
    expect((await client.user.apps.get(app.appId)).app).toEqual(app);
    expect("registerApp" in client.user).toBe(false);
  });
  it("rejects anonymous app registration before transport", async () => {
    let calls = 0;
    const client = new VRCPackageClient({ baseUrl: "https://worker.example",
      fetch: Object.assign(async () => { calls++; return Response.json({}); }, { preconnect() {} }) });
    await expect(client.app.register({ schemaVersion: 1, appName: "Anonymous app" })).rejects.toThrow(VRCPApiError);
    expect(calls).toBe(0);
  });
  it("preserves HTTP errors when the response body is not JSON", async () => {
    for (const body of ["Service unavailable", "<html>Upstream unavailable</html>", "", "{broken"]) {
      const client = new VRCPackageClient({
        baseUrl: "https://worker.example",
        operatorToken: "a".repeat(64),
        fetch: Object.assign(async () => new Response(body, { status: 503 }), { preconnect() {} })
      });
      try {
        await client.operator.init();
        throw new Error("Expected HTTP failure");
      } catch (error) {
        expect(error).toBeInstanceOf(VRCPApiError);
        expect((error as VRCPApiError).status).toBe(503);
        expect((error as VRCPApiError).message).toBe("Request failed with status 503");
        expect((error as VRCPApiError).details).toBe(body);
      }
    }
  });
  it("requires operator auth for initialization and validates responses", async () => {
    let calls = 0;
    const fetchFn: typeof fetch = Object.assign(async () => {
      calls++;
      return Response.json({ status: "ok", message: "Schema initialized", autoSeed: true });
    }, { preconnect() {} });
    const anonymous = new VRCPackageClient({ baseUrl: "https://worker.example", fetch: fetchFn });
    await expect(anonymous.operator.init()).rejects.toThrow(VRCPApiError);
    expect(calls).toBe(0);
    const operator = new VRCPackageClient({ baseUrl: "https://worker.example", operatorToken: "a".repeat(64), fetch: fetchFn });
    await expect(operator.operator.init()).rejects.toThrow();
    expect(calls).toBe(1);
  });
  const dummyAppToken = "vrcp_app_" + "a".repeat(64);
  const dummyUserToken = "vrcp_usr_" + "b".repeat(64);

  it("queries the public package index without auth", async () => {
    let requestedUrl = "";
    const cursor = encodeCatalogCursor({ createdAt: "2026-10-01T10:00:00.000Z", canonicalId: "item-2" });
    const nextCursor = encodeCatalogCursor({ createdAt: "2026-10-01T10:00:00.000Z", canonicalId: "item-1" });
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify({
        schemaVersion: 1,
        packages: [
          {
            canonicalId: "item-1",
            umbrella: "tools",
            category: "companion_client",
            lifecycle: "active",
            displayName: "Test Client",
            vpmId: null,
            createdAt: "2026-10-01T10:00:00.000Z",
            updatedAt: "2026-10-01T10:00:00.000Z",
            acceptedLinks: [],
            fronts: []
          }
        ],
        nextCursor
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      fetch: mockFetch as typeof fetch
    });

    const res = await client.index.query({ limit: 100, cursor });
    expect(requestedUrl).toContain("/v1/app/index?");
    expect(requestedUrl).toContain("limit=100");
    expect(new URL(requestedUrl).searchParams.get("cursor")).toBe(cursor);
    expect([...new URL(requestedUrl).searchParams.keys()].sort()).toEqual(["cursor", "limit"]);
    expect(res.schemaVersion).toBe(1);
    expect(res.nextCursor).toBe(nextCursor);
    expect("count" in res).toBe(false);
    expect(res.packages.length).toBe(1);
    expect(res.packages[0]?.canonicalId).toBe("item-1");
  });

  it("executes bounded search with app auth and queryOrigin", async () => {
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: any;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({
        schemaVersion: 1,
        items: [],
        nextCursor: null,
        totalEstimated: 0
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      appToken: dummyAppToken,
      fetch: mockFetch as typeof fetch
    });

    const res = await client.index.search({
      query: "kikyo dress",
      queryOrigin: "user_authored",
      limit: 10,
      cursor: "opaque-search-cursor"
    });

    expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe(`Bearer ${dummyAppToken}`);
    expect(capturedBody.queryOrigin).toBe("user_authored");
    expect(capturedBody.query).toBe("kikyo dress");
    expect(capturedBody.cursor).toBe("opaque-search-cursor");
    expect(capturedBody.limit).toBe(10);
    expect(res.schemaVersion).toBe(1);
  });

  it("throws VRCPApiError if search is called without appToken", async () => {
    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example"
    });

    await expect(
      client.index.search({ query: "foo", queryOrigin: "app_automated" })
    ).rejects.toThrow(VRCPApiError);
  });

  it("synchronizes delta updates", async () => {
    const cursor = encodeCatalogDeltaCursor({ updatedAt: "2026-10-01T12:00:00.000Z", canonicalId: "item-delta-0" });
    let requestedUrl = "";
    const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify({
        schemaVersion: 1,
        epoch: "epoch-1",
        deltas: [
          {
            action: "upsert",
            canonicalId: "item-delta-1",
            updatedAt: "2026-10-01T12:00:00.000Z"
          }
        ],
        nextCursor: "cursor-next"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      fetch: mockFetch as typeof fetch
    });

    const res = await client.index.syncDeltas({ cursor });
    expect(new URL(requestedUrl).pathname).toBe("/v1/app/index/delta");
    expect(new URL(requestedUrl).searchParams.get("cursor")).toBe(cursor);
    expect(new URL(requestedUrl).searchParams.get("limit")).toBe("50");
    expect(res.epoch).toBe("epoch-1");
    expect(res.deltas.length).toBe(1);
  });

  it("submits reports with appToken", async () => {
    let capturedHeaders: HeadersInit | undefined;
    const testReportId = crypto.randomUUID();
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      expect(new URL(input.toString()).pathname).toBe("/v1/app/report");
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({
        schemaVersion: 1,
        status: "accepted",
        reportId: testReportId,
        recordedAt: "2026-10-01T12:00:00.000Z"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      appToken: dummyAppToken,
      fetch: mockFetch as typeof fetch
    });

    const res = await client.reports.submit({
      schemaVersion: 1,
      reportType: "demand_signal",
      signalKind: "search_miss",
      query: "rare tool"
    });

    expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe(`Bearer ${dummyAppToken}`);
    expect(res.status).toBe("accepted");
  });

  it("does not expose the retired user delisting method", () => {
    const client = new VRCPackageClient({ baseUrl: "https://worker.example" });
    expect("delist" in client.user).toBe(false);
  });

  it("rejects malformed public index receipts instead of accepting compatibility fallbacks", async () => {
    const valid = { schemaVersion: 1, packages: [], nextCursor: null };
    for (const body of [{ packages: [] }, { items: [], count: 0 }, { ...valid, count: 0 },
      { ...valid, schemaVersion: 2 }, { ...valid, packages: [{}] }, { ...valid, nextCursor: "bad!cursor" }]) {
      const client = new VRCPackageClient({ baseUrl: "https://worker.example",
        fetch: Object.assign(async () => Response.json(body), { preconnect() {} }) });
      await expect(client.index.query()).rejects.toThrow();
    }
  });

  it("rejects unsupported public options and invalid paging before transport", async () => {
    let calls = 0;
    const client = new VRCPackageClient({ baseUrl: "https://worker.example",
      fetch: Object.assign(async () => { calls++; return Response.json({ schemaVersion: 1,
        packages: [], nextCursor: null }); }, { preconnect() {} }) });
    for (const params of [{ query: "filter" }, { umbrella: "tools" }, { category: "tool" },
      { platform: "vpm" }, { tags: ["vpm"] }, { limit: 0 }, { limit: 101 }, { limit: 1.5 },
      { limit: NaN }, { limit: "10" }, { cursor: "invalid!" }, { cursor: "YWJj" }, { cursor: "" }]) {
      await expect(client.index.query(params as Parameters<typeof client.index.query>[0])).rejects.toThrow();
    }
    expect(calls).toBe(0);
  });

  it("does not expose random sampling in the SDK", () => {
    const client = new VRCPackageClient({ baseUrl: "https://worker.example" });
    expect("random" in client.index).toBe(false);
  });

  it("registers downstream apps via client.app.register", async () => {
    let capturedHeaders: HeadersInit | undefined;
    const testAppId = crypto.randomUUID();
    const testAppToken = "vrcp_app_" + "f".repeat(64);
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({
        schemaVersion: 1,
        appId: testAppId,
        appName: "Test Client",
        appToken: testAppToken,
        permissions: ["catalog_read"]
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      userToken: dummyUserToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const res = await client.app.register({
      schemaVersion: 1,
      appName: "Test Client"
    });

    expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe(`Bearer ${dummyUserToken}`);
    expect(res.appToken).toBe(testAppToken);
  });

  it("unwraps API error responses into VRCPApiError", async () => {
    const mockFetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({
        error: "FORBIDDEN",
        message: "Invalid capability"
      }), { status: 403, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      userToken: dummyUserToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    try {
      await client.user.apps.list();
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err instanceof VRCPApiError).toBe(true);
      const apiErr = err as VRCPApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.message).toBe("Invalid capability");
      expect(apiErr.code).toBe("FORBIDDEN");
    }
  });

  it("does not expose retired user node provisioning", () => {
    const client = new VRCPackageClient({ baseUrl: "https://worker.example", userToken: dummyUserToken });
    expect("registerNode" in client.user).toBe(false);
  });

  it("exercises operator leads: list, approve, and reject", async () => {
    const operatorToken = "e".repeat(64);
    let requestedPath = "";

    const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
      requestedPath = input.toString();

      if (requestedPath.includes("/v1/operator/leads?") || requestedPath.endsWith("/v1/operator/leads")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          leads: [
            {
              lead_key: "a".repeat(64),
              kind: "vpm_listing",
              target_url: "https://example.com/vpm.json",
              first_seen_at: "2026-10-01T10:00:00.000Z",
              last_seen_at: "2026-10-01T10:00:00.000Z",
              status: "pending_review",
              claimed_package_id: null,
              discovered_from_url: "https://example.com/catalog",
              discovered_from_item_key: null
            }
          ],
          nextCursor: null
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (requestedPath.includes("/approve")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          leadKey: "a".repeat(64),
          status: "approved",
          jobId: "job-101"
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (requestedPath.includes("/reject")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          leadKey: "a".repeat(64),
          status: "rejected"
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      return new Response("Not found", { status: 404 });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      operatorToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const listRes = await client.operator.leads.list({ status: "pending_review" });
    expect(listRes.leads.length).toBe(1);
    expect(requestedPath).toContain("status=pending_review");

    const approveRes = await client.operator.leads.approve("a".repeat(64), { reason: "Approved manually" });
    expect(approveRes.status).toBe("approved");
    if (approveRes.status === "approved") {
      expect(approveRes.jobId).toBe("job-101");
    }

    const rejectRes = await client.operator.leads.reject("a".repeat(64), { reason: "Irrelevant" });
    expect(rejectRes.status).toBe("rejected");
  });

  it("parses coordinator snake_case wire responses for operator leads and decodes cursors", async () => {
    const operatorToken = "e".repeat(64);
    const coordCursor = encodeLeadCursor({
      status: "pending_review",
      firstSeenAt: "2026-10-01T10:00:00.000Z",
      leadKey: "b".repeat(64)
    });
    const mockFetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({
        schemaVersion: 1,
        leads: [
          {
            lead_key: "b".repeat(64),
            kind: "vpm_listing",
            target_url: "https://example.com/feed.json",
            claimed_package_id: null,
            discovered_from_url: "https://example.com",
            discovered_from_item_key: null,
            status: "pending_review",
            first_seen_at: "2026-10-01T10:00:00.000Z",
            last_seen_at: "2026-10-01T10:00:00.000Z"
          }
        ],
        nextCursor: coordCursor
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      operatorToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const res = await client.operator.leads.list({ status: "pending_review" });
    expect(res.leads.length).toBe(1);
    expect(res.leads[0].lead_key).toBe("b".repeat(64));
    expect(res.leads[0].kind).toBe("vpm_listing");
    expect(res.leads[0].target_url).toBe("https://example.com/feed.json");
    expect("leadKey" in res.leads[0]).toBe(false);
    expect(res.nextCursor).toBe(coordCursor);

    const decoded = decodeLeadCursor(res.nextCursor!, "pending_review");
    expect(decoded).not.toBeNull();
    expect(decoded?.leadKey).toBe("b".repeat(64));
  });

  it("exercises operator source profiles: list, create, and disable", async () => {
    const operatorToken = "e".repeat(64);
    const mockProfile = {
      schemaVersion: 1,
      profileId: crypto.randomUUID(),
      platform: "booth" as const,
      origin: "https://booth.pm",
      pathScope: "/ja/items/",
      method: "GET" as const,
      purpose: "metadata" as const,
      minDelayMs: 2000,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-2026-BOOTH",
      reason: "Permitted storefront ingestion",
      retainClasses: ["normalized_facts" as const],
      publishClasses: ["normalized_facts" as const],
      createdAt: "2026-10-01T10:00:00.000Z",
      disabledAt: null
    };

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      if (url.includes("/disable")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          profile: { ...mockProfile, disabledAt: "2026-10-01T12:00:00.000Z" }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (init?.method === "POST") {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          profile: mockProfile
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        schemaVersion: 1,
        profiles: [mockProfile],
        nextCursor: null
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      operatorToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const listRes = await client.operator.sourceProfiles.list();
    expect(listRes.profiles.length).toBe(1);

    const createRes = await client.operator.sourceProfiles.create({
      schemaVersion: 1,
      platform: "booth",
      origin: "https://booth.pm",
      pathScope: "/ja/items/",
      method: "GET",
      purpose: "metadata",
      minDelayMs: 2000,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-2026-BOOTH",
      reason: "Permitted storefront ingestion",
      retainClasses: ["normalized_facts"],
      publishClasses: ["normalized_facts"]
    });
    expect(createRes.profile.profileId).toBe(mockProfile.profileId);

    const disableRes = await client.operator.sourceProfiles.disable(mockProfile.profileId, "Policy update");
    expect(disableRes.profile.disabledAt).not.toBeNull();
  });

  it("exercises operator auto-queue rules: list, create, and disable", async () => {
    const operatorToken = "e".repeat(64);
    const mockRule = {
      ruleId: crypto.randomUUID(),
      leadKind: "vpm_listing" as const,
      origin: "https://vpm.example.com",
      pathScope: "/index.json",
      minDelayMs: 3000,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-VPM-RULE-01",
      reason: "Trusted listing",
      createdAt: "2026-10-01T10:00:00.000Z",
      disabledAt: null
    };

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input.toString();
      if (url.includes("/disable")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          rule: { ...mockRule, disabledAt: "2026-10-01T12:00:00.000Z" }
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (init?.method === "POST") {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          rule: mockRule
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        schemaVersion: 1,
        rules: [mockRule],
        nextCursor: null
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      operatorToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const listRes = await client.operator.autoQueueRules.list();
    expect(listRes.rules.length).toBe(1);

    const createRes = await client.operator.autoQueueRules.create({
      schemaVersion: 1,
      leadKind: "vpm_listing",
      origin: "https://vpm.example.com",
      pathScope: "/index.json",
      minDelayMs: 3000,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-VPM-RULE-01",
      reason: "Trusted listing"
    });
    expect(createRes.rule.ruleId).toBe(mockRule.ruleId);

    const disableRes = await client.operator.autoQueueRules.disable(mockRule.ruleId, "Rule deprecated");
    expect(disableRes.rule.disabledAt).not.toBeNull();
  });

  it("exercises operator nodes issuance and catalog oversight", async () => {
    const operatorToken = "e".repeat(64);
    const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString();
      if (url.includes("/v1/operator/nodes")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          nodeId: "dedicated-node-99",
          capabilities: ["vpm", "github"],
          token: "vrcp_" + "d".repeat(64) + "0002"
        }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/v1/operator/catalog")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          packages: [
            {
              canonicalId: "item-op-1",
              umbrella: "tools",
              category: "companion_client",
              lifecycle: "active",
              displayName: "Operator Monitored Package",
              vpmId: null,
              createdAt: "2026-10-01T10:00:00.000Z",
              updatedAt: "2026-10-01T10:00:00.000Z",
              acceptedLinks: [],
              fronts: []
            }
          ],
          nextCursor: null
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("Not found", { status: 404 });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      operatorToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const issueRes = await client.operator.nodes.issue({
      schemaVersion: 1,
      nodeId: "dedicated-node-99",
      capabilities: ["vpm", "github"],
      reason: "Production dedicated ingestor"
    });
    expect(issueRes.nodeId).toBe("dedicated-node-99");
    expect(issueRes.capabilities).toContain("github");

    const catalogRes = await client.operator.catalog.list({ limit: 10 });
    expect(catalogRes.packages.length).toBe(1);
    expect(catalogRes.packages[0]?.displayName).toBe("Operator Monitored Package");
  });

  it("exercises operator takedowns: list and verify", async () => {
    const operatorToken = "e".repeat(64);
    const takedownId = crypto.randomUUID();
    const mockTakedown = {
      takedownId,
      targetUrl: "https://booth.pm/ja/items/999",
      canonicalId: null,
      requesterType: "unauthenticated_creator" as const,
      requesterId: null,
      reason: "DMCA request",
      proofKind: "storefront_bio_token" as const,
      proofValue: "proof-bio-token-123",
      contactEmail: "creator@example.com",
      reviewStatus: "pending" as const,
      recordedAt: "2026-10-01T10:00:00.000Z"
    };

    const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = input.toString();
      if (url.includes("/verify")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          takedownId,
          status: "accepted",
          updatedAt: "2026-10-01T12:00:00.000Z"
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        schemaVersion: 1,
        records: [mockTakedown],
        nextCursor: null
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      operatorToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const listRes = await client.operator.takedowns.list({ requesterType: "unauthenticated_creator" });
    expect(listRes.records.length).toBe(1);
    expect(listRes.records[0]?.takedownId).toBe(takedownId);

    const verifyRes = await client.operator.takedowns.verify(takedownId, {
      verdict: "accepted",
      notes: "Proof verified in bio"
    });
    expect(verifyRes.status).toBe("accepted");
    expect(verifyRes.takedownId).toBe(takedownId);
  });

  it("submits delegated creator claim intake with appToken and audits via operator.claims", async () => {
    let capturedHeaders: HeadersInit | undefined;
    let capturedUrl = "";
    let capturedMethod = "";
    const claimId = "123e4567-e89b-12d3-a456-426614174000";
    const operatorToken = "e".repeat(64);

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method || "GET";
      capturedHeaders = init?.headers;

      if (capturedUrl.includes("/v1/app/claims/intake")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          status: "accepted",
          claimId,
          reviewStatus: "pending",
          recordedAt: new Date().toISOString()
        }), { status: 202, headers: { "Content-Type": "application/json" } });
      }

      if (capturedUrl.includes(`/v1/operator/claims/${claimId}/verify`)) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          claimId,
          status: "accepted",
          updatedAt: new Date().toISOString()
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (capturedUrl.includes("/v1/operator/claims")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          records: [{
            claimId,
            appId: "123e4567-e89b-12d3-a456-426614174000",
            action: "creator_ownership_claim",
            frontUrl: "https://creator.booth.pm",
            creatorId: "creator-123",
            challengeToken: "vrcp_chal_0123456789abcdef",
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            nonce: "nonce_abcdef0123456789",
            signature: "sig_abc123456789",
            reason: "Storefront ownership verification",
            contactEmail: "creator@example.com",
            reviewStatus: "pending",
            reviewNotes: null,
            recordedAt: new Date().toISOString()
          }],
          nextCursor: null
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      return new Response("Not found", { status: 404 });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      appToken: dummyAppToken,
      operatorToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const intakeRes = await client.claims.submitIntake({
      schemaVersion: 1,
      attestation: {
        appId: "123e4567-e89b-12d3-a456-426614174000",
        action: "creator_ownership_claim",
        frontUrl: "https://creator.booth.pm",
        creatorId: "creator-123",
        challengeToken: "vrcp_chal_0123456789abcdef",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        nonce: "nonce_abcdef0123456789"
      },
      signature: "sig_abc123456789",
      reason: "Storefront ownership verification",
      contactEmail: "creator@example.com"
    });

    expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe(`Bearer ${dummyAppToken}`);
    expect(intakeRes.status).toBe("accepted");
    expect(intakeRes.claimId).toBe(claimId);
    expect(intakeRes.reviewStatus).toBe("pending");

    const listRes = await client.operator.claims.list({ reviewStatus: "pending" });
    expect(listRes.records.length).toBe(1);
    expect(listRes.records[0]?.claimId).toBe(claimId);

    const verifyRes = await client.operator.claims.verify(claimId, {
      verdict: "accepted",
      notes: "Confirmed ownership"
    });
    expect(verifyRes.status).toBe("accepted");
    expect(verifyRes.claimId).toBe(claimId);
  });

  it("exercises operator apps: list and setDelegation", async () => {
    let capturedHeaders: HeadersInit | undefined;
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody = "";
    const operatorToken = "e".repeat(64);
    const appId = "123e4567-e89b-12d3-a456-426614174000";

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedUrl = String(input);
      capturedMethod = init?.method || "GET";
      capturedHeaders = init?.headers;
      capturedBody = typeof init?.body === "string" ? init.body : "";

      if (capturedUrl.includes(`/v1/operator/apps/${appId}/delegation`)) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          appId,
          delegationAllowed: true,
          permissions: ["catalog:read", "catalog:search", "demand:feedback", "claims:delegate"],
          updatedAt: new Date().toISOString()
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (capturedUrl.includes(`/v1/operator/apps/${appId}/candidate-review`)) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          appId,
          candidateStatus: "trusted",
          candidateFlags: ["intensive_usage"],
          delegationAllowed: true,
          permissions: ["catalog:read", "catalog:search", "demand:feedback", "claims:delegate"],
          reviewedAt: new Date().toISOString()
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (capturedUrl.includes("/v1/operator/apps")) {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          apps: [{
            appId,
            appName: "Trusted Creator Tool",
            contactEmail: "tool@example.com",
            permissions: ["catalog:read", "catalog:search", "demand:feedback"],
            delegationAllowed: false,
            createdAt: "2026-10-01T10:00:00.000Z",
            revokedAt: null
          }],
          nextCursor: null
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      return new Response("Not found", { status: 404 });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      operatorToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const listRes = await client.operator.apps.list({ limit: 10 });
    expect(listRes.apps.length).toBe(1);
    expect(listRes.apps[0]?.appName).toBe("Trusted Creator Tool");
    expect(listRes.apps[0]?.delegationAllowed).toBe(false);

    const delegationRes = await client.operator.apps.setDelegation(appId, {
      delegationAllowed: true,
      reason: "Verified trusted store partner"
    });
    expect(delegationRes.appId).toBe(appId);
    expect(delegationRes.delegationAllowed).toBe(true);
    expect(delegationRes.permissions).toContain("claims:delegate");
    expect(capturedUrl).toContain(`/v1/operator/apps/${appId}/delegation`);
    expect(capturedMethod).toBe("POST");

    // Operator Candidate Review (R54-C38A2)
    const reviewRes = await client.operator.apps.reviewCandidate(appId, {
      candidateStatus: "trusted",
      grantDelegation: true,
      notes: "High volume candidate approved for trusted delegation"
    });
    expect(reviewRes.appId).toBe(appId);
    expect(reviewRes.candidateStatus).toBe("trusted");
    expect(reviewRes.delegationAllowed).toBe(true);
    expect(reviewRes.permissions).toContain("claims:delegate");
  });

  it("throws VRCPApiError if operator methods called without operatorToken", async () => {
    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example"
    });

    await expect(client.operator.leads.list()).rejects.toThrow(VRCPApiError);
    await expect(client.operator.sourceProfiles.list()).rejects.toThrow(VRCPApiError);
    await expect(client.operator.autoQueueRules.list()).rejects.toThrow(VRCPApiError);
    await expect(client.operator.catalog.list()).rejects.toThrow(VRCPApiError);
    await expect(client.operator.takedowns.list()).rejects.toThrow(VRCPApiError);
    await expect(client.operator.claims.list()).rejects.toThrow(VRCPApiError);
    await expect(client.operator.apps.list()).rejects.toThrow(VRCPApiError);
    await expect(client.operator.apps.setDelegation("123e4567-e89b-12d3-a456-426614174000", { delegationAllowed: true })).rejects.toThrow(VRCPApiError);
    await expect(client.operator.apps.reviewCandidate("123e4567-e89b-12d3-a456-426614174000", { candidateStatus: "trusted" })).rejects.toThrow(VRCPApiError);
  });

  it("exercises moderator ratings: list and adjust (R56-C56C1)", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    let capturedBody: any = null;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      capturedUrl = req.url;
      capturedMethod = req.method;
      capturedAuth = req.headers.get("Authorization") ?? "";
      if (req.body) {
        capturedBody = await req.json();
      }

      if (capturedUrl.includes("/v1/moderator/ratings") && capturedMethod === "GET") {
        return Response.json({
          schemaVersion: 1,
          ratings: [
            {
              canonicalId: "com.author.package",
              displayName: "Package With Rating",
              currentRating: "adult_restricted",
              umbrella: "avatars",
              category: "models",
              reportCount: 3,
              updatedAt: "2026-10-01T12:00:00.000Z"
            }
          ],
          nextCursor: null
        });
      }

      if (capturedUrl.includes("/v1/moderator/ratings/com.author.package") && capturedMethod === "POST") {
        return Response.json({
          schemaVersion: 1,
          canonicalId: "com.author.package",
          previousRating: "adult_restricted",
          newRating: "mature",
          adjustedBy: "user_moderator_1",
          updatedAt: "2026-10-01T13:00:00.000Z"
        });
      }

      return new Response("Not found", { status: 404 });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      userToken: "vrcp_usr_" + "1".repeat(64),
      fetch: mockFetch as unknown as typeof fetch
    });

    const listRes = await client.moderator.ratings.list({ rating: "adult_restricted", limit: 25 });
    expect(listRes.ratings.length).toBe(1);
    expect(listRes.ratings[0]?.canonicalId).toBe("com.author.package");
    expect(capturedUrl).toContain("rating=adult_restricted");
    expect(capturedUrl).toContain("limit=25");
    expect(capturedAuth).toBe(`Bearer vrcp_usr_${"1".repeat(64)}`);
    expect(capturedMethod).toBe("GET");

    const adjustRes = await client.moderator.ratings.adjust("com.author.package", {
      newRating: "mature",
      reason: "False positive adult filter detection resolved"
    });
    expect(adjustRes.canonicalId).toBe("com.author.package");
    expect(adjustRes.previousRating).toBe("adult_restricted");
    expect(adjustRes.newRating).toBe("mature");
    expect(capturedBody.newRating).toBe("mature");
    expect(capturedBody.reason).toBe("False positive adult filter detection resolved");
  });

  it("exercises moderator apps: list and reviewCandidate (R54-C38A2)", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedAuth = "";
    let capturedBody: any = null;
    const appId = "123e4567-e89b-12d3-a456-426614174000";

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      capturedUrl = req.url;
      capturedMethod = req.method;
      capturedAuth = req.headers.get("Authorization") ?? "";
      if (req.body) {
        capturedBody = await req.json();
      }

      if (capturedUrl.includes(`/v1/moderator/apps/${appId}/candidate-review`) && capturedMethod === "POST") {
        return Response.json({
          schemaVersion: 1,
          appId,
          candidateStatus: "trusted",
          candidateFlags: ["intensive_usage", "high_frequency_api"],
          delegationAllowed: true,
          permissions: ["catalog:read", "catalog:search", "demand:feedback", "claims:delegate"],
          reviewedAt: "2026-10-01T15:00:00.000Z"
        });
      }

      if (capturedUrl.includes("/v1/moderator/apps") && capturedMethod === "GET") {
        return Response.json({
          schemaVersion: 1,
          apps: [
            {
              appId,
              appName: "Candidate Downstream App",
              contactEmail: "candidate@example.com",
              permissions: ["catalog:read", "catalog:search", "demand:feedback"],
              delegationAllowed: false,
              requestCount: 88,
              lastActiveAt: "2026-10-01T14:30:00.000Z",
              candidateStatus: "review_pending",
              candidateFlags: ["intensive_usage"],
              createdAt: "2026-10-01T10:00:00.000Z",
              revokedAt: null
            }
          ],
          nextCursor: null
        });
      }

      return new Response("Not found", { status: 404 });
    };

    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      userToken: "vrcp_usr_" + "2".repeat(64),
      fetch: mockFetch as unknown as typeof fetch
    });

    const listRes = await client.moderator.apps.list({ candidateStatus: "review_pending", limit: 10 });
    expect(listRes.apps.length).toBe(1);
    expect(listRes.apps[0]?.appId).toBe(appId);
    expect(listRes.apps[0]?.requestCount).toBe(88);
    expect(listRes.apps[0]?.candidateStatus).toBe("review_pending");
    expect(capturedUrl).toContain("candidateStatus=review_pending");
    expect(capturedAuth).toBe(`Bearer vrcp_usr_${"2".repeat(64)}`);

    const reviewRes = await client.moderator.apps.reviewCandidate(appId, {
      candidateStatus: "trusted",
      grantDelegation: true,
      notes: "Staff verified client activity"
    });
    expect(reviewRes.appId).toBe(appId);
    expect(reviewRes.candidateStatus).toBe("trusted");
    expect(reviewRes.delegationAllowed).toBe(true);
    expect(capturedBody.candidateStatus).toBe("trusted");
    expect(capturedBody.grantDelegation).toBe(true);
  });

  it("throws VRCPApiError if moderator methods called without userToken", async () => {
    const client = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example"
    });

    await expect(client.moderator.ratings.list()).rejects.toThrow(VRCPApiError);
    await expect(client.moderator.ratings.adjust("com.pkg", { newRating: "general", reason: "Valid reason" })).rejects.toThrow(VRCPApiError);
    await expect(client.moderator.apps.list()).rejects.toThrow(VRCPApiError);
    await expect(client.moderator.apps.reviewCandidate("123e4567-e89b-12d3-a456-426614174000", { candidateStatus: "trusted" })).rejects.toThrow(VRCPApiError);
  });

  it("rejects responses exceeding SDK byte limits", async () => {
    const largeErrorClient = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      fetch: (async () => new Response("x".repeat(65 * 1024), { status: 500 })) as unknown as typeof fetch
    });
    await expect(largeErrorClient.index.query()).rejects.toThrow(/exceeds maximum byte limit/);

    const largeSuccessClient = new VRCPackageClient({
      baseUrl: "https://api.vrc-packages.example",
      fetch: (async () => new Response("x".repeat(5 * 1024 * 1024), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch
    });
    await expect(largeSuccessClient.index.query()).rejects.toThrow(/exceeds maximum byte limit/);
  });
});

