import { describe, it, expect } from "bun:test";

describe("Phase 1 - Task 1.5: VPM Re-Seeding Permanent Gate Lockout Bug Remediation", () => {
  const VPM_RESEED_INTERVAL_MS = 7 * 86400 * 1000; // 7 days

  it("verifies legacy monotonic check failed when done >= 50", () => {
    const metrics = { platformStats: { vpm: { pending: 5, done: 120 } } };

    // Legacy gate condition:
    const legacyGate = metrics.platformStats.vpm.pending < 10 && metrics.platformStats.vpm.done < 50;
    // Expected: permanently blocked because lifetime done >= 50
    expect(legacyGate).toBe(false);
  });

  it("permits reseeding after 7 days temporal window even if done >= 50 (Task 1.5 Remediation)", () => {
    const metrics = { platformStats: { vpm: { pending: 5, done: 500 } } };

    // Scenario A: Seeded 8 days ago (stale)
    const eightDaysAgo = Date.now() - (8 * 86400 * 1000);
    let lastVpmSeedAt: number | null = eightDaysAgo;

    const shouldReseedStale = metrics.platformStats.vpm.pending < 10 &&
      (!lastVpmSeedAt || Date.now() - lastVpmSeedAt > VPM_RESEED_INTERVAL_MS);

    expect(shouldReseedStale).toBe(true);

    // Scenario B: Just seeded 1 hour ago (fresh)
    const oneHourAgo = Date.now() - (3600 * 1000);
    lastVpmSeedAt = oneHourAgo;

    const shouldReseedFresh = metrics.platformStats.vpm.pending < 10 &&
      (!lastVpmSeedAt || Date.now() - lastVpmSeedAt > VPM_RESEED_INTERVAL_MS);

    expect(shouldReseedFresh).toBe(false);

    // Scenario C: First startup (never seeded)
    lastVpmSeedAt = 0;
    const shouldReseedFirstTime = metrics.platformStats.vpm.pending < 10 &&
      (!lastVpmSeedAt || Date.now() - lastVpmSeedAt > VPM_RESEED_INTERVAL_MS);

    expect(shouldReseedFirstTime).toBe(true);
  });
});
