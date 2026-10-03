import {
  DOWNSTREAM_PROTOCOL_VERSION,
  UserAppListQuerySchema, UserAppListResponseSchema, UserAppResponseSchema,
  type UserAppListResponse
} from "../../../src-crawler/src/shared/protocol/downstream_protocol.js";
import { workerLogger } from "../worker_logger.ts";

export interface UserPrincipal {
  userId: string;
  userName: string;
}

/**
 * Boundary for user-scoped storage operations.
 * Users are distinct from admin operators (infrastructure control)
 * and from downstream apps (catalog consumers). App creation uses app/register;
 * removal requests use the application report route.
 */
export interface UserStore {
  /** Authenticates a vrcp_usr_ bearer token. */
  authenticateUser(token: string): Promise<UserPrincipal | null> | UserPrincipal | null;
  listUserApps(userId: string, limit: number, cursor: string | null, appId?: string): Promise<UserAppListResponse> | UserAppListResponse;
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
 *   GET /v1/user/apps and /v1/user/apps/{appId} — owned application metadata
 */
export async function handleUserRequest(
  request: Request,
  store: UserStore
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const isAppList = request.method === "GET" && path === "/v1/user/apps";
  const appMatch = request.method === "GET" ? /^\/v1\/user\/apps\/([^/]+)$/.exec(path) : null;

  if (!isAppList && !appMatch) {
    return failure(404, "not_found", "Route not found");
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

  if (isAppList || appMatch) {
    const parsed = UserAppListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length > 1)) return failure(400, "invalid_query", "Invalid app list query");
    const appId = appMatch?.[1];
    if (appId && !UserAppResponseSchema.shape.app.shape.appId.safeParse(appId).success) return failure(404, "not_found", "App not found");
    try {
      const page = await store.listUserApps(user.userId, appId ? 1 : parsed.data.limit, appId ? null : parsed.data.cursor ?? null, appId);
      if (appId) return page.apps[0] ? json(UserAppResponseSchema.parse({ schemaVersion: 1, app: page.apps[0] })) : failure(404, "not_found", "App not found");
      return json(UserAppListResponseSchema.parse(page));
    } catch (error) {
      workerLogger.error("User app read failed", error, { path, userId: user.userId });
      return failure(500, "internal_error", "App metadata could not be read");
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
