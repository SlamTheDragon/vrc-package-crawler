/**
 * Cloudflare Worker-oriented structured logger.
 *
 * Designed specifically for runtime neutrality and Cloudflare Worker environments:
 * - Zero dependencies on Node fs, path, or zlib.
 * - Emits structured JSON entries compatible with Cloudflare Logpush, Wrangler tail,
 *   and edge execution contexts.
 */

import { version } from "../package.json";

export type WorkerLogLevel = "debug" | "info" | "warn" | "error";

export interface WorkerLogPayload {
  timestamp: string;
  level: WorkerLogLevel;
  component: string;
  version: string;
  message: string;
  meta?: Record<string, unknown>;
  error?: string;
  stack?: string;
}

export class WorkerLogger {
  constructor(readonly component: string = "worker") {}

  private formatEntry(
    level: WorkerLogLevel,
    message: string,
    meta?: Record<string, unknown>,
    err?: unknown
  ): WorkerLogPayload {
    const entry: WorkerLogPayload = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      version,
      message
    };

    if (meta && Object.keys(meta).length > 0) {
      try {
        // Ensure meta is serializable
        JSON.stringify(meta);
        entry.meta = meta;
      } catch (_) {
        entry.meta = { error: "Unserializable meta payload" };
      }
    }

    if (err) {
      if (err instanceof Error) {
        entry.error = err.message;
        if (err.stack) {
          entry.stack = err.stack;
        }
      } else {
        entry.error = String(err);
      }
    }

    return entry;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    try {
      const entry = this.formatEntry("debug", message, meta);
      console.debug(JSON.stringify(entry));
    } catch (_) {}
  }

  info(message: string, meta?: Record<string, unknown>): void {
    try {
      const entry = this.formatEntry("info", message, meta);
      console.info(JSON.stringify(entry));
    } catch (_) {}
  }

  warn(message: string, meta?: Record<string, unknown>, err?: unknown): void {
    try {
      const entry = this.formatEntry("warn", message, meta, err);
      console.warn(JSON.stringify(entry));
    } catch (_) {}
  }

  error(message: string, err?: unknown, meta?: Record<string, unknown>): void {
    try {
      const entry = this.formatEntry("error", message, meta, err);
      console.error(JSON.stringify(entry));
    } catch (_) {}
  }

  forComponent(component: string): WorkerLogger {
    return new WorkerLogger(component);
  }
}

export const workerLogger = new WorkerLogger();
