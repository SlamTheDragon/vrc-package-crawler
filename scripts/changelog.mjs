import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export const changelogFolders = {
  crawler: "vrcp-crawler-node",
  "crawler-client": "vrcp-crawler-client",
  package: "vrcp-packages-api",
  network: "vrcp-packages-network",
  worker: "vrcp-worker",
  web: "vrcp-web",
};

export const changelogIdentifiers = {
  release: {
    crawler: "vrcp-crawler-node",
    "crawler-client": "vrcp-crawler-client",
    package: "vrcp-packages-api",
    network: "vrcp-packages-network",
    worker: "vrcp-worker",
    web: "vrcp-web",
  },
  preview: {
    crawler: "vrcp-crawler-node-preview",
    "crawler-client": "vrcp-crawler-client-preview",
    package: "vrcp-packages-api-preview",
    network: "vrcp-packages-network",
    worker: "vrcp-worker-preview",
    web: "vrcp-web-preview-preview",
  },
};

/**
 * Find the start and end of a product's changelog section in CHANGELOG.md
 * using strictly typed channel and product identifiers.
 */
export function findProductChangelogSection(markdown, channel, product) {
  const identifier = changelogIdentifiers[channel]?.[product];
  if (!identifier) return null;
  const folder = changelogFolders[product] ?? product;
  const lines = markdown.replace(/\r/g, "").split("\n");
  const targetTag = `\`${identifier}\``;

  const start = lines.findIndex(l => l.startsWith("## ") && (l.includes(targetTag) || l === `## ${identifier}`));
  if (start < 0) return null;

  let end = lines.findIndex((l, i) => i > start && (l.startsWith("## ") || l.startsWith("# ") || l === "---"));
  if (end < 0) end = lines.length;

  const section = lines.slice(start + 1, end).join("\n").trim();
  return { start, end, heading: lines[start], folder, identifier, section: section || "- none currently" };
}

/**
 * Extract the product notes from root CHANGELOG.md and write to docs/changelogs/<folder>/<channel>/<version>.md
 * (or docs/changelogs/<folder>/<version>.md for single-stream products like network).
 */
export function extractProductChangelog(channel, product, version, workspace = root) {
  const folder = changelogFolders[product] ?? product;
  const changelogPath = resolve(workspace, "CHANGELOG.md");
  if (!existsSync(changelogPath)) return null;
  const markdown = readFileSync(changelogPath, "utf8");
  const found = findProductChangelogSection(markdown, channel, product);
  if (!found) return null;

  const targetDir = product === "network"
    ? resolve(workspace, "docs/changelogs", folder)
    : resolve(workspace, "docs/changelogs", folder, channel);
  mkdirSync(targetDir, { recursive: true });
  const targetFile = resolve(targetDir, `${version}.md`);

  const content = `# ${folder} ${version}\n\nChannel: ${channel}.\n\n${found.section}\n`;
  writeFileSync(targetFile, content);

  return { file: targetFile, section: found.section };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, channel, product, version] = process.argv.slice(2);
  try {
    if (action === "extract" && channel && product && version) {
      const result = extractProductChangelog(channel, product, version);
      console.log(JSON.stringify({ extracted: true, file: result?.file }));
    } else {
      throw new Error("Usage: node scripts/changelog.mjs extract <channel> <product> <version>");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Changelog extraction failed");
    process.exitCode = 1;
  }
}
