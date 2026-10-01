import { compileRobotsText, type CrawlerRules } from "@trybyte/robotstxt-parser";
import { logger } from "../logging/logger.ts";
import { CRAWLER_ROBOTS_TOKEN, CRAWLER_USER_AGENT } from "../../shared/robots/crawler_identity.ts";
import { MAX_ROBOTS_BYTES } from "../../shared/robots/robots_snapshot.ts";

export interface CachedRobotsRecord {
  host: string;
  fetchedAt: number;
  statusCode: number;
  matcher?: CrawlerRules;
  truncated?: boolean;
}


async function boundedRobotsText(response: Response): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", truncated: false };
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_ROBOTS_BYTES - bytes;
    if (value.byteLength > remaining) {
      text += decoder.decode(value.subarray(0, remaining), { stream: true });
      await reader.cancel();
      truncated = true;
      break;
    }
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  return { text: text + decoder.decode(), truncated };
}

export class RobotsEnforcer {
  private cache = new Map<string, CachedRobotsRecord>();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  private readonly FAIL_SAFE_TTL_MS = 60 * 60 * 1000;

  public async getRobots(origin: string): Promise<CachedRobotsRecord> {
    const cached = this.cache.get(origin);
    const now = Date.now();
    if (cached) {
      const ttl = cached.statusCode >= 500 || (cached.statusCode >= 300 && cached.statusCode < 400)
        ? this.FAIL_SAFE_TTL_MS : this.CACHE_TTL_MS;
      if (now - cached.fetchedAt < ttl) return cached;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        signal: controller.signal,
        redirect: "manual", // No unchecked cross-origin redirect by the crawler fetch path.
        headers: { "User-Agent": CRAWLER_USER_AGENT, Accept: "text/plain" }
      });
      const record: CachedRobotsRecord = {
        host: origin, fetchedAt: now, statusCode: response.status
      };
      if (response.ok) {
        const source = await boundedRobotsText(response);
        record.truncated = source.truncated;
        if (!source.truncated) {
          record.matcher = compileRobotsText(source.text, { policy: "rfc9309" }).forCrawler(CRAWLER_ROBOTS_TOKEN);
        }
      }
      // 3xx, 5xx and access refusals fail closed. RFC 9309 allows 4xx to be
      // treated as unavailable; this project only allows confirmed missing files.
      this.cache.set(origin, record);
      return record;
    } catch (error) {
      logger.warn(`[Robots] Failed to fetch robots.txt for ${origin}: ${String(error)}`);
      const record: CachedRobotsRecord = { host: origin, fetchedAt: now, statusCode: 599 };
      this.cache.set(origin, record);
      return record;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async isAllowed(targetUrl: string): Promise<boolean> {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
      const robots = await this.getRobots(parsed.origin);
      if (robots.matcher) return robots.matcher.isAllowed(parsed.href);
      return robots.statusCode === 404 || robots.statusCode === 410;
    } catch {
      return false;
    }
  }
}

export const robotsEnforcer = new RobotsEnforcer();
