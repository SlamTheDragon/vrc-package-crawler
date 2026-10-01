import {
  DOWNSTREAM_PROTOCOL_VERSION,
  RegisterAppRequestSchema,
  RegisterAppResponseSchema,
  RegisterNodeRequestSchema,
  RegisterNodeResponseSchema,
  DelistRequestSchema,
  DelistResponseSchema,
  type RegisterAppRequest,
  type RegisterAppResponse,
  type RegisterNodeRequest,
  type RegisterNodeResponse,
  type DelistRequest,
  type DelistResponse
} from "../../shared/protocol/downstream_protocol.ts";
import { IssueNodeCredentialSchema, type IssueNodeCredential } from "../../shared/protocol/operator_protocol.ts";
import { readJson, CoordinatorConflict } from "./handler.ts";
import { workerLogger } from "../worker_logger.ts";

export interface UserPrincipal {
  userId: string;
  userName: string;
}

/**
 * Boundary for user-scoped storage operations.
 * Users are distinct from admin operators (infrastructure control)
 * and from downstream apps (catalog consumers). Users register nodes
 * and apps on their behalf, and submit delisting requests for content they own.
 */
export interface UserStore {
  /** Authenticates a vrcp_usr_ bearer token. */
  authenticateUser(token: string): Promise<UserPrincipal | null> | UserPrincipal | null;
  /** Registers a downstream application on behalf of the authenticated user. */
  registerApp(input: RegisterAppRequest): Promise<RegisterAppResponse> | RegisterAppResponse;
  /** Issues a capability-encoded node token on behalf of the authenticated user. */
  issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<string> | string;
  /** Records a delisting / takedown request and immediately suppresses the target. */
  submitDelistRequest(input: {
    targetUrl?: string;
    canonicalId?: string;
    reason: string;
    requesterType: "unauthenticated_creator" | "user" | "admin_operator";
    requesterId?: string;
    proofKind?: "storefront_bio_token" | "dns_txt" | "manual_notice";
    proofValue?: string;
    contactEmail?: string;
  }): Promise<DelistResponse> | DelistResponse;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: DOWNSTREAM_PROTOCOL_VERSION, code, error: message }, status);
}

/**
 * Handles all /v1/user/* routes.
 *
 * Route map:
 *   POST /v1/user/nodes  — issue a capability-encoded node token [vrcp_usr_ auth required]
 *   POST /v1/user/apps   — register a downstream application    [vrcp_usr_ auth required]
 *   POST /v1/user/delist — unified delisting (authenticated user or unauthenticated creator proof-gated)
 */
