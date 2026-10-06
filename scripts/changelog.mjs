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

/**
 * Extract the product notes from root CHANGELOG.md and write to docs/changelogs/<folder>/<channel>/<version>.md
 * (or docs/changelogs/<folder>/<version>.md for single-stream products like network).
 * Resets the extracted section in root CHANGELOG.md to "- none currently".
 */
export function extractProductChangelog(channel, product, version, workspace = root) {
  const folder = changelogFolders[product] ?? product;
  const changelogPath = resolve(workspace, "CHANGELOG.md");
  if (!existsSync(changelogPath)) return null;
  const markdown = readFileSync(changelogPath, "utf8");
  const lines = markdown.replace(/\r/g, "").split("\n");
  const heading = `## ${folder}`;
  const start = lines.findIndex(line => line === heading || line === `## ${product}`);
  if (start < 0) return null;
  let end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end).join("\n").trim();

  const targetDir = product === "network"
    ? resolve(workspace, "docs/changelogs", folder)
    : resolve(workspace, "docs/changelogs", folder, channel);
  mkdirSync(targetDir, { recursive: true });
  const targetFile = resolve(targetDir, `${version}.md`);

  const content = `# ${folder} ${version}\n\nChannel: ${channel}.\n\n${section || "- none currently"}\n`;
  writeFileSync(targetFile, content);

  // Reset the product section in CHANGELOG.md to "- none currently"
  const newLines = [
    ...lines.slice(0, start + 1),
    "",
    "- none currently",
    "",
    ...lines.slice(end)
  ];
  writeFileSync(changelogPath, newLines.join("\n"));
  return targetFile;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, channel, product, version] = process.argv.slice(2);
  try {
    if (action === "extract" && channel && product && version) {
      const file = extractProductChangelog(channel, product, version);
      console.log(JSON.stringify({ extracted: true, file }));
    } else {
      throw new Error("Usage: node scripts/changelog.mjs extract <channel> <product> <version>");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Changelog extraction failed");
    process.exitCode = 1;
  }
}
