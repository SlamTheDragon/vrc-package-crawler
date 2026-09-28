import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";

const MAX_CONFIG_BYTES = 64 * 1024;
export const CoordinatorRuntimeConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  databaseFile: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.db$/),
  listenPort: z.number().int().min(1).max(65535)
});

export type CoordinatorRuntimeConfig = { databasePath: string; listenPort: number };

/** Creates a non-secret config once; a coordinator operator token remains separate. */
export function initializeCoordinatorConfig(cwd: string, listenPort = 8787): string {
  const value = CoordinatorRuntimeConfigSchema.parse({ schemaVersion: 1,
    databaseFile: "coordinator.db", listenPort });
  const path = join(cwd, "coordinator.config.json");
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return path;
}

/** Configured databases stay inside this process's launch directory; legacy env paths remain explicit. */
export function loadCoordinatorRuntimeConfig(cwd: string, env: NodeJS.ProcessEnv): CoordinatorRuntimeConfig {
  const configuredPath = env.COORDINATOR_CONFIG_PATH;
  const path = configuredPath ? (isAbsolute(configuredPath) ? configuredPath : resolve(cwd, configuredPath)) :
    join(cwd, "coordinator.config.json");
  if (configuredPath || existsSync(path)) {
    let parsed: unknown;
    try {
      const size = statSync(path).size;
      if (size > MAX_CONFIG_BYTES) throw new Error("oversized");
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch { throw new Error("Coordinator config is missing, oversized, or invalid JSON"); }
    const result = CoordinatorRuntimeConfigSchema.safeParse(parsed);
    if (!result.success) throw new Error("Coordinator config does not match the versioned schema");
    return { databasePath: join(cwd, result.data.databaseFile), listenPort: result.data.listenPort };
  }
  return { databasePath: env.COORDINATOR_DB_PATH || "bin/local_coordinator.db", listenPort: 8787 };
}
