/**
 * Adaptive Rate Limiter & Politeness Controller (AIMD & EWMA)
 * References:
 * - Chiu, D. M., & Jain, R. (1989). "Analysis of the increase and decrease algorithms for congestion avoidance in computer networks."
 * - Heydon, A., & Najork, M. (1999). "Mercator: A scalable, extensible web crawler."
 * - RFC 9110: HTTP Semantics (Retry-After header handling)
 */

import { logger } from "../logger.ts";

export interface HostLimiterConfig {
  minDelayMs: number;
  maxDelayMs: number;
  targetLatencyMs: number;
  additiveStepMs?: number;
  multiplicativeFactor?: number;
  jitterMs?: number;
}

interface HostState {
  currentDelayMs: number;
  ewmaLatencyMs: number;
  lastCompletedAt: number;
  consecutiveSuccesses: number;
  consecutive429: number;
  backoffUntil: number;
  isInFlight: boolean;
  isAcquired: boolean;
  waitQueue: Array<() => void>;
}

export class AdaptiveRateLimiter {
  private hosts = new Map<string, HostState>();
  private defaultConfigs = new Map<string, HostLimiterConfig>();

  private baseBackoffMs: number = 30000;
  private maxBackoffMs: number = 300000;
  private isDraining: boolean = false;

  constructor() {
    // Default baseline configurations per crawling platform
    this.registerHostConfig("booth.pm", {
      minDelayMs: 800,
      maxDelayMs: 5000,
      targetLatencyMs: 600,
      additiveStepMs: 100,
      multiplicativeFactor: 1.8,
      jitterMs: 250
    });

    this.registerHostConfig("gumroad.com", {
      minDelayMs: 2500,
      maxDelayMs: 12000,
      targetLatencyMs: 1200,
      additiveStepMs: 150,
      multiplicativeFactor: 2.0,
      jitterMs: 500
    });

    this.registerHostConfig("api.github.com", {
      minDelayMs: 1000,
      maxDelayMs: 8000,
      targetLatencyMs: 500,
      additiveStepMs: 100,
      multiplicativeFactor: 1.5,
      jitterMs: 200
    });

    this.registerHostConfig("jinxxy.com", {
      minDelayMs: 800,
      maxDelayMs: 6000,
      targetLatencyMs: 700,
      additiveStepMs: 100,
      multiplicativeFactor: 1.6,
      jitterMs: 250
    });

    this.registerHostConfig("itch.io", {
      minDelayMs: 1000,
      maxDelayMs: 6000,
      targetLatencyMs: 700,
      additiveStepMs: 100,
      multiplicativeFactor: 1.6,
      jitterMs: 250
    });

    this.registerHostConfig("vpm", {
      minDelayMs: 300,
      maxDelayMs: 3000,
      targetLatencyMs: 300,
      additiveStepMs: 50,
      multiplicativeFactor: 1.4,
      jitterMs: 100
    });
  }

