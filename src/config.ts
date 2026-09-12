import path from "path";

// Grounded working-directory path resolution (no hardcoded absolute system paths)
export const BASE_DIR = process.cwd();
export const DB_PATH = process.env.CRAWLER_DB_PATH || path.resolve(BASE_DIR, "crawler_state.db");
export const LOGS_DIR = process.env.CRAWLER_LOGS_DIR || path.resolve(BASE_DIR, "logs");
export const ARCHIVE_1_PATH = process.env.ARCHIVE_1_PATH || path.resolve(BASE_DIR, "crawler cache archive-1", "crawler_state.db");

export const CONFIG = {
  dbPath: DB_PATH,
  logsDir: LOGS_DIR,
  archive1Path: ARCHIVE_1_PATH,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  
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

