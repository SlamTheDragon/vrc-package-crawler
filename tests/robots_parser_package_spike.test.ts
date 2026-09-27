import { describe, expect, test } from "bun:test";
import { compileRobotsText } from "@trybyte/robotstxt-parser";

const forBot = (text: string) => compileRobotsText(text, { policy: "rfc9309" }).forCrawler("VRCDiscoveryBot");

describe("RFC 9309 parser package spike", () => {
  test("selects and merges repeated specific groups instead of first-group-only", () => {
    const bot = forBot(`User-agent: *\nDisallow: /\nUser-agent: VRCDiscoveryBot\nDisallow: /first\nUser-agent: OtherBot\nAllow: /\nUser-agent: VRCDiscoveryBot\nDisallow: /second`);
    expect(bot.isAllowed("https://example.org/first/item")).toBe(false);
    expect(bot.isAllowed("https://example.org/second/item")).toBe(false);
    expect(bot.isAllowed("https://example.org/elsewhere")).toBe(true);
  });

  test("applies published itch search disallow and allows unrelated browse path", () => {
    const bot = forBot("User-agent: *\nDisallow: /search");
    expect(bot.match("https://itch.io/search?q=vrchat").allowed).toBe(false);
    expect(bot.match("https://itch.io/tools/tag-vrchat").allowed).toBe(true);
  });

  test("handles encoded path and equally specific allow with RFC mode", () => {
    const bot = forBot("User-agent: *\nDisallow: /private\nAllow: /private\nDisallow: /caf%C3%A9");
    expect(bot.isAllowed("https://example.org/private")).toBe(true);
    expect(bot.isAllowed("https://example.org/caf%C3%A9")).toBe(false);
  });
});
