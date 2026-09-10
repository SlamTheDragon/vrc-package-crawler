import path from "path";

export const BASE_DIR = path.resolve(import.meta.dir, "..");
export const DB_PATH = path.join(BASE_DIR, "crawler_state.db");
export const LOGS_DIR = path.join(BASE_DIR, "logs");

export const CONFIG = {
  dbPath: DB_PATH,
  logsDir: LOGS_DIR,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  
  // Rate limits and pacing (ms)
  boothDelayMs: 1500,       // 1.5s delay between BOOTH requests
  githubSearchDelayMs: 6000, // 6s delay between unauthenticated GitHub searches
  vpmIndexDelayMs: 500,     // 0.5s delay between manifest fetches
  
  // Saturation threshold (0.0 to 1.0)
  targetSaturationScore: 0.90,
  
  // Batch size for SQLite transaction chunks
  batchSize: 20
};
