import {
  DOWNSTREAM_PROTOCOL_VERSION,
  RegisterAppRequestSchema,
  RegisterAppResponseSchema,
  DownstreamFeedbackRequestSchema,
  DownstreamFeedbackResponseSchema,
  ReportSubmissionRequestSchema,
  ReportSubmissionResponseSchema,
  CatalogSearchRequestSchema,
  CatalogSearchResponseSchema,
  CreatorClaimIntakeRequestSchema,
  CreatorClaimIntakeResponseSchema,
  type RegisterAppRequest,
  type RegisterAppResponse,
  type DownstreamFeedbackRequest,
  type DownstreamFeedbackResponse,
  type ReportSubmissionRequest,
  type ReportSubmissionResponse,
  type CatalogSearchRequest,
  type CatalogSearchResponse,
  type CreatorClaimIntakeRequest,
  type CreatorClaimIntakeResponse
} from "vrc-packages-api";
import { readJson, CoordinatorConflict } from "./handler.js";
import { workerLogger } from "../worker_logger.ts";
import { timingSafeEqual } from "../storage/d1/utils.ts";
import {
  extractClientIp,
  RATE_LIMIT_POLICIES,
  rateLimitResponse,
  applyRateLimitHeaders,
  defaultRateLimiter,
  type IRateLimiter
} from "./rate_limiter.ts";

export interface DownstreamStore {
  recordRemovalReport(appId: string, input: ReportSubmissionRequest): Promise<ReportSubmissionResponse> | ReportSubmissionResponse;
  recordCreatorClaimIntake(appId: string, input: CreatorClaimIntakeRequest): Promise<CreatorClaimIntakeResponse> | CreatorClaimIntakeResponse;
  registerApp(input: RegisterAppRequest, ownerUserId?: string): Promise<RegisterAppResponse> | RegisterAppResponse;
  authenticateUser(token: string): Promise<{ userId: string; userName: string; ageVerified?: boolean } | null> | { userId: string; userName: string; ageVerified?: boolean } | null;
  authenticateApp(appToken: string): Promise<{ appId: string; appName: string; permissions: string[]; isAgeVerified?: boolean } | null> |
    { appId: string; appName: string; permissions: string[]; isAgeVerified?: boolean } | null;
  recordDownstreamFeedback(appId: string, input: DownstreamFeedbackRequest): Promise<DownstreamFeedbackResponse> |
    DownstreamFeedbackResponse;
  searchCatalogPackages(input: CatalogSearchRequest, options?: { isAgeVerified?: boolean }): Promise<CatalogSearchResponse> | CatalogSearchResponse;
  recordAppActivity(appId: string): Promise<void> | void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: DOWNSTREAM_PROTOCOL_VERSION, code, error: message }, status);
}

