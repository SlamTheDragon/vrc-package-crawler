import { Coordinator } from "./d1/coordinator.ts";
import { type D1Database } from "./d1/definitions.ts";
import { createCoordinatorHandler } from "./handler.ts";
import { createOperatorHandler } from "./operator_handler.ts";

export interface Env {
  DB: D1Database;
  OPERATOR_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const store = new Coordinator(env.DB);
    const nodeHandler = createCoordinatorHandler(store);
    const operatorHandler = createOperatorHandler(store, env.OPERATOR_TOKEN);
    return (await nodeHandler(request)) ?? (await operatorHandler(request)) ?? new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
};
