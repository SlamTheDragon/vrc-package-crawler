import {
  MODERATOR_PROTOCOL_VERSION,
  ModeratorRatingListQuerySchema,
  ModeratorRatingListResponseSchema,
  ModeratorRatingRecordSchema,
  SetRatingAdjustmentRequestSchema,
  SetRatingAdjustmentResponseSchema,
  decodeModeratorRatingCursor,
  type ContentRating,
  type ModeratorRatingRecord,
  ModeratorAppRecordSchema,
  ModeratorAppListQuerySchema,
  ModeratorAppListResponseSchema,
  ModeratorReviewAppCandidateRequestSchema,
  ModeratorReviewAppCandidateResponseSchema,
  decodeOperatorAppCursor,
  type OperatorAppCursor,
  type OperatorAppRecord
} from "vrc-packages-api";
import { workerLogger } from "../worker_logger.ts";
import { readJson, CoordinatorConflict } from "./handler.ts";
import type { UserPrincipal } from "./user_handler.ts";

export interface ModeratorStore {
  authenticateUser(token: string): Promise<UserPrincipal | null> | UserPrincipal | null;
  listModeratorRatingsPage(
    rating?: ContentRating,
    limit?: number,
    cursor?: { updatedAt: string; canonicalId: string } | null
  ): Promise<{
    ratings: ModeratorRatingRecord[];
    nextCursor: string | null;
  }> | {
    ratings: ModeratorRatingRecord[];
    nextCursor: string | null;
  };
  adjustPackageRating(
    canonicalId: string,
    newRating: ContentRating,
    adjustedBy: string,
    reason: string
  ): Promise<{
    canonicalId: string;
    previousRating: ContentRating;
    newRating: ContentRating;
    adjustedBy: string;
    updatedAt: string;
  } | null> | {
    canonicalId: string;
    previousRating: ContentRating;
    newRating: ContentRating;
    adjustedBy: string;
    updatedAt: string;
  } | null;
  listOperatorAppsPage?(
    limit?: number,
    cursor?: OperatorAppCursor | null,
    candidateStatus?: string
  ): Promise<{ apps: OperatorAppRecord[]; nextCursor: string | null }> |
    { apps: OperatorAppRecord[]; nextCursor: string | null };
  reviewAppCandidate?(
    appId: string,
    input: { candidateStatus: "none" | "reviewed" | "trusted"; grantDelegation?: boolean; notes?: string },
    actor: string
  ): Promise<{ appId: string; candidateStatus: "none" | "review_pending" | "reviewed" | "trusted"; candidateFlags: string[]; delegationAllowed: boolean; permissions: string[]; reviewedAt: string }> |
    { appId: string; candidateStatus: "none" | "review_pending" | "reviewed" | "trusted"; candidateFlags: string[]; delegationAllowed: boolean; permissions: string[]; reviewedAt: string };
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
  return json({ schemaVersion: MODERATOR_PROTOCOL_VERSION, code, error: message }, status);
}

