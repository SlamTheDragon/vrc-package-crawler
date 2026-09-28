import { describe, it, expect } from "bun:test";
import { cleanTitle, cleanAuthorName, cleanDescription, extractReadmeDescription, unescapeHtml, normalizeListingTitle } from "../src/utils/sanitizer.ts";

describe("Phase 1: Front-Stage Sanitization & Normalization", () => {
  it("unescapes HTML entities correctly", () => {
    expect(unescapeHtml("&amp; &lt; &gt; &quot; &#39; &#x2F;")).toBe("& < > \" ' /");
  });

  it("normalizes Japanese BOOTH decorative marketing brackets and CJK characters (Task 2.4 / Front Sanitation)", () => {
    const rawTitle = "【VRChat想定】［無料］Modular Avatar対応 ツール【MA対応】";
    const cleaned = cleanTitle(rawTitle);
    expect(cleaned).toContain("Modular Avatar対応 ツール");
    expect(cleaned).not.toContain("【VRChat想定】");
    expect(cleaned).not.toContain("［無料］");
    expect(cleaned).not.toContain("【MA対応】");
  });

  it("normalizes Western marketing brackets and version numbers", () => {
    const rawTitle = "[FREE] [VRChat] Advanced Locomotion System v2.1.0 beta";
    const cleaned = cleanTitle(rawTitle);
    expect(cleaned).toBe("Advanced Locomotion System");
  });

  it("cleans author names by stripping HTML tags, parentheticals, and twitter handles", () => {
    expect(cleanAuthorName("<b>CreatorName</b> (@TwitterHandle)")).toBe("CreatorName");
    expect(cleanAuthorName("Author &amp; Co.")).toBe("Author & Co.");
    expect(cleanAuthorName("")).toBe("Unknown");
  });

  it("normalizeListingTitle aligns with cleanTitle", () => {
    const title = "【無料】Shader Utility Tool (VRChat)";
    expect(normalizeListingTitle(title)).toBe(cleanTitle(title));
  });

  it("cleanDescription strips discord invites, image markdown, and normalizes spacing while preserving paragraphs", () => {
    const rawDesc = "A great VRChat utility!<br>Join our server: https://discord.gg/abc1234 &amp; enjoy!\n\n![Screenshot](https://example.com/pic.png)\n\nFeature list here.";
    const cleaned = cleanDescription(rawDesc);
    expect(cleaned).not.toContain("https://discord.gg/");
    expect(cleaned).not.toContain("![Screenshot]");
    expect(cleaned).toContain("& enjoy!");
    expect(cleaned).toContain("A great VRChat utility!");
    expect(cleaned).toContain("\n\nFeature list here.");
  });

  it("extractReadmeDescription strips badges, code blocks, and boilerplate while capturing rich overview and features", () => {
    const readme = `
# Awesome VRC Tool
[![Release](https://img.shields.io/github/v/release/foo/bar)](https://github.com/foo/bar)
[![Discord](https://img.shields.io/discord/123)](https://discord.gg/xyz)

Awesome VRC Tool is a non-destructive avatar optimization suite for Unity.
It automates bone merging, material combination, and texture atlas generation.

\`\`\`bash
git clone https://github.com/foo/bar.git
npm install
\`\`\`

## Features
* One-click optimizer
* Non-destructive workflow
* Multi-platform support

## License
MIT License. Copyright 2026.
    `;
    const synopsis = "Automated non-destructive avatar optimization suite.";
    const result = extractReadmeDescription(readme, synopsis);

    expect(result).toContain("Automated non-destructive avatar optimization suite.");
    expect(result).toContain("Awesome VRC Tool is a non-destructive avatar optimization suite for Unity.");
    expect(result).toContain("- One-click optimizer");
    expect(result).toContain("- Non-destructive workflow");
    expect(result).not.toContain("git clone");
    expect(result).not.toContain("img.shields.io");
    expect(result).not.toContain("MIT License");
    expect(result).not.toContain("https://discord.gg/");
  });
});
