import {
  ClaimRequestSchema, ClaimResponseSchema, HeartbeatRequestSchema, HeartbeatResponseSchema, PROTOCOL_VERSION,
  ResultRequestSchema, ResultResponseSchema,
  type ClaimRequest, type ClaimResponse, type HeartbeatRequest, type HeartbeatResponse, type ResultRequest, type ResultResponse,
  type Platform
} from "../shared/node_protocol.ts";

export interface NodePrincipal {
  nodeId: string;
  capabilities: Platform[];
  /** Opaque credential generation used to reject auth/lease races after rotation. */
  credentialVersion: string;
}

/** Runtime-neutral storage boundary. A local SQLite adapter implements this first. */
export interface CoordinatorStore {
  authenticate(nodeId: string, bearer: string): Promise<NodePrincipal | null> | NodePrincipal | null;
  claim(request: ClaimRequest, principal: NodePrincipal): Promise<ClaimResponse> | ClaimResponse;
  heartbeat(request: HeartbeatRequest, principal: NodePrincipal): Promise<HeartbeatResponse> | HeartbeatResponse;
  submit(request: ResultRequest, principal: NodePrincipal): Promise<ResultResponse> | ResultResponse;
}

export class CoordinatorConflict extends Error {
  constructor(message: string, public readonly status: 403 | 404 | 409 = 409) { super(message); }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: PROTOCOL_VERSION, error: message, code }, status);
}

/** Bound bytes before parsing, regardless of Content-Length accuracy. */
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new CoordinatorConflict("Content-Type must be application/json", 403);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing JSON body");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256 * 1024) {
      await reader.cancel();
      throw new RangeError("Payload exceeds 256 KiB");
    }
    parts.push(value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { combined.set(part, offset); offset += part.byteLength; }
  return JSON.parse(new TextDecoder().decode(combined));
}

/** Same handler is used in-process, by local Bun HTTP, and later by a Worker adapter. */
export async function handleNodeRequest(request: Request, store: CoordinatorStore): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method !== "POST" || !["/v1/node/jobs/claim", "/v1/node/jobs/result", "/v1/node/heartbeat"].includes(path)) {
    return failure(404, "not_found", "Route not found");
  }

  let payload: unknown;
  try {
    payload = await readJson(request);
  } catch (error) {
    if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
    if (error instanceof CoordinatorConflict) return failure(415, "invalid_payload", error.message);
    return failure(400, "bad_json", "Request body must be valid JSON");
  }

  const isClaim = path.endsWith("/claim");
  const isHeartbeat = path.endsWith("/heartbeat");
  const parsed = isClaim ? ClaimRequestSchema.safeParse(payload) :
    isHeartbeat ? HeartbeatRequestSchema.safeParse(payload) : ResultRequestSchema.safeParse(payload);
  if (!parsed.success) return failure(400, "invalid_payload", parsed.error.issues.map((issue) => issue.path.join(".") || "body").join(", "));

  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) return failure(401, "unauthorized", "Node bearer credential required");
  const nodeId = parsed.data.nodeId;
  const principal = await store.authenticate(nodeId, auth.slice(7).trim());
  if (!principal) return failure(401, "unauthorized", "Invalid node credential");

  try {
    if (isClaim) {
      const response = await store.claim(parsed.data as ClaimRequest, principal);
      return json(ClaimResponseSchema.parse(response));
    }
    if (isHeartbeat) {
      const response = await store.heartbeat(parsed.data as HeartbeatRequest, principal);
      return json(HeartbeatResponseSchema.parse(response));
    }
    const response = await store.submit(parsed.data as ResultRequest, principal);
    return json(ResultResponseSchema.parse(response));
  } catch (error) {
    if (error instanceof CoordinatorConflict) {
      const code = error.status === 403 ? "forbidden" : error.status === 404 ? "not_found" : "conflict";
      return failure(error.status, code, error.message);
    }
    return failure(500, "internal_error", "Coordinator request failed");
  }
}
