import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import { ToolClassifier } from "./classifier.ts";

const DB_PATH = path.resolve(import.meta.dir, "../crawler_state.db");
const VPM_CATALOG_PATH = "G:\\.shortcut-targets-by-id\\1KzQrYkpxXhOtOkGJQIWYD76vThVypZOR\\Heavy Pilots\\Project Documentation\\Resource Library\\VPM Catalog Categorized.md";
const OUTPUT_PATH = "G:\\.shortcut-targets-by-id\\1KzQrYkpxXhOtOkGJQIWYD76vThVypZOR\\Heavy Pilots\\Project Documentation\\Resource Library\\Uncataloged VRChat Tools & Packages.md";

interface EntityRow {
  id: string;
  platform: string;
  url: string;
  title: string;
  author: string;
  price_currency?: string;
  price_amount?: number;
  description: string;
  tags_json: string;
  external_links_json: string;
  raw_json: string;
}

function cleanSteText(text: string): string {
  if (!text) return "Community tool for VRChat creators.";
  let clean = text
    .replace(/[\r\n]+/g, " ")
    .replace(/[—–―\u2013\u2014\u2015]/g, " - ")
    .replace(/;/g, ".")
    .replace(/\bseamless(ly)?\b/gi, "direct")
    .replace(/\brobust\b/gi, "reliable")
    .replace(/\bpowerful\b/gi, "capable")
    .replace(/\beffortless(ly)?\b/gi, "simple")
    .replace(/\bblazing\b/gi, "fast")
    .replace(/\butilize(d|s|ing)?\b/gi, "use")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\bdon't\b/gi, "do not")
    .replace(/\bdoesn't\b/gi, "does not")
    .replace(/\bcan't\b/gi, "cannot")
    .replace(/\bwon't\b/gi, "will not")
    .replace(/\bit's\b/gi, "it is")
    .replace(/\bthere's\b/gi, "there is")
    .replace(/\bprovides?\b/gi, "offers")
    .trim();

  // Keep to first sentence with <= 18 words
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  const words = firstSentence.split(/\s+/);
  if (words.length > 18) {
    return words.slice(0, 18).join(" ") + ".";
  }
  return firstSentence.endsWith(".") ? firstSentence : firstSentence + ".";
}

export function generateUncatalogedCatalog(): { total: number; outputPath: string } {
  console.log("Reading existing official VPM Catalog IDs...");
  const existingVpmIds = new Set<string>();
  if (fs.existsSync(VPM_CATALOG_PATH)) {
    const vpmText = fs.readFileSync(VPM_CATALOG_PATH, "utf-8");
    const idMatches = vpmText.match(/- \*\*ID\*\*: `([^`]+)`/g) || [];
    for (const m of idMatches) {
      const id = m.replace("- **ID**: `", "").replace("`", "").trim().toLowerCase();
      existingVpmIds.add(id);
    }
  }
  console.log(`Loaded ${existingVpmIds.size} existing official VPM package IDs to filter out.`);

  const db = new Database(DB_PATH, { readonly: true });
  const rows = db.query(`
    SELECT id, platform, url, title, author, price_currency, price_amount, description, tags_json, external_links_json, raw_json
    FROM entities
    ORDER BY title ASC
  `).all() as EntityRow[];
  db.close();

  console.log(`Fetched ${rows.length} total vetted entities from database.`);

  const uncataloged: EntityRow[] = [];
  for (const r of rows) {
    const cleanId = r.id.replace(/^[a-z]+:/, "").toLowerCase();
    if (existingVpmIds.has(cleanId)) continue;
    if (r.url.includes("vpm-catalog.vercel.app")) continue;
    uncataloged.push(r);
  }

  console.log(`Found ${uncataloged.length} uncataloged tools after filtering official catalog entries.`);

  type ItemGroup = Record<string, Record<string, Record<string, Record<string, EntityRow[]>>>>;
  const groups: ItemGroup = {};
  const authorsSet = new Set<string>();

  for (const r of uncataloged) {
    let tags: string[] = [];
    try {
      tags = JSON.parse(r.tags_json || "[]");
    } catch (_) {}

    const res = ToolClassifier.classify(r.title, r.description, tags);
    const cat = res.category;
    const type = res.type;
    const sub = res.subcategory;
    const author = (r.author || "Community Creator").trim();
    authorsSet.add(author);

    if (!groups[cat]) groups[cat] = {};
    if (!groups[cat][type]) groups[cat][type] = {};
    if (!groups[cat][type][sub]) groups[cat][type][sub] = {};
    if (!groups[cat][type][sub][author]) groups[cat][type][sub][author] = [];

    groups[cat][type][sub][author].push(r);
  }

  let md = "";
  md += "---\n";
  md += "tags:\n";
  md += "  - resource\n";
  md += "---\n\n";
  md += "## Uncataloged VRChat Packages and Tools\n\n";
  md += "This document catalogs community VRChat packages and systems.\n";
  md += "These packages do not appear in the official VPM Catalog.\n";
  md += "Sources include community repositories, BOOTH, GitHub, Gumroad, Jinxxy, and Itch.io.\n\n";
  md += `Total Packages Found: ${uncataloged.length}\n\n`;
  md += `Total Unique Packages: ${uncataloged.length}\n\n`;
  md += `Total Unique Authors: ${authorsSet.size}\n\n`;

  md += "## Table of Contents\n\n";

  const catOrder = ["Avatars", "World Creation", "Shaders & Visuals", "Tools & Utilities"];
  for (const cat of catOrder) {
    if (!groups[cat]) continue;
    let catTotal = 0;
    for (const t of Object.keys(groups[cat])) {
      for (const s of Object.keys(groups[cat][t])) {
        for (const a of Object.keys(groups[cat][t][s])) {
          catTotal += groups[cat][t][s][a].length;
        }
      }
    }

    md += `- [[#${cat} (${catTotal})|${cat} (${catTotal})]]\n`;
    for (const type of ["QoL, Workflow & Toolchain", "Asset Additive"]) {
      if (!groups[cat][type]) continue;
      const typeLabel = type === "Asset Additive" ? "Asset Additives" : "QoL, Workflow & Toolchains";
      md += `  - *${typeLabel}*:\n`;
      const sortedSubs = Object.keys(groups[cat][type]).sort();
      for (const sub of sortedSubs) {
        let subTotal = 0;
        for (const a of Object.keys(groups[cat][type][sub])) {
          subTotal += groups[cat][type][sub][a].length;
        }
        const headingAnchor = `${cat} : ${sub} (${subTotal})`;
        md += `    - [[#${headingAnchor}|${sub} (${subTotal})]]\n`;
      }
    }
  }

  md += "\n";

  for (const cat of catOrder) {
    if (!groups[cat]) continue;
    let catTotal = 0;
    for (const t of Object.keys(groups[cat])) {
      for (const s of Object.keys(groups[cat][t])) {
        for (const a of Object.keys(groups[cat][t][s])) {
          catTotal += groups[cat][t][s][a].length;
        }
      }
    }

    md += `## ${cat} (${catTotal})\n\n`;

    for (const type of ["QoL, Workflow & Toolchain", "Asset Additive"]) {
      if (!groups[cat][type]) continue;
      const sortedSubs = Object.keys(groups[cat][type]).sort();

      for (const sub of sortedSubs) {
        let subTotal = 0;
        for (const a of Object.keys(groups[cat][type][sub])) {
          subTotal += groups[cat][type][sub][a].length;
        }

        md += `### ${cat} : ${sub} (${subTotal})\n\n`;

        const sortedAuthors = Object.keys(groups[cat][type][sub]).sort((a, b) =>
          a.toLowerCase().localeCompare(b.toLowerCase())
        );

        for (const author of sortedAuthors) {
          const items = groups[cat][type][sub][author];
          const cleanAuthor = cleanSteText(author).replace(/\.$/, "") || "Creator";
          md += `#### ${cleanAuthor} (${items.length})\n\n`;

          for (const it of items) {
            const rawTitle = (it.title || "Community Tool").replace(/[\r\n]+/g, " ").replace(/[—–―\u2013\u2014\u2015]/g, "-").trim();
            const cleanTitle = rawTitle.slice(0, 80);
            const platformName = it.platform.toUpperCase();
            const cleanDesc = cleanSteText(it.description || "Community tool for VRChat creators.");
            
            md += `##### [${cleanTitle}](${it.url})\n\n`;
            md += `- **ID**: \`${it.id.replace(/[—–―\u2013\u2014\u2015]/g, "-")}\`\n`;
            md += `- **Platform** (${platformName})\n`;
            md += `- **Type** (${type})\n`;
            md += `- **Subcategory** (${sub})\n`;
            md += `- **Description**: ${cleanDesc}\n\n`;
          }
        }
      }
    }
  }

  fs.writeFileSync(OUTPUT_PATH, md, "utf-8");
  console.log(`Successfully generated catalog with ${uncataloged.length} packages at:`);
  console.log(OUTPUT_PATH);

  return { total: uncataloged.length, outputPath: OUTPUT_PATH };
}

if (import.meta.main) {
  generateUncatalogedCatalog();
}
