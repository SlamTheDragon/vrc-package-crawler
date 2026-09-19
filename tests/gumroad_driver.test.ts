import { describe, it, expect } from "bun:test";
import { db } from "../src/db.ts";

describe("Gumroad Driver & Priority Escalation Invariants", () => {
  it("promotes priority on conflict when URL is queued with higher priority", () => {
    const testUrl = `https://gumroad.com/l/test-priority-${Date.now()}`;
    
    // First queue with default priority 0
    db.queueUrl(testUrl, "gumroad", 0);
    let row = db.query("SELECT url, priority, status FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(row).toBeTruthy();
    expect(row.priority).toBe(0);
    expect(row.status).toBe("pending");

    // Queue again with elevated priority 10
    db.queueUrl(testUrl, "gumroad", 10);
    row = db.query("SELECT url, priority, status FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(row.priority).toBe(10);

    // Clean up
    db.run("DELETE FROM frontier WHERE url = ?;", [testUrl]);
  });

  it("promotes failed URLs back to pending when re-queued with elevated priority", () => {
    const testUrl = `https://gumroad.com/l/test-failed-${Date.now()}`;
    db.queueUrl(testUrl, "gumroad", 0);
    db.markStatus(testUrl, "failed");

    let row = db.query("SELECT status, priority FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(row.status).toBe("failed");
    expect(row.priority).toBe(0);

    // Re-queue with priority 10
    db.queueUrl(testUrl, "gumroad", 10);
    row = db.query("SELECT status, priority FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(row.status).toBe("pending");
    expect(row.priority).toBe(10);

    // Clean up
    db.run("DELETE FROM frontier WHERE url = ?;", [testUrl]);
  });

  it("correctly identifies and promotes shallow Gumroad entities via requeueShallowGumroadEntities", () => {
    const permalink = `shallow_test_${Date.now()}`;
    const entId = `gumroad:${permalink}`;
    const testUrl = `https://testcreator.gumroad.com/l/${permalink}`;

    // Insert shallow entity (1 media URL)
    db.saveEntity({
      id: entId,
      platform: "gumroad",
      url: testUrl,
      title: "Shallow Test Item",
      author: "TestCreator",
      description: "Shallow description",
      tags_json: JSON.stringify(["gumroad", "vrchat"]),
      external_links_json: "[]",
      raw_json: JSON.stringify({
        thumbnail_url: "https://public-files.gumroad.com/thumb1",
        media_urls: ["https://public-files.gumroad.com/thumb1"],
        youtube_urls: []
      })
    });

    // Queue in frontier at priority 0
    db.queueUrl(testUrl, "gumroad", 0);

    // Execute requeue
    const res = db.requeueShallowGumroadEntities();
    expect(res.inspected).toBeGreaterThan(0);

    const fRow = db.query("SELECT priority, status FROM frontier WHERE url = ?;").get(testUrl) as any;
    expect(fRow).toBeTruthy();
    expect(fRow.priority).toBe(10);
    expect(fRow.status).toBe("pending");

    // Clean up
    db.run("DELETE FROM entities WHERE id = ?;", [entId]);
    db.run("DELETE FROM frontier WHERE url = ?;", [testUrl]);
  });

  it("parses oembed YouTube covers, MP4 videos, and quality images into distinct sets", () => {
    const rawCovers = [
      {
        url: "https://public-files.gumroad.com/preview1",
        original_url: "https://public-files.gumroad.com/highres1",
        type: "image",
        native_width: 1920,
        native_height: 1080
      },
      {
        url: "https://public-files.gumroad.com/preview_small",
        type: "image",
        native_width: 100,
        native_height: 100
      },
      {
        url: "https://public-files.gumroad.com/clip.mp4",
        thumbnail: "https://public-files.gumroad.com/clip_poster.jpg",
        type: "video",
        native_width: 1920,
        native_height: 1080
      },
      {
        url: "https://www.youtube.com/embed/yyJ4PPsNs0g?feature=oembed",
        thumbnail: "https://i.ytimg.com/vi/yyJ4PPsNs0g/hqdefault.jpg",
        type: "oembed"
      }
    ];

    const mediaSet = new Set<string>();
    const videoSet = new Set<string>();
    const ytSet = new Set<string>();

    for (const cover of rawCovers) {
      const coverUrl: string = cover?.original_url || cover?.url || "";
      const type: string = cover?.type || "image";
      if (!coverUrl || !coverUrl.startsWith("http")) continue;

      if (type === "oembed" || coverUrl.includes("youtube.com") || coverUrl.includes("youtu.be")) {
        const ytMatch = coverUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
        if (ytMatch) {
          ytSet.add(`https://www.youtube.com/watch?v=${ytMatch[1]}`);
        }
        const thumb: string = cover?.thumbnail || "";
        if (thumb && thumb.startsWith("http")) {
          mediaSet.add(thumb.split("?")[0]);
        }
        continue;
      }

      const w: number = cover?.native_width || cover?.width || 0;
      const h: number = cover?.native_height || cover?.height || 0;
      if (w > 0 && h > 0 && Math.min(w, h) < 200) continue;

      if (type === "video") {
        videoSet.add(coverUrl.split("?")[0]);
        const thumb: string = cover?.thumbnail || "";
        if (thumb && thumb.startsWith("http")) {
          mediaSet.add(thumb.split("?")[0]);
        }
      } else {
        mediaSet.add(coverUrl.split("?")[0]);
      }
    }

    // Check images
    expect(mediaSet.has("https://public-files.gumroad.com/highres1")).toBe(true);
    // Small preview (100x100) was filtered out
    expect(mediaSet.has("https://public-files.gumroad.com/preview_small")).toBe(false);
    // Video poster thumbnail is included in mediaSet
    expect(mediaSet.has("https://public-files.gumroad.com/clip_poster.jpg")).toBe(true);
    // YouTube thumbnail is included in mediaSet
    expect(mediaSet.has("https://i.ytimg.com/vi/yyJ4PPsNs0g/hqdefault.jpg")).toBe(true);
    // YouTube embed HTML URL is NOT in mediaSet
    expect(mediaSet.has("https://www.youtube.com/embed/yyJ4PPsNs0g")).toBe(false);

    // Check videos
    expect(videoSet.has("https://public-files.gumroad.com/clip.mp4")).toBe(true);

    // Check YouTube
    expect(ytSet.has("https://www.youtube.com/watch?v=yyJ4PPsNs0g")).toBe(true);
  });
});
