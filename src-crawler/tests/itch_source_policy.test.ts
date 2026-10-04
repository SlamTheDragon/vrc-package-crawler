import { describe, expect, test } from "bun:test";
import { buildItchSeedUrls, isItchSearchUrl } from "vrc-packages-network/source-paths";

describe("itch.io source-policy boundary", () => {
  test("default browse seeds do not include the robots-disallowed search prefix", () => {
    const seeds = buildItchSeedUrls();
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds.every((url) => !isItchSearchUrl(url))).toBe(true);
  });

  test("recognizes the exact disallowed /search prefix, including query variants", () => {
    expect(isItchSearchUrl("https://itch.io/search?q=vrchat+osc")).toBe(true);
    expect(isItchSearchUrl("https://itch.io/search/advanced?q=vrchat")).toBe(true);
    expect(isItchSearchUrl("https://itch.io/tools/tag-vrchat?page=1")).toBe(false);
    expect(isItchSearchUrl("https://creator.itch.io/search-helper")).toBe(false);
  });
});
