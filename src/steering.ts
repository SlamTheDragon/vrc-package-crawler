export * from "./tools/steering.ts";
import { startSteeringLoop } from "./tools/steering.ts";

if (import.meta.main) {
  startSteeringLoop();
}
