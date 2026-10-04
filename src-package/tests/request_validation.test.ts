import { expect, test } from "bun:test";
import { VRCPackageClient, VRCPApiError } from "../src/client.ts";
import { IssueNodeCredentialSchema } from "../src/protocol/operator.ts";
import { encodeLeadCursor, encodeProfileCursor, encodeRuleCursor, encodeTakedownCursor } from "../src/protocol/operator.ts";
import { encodeCatalogCursor, encodeCatalogDeltaCursor } from "../src/protocol/catalog.ts";

test("SDK list queries reject invalid bounds, cursors and unknown fields without fetching", async () => {
  let calls = 0;
  const client = new VRCPackageClient({ baseUrl: "https://worker.example", operatorToken: "fixture-operator",
    fetch: Object.assign(async () => { calls++; throw new Error("Invalid query reached transport"); }, { preconnect() {} }) });
  const lists = [client.index.syncDeltas, client.operator.leads.list, client.operator.sourceProfiles.list,
    client.operator.autoQueueRules.list, client.operator.catalog.list, client.operator.takedowns.list];
  for (const params of [{ limit: 0 }, { limit: 101 }, { limit: NaN }, { limit: 1.5 },
    { cursor: "" }, { cursor: "invalid!" }, { cursor: "YWJj" }, { extra: true }]) {
    for (const list of lists) await expect(list(params as never)).rejects.toThrow();
    expect(calls).toBe(0);
  }
  const cursor = encodeLeadCursor({ status: "approved", firstSeenAt: "2026-10-04T00:00:00.000Z", leadKey: "a".repeat(64) });
  await expect(client.operator.leads.list({ status: "rejected", cursor })).rejects.toThrow();
  await expect(client.operator.leads.list({ status: "invalid" } as never)).rejects.toThrow();
  await expect(client.operator.takedowns.list({ requesterType: "invalid" } as never)).rejects.toThrow();
  expect(calls).toBe(0);
});

test("SDK list queries preserve opaque cursor bytes and route-specific defaults", async () => {
  const urls: URL[] = [];
  const rejection = new Error("Fixture transport stop");
  const client = new VRCPackageClient({ baseUrl: "https://worker.example", operatorToken: "fixture-operator",
    fetch: Object.assign(async (input: RequestInfo | URL) => { urls.push(new URL(String(input))); throw rejection; }, { preconnect() {} }) });
  const time = "2026-10-04T00:00:00.000Z";
  const id = "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF";
  const cursors = [
    encodeCatalogDeltaCursor({ updatedAt: time, canonicalId: "CaseSensitive.Package" }),
    encodeLeadCursor({ status: "approved", firstSeenAt: time, leadKey: "a".repeat(64) }),
    encodeProfileCursor({ createdAt: time, profileId: id }),
    encodeRuleCursor({ createdAt: time, ruleId: id }),
    encodeCatalogCursor({ createdAt: time, canonicalId: "CaseSensitive.Package" }),
    encodeTakedownCursor({ recordedAt: time, takedownId: id })
  ];
  const actions = [
    () => client.index.syncDeltas({ cursor: cursors[0] }),
    () => client.operator.leads.list({ status: "approved", cursor: cursors[1] }),
    () => client.operator.sourceProfiles.list({ cursor: cursors[2] }),
    () => client.operator.autoQueueRules.list({ cursor: cursors[3] }),
    () => client.operator.catalog.list({ cursor: cursors[4] }),
    () => client.operator.takedowns.list({ requesterType: "user", cursor: cursors[5] })
  ];
  for (const invoke of actions) await expect(invoke()).rejects.toThrow(rejection.message);
  for (const [index, url] of urls.entries()) {
    expect(url.searchParams.get("cursor")).toBe(cursors[index]);
    expect(url.searchParams.get("limit")).toBe(index === 0 ? "50" : "100");
  }
  expect(urls[1]!.searchParams.get("status")).toBe("approved");
  expect(urls[5]!.searchParams.get("requesterType")).toBe("user");
});

