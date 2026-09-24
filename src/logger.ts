import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import { CONFIG } from "./config.ts";

export interface LoggerOptions {
  logsDir?: string;
  sessionId?: string;
  initialDate?: string;
}

export class Logger {
  private logsDir: string;
  private sessionId: string;
  private currentDate: string;
  private crawlerLogStream!: fs.WriteStream;
  private rateLimitLogStream!: fs.WriteStream;
  private errorLogStream!: fs.WriteStream;
  private crawlerLogPath!: string;
  private rateLimitLogPath!: string;
  private errorLogPath!: string;
  private isClosed: boolean = false;
  private isRotating: boolean = false;

  constructor(options: LoggerOptions = {}) {
    this.logsDir = options.logsDir || CONFIG.logsDir;
    this.sessionId = options.sessionId || `${process.pid}_${Date.now()}`;
    this.currentDate = options.initialDate || new Date().toISOString().slice(0, 10);

    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    this.openStreamsForDate(this.currentDate);
  }

  private openStreamsForDate(dateStr: string) {
    this.crawlerLogPath = path.join(this.logsDir, `session_${this.sessionId}_${dateStr}.log`);
    this.rateLimitLogPath = path.join(this.logsDir, `session_${this.sessionId}_${dateStr}_ratelimits.log`);
    this.errorLogPath = path.join(this.logsDir, `session_${this.sessionId}_${dateStr}_errors.log`);

    if (!fs.existsSync(this.crawlerLogPath)) fs.writeFileSync(this.crawlerLogPath, "");
    if (!fs.existsSync(this.rateLimitLogPath)) fs.writeFileSync(this.rateLimitLogPath, "");
    if (!fs.existsSync(this.errorLogPath)) fs.writeFileSync(this.errorLogPath, "");

    this.crawlerLogStream = fs.createWriteStream(this.crawlerLogPath, { flags: "a" });
    this.rateLimitLogStream = fs.createWriteStream(this.rateLimitLogPath, { flags: "a" });
    this.errorLogStream = fs.createWriteStream(this.errorLogPath, { flags: "a" });
  }

  private timestamp(): string {
    return new Date().toISOString();
  }

  public getActiveLogPath(): string {
    return this.crawlerLogPath;
  }

  public getActiveLogFiles(): { crawler: string; rateLimit: string; error: string } {
    return {
      crawler: this.crawlerLogPath,
      rateLimit: this.rateLimitLogPath,
      error: this.errorLogPath
    };
  }

  public async compressLogFile(sourcePath: string): Promise<string> {
    if (!fs.existsSync(sourcePath)) return "";
    const gzPath = `${sourcePath}.gz`;
    const sourceStream = fs.createReadStream(sourcePath);
    const destinationStream = fs.createWriteStream(gzPath);
    const gzip = zlib.createGzip({ level: 9 });

    await pipeline(sourceStream, gzip, destinationStream);
    try {
      fs.unlinkSync(sourcePath);
    } catch (_) {}
    return gzPath;
  }

  public async rotate(newDate?: string): Promise<string[]> {
    if (this.isClosed || this.isRotating) return [];
    this.isRotating = true;

    const targetDate = newDate || new Date().toISOString().slice(0, 10);
    const oldPaths = [this.crawlerLogPath, this.rateLimitLogPath, this.errorLogPath];

    try {
      // 1. Close current streams
      await Promise.all([
        new Promise((r) => this.crawlerLogStream.end(r)),
        new Promise((r) => this.rateLimitLogStream.end(r)),
        new Promise((r) => this.errorLogStream.end(r))
      ]);

      // 2. Asynchronously compress prior log files
      const compressed: string[] = [];
      for (const p of oldPaths) {
        if (fs.existsSync(p) && fs.statSync(p).size > 0) {
          const gz = await this.compressLogFile(p);
          compressed.push(gz);
        } else if (fs.existsSync(p)) {
          try { fs.unlinkSync(p); } catch (_) {}
        }
      }

      // 3. Open new streams with target date
      this.currentDate = targetDate;
      this.openStreamsForDate(this.currentDate);

      return compressed;
    } finally {
      this.isRotating = false;
    }
  }

  public async checkRotation(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    if (today > this.currentDate && !this.isRotating && !this.isClosed) {
      await this.rotate(today);
    }
  }

  debug(msg: string, meta?: any) {
    if (process.env.DEBUG || process.env.LOG_LEVEL === "debug") {
      this.checkRotation().catch(() => {});
      if (!this.isClosed && !this.isRotating) {
        try {
          const line = `[${this.timestamp()}] [DEBUG] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`;
          this.crawlerLogStream.write(line);
        } catch (_) {}
      }
      console.log(`\x1b[36m[DEBUG]\x1b[0m ${msg}`, meta ? meta : "");
    }
  }

  info(msg: string, meta?: any) {
    this.checkRotation().catch(() => {});
    if (!this.isClosed && !this.isRotating) {
      try {
        const line = `[${this.timestamp()}] [INFO] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`;
        this.crawlerLogStream.write(line);
      } catch (_) {}
    }
    console.log(`\x1b[32m[INFO]\x1b[0m ${msg}`, meta ? meta : "");
  }

  warn(msg: string, meta?: any) {
    this.checkRotation().catch(() => {});
    if (!this.isClosed && !this.isRotating) {
      try {
        const line = `[${this.timestamp()}] [WARN] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`;
        this.crawlerLogStream.write(line);
      } catch (_) {}
    }
    console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`, meta ? meta : "");
  }

  error(msg: string, error?: any) {
    this.checkRotation().catch(() => {});
    const errDetail = error instanceof Error ? error.stack || error.message : JSON.stringify(error || "");
    if (!this.isClosed && !this.isRotating) {
      try {
        const line = `[${this.timestamp()}] [ERROR] ${msg} - ${errDetail}\n`;
        this.errorLogStream.write(line);
        this.crawlerLogStream.write(line);
      } catch (_) {}
    }
    console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`, errDetail);
  }

  rateLimit(platform: string, remaining: number | string, resetTime: string, waitMs: number) {
    this.checkRotation().catch(() => {});
    if (!this.isClosed && !this.isRotating) {
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