export async function handleModeratorRequest(
  request: Request,
  store: ModeratorStore
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const isRatingsList = request.method === "GET" && path === "/v1/moderator/ratings";
  const ratingAdjustMatch = request.method === "POST" ? /^\/v1\/moderator\/ratings\/([^/]+)$/.exec(path) : null;
  const isAppsList = request.method === "GET" && path === "/v1/moderator/apps";
  const appCandidateReviewMatch = request.method === "POST" ? /^\/v1\/moderator\/apps\/([^/]+)\/candidate-review$/.exec(path) : null;

  if (!isRatingsList && !ratingAdjustMatch && !isAppsList && !appCandidateReviewMatch) {
    return failure(404, "not_found", "Route not found");
  }

  // Moderator routes require vrcp_usr_ bearer auth
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return failure(401, "unauthorized", "User bearer credential required (vrcp_usr_)");
  }
  const token = authHeader.slice(7).trim();
  const user = await store.authenticateUser(token);
  if (!user) {
    workerLogger.warn("Invalid user token on moderator route", { path });
    return failure(401, "unauthorized", "Invalid user credential");
  }

  // Check moderator authority and verified age
  if (!user.isModerator || !user.ageVerified) {
    workerLogger.warn("User lacks moderator authority or verified age", {
      path,
      userId: user.userId,
      isModerator: user.isModerator,
      ageVerified: user.ageVerified
    });
    return failure(403, "forbidden", "Moderator authority with verified age required");
  }

  if (isRatingsList) {
    const rawParams = Object.fromEntries(url.searchParams);
    const parsedQuery = ModeratorRatingListQuerySchema.safeParse(rawParams);
    if (!parsedQuery.success || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length > 1)) {
      return failure(400, "invalid_query", "Invalid moderator ratings query");
    }

    const { rating, limit, cursor } = parsedQuery.data;
    const decodedCursor = cursor ? decodeModeratorRatingCursor(cursor) : null;

    try {
      const page = await store.listModeratorRatingsPage(rating, limit, decodedCursor);
      return json(ModeratorRatingListResponseSchema.parse({
        schemaVersion: MODERATOR_PROTOCOL_VERSION,
        ratings: page.ratings,
        nextCursor: page.nextCursor
      }));
    } catch (error) {
      workerLogger.error("Failed to list moderator ratings", error, { path, userId: user.userId });
      return failure(500, "internal_error", "Failed to list moderator ratings");
    }
  }

  if (ratingAdjustMatch) {
    const rawCanonicalId = decodeURIComponent(ratingAdjustMatch[1] ?? "");
    const parsedId = ModeratorRatingRecordSchema.shape.canonicalId.safeParse(rawCanonicalId);
    if (!parsedId.success) {
      return failure(400, "invalid_identifier", "Invalid canonical package ID");
    }
    const canonicalId = parsedId.data;

    let payload: unknown;
    try {
      payload = await readJson(request);
    } catch (cause) {
      if (cause instanceof RangeError) return failure(413, "invalid_payload", "Payload exceeds limit");
      if (cause instanceof CoordinatorConflict) return failure(415, "invalid_payload", "Content-Type must be application/json");
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const parsedBody = SetRatingAdjustmentRequestSchema.safeParse(payload);
    if (!parsedBody.success) {
      return failure(400, "invalid_payload", "Invalid rating adjustment payload");
    }

    try {
      const adjustment = await store.adjustPackageRating(
        canonicalId,
        parsedBody.data.newRating,
        user.userId,
        parsedBody.data.reason
      );
      if (!adjustment) {
        return failure(404, "not_found", "Canonical package not found");
      }

      workerLogger.info("Moderator adjusted package rating", {
        canonicalId,
        previousRating: adjustment.previousRating,
        newRating: adjustment.newRating,
        adjustedBy: user.userId,
        reason: parsedBody.data.reason
      });

      return json(SetRatingAdjustmentResponseSchema.parse({
        schemaVersion: MODERATOR_PROTOCOL_VERSION,
        canonicalId: adjustment.canonicalId,
        previousRating: adjustment.previousRating,
        newRating: adjustment.newRating,
        adjustedBy: adjustment.adjustedBy,
        updatedAt: adjustment.updatedAt
      }));
    } catch (error) {
      workerLogger.error("Failed to adjust package rating", error, { path, canonicalId, userId: user.userId });
      return failure(500, "internal_error", "Failed to adjust package rating");
    }
  }

  if (isAppsList) {
    if (!store.listOperatorAppsPage) {
      return failure(501, "not_implemented", "App candidate listing not supported");
    }
    const rawLimit = Number(url.searchParams.get("limit") || "100");
    const rawCursor = url.searchParams.get("cursor");
    const candidateStatusParam = url.searchParams.get("candidateStatus");
    const parsedQuery = ModeratorAppListQuerySchema.safeParse({
      limit: rawLimit,
      cursor: rawCursor || undefined,
      candidateStatus: candidateStatusParam || undefined
    });
    if (!parsedQuery.success ||
        url.searchParams.getAll("limit").length > 1 ||
        url.searchParams.getAll("cursor").length > 1 ||
        url.searchParams.getAll("candidateStatus").length > 1 ||
        [...url.searchParams.keys()].some(key => !["limit", "cursor", "candidateStatus"].includes(key))) {
      return failure(400, "invalid_query", "Invalid moderator apps query");
    }

    const { limit, cursor, candidateStatus } = parsedQuery.data;
    const decodedCursor = cursor ? decodeOperatorAppCursor(cursor) : null;

    try {
      const page = await store.listOperatorAppsPage(limit, decodedCursor ? { ...decodedCursor, appId: decodedCursor.appId.toLowerCase() } : null, candidateStatus);
      return json(ModeratorAppListResponseSchema.parse({
        schemaVersion: MODERATOR_PROTOCOL_VERSION,
        apps: page.apps,
        nextCursor: page.nextCursor
      }));
    } catch (error) {
      workerLogger.error("Failed to list candidate apps for moderator", error, { path, userId: user.userId });
      return failure(500, "internal_error", "Failed to list candidate apps");
    }
  }

  if (appCandidateReviewMatch) {
    if (!store.reviewAppCandidate) {
      return failure(501, "not_implemented", "App candidate review not supported");
    }
    const rawAppId = decodeURIComponent(appCandidateReviewMatch[1] ?? "");
    const parsedId = ModeratorAppRecordSchema.shape.appId.safeParse(rawAppId);
    if (!parsedId.success) {
      return failure(400, "invalid_identifier", "Invalid app ID");
    }
    const appId = parsedId.data.toLowerCase();

    let payload: unknown;
    try {
      payload = await readJson(request);
    } catch (cause) {
      if (cause instanceof RangeError) return failure(413, "invalid_payload", "Payload exceeds limit");
      if (cause instanceof CoordinatorConflict) return failure(415, "invalid_payload", "Content-Type must be application/json");
      return failure(400, "bad_json", "Request body must be valid JSON");
    }

    const parsedBody = ModeratorReviewAppCandidateRequestSchema.safeParse(payload);
    if (!parsedBody.success) {
      return failure(400, "invalid_payload", "Invalid candidate review payload");
    }

    try {
      const result = await store.reviewAppCandidate(
        appId,
        parsedBody.data,
        `moderator:${user.userId}`
      );
      workerLogger.info("Moderator reviewed app candidate", {
        appId,
        candidateStatus: result.candidateStatus,
        delegationAllowed: result.delegationAllowed,
        reviewedBy: user.userId
      });

      return json(ModeratorReviewAppCandidateResponseSchema.parse({
        schemaVersion: MODERATOR_PROTOCOL_VERSION,
        ...result
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "App candidate review failed";
      const missing = message === "App not found";
      workerLogger.warn("Moderator candidate review failed", { path, message, missing, userId: user.userId }, error);
      return failure(missing ? 404 : 409, missing ? "not_found" : "conflict", message);
    }
  }

  return failure(404, "not_found", "Route not found");
}

export function createModeratorHandler(
  store: ModeratorStore
): (request: Request) => Promise<Response | null> {
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/v1/moderator/")) {
      return handleModeratorRequest(request, store);
    }
    return null;
  };
}
