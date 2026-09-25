import path from "path";

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
  lockPath: path.resolve(CANONICAL_DIR, "crawler.lock"),
  userAgent: "VRCDiscoveryBot/1.0 (+https://github.com/SlamTheDragon/vrc-package-crawler; slamthedragon@gmail.com)",
  
  // Administrative secret token for Schema 5 telemetry ingestion
  apiSecretToken: process.env.API_SECRET_TOKEN || "vrc-secret-telemetry-token",

  // GitHub Token for 5,000 req/hr API limit (supports GITHUB_TOKEN or GH_TOKEN env vars)
  githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "",

  // Mercator host-based politeness pacing (ms)
  boothDelayMs: 1500,        // 1.5s delay between BOOTH requests
  githubSearchDelayMs: (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) ? 2000 : 6000, // 2s with token, 6s unauthenticated
  vpmIndexDelayMs: 400,      // 0.4s delay between manifest fetches
  gumroadDelayMs: 3000,      // 3.0s delay between Gumroad requests (strictly serialized to prevent 429)
  jinxxyDelayMs: 1200,       // 1.2s delay between Jinxxy requests
  itchDelayMs: 1500,         // 1.5s delay between Itch requests
  
  // High saturation ceiling threshold (approaching 100% catalog coverage)
  targetSaturationScore: 0.95,
  
  // Batch size for SQLite transaction chunks
  batchSize: 20
};

