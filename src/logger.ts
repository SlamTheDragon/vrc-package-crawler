import fs from "fs";
import path from "path";
import { CONFIG } from "./config.ts";

export class Logger {
  private crawlerLogStream: fs.WriteStream;
  private rateLimitLogStream: fs.WriteStream;
  private errorLogStream: fs.WriteStream;
  private isClosed: boolean = false;

  constructor() {
    if (!fs.existsSync(CONFIG.logsDir)) {
      fs.mkdirSync(CONFIG.logsDir, { recursive: true });
    }

    this.crawlerLogStream = fs.createWriteStream(path.join(CONFIG.logsDir, "crawler.log"), { flags: "a" });
    this.rateLimitLogStream = fs.createWriteStream(path.join(CONFIG.logsDir, "rate_limits.log"), { flags: "a" });
    this.errorLogStream = fs.createWriteStream(path.join(CONFIG.logsDir, "errors.log"), { flags: "a" });
  }

  private timestamp(): string {
    return new Date().toISOString();
  }

  debug(msg: string, meta?: any) {
    if (process.env.DEBUG || process.env.LOG_LEVEL === "debug") {
      if (!this.isClosed) {
        try {
          const line = `[${this.timestamp()}] [DEBUG] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`;
          this.crawlerLogStream.write(line);
        } catch (_) {}
      }
      console.log(`\x1b[36m[DEBUG]\x1b[0m ${msg}`, meta ? meta : "");
    }
  }

  info(msg: string, meta?: any) {

    if (!this.isClosed) {
      try {
        const line = `[${this.timestamp()}] [INFO] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`;
        this.crawlerLogStream.write(line);
      } catch (_) {}
    }
    console.log(`\x1b[32m[INFO]\x1b[0m ${msg}`, meta ? meta : "");
  }

  warn(msg: string, meta?: any) {
    if (!this.isClosed) {
      try {
        const line = `[${this.timestamp()}] [WARN] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`;
        this.crawlerLogStream.write(line);
      } catch (_) {}
    }
    console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`, meta ? meta : "");
  }

  error(msg: string, error?: any) {
    const errDetail = error instanceof Error ? error.stack || error.message : JSON.stringify(error || "");
    if (!this.isClosed) {
      try {
        const line = `[${this.timestamp()}] [ERROR] ${msg} - ${errDetail}\n`;
        this.errorLogStream.write(line);
        this.crawlerLogStream.write(line);
      } catch (_) {}
    }
    console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`, errDetail);
  }

  rateLimit(platform: string, remaining: number | string, resetTime: string, waitMs: number) {
    if (!this.isClosed) {
      try {
        const line = `[${this.timestamp()}] [RATE_LIMIT] [${platform}] Remaining: ${remaining} | Reset: ${resetTime} | Sleeping: ${waitMs}ms\n`;
        this.rateLimitLogStream.write(line);
      } catch (_) {}
    }
    console.log(`\x1b[35m[RATE_LIMIT]\x1b[0m [${platform}] Remaining: ${remaining} -> Pausing ${Math.round(waitMs / 1000)}s`);
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    await Promise.all([
      new Promise((r) => this.crawlerLogStream.end(r)),
      new Promise((r) => this.rateLimitLogStream.end(r)),
      new Promise((r) => this.errorLogStream.end(r))
    ]);
  }
}

export const logger = new Logger();
