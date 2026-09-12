import { logger } from "./logger.ts";

export interface RateLimitState {
  backoffUntil: number;
  consecutive429: number;
  currentDelayMs: number;
  successCount: number;
}

export class AdaptiveRateLimiter {
  private states: Map<string, RateLimitState> = new Map();
  private baseBackoffMs: number = 30000;   // 30 seconds initial backoff
  private maxBackoffMs: number = 300000;   // 5 minutes maximum progressive backoff cap

  private getState(key: string, defaultDelayMs: number = 1500): RateLimitState {
    let state = this.states.get(key);
    if (!state) {
      state = {
        backoffUntil: 0,
        consecutive429: 0,
        currentDelayMs: defaultDelayMs,
        successCount: 0
      };
      this.states.set(key, state);
    }
    return state;
  }

  isBackingOff(key: string): boolean {
    const state = this.states.get(key);
    if (!state) return false;
    return Date.now() < state.backoffUntil;
  }

  getRemainingBackoffMs(key: string): number {
    const state = this.states.get(key);
    if (!state) return 0;
    return Math.max(0, state.backoffUntil - Date.now());
  }

  async waitIfBackoff(key: string): Promise<boolean> {
    const remaining = this.getRemainingBackoffMs(key);
    if (remaining > 0) {
      logger.info(`[RateLimiter] '${key}' is in backoff. Pausing worker for ${(remaining / 1000).toFixed(1)}s...`);
      await new Promise((r) => setTimeout(r, remaining));
      return true;
    }
    return false;
  }

  handleRateLimit(key: string, resp?: Response | any): number {
    const state = this.getState(key);
    state.consecutive429 += 1;
    state.successCount = 0;

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
    // Formula: min(maxBackoff, baseBackoff * 2^(consecutive - 1)) + random_jitter
    let backoffMs: number;
    if (retryAfterSec > 0) {
      backoffMs = (retryAfterSec + 2) * 1000; // Add 2s safety buffer
    } else {
      const expFactor = Math.pow(2, Math.min(state.consecutive429 - 1, 5));
      const rawBackoff = Math.min(this.maxBackoffMs, this.baseBackoffMs * expFactor);
      const jitter = Math.floor(Math.random() * (rawBackoff * 0.3)); // 0-30% jitter
      backoffMs = rawBackoff + jitter;
    }

    state.backoffUntil = Date.now() + backoffMs;

    // 3. Dynamically increase pacing delay for future requests
    state.currentDelayMs = Math.min(10000, Math.max(state.currentDelayMs * 1.5, 3000));

    const waitSec = Math.round(backoffMs / 1000);
    logger.rateLimit(key, `429 (Streak: ${state.consecutive429})`, retryAfterSec ? `${retryAfterSec}s (header)` : "Exponential", backoffMs);
    logger.warn(`[RateLimiter] '${key}' backed off for ${waitSec}s. New pacing delay: ${(state.currentDelayMs / 1000).toFixed(1)}s`);

    return backoffMs;
  }

  handleSuccess(key: string, defaultDelayMs: number = 1500) {
    const state = this.getState(key, defaultDelayMs);
    state.consecutive429 = 0;
    state.successCount += 1;

    // After 20 consecutive successes, gradually relax pacing delay back towards default
    if (state.successCount >= 20 && state.currentDelayMs > defaultDelayMs) {
      state.currentDelayMs = Math.max(defaultDelayMs, state.currentDelayMs * 0.9);
      state.successCount = 0;
    }
  }

  getPacingDelayMs(key: string, defaultDelayMs: number = 1500): number {
    const state = this.getState(key, defaultDelayMs);
    return state.currentDelayMs;
  }
}

export const rateLimiter = new AdaptiveRateLimiter();
