import { describe, it, expect } from "bun:test";
import {
  DesktopToolSubtypeSchema,
  DesktopToolEvidenceSchema,
  classifyDesktopTool,
  deriveCategoryFromTags
} from "../src/shared/taxonomy.ts";
import {
  AvatarCompatibilitySchema,
  extractAvatarCompatibility
} from "../src/shared/avatar_compatibility.ts";

describe("Desktop Tool Tagging & Evidence (Gate G4 & Task 5.5)", () => {
  it("validates DesktopToolEvidenceSchema against authoritative publisher records", () => {
    const validEvidence = {
      canonicalId: "vrcx-official",
      toolSubtype: "companion_client",
      supportedOS: ["windows"],
      particularVRChatTarget: true,
      evidenceUrl: "https://github.com/vrcx-team/VRCX",
      publisherClaim: "VRCX is an assistant/companion application for VRChat"
    };

    const parsed = DesktopToolEvidenceSchema.parse(validEvidence);
    expect(parsed.canonicalId).toBe("vrcx-official");
    expect(parsed.toolSubtype).toBe("companion_client");
    expect(parsed.supportedOS).toEqual(["windows"]);
  });

  it("rejects invalid DesktopToolEvidence missing required fields or bad URL", () => {
    expect(() => {
      DesktopToolEvidenceSchema.parse({
        canonicalId: "bad-entry",
        toolSubtype: "companion_client",
        supportedOS: ["windows"],
        particularVRChatTarget: true,
        evidenceUrl: "not-a-valid-url",
        publisherClaim: "Test"
      });
    }).toThrow();
  });

  describe("classifyDesktopTool positives", () => {
    it("classifies VRCX as a high-confidence companion_client", () => {
      const res = classifyDesktopTool(
        "VRCX",
        "Friendship management and companion application for VRChat",
        ["https://github.com/vrcx-team/VRCX"],
        ["vrchat", "desktop", "companion"]
      );

      expect(res.isDesktopTool).toBe(true);
      expect(res.subtype).toBe("companion_client");
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
      expect(res.reason).toContain("VRCX");
    });

    it("classifies VRCFaceTracking as a high-confidence tracking_bridge", () => {
      const res = classifyDesktopTool(
        "VRCFaceTracking",
        "VRChat OSC tracking bridge for facial and eye tracking hardware",
        ["https://github.com/benaclejames/VRCFaceTracking"],
        ["vrchat", "osc", "face-tracking"]
      );

      expect(res.isDesktopTool).toBe(true);
      expect(res.subtype).toBe("tracking_bridge");
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
      expect(res.reason).toContain("VRCFaceTracking");
    });

    it("classifies VRCOSC as a high-confidence osc_control application", () => {
      const res = classifyDesktopTool(
        "VRCOSC",
        "Modular VRChat OSC desktop utility and parameter router",
        ["https://github.com/VolcanicArts/VRCOSC"],
        ["vrchat", "osc"]
      );

      expect(res.isDesktopTool).toBe(true);
      expect(res.subtype).toBe("osc_control");
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
      expect(res.reason).toContain("VRCOSC");
    });

    it("classifies ADVOSC as a high-confidence VRChat OSC utility", () => {
      const res = classifyDesktopTool(
        "ADVOSC",
        "Windows VRChat OSC app for chatbox templates and avatar-parameter control",
        ["https://github.com/TheArmagan/advosc"],
        ["vrchat", "osc", "chatbox"]
      );

      expect(res.isDesktopTool).toBe(true);
      expect(["osc_control", "utility"]).toContain(res.subtype!);
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
      expect(res.reason).toContain("ADVOSC");
    });

    it("classifies novel VRChat streaming and accessibility desktop tool", () => {
      const res = classifyDesktopTool(
        "VRChat STT & Speech-To-Text Chatbox Overlay",
        "Standalone desktop application displaying speech to text subtitles in VRChat chatbox and stream overlay",
        [],
        ["vrchat", "accessibility", "stt", "overlay"]
      );

      expect(res.isDesktopTool).toBe(true);
      expect(res.subtype).toBe("streaming_accessibility");
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it("classifies novel VRChat desktop cache cleaner utility", () => {
      const res = classifyDesktopTool(
        "VRChat Cache Cleaner & Screenshot Organizer",
        "Windows desktop utility to clean VRChat cache folders and manage screenshots",
        [],
        ["vrchat", "utility", "windows", "desktop"]
      );

      expect(res.isDesktopTool).toBe(true);
      expect(res.subtype).toBe("utility");
      expect(res.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe("classifyDesktopTool negatives (leads & exclusions)", () => {
    it("rejects generic SteamVR base station mount as physical accessory (lead/negative)", () => {
      const res = classifyDesktopTool(
        "Generic SteamVR Base Station Mount",
        "3D printable wall mount for HTC Vive and Valve Index base stations",
        [],
        ["steamvr", "hardware", "3d-print"]
      );

      expect(res.isDesktopTool).toBe(false);
      expect(res.confidence).toBeLessThan(0.5);
    });

    it("rejects generic Unity editor tools without desktop distribution", () => {
      const res = classifyDesktopTool(
        "Hierarchy Folder Organizer",
        "Unity editor extension to organize gameobjects in hierarchy window",
        [],
        ["unity", "editor-extension"]
      );

      expect(res.isDesktopTool).toBe(false);
      expect(res.confidence).toBeLessThan(0.5);
    });

    it("rejects generic OSC libraries without VRChat specificity", () => {
      const res = classifyDesktopTool(
        "node-osc",
        "General purpose OSC (Open Sound Control) library for Node.js",
        [],
        ["osc", "npm", "audio"]
      );

      expect(res.isDesktopTool).toBe(false);
      expect(res.confidence).toBeLessThan(0.5);
    });

    it("rejects avatar clothing and 3D assets", () => {
      const res = classifyDesktopTool(
        "Casual Dress for VRChat",
        "3D clothing model rigged for VRChat avatars, includes unitypackage",
        [],
        ["vrchat", "clothing", "3d-model"]
      );

      expect(res.isDesktopTool).toBe(false);
      expect(res.confidence).toBeLessThan(0.5);
    });
  });
});

describe("Avatar Compatibility Taxonomy (IDENTITY-02)", () => {
  it("extracts Japanese multi-base avatar declarations with CJK bracket normalization", () => {
    const items = extractAvatarCompatibility(
      "【桔梗・マヌカ・セレスティア対応】Cute Gothic Dress",
      "桔梗、マヌカ、セレスティア向けに調整された衣装です。",
      ["桔梗", "マヌカ", "セレスティア", "VRChat"],
      "item-gothic-dress"
    );

    expect(items.length).toBe(3);
    const bases = items.map(i => i.targetAvatarBase).sort();
    expect(bases).toEqual(["kikyo", "manuka", "selestia"]);

    for (const item of items) {
      expect(item.scope).toBe("named_base");
      expect(item.confidence).toBe("creator_declared");
      expect(item.itemKey).toBe("item-gothic-dress");
      // Schema validation
      expect(AvatarCompatibilitySchema.parse(item)).toBeDefined();
    }
  });

  it("extracts Western listings with slash delimiters and base avatar tags", () => {
    const items = extractAvatarCompatibility(
      "[Kikyo/Shinano] Streetwear Hoodie",
      "Designed for Kikyo and Shinano avatar base meshes.",
      ["kikyo", "shinano", "hoodie"],
      "item-street-hoodie"
    );

    expect(items.length).toBe(2);
    const bases = items.map(i => i.targetAvatarBase).sort();
    expect(bases).toEqual(["kikyo", "shinano"]);

    for (const item of items) {
      expect(item.scope).toBe("named_base");
      expect(AvatarCompatibilitySchema.parse(item)).toBeDefined();
    }
  });

  it("detects Japanese universal compatibility declarations (全アバター対応)", () => {
    const items = extractAvatarCompatibility(
      "【全アバター対応】スマートメガネ",
      "全アバター対応のメガネアクセサリーです。汎用ボーン設計。",
      ["全アバター対応", "メガネ"],
      "item-smart-glasses"
    );

    expect(items.length).toBe(1);
    const universal = items[0];
    expect(universal.targetAvatarBase).toBe("generic");
    expect(universal.scope).toBe("universal");
    expect(universal.confidence).toBe("creator_declared");
    expect(AvatarCompatibilitySchema.parse(universal)).toBeDefined();
  });

  it("detects Japanese universal compatibility declarations with 全対応 and 汎用", () => {
    const items = extractAvatarCompatibility(
      "【全対応】アンティークチョーカー",
      "VRChat想定の汎用アクセサリー",
      ["アクセサリー"],
      "item-choker"
    );

    expect(items.length).toBe(1);
    expect(items[0].targetAvatarBase).toBe("generic");
    expect(items[0].scope).toBe("universal");
  });

  it("detects Western universal compatibility declarations (All Avatars / Universal)", () => {
    const items = extractAvatarCompatibility(
      "Universal Fit Sunglasses [All Avatars]",
      "Compatible with all avatars. Easy setup with Modular Avatar.",
      ["glasses", "universal"],
      "item-sunglasses"
    );

    expect(items.length).toBe(1);
    const universal = items[0];
    expect(universal.targetAvatarBase).toBe("generic");
    expect(universal.scope).toBe("universal");
    expect(AvatarCompatibilitySchema.parse(universal)).toBeDefined();
  });

  it("differentiates creator_declared from keyword_inferred", () => {
    // Only mentioned casually in description body without compatibility context
    const inferred = extractAvatarCompatibility(
      "Generic Party Prop",
      "I tested taking photos next to Rindo at a club.",
      [],
      "item-prop"
    );

    expect(inferred.length).toBe(1);
    expect(inferred[0].targetAvatarBase).toBe("rindo");
    expect(inferred[0].confidence).toBe("keyword_inferred");
    expect(inferred[0].evidenceSource).toBe("description");
  });

  it("deduplicates multiple mentions of the same avatar into a single record with highest confidence", () => {
    const items = extractAvatarCompatibility(
      "【Kikyo対応】Summer Sandals",
      "Kikyo (桔梗) avatar compatible sandals. Easy install on Kikyo base.",
      ["kikyo", "桔梗"],
      "item-sandals"
    );

    expect(items.length).toBe(1);
    expect(items[0].targetAvatarBase).toBe("kikyo");
    expect(items[0].confidence).toBe("creator_declared");
  });

  it("returns empty array for non-avatar software items", () => {
    const items = extractAvatarCompatibility(
      "VRCFaceTracking",
      "VRChat OSC tracking bridge for facial hardware",
      ["vrchat", "osc"],
      "tool-vcft"
    );

    expect(items).toEqual([]);
  });
});

describe("deriveCategoryFromTags (TAXONOMY-01)", () => {
  it("returns defaultCategory when platformTags is undefined", () => {
    expect(deriveCategoryFromTags(undefined, "vpm_package")).toBe("vpm_package");
  });

  it("returns defaultCategory when platformTags is empty", () => {
    expect(deriveCategoryFromTags([], "vpm_package")).toBe("vpm_package");
  });

  it("maps 'avatar' tag to avatar_tool", () => {
    expect(deriveCategoryFromTags(["avatar"], "vpm_package")).toBe("avatar_tool");
  });

  it("maps 'avatar_tool' exact tag to avatar_tool", () => {
    expect(deriveCategoryFromTags(["avatar_tool", "vpm"], "vpm_package")).toBe("avatar_tool");
  });

  it("maps 'avatar-tool' hyphenated tag to avatar_tool", () => {
    expect(deriveCategoryFromTags(["vpm", "avatar-tool"], "vpm_package")).toBe("avatar_tool");
  });

  it("maps 'shader' tag to shader", () => {
    expect(deriveCategoryFromTags(["shader", "lilToon"], "vpm_package")).toBe("shader");
  });

  it("maps 'world' tag to world_tool", () => {
    expect(deriveCategoryFromTags(["world", "gimmick"], "vpm_package")).toBe("world_tool");
  });

  it("maps 'world_creation' exact tag to world_tool", () => {
    expect(deriveCategoryFromTags(["world_creation"], "vpm_package")).toBe("world_tool");
  });

  it("maps 'animation' tag to animation_tool", () => {
    expect(deriveCategoryFromTags(["animation"], "vpm_package")).toBe("animation_tool");
  });

  it("maps 'physics' tag to physics_tool", () => {
    expect(deriveCategoryFromTags(["physics"], "vpm_package")).toBe("physics_tool");
  });

  it("maps 'physbone' tag to physics_tool", () => {
    expect(deriveCategoryFromTags(["physbone", "avatar"], "vpm_package")).toBe("physics_tool");
  });

  it("clothing tag is conservative — returns defaultCategory", () => {
    expect(deriveCategoryFromTags(["clothing", "outfit"], "vpm_package")).toBe("vpm_package");
  });

  it("outfit tag is conservative — returns defaultCategory", () => {
    expect(deriveCategoryFromTags(["outfit"], "vpm_package")).toBe("vpm_package");
  });

  it("cosmetic tag is conservative — returns defaultCategory", () => {
    expect(deriveCategoryFromTags(["cosmetic"], "vpm_package")).toBe("vpm_package");
  });

  it("unknown tags fall back to defaultCategory", () => {
    // Tags that contain none of the vocabulary substrings
    expect(deriveCategoryFromTags(["vpm", "sdk", "utility", "modular"], "vpm_package")).toBe("vpm_package");
  });

  it("normalises NFKC and case before matching", () => {
    // Full-width uppercase AVATAR should normalise to match
    expect(deriveCategoryFromTags(["\uFF21\uFF36\uFF41\uFF54\uFF41\uFF52"], "vpm_package")).toBe("avatar_tool");
  });

  it("first matching tag wins (avatar before shader in list)", () => {
    expect(deriveCategoryFromTags(["avatar", "shader"], "vpm_package")).toBe("avatar_tool");
  });
});
