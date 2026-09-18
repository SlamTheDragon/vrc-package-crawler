export * from "./crawler/index.ts";
import { main } from "./crawler/index.ts";

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal error in main runner", err);
    process.exit(1);
  });
}
