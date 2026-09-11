import { Database } from "bun:sqlite";
import { ToolClassifier } from "./classifier.ts";

console.log("\x1b[36m");
console.log("==================================================================");
console.log("   VRC PACKAGE CRAWLER — SECONDARY CLEAN PASS & NORMALIZATION    ");
console.log("==================================================================");
console.log("\x1b[0m");

const db = new Database("crawler_state.db");
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA busy_timeout = 10000;");

function unescapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

// Marketing and promotional prefix/suffix brackets to strip from display titles
const MARKETING_BRACKETS = [
  /^[【\[(]?(?:VRC(?:hat)?|Unity|3Dモデル|3D衣装|VRC想定|3Dシステム|3Dアバター|VRC向け)[】\])]\s*/gi,
  /[【\[(]?(?:VRC(?:hat)?|Unity|3Dモデル|3D衣装|VRC想定|3Dシステム|3Dアバター|VRC向け)[】\])]$/gi,
  /^[【\[(]?(?:無料|FREE|Free|Sale|セール|VerUP|早急用|簡単導入|全アバター対応|汎用|MA対応|Modular Avatar対応|VRCFury対応|非公式)[】\])]\s*/gi,
  /[【\[(]?(?:無料|FREE|Free|Sale|セール|VerUP|早急用|簡単導入|全アバター対応|汎用|MA対応|Modular Avatar対応|VRCFury対応|非公式)[】\])]$/gi,
  /\s*[【\[(](?:VRC(?:hat)?|Unity|3Dモデル|3D衣装|無料|FREE|Free|Sale|セール|VerUP|早急用)[】\])]/gi
];

function cleanTitle(rawTitle: string): string {
  let title = unescapeHtml(rawTitle || "Untitled");

  // Iteratively strip promotional bracket wrappers
  for (let i = 0; i < 3; i++) {
    for (const pat of MARKETING_BRACKETS) {
      title = title.replace(pat, " ");
    }
  }

  // Clean trailing version numbers from title if excessive (e.g. "Tool Name v1.2.0")
  title = title.replace(/\s+v?[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\s*beta|\s*alpha)?$/i, "");

  // Normalize whitespace
  title = title.replace(/\s+/g, " ").trim();

  // If cleaning resulted in an empty title, fallback to original unescaped
  return title.length > 0 ? title : unescapeHtml(rawTitle);
}

function cleanAuthor(rawAuthor: string): string {
  let author = unescapeHtml(rawAuthor || "Unknown");
  // Remove trailing shop / store noise
  author = author.replace(/[@#].*$/, "");
  author = author.replace(/\s+/g, " ").trim();
  return author.length > 0 ? author : "Unknown";
}

function cleanDescription(rawDesc: string): string {
  let desc = unescapeHtml(rawDesc || "");
  // Remove markdown images [![...](...)]
  desc = desc.replace(/!\[.*?\]\(.*?\)/g, "");
  // Remove discord join spam or excessive repeated links
  desc = desc.replace(/(?:https?:\/\/discord\.gg\/\S+)/gi, "");
  // Normalize whitespace
  desc = desc.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return desc;
}

const allEntities = db.query(`
  SELECT id, platform, url, title, author, price_currency, price_amount,
         description, tags_json, external_links_json, raw_json, created_at, updated_at
  FROM entities
`).all() as any[];

console.log(`Auditing and normalizing ${allEntities.length} active entities...`);

const updateEntity = db.prepare(`
  UPDATE entities
  SET title = ?, author = ?, description = ?, tags_json = ?, updated_at = ?
  WHERE id = ?;
`);

let normalizedTitlesCount = 0;
let normalizedAuthorsCount = 0;
let normalizedDescsCount = 0;
const categoryCounts: Record<string, number> = {};

const now = new Date().toISOString();

db.transaction(() => {
  for (const e of allEntities) {
    const cleanedT = cleanTitle(e.title);
    const cleanedA = cleanAuthor(e.author);
    const cleanedD = cleanDescription(e.description);

    if (cleanedT !== e.title) normalizedTitlesCount++;
    if (cleanedA !== e.author) normalizedAuthorsCount++;
    if (cleanedD !== e.description) normalizedDescsCount++;

    // Parse tags and enrich with extracted keywords
    let tags: string[] = [];
    try {
      tags = JSON.parse(e.tags_json || "[]");
    } catch {
      tags = [];
    }

    // Preserve tags discovered during cleaning
    if (e.title.includes("MA") && !tags.includes("Modular Avatar")) tags.push("Modular Avatar");
    if (e.title.includes("VRCFury") && !tags.includes("VRCFury")) tags.push("VRCFury");
    if (e.title.includes("NDMF") && !tags.includes("NDMF")) tags.push("NDMF");
    if ((e.title.includes("無料") || e.title.includes("FREE")) && !tags.includes("Free")) tags.push("Free");

    // Classify
    const classification = ToolClassifier.classify(cleanedT, cleanedD, tags);
    categoryCounts[classification.category] = (categoryCounts[classification.category] || 0) + 1;

    updateEntity.run(
      cleanedT,
      cleanedA,
      cleanedD,
      JSON.stringify(tags),
      now,
      e.id
    );
  }
})();

console.log("\n==================================================================");
console.log("                CLEAN PASS COMPLETE SUMMARY                       ");
console.log("==================================================================");
console.log(`Total Entities Processed:        ${allEntities.length}`);
console.log(`  Titles Normalized / Cleaned:   ${normalizedTitlesCount}`);
console.log(`  Authors Normalized:            ${normalizedAuthorsCount}`);
console.log(`  Descriptions Cleaned:          ${normalizedDescsCount}`);

console.log("\nCategory Distribution Across Pristine Entities:");
for (const [cat, count] of Object.entries(categoryCounts)) {
  const pct = ((count / allEntities.length) * 100).toFixed(1);
  console.log(`  [${cat.padEnd(20)}] ${count.toString().padStart(5)} (${pct.padStart(5)}%)`);
}

db.run("PRAGMA wal_checkpoint(TRUNCATE);");
db.close();
console.log("\nPhase 2: True Clean Pass completed successfully.\n");
