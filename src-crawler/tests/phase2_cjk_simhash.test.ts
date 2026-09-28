import { describe, it, expect } from "bun:test";
import { normalizeListingTitle } from "../src/utils/sanitizer.ts";
import { SimHash64 } from "../src/utils/simhash.ts";

describe("Phase 2 - Task 2.4: Implement CJK Text Normalization & SimHash Bracket Stripping", () => {
  it("normalizes NFKC and strips full-width decorative brackets", () => {
    const raw = "【VRChat想定】［無料］Modular Avatar対応 ツール（汎用）";
    const normalized = normalizeListingTitle(raw);
    expect(normalized).toBe("Modular Avatar対応 ツール");
    expect(normalized).not.toContain("【");
    expect(normalized).not.toContain("】");
    expect(normalized).not.toContain("［");
    expect(normalized).not.toContain("］");
    expect(normalized).not.toContain("（");
    expect(normalized).not.toContain("）");
  });

  it("converges Japanese BOOTH listing with Western mirror (Hamming distance <= 3)", () => {
    const jpTitle = "【VRChat想定】Modular Avatar対応 ツール";
    const enTitle = "Modular Avatar Tool";

    const hashJp = SimHash64.compute(jpTitle);
    const hashEn = SimHash64.compute(enTitle);

    const dist = SimHash64.hammingDistance(hashJp, hashEn);
    console.log(`[Task 2.4 Test] Hamming distance between "${jpTitle}" and "${enTitle}": ${dist}`);

    expect(dist).toBeLessThanOrEqual(3);
    expect(SimHash64.isNearDuplicate(hashJp, hashEn)).toBe(true);
  });

  it("converges VRCFury and NDMF shader listings across languages", () => {
    const jpListing = "【簡単導入】VRCFury対応 シェーダーシステム";
    const enListing = "VRCFury Shader System";

    const hashJp = SimHash64.compute(jpListing);
    const hashEn = SimHash64.compute(enListing);

    const dist = SimHash64.hammingDistance(hashJp, hashEn);
    expect(dist).toBeLessThanOrEqual(3);
    expect(SimHash64.isNearDuplicate(hashJp, hashEn)).toBe(true);
  });
});
