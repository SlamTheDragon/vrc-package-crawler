import { CONFIG } from "../config.ts";
import { logger } from "../logger.ts";

export interface RobotsRule {
  type: "allow" | "disallow";
  pattern: string;
  regex: RegExp;
  length: number;
}

export interface CachedRobotsRecord {
  host: string;
  fetchedAt: number;
  statusCode: number;
  rules: RobotsRule[];
  crawlDelayMs?: number;
}

export class RobotsEnforcer {
  private cache: Map<string, CachedRobotsRecord> = new Map();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours per RFC 9309
  private readonly FAIL_SAFE_TTL_MS = 60 * 60 * 1000; // 1 hour fail-safe polite on 5xx
  private readonly BOT_TOKEN = "vrcdiscoverybot";

  private patternToRegex(pattern: string): RegExp {
    // RFC 9309 section 2.2.2:
    // * matches zero or more characters
    // $ at end matches end of path
    const hasEndAnchor = pattern.endsWith("$");
    const cleanPattern = hasEndAnchor ? pattern.slice(0, -1) : pattern;

    // Split by * to preserve wildcard meaning
    const parts = cleanPattern.split("*");
    const escapedParts = parts.map(part => part.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"));
    const regexStr = "^" + escapedParts.join(".*") + (hasEndAnchor ? "$" : "");
    return new RegExp(regexStr);
  }

  public parseRobotsTxt(content: string): { rules: RobotsRule[]; crawlDelayMs?: number } {
    const lines = content.split(/\r?\n/);
    const groups: { userAgents: string[]; rules: RobotsRule[]; crawlDelayMs?: number }[] = [];
    let currentAgents: string[] = [];
    let currentRules: RobotsRule[] = [];
    let currentDelay: number | undefined;

    for (let rawLine of lines) {
      // Strip comments
      const commentIdx = rawLine.indexOf("#");
      const line = (commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine).trim();
      if (!line) continue;

      const sep = line.indexOf(":");
      if (sep === -1) continue;

      const directive = line.slice(0, sep).trim().toLowerCase();
      const value = line.slice(sep + 1).trim();

      if (directive === "user-agent") {
        // If we were parsing rules and encounter a new user-agent, that starts a new group
        if (currentRules.length > 0 || currentDelay !== undefined) {
          if (currentAgents.length > 0) {
            groups.push({
              userAgents: currentAgents,
              rules: currentRules,
              crawlDelayMs: currentDelay
            });
          }
          currentAgents = [];
          currentRules = [];
          currentDelay = undefined;
        }
        currentAgents.push(value.toLowerCase());
      } else if (directive === "allow" || directive === "disallow") {
        if (value.length > 0) {
          const rule: RobotsRule = {
            type: directive as "allow" | "disallow",
            pattern: value,
            regex: this.patternToRegex(value),
            length: value.length
          };
          currentRules.push(rule);
        } else if (directive === "disallow" && value === "") {
          // RFC 9309: An empty Disallow means allow all
          currentRules.push({
            type: "allow",
            pattern: "/",
            regex: /^\//,
            length: 1
          });
        }
      } else if (directive === "crawl-delay") {
        const delaySec = parseFloat(value);
        if (!isNaN(delaySec) && delaySec >= 0) {
          currentDelay = Math.round(delaySec * 1000);
        }
      }
    }

    if (currentAgents.length > 0 && (currentRules.length > 0 || currentDelay !== undefined)) {
      groups.push({
        userAgents: currentAgents,
        rules: currentRules,
        crawlDelayMs: currentDelay
      });
    }

    // Select group: Specific bot match first, fallback to wildcard '*'
    let matchingGroup = groups.find(g =>
      g.userAgents.some(ua => ua === this.BOT_TOKEN || ua.includes(this.BOT_TOKEN))
    );

    if (!matchingGroup) {
      matchingGroup = groups.find(g => g.userAgents.some(ua => ua === "*"));
    }

    return {
      rules: matchingGroup?.rules || [],
      crawlDelayMs: matchingGroup?.crawlDelayMs
    };
  }

  public async getRobots(origin: string): Promise<CachedRobotsRecord> {
    const cached = this.cache.get(origin);
    const now = Date.now();

    if (cached) {
      const ttl = (cached.statusCode >= 500 && cached.statusCode <= 599)
        ? this.FAIL_SAFE_TTL_MS
        : this.CACHE_TTL_MS;
      if (now - cached.fetchedAt < ttl) {
        return cached;
      }
    }

    const robotsUrl = `${origin}/robots.txt`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "text/plain"
        }
      });
      clearTimeout(timeoutId);

      const statusCode = resp.status;
      if (statusCode >= 200 && statusCode < 300) {
        const text = await resp.text();
        const { rules, crawlDelayMs } = this.parseRobotsTxt(text);
        const record: CachedRobotsRecord = {
          host: origin,
          fetchedAt: now,
          statusCode,
          rules,
          crawlDelayMs
        };
        this.cache.set(origin, record);
        return record;
      } else if (statusCode >= 500 && statusCode <= 599) {
        // RFC 9309: Server error -> treat entire site as disallowed (fail-safe polite)
        const record: CachedRobotsRecord = {
          host: origin,
          fetchedAt: now,
          statusCode,
          rules: [{
            type: "disallow",
            pattern: "/",
            regex: /^/,
            length: 1
          }]
        };
        this.cache.set(origin, record);
        return record;
      } else {
        // 4xx or other -> treat site as allowed
        const record: CachedRobotsRecord = {
          host: origin,
          fetchedAt: now,
          statusCode,
          rules: []
        };
        this.cache.set(origin, record);
        return record;
      }
    } catch (err) {
      // Network timeout / connect error -> treat as allowed with short 5-minute retry TTL
      logger.warn(`[Robots] Failed to fetch robots.txt for ${origin}: ${String(err)}`);
      const record: CachedRobotsRecord = {
        host: origin,
        fetchedAt: now,
        statusCode: 599,
        rules: []
      };
      this.cache.set(origin, record);
      return record;
    }
  }

  public isPathAllowed(path: string, rules: RobotsRule[]): boolean {
    if (rules.length === 0) return true;

    // RFC 9309 section 2.2.1:
    // Longest prefix match wins.
    // If allow and disallow have same match length, allow wins.
    let bestMatch: RobotsRule | null = null;

    for (const rule of rules) {
      if (rule.regex.test(path)) {
        if (!bestMatch || rule.length > bestMatch.length) {
          bestMatch = rule;
        } else if (rule.length === bestMatch.length && rule.type === "allow" && bestMatch.type === "disallow") {
          bestMatch = rule;
        }
      }
    }

    if (!bestMatch) return true;
    return bestMatch.type === "allow";
  }

  public async isAllowed(targetUrl: string): Promise<boolean> {
    try {
      const parsed = new URL(targetUrl);
      const origin = parsed.origin;
      const pathAndQuery = parsed.pathname + parsed.search;

      const robots = await this.getRobots(origin);
      return this.isPathAllowed(pathAndQuery, robots.rules);
    } catch {
      return true;
    }
  }
}

export const robotsEnforcer = new RobotsEnforcer();
