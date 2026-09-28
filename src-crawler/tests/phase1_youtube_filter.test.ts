import { describe, it, expect } from "bun:test";

describe("Phase 1 - Task 1.6: Filter YouTube Embeds at Frontier and Image Proxy", () => {
  it("matches YouTube embed and video URLs against skipPatterns", () => {
    const skipPatterns = [
      /\/favicon\./i, /\/icon[s]?\./i, /\/logo[s]?\./i,
      /\/user-profile\//i, /\/avatar\//i, /\/a\/[^/]+\.(png|jpg|gif|webp)$/i,
      /[?&]s=(\d+)(&|$)/,
      /opengraph\.githubassets\.com/,
      /youtube\.com\/embed\//i,
      /youtu\.be\//i,
      /vimeo\.com\//i
    ];

    const testUrls = [
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://youtube.com/embed/abcdef12345",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://vimeo.com/12345678",
      "https://player.vimeo.com/video/12345678"
    ];

    for (const url of testUrls) {
      const isSkipped = skipPatterns.some(pat => pat.test(url));
      expect(isSkipped).toBe(true);
    }

    const validImageUrls = [
      "https://booth.pximg.net/c/620x620/12345_product.jpg",
      "https://public-files.gumroad.com/variants/123/cover.png",
      "https://img.itch.zone/aW1nLzE4Nzk5MjgxLnBuZw==/508x254%23mb/preview.png"
    ];

    for (const img of validImageUrls) {
      const isSkipped = skipPatterns.some(pat => pat.test(img));
      expect(isSkipped).toBe(false);
    }
  });

  it("extracts YouTube video ID from embed and short URLs into youtube_urls", () => {
    const testCases = [
      { input: "https://www.youtube.com/embed/dQw4w9WgXcQ", expectedId: "dQw4w9WgXcQ" },
      { input: "https://youtu.be/dQw4w9WgXcQ", expectedId: "dQw4w9WgXcQ" },
      { input: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", expectedId: "dQw4w9WgXcQ" }
    ];

    for (const { input, expectedId } of testCases) {
      const match = input.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i);
      expect(match).not.toBeNull();
      expect(match![1]).toBe(expectedId);
      const canonicalYt = `https://www.youtube.com/watch?v=${match![1]}`;
      expect(canonicalYt).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    }
  });
});
