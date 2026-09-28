import type { Platform } from "../../shared/node_protocol.ts";
import type { SourcePurpose } from "../../shared/source_access_profile.ts";
import { LocalCoordinatorStore } from "../../worker/local_sqlite.ts";

/** Explicit offline-only approval; production seeding never calls this helper. */
export function approveFixtureSource(store: LocalCoordinatorStore, target: string, platform: Platform,
  purpose: SourcePurpose = "metadata"): void {
  if (store.activeSourceAccessProfileForTarget(platform, target, purpose)) return;
  const url = new URL(target);
  store.createSourceAccessProfile({
    schemaVersion: 1, platform, origin: url.origin, pathScope: url.pathname,
    exactQuery: url.search ? url.search.slice(1) : undefined, method: "GET", purpose,
    minDelayMs: 1000, expiresAt: "2099-01-01T00:00:00.000Z",
    reviewReference: "offline-fixture-only", reason: "Synthetic local test target",
    retainClasses: ["normalized_facts", "creator_prose"], publishClasses: []
  }, "test-fixture");
}

export function seedApprovedFixtureJob(store: LocalCoordinatorStore, target: string, platform: Platform,
  minDelayMs = 1000, purpose: SourcePurpose = "metadata"): string {
  approveFixtureSource(store, target, platform, purpose);
  return store.seedJob(target, platform, minDelayMs, undefined, purpose);
}
