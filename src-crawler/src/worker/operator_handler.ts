import { CoordinatorConflict, readJson } from "./handler.ts";
import { ApproveLeadSchema, LeadActionResponseSchema, LeadListResponseSchema, LeadStatusSchema,
  OPERATOR_PROTOCOL_VERSION, RejectLeadSchema, AutoQueueRuleListResponseSchema, AutoQueueRuleResponseSchema,
  CreateAutoQueueRuleSchema, DisableAutoQueueRuleSchema, decodeLeadCursor, decodeRuleCursor,
  IssueNodeCredentialSchema, NodeCredentialResponseSchema, CatalogListResponseSchema,
  decodeCatalogCursor, type IssueNodeCredential,
  type AutoQueueRule, type CreateAutoQueueRule, type LeadCursor, type LeadRow,
  type RuleCursor, type CatalogCursor, type CatalogPackage } from "../shared/operator_protocol.ts";
import { CreateSourceAccessProfileSchema, DisableSourceAccessProfileSchema,
  SourceAccessProfileListResponseSchema, SourceAccessProfileResponseSchema,
  decodeProfileCursor, type CreateSourceAccessProfile, type SourceAccessProfile,
  type ProfileCursor } from "../shared/source_access_profile.ts";

/** Runtime-neutral boundary for local SQLite now and a future Worker storage adapter. */
export interface OperatorStore {
  issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<string> | string;
  listLeadsPage(status: "pending_review" | "approved" | "rejected", limit: number,
    cursor: LeadCursor | null): Promise<{ leads: LeadRow[]; nextCursor: string | null }> |
      { leads: LeadRow[]; nextCursor: string | null };
  approveVpmListingLead(leadKey: string, minDelayMs: number, actor: string, reason: string): Promise<string> | string;
  rejectLead(leadKey: string, actor: string, reason: string): Promise<void> | void;
  listAutoQueueRulesPage(limit: number, cursor: RuleCursor | null):
    Promise<{ rules: AutoQueueRule[]; nextCursor: string | null }> |
      { rules: AutoQueueRule[]; nextCursor: string | null };
  createAutoQueueRule(input: CreateAutoQueueRule, actor: string): Promise<unknown> | unknown;
  disableAutoQueueRule(ruleId: string, actor: string, reason: string): Promise<unknown> | unknown;
  listSourceAccessProfilesPage(limit: number, cursor: ProfileCursor | null):
    Promise<{ profiles: SourceAccessProfile[]; nextCursor: string | null }> |
      { profiles: SourceAccessProfile[]; nextCursor: string | null };
  createSourceAccessProfile(input: CreateSourceAccessProfile, actor: string):
    Promise<SourceAccessProfile> | SourceAccessProfile;
  disableSourceAccessProfile(profileId: string, actor: string, reason: string):
    Promise<SourceAccessProfile> | SourceAccessProfile;
  listCanonicalPackagesPage(limit: number, cursor: CatalogCursor | null):
    Promise<{ packages: CatalogPackage[]; nextCursor: string | null }> |
      { packages: CatalogPackage[]; nextCursor: string | null };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: OPERATOR_PROTOCOL_VERSION, code, error: message }, status);
}

async function authorized(request: Request, configuredToken: string): Promise<boolean> {
  if (!/^[a-fA-F0-9]{64}$/.test(configuredToken)) return false;
  const supplied = request.headers.get("authorization") || "";
  if (!/^Bearer [a-fA-F0-9]{64}$/.test(supplied)) return false;
  const encoder = new TextEncoder();
  const [expected, received] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(configuredToken)),
    crypto.subtle.digest("SHA-256", encoder.encode(supplied.slice(7)))
  ]);
  const a = new Uint8Array(expected);
  const b = new Uint8Array(received);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

