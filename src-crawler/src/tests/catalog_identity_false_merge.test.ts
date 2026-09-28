import { describe, expect, it } from "bun:test";
import { CrawlerDB } from "../db.ts";
import { runProjection } from "../crawler/projection.ts";

type Storefront = {
  id: string;
  platform: "booth" | "gumroad";
  url: string;
  author: string;
  externalLinks?: string[];
};

async function projectStorefronts(items: Storefront[]) {
  const fixture = new CrawlerDB(":memory:");
  try {
    const now = new Date().toISOString();
    const insert = fixture.rawDb.prepare(`
      INSERT INTO entities (
        id, platform, url, title, author, description, tags_json,
        external_links_json, raw_json, is_quarantined, observed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '["vpm-package"]', ?, '{}', 0, ?, ?, ?)
    `);
    for (const item of items) {
      insert.run(item.id, item.platform, item.url, "VRChat Avatar Tool", item.author,
        "VRChat avatar editor tool with configurable animation controls and workflow support.",
        JSON.stringify(item.externalLinks || []), now, now, now);
    }
    await runProjection({ targetDb: fixture.rawDb });
    return fixture.rawDb.query(`
      SELECT raw_entity_id, canonical_id FROM package_fronts ORDER BY raw_entity_id
    `).all() as Array<{raw_entity_id: string; canonical_id: string}>;
  } finally {
    fixture.close();
  }
}

const boothUrl = "https://sample.booth.pm/items/12345";
const gumroadUrl = "https://another.gumroad.com/l/avatar-tool";
const booth = { id: "booth:12345", platform: "booth", url: boothUrl } as const;
const gumroad = { id: "gumroad:avatar-tool", platform: "gumroad", url: gumroadUrl } as const;

describe("catalog identity requires evidence beyond an unknown author", () => {
  it("does not merge identical titles and descriptions when both authors are unknown", async () => {
    const fronts = await projectStorefronts([
      { ...booth, author: "Unknown" },
      { ...gumroad, author: "Unknown" }
    ]);
    expect(fronts).toHaveLength(2);
    expect(new Set(fronts.map(f => f.canonical_id)).size).toBe(2);
  });

  it("does not let an unknown author match a named publisher by SimHash", async () => {
    const fronts = await projectStorefronts([
      { ...booth, author: "Ada" },
      { ...gumroad, author: "Unknown" }
    ]);
    expect(new Set(fronts.map(f => f.canonical_id)).size).toBe(2);
  });

  it("still merges same known author and title", async () => {
    const fronts = await projectStorefronts([
      { ...booth, author: "Ada" },
      { ...gumroad, author: "Ada" }
    ]);
    expect(new Set(fronts.map(f => f.canonical_id)).size).toBe(1);
  });

  it("still merges an unknown-author listing with an explicit cross-storefront link", async () => {
    const fronts = await projectStorefronts([
      { ...booth, author: "Unknown" },
      { ...gumroad, author: "Unknown", externalLinks: [boothUrl] }
    ]);
    expect(new Set(fronts.map(f => f.canonical_id)).size).toBe(1);
  });
});
