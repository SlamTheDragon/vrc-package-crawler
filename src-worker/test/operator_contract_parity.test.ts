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
} from "vrc-packages-api";
import { VRCPackageClient } from "vrc-packages-api";

const wireLead = {
  lead_key: "a".repeat(64), kind: "vpm_listing",
  target_url: "https://publisher.example/index.json",
  claimed_package_id: null,
  discovered_from_url: "https://directory.example/catalog",
  discovered_from_item_key: null, status: "pending_review" as const,
  first_seen_at: "2026-10-03T00:00:00.000Z",
  last_seen_at: "2026-10-03T00:00:00.000Z"
};

describe("strict operator lead contract parity", () => {
  test("SDK and Worker preserve the exact wire row without aliases", () => {
    expect(WorkerLeadRowSchema.parse(wireLead)).toEqual(wireLead);
    expect(SdkLeadRowSchema.parse(wireLead)).toEqual(wireLead);
  });

  test("both reject aliases, extra fields and missing provenance", () => {
    const { discovered_from_url: _origin, ...withoutOrigin } = wireLead;
    const camel = { leadKey: wireLead.lead_key, leadKind: wireLead.kind,
      targetUrl: wireLead.target_url, status: wireLead.status,
      firstSeenAt: wireLead.first_seen_at, lastSeenAt: wireLead.last_seen_at };
    for (const input of [camel, withoutOrigin, { ...wireLead, discovered_from_url: null },
      { ...wireLead, unexpected: true }, { ...wireLead, leadKey: wireLead.lead_key }]) {
      expect(SdkLeadRowSchema.safeParse(input).success).toBe(false);
      expect(WorkerLeadRowSchema.safeParse(input).success).toBe(false);
    }
  });

  test("row validation matches the existing Worker opaque-key policy", () => {
    const input = { ...wireLead, lead_key: "opaque-key" };
    expect(SdkLeadRowSchema.parse(input)).toEqual(WorkerLeadRowSchema.parse(input));
  });

  test("both require explicit valid audit reasons and reject unknown fields", () => {
    for (const input of [{ schemaVersion: 1 }, ...["", "  ", "ab"].map(reason => ({ schemaVersion: 1, reason })),
      { schemaVersion: 1, reason: "Reviewed listing", extra: true }]) {
      for (const schema of [SdkApproveLeadSchema, WorkerApproveLeadSchema, SdkRejectLeadSchema, WorkerRejectLeadSchema]) {
        expect(schema.safeParse(input).success).toBe(false);
      }
    }
  });

  test("SDK serializes explicit reasons without supplying defaults", async () => {
    const requests: unknown[] = [];
    const client = new VRCPackageClient({ baseUrl: "https://worker.example",
      operatorToken: "b".repeat(64),
      fetch: Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        const body: unknown = await request.json();
        requests.push(body);
        const approve = new URL(request.url).pathname.endsWith("/approve");
        expect((approve ? WorkerApproveLeadSchema : WorkerRejectLeadSchema).safeParse(body).success).toBe(true);
        return Response.json({ schemaVersion: 1, leadKey: wireLead.lead_key,
          status: approve ? "approved" : "rejected",
          ...(approve ? { jobId: "00000000-0000-4000-8000-000000000001" } : {}) });
      }, { preconnect() {} }) });
    await client.operator.leads.approve(wireLead.lead_key, { reason: "Reviewed approval" });
    await client.operator.leads.reject(wireLead.lead_key, { reason: "Reviewed rejection" });
    expect(requests).toEqual([
      { schemaVersion: 1, reason: "Reviewed approval" },
      { schemaVersion: 1, reason: "Reviewed rejection" }
    ]);
  });
});
