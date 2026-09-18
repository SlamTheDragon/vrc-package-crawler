export * from "./tools/server.ts";
import { startServer } from "./tools/server.ts";

if (import.meta.main) {
  startServer();
}
