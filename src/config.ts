import path from "path";

export const BASE_DIR = path.resolve(import.meta.dir, "..");
export const DB_PATH = path.join(BASE_DIR, "crawler_state.db");
export const LOGS_DIR = path.join(BASE_DIR, "logs");

export const CONFIG = {
  dbPath: DB_PATH,
  logsDir: LOGS_DIR,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  
  // Optional GitHub Token for 5,000 req/hr API limit
  githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "",

  // Rate limits and pacing (ms)
  boothDelayMs: 1500,        // 1.5s delay between BOOTH requests
  githubSearchDelayMs: process.env.GITHUB_TOKEN ? 2000 : 6000, // 2s with token, 6s unauthenticated
  vpmIndexDelayMs: 400,      // 0.4s delay between manifest fetches
  gumroadDelayMs: 1500,      // 1.5s delay between Gumroad requests
  jinxxyDelayMs: 1200,       // 1.2s delay between Jinxxy requests
  
  // Saturation threshold (0.0 to 1.0)
  targetSaturationScore: 0.90,
  
  // Batch size for SQLite transaction chunks
  batchSize: 20
};
