import { describe, it, expect } from "bun:test";
import { DomainCircuitBreaker } from "../src/utils/resilience/circuit_breaker.ts";

describe("Phase 2 - Task 2.7: Autonomous Fault Tolerance Subsystem (Domain Circuit Breaker)", () => {
  describe("Domain Circuit Breaker State Machine", () => {
    it("operates in CLOSED state initially and allows execution", () => {
      const cb = new DomainCircuitBreaker({ failureThreshold: 3, baseBackoffMs: 100, jitterRatio: 0 });
      expect(cb.getState("gumroad.com")).toBe("CLOSED");
      expect(cb.canExecute("gumroad.com")).toBe(true);
    });

    it("trips to OPEN after reaching failure threshold (K >= 3)", () => {
      const cb = new DomainCircuitBreaker({ failureThreshold: 3, baseBackoffMs: 200, jitterRatio: 0 });
      cb.recordFailure("gumroad.com", 429, "Too Many Requests");
      expect(cb.getState("gumroad.com")).toBe("CLOSED");
      expect(cb.canExecute("gumroad.com")).toBe(true);

      cb.recordFailure("gumroad.com", 429, "Too Many Requests");
      expect(cb.getState("gumroad.com")).toBe("CLOSED");

      cb.recordFailure("gumroad.com", 429, "Too Many Requests");
      // 3rd failure trips the breaker
      expect(cb.getState("gumroad.com")).toBe("OPEN");
      expect(cb.canExecute("gumroad.com")).toBe(false);
      expect(cb.getRemainingBackoffMs("gumroad.com")).toBeGreaterThan(0);
    });

    it("transitions to HALF_OPEN after backoff expires and permits a single canary probe", async () => {
      const cb = new DomainCircuitBreaker({ failureThreshold: 2, baseBackoffMs: 50, jitterRatio: 0 });
      cb.recordFailure("booth.pm", 503, "Service Unavailable");
      cb.recordFailure("booth.pm", 503, "Service Unavailable");
      expect(cb.getState("booth.pm")).toBe("OPEN");

      // Wait for backoff expiration
      await new Promise((r) => setTimeout(r, 70));

      expect(cb.getState("booth.pm")).toBe("HALF_OPEN");
      // First probe is permitted (canary)
      expect(cb.canExecute("booth.pm")).toBe(true);
      // Subsequent probe while canary is in-flight is denied
      expect(cb.canExecute("booth.pm")).toBe(false);

      // Canary succeeds -> resets to CLOSED
      cb.recordSuccess("booth.pm");
      expect(cb.getState("booth.pm")).toBe("CLOSED");
      expect(cb.canExecute("booth.pm")).toBe(true);
    });

    it("resets circuit state to CLOSED upon explicit reset", () => {
      const cb = new DomainCircuitBreaker({ failureThreshold: 1, baseBackoffMs: 1000, jitterRatio: 0 });
      cb.recordFailure("booth.pm", 500, "Error");
      expect(cb.getState("booth.pm")).toBe("OPEN");
      cb.reset("booth.pm");
      expect(cb.getState("booth.pm")).toBe("CLOSED");
      expect(cb.canExecute("booth.pm")).toBe(true);
    });
  });
});