  normalizeHost(host: string): string {
    const raw = (host || "").toLowerCase().trim();
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        return new URL(raw).hostname.toLowerCase();
      } catch {
        // Fall through
      }
    }
    if (raw === "booth") return "booth.pm";
    if (raw === "gumroad" || raw.startsWith("gumroad:")) return "gumroad.com";
    if (raw === "github") return "api.github.com";
    if (raw === "jinxxy") return "jinxxy.com";
    if (raw === "itch") return "itch.io";
    return raw;
  }

  registerHostConfig(host: string, config: HostLimiterConfig): void {
    const norm = this.normalizeHost(host);
    this.defaultConfigs.set(norm, config);
  }

  private getOrCreateHost(host: string): { state: HostState; config: HostLimiterConfig } {
    const key = this.normalizeHost(host);
    const config = this.defaultConfigs.get(key) || {
      minDelayMs: 1000,
      maxDelayMs: 10000,
      targetLatencyMs: 800,
      additiveStepMs: 100,
      multiplicativeFactor: 1.8,
      jitterMs: 300
    };

    if (!this.hosts.has(key)) {
      const initialDelay = Math.round(config.minDelayMs + (config.maxDelayMs - config.minDelayMs) * 0.25);
      this.hosts.set(key, {
        currentDelayMs: initialDelay,
        ewmaLatencyMs: config.targetLatencyMs,
        lastCompletedAt: 0,
        consecutiveSuccesses: 0,
        consecutive429: 0,
        backoffUntil: 0,
        isInFlight: false,
        isAcquired: false,
        waitQueue: []
      });
    }

    return { state: this.hosts.get(key)!, config };
  }

  isBackingOff(host: string): boolean {
    const { state } = this.getOrCreateHost(host);
    return Date.now() < state.backoffUntil;
  }

  getRemainingBackoffMs(host: string): number {
    const { state } = this.getOrCreateHost(host);
    return Math.max(0, state.backoffUntil - Date.now());
  }

  private async sleepPaced(ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (!this.isDraining && Date.now() < end) {
      const wait = Math.min(100, end - Date.now());
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  /**
   * Immediately drains all queues and cancels backoff sleeps on graceful shutdown.
   */
  drain(): void {
    this.isDraining = true;
    for (const [, state] of this.hosts) {
      state.backoffUntil = 0;
      state.isAcquired = false;
      state.isInFlight = false;
      while (state.waitQueue.length > 0) {
        const next = state.waitQueue.shift()!;
        try { next(); } catch (_) {}
      }
    }
  }

  async waitIfBackoff(host: string): Promise<boolean> {
    const remaining = this.getRemainingBackoffMs(host);
    if (remaining > 0) {
      logger.info(`[RateLimiter] '${this.normalizeHost(host)}' is in backoff. Pausing for ${(remaining / 1000).toFixed(1)}s...`);
      await this.sleepPaced(remaining);
      return true;
    }
    return false;
  }

  /**
   * Waits until the host's politeness interval has passed and acquires exclusive execution lock.
   * Guarantees strict single-request serialization per host (Mercator politeness).
   */
  async acquire(host: string): Promise<() => void> {
    if (this.isDraining) {
      return () => {};
    }

    const norm = this.normalizeHost(host);
    const { state, config } = this.getOrCreateHost(norm);

    // If another request is currently in-flight for this host, queue behind it in FIFO order
    if (state.isInFlight) {
      await new Promise<void>((resolve) => {
        state.waitQueue.push(resolve);
      });
    } else {
      state.isInFlight = true;
    }

    if (this.isDraining) {
      state.isInFlight = false;
      return () => {};
    }

    state.isAcquired = true;

    // Check if host is in backoff (from a 429)
    const now = Date.now();
    if (state.backoffUntil > now) {
      const waitMs = state.backoffUntil - now;
      logger.info(`[RateLimiter] '${norm}' in backoff; waiting ${(waitMs / 1000).toFixed(1)}s before acquiring...`);
      await this.sleepPaced(waitMs);
    }

    if (this.isDraining) {
      state.isInFlight = false;
      state.isAcquired = false;
      return () => {};
    }

    // Enforce politeness delay with decorrelation jitter
    const elapsed = Date.now() - state.lastCompletedAt;
    const jitter = Math.floor(Math.random() * (config.jitterMs || 200));
    const requiredDelay = state.currentDelayMs + jitter;

    if (elapsed < requiredDelay) {
      const waitTime = requiredDelay - elapsed;
      await this.sleepPaced(waitTime);
    }

    const startTime = Date.now();

    // Return release callback to be invoked when the HTTP request finishes
    return () => {
      state.lastCompletedAt = Date.now();
      state.isAcquired = false;

      // Unblock the next queued request for this host
      if (state.waitQueue.length > 0) {
        const next = state.waitQueue.shift()!;
        // Keep isInFlight = true as the next queued request immediately assumes execution
        next();
      } else {
        state.isInFlight = false;
      }
    };
  }

  /**
   * Reports a successful request with measured round-trip latency.
   * Triggers additive speedup if server latency is healthy.
   */
  recordSuccess(host: string, latencyMs: number = 0): void {
    const { state, config } = this.getOrCreateHost(host);

    state.consecutive429 = 0;

    if (latencyMs > 0) {
      // Update Exponentially Weighted Moving Average (EWMA) latency (alpha = 0.2)
      state.ewmaLatencyMs = 0.2 * latencyMs + 0.8 * state.ewmaLatencyMs;

      // Preemptive deceleration: if latency is surging, back off before WAF 429
      if (state.ewmaLatencyMs > config.targetLatencyMs * 1.8) {
        state.currentDelayMs = Math.min(
          config.maxDelayMs,
          Math.round(state.currentDelayMs * 1.25)
        );
        state.consecutiveSuccesses = 0;
        return;
      }
    }

    state.consecutiveSuccesses++;

    // Additive Increase (speedup after 3 consecutive fast responses)
    if (state.consecutiveSuccesses >= 3) {
      const step = config.additiveStepMs || 100;
      state.currentDelayMs = Math.max(config.minDelayMs, state.currentDelayMs - step);
      state.consecutiveSuccesses = 0;
    }
  }

  handleSuccess(host: string, defaultDelayMs?: number): void {
    this.recordSuccess(host, 0);
  }

  /**
   * Reports an HTTP 429 Too Many Requests, 503, or timeout error.
   * Triggers Multiplicative Decrease (exponential backoff).
   */
  recordFailure(host: string, isRateLimit: boolean = false): void {
    const { state, config } = this.getOrCreateHost(host);
    const factor = isRateLimit ? (config.multiplicativeFactor || 2.0) : 1.4;

    state.currentDelayMs = Math.min(
      config.maxDelayMs,
      Math.round(state.currentDelayMs * factor)
    );
    state.consecutiveSuccesses = 0;
  }

  handleRateLimit(host: string, resp?: any): number {
    const norm = this.normalizeHost(host);
    const { state, config } = this.getOrCreateHost(norm);
    state.consecutive429 += 1;
    state.consecutiveSuccesses = 0;

    // 1. Check for standard Retry-After header
    let retryAfterSec = 0;
    if (resp && typeof resp.headers?.get === "function") {
      const retryHeader = resp.headers.get("retry-after");
      if (retryHeader) {
        const parsed = parseInt(retryHeader, 10);
        if (!isNaN(parsed) && parsed > 0) {
          retryAfterSec = parsed;
        } else {
          const dateMs = Date.parse(retryHeader);
          if (!isNaN(dateMs)) {
            retryAfterSec = Math.max(1, Math.ceil((dateMs - Date.now()) / 1000));
          }
        }
      }
    }

    // 2. Exponential backoff with full jitter
    let backoffMs: number;
    if (retryAfterSec > 0) {
      backoffMs = (retryAfterSec + 2) * 1000;
    } else {
      const expFactor = Math.pow(2, Math.min(state.consecutive429 - 1, 5));
      const rawBackoff = Math.min(this.maxBackoffMs, this.baseBackoffMs * expFactor);
      const jitter = Math.floor(Math.random() * (rawBackoff * 0.3));
      backoffMs = rawBackoff + jitter;
    }

    state.backoffUntil = Date.now() + backoffMs;

    // 3. Multiplicatively increase delay
    const factor = config.multiplicativeFactor || 2.0;
    state.currentDelayMs = Math.min(config.maxDelayMs, Math.round(state.currentDelayMs * factor));

    const waitSec = Math.round(backoffMs / 1000);
    logger.rateLimit(norm, `429 (Streak: ${state.consecutive429})`, retryAfterSec ? `${retryAfterSec}s (header)` : "Exponential", backoffMs);
    logger.warn(`[RateLimiter] '${norm}' backed off for ${waitSec}s. New pacing delay: ${(state.currentDelayMs / 1000).toFixed(1)}s`);

    return backoffMs;
  }

  getPacingDelayMs(host: string, defaultDelayMs?: number): number {
    const { state } = this.getOrCreateHost(host);
    // If lock is actively acquired by acquire(), internal sleep in driver is skipped (already paced)
    if (state.isAcquired) {
      return 0;
    }
    return state.currentDelayMs || defaultDelayMs || 1000;
  }

  getDelay(host: string): number {
    const { state } = this.getOrCreateHost(host);
    return state.currentDelayMs;
  }

  getEwmaLatency(host: string): number {
    const { state } = this.getOrCreateHost(host);
    return Math.round(state.ewmaLatencyMs);
  }
}

export const adaptiveRateLimiter = new AdaptiveRateLimiter();
