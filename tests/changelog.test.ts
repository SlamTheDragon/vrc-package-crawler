import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { extractProductChangelog } from "../scripts/changelog.mjs";

test("extractProductChangelog copies product notes to dedicated markdown without modifying root CHANGELOG", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-changelog-test-"));
  try {
    const initialChangelog = `# Latest Changes

Here are the current changelogs of each product.

## vrcp-crawler-node

- Added high-performance stream logging.
- Fixed lease loss reconnection delay.

## vrcp-packages-api

- none currently
`;
    writeFileSync(join(dir, "CHANGELOG.md"), initialChangelog);

    const result = extractProductChangelog("release", "crawler", "0.0.9", dir);
    expect(result).toBeDefined();
    expect(result!.section).toContain("Added high-performance stream logging.");

    const perVersion = readFileSync(result!.file, "utf8");
    expect(perVersion).toContain("# vrcp-crawler-node 0.0.9");
    expect(perVersion).toContain("Channel: release.");
    expect(perVersion).toContain("Added high-performance stream logging.");
    expect(perVersion).toContain("Fixed lease loss reconnection delay.");

    const updatedRoot = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    expect(updatedRoot).toBe(initialChangelog);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("extractProductChangelog handles network single stream layout", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-changelog-test-"));
  try {
    const initialChangelog = `# Latest Changes

## vrcp-packages-network

- Sync network peer bounds.
`;
    writeFileSync(join(dir, "CHANGELOG.md"), initialChangelog);

    const result = extractProductChangelog("preview", "network", "2026.10.6", dir);
    expect(result).toBeDefined();
    expect(normalize(result!.file)).toContain(normalize("docs/changelogs/vrcp-packages-network/2026.10.6.md"));

    const perVersion = readFileSync(result!.file, "utf8");
    expect(perVersion).toContain("Sync network peer bounds.");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("extractProductChangelog distinguishes release and preview headings with backtick identifiers", () => {
  const dir = mkdtempSync(join(tmpdir(), "vrcp-changelog-test-"));
  try {
    const changelogWithSections = `# Changelog

# Applications - Release

## VRC Packages Crawler - \`vrcp-crawler-node\`

### Added

- Release crawler feature.

# Applications - Preview

## VRC Packages Crawler - \`vrcp-crawler-node-preview\`

### Added

- Preview crawler experiment.

---
`;
    writeFileSync(join(dir, "CHANGELOG.md"), changelogWithSections);

    const relResult = extractProductChangelog("release", "crawler", "0.0.9", dir);
    expect(relResult).toBeDefined();
    expect(relResult!.section).toContain("Release crawler feature.");
    expect(relResult!.section).not.toContain("Preview crawler experiment.");

    const prevResult = extractProductChangelog("preview", "crawler", "2026.10.8-pre", dir);
    expect(prevResult).toBeDefined();
    expect(prevResult!.section).toContain("Preview crawler experiment.");
    expect(prevResult!.section).not.toContain("Release crawler feature.");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

