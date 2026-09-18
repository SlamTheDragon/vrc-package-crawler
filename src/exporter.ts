export * from "./tools/exporter.ts";
import { runDatabaseExport } from "./tools/exporter.ts";

if (import.meta.main) {
  const mode = (process.argv[2] as "catalog" | "lake") || "catalog";
  runDatabaseExport(mode);
}
