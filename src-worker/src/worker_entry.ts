import { Coordinator } from "./storage/d1/coordinator.ts";
import { CoordinatorConflict, createCoordinatorHandler, readJson } from "./api/handler.ts";
import { InitializeCoordinatorRequestSchema, InitializeCoordinatorResponseSchema } from "../../src-package/src/protocol/operator.js";
import { createOperatorHandler } from "./api/operator_handler.ts";
import { createPublicCatalogHandler } from "./api/public_handler.ts";
import { createDownstreamHandler } from "./api/downstream_handler.ts";
import { createUserHandler } from "./api/user_handler.ts";
import { timingSafeEqual } from "./storage/d1/utils.ts";
import { workerLogger } from "./worker_logger.ts";

export type Env = Cloudflare.Env;

function isOperatorAuthorized(request: Request, configuredToken: string): boolean {
  if (!configuredToken || !/^[a-fA-F0-9]{64}$/.test(configuredToken)) return false;
  const supplied = request.headers.get("authorization") || "";
  if (!/^Bearer [a-fA-F0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(supplied.slice(7), configuredToken);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const store = new Coordinator(env.VRCP_D1);
      const url = new URL(request.url);

      if (request.method === "POST" && url.pathname === "/v1/operator/init") {
        if (!isOperatorAuthorized(request, env.OPERATOR_TOKEN)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" }
          });
        }
        const failure = (status: number, code: string, error: string) => new Response(
          JSON.stringify({ schemaVersion: 1, code, error }), {
            status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
          });
        let payload: unknown;
        try {
          payload = await readJson(request);
        } catch (cause) {
          if (cause instanceof RangeError) return failure(413, "invalid_payload", "Payload exceeds 256 KiB");
          if (cause instanceof CoordinatorConflict) return failure(415, "invalid_payload", "Content-Type must be application/json");
          return failure(400, "bad_json", "Request body must be valid JSON");
        }
        const parsed = InitializeCoordinatorRequestSchema.safeParse(payload);
        if (!parsed.success) return failure(400, "invalid_payload", "Invalid initialization payload");
        const autoSeed = parsed.data.autoSeed ?? true;
        await store.initSchema(autoSeed);
        workerLogger.info("Coordinator D1 schema initialized via /v1/operator/init", { autoSeed });
        return new Response(JSON.stringify(InitializeCoordinatorResponseSchema.parse({
          schemaVersion: 1, status: "ok", message: "Schema initialized", autoSeed
        })), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
        });
      }

      const publicHandler = createPublicCatalogHandler(store);
      const downstreamHandler = createDownstreamHandler(store, env.OPERATOR_TOKEN);
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
} satisfies ExportedHandler<Env>;
