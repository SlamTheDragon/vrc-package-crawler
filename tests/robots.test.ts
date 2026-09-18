import { describe, it, expect } from "bun:test";
import { RobotsEnforcer } from "../src/utils/robots.ts";

describe("RFC 9309 Robots Exclusion Protocol", () => {
  const enforcer = new RobotsEnforcer();

  it("prioritizes product-specific token over wildcard", () => {
    const robotsTxt = `
User-agent: *
Disallow: /private/
Allow: /public/

User-agent: VRCDiscoveryBot
Disallow: /crawler-block/
Allow: /private/
`;
    const { rules } = enforcer.parseRobotsTxt(robotsTxt);
    // Should match VRCDiscoveryBot rules
    expect(enforcer.isPathAllowed("/private/doc.html", rules)).toBe(true);
    expect(enforcer.isPathAllowed("/crawler-block/file.json", rules)).toBe(false);
  });

  it("follows longest prefix matching rule", () => {
    const robotsTxt = `
User-agent: *
Allow: /items/free/
Disallow: /items/
`;
    const { rules } = enforcer.parseRobotsTxt(robotsTxt);
    // /items/free/ (12 chars) vs /items/ (7 chars) -> /items/free/ wins
    expect(enforcer.isPathAllowed("/items/free/avatar.unitypackage", rules)).toBe(true);
    expect(enforcer.isPathAllowed("/items/paid/avatar.unitypackage", rules)).toBe(false);
  });

  it("allows when allow and disallow have equal length", () => {
    const robotsTxt = `
User-agent: *
Disallow: /p/
Allow: /p/
`;
    const { rules } = enforcer.parseRobotsTxt(robotsTxt);
    expect(enforcer.isPathAllowed("/p/123", rules)).toBe(true);
  });

  it("handles empty Disallow as allow-all", () => {
    const robotsTxt = `
User-agent: *
Disallow:
`;
    const { rules } = enforcer.parseRobotsTxt(robotsTxt);
    expect(enforcer.isPathAllowed("/anywhere", rules)).toBe(true);
  });

  it("handles wildcards and end of path $ correctly", () => {
    const robotsTxt = `
User-agent: *
Disallow: /*.json$
Allow: /manifest/*.json
`;
    const { rules } = enforcer.parseRobotsTxt(robotsTxt);
    expect(enforcer.isPathAllowed("/secret.json", rules)).toBe(false);
    expect(enforcer.isPathAllowed("/secret.json.bak", rules)).toBe(true);
    // Longest match: /manifest/*.json (17) vs /*.json$ (8)
    expect(enforcer.isPathAllowed("/manifest/package.json", rules)).toBe(true);
  });
});
