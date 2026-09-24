import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { CrawlerDB } from "../src/db.ts";
import { DomainCircuitBreaker } from "../src/utils/circuit_breaker.ts";
import path from "path";
import fs from "fs";

describe("Phase 2 - Task 2.7: Autonomous Fault Tolerance Subsystem (Domain Circuit Breaker & Persistent DLQ)", () => {
  const fixturePath = path.resolve(__dirname, `../dist/test_fault_${Date.now()}.db`);
  let testDb: CrawlerDB;

  beforeAll(() => {
    testDb = new CrawlerDB(fixturePath);
  });

  afterAll(() => {
    try { testDb?.close(); } catch (_) {}
    if (fs.existsSync(fixturePath)) {
      try { fs.unlinkSync(fixturePath); } catch (_) {}
    }
  });

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
  });

  describe("Persistent Dead-Letter Queue (DLQ) in Frontier", () => {
    it("escalates URL to 'dead_letter' when failure count reaches threshold (N >= 5)", () => {
      const testUrl = "https://booth.pm/ja/items/99999999";
      testDb.queueUrl(testUrl, "booth", 5);

      // 4 consecutive failures keep status as 'failed'
      for (let i = 1; i <= 4; i++) {
        testDb.markStatus(testUrl, "failed", `Error attempt ${i}`, null, null, 60, 500, `Internal Server Error ${i}`);
        const row = testDb.rawDb.prepare("SELECT status, failure_count FROM frontier WHERE url = ?;").get(testUrl) as any;
        expect(row.status).toBe("failed");
        expect(row.failure_count).toBe(i);
      }

      // 5th failure moves URL to 'dead_letter'
      testDb.markStatus(testUrl, "failed", "Final fatal error", null, null, 60, 500, "Persistent fatal failure");
      const dlqRow = testDb.rawDb.prepare("SELECT status, failure_count, last_failure_code, last_failure_reason FROM frontier WHERE url = ?;").get(testUrl) as any;
      expect(dlqRow.status).toBe("dead_letter");
      expect(dlqRow.failure_count).toBe(5);
      expect(dlqRow.last_failure_code).toBe(500);
      expect(dlqRow.last_failure_reason).toBe("Persistent fatal failure");
    });

    it("drains expired backoff and circuit-broken tasks to 'pending'", () => {
      const expiredUrl = "https://booth.pm/ja/items/11111111";
      testDb.queueUrl(expiredUrl, "booth", 5);

      // Set to circuit_broken with past expiration
      testDb.rawDb.run(`
        UPDATE frontier
        SET status = 'circuit_broken',
            next_fetch_at = datetime('now', '-10 seconds')
        WHERE url = ?;
      `, [expiredUrl]);

      const drained = testDb.drainDeadLetterQueue(10);
      expect(drained).toBeGreaterThanOrEqual(1);

      const row = testDb.rawDb.prepare("SELECT status FROM frontier WHERE url = ?;").get(expiredUrl) as any;
      expect(row.status).toBe("pending");
    });
  });
});
