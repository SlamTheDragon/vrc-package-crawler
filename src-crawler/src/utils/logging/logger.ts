import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pipeline } from "stream/promises";

export interface LoggerOptions {
  logsDir?: string;
  sessionId?: string;
  initialDate?: string;
  archiveDir?: string;
  enableLatestLog?: boolean;
  enableSessionLogs?: boolean;
}

export function getArchiveFileName(archiveDir: string, dateStr: string): string {
  const baseName = `${dateStr}.log.gz`;
  if (!fs.existsSync(path.join(archiveDir, baseName))) {
    return baseName;
  }
  let index = 1;
  while (fs.existsSync(path.join(archiveDir, `${dateStr}-${index}.log.gz`))) {
    index++;
  }
  return `${dateStr}-${index}.log.gz`;
}

export class Logger {
  private logsDir: string;
  private archiveDir: string;
  private sessionId: string;
  private currentDate: string;
  private enableLatestLog: boolean;
  private enableSessionLogs: boolean;
  private crawlerLogStream?: fs.WriteStream;
  private rateLimitLogStream?: fs.WriteStream;
  private errorLogStream?: fs.WriteStream;
  private latestLogStream?: fs.WriteStream;
  private crawlerLogPath: string = "";
  private rateLimitLogPath: string = "";
  private errorLogPath: string = "";
  private latestLogPath: string;
  private isClosed: boolean = false;
  private isRotating: boolean = false;
  private hasExplicitInitialDate: boolean = false;
  private midnightTimer?: NodeJS.Timeout;
  private boundShutdown?: () => void;
  private isInitialized: boolean = false;

  constructor(options: LoggerOptions = {}) {
    this.logsDir = options.logsDir || process.env.CRAWLER_LOGS_DIR || path.resolve(process.cwd(), "logs");
    this.archiveDir = options.archiveDir || path.join(this.logsDir, "archive");
    this.sessionId = options.sessionId || `${process.pid}_${Date.now()}`;
    this.hasExplicitInitialDate = !!options.initialDate;
    this.currentDate = options.initialDate || new Date().toISOString().slice(0, 10);
    this.enableLatestLog = options.enableLatestLog ?? true;
    this.enableSessionLogs = options.enableSessionLogs ?? false;
    this.latestLogPath = path.join(this.logsDir, "latest.log");
    this.setSessionPaths(this.currentDate);
  }

  private initialize(): void {
    if (this.isInitialized || this.isClosed || (!this.enableLatestLog && !this.enableSessionLogs)) return;
    this.isInitialized = true;
    if (!fs.existsSync(this.logsDir)) {
      try {
        fs.mkdirSync(this.logsDir, { recursive: true });
      } catch (_) {}
    }

    if (this.enableLatestLog) {
      this.ensureLatestLogStream();
    }

    if (this.enableSessionLogs) {
      this.openStreamsForDate(this.currentDate);
    }

    this.scheduleMidnightRotation();
    this.registerShutdownHooks();
  }

  private ensureLatestLogStream(): void {
    if (this.isClosed || !this.enableLatestLog) return;
    if (!fs.existsSync(this.latestLogPath)) {
      try {
        fs.writeFileSync(this.latestLogPath, "");
      } catch (_) {}
    }
    if (!this.latestLogStream) {
      this.latestLogStream = fs.createWriteStream(this.latestLogPath, { flags: "a" });
    }
  }

  private setSessionPaths(dateStr: string): void {
    if (!this.enableSessionLogs) return;
    this.crawlerLogPath = path.join(this.logsDir, `session_${this.sessionId}_${dateStr}.log`);
    this.rateLimitLogPath = path.join(this.logsDir, `session_${this.sessionId}_${dateStr}_ratelimits.log`);
    this.errorLogPath = path.join(this.logsDir, `session_${this.sessionId}_${dateStr}_errors.log`);
  }

  private openStreamsForDate(dateStr: string) {
    if (!this.enableSessionLogs) return;
    this.setSessionPaths(dateStr);
    try {
      if (!fs.existsSync(this.crawlerLogPath)) fs.writeFileSync(this.crawlerLogPath, "");
      if (!fs.existsSync(this.rateLimitLogPath)) fs.writeFileSync(this.rateLimitLogPath, "");
      if (!fs.existsSync(this.errorLogPath)) fs.writeFileSync(this.errorLogPath, "");

      this.crawlerLogStream = fs.createWriteStream(this.crawlerLogPath, { flags: "a" });
      this.rateLimitLogStream = fs.createWriteStream(this.rateLimitLogPath, { flags: "a" });
      this.errorLogStream = fs.createWriteStream(this.errorLogPath, { flags: "a" });
    } catch (_) {}
  }

  private timestamp(): string {
    return new Date().toISOString();
  }

  public getActiveLogPath(): string {
    return this.latestLogPath;
  }

