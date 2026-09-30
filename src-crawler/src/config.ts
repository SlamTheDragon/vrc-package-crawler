import path from "path";
import { CRAWLER_USER_AGENT } from "./shared/crawler_identity.ts";

/**
 * FIXME: fuse and migrate
 * Legacy environment and filesystem path constants.
 * Active pre-production binaries use src/node/runtime_config.ts and src/worker/runtime_config.ts.
 * This file is retained only for legacy CrawlerDB (src/db/db.ts), logger, and robots utilities
 * used by Gate 1 safety-baseline tests. Do not add new driver-pacing or lock constants here.
 */
// Grounded working-directory path resolution (no hardcoded absolute system paths)
const isBunRuntime = process.execPath.endsWith("bun.exe") || process.execPath.endsWith("bun");
export const BASE_DIR = isBunRuntime
  ? path.resolve(import.meta.dir, "..")   // dev: project root
  : path.dirname(process.execPath);         // compiled: next to the .exe

// The sole canonical database and runtime artifacts reside in dist/
export const CANONICAL_DIR = isBunRuntime ? path.resolve(BASE_DIR, "dist") : BASE_DIR;

export const DB_PATH = process.env.CRAWLER_DB_PATH || path.resolve(CANONICAL_DIR, "crawler_state.db");
export const LOGS_DIR = process.env.CRAWLER_LOGS_DIR || path.resolve(CANONICAL_DIR, "logs");

export const CONFIG = {
  baseDir: CANONICAL_DIR,
  projectDir: BASE_DIR,
  dbPath: DB_PATH,
  logsDir: LOGS_DIR,
  userAgent: CRAWLER_USER_AGENT,

  // Protected routes fail closed when no administrative token is configured.
  apiSecretToken: process.env.API_SECRET_TOKEN?.trim() || "",

  // GitHub Token for 5,000 req/hr API limit (supports GITHUB_TOKEN or GH_TOKEN env vars)
  githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "",
};

