import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dir, "../..");
const ignored = new Set([".git", "node_modules", "dist", "bin", ".bun-cache"]);
const docCategories = new Set(["scratch", "decisions", "research", "source", "changelogs"]);
const rootMarkdown = new Set(["AGENTS.md", "DELEGATES.md", "TODO.md", "LEGAL.md", "README.md", "LICENSE.md", "CONTRIBUTING.md"]);
// Owner-approved editor metadata is exempt only while Git ignores this exact path.
const editorMetadata = join(root, "docs", ".obsidian");
const ignoredEditorMetadata = spawnSync("git", ["check-ignore", "--quiet", "--", "docs/.obsidian"], { cwd: root }).status === 0;
const files: string[] = [];

function visit(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const target = join(dir, entry.name);
    if (entry.isDirectory() && target === editorMetadata && ignoredEditorMetadata) continue;
    if (entry.isDirectory()) visit(target);
    else if (entry.name.endsWith(".md")) files.push(target);
  }
}

visit(root);
const broken: string[] = [];
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".md") && !rootMarkdown.has(entry.name)) {
    broken.push(`Unexpected root document: ${entry.name}`);
  }
}
for (const entry of readdirSync(join(root, "docs"), { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name === ".obsidian" && ignoredEditorMetadata) continue;
  if (!entry.isDirectory() || !docCategories.has(entry.name)) {
    broken.push(`Unexpected docs/ entry: ${entry.name}`);
  }
}
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?<![!\\])\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const raw = match[1]!.replace(/^<|>$/g, "").split("#", 1)[0]!;
    if (!raw || /^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith("//")) continue;
    const target = resolve(dirname(file), decodeURIComponent(raw));
    if (!existsSync(target)) broken.push(`${file.slice(root.length + 1)} -> ${raw}`);
  }
}

if (broken.length) {
  console.error(`Broken local Markdown links (${broken.length}):\n${broken.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Checked local Markdown links in ${files.length} documents.`);
}