test("SDK UUID paths and raw app cursors use lowercase without changing node IDs", async () => {
  const id = "abcdefab-cdef-4abc-8def-abcdefabcdef";
  const rejection = new Error("Fixture transport stop");
  const urls: URL[] = [];
  const client = new VRCPackageClient({ baseUrl: "https://worker.example",
    operatorToken: "fixture-operator", userToken: "fixture-user",
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(new URL(new Request(input, init).url));
      throw rejection;
    }, { preconnect() {} }) });
  const actions = [
    () => client.user.apps.get(id.toUpperCase()),
    () => client.user.apps.list({ cursor: id.toUpperCase() }),
    () => client.operator.sourceProfiles.disable(id.toUpperCase(), "Reviewed profile"),
    () => client.operator.autoQueueRules.disable(id.toUpperCase(), "Reviewed rule"),
    () => client.operator.takedowns.verify(id.toUpperCase(), { verdict: "accepted" }),
    () => client.operator.nodes.revoke("Node.1", "Reviewed node")
  ];
  for (const invoke of actions) await expect(invoke()).rejects.toThrow(rejection.message);
  expect(urls.map(url => url.pathname)).toEqual([
    `/v1/user/apps/${id}`, "/v1/user/apps",
    `/v1/operator/source-profiles/${id}/disable`,
    `/v1/operator/autoqueue-rules/${id}/disable`,
    `/v1/operator/takedowns/${id}/verify`, "/v1/operator/nodes/Node.1/revoke"
  ]);
  expect(urls[1]!.searchParams.get("cursor")).toBe(id);
});

test("node issuance distinguishes navigation segments from ordinary dotted identifiers", () => {
  for (const nodeId of [".", "..", "...", "Node.1", "node-1", "node_1"]) {
    expect(IssueNodeCredentialSchema.safeParse({ schemaVersion: 1, nodeId,
      capabilities: ["vpm"], reason: "Reviewed node" }).success).toBe(nodeId !== "." && nodeId !== "..");
  }
});

test("every SDK auth namespace rejects redirects through its fetch policy", async () => {
  let calls = 0;
  let cancelled = 0;
  const client = new VRCPackageClient({
    baseUrl: "https://worker.example",
    appToken: "fixture-app",
    userToken: "fixture-user",
    operatorToken: "fixture-operator",
    fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      const request = new Request(input, init);
      expect(request.redirect).toBe("manual");
      expect(new URL(request.url).origin).toBe("https://worker.example");
      return new Response(new ReadableStream({ cancel() { cancelled++; } }), {
        status: 302, headers: { location: "https://outside.example/" }
      });
    }, { preconnect() {} })
  });
  const actions = [
    () => client.index.query(),
    () => client.index.search({ queryOrigin: "user_authored", query: "tools" }),
    () => client.user.apps.list(),
    () => client.operator.init()
  ];
  for (const [index, invoke] of actions.entries()) {
    let caught: unknown;
    try {
      await invoke();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(VRCPApiError);
    expect((caught as VRCPApiError).status).toBe(302);
    expect((caught as Error).message).toBe("API redirects are not permitted");
    expect(calls).toBe(index + 1);
    expect(cancelled).toBe(index + 1);
  }
});

test("SDK rejects browser opaque redirects without reading or following them", async () => {
  const response = new Response(null);
  Object.defineProperties(response, { type: { value: "opaqueredirect" }, status: { value: 0 } });
  const client = new VRCPackageClient({ baseUrl: "https://worker.example",
    fetch: Object.assign(async () => response, { preconnect() {} }) });
  await expect(client.index.query()).rejects.toMatchObject({ name: "VRCPApiError", status: 0 });
});

