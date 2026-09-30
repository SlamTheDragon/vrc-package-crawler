import { circuitBreaker } from "../utils/circuit_breaker.ts";
import { adaptiveRateLimiter as rateLimiter } from "../utils/adaptive_limiter.ts";
import { logger } from "../utils/logger.ts";
import { classifyAccessFailure, type AccessFailure } from "../shared/access_outcome.ts";
export { isChallengeResponse, classifyAccessFailure } from "../shared/access_outcome.ts";

export interface AccessStatusSink {
  markStatus(
    url: string,
    status: string,
    reason?: string,
    etag?: string,
    lastModified?: string,
    nextIntervalSec?: number,
    httpStatus?: number,
    httpMessage?: string
  ): void;
}

/** Persist an origin access decision before a caller can mistake the page for data. */
export function applyAccessFailure(
  response: Pick<Response, "status" | "headers">,
  url: string,
  origin: string,
  limiterKey: string,
  targetDb: AccessStatusSink,
  body?: string
): AccessFailure | null {
  const failure = classifyAccessFailure(response, body);
  if (!failure) return null;
  if (failure === "rate_limited") {
    const backoffMs = rateLimiter.handleRateLimit(limiterKey, response);
    targetDb.markStatus(url, "backoff", "Rate limited by origin", undefined, undefined,
      Math.ceil(backoffMs / 1000), response.status, "Rate limited by origin");
    circuitBreaker.recordFailure(origin, response.status, "Rate limited by origin");
  } else {
    const reason = failure === "challenge"
      ? "Automated access challenge (Turnstile or managed challenge)"
      : "Access forbidden by origin";
    logger.warn(`[AccessPolicy] ${reason} at ${url}; holding origin for review.`);
    // Trip circuit breaker with bounded exponential backoff instead of a hard 3-day block
    const effectiveStatusCode = response.status === 200 ? 403 : response.status;
    const backoffMs = circuitBreaker.trip(origin, effectiveStatusCode, reason);
    const backoffSec = Math.max(30, Math.ceil(backoffMs / 1000));
    targetDb.markStatus(url, "blocked", reason, undefined, undefined, backoffSec, effectiveStatusCode, reason);
  }
  return failure;
}
