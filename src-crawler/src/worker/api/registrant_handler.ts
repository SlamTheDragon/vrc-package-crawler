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

export interface RegistrantPrincipal {
  registrantId: string;
  registrantName: string;
}

/**
 * Boundary for registrant-scoped storage operations.
 * Registrants are distinct from admin operators (infrastructure control)
 * and from downstream apps (catalog consumers). Registrants register nodes
 * and apps on their behalf, and submit delisting requests for content they own.
 */
export interface RegistrantStore {
  /** Authenticates a vrcp_reg_ bearer token. */
  authenticateRegistrant(token: string): Promise<RegistrantPrincipal | null> | RegistrantPrincipal | null;
  /** Registers a downstream application on behalf of the authenticated registrant. */
  registerApp(input: RegisterAppRequest): Promise<RegisterAppResponse> | RegisterAppResponse;
  /** Issues a capability-encoded node token on behalf of the authenticated registrant. */
  issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<string> | string;
  /** Records a delisting / takedown request and immediately suppresses the target. */
  submitDelistRequest(input: {
    targetUrl?: string;
    canonicalId?: string;
    reason: string;
    requesterType: "unauthenticated_creator" | "registrant" | "admin_operator";
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
 * Handles all /v1/registrant/* and unauthenticated /v1/delist (opt-out) routes.
 *
 * Route map:
 *   POST /v1/registrant/nodes       — issue a capability-encoded node token        [vrcp_reg_ auth required]
 *   POST /v1/registrant/apps        — register a downstream application             [vrcp_reg_ auth required]
 *   POST /v1/registrant/delist      — self-service delisting on their behalf        [vrcp_reg_ auth required]
 *   POST /v1/delist                 — unauthenticated creator opt-out (proof-gated) [no auth]
 */
export async function handleRegistrantRequest(
  request: Request,
  store: RegistrantStore
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const isNodeIssue = request.method === "POST" && path === "/v1/registrant/nodes";
  const isAppRegister = request.method === "POST" && path === "/v1/registrant/apps";
  const isRegistrantDelist = request.method === "POST" && path === "/v1/registrant/delist";
  const isPublicDelist = request.method === "POST" && path === "/v1/delist";

  if (!isNodeIssue && !isAppRegister && !isRegistrantDelist && !isPublicDelist) {
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

  // Unauthenticated creator opt-out — proof-gated, no registrant token required
  if (isPublicDelist) {
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

  // All /v1/registrant/* routes require vrcp_reg_ bearer auth
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return failure(401, "unauthorized", "Registrant bearer credential required (vrcp_reg_)");
  }
  const token = authHeader.slice(7).trim();
  const registrant = await store.authenticateRegistrant(token);
  if (!registrant) {
    workerLogger.warn("Invalid registrant token", { path });
    return failure(401, "unauthorized", "Invalid registrant credential");
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
      workerLogger.error("Registrant app registration failed", error, { path, registrantId: registrant.registrantId });
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
      reason: nodeReqParsed.data.reason || `Registrant self-service: ${registrant.registrantName}`
    };
    const credParsed = IssueNodeCredentialSchema.safeParse(credentialInput);
    if (!credParsed.success) {
      return failure(400, "invalid_payload",
        credParsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }
    try {
      const token = await store.issueNodeCredential(credParsed.data,
        `registrant:${registrant.registrantId}`);
      // Parse capability bitmask out of the issued token
      const capMatch = /^vrcp_[0-9a-fA-F]{64}([0-9a-fA-F]{4})$/.exec(token);
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
      workerLogger.error("Registrant node registration failed", error,
        { path, registrantId: registrant.registrantId, nodeId: nodeReqParsed.data.nodeId });
      if (msg.includes("conflict") || msg.includes("already")) return failure(409, "conflict", msg);
      return failure(500, "internal_error", msg);
    }
  }

  if (isRegistrantDelist) {
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
        requesterType: "registrant",
        requesterId: registrant.registrantId,
        proofKind: parsed.data.proofKind,
        proofValue: parsed.data.proofValue,
        contactEmail: parsed.data.contactEmail
      });
      return json(DelistResponseSchema.parse(result), 202);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Delisting request failed";
      workerLogger.error("Registrant delist request failed", error,
        { path, registrantId: registrant.registrantId });
      return failure(500, "internal_error", msg);
    }
  }

  return failure(404, "not_found", "Route not found");
}

export function createRegistrantHandler(
  store: RegistrantStore
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/v1/registrant/") || path === "/v1/delist") {
      return handleRegistrantRequest(request, store);
    }
    return null;
  };
}
