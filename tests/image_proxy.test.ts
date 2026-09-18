import { describe, it, expect } from "bun:test";
import { computeBlurHash, computePHash64, sanitizeOutboundUrl, ImageProxyService } from "../src/utils/image_proxy.ts";

describe("Proxied Media Pipeline & Invariants", () => {
  it("computes a valid BlurHash string from RGB buffer", () => {
    // 32x32 image with 3 RGB bytes per pixel = 3072 bytes
    const dummyRgb = new Uint8Array(32 * 32 * 3);
    for (let i = 0; i < dummyRgb.length; i += 3) {
      dummyRgb[i] = 120;     // R
      dummyRgb[i + 1] = 180; // G
      dummyRgb[i + 2] = 240; // B
    }

    const hash = computeBlurHash(dummyRgb, 32, 32, 4, 3);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(10);
  });

  it("computes a 16-character 64-bit pHash from grayscale buffer", () => {
    const dummyGray = new Uint8Array(32 * 32);
    for (let i = 0; i < dummyGray.length; i++) {
      dummyGray[i] = (i % 256);
    }

    const phash = computePHash64(dummyGray);
    expect(phash).toBeDefined();
    expect(phash.length).toBe(16);
    expect(/^[0-9a-f]{16}$/.test(phash)).toBe(true);
  });

  it("strips unauthorized affiliate and tracking parameters for canonical routing", () => {
    const dirtyUrl = "https://booth.pm/ja/items/123456?aff=scam_tracker&utm_source=twitter&utm_medium=social&ref=shady_site";
    const cleanUrl = sanitizeOutboundUrl(dirtyUrl);
    expect(cleanUrl).toBe("https://booth.pm/ja/items/123456");
  });

  it("leaves clean URLs unaltered", () => {
    const cleanUrl = "https://github.com/bdunderscore/modular-avatar";
    expect(sanitizeOutboundUrl(cleanUrl)).toBe(cleanUrl);
  });
});
