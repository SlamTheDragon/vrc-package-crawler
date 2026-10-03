import type { LocalCoordinatorStore } from "./local_sqlite.ts";
import { retrieveRobotsSnapshot, type RobotsFetcher } from "../../../src-crawler/src/shared/robots/robots_retrieval.ts";
import { ROBOTS_REFRESH_TIMEOUT_MS } from "../../../src-crawler/src/shared/robots/robots_snapshot.ts";

export const ROBOTS_REFRESH_POLL_MS = 60_000;
export const ROBOTS_REFRESH_BATCH_LIMIT = 10;

export async function refreshRobotsWithLease(
  store: LocalCoordinatorStore, origin: string, leaseId: string,
  fetcher: RobotsFetcher, shutdownSignal?: AbortSignal
): Promise<Record<string, unknown>> {
  const signal = shutdownSignal ?
    AbortSignal.any([shutdownSignal, AbortSignal.timeout(ROBOTS_REFRESH_TIMEOUT_MS)]) :
    AbortSignal.timeout(ROBOTS_REFRESH_TIMEOUT_MS);
  try {
    if (shutdownSignal?.aborted) throw new Error("Robots refresh cancelled");
    const snapshot = await retrieveRobotsSnapshot(origin, fetcher, signal);
    // An aborted transport returns a 599 snapshot. Shutdown is not evidence of
    // origin failure, so leave the prior snapshot untouched and release the lease.
    if (shutdownSignal?.aborted) throw new Error("Robots refresh cancelled");
    if (!store.completeRobotsRefresh(snapshot.origin, leaseId, snapshot.statusCode, snapshot.body)) {
      throw new Error(`Robots refresh lease expired or was replaced for ${origin}`);
    }
    const { body: _robotsBody, ...summary } = snapshot;
    return { ...summary, bodyBytes: new TextEncoder().encode(snapshot.body).byteLength,
      permitsMissingFile: snapshot.statusCode === 404 || snapshot.statusCode === 410,
      usable: snapshot.statusCode >= 200 && snapshot.statusCode < 300 ||
        snapshot.statusCode === 404 || snapshot.statusCode === 410 };
  } finally { store.releaseRobotsRefresh(origin, leaseId); }
}

import { workerLogger } from "../../src/worker_logger.ts";

/** One serial, bounded pass over seeded, due origins; errors stop this pass. */
export async function refreshDueRobots(
  store: LocalCoordinatorStore, fetcher: RobotsFetcher,
  limit = ROBOTS_REFRESH_BATCH_LIMIT, shutdownSignal?: AbortSignal
): Promise<Record<string, unknown>[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Robots batch limit must be 1..100");
  const refreshed: Record<string, unknown>[] = [];
  for (let index = 0; index < limit && !shutdownSignal?.aborted; index++) {
    const due = store.claimDueRobotsRefresh();
    if (!due) break;
    try {
      const result = await refreshRobotsWithLease(store, due.origin, due.leaseId, fetcher, shutdownSignal);
      refreshed.push(result);
      workerLogger.info(`Robots refresh complete for origin: ${due.origin}`);
    } catch (err) {
      workerLogger.warn(`Robots refresh failed for origin: ${due.origin}`, undefined, err);
      throw err;
    }
  }
  return refreshed;
}