export async function handleUserRequest(
  request: Request,
  store: UserStore
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const isNodeIssue = request.method === "POST" && path === "/v1/user/nodes";
  const isAppRegister = request.method === "POST" && path === "/v1/user/apps";
  const isDelist = request.method === "POST" && path === "/v1/user/delist";

  if (!isNodeIssue && !isAppRegister && !isDelist) {
    return failure(404, "not_found", "Route not found");
  }

  // Parse body first (shared for all routes)
  let body: unknown;
  try {
    body = await readJson(request);
  } catch (error) {
    if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
    if (error instanceof CoordinatorConflict) return failure(415, "invalid_payload", error.message);
    return failure(400, "bad_json", "Request body must be bounded valid JSON");
  }

  // Unified delisting route (POST /v1/user/delist)
  if (isDelist) {
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const user = await store.authenticateUser(token);
      if (!user) {
        workerLogger.warn("Invalid user token", { path });
        return failure(401, "unauthorized", "Invalid user credential");
      }
      const parsed = DelistRequestSchema.safeParse(body);
      if (!parsed.success) {
        return failure(400, "invalid_payload",
          parsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
      }
      try {
        const result = await store.submitDelistRequest({
          targetUrl: parsed.data.targetUrl,
          canonicalId: parsed.data.canonicalId,
          reason: parsed.data.reason,
          requesterType: "user",
          requesterId: user.userId,
          proofKind: parsed.data.proofKind,
          proofValue: parsed.data.proofValue,
          contactEmail: parsed.data.contactEmail
        });
        return json(DelistResponseSchema.parse(result), 202);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Delisting request failed";
        workerLogger.error("User delist request failed", error,
          { path, userId: user.userId });
        return failure(500, "internal_error", msg);
      }
    }

    // Unauthenticated creator opt-out — proof-gated, no user token required
    const parsed = DelistRequestSchema.safeParse(body);
    if (!parsed.success) {
      return failure(400, "invalid_payload",
        parsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }
    // proofKind is required for unauthenticated path
    if (!parsed.data.proofKind || parsed.data.proofKind === "manual_notice") {
      return failure(400, "proof_required",
        "Automated delisting requires proofKind: storefront_bio_token or dns_txt. " +
        "For manual_notice, contact the maintainer directly per LEGAL.md §9.2.");
    }
    try {
      const result = await store.submitDelistRequest({
        targetUrl: parsed.data.targetUrl,
        canonicalId: parsed.data.canonicalId,
        reason: parsed.data.reason,
        requesterType: "unauthenticated_creator",
        proofKind: parsed.data.proofKind,
        proofValue: parsed.data.proofValue,
        contactEmail: parsed.data.contactEmail
      });
      return json(DelistResponseSchema.parse(result), 202);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Delisting request failed";
      workerLogger.error("Public delist request failed", error, { path });
      return failure(500, "internal_error", msg);
    }
  }

  // All remaining /v1/user/* routes require vrcp_usr_ bearer auth
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return failure(401, "unauthorized", "User bearer credential required (vrcp_usr_)");
  }
  const token = authHeader.slice(7).trim();
  const user = await store.authenticateUser(token);
  if (!user) {
    workerLogger.warn("Invalid user token", { path });
    return failure(401, "unauthorized", "Invalid user credential");
  }

  if (isAppRegister) {
    const parsed = RegisterAppRequestSchema.safeParse(body);
    if (!parsed.success) {
      return failure(400, "invalid_payload",
        parsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }
    try {
      const response = await store.registerApp(parsed.data);
      return json(RegisterAppResponseSchema.parse(response), 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "App registration failed";
      workerLogger.error("User app registration failed", error, { path, userId: user.userId });
      return failure(500, "internal_error", msg);
    }
  }

  if (isNodeIssue) {
    const nodeReqParsed = RegisterNodeRequestSchema.safeParse(body);
    if (!nodeReqParsed.success) {
      return failure(400, "invalid_payload",
        nodeReqParsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }
    const credentialInput: IssueNodeCredential = {
      schemaVersion: 1,
      nodeId: nodeReqParsed.data.nodeId,
      capabilities: nodeReqParsed.data.requestedCapabilities,
      reason: nodeReqParsed.data.reason || `User self-service: ${user.userName}`
    };
    const credParsed = IssueNodeCredentialSchema.safeParse(credentialInput);
    if (!credParsed.success) {
      return failure(400, "invalid_payload",
        credParsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }
    try {
      const token = await store.issueNodeCredential(credParsed.data,
        `user:${user.userId}`);
      // Parse capability bitmask out of the issued token
      const capabilities = credParsed.data.capabilities ?? [];
      const response: RegisterNodeResponse = {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        nodeId: nodeReqParsed.data.nodeId,
        capabilities: capabilities as RegisterNodeResponse["capabilities"],
        token
      };
      return json(RegisterNodeResponseSchema.parse(response), 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Node registration failed";
      workerLogger.error("User node registration failed", error,
        { path, userId: user.userId, nodeId: nodeReqParsed.data.nodeId });
      if (msg.includes("conflict") || msg.includes("already")) return failure(409, "conflict", msg);
      return failure(500, "internal_error", msg);
    }
  }

  return failure(404, "not_found", "Route not found");
}

export function createUserHandler(
  store: UserStore
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/v1/user/")) {
      return handleUserRequest(request, store);
    }
    return null;
  };
}
