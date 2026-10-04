import { describe, expect, test } from "bun:test";
import {
  ApproveLeadSchema as WorkerApproveLeadSchema,
  RejectLeadSchema as WorkerRejectLeadSchema,
  LeadRowSchema as WorkerLeadRowSchema
} from "../src/api/protocol/operator_protocol.ts";
import {
  ApproveLeadSchema as SdkApproveLeadSchema,
  RejectLeadSchema as SdkRejectLeadSchema,
  LeadRowSchema as SdkLeadRowSchema
} from "../../src-package/src/protocol/operator.ts";
import { VRCPackageClient } from "../../src-package/src/client.ts";

const wireLead = {
  lead_key: "a".repeat(64), kind: "vpm_listing",
  target_url: "https://publisher.example/index.json",
  claimed_package_id: null,
  discovered_from_url: "https://directory.example/catalog",
  discovered_from_item_key: null, status: "pending_review" as const,
  first_seen_at: "2026-10-03T00:00:00.000Z",
  last_seen_at: "2026-10-03T00:00:00.000Z"
};

describe("operator lead contract characterization before consolidation", () => {
  test("both accept current wire rows, but the SDK returns an expanded model", () => {
    expect(WorkerLeadRowSchema.parse(wireLead)).toEqual(wireLead);
    const model = SdkLeadRowSchema.parse(wireLead);
    expect(model).toMatchObject({ ...wireLead, leadKey: wireLead.lead_key,
      leadKind: wireLead.kind, targetUrl: wireLead.target_url,
      discoveredFromUrl: wireLead.discovered_from_url, reviewedAt: null });
    expect(WorkerLeadRowSchema.safeParse(model).success).toBe(false);
  });

  test("the SDK accepts camel-case input and strips unknown fields before validation", () => {
    const camel = { leadKey: wireLead.lead_key, leadKind: wireLead.kind,
      targetUrl: wireLead.target_url, status: wireLead.status,
      firstSeenAt: wireLead.first_seen_at, lastSeenAt: wireLead.last_seen_at };
    expect(SdkLeadRowSchema.safeParse(camel).success).toBe(true);
    expect(WorkerLeadRowSchema.safeParse(camel).success).toBe(false);
    const extra = { ...wireLead, unexpected: "not part of the wire contract" };
    expect(WorkerLeadRowSchema.safeParse(extra).success).toBe(false);
    expect(SdkLeadRowSchema.parse(extra)).not.toHaveProperty("unexpected");
  });

  test("the SDK permits missing or null provenance rejected by the Worker", () => {
    const { discovered_from_url: _origin, ...withoutOrigin } = wireLead;
    for (const input of [withoutOrigin, { ...wireLead, discovered_from_url: null }]) {
      expect(SdkLeadRowSchema.parse(input).discoveredFromUrl).toBeNull();
      expect(WorkerLeadRowSchema.safeParse(input).success).toBe(false);
    }
  });

  test("the Worker schema accepts opaque lead keys rejected by the SDK", () => {
    const input = { ...wireLead, lead_key: "opaque-key" };
    expect(WorkerLeadRowSchema.safeParse(input).success).toBe(true);
    expect(SdkLeadRowSchema.safeParse(input).success).toBe(false);
  });

  test("SDK request schemas supply reasons required by Worker request schemas", () => {
    const input = { schemaVersion: 1 };
    expect(SdkApproveLeadSchema.parse(input).reason).toBe("Operator approved");
    expect(SdkRejectLeadSchema.parse(input).reason).toBe("Operator rejected");
    expect(WorkerApproveLeadSchema.safeParse(input).success).toBe(false);
    expect(WorkerRejectLeadSchema.safeParse(input).success).toBe(false);
    for (const reason of ["", "  ", "ab"]) {
      for (const schema of [SdkApproveLeadSchema, WorkerApproveLeadSchema,
        SdkRejectLeadSchema, WorkerRejectLeadSchema]) {
        expect(schema.safeParse({ ...input, reason }).success).toBe(false);
      }
    }
  });

  test("SDK defaults produce serialized requests accepted by the unchanged Worker schemas", async () => {
    const requests: unknown[] = [];
    const client = new VRCPackageClient({ baseUrl: "https://worker.example",
      operatorToken: "b".repeat(64),
      fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        expect(request.method).toBe("POST");
        const body: unknown = await request.json();
        requests.push(body);
        const approve = new URL(request.url).pathname.endsWith("/approve");
        expect((approve ? WorkerApproveLeadSchema : WorkerRejectLeadSchema).safeParse(body).success).toBe(true);
        return Response.json({ schemaVersion: 1, leadKey: wireLead.lead_key,
          status: approve ? "approved" : "rejected",
          ...(approve ? { jobId: "00000000-0000-4000-8000-000000000001" } : {}) });
      }, { preconnect() {} }) });
    await client.operator.leads.approve(wireLead.lead_key);
    await client.operator.leads.reject(wireLead.lead_key);
    expect(requests).toEqual([
      { schemaVersion: 1, reason: "Operator approved" },
      { schemaVersion: 1, reason: "Operator rejected" }
    ]);
  });
});
