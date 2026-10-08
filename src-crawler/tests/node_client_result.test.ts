import { describe, expect, spyOn, test } from "bun:test";
import { CoordinatorClient } from "../src/client/node_client.ts";
import { logger } from "../src/utils/logging/logger.ts";
import { CRAWLER_USER_AGENT } from "../src/shared/robots/crawler_identity.ts";
import {
  ResultRequestSchema, CrawlJobSchema, MAX_COORDINATOR_RESPONSE_BYTES,
  MAX_JOB_URL_LENGTH, MAX_ORIGIN_URL_LENGTH, MAX_ETAG_LENGTH, MAX_LAST_MODIFIED_LENGTH,
  type ResultRequest, type ResultResponse
} from "vrc-packages-network/node";

function fixture() {
  const nodeId = "result-client-fixture";
  const token = "fixture-only-not-a-live-credential";
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
  test("rejects non-finite, fractional and negative retry settings", () => {
    for (const key of ["maxRetries", "retryBaseDelayMs"] as const) {
      for (const value of [Infinity, -Infinity, NaN, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => new CoordinatorClient("https://coordinator.invalid", "fixture-only-not-a-live-credential",
          "result-client-fixture", ["vpm"], { [key]: value })).toThrow(`${key} must be a nonnegative safe integer`);
      }
    }
  });

  test("preserves default settings and permits zero retries and delay", () => {
    expect(() => new CoordinatorClient("https://coordinator.invalid", "fixture-only-not-a-live-credential",
      "result-client-fixture", ["vpm"])).not.toThrow();
    expect(() => new CoordinatorClient("https://coordinator.invalid", "fixture-only-not-a-live-credential",
      "result-client-fixture", ["vpm"], { maxRetries: 0, retryBaseDelayMs: 0 })).not.toThrow();
  });

  test("failed response bodies do not reach node errors or logs", async () => {
    const { request, token, client } = fixture();
    let bodyReads = 0;
    let bodyCancels = 0;
    let calls = 0;
    const logs = spyOn(logger, "error").mockImplementation(() => {});
    try {
      await withTransport(async () => {
        calls++;
        const response = new Response(new ReadableStream({
          start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ token }))); },
          cancel() { bodyCancels++; },
        }), { status: 401 });
        Object.defineProperty(response, "json", { value: async () => { bodyReads++; return { token }; } });
        return response;
      }, async () => {
        await expect(client.submit(request)).rejects.toThrow("Coordinator 401");
        expect(calls).toBe(1);
        expect(bodyReads).toBe(0);
        expect(bodyCancels).toBe(1);
        expect(logs).toHaveBeenCalledTimes(1);
        const error = logs.mock.calls[0]?.[1];
        expect(error).toBeInstanceOf(Error);
        if (!(error instanceof Error)) throw new Error("Expected a status-only coordinator error");
        expect(error.message).toBe("Coordinator 401");
        expect(JSON.stringify(logs.mock.calls)).not.toContain(token);
      });
    } finally { logs.mockRestore(); }
  });

  test("transient error bodies are canceled before the unchanged result retry", async () => {
    const { request, receipt, client } = fixture();
    let calls = 0;
    let bodyReads = 0;
    let bodyCancels = 0;
    await withTransport(async () => {
      if (++calls === 2) return Response.json(receipt);
      const response = new Response(new ReadableStream({ cancel() { bodyCancels++; } }), { status: 503 });
      Object.defineProperty(response, "json", { value: async () => { bodyReads++; throw new Error("Error body must not be read"); } });
      return response;
    }, async () => {
      expect(await client.submit(request)).toEqual(receipt);
      expect(calls).toBe(2);
      expect(bodyReads).toBe(0);
      expect(bodyCancels).toBe(1);
    });
  });

  test("serializes validated identity unchanged across retry and accepts the matching receipt", async () => {
    const { nodeId, token, request, receipt, client } = fixture();
    const bodies: string[] = [];
    await withTransport(async wire => {
      expect(wire.url).toBe("https://coordinator.invalid/v1/node/jobs/result");
      expect(wire.method).toBe("POST");
      expect(wire.redirect).toBe("manual");
      expect(wire.headers.get("content-type")).toBe("application/json");
      expect(wire.headers.get("authorization")).toBe(`Bearer ${token}`);
      expect(wire.headers.get("user-agent")).toBe(CRAWLER_USER_AGENT);
      expect(CRAWLER_USER_AGENT).toMatch(/^VRCPDiscoveryBot\//);
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

  test("claim, heartbeat and result reject redirects without a retry or body read", async () => {
    const { request, client } = fixture();
    for (const status of [301, 302, 303, 307, 308]) {
      for (const operation of [() => client.claim(), () => client.heartbeat("idle"), () => client.submit(request)]) {
        let calls = 0;
        let bodyReads = 0;
        let bodyCancels = 0;
        await withTransport(async wire => {
          calls++;
          expect(wire.redirect).toBe("manual");
          const response = new Response(new ReadableStream({ cancel() { bodyCancels++; } }), { status,
            headers: { location: "http://unreviewed.invalid/receive" } });
          Object.defineProperty(response, "json", { value: async () => { bodyReads++; throw new Error("Redirect body must not be read"); } });
          return response;
        }, async () => {
          await expect(operation()).rejects.toThrow("Coordinator redirects are not allowed");
          expect(calls).toBe(1);
          expect(bodyReads).toBe(0);
          expect(bodyCancels).toBe(1);
        });
      }
    }
  });

  test("rejects coordinator responses exceeding maximum response byte limit via content-length", async () => {
    const { request, client } = fixture();
    let bodyCancels = 0;
    await withTransport(async () => {
      const response = new Response(new ReadableStream({ cancel() { bodyCancels++; } }), {
        status: 200,
        headers: { "content-length": String(MAX_COORDINATOR_RESPONSE_BYTES + 1) }
      });
      return response;
    }, async () => {
      await expect(client.submit(request)).rejects.toThrow("Coordinator response exceeds maximum byte limit");
      expect(bodyCancels).toBe(1);
    });
  });

  test("rejects streaming coordinator responses exceeding byte limit and cancels stream", async () => {
    const { request, client } = fixture();
    let streamCancelled = false;
    const oversizedChunk = new Uint8Array(1024 * 1024); // 1 MiB chunk
    await withTransport(async () => {
      const stream = new ReadableStream({
        pull(controller) {
          controller.enqueue(oversizedChunk);
        },
        cancel() {
          streamCancelled = true;
        }
      });
      return new Response(stream, { status: 200 });
    }, async () => {
      await expect(client.submit(request)).rejects.toThrow("Coordinator response exceeds maximum byte limit");
      expect(streamCancelled).toBe(true);
    });
  });

  test("CrawlJobSchema enforces field length bounds for url, origin, etag, and lastModified", () => {
    const baseJob = {
      jobId: "valid-job-id",
      leaseId: crypto.randomUUID(),
      platform: "vpm",
      purpose: "metadata",
      url: "https://example.org/test",
      origin: "https://example.org",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z",
      retainClasses: ["normalized_facts"],
      etag: "valid-etag",
      lastModified: "Wed, 21 Oct 2026 07:28:00 GMT"
    };

    expect(() => CrawlJobSchema.parse(baseJob)).not.toThrow();

    // Oversized URL (> 2048 chars)
    const longUrl = "https://example.org/" + "a".repeat(MAX_JOB_URL_LENGTH);
    expect(() => CrawlJobSchema.parse({ ...baseJob, url: longUrl })).toThrow();

    // Oversized origin (> 255 chars)
    const longOrigin = "https://" + "a".repeat(MAX_ORIGIN_URL_LENGTH) + ".org";
    expect(() => CrawlJobSchema.parse({ ...baseJob, origin: longOrigin })).toThrow();

    // Oversized ETag (> 256 chars)
    expect(() => CrawlJobSchema.parse({ ...baseJob, etag: "e".repeat(MAX_ETAG_LENGTH + 1) })).toThrow();

    // Oversized lastModified (> 128 chars)
    expect(() => CrawlJobSchema.parse({ ...baseJob, lastModified: "m".repeat(MAX_LAST_MODIFIED_LENGTH + 1) })).toThrow();
  });
});