/** Separate operator boundary. Node credentials never grant these controls. */
export async function handleOperatorRequest(
  request: Request, store: OperatorStore, configuredToken: string
): Promise<Response> {
  const url = new URL(request.url);
  const leadAction = /^\/v1\/operator\/leads\/([a-f0-9]{64})\/(approve|reject)$/.exec(url.pathname);
  const listing = request.method === "GET" && url.pathname === "/v1/operator/leads";
  const ruleListing = request.method === "GET" && url.pathname === "/v1/operator/autoqueue-rules";
  const ruleCreate = request.method === "POST" && url.pathname === "/v1/operator/autoqueue-rules";
  const ruleDisable = request.method === "POST" &&
    /^\/v1\/operator\/autoqueue-rules\/([a-f0-9-]{36})\/disable$/.exec(url.pathname);
  const profileListing = request.method === "GET" && url.pathname === "/v1/operator/source-profiles";
  const profileCreate = request.method === "POST" && url.pathname === "/v1/operator/source-profiles";
  const nodeIssue = request.method === "POST" && url.pathname === "/v1/operator/nodes";
  const profileDisable = request.method === "POST" &&
    /^\/v1\/operator\/source-profiles\/([a-f0-9-]{36})\/disable$/.exec(url.pathname);
  const catalogListing = request.method === "GET" && url.pathname === "/v1/operator/catalog";
  if (!listing && !ruleListing && !ruleCreate && !ruleDisable && !profileListing && !profileCreate && !nodeIssue &&
      !profileDisable && !catalogListing && !(request.method === "POST" && leadAction)) {
    return failure(404, "not_found", "Route not found");
  }
  if (!await authorized(request, configuredToken)) {
    return failure(401, "unauthorized", "Operator bearer credential required");
  }
  if (listing) {
    const status = LeadStatusSchema.safeParse(url.searchParams.get("status") || "pending_review");
    const limit = Number(url.searchParams.get("limit") || 100);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = status.success && cursorValue ? decodeLeadCursor(cursorValue, status.data) : null;
    if (!status.success || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
        url.searchParams.getAll("status").length > 1 || url.searchParams.getAll("limit").length > 1 ||
        url.searchParams.getAll("cursor").length > 1 || (cursorValue !== null && !cursor) ||
        [...url.searchParams.keys()].some((key) => !["status", "limit", "cursor"].includes(key))) {
      return failure(400, "invalid_query", "Status, limit, or cursor is invalid");
    }
    return json(LeadListResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION,
      ...await store.listLeadsPage(status.data, limit, cursor) }));
  }
  if (ruleListing) {
    const limit = Number(url.searchParams.get("limit") || 100);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeRuleCursor(cursorValue) : null;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        url.searchParams.getAll("limit").length > 1 ||
        url.searchParams.getAll("cursor").length > 1 || (cursorValue !== null && !cursor) ||
        [...url.searchParams.keys()].some((key) => !["limit", "cursor"].includes(key))) {
      return failure(400, "invalid_query", "Rule limit or cursor is invalid");
    }
    return json(AutoQueueRuleListResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION,
      ...await store.listAutoQueueRulesPage(limit, cursor) }));
  }
  if (profileListing) {
    const limit = Number(url.searchParams.get("limit") || 100);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeProfileCursor(cursorValue) : null;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        url.searchParams.getAll("limit").length > 1 ||
        url.searchParams.getAll("cursor").length > 1 || (cursorValue !== null && !cursor) ||
        [...url.searchParams.keys()].some(key => !["limit", "cursor"].includes(key))) {
      return failure(400, "invalid_query", "Profile limit or cursor is invalid");
    }
    return json(SourceAccessProfileListResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION,
      ...await store.listSourceAccessProfilesPage(limit, cursor) }));
  }
  if (catalogListing) {
    const limit = Number(url.searchParams.get("limit") || 100);
    const cursorValue = url.searchParams.get("cursor");
    const cursor = cursorValue ? decodeCatalogCursor(cursorValue) : null;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        url.searchParams.getAll("limit").length > 1 ||
        url.searchParams.getAll("cursor").length > 1 || (cursorValue !== null && !cursor) ||
        [...url.searchParams.keys()].some(key => !["limit", "cursor"].includes(key))) {
      return failure(400, "invalid_query", "Catalog limit or cursor is invalid");
    }
    return json(CatalogListResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION,
      ...await store.listCanonicalPackagesPage(limit, cursor) }));
  }
  let body: unknown;
  try { body = await readJson(request); }
  catch (error) {
    if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
    if (error instanceof CoordinatorConflict) return failure(415, "invalid_payload", error.message);
    return failure(400, "bad_json", "Request body must be bounded valid JSON");
  }
  try {
    if (nodeIssue) {
      const parsed = IssueNodeCredentialSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Node credential body is invalid");
      const token = await store.issueNodeCredential(parsed.data, "operator-api");
      return json(NodeCredentialResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION,
        nodeId: parsed.data.nodeId, capabilities: parsed.data.capabilities, token }), 201);
    }
    if (profileCreate) {
      const parsed = CreateSourceAccessProfileSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Source profile body is invalid");
      const profile = await store.createSourceAccessProfile(parsed.data, "operator-api");
      return json(SourceAccessProfileResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION,
        profile }), 201);
    }
    if (profileDisable) {
      const parsed = DisableSourceAccessProfileSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Disable body is invalid");
      const profile = await store.disableSourceAccessProfile(profileDisable[1], "operator-api",
        parsed.data.reason);
      return json(SourceAccessProfileResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION,
        profile }));
    }
    if (ruleCreate) {
      const parsed = CreateAutoQueueRuleSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Auto-queue rule body is invalid");
      const rule = await store.createAutoQueueRule(parsed.data, "operator-api");
      return json(AutoQueueRuleResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, rule }), 201);
    }
    if (ruleDisable) {
      const parsed = DisableAutoQueueRuleSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Disable body is invalid");
      const rule = await store.disableAutoQueueRule(ruleDisable[1], "operator-api", parsed.data.reason);
      return json(AutoQueueRuleResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION, rule }));
    }
    const [, leadKey, action] = leadAction!;
    if (action === "approve") {
      const parsed = ApproveLeadSchema.safeParse(body);
      if (!parsed.success) return failure(400, "invalid_payload", "Approval body is invalid");
      const jobId = await store.approveVpmListingLead(leadKey, parsed.data.minDelayMs ?? 1000,
        "operator-api", parsed.data.reason);
      return json(LeadActionResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION,
        leadKey, status: "approved", jobId }));
    }
    const parsed = RejectLeadSchema.safeParse(body);
    if (!parsed.success) return failure(400, "invalid_payload", "Rejection body is invalid");
    await store.rejectLead(leadKey, "operator-api", parsed.data.reason);
    return json(LeadActionResponseSchema.parse({ schemaVersion: OPERATOR_PROTOCOL_VERSION,
      leadKey, status: "rejected" }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operator action failed";
    const missing = message === "Lead not found" || message === "Rule not found" ||
      message === "Source profile not found";
    return failure(missing ? 404 : 409, missing ? "not_found" : "conflict", message);
  }
}
