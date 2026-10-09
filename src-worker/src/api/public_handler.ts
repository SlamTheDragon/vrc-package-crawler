import {
  CATALOG_PROTOCOL_VERSION,
  PublicCatalogListResponseSchema,
  CatalogDeltaResponseSchema,
  decodeCatalogDeltaCursor,
  type CatalogDeltaCursor,
  type CatalogDelta,
  decodeCatalogCursor,
  type CatalogCursor,
  type CatalogPackage
} from "vrc-packages-api";
import { workerLogger } from "../worker_logger.ts";
import {
  extractClientIp,
  RATE_LIMIT_POLICIES,
  rateLimitResponse,
  applyRateLimitHeaders,
  defaultRateLimiter,
  type IRateLimiter
} from "./rate_limiter.ts";

export interface PublicCatalogStore {
  getCatalogEpoch(): Promise<string> | string;
  listCanonicalPackagesPage(
    limit: number,
    cursor: CatalogCursor | null,
    options?: { includeAllRatings?: boolean }
  ): Promise<{ packages: CatalogPackage[]; nextCursor: string | null }> |
     { packages: CatalogPackage[]; nextCursor: string | null };
  listCatalogDeltasPage(
    limit: number,
    cursor: CatalogDeltaCursor | null
  ): Promise<{ epoch: string; deltas: CatalogDelta[]; nextCursor: string | null }> |
     { epoch: string; deltas: CatalogDelta[]; nextCursor: string | null };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
      "access-control-allow-origin": "*"
    }
  });
}

function failure(status: number, code: string, message: string): Response {
  return json({ schemaVersion: CATALOG_PROTOCOL_VERSION, code, error: message }, status);
}

export async function handlePublicCatalogRequest(
  request: Request,
  store: PublicCatalogStore,
  rateLimiter: IRateLimiter = defaultRateLimiter
): Promise<Response> {
  const url = new URL(request.url);
  const isCatalog = request.method === "GET" && url.pathname === "/v1/app/index";
  const isDelta = request.method === "GET" && url.pathname === "/v1/app/index/delta";

  if (!isCatalog && !isDelta) {
    return failure(404, "not_found", "Route not found");
  }

  const clientIp = extractClientIp(request);
  const rateResult = rateLimiter.check(`public:${clientIp}`, RATE_LIMIT_POLICIES.PUBLIC_CATALOG);
  if (!rateResult.allowed) {
    workerLogger.warn("Public catalog rate limit exceeded", { path: url.pathname, clientIp });
    return rateLimitResponse(rateResult, CATALOG_PROTOCOL_VERSION, "Rate limit exceeded for public catalog endpoints. Please retry later.");
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam !== null ? Number(limitParam) : 50;
  const cursorValue = url.searchParams.get("cursor");

  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      url.searchParams.getAll("limit").length > 1 ||
      url.searchParams.getAll("cursor").length > 1 ||
      [...url.searchParams.keys()].some((key) => !["limit", "cursor"].includes(key))) {
    return failure(400, "invalid_query", "Catalog limit or cursor parameter is invalid");
  }

  try {
    if (isCatalog) {
      const cursor = cursorValue ? decodeCatalogCursor(cursorValue) : null;
      if (cursorValue !== null && !cursor) {
        return failure(400, "invalid_query", "Catalog cursor is invalid");
      }
      const page = await store.listCanonicalPackagesPage(limit, cursor);
      return applyRateLimitHeaders(json(PublicCatalogListResponseSchema.parse({
        schemaVersion: CATALOG_PROTOCOL_VERSION,
        ...page
      })), rateResult);
    }

    // isDelta
    const deltaCursor = cursorValue ? decodeCatalogDeltaCursor(cursorValue) : null;
    if (cursorValue !== null && !deltaCursor) {
      return failure(400, "invalid_query", "Delta cursor is invalid");
    }
    const deltaPage = await store.listCatalogDeltasPage(limit, deltaCursor);
    return applyRateLimitHeaders(json(CatalogDeltaResponseSchema.parse({
      schemaVersion: CATALOG_PROTOCOL_VERSION,
      ...deltaPage
    })), rateResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Public catalog query failed";
    workerLogger.error("Public catalog request failed", error, { path: url.pathname });
    return failure(500, "internal_error", message);
  }
}

export function createPublicCatalogHandler(
  store: PublicCatalogStore,
  rateLimiter: IRateLimiter = defaultRateLimiter
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (path !== "/v1/app/index" && path !== "/v1/app/index/delta") return null;
    return handlePublicCatalogRequest(request, store, rateLimiter);
  };
}
