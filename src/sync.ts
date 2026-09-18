export * from "./tools/sync.ts";
import { runEdgeSync } from "./tools/sync.ts";

if (import.meta.main) {
  runEdgeSync();
}
