import { Coordinator } from "./storage/d1/coordinator.ts";
import { type D1Database } from "./storage/d1/definitions.ts";
import { createCoordinatorHandler } from "./api/handler.ts";
import { createOperatorHandler } from "./api/operator_handler.ts";
import { createPublicCatalogHandler } from "./api/public_handler.ts";
import { createDownstreamHandler } from "./api/downstream_handler.ts";
import { createUserHandler } from "./api/user_handler.ts";
import { workerLogger } from "./worker_logger.ts";

export interface Env {
  DB: D1Database;
  OPERATOR_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const store = new Coordinator(env.DB);
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
