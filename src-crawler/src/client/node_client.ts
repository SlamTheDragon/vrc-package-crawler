import {
  ClaimRequestSchema, ClaimResponseSchema, HeartbeatRequestSchema, HeartbeatResponseSchema,
  ResultRequestSchema, ResultResponseSchema, PROTOCOL_VERSION,
  type Platform, type ClaimResponse, type HeartbeatRequest, type HeartbeatResponse,
  type ResultRequest, type ResultResponse
} from "vrc-packages-network/node";

import { logger } from "../utils/logging/logger.ts";
import { CRAWLER_USER_AGENT } from "../shared/robots/crawler_identity.ts";

/**
 * Resolves a target API path against a coordinator baseUrl without stripping subpaths.
 * e.g. baseUrl "https://edge.domain.com/vrc" + path "/v1/node/jobs/claim"
 *   -> "https://edge.domain.com/vrc/v1/node/jobs/claim"
 */
export function resolveCoordinatorUrl(baseUrl: string, path: string): URL {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  base.pathname = basePath ? `${basePath}/${cleanPath}` : `/${cleanPath}`;
  return base;
}

/**
 * Classifies transient edge gateway error codes (e.g., Cloudflare 520-524 or reverse proxy 502-504)
 * that justify bounded client retry backoff.
 */
export function isTransientEdgeStatus(status: number): boolean {
  return (status >= 520 && status <= 524) || status === 502 || status === 503 || status === 504;
}

export interface CoordinatorClientOptions {
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

/**
 * Client used by autonomous crawler nodes to communicate with the remote coordinator API.
 * Supports Cloudflare Worker edge instances over HTTPS and local loopback simulation.
 */
export class CoordinatorClient {
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    readonly nodeId: string,
    readonly capabilities: Platform[],
    options?: CoordinatorClientOptions
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
    this.maxRetries = options?.maxRetries ?? 2;
    this.retryBaseDelayMs = options?.retryBaseDelayMs ?? 250;
    if (!Number.isSafeInteger(this.maxRetries) || this.maxRetries < 0) {
      throw new Error("maxRetries must be a nonnegative safe integer");
    }
    if (!Number.isSafeInteger(this.retryBaseDelayMs) || this.retryBaseDelayMs < 0) {
      throw new Error("retryBaseDelayMs must be a nonnegative safe integer");
    }
    ClaimRequestSchema.parse({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities });
  }

  private async post(path: string, payload: unknown, timeoutMs = 30_000): Promise<unknown> {
    const targetUrl = resolveCoordinatorUrl(this.baseUrl, path);
    let attempt = 0;

    while (true) {
      attempt++;
      try {
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.token}`,
            "user-agent": CRAWLER_USER_AGENT },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs), redirect: "manual"
        });

        if (response.ok) {
          return await response.json();
        }

        await response.body?.cancel().catch(() => {});
        if (response.status >= 300 && response.status < 400) {
          throw new Error("Coordinator redirects are not allowed");
        }

        if (isTransientEdgeStatus(response.status) && attempt <= this.maxRetries) {
          const delayMs = Math.min(this.retryBaseDelayMs * Math.pow(2, attempt - 1), 2000);
          logger.warn(`Transient edge error ${response.status} from ${path}, retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        throw new Error(`Coordinator ${response.status}`);
      } catch (err) {
        const isNetworkErr = err instanceof Error && (
          err.name === "TimeoutError" ||
          err.message.includes("fetch failed") ||
          err.message.includes("ConnectionRefused")
        );

        if (isNetworkErr && attempt <= this.maxRetries) {
          const delayMs = Math.min(this.retryBaseDelayMs * Math.pow(2, attempt - 1), 2000);
          logger.warn(`Network error contacting coordinator at ${path}: ${(err as Error).message}, retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        logger.error(`Coordinator POST ${path} failed`, err);
        throw err;
      }
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
    const response = ResultResponseSchema.parse(await this.post("/v1/node/jobs/result", payload));
    if (response.jobId !== payload.jobId) throw new Error("Result receipt does not match submitted job");
    return response;
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