export async function handleDownstreamRequest(
  request: Request,
  store: DownstreamStore,
  operatorToken = "",
  rateLimiter: IRateLimiter = defaultRateLimiter
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const isRegister = request.method === "POST" && path === "/v1/app/register";
  const isFeedback = request.method === "POST" && path === "/v1/app/report";
  const isSearch = request.method === "POST" && path === "/v1/app/index/search";
  const isClaimIntake = request.method === "POST" && path === "/v1/app/claims/intake";

  if (!isRegister && !isFeedback && !isSearch && !isClaimIntake) {
    return failure(404, "not_found", "Route not found");
  }

  // App registration authenticates the creator before reading the payload.
  if (isRegister) {
    const clientIp = extractClientIp(request);
    const regRate = rateLimiter.check(`app:register:${clientIp}`, RATE_LIMIT_POLICIES.APP_REGISTER);
    if (!regRate.allowed) {
      workerLogger.warn("App register rate limit exceeded", { path, clientIp });
      return rateLimitResponse(regRate, DOWNSTREAM_PROTOCOL_VERSION, "Rate limit exceeded for application registration. Please retry later.");
    }

    const bearer = request.headers.get("authorization") || "";
    const token = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "";
    const operator = /^[a-fA-F0-9]{64}$/.test(operatorToken) && /^[a-fA-F0-9]{64}$/.test(token) && timingSafeEqual(token, operatorToken);
    const user = operator ? null : await store.authenticateUser(token);
    if (!operator && !user) return failure(401, "unauthorized", "User or operator credential required");
    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
      if (error instanceof CoordinatorConflict) return failure(415, "invalid_payload", error.message);
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const parsed = RegisterAppRequestSchema.safeParse(body);
    if (!parsed.success) {
      return failure(400, "invalid_payload", parsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }

    try {
      const response = await store.registerApp(parsed.data, user?.userId);
      return json(RegisterAppResponseSchema.parse(response), 201);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "App registration failed";
      workerLogger.error("Failed to register downstream app", error, { path });
      return failure(500, "internal_error", msg);
    }
  }

  // 2. All subsequent endpoints require valid downstream application bearer token
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !authHeader.slice(7).trim()) {
    workerLogger.warn("Downstream application bearer credential required", { path });
    return failure(401, "unauthorized", "Application bearer credential required");
  }

  const appToken = authHeader.slice(7).trim();
  const app = await store.authenticateApp(appToken);
  if (!app) {
    workerLogger.warn("Invalid downstream application token", { path });
    return failure(401, "unauthorized", "Invalid application token");
  }

  try {
    await store.recordAppActivity(app.appId);
  } catch (err) {
    workerLogger.warn("Failed to record application activity", { appId: app.appId }, err);
  }

  // 3. Consolidated Reporting Route (/v1/app/report) per API_ROUTES.md §2.4
  if (isFeedback) {
    const reportRate = rateLimiter.check(`app:report:${app.appId}`, RATE_LIMIT_POLICIES.APP_REPORT);
    if (!reportRate.allowed) {
      workerLogger.warn("App report rate limit exceeded", { path, appId: app.appId });
      return rateLimitResponse(reportRate, DOWNSTREAM_PROTOCOL_VERSION, "Rate limit exceeded for application report submissions. Please retry later.");
    }

    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
      if (error instanceof CoordinatorConflict) return failure(415, "invalid_payload", error.message);
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const reportParsed = ReportSubmissionRequestSchema.safeParse(body);
    const feedbackParsed = !reportParsed.success ? DownstreamFeedbackRequestSchema.safeParse(body) : null;

    if (!reportParsed.success && !feedbackParsed?.success) {
      return failure(400, "invalid_payload", reportParsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }

    if (reportParsed.success && reportParsed.data.reportType === "removal_request") {
      try {
        const response = await store.recordRemovalReport(app.appId, reportParsed.data);
        return applyRateLimitHeaders(json(ReportSubmissionResponseSchema.parse(response), 202), reportRate);
      } catch (error) {
        workerLogger.error("Failed to record removal report", error, { path, appId: app.appId });
        return failure(500, "internal_error", "Removal report could not be recorded");
      }
    }

    let feedbackInput: DownstreamFeedbackRequest;
    if (reportParsed.success) {
      const data = reportParsed.data;
      const signalType = data.signalKind ?? (data.reportType === "demand_signal" ? "search_miss" : "refresh_demand");
      feedbackInput = {
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        signalType: signalType as any,
        query: data.query,
        zeroHits: data.zeroHits,
        targetUrl: data.targetUrl,
        metadata: {
          ...data.metadata,
          reportType: data.reportType,
          reportKind: data.reportKind,
          canonicalId: data.canonicalId,
          ...(data.reason !== undefined ? { reason: data.reason } : {})
        }
      };
    } else if (feedbackParsed && feedbackParsed.success) {
      feedbackInput = feedbackParsed.data;
    } else {
      return failure(400, "invalid_payload", "Invalid payload");
    }

    try {
      const response = await store.recordDownstreamFeedback(app.appId, feedbackInput);
      return applyRateLimitHeaders(json(ReportSubmissionResponseSchema.parse({
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        status: "accepted",
        reportId: response.signalId,
        recordedAt: response.recordedAt
      }), 200), reportRate);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Feedback ingestion failed";
      workerLogger.error("Failed to record downstream feedback", error, { path, appId: app.appId });
      return failure(500, "internal_error", msg);
    }
  }

  // 4. Delegated Creator Attestation Intake (R54-C38C / R54-C38A)
  if (isClaimIntake) {
    if (!app.permissions.includes("claims:delegate")) {
      return failure(403, "forbidden", "Application is not authorized for delegated creator claims");
    }

    const claimRate = rateLimiter.check(`app:claim:${app.appId}`, RATE_LIMIT_POLICIES.APP_CLAIMS_INTAKE);
    if (!claimRate.allowed) {
      workerLogger.warn("App claim intake rate limit exceeded", { path, appId: app.appId });
      return rateLimitResponse(claimRate, DOWNSTREAM_PROTOCOL_VERSION, "Rate limit exceeded for delegated creator claims intake. Please retry later.");
    }

    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
      if (error instanceof CoordinatorConflict) return failure(415, "invalid_payload", error.message);
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const parsed = CreatorClaimIntakeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return failure(400, "invalid_payload", parsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }

    if (parsed.data.attestation.appId !== app.appId) {
      return failure(403, "forbidden", "Attestation appId does not match caller");
    }

    try {
      const response = await store.recordCreatorClaimIntake(app.appId, parsed.data);
      return applyRateLimitHeaders(json(CreatorClaimIntakeResponseSchema.parse(response), 202), claimRate);
    } catch (error) {
      if (error instanceof CoordinatorConflict) {
        return failure(error.status, "conflict", error.message);
      }
      const msg = error instanceof Error ? error.message : "Claim intake failed";
      workerLogger.error("Failed to record creator claim intake", error, { path, appId: app.appId });
      return failure(500, "internal_error", msg);
    }
  }

  // 5. Configurable Multi-Facet Search
  if (isSearch) {
    const searchRate = rateLimiter.check(`app:search:${app.appId}`, RATE_LIMIT_POLICIES.APP_SEARCH);
    if (!searchRate.allowed) {
      workerLogger.warn("App search rate limit exceeded", { path, appId: app.appId });
      return rateLimitResponse(searchRate, DOWNSTREAM_PROTOCOL_VERSION, "Rate limit exceeded for catalog searches. Please retry later.");
    }

    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      if (error instanceof RangeError) return failure(413, "invalid_payload", error.message);
      if (error instanceof CoordinatorConflict) return failure(415, "invalid_payload", error.message);
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const parsed = CatalogSearchRequestSchema.safeParse(body);
    if (!parsed.success) {
      return failure(400, "invalid_payload", parsed.error.issues.map((i) => i.path.join(".") || "body").join(", "));
    }

    try {
      const response = await store.searchCatalogPackages(parsed.data, { isAgeVerified: app.isAgeVerified ?? false });
      return applyRateLimitHeaders(json(CatalogSearchResponseSchema.parse(response), 200), searchRate);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Catalog search failed";
      workerLogger.error("Failed to execute catalog search", error, { path, appId: app.appId });
      return failure(500, "internal_error", msg);
    }
  }

  return failure(404, "not_found", "Route not found");
}

export function createDownstreamHandler(
  store: DownstreamStore,
  operatorToken = "",
  rateLimiter: IRateLimiter = defaultRateLimiter
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (
      path === "/v1/app/register" ||
      path === "/v1/app/report" ||
      path === "/v1/app/claims/intake" ||
      path === "/v1/app/index/search"
    ) {
      return handleDownstreamRequest(request, store, operatorToken, rateLimiter);
    }
    return null;
  };
}
