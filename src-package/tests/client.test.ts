import { describe, it, expect } from "bun:test";
import { VrcPackagesClient, VrcApiError } from "../src/client.ts";

describe("VrcPackagesClient SDK", () => {
  const dummyAppToken = "vrcp_app_" + "a".repeat(64);
  const dummyUserToken = "vrcp_usr_" + "b".repeat(64);

  it("queries the public package index without auth", async () => {
    let requestedUrl = "";
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requestedUrl = input.toString();
      return new Response(JSON.stringify({
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
        count: 1
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VrcPackagesClient({
      baseUrl: "https://api.vrc-packages.example",
      fetch: mockFetch as typeof fetch
    });

    const res = await client.index.query({ query: "Test", limit: 20 });
    expect(requestedUrl).toContain("/v1/app/index?");
    expect(requestedUrl).toContain("query=Test");
    expect(requestedUrl).toContain("limit=20");
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
        count: 0,
        queryOrigin: "user_authored"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VrcPackagesClient({
      baseUrl: "https://api.vrc-packages.example",
      appToken: dummyAppToken,
      fetch: mockFetch as typeof fetch
    });

    const res = await client.index.search({
      query: "kikyo dress",
      queryOrigin: "user_authored",
      limit: 10
    });

    expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe(`Bearer ${dummyAppToken}`);
    expect(capturedBody.queryOrigin).toBe("user_authored");
    expect(capturedBody.query).toBe("kikyo dress");
    expect(res.schemaVersion).toBe(1);
  });

  it("throws VrcApiError if search is called without appToken", async () => {
    const client = new VrcPackagesClient({
      baseUrl: "https://api.vrc-packages.example"
    });

    await expect(
      client.index.search({ query: "foo", queryOrigin: "app_automated" })
    ).rejects.toThrow(VrcApiError);
  });

  it("synchronizes delta updates", async () => {
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

    const client = new VrcPackagesClient({
      baseUrl: "https://api.vrc-packages.example",
      fetch: mockFetch as typeof fetch
    });

    const res = await client.index.syncDeltas({ cursor: "cursor-1" });
    expect(requestedUrl).toContain("/v1/app/index/delta?cursor=cursor-1");
    expect(res.epoch).toBe("epoch-1");
    expect(res.deltas.length).toBe(1);
  });

  it("submits reports with appToken", async () => {
    let capturedHeaders: HeadersInit | undefined;
    const testReportId = crypto.randomUUID();
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({
        schemaVersion: 1,
        status: "accepted",
        reportId: testReportId,
        recordedAt: "2026-10-01T12:00:00.000Z"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VrcPackagesClient({
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

  it("submits user delisting requests with userToken auth", async () => {
    let capturedHeaders: HeadersInit | undefined;
    const testTakedownId = crypto.randomUUID();
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({
        schemaVersion: 1,
        status: "accepted",
        takedownId: testTakedownId,
        target: "https://booth.pm/ja/items/999",
        action: "delisted",
        requesterType: "user",
        recordedAt: "2026-10-01T12:00:00.000Z"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VrcPackagesClient({
      baseUrl: "https://api.vrc-packages.example",
      userToken: dummyUserToken,
      fetch: mockFetch as typeof fetch
    });

    const res = await client.user.delist({
      schemaVersion: 1,
      targetUrl: "https://booth.pm/ja/items/999",
      reason: "Self delist"
    });

    expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe(`Bearer ${dummyUserToken}`);
    expect(res.status).toBe("accepted");
  });

  it("samples random catalog packages with app token", async () => {
    let capturedUrl = "";
    const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
      capturedUrl = input.toString();
      return new Response(JSON.stringify({
        schemaVersion: 1,
        items: []
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new VrcPackagesClient({
      baseUrl: "https://api.vrc-packages.example",
      appToken: dummyAppToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const res = await client.index.random({ umbrella: "tools", limit: 5 });
    expect(capturedUrl).toContain("/v1/app/index/random?");
    expect(capturedUrl).toContain("umbrella=tools");
    expect(capturedUrl).toContain("limit=5");
    expect(res.schemaVersion).toBe(1);
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

    const client = new VrcPackagesClient({
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

  it("unwraps API error responses into VrcApiError", async () => {
    const mockFetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({
        error: "FORBIDDEN",
        message: "Invalid capability"
      }), { status: 403, headers: { "Content-Type": "application/json" } });
    };

    const client = new VrcPackagesClient({
      baseUrl: "https://api.vrc-packages.example",
      userToken: dummyUserToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    try {
      await client.user.registerApp({
        schemaVersion: 1,
        appName: "Test App"
      });
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err instanceof VrcApiError).toBe(true);
      const apiErr = err as VrcApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.message).toBe("Invalid capability");
      expect(apiErr.code).toBe("FORBIDDEN");
    }
  });

  it("registers crawler nodes via client.user.registerNode", async () => {
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: any;
    const testToken = "vrcp_" + "c".repeat(64) + "0001";
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({
        schemaVersion: 1,
        nodeId: "worker-node-1",
        capabilities: ["vpm"],
        token: testToken
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    };

    const client = new VrcPackagesClient({
      baseUrl: "https://api.vrc-packages.example",
      userToken: dummyUserToken,
      fetch: mockFetch as unknown as typeof fetch
    });

    const res = await client.user.registerNode({
      schemaVersion: 1,
      nodeId: "worker-node-1",
      requestedCapabilities: ["vpm"],
      reason: "Self-hosted crawl worker"
    });

    expect((capturedHeaders as Record<string, string>)["Authorization"]).toBe(`Bearer ${dummyUserToken}`);
    expect(capturedBody.nodeId).toBe("worker-node-1");
    expect(res.token).toBe(testToken);
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
              leadKey: "a".repeat(64),
              leadKind: "vpm_listing",
              targetUrl: "https://example.com/vpm.json",
              firstSeenAt: "2026-10-01T10:00:00.000Z",
              lastSeenAt: "2026-10-01T10:00:00.000Z",
              status: "pending_review",
              reviewedAt: null,
              reviewedBy: null,
              reviewReason: null
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

    const client = new VrcPackagesClient({
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

  it("exercises operator source profiles: list, create, and disable", async () => {
    const operatorToken = "e".repeat(64);
    const mockProfile = {
      schemaVersion: 1,
      profileId: crypto.randomUUID(),
      platform: "booth" as const,
      origin: "https://booth.pm",
      pathScope: "/ja/items/*",
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

    const client = new VrcPackagesClient({
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
      pathScope: "/ja/items/*",
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

    const client = new VrcPackagesClient({
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

    const client = new VrcPackagesClient({
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

    const client = new VrcPackagesClient({
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

  it("throws VrcApiError if operator methods called without operatorToken", async () => {
    const client = new VrcPackagesClient({
      baseUrl: "https://api.vrc-packages.example"
    });

    await expect(client.operator.leads.list()).rejects.toThrow(VrcApiError);
    await expect(client.operator.sourceProfiles.list()).rejects.toThrow(VrcApiError);
    await expect(client.operator.autoQueueRules.list()).rejects.toThrow(VrcApiError);
    await expect(client.operator.catalog.list()).rejects.toThrow(VrcApiError);
    await expect(client.operator.takedowns.list()).rejects.toThrow(VrcApiError);
  });
});

