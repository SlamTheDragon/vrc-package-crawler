/**
 * Three-state Domain Circuit Breaker (Task 2.7)
 * References:
 * - Nygard, M. T. (2018). "Release It!: Design and Deploy Production-Ready Software."
 * - States:
 *   - CLOSED: Normal crawling operations.
 *   - OPEN: Tripped due to consecutive errors (429, Cloudflare challenge, socket timeout, K >= 3). Crawling halted for exponential backoff with full jitter.
 *   - HALF_OPEN: Backoff expired. Exactly one canary probe request is permitted. If probe succeeds -> CLOSED. If probe fails -> OPEN.
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold?: number;     // default 3 (K >= 3)
  baseBackoffMs?: number;        // default 30,000ms (30s)
  maxBackoffMs?: number;         // default 3,600,000ms (1 hour)
  jitterRatio?: number;          // default 0.3 (full jitter +/- 30%)
}

export class DomainCircuitBreaker {
  private domains = new Map<string, {
    state: CircuitState;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    openUntil: number;
    halfOpenInFlight: boolean;
    halfOpenProbeExpiry: number;
    lastFailureCode?: number;
    lastFailureReason?: string;
  }>();

  private config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 3,
      baseBackoffMs: config.baseBackoffMs ?? 30000,
      maxBackoffMs: config.maxBackoffMs ?? 3600000,
      jitterRatio: config.jitterRatio ?? 0.3
    };
  }

  public normalizeDomain(domainOrUrl: string): string {
    const raw = (domainOrUrl || "").toLowerCase().trim();
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

  private getEntry(domain: string) {
    const key = this.normalizeDomain(domain);
    let entry = this.domains.get(key);
    if (!entry) {
      entry = {
        state: "CLOSED",
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        openUntil: 0,
        halfOpenInFlight: false,
        halfOpenProbeExpiry: 0
      };
      this.domains.set(key, entry);
    }
    return { key, entry };
  }

  getState(domain: string): CircuitState {
    const { entry } = this.getEntry(domain);
    if (entry.state === "OPEN" && Date.now() >= entry.openUntil) {
      entry.state = "HALF_OPEN";
      entry.halfOpenInFlight = false;
      entry.halfOpenProbeExpiry = 0;
    }
    return entry.state;
  }

  canExecute(domain: string): boolean {
    const state = this.getState(domain);
    if (state === "CLOSED") return true;
    if (state === "HALF_OPEN") {
      const { entry } = this.getEntry(domain);
      if (!entry.halfOpenInFlight || Date.now() >= entry.halfOpenProbeExpiry) {
        entry.halfOpenInFlight = true;
        entry.halfOpenProbeExpiry = Date.now() + 30000;
        return true; // Canary probe permitted
      }
      return false; // Canary already in flight
    }
    return false; // OPEN
  }

  trip(domain: string, code?: number, reason?: string, customBackoffMs?: number, incrementFailures: boolean = true): number {
    const { entry } = this.getEntry(domain);
    if (incrementFailures) {
      entry.consecutiveFailures++;
    }
    entry.consecutiveSuccesses = 0;
    entry.state = "OPEN";
    entry.halfOpenInFlight = false;
    entry.halfOpenProbeExpiry = 0;
    entry.lastFailureCode = code;
    entry.lastFailureReason = reason;

    let backoffMs: number;
    if (customBackoffMs && customBackoffMs > 0) {
      backoffMs = customBackoffMs;
    } else {
      // Exponential Backoff with Full Jitter: T = min(Tmax, Tbase * 2^failures) +/- jitter
      const failuresOverThreshold = Math.max(0, entry.consecutiveFailures - this.config.failureThreshold);
      const exp = Math.pow(2, Math.min(failuresOverThreshold, 6));
      const rawBackoff = Math.min(this.config.maxBackoffMs, this.config.baseBackoffMs * exp);
      const jitter = Math.floor((Math.random() * 2 - 1) * (rawBackoff * this.config.jitterRatio));
      backoffMs = Math.max(this.config.baseBackoffMs, rawBackoff + jitter);
    }

    entry.openUntil = Date.now() + backoffMs;
    return backoffMs;
  }

  recordFailure(domain: string, code?: number, reason?: string): void {
    const { entry } = this.getEntry(domain);
    entry.consecutiveFailures++;
    entry.consecutiveSuccesses = 0;
    entry.lastFailureCode = code;
    entry.lastFailureReason = reason;

    if (entry.state === "HALF_OPEN" || entry.consecutiveFailures >= this.config.failureThreshold) {
      this.trip(domain, code, reason, undefined, false);
    }
  }

  recordSuccess(domain: string): void {
    const { entry } = this.getEntry(domain);
    entry.consecutiveSuccesses++;
    if (entry.state === "HALF_OPEN" || entry.consecutiveSuccesses >= 2) {
      entry.state = "CLOSED";
      entry.consecutiveFailures = 0;
      entry.openUntil = 0;
      entry.halfOpenInFlight = false;
      entry.halfOpenProbeExpiry = 0;
      entry.lastFailureCode = undefined;
      entry.lastFailureReason = undefined;
    }
  }

  getRemainingBackoffMs(domain: string): number {
    const { entry } = this.getEntry(domain);
    return Math.max(0, entry.openUntil - Date.now());
  }

  reset(domain?: string): void {
    if (domain) {
      const { entry } = this.getEntry(domain);
      entry.state = "CLOSED";
      entry.consecutiveFailures = 0;
      entry.consecutiveSuccesses = 0;
      entry.openUntil = 0;
      entry.halfOpenInFlight = false;
      entry.halfOpenProbeExpiry = 0;
    } else {
      this.domains.clear();
    }
  }
}

export const circuitBreaker = new DomainCircuitBreaker();
