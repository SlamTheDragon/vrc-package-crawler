import fs from "fs";
import path from "path";
import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";

export interface LockMetadata {
  pid: number;
  startedAt: string;
  command: string;
  hostname: string;
}

export class ProcessLock {
  private static lockFile: string = CONFIG.lockPath;
  private static isHoldingLock = false;

  /**
   * Checks whether a given process ID is actively running on the OS.
   */
  static isPidAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e: any) {
      return e.code === "EPERM";
    }
  }

  /**
   * Attempts to acquire the exclusive process lock.
   * If a stale lock exists from an ungraceful shutdown or power loss, reclaims it automatically.
   * If another live process is actively holding the lock, returns false.
   */
  static acquire(customPath?: string): boolean {
    if (customPath) {
      this.lockFile = customPath;
    }

    if (this.isHoldingLock) {
      return true;
    }

    if (fs.existsSync(this.lockFile)) {
      try {
        const raw = fs.readFileSync(this.lockFile, "utf-8");
        const meta: LockMetadata = JSON.parse(raw);

        if (meta.pid === process.pid) {
          this.isHoldingLock = true;
          return true;
        }

        if (this.isPidAlive(meta.pid)) {
          logger.warn(`[ProcessLock] Active crawler process already running (PID: ${meta.pid}, started: ${meta.startedAt}). Aborting to prevent concurrent database pollution.`);
          return false;
        }

        // Stale lock from crashed process or power interruption
        logger.info(`[ProcessLock] Recovered from power interruption / crash: Reclaimed stale lock from deceased PID ${meta.pid} (originally started at ${meta.startedAt}).`);
        fs.unlinkSync(this.lockFile);
      } catch (err) {
        try {
          fs.unlinkSync(this.lockFile);
        } catch (_) {}
      }
    }

    const metadata: LockMetadata = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      command: process.argv.join(" "),
      hostname: process.env.COMPUTERNAME || process.env.HOSTNAME || "localhost"
    };

    try {
      fs.writeFileSync(this.lockFile, JSON.stringify(metadata, null, 2), { flag: "w" });
      this.isHoldingLock = true;

      // Register process exit hook to guarantee cleanup
      process.once("exit", () => {
        this.release();
      });

      return true;
    } catch (err) {
      logger.error("[ProcessLock] Failed to create lockfile", err);
      return false;
    }
  }

  /**
   * Releases the lockfile if held by this process.
   */
  static release(): void {
    if (!this.isHoldingLock) return;
    try {
      if (fs.existsSync(this.lockFile)) {
        const raw = fs.readFileSync(this.lockFile, "utf-8");
        const meta: LockMetadata = JSON.parse(raw);
        if (meta.pid === process.pid) {
          fs.unlinkSync(this.lockFile);
        }
      }
    } catch (_) {}
    this.isHoldingLock = false;
  }

  /**
   * Returns metadata of current lock holder if present.
   */
  static getLockInfo(): LockMetadata | null {
    if (!fs.existsSync(this.lockFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(this.lockFile, "utf-8"));
    } catch {
      return null;
    }
  }
}
