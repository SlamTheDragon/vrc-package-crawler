import { Coordinator } from "./storage/d1/coordinator.ts";
import { type D1Database } from "./storage/d1/definitions.ts";
import { createCoordinatorHandler } from "./api/handler.ts";
import { createOperatorHandler } from "./api/operator_handler.ts";
import { createPublicCatalogHandler } from "./api/public_handler.ts";
import { createDownstreamHandler } from "./api/downstream_handler.ts";
import { createUserHandler } from "./api/user_handler.ts";
import { timingSafeEqual } from "./storage/d1/utils.ts";
import { workerLogger } from "./worker_logger.ts";

export interface Env {
  DB: D1Database;
  OPERATOR_TOKEN: string;
}

function isOperatorAuthorized(request: Request, configuredToken: string): boolean {
  if (!configuredToken || !/^[a-fA-F0-9]{64}$/.test(configuredToken)) return false;
  const supplied = request.headers.get("authorization") || "";
  if (!/^Bearer [a-fA-F0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(supplied.slice(7), configuredToken);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const store = new Coordinator(env.DB);
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/v1/operator/init") {
        if (!isOperatorAuthorized(request, env.OPERATOR_TOKEN)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }
        const body = (await request.json().catch(() => ({}))) as { autoSeed?: boolean };
        const autoSeed = body?.autoSeed !== false;
        await store.initSchema(autoSeed);
        workerLogger.info("Coordinator D1 schema initialized via /v1/operator/init", { autoSeed });
        return new Response(JSON.stringify({ status: "ok", message: "Schema initialized", autoSeed }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      const publicHandler = createPublicCatalogHandler(store);
      const downstreamHandler = createDownstreamHandler(store);
      const userHandler = createUserHandler(store);
      const nodeHandler = createCoordinatorHandler(store);
      const operatorHandler = createOperatorHandler(store, env.OPERATOR_TOKEN);
      const handled = (await publicHandler(request)) ??
        (await downstreamHandler(request)) ??
        (await userHandler(request)) ??
        (await nodeHandler(request)) ??
        (await operatorHandler(request));
      if (handled) return handled;

      workerLogger.warn("Route not found in worker fetch", { url: request.url, method: request.method });
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      workerLogger.error("Unhandled exception in worker fetch", error, { url: request.url });
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
