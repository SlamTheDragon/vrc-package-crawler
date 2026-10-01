import {
  ClaimRequestSchema, ClaimResponseSchema, HeartbeatRequestSchema, HeartbeatResponseSchema,
  ResultRequestSchema, ResultResponseSchema, PROTOCOL_VERSION,
  type Platform, type ClaimResponse, type HeartbeatRequest, type HeartbeatResponse,
  type ResultRequest, type ResultResponse
} from "../../shared/protocol/node_protocol.ts";

import { logger } from "../../utils/logging/logger.ts";

export class CoordinatorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    readonly nodeId: string,
    readonly capabilities: Platform[]
  ) {
    if (!coordinatorEndpointAllowed(baseUrl)) {
      // Validates dual-mode operation:
      // 1. Remote Cloudflare Worker production instances over HTTPS (https://*)
      // 2. Local coordinator simulation over HTTP strictly on loopback (http://localhost:*, http://127.0.0.1:*, http://[::1]:*)
      // Plain HTTP across non-loopback addresses (e.g., http://192.168.1.10:8787 or http://example.com) is rejected
      // to prevent bearer token leakage over unencrypted networks.
      throw new Error("Coordinator URL must be HTTPS, or HTTP on loopback without credentials");
    }
    if (!token) throw new Error("Node credential is required");
    ClaimRequestSchema.parse({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities });
  }

  private async post(path: string, payload: unknown, timeoutMs = 30_000): Promise<unknown> {
    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs)
      });
      const json: unknown = await response.json();
      if (!response.ok) {
        logger.error(`Coordinator request to ${path} returned status ${response.status}`, json);
        throw new Error(`Coordinator ${response.status}: ${JSON.stringify(json)}`);
      }
      return json;
    } catch (err) {
      logger.error(`Coordinator POST ${path} failed`, err);
      throw err;
    }
  }

  async claim(): Promise<ClaimResponse> {
    return ClaimResponseSchema.parse(await this.post("/v1/node/jobs/claim", {
      schemaVersion: PROTOCOL_VERSION, nodeId: this.nodeId, capabilities: this.capabilities
    }));
  }

  async heartbeat(state: HeartbeatRequest["state"], activeJobId?: string, activeLeaseId?: string): Promise<HeartbeatResponse> {
    const payload = HeartbeatRequestSchema.parse({ schemaVersion: PROTOCOL_VERSION,
      nodeId: this.nodeId, capabilities: this.capabilities, state,
      ...(activeJobId ? { activeJobId } : {}), ...(activeLeaseId ? { activeLeaseId } : {}) });
    return HeartbeatResponseSchema.parse(await this.post("/v1/node/heartbeat", payload, 5_000));
  }

  async submit(request: Omit<ResultRequest, "schemaVersion" | "nodeId">): Promise<ResultResponse> {
    const payload = ResultRequestSchema.parse({ ...request, schemaVersion: PROTOCOL_VERSION, nodeId: this.nodeId });
    return ResultResponseSchema.parse(await this.post("/v1/node/jobs/result", payload));
  }
}

/**
 * Shared by runtime config and the client so local and remote endpoint rules cannot drift.
 * Dual-mode operation:
 * - Remote Cloudflare Worker production instances over HTTPS (https://*)
 * - Local coordinator simulation over HTTP strictly on loopback (localhost, 127.0.0.1, [::1])
 * - Rejects non-loopback plain HTTP (e.g. http://192.168.1.10:8787 or http://external-host:8787)
 *   and embedded credentials/hashes to prevent bearer token leakage.
 */
export function coordinatorEndpointAllowed(baseUrl: string): boolean {
  try {
    const endpoint = new URL(baseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname.toLowerCase());
    return (endpoint.protocol === "https:" || (endpoint.protocol === "http:" && loopback)) &&
      !endpoint.username && !endpoint.password && !endpoint.hash;
  } catch { return false; }
}
