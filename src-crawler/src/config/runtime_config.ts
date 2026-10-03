import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { NodeIdSchema, PlatformSchema, type Platform } from "../shared/protocol/node_protocol.ts";
import { coordinatorEndpointAllowed } from "../client/node_client.ts";

const MAX_CONFIG_BYTES = 64 * 1024;
export const NodeRuntimeConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  nodeId: NodeIdSchema,
  coordinatorUrl: z.url().refine(coordinatorEndpointAllowed, "Safe coordinator endpoint required"),
  capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length)
    .refine((items) => new Set(items).size === items.length, "Duplicate capability"),
  databaseFile: z.string().min(1).regex(/^[a-zA-Z0-9._-]+$/, "databaseFile must be a safe filename")
    .optional().default("node.db"),
});

export type NodeRuntimeConfig = {
  nodeId: string;
  baseUrl: string;
  capabilities: Platform[];
  token: string;
  databasePath: string;
};

/** Creates a non-secret launch-directory config once; an existing operator file is never replaced. */
export function initializeNodeConfig(
  cwd: string,
  nodeId: string,
  coordinatorUrl = "http://127.0.0.1:8787",
  capabilities: Platform[] = [...PlatformSchema.options],
  databaseFile = "node.db"
): string {
  const value = NodeRuntimeConfigSchema.parse({ schemaVersion: 1, nodeId, coordinatorUrl, capabilities, databaseFile });
  const path = join(cwd, "node.config.json");
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return path;
}

/** A launch-directory config contains no credential; NODE_TOKEN remains a separate secret. */
export function loadNodeRuntimeConfig(cwd: string, env: NodeJS.ProcessEnv): NodeRuntimeConfig {
  const token = env.NODE_TOKEN || "";
  if (!token) throw new Error("NODE_TOKEN is required for the crawler node");
  const configuredPath = env.NODE_CONFIG_PATH;
  const path = configuredPath ? (isAbsolute(configuredPath) ? configuredPath : resolve(cwd, configuredPath)) :
    join(cwd, "node.config.json");
  if (configuredPath || existsSync(path)) {
    let parsed: unknown;
    try {
      const size = statSync(path).size;
      if (size > MAX_CONFIG_BYTES) throw new Error("oversized");
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch { throw new Error("Node config is missing, oversized, or invalid JSON"); }
    const result = NodeRuntimeConfigSchema.safeParse(parsed);
    if (!result.success) throw new Error("Node config does not match the versioned schema");
    const databaseFile = result.data.databaseFile || "node.db";
    const databasePath = env.NODE_DB_PATH || join(cwd, databaseFile);
    return {
      nodeId: result.data.nodeId,
      baseUrl: result.data.coordinatorUrl,
      capabilities: result.data.capabilities,
      token,
      databasePath,
    };
  }
  const envConfig = NodeRuntimeConfigSchema.safeParse({
    schemaVersion: 1,
    nodeId: env.NODE_ID || "",
    coordinatorUrl: env.COORDINATOR_URL || "http://127.0.0.1:8787",
    capabilities: (env.NODE_CAPABILITIES || PlatformSchema.options.join(",")).split(","),
    databaseFile: "node.db",
  });
  if (!envConfig.success) throw new Error("Set NODE_ID and valid NODE_CAPABILITIES/COORDINATOR_URL, or provide node.config.json");
  const databasePath = env.NODE_DB_PATH || join(cwd, "node.db");
  return {
    nodeId: envConfig.data.nodeId,
    baseUrl: envConfig.data.coordinatorUrl,
    capabilities: envConfig.data.capabilities,
    token,
    databasePath,
  };
}
