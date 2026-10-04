import { MAX_ROBOTS_BYTES, OriginRobotsSnapshotSchema, type OriginRobotsSnapshot } from "./robots_snapshot.ts";

export type RobotsFetcher = (url: string, init: RequestInit) => Promise<Response>;
export type RobotsRetrieval = OriginRobotsSnapshot & { redirects: string[]; error?: string };

function failure(origin: string, redirects: string[], error: string): RobotsRetrieval {
  return { origin, statusCode: 599, body: "", redirects, error };
}

function safeRedirectTarget(location: string, currentUrl: string): string | null {
  try {
    const target = new URL(location, currentUrl);
    if (target.protocol !== "https:" || target.username || target.password || target.hash ||
        (target.port && target.port !== "443") || target.hostname.endsWith(".") ||
        target.hostname.toLowerCase() === "localhost") return null;
    return target.href;
  } catch { return null; }
}

async function boundedRobotsBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_ROBOTS_BYTES) throw new Error("Robots response exceeds 512 KiB");
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_ROBOTS_BYTES) {
      await reader.cancel();
      throw new Error("Robots response exceeds 512 KiB");
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

/** RFC 9309 redirects, with each hop delegated to a caller-supplied safe transport. */
export async function retrieveRobotsSnapshot(
  { origin, userAgent }: { origin: string; userAgent: string }, fetcher: RobotsFetcher, signal?: AbortSignal
): Promise<RobotsRetrieval> {
  OriginRobotsSnapshotSchema.parse({ origin, statusCode: 599, body: "" });
  const redirects: string[] = [];
  let target = `${origin}/robots.txt`;
  for (let hop = 0; hop <= 5; hop++) {
    let response: Response;
    try {
      response = await fetcher(target, { headers: { "user-agent": userAgent, accept: "text/plain" },
        redirect: "manual", signal });
    } catch (cause) {
      return failure(origin, redirects, cause instanceof Error ? cause.message : String(cause));
    }
    if (response.status >= 300 && response.status < 400) {
      if (hop === 5) return failure(origin, redirects, "Robots redirect limit exceeded");
      const location = response.headers.get("location");
      const next = location && safeRedirectTarget(location, target);
      if (!next) return failure(origin, redirects, "Robots redirect has no safe HTTPS target");
      redirects.push(next);
      target = next;
      continue;
    }
    if (response.status >= 200 && response.status < 300) {
      if (response.status === 206 || response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        return failure(origin, redirects, "Robots response is partial or HTML");
      }
      try {
        const body = await boundedRobotsBody(response);
        return { origin, statusCode: response.status, body, redirects };
      } catch (cause) {
        return failure(origin, redirects, cause instanceof Error ? cause.message : String(cause));
      }
    }
    if (response.status < 200) return failure(origin, redirects, "Robots response has unsupported status");
    return { origin, statusCode: response.status, body: "", redirects };
  }
  return failure(origin, redirects, "Robots redirect limit exceeded");
}
