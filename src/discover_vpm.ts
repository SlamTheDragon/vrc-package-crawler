export * from "./tools/discover_vpm.ts";
import { runVpmDiscovery } from "./tools/discover_vpm.ts";

if (import.meta.main) {
  runVpmDiscovery();
}
