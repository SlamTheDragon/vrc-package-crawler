import {
  ClaimRequestSchema, ClaimResponseSchema, HeartbeatRequestSchema, HeartbeatResponseSchema,
  ResultRequestSchema, ResultResponseSchema, PROTOCOL_VERSION,
  type Platform, type ClaimResponse, type HeartbeatRequest, type HeartbeatResponse,
  type ResultRequest, type ResultResponse
} from "../shared/node_protocol.ts";

export class CoordinatorClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    readonly nodeId: string,
    readonly capabilities: Platform[]
  ) {
    const endpoint = new URL(baseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname.toLowerCase());
    if ((endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && loopback)) ||
        endpoint.username || endpoint.password || endpoint.hash) {
      throw new Error("Coordinator URL must be HTTPS, or HTTP on loopback without credentials");
    }
    if (!token) throw new Error("Node credential is required");
    ClaimRequestSchema.parse({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities });
  }

  private async post(path: string, payload: unknown, timeoutMs = 30_000): Promise<unknown> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs)
    });
    const json: unknown = await response.json();
    if (!response.ok) throw new Error(`Coordinator ${response.status}: ${JSON.stringify(json)}`);
    return json;
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
