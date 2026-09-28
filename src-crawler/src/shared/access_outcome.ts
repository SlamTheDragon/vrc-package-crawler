/** Origin access outcomes used by both legacy drivers and distributed nodes. */
export function isChallengeResponse(response: Pick<Response, "headers">, body?: string): boolean {
  if (response.headers.get("cf-mitigated")?.trim().toLowerCase() === "challenge") return true;
  if (!body) return false;
  return /challenges\.cloudflare\.com\/turnstile|cf-mitigated:\s*challenge|\/cdn-cgi\/challenge-platform\//i.test(body);
}

export type AccessFailure = "challenge" | "rate_limited" | "forbidden";

export function classifyAccessFailure(response: Pick<Response, "status" | "headers">, body?: string): AccessFailure | null {
  if (isChallengeResponse(response, body)) return "challenge";
  if (response.status === 429) return "rate_limited";
  if (response.status === 403) {
    if (response.headers.has("retry-after") || response.headers.get("x-ratelimit-remaining") === "0") return "rate_limited";
    return "forbidden";
  }
  return null;
}

export function retryAfterSeconds(headers: Headers, fallback = 300): number {
  const raw = headers.get("retry-after");
  if (raw) {
    const numeric = Number(raw);
    const seconds = Number.isFinite(numeric) ? numeric : (Date.parse(raw) - Date.now()) / 1000;
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(86400, Math.ceil(seconds));
  }
  if (headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(headers.get("x-ratelimit-reset"));
    const seconds = reset - Date.now() / 1000;
    if (Number.isFinite(reset) && Number.isFinite(seconds) && seconds > 0) {
      return Math.min(86400, Math.ceil(seconds));
    }
  }
  return fallback;
}
