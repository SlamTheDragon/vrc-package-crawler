import { describe, expect, test } from "bun:test";
import { CoordinatorClient } from "../src/client/node_client.ts";
import { formatCapabilityToken } from "../../src-worker/src/domain/security/capability_token.ts";
import { ResultRequestSchema, type ResultRequest, type ResultResponse } from "../src/shared/protocol/node_protocol.ts";

function fixture() {
  const nodeId = "result-client-fixture";
  const token = formatCapabilityToken(["vpm"]);
  const request: Omit<ResultRequest, "schemaVersion" | "nodeId"> = {
    jobId: "result-client-job", leaseId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(), outcome: { kind: "unchanged" }
  };
  const receipt: ResultResponse = { schemaVersion: 1, status: "accepted", jobId: request.jobId,
    duplicate: false, sourceVersionCreated: false };
  const client = new CoordinatorClient("https://coordinator.invalid", token, nodeId, ["vpm"],
    { maxRetries: 1, retryBaseDelayMs: 0 });
  return { nodeId, token, request, receipt, client };
}

async function withTransport(
  response: (request: Request) => Promise<Response>, run: () => Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => response(input instanceof Request ?
    new Request(input, init) : new Request(input.toString(), init))) as typeof fetch;
  try { await run(); } finally { globalThis.fetch = originalFetch; }
}

describe("Node result receipt validation", () => {
  test("serializes validated identity unchanged across retry and accepts the matching receipt", async () => {
    const { nodeId, token, request, receipt, client } = fixture();
    const bodies: string[] = [];
    await withTransport(async wire => {
      expect(wire.url).toBe("https://coordinator.invalid/v1/node/jobs/result");
      expect(wire.method).toBe("POST");
      expect(wire.headers.get("content-type")).toBe("application/json");
      expect(wire.headers.get("authorization")).toBe(`Bearer ${token}`);
      const body = await wire.text();
      bodies.push(body);
      expect(ResultRequestSchema.parse(JSON.parse(body))).toEqual({
        ...request, schemaVersion: 1, nodeId
      });
      return bodies.length === 1 ? Response.json({ error: "Transient fixture" }, { status: 503 }) :
        Response.json(receipt);
    }, async () => {
      expect(await client.submit(request)).toEqual(receipt);
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).toBe(bodies[0]);
    });
  });

  test("rejects a schema-valid receipt for a different job", async () => {
    const { request, receipt, client } = fixture();
    let calls = 0;
    await withTransport(async () => {
      calls++;
      return Response.json({ ...receipt, jobId: "unrelated-job" });
    }, async () => {
      await expect(client.submit(request)).rejects.toThrow("Result receipt does not match submitted job");
      expect(calls).toBe(1);
    });
  });

  test("rejects a malformed success receipt", async () => {
    const { request, receipt, client } = fixture();
    let calls = 0;
    await withTransport(async () => {
      calls++;
      return Response.json({ ...receipt, duplicate: "false" });
    }, async () => {
      await expect(client.submit(request)).rejects.toThrow();
      expect(calls).toBe(1);
    });
  });

  test("rejects an invalid result request before any transport call", async () => {
    const { request, receipt, client } = fixture();
    let calls = 0;
    await withTransport(async () => {
      calls++;
      return Response.json(receipt);
    }, async () => {
      await expect(client.submit({ ...request, leaseId: "not-a-uuid" })).rejects.toThrow();
      expect(calls).toBe(0);
    });
  });
});
