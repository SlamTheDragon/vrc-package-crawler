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
  CatalogRandomResponseSchema,
  type RegisterAppRequest,
  type RegisterAppResponse,
  type DownstreamFeedbackRequest,
  type DownstreamFeedbackResponse,
  type ReportSubmissionRequest,
  type ReportSubmissionResponse,
  type CatalogSearchRequest,
  type CatalogSearchResponse,
  type CatalogRandomResponse
} from "../../../../src-crawler/src/shared/protocol/downstream_protocol.ts";
import { PlatformSchema, type Platform } from "../../../../src-crawler/src/shared/protocol/node_protocol.ts";
import type { CatalogPackage } from "../../../../src-crawler/src/shared/protocol/operator_protocol.ts";
import { readJson, CoordinatorConflict } from "./handler.ts";
import { workerLogger } from "../worker_logger.ts";

export interface DownstreamStore {
  registerApp(input: RegisterAppRequest): Promise<RegisterAppResponse> | RegisterAppResponse;
  authenticateApp(appToken: string): Promise<{ appId: string; appName: string; permissions: string[] } | null> |
    { appId: string; appName: string; permissions: string[] } | null;
  recordDownstreamFeedback(appId: string, input: DownstreamFeedbackRequest): Promise<DownstreamFeedbackResponse> |
    DownstreamFeedbackResponse;
  getRandomCatalogPackages(limit: number, filter?: { umbrella?: string; category?: string; platform?: Platform }):
    Promise<CatalogPackage[]> | CatalogPackage[];
  searchCatalogPackages(input: CatalogSearchRequest): Promise<CatalogSearchResponse> | CatalogSearchResponse;
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
  store: DownstreamStore
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const isRegister = request.method === "POST" && path === "/v1/app/register";
  const isFeedback = request.method === "POST" && path === "/v1/app/reports";
  const isSearch = request.method === "POST" && path === "/v1/app/index/search";
  const isRandom = request.method === "GET" && path === "/v1/app/index/random";

  if (!isRegister && !isFeedback && !isSearch && !isRandom) {
    return failure(404, "not_found", "Route not found");
  }

  // 1. App Registration (Unauthenticated)
  if (isRegister) {
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
      const response = await store.registerApp(parsed.data);
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

  // 3. Consolidated Reporting Route (/v1/app/reports) per API_ROUTES.md §2.4
  if (isFeedback) {
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
          canonicalId: data.canonicalId
        }
      };
    } else if (feedbackParsed && feedbackParsed.success) {
      feedbackInput = feedbackParsed.data;
    } else {
      return failure(400, "invalid_payload", "Invalid payload");
    }

    try {
      const response = await store.recordDownstreamFeedback(app.appId, feedbackInput);
      return json({
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        status: "accepted",
        reportId: response.signalId,
        signalId: response.signalId,
        recordedAt: response.recordedAt
      }, 200);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Feedback ingestion failed";
      workerLogger.error("Failed to record downstream feedback", error, { path, appId: app.appId });
      return failure(500, "internal_error", msg);
    }
  }

  // 4. Configurable Multi-Facet Search
  if (isSearch) {
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
      const response = await store.searchCatalogPackages(parsed.data);
      return json(CatalogSearchResponseSchema.parse(response), 200);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Catalog search failed";
      workerLogger.error("Failed to execute catalog search", error, { path, appId: app.appId });
      return failure(500, "internal_error", msg);
    }
  }

  // 5. Random Entry Selection / Sampling
  if (isRandom) {
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam !== null ? Number(limitParam) : 10;
    const umbrella = url.searchParams.get("umbrella") || undefined;
    const category = url.searchParams.get("category") || undefined;
    const platformParam = url.searchParams.get("platform");

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return failure(400, "invalid_query", "Limit must be an integer between 1 and 50");
    }

    if (umbrella && !["tools", "assets", "avatars"].includes(umbrella)) {
      return failure(400, "invalid_query", "Invalid umbrella filter");
    }

    let platform: Platform | undefined;
    if (platformParam) {
      const parsedPlatform = PlatformSchema.safeParse(platformParam);
      if (!parsedPlatform.success) {
        return failure(400, "invalid_query", "Invalid platform filter");
      }
      platform = parsedPlatform.data;
    }

    try {
      const items = await store.getRandomCatalogPackages(limit, {
        umbrella: umbrella as any,
        category,
        platform
      });
      return json(CatalogRandomResponseSchema.parse({
        schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
        items
      }), 200);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Random catalog selection failed";
      workerLogger.error("Failed to sample catalog packages", error, { path, appId: app.appId });
      return failure(500, "internal_error", msg);
    }
  }

  return failure(404, "not_found", "Route not found");
}

export function createDownstreamHandler(store: DownstreamStore): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (
      path === "/v1/app/register" ||
      path === "/v1/app/reports" ||
      path === "/v1/app/index/search" ||
      path === "/v1/app/index/random"
    ) {
      return handleDownstreamRequest(request, store);
    }
    return null;
  };
}