test("invalid SDK POST inputs fail before invoking fetch", async () => {
  let calls = 0;
  const client = new VRCPackageClient({ baseUrl: "https://worker.example",
    operatorToken: "fixture-operator", userToken: "fixture-user", appToken: "fixture-app",
    fetch: Object.assign(async () => {
      calls++;
      throw new Error("Invalid payload reached transport");
    }, { preconnect() {} }) });
  const leadKey = "a".repeat(64);
  const id = "00000000-0000-4000-8000-000000000001";
  const invalid: Array<() => Promise<unknown>> = [
    () => client.index.search({ queryOrigin: "invalid" } as never),
    () => client.app.register({ schemaVersion: 1, appName: "Valid app", extra: true } as never),
    () => client.reports.submit({ schemaVersion: 1, reportType: "removal_request", canonicalId: "fixture" } as never),
    () => client.operator.leads.approve(leadKey, { minDelayMs: -1, reason: "Reviewed lead" }),
    () => client.operator.leads.reject(leadKey, { reason: " " }),
    () => client.operator.leads.approve(leadKey, {} as never),
    () => client.operator.leads.reject(leadKey, {} as never),
    () => client.operator.leads.approve(leadKey, { reason: "Reviewed lead", extra: true } as never),
    () => client.operator.leads.reject(leadKey, { reason: "Reviewed lead", extra: true } as never),
    () => client.operator.sourceProfiles.create({ schemaVersion: 999 } as never),
    () => client.operator.sourceProfiles.disable(id, " "),
    () => client.operator.autoQueueRules.create({ schemaVersion: 999 } as never),
    () => client.operator.autoQueueRules.disable(id, " "),
    () => client.operator.nodes.issue({ schemaVersion: 999 } as never),
    () => client.operator.takedowns.verify(id, { verdict: "invalid" } as never),
    () => client.operator.jobs.enqueue({ schemaVersion: 999 } as never),
    () => client.operator.init({ autoSeed: "invalid" } as never),
    () => client.operator.nodes.revoke("fixture-node", " ")
  ];
  for (const invoke of invalid) {
    await expect(invoke()).rejects.toThrow();
    expect(calls).toBe(0);
  }
});

test("SDK search rejects invalid bounds before transport instead of clamping them", async () => {
  let calls = 0;
  const client = new VRCPackageClient({ baseUrl: "https://worker.example", appToken: "fixture-app",
    fetch: Object.assign(async () => { calls++; throw new Error("Invalid search reached transport"); }, { preconnect() {} }) });
  for (const limit of [0, -1, 51, 100, 1.5, NaN, Infinity]) {
    await expect(client.index.search({ queryOrigin: "user_authored", limit })).rejects.toThrow();
    expect(calls).toBe(0);
  }
  await expect(client.index.search({ queryOrigin: "app_automated", cursor: "x".repeat(257) })).rejects.toThrow();
  expect(calls).toBe(0);
});

test("SDK path identifiers reject route-changing input before invoking fetch", async () => {
  let calls = 0;
  const client = new VRCPackageClient({ baseUrl: "https://worker.example",
    operatorToken: "fixture-operator", userToken: "fixture-user",
    fetch: Object.assign(async () => {
      calls++;
      throw new Error("Invalid path reached transport");
    }, { preconnect() {} }) });
  const invalid = ["", ".", "..", "../init", "id/disable", "id?reason=other", "id#fragment", "id%2Fdisable", " "];
  for (const id of invalid) {
    const actions: Array<() => Promise<unknown>> = [
      () => client.operator.leads.approve(id, { reason: "Reviewed lead" }),
      () => client.operator.leads.reject(id, { reason: "Reviewed lead" }),
      () => client.operator.sourceProfiles.disable(id, "Reviewed profile"),
      () => client.operator.autoQueueRules.disable(id, "Reviewed rule"),
      () => client.operator.takedowns.verify(id, { verdict: "accepted" }),
      () => client.operator.nodes.revoke(id, "Reviewed node"),
      () => client.operator.nodes.issue({ schemaVersion: 1, nodeId: id, capabilities: ["vpm"], reason: "Reviewed node" }),
      () => client.user.apps.get(id)
    ];
    for (const invoke of actions) {
      await expect(invoke()).rejects.toThrow();
      expect(calls).toBe(0);
    }
  }
});
