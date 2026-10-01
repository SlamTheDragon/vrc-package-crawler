import { describe, it, expect } from "bun:test";
import {
  UmbrellaSchema,
  DesktopToolSubtypeSchema,
  DesktopToolEvidenceSchema
} from "../src/taxonomy/taxonomy.ts";
import { AvatarCompatibilitySchema } from "../src/taxonomy/avatar.ts";
import { isVpmVersion, compareVpmVersions, cleanVpmVersion } from "../src/taxonomy/version.ts";

describe("src-package consumer taxonomy & schemas", () => {
  it("validates Umbrella and DesktopToolSubtype enums", () => {
    expect(UmbrellaSchema.parse("tools")).toBe("tools");
    expect(UmbrellaSchema.parse("assets")).toBe("assets");
    expect(UmbrellaSchema.parse("avatars")).toBe("avatars");
    expect(() => UmbrellaSchema.parse("invalid")).toThrow();

    expect(DesktopToolSubtypeSchema.parse("companion_client")).toBe("companion_client");
    expect(DesktopToolSubtypeSchema.parse("osc_control")).toBe("osc_control");
    expect(() => DesktopToolSubtypeSchema.parse("game_mod")).toThrow();
  });

  it("validates DesktopToolEvidenceSchema", () => {
    const validEvidence = {
      canonicalId: "pkg-123",
      toolSubtype: "companion_client" as const,
      supportedOS: ["windows" as const, "linux" as const],
      particularVRChatTarget: true,
      evidenceUrl: "https://github.com/vrcx-team/VRCX",
      publisherClaim: "VRChat companion application"
    };
    expect(DesktopToolEvidenceSchema.parse(validEvidence)).toEqual(validEvidence);
  });

  it("validates AvatarCompatibilitySchema", () => {
    const validCompat = {
      compatibilityId: "comp-1",
      itemKey: "item-123",
      targetAvatarBase: "kikyo",
      scope: "named_base" as const,
      confidence: "creator_declared" as const,
      evidenceSource: "title"
    };
    expect(AvatarCompatibilitySchema.parse(validCompat)).toEqual(validCompat);
  });

  it("handles VPM SemVer checks and comparison for package managers", () => {
    expect(isVpmVersion("1.0.0")).toBe(true);
    expect(isVpmVersion("2.1.3-beta.1")).toBe(true);
    expect(isVpmVersion("v1.0.0")).toBe(false); // leading v rejected in strict VPM SemVer
    expect(isVpmVersion(" 1.0.0 ")).toBe(false);

    expect(compareVpmVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVpmVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVpmVersions("1.0.0", "1.0.0")).toBe(0);

    expect(cleanVpmVersion("v1.2.3")).toBe("1.2.3");
  });
});