  public getSessionLogPath(): string {
    return this.crawlerLogPath;
  }

  public getActiveLogFiles(): { crawler: string; rateLimit: string; error: string; latest: string } {
    return {
      crawler: this.crawlerLogPath || this.latestLogPath,
      rateLimit: this.rateLimitLogPath || this.latestLogPath,
      error: this.errorLogPath || this.latestLogPath,
      latest: this.latestLogPath
    };
  }

  private scheduleMidnightRotation(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = undefined;
    }
    if (this.isClosed) return;

    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0, 0, 0, 0
    );
    const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());

    this.midnightTimer = setTimeout(async () => {
      try {
        const priorDate = this.currentDate;
        await this.archiveAndClearLatestLog(priorDate);
        this.currentDate = new Date().toISOString().slice(0, 10);
        if (this.enableSessionLogs) {
          this.openStreamsForDate(this.currentDate);
        }
      } catch (err) {
        console.error("[Logger] Midnight log rotation failed:", err);
      } finally {
        this.scheduleMidnightRotation();
      }
    }, msUntilMidnight);

    if (typeof this.midnightTimer.unref === "function") {
      this.midnightTimer.unref();
    }
  }

  private registerShutdownHooks(): void {
    this.boundShutdown = () => {
      try {
        this.archiveAndClearLatestLogSync();
      } catch (_) {}
    };

    process.once("beforeExit", this.boundShutdown);
    process.once("exit", this.boundShutdown);
  }

  public archiveAndClearLatestLogSync(dateStr?: string): string | null {
    if (this.isRotating || !this.enableLatestLog) return null;
    this.isRotating = true;
    try {
      if (!fs.existsSync(this.latestLogPath)) {
        return null;
      }
      const stat = fs.statSync(this.latestLogPath);
      if (stat.size === 0) {
        return null;
      }

      const targetDate = dateStr || this.currentDate || new Date().toISOString().slice(0, 10);
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true });
      }

      const archiveFileName = getArchiveFileName(this.archiveDir, targetDate);
      const archiveFilePath = path.join(this.archiveDir, archiveFileName);

      // Close current latestLogStream before reading and clearing
      if (this.latestLogStream) {
        try {
          this.latestLogStream.end();
        } catch (_) {}
        this.latestLogStream = undefined;
      }

      const content = fs.readFileSync(this.latestLogPath);
      const compressed = zlib.gzipSync(content, { level: 9 });
      fs.writeFileSync(archiveFilePath, compressed);

      // Clear latest.log
      fs.writeFileSync(this.latestLogPath, "");

      // Re-establish append stream if still open
      if (!this.isClosed && this.enableLatestLog) {
        this.latestLogStream = fs.createWriteStream(this.latestLogPath, { flags: "a" });
      }

      return archiveFilePath;
    } catch (err) {
      console.error("[Logger] Failed to archive and clear latest.log:", err);
      return null;
    } finally {
      this.isRotating = false;
    }
  }

  public async archiveAndClearLatestLog(dateStr?: string): Promise<string | null> {
    if (this.isRotating) return null;
    if (this.latestLogStream) {
      await new Promise<void>((resolve) => {
        this.latestLogStream?.end(() => resolve());
      });
      this.latestLogStream = undefined;
    }
    return this.archiveAndClearLatestLogSync(dateStr);
  }

  public async compressLogFile(sourcePath: string, targetDir?: string): Promise<string> {
    if (!fs.existsSync(sourcePath)) return "";
    const destinationDir = targetDir || this.archiveDir;
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    const gzPath = path.join(destinationDir, `${path.basename(sourcePath)}.gz`);
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
    if (!this.isInitialized) {
      this.currentDate = newDate || new Date().toISOString().slice(0, 10);
      this.setSessionPaths(this.currentDate);
      return [];
    }
    this.isRotating = true;

    const targetDate = newDate || new Date().toISOString().slice(0, 10);
    const compressed: string[] = [];

    try {
      // 1. Archive and clear latest.log with current date (flushing write stream)
      this.isRotating = false;
      const latestGz = await this.archiveAndClearLatestLog(this.currentDate);
      this.isRotating = true;
      if (latestGz) {
        compressed.push(latestGz);
      }

      // 2. Close and archive session files if enabled
      const oldPaths = [this.crawlerLogPath, this.rateLimitLogPath, this.errorLogPath].filter(Boolean);
      if (oldPaths.length > 0) {
        await Promise.all([
          this.crawlerLogStream ? new Promise((r) => this.crawlerLogStream!.end(r)) : Promise.resolve(),
          this.rateLimitLogStream ? new Promise((r) => this.rateLimitLogStream!.end(r)) : Promise.resolve(),
          this.errorLogStream ? new Promise((r) => this.errorLogStream!.end(r)) : Promise.resolve()
        ]);

        for (const p of oldPaths) {
          if (fs.existsSync(p) && fs.statSync(p).size > 0) {
            const gz = await this.compressLogFile(p);
            if (gz) compressed.push(gz);
          } else if (fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch (_) {}
          }
        }
      }

      // 3. Open new streams with target date
      this.currentDate = targetDate;
      if (this.enableSessionLogs) {
        this.openStreamsForDate(this.currentDate);
      }
      if (this.enableLatestLog) {
        this.ensureLatestLogStream();
      }

      return compressed;
    } finally {
      this.isRotating = false;
    }
  }

  public async checkRotation(): Promise<void> {
    if (this.hasExplicitInitialDate) return;
    const today = new Date().toISOString().slice(0, 10);
    if (today > this.currentDate && !this.isRotating && !this.isClosed) {
      await this.rotate(today);
    }
  }

  private writeToLatest(line: string): void {
    if (this.isClosed) return;
    this.initialize();
    try {
      if (!this.latestLogStream) {
        this.ensureLatestLogStream();
      }
      this.latestLogStream?.write(line);
    } catch (_) {}
  }

  debug(msg: string, meta?: any) {
    this.checkRotation().catch(() => {});
    const line = `[${this.timestamp()}] [DEBUG] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`;
    this.writeToLatest(line);
    if (this.crawlerLogStream && !this.isClosed && !this.isRotating) {
      try { this.crawlerLogStream.write(line); } catch (_) {}
    }
    if (process.env.DEBUG || process.env.LOG_LEVEL === "debug") {
      console.log(`\x1b[36m[DEBUG]\x1b[0m ${msg}`, meta ? meta : "");
    }
  }

  info(msg: string, meta?: any) {
    this.checkRotation().catch(() => {});
    const line = `[${this.timestamp()}] [INFO] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`;
    this.writeToLatest(line);
    if (this.crawlerLogStream && !this.isClosed && !this.isRotating) {
      try { this.crawlerLogStream.write(line); } catch (_) {}
    }
    console.log(`\x1b[32m[INFO]\x1b[0m ${msg}`, meta ? meta : "");
  }

  warn(msg: string, meta?: any) {
    this.checkRotation().catch(() => {});
    const line = `[${this.timestamp()}] [WARN] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`;
    this.writeToLatest(line);
    if (this.crawlerLogStream && !this.isClosed && !this.isRotating) {
      try { this.crawlerLogStream.write(line); } catch (_) {}
    }
    console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`, meta ? meta : "");
  }

  error(msg: string, error?: any) {
    this.checkRotation().catch(() => {});
    const errDetail = error instanceof Error ? error.stack || error.message : JSON.stringify(error || "");
    const line = `[${this.timestamp()}] [ERROR] ${msg} - ${errDetail}\n`;
    this.writeToLatest(line);
    if (this.errorLogStream && !this.isClosed && !this.isRotating) {
      try { this.errorLogStream.write(line); } catch (_) {}
    }
    if (this.crawlerLogStream && !this.isClosed && !this.isRotating) {
      try { this.crawlerLogStream.write(line); } catch (_) {}
    }
    console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`, errDetail);
  }

  rateLimit(platform: string, remaining: number | string, resetTime: string, waitMs: number) {
    this.checkRotation().catch(() => {});
    const line = `[${this.timestamp()}] [RATE_LIMIT] [${platform}] Remaining: ${remaining} | Reset: ${resetTime} | Sleeping: ${waitMs}ms\n`;
    this.writeToLatest(line);
    if (this.rateLimitLogStream && !this.isClosed && !this.isRotating) {
      try { this.rateLimitLogStream.write(line); } catch (_) {}
    }
    if (this.crawlerLogStream && !this.isClosed && !this.isRotating) {
      try { this.crawlerLogStream.write(line); } catch (_) {}
    }
    console.log(`\x1b[35m[RATE_LIMIT]\x1b[0m [${platform}] Remaining: ${remaining} -> Pausing ${Math.round(waitMs / 1000)}s`);
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = undefined;
    }

    if (this.boundShutdown) {
      process.removeListener("beforeExit", this.boundShutdown);
      process.removeListener("exit", this.boundShutdown);
    }

    // Archive and clear latest.log on shutdown (flushes write stream)
    if (this.isInitialized) await this.archiveAndClearLatestLog(this.currentDate);

    const promises: Promise<unknown>[] = [];
    if (this.crawlerLogStream) {
      promises.push(new Promise((r) => this.crawlerLogStream!.end(r)));
    }
    if (this.rateLimitLogStream) {
      promises.push(new Promise((r) => this.rateLimitLogStream!.end(r)));
    }
    if (this.errorLogStream) {
      promises.push(new Promise((r) => this.errorLogStream!.end(r)));
    }
    await Promise.all(promises);
  }
}

export const logger = new Logger();
