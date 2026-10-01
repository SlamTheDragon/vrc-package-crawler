import { describe, expect, test } from "bun:test";
import { fetchPublicMetadata, UnsafeMetadataTarget } from "../src/node/client/public_metadata_fetch.ts";
import { fetchJobOutcome } from "../src/node/adapters/observation_adapter.ts";
import { CrawlJobSchema } from "../src/shared/protocol/node_protocol.ts";
import { CoordinatorClient } from "../src/node/client/coordinator_client.ts";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import https from "node:https";

const job = CrawlJobSchema.parse({ jobId: "safe-fetch-test", leaseId: "c2dd6562-6fa4-4cd2-84ae-0c090ba29733",
  platform: "vpm", purpose: "metadata", url: "https://example.org/index.json", origin: "https://example.org",
  leaseExpiresAt: "2026-09-27T00:05:00.000Z", retainClasses: ["normalized_facts", "creator_prose"],
  etag: null, lastModified: null });

describe("standalone node public metadata transport", () => {
  test("node credentials cannot be sent to a cleartext non-loopback coordinator", () => {
    for (const url of ["http://example.org:8787", "http://192.168.1.2:8787", "http://user:pass@127.0.0.1:8787"]) {
      expect(() => new CoordinatorClient(url, "token", "node-a", ["vpm"])).toThrow();
    }
    expect(() => new CoordinatorClient("http://127.0.0.1:8787", "token", "node-a", ["vpm"])).not.toThrow();
    expect(() => new CoordinatorClient("https://example.org", "token", "node-a", ["vpm"])).not.toThrow();
  });

  test("rejects private, mixed public/private, and empty DNS answers before any socket", async () => {
    for (const addresses of [
      [{ address: "127.0.0.1", family: 4 }],
      [{ address: "1.1.1.1", family: 4 }, { address: "10.0.0.1", family: 4 }],
      [{ address: "fc00::1", family: 6 }], []
    ]) {
      await expect(fetchPublicMetadata(job.url, {}, async () => addresses)).rejects.toBeInstanceOf(UnsafeMetadataTarget);
    }
  });

  test("rejects non-HTTPS, embedded credentials, and nonstandard ports before DNS", async () => {
    let lookups = 0;
    const resolve = async () => { lookups++; return [{ address: "1.1.1.1", family: 4 }]; };
    for (const url of ["http://example.org/index.json", "https://user:pass@example.org/index.json",
      "https://example.org:8443/index.json", "https://example.org/index.json#fragment",
      "https://example.org./index.json"]) {
      await expect(fetchPublicMetadata(url, {}, resolve)).rejects.toBeInstanceOf(UnsafeMetadataTarget);
    }
    expect(lookups).toBe(0);
  });

  test("rejects a known robots-disallowed itch search path before DNS", async () => {
    let lookups = 0;
    await expect(fetchPublicMetadata("https://itch.io/search?q=vrchat", {}, async () => {
      lookups++;
      return [{ address: "1.1.1.1", family: 4 }];
    })).rejects.toBeInstanceOf(UnsafeMetadataTarget);
    expect(lookups).toBe(0);
  });

  test("unsafe destination becomes a blocked outcome rather than a retry loop", async () => {
    const outcome = await fetchJobOutcome(job, (input, init) =>
      fetchPublicMetadata(input, init, async () => [{ address: "192.168.1.1", family: 4 }]));
    expect(outcome).toEqual({ kind: "blocked", reason: "Metadata target resolves to a private or reserved address" });
  });

  test("connects to the checked IP with original Host/SNI and does not follow a redirect", async () => {
    let options: any;
    const requestHttps = ((requestOptions: any, callback: (response: any) => void) => {
      options = requestOptions;
      const req = Object.assign(new EventEmitter(), {
        end() {
          const response = Object.assign(new PassThrough(), { statusCode: 302, statusMessage: "Found",
            headers: { location: "https://127.0.0.1/private" } });
          callback(response);
          response.end("moved");
        },
        destroy(error: Error) { req.emit("error", error); }
      });
      return req;
    }) as unknown as typeof https.request;
    const response = await fetchPublicMetadata("https://example.org/path?q=1", { headers: { "user-agent": "test" } },
      async () => [{ address: "1.1.1.1", family: 4 }], requestHttps);
    expect(options.hostname).toBe("1.1.1.1");
    expect(options.servername).toBe("example.org");
    expect(options.path).toBe("/path?q=1");
    expect(options.headers.host).toBe("example.org");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://127.0.0.1/private");
  });

  test("aborts an oversized response before buffering its body", async () => {
    const requestHttps = ((_options: any, callback: (response: any) => void) => {
      const req = Object.assign(new EventEmitter(), {
        end() {
          callback(Object.assign(new PassThrough(), { statusCode: 200,
            headers: { "content-length": "2000001" } }));
        },
        destroy(error: Error) { req.emit("error", error); }
      });
      return req;
    }) as unknown as typeof https.request;
    await expect(fetchPublicMetadata("https://example.org/index.json", {},
      async () => [{ address: "1.1.1.1", family: 4 }], requestHttps)).rejects.toThrow("exceeds 2 MB");
  });

  test("rejects streamed oversize even when Content-Length is absent", async () => {
    let destroyed = false;
    const requestHttps = ((_options: any, callback: (response: any) => void) => {
      const response = Object.assign(new PassThrough(), { statusCode: 200, headers: {} });
      const req = Object.assign(new EventEmitter(), {
        end() {
          callback(response);
          response.write(Buffer.alloc(1_000_000));
          response.write(Buffer.alloc(1_000_001));
        },
        destroy(error: Error) {
          destroyed = true;
          response.destroy(error);
          req.emit("error", error);
        }
      });
      return req;
    }) as unknown as typeof https.request;
    await expect(fetchPublicMetadata(job.url, {}, async () => [{ address: "1.1.1.1", family: 4 }], requestHttps))
      .rejects.toThrow("exceeds 2 MB");
    expect(destroyed).toBe(true);
  });

  test("an aborted lease cannot open a socket after DNS resolution", async () => {
    const controller = new AbortController();
    let sockets = 0;
    const requestHttps = (() => {
      sockets++;
      throw new Error("socket must not open");
    }) as unknown as typeof https.request;
    await expect(fetchPublicMetadata(job.url, { signal: controller.signal }, async () => {
      controller.abort();
      return [{ address: "1.1.1.1", family: 4 }];
    }, requestHttps)).rejects.toThrow();
    expect(sockets).toBe(0);
    let lookups = 0;
    await expect(fetchPublicMetadata(job.url, { signal: controller.signal }, async () => {
      lookups++;
      return [{ address: "1.1.1.1", family: 4 }];
    }, requestHttps)).rejects.toThrow();
    expect(lookups).toBe(0);
  });
});
