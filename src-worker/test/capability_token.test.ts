import { describe, expect, spyOn, test } from "bun:test";
import {
  PLATFORM_BIT_MAP,
  encodeCapabilityCode,
  decodeCapabilityCode,
  formatCapabilityToken,
  parseCapabilityToken,
  isCapabilityToken
} from "../src/domain/security/capability_token.ts";
import { PlatformSchema, type Platform } from "vrc-packages-network/node";

describe("Capability Token Encoding and Decoding", () => {
  test("generates node-token entropy with portable Web Crypto", () => {
    const nativeRandom = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    const random = spyOn(globalThis.crypto, "getRandomValues").mockImplementation(array => {
      expect(array).toBeInstanceOf(Uint8Array);
      expect(array!.byteLength).toBe(32);
      return nativeRandom(array);
    });
    try {
      const token = formatCapabilityToken(["vpm"]);
      expect(parseCapabilityToken(token)?.capabilities).toEqual(["vpm"]);
      expect(random).toHaveBeenCalledTimes(1);
    } finally { random.mockRestore(); }
  });

  test("PLATFORM_BIT_MAP covers all PlatformSchema options without collisions", () => {
    const seenBits = new Set<number>();
    for (const platform of PlatformSchema.options) {
      const bit = PLATFORM_BIT_MAP[platform];
      expect(bit).toBeDefined();
      expect(bit).toBeGreaterThan(0);
      expect(seenBits.has(bit)).toBe(false);
      seenBits.add(bit);
    }
    expect(seenBits.size).toBe(PlatformSchema.options.length);
  });

  test("encodeCapabilityCode encodes single capability accurately", () => {
    expect(encodeCapabilityCode(["booth"])).toBe("0001");
    expect(encodeCapabilityCode(["github"])).toBe("0002");
    expect(encodeCapabilityCode(["vpm"])).toBe("0004");
    expect(encodeCapabilityCode(["gumroad"])).toBe("0008");
    expect(encodeCapabilityCode(["shopify"])).toBe("0080");
  });

  test("encodeCapabilityCode encodes multiple capabilities as bitwise OR", () => {
    // vpm (4) + github (2) = 6
    expect(encodeCapabilityCode(["vpm", "github"])).toBe("0006");
    // booth (1) + shopify (128 = 0x80) = 129 = 0x81
    expect(encodeCapabilityCode(["booth", "shopify"])).toBe("0081");
    // All 10 platforms: 0x03ff
    expect(encodeCapabilityCode(PlatformSchema.options)).toBe("03ff");
  });

  test("decodeCapabilityCode round-trips correctly", () => {
    for (const platform of PlatformSchema.options) {
      const code = encodeCapabilityCode([platform]);
      const decoded = decodeCapabilityCode(code);
      expect(decoded).toEqual([platform]);
    }

    const multi: Platform[] = ["vpm", "booth", "shopify"];
    const code = encodeCapabilityCode(multi);
    const decoded = decodeCapabilityCode(code);
    expect(decoded?.sort()).toEqual(multi.sort());
  });

  test("decodeCapabilityCode returns null for invalid codes", () => {
    expect(decodeCapabilityCode("0000")).toBeNull();
    expect(decodeCapabilityCode("ffff")).toBeNull(); // Has bits above 0x03ff
    expect(decodeCapabilityCode("xyz1")).toBeNull(); // Non-hex
    expect(decodeCapabilityCode("001")).toBeNull();  // Too short
    expect(decodeCapabilityCode("00001")).toBeNull(); // Too long
  });

  test("formatCapabilityToken and parseCapabilityToken round-trip in vrcp_<auth_token><capability> format", () => {
    const caps: Platform[] = ["vpm", "github"];
    const token = formatCapabilityToken(caps);
    expect(isCapabilityToken(token)).toBe(true);
    expect(token.startsWith("vrcp_")).toBe(true);
    expect(token.endsWith("0006")).toBe(true);
    expect(token.length).toBe(73); // 5 (vrcp_) + 64 (entropy) + 4 (code)

    const parsed = parseCapabilityToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.code).toBe("0006");
    expect(parsed!.capabilities.sort()).toEqual(caps.sort());
    expect(parsed!.entropy.length).toBe(64);
  });

  test("parseCapabilityToken rejects tampered or invalid tokens", () => {
    expect(parseCapabilityToken("invalid-token")).toBeNull();
    expect(parseCapabilityToken("vrcp_" + "a".repeat(64) + "0000")).toBeNull(); // 0000 has 0 caps
    expect(parseCapabilityToken("vrcp_" + "a".repeat(64) + "ffff")).toBeNull(); // ffff has invalid bits
    expect(parseCapabilityToken("vrcp_" + "a".repeat(32) + "0004")).toBeNull(); // short entropy
    expect(parseCapabilityToken("vrc_cap_0004_" + "a".repeat(64))).toBeNull(); // legacy format purged
  });
});
