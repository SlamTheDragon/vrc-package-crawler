import { Database } from "bun:sqlite";

console.log("\x1b[36m");
console.log("==================================================================");
console.log("   VRC PACKAGE CRAWLER — QUARANTINE VERIFICATION & SALVAGE PASS   ");
console.log("==================================================================");
console.log("\x1b[0m");

const db = new Database("crawler_state.db");
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA busy_timeout = 10000;");

// 1. Text normalizer: splits camelCase, underscores, hyphens, punctuation
function normalizeText(str: string): string {
  if (!str) return "";
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-./\\+~@#$%^&*()=[\]{}|;:'",<>?`!]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// 2. Known VRChat / VR Tool Authors and Organizations
// FIXME: needs more verification
const CREATOR_WHITELIST = new Set([
  "markcreator", "cyanlaser", "kurotu", "bd_", "bdunderscore", "anatawa12", "lil", "mag",
  "fooma", "dreadrith", "sacc", "vrcx", "eyetrackvr", "slimevr", "zentan", "kamishiro",
  "vrchat", "hai-vr", "vrcfury", "poiyomi", "synqark", "neitri", "raivovfx", "merlinvr",
  "reava", "orels1", "phasedragon", "vrc-get", "alcom", "sylantroh", "coooookies",
  "redhawk989", "ju1ce", "raphiiko", "misyaguziya", "vrcbilliards", "grim-es", "mega-gorilla",
  "cascadianvr", "bunnykyra", "amanoissui", "soltros", "sentfromspacevr", "tommaier123",
  "squiddingme", "zyoh", "deltaneverused", "slaynash", "skyeca", "uuunyaa", "powroupi",
  "regzo2", "euan142", "yum-food", "enitimeago", "i5ucc", "zenithval", "awakenginexe"
]);

// 3. High-signal VRChat tool patterns
// FIXME: needs dynamic verification
const TOOL_PATTERNS = [
  "vpm", "vrcfury", "modular avatar", "modularavatar", "ndmf", "udon", "udonsharp", "aao",
  "avatar optimizer", "avataroptimizer", "protv", "usharpvideo", "yamaplayer", "liltoon",
  "poiyomi", "unlitwf", "pcss", "gogoloco", "faceemo", "editor extension", "エディタ拡張",
  "ツール", "システム", "system", "systems", "ギミック", "gimmick", "gimmicks", "oscbattery",
  "vrc osc", "saccflight", "qvpen", "kisekae", "kisetter", "mochifitter", "もちふぃった",
  "armature", "physbone", "dynamicbone", "culling", "occlusion", "texture baker", "mesh combiner",
  "avatar compressor", "blender addon", "cats blender", "material combiner", "light limit changer",
  "shape maker", "pose system", "tracking system", "sleeping system", "locomotion", "pumkin",
  "cyanemu", "facetracking", "face tracking", "eyetrack", "eyetrackvr", "slimevr", "blendshape",
  "editor tool", "avatar tool", "world tool", "unity editor", "converter", "helper", "generator",
  "setup tool", "workflow", "shader", "shaders", "シェーダー", "osc", "skinedit", "ssrt",
  "virtuallens", "ragdoll", "polytool", "suiminsystem", "ovr", "steamvr", "openvr", "vrcx",
  "adjuster", "addon", "add on", "tool", "tools", "アドオン", "プラグイン", "エディタ",
  "ボーン", "ウェイト", "改変", "cyantrigger", "oyasumi", "oyasumivr", "oscmooth", "lazyoptimiser",
  "tastt", "make it mmd", "parametersavestates", "osclock", "udonite", "vrct", "vrcbce",
  "vibecheck", "vxmusic", "button", "buttons", "clock", "clocks", "camera", "cameras",
  "videoplayer", "video player", "flight", "flashlight", "light", "shadow", "mirror",
  "seat", "chair", "pen", "pickup", "portal gun", "raygun", "toy", "toys", "billiards",
  "audio manager", "toggle", "toggles", "menu generator", "fitter", "bone setup",
  "weight transfer", "mesh cutter", "decals", "audiolink", "audio link", "haptic", "pov",
  "keyboard", "clipping fix", "parameter increaser", "afk", "substance painter", "collider dash",
  "mmd tools", "decompiler", "disassembler", "vrcsdk", "sightstepsdk", "vrcontent", "ton roundcounter",
  "bounding box", "follower", "dancer"
];

// 4. Cosmetic exclusions (pure non-tool assets)
const COSMETIC_EXCLUSIONS = [
  /\boutfit(?:s)?\b/i,
  /\bcostume(?:s)?\b/i,
  /\bjacket(?:s)?\b/i,
  /\bhoodie(?:s)?\b/i,
  /\bcardigan(?:s)?\b/i,
  /\b(?<!un)dress(?:es)?\b/i,
  /\bskirt(?:s)?\b/i,
  /\bpants\b/i,
  /\bshorts\b/i,
  /\bunderwear\b/i,
  /\blingerie\b/i,
  /\bbikini\b/i,
  /\bswimsuit\b/i,
  /\bboots\b/i,
  /\bsneakers\b/i,
  /\bshoes\b/i,
  /\bheels\b/i,
  /\bhair\s+(?:style|pack|texture|bundle)\b/i,
  /\bponytail\b/i,
  /\btwintails?\b/i,
  /\bbangs\b/i,
  /\btattoo(?:s)?\b/i,
  /\bmakeup\b/i,
  /\b(?:skin|eye|face)\s+texture\b/i,
  /\bearrings?\b/i,
  /\bnecklace(?:s)?\b/i,
  /\bchoker(?:s)?\b/i,
  /\bbracelets?\b/i,
  /\bpiercings?\b/i,
  /\bavatar\s+base\b/i,
  /\boriginal\s+3d\s+avatar\b/i,
  /\b3d\s+avatar\b/i
];

// 5. Generic software exclusions on GitHub
// FIXME: needs to be dynamically expanded
const GENERIC_SOFTWARE_EXCLUSIONS = [
  "docker", "kubernetes", "linux kernel", "android app", "react native",
  "next.js", "spring boot", "django", "machine learning tutorial",
  "interview preparation", "curated list of awesome", "cli tool for linux",
  "macos app", "gnome", "wayland", "awesome-", "-awesome", "copybara",
  "riak core", "glslang", "fast float", "dtoa benchmark", "ordered map",
  "apkdiffpatch", "hpatchlite", "xdelta", "base64", "pre commit",
  "github changelog generator", "opencl bindings"
];

const quarantined = db.query("SELECT id, platform, url, title, author, reasons_json, quarantined_at FROM quarantined_entities").all() as any[];
console.log(`Auditing ${quarantined.length} quarantined entities...`);

let salvagedCount = 0;
let discardedCount = 0;
const salvagedByPlatform: Record<string, number> = { booth: 0, github: 0, gumroad: 0, jinxxy: 0, itch: 0 };
const discardedByPlatform: Record<string, number> = { booth: 0, github: 0, gumroad: 0, jinxxy: 0, itch: 0 };

const insertEntity = db.prepare(`
  INSERT OR REPLACE INTO entities (
    id, platform, url, title, author, price_currency, price_amount,
    description, tags_json, external_links_json, raw_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`);

const deleteQuarantine = db.prepare("DELETE FROM quarantined_entities WHERE id = ?;");
const updateQuarantineReason = db.prepare("UPDATE quarantined_entities SET reasons_json = ? WHERE id = ?;");

const now = new Date().toISOString();

db.transaction(() => {
  for (const item of quarantined) {
    const normTitle = normalizeText(item.title);
    const normId = normalizeText(item.id);
    const normAuthor = normalizeText(item.author);
    const combined = `${normId} ${normTitle} ${normAuthor}`;

    // A. Check Whitelist
    const isWhitelisted = CREATOR_WHITELIST.has(item.author.toLowerCase()) ||
                          CREATOR_WHITELIST.has(normAuthor);

    // B. Check Generic Software
    if (item.platform === "github") {
      const isGeneric = GENERIC_SOFTWARE_EXCLUSIONS.some(term => combined.includes(term));
      if (isGeneric) {
        discardedCount++;
        discardedByPlatform.github = (discardedByPlatform.github || 0) + 1;
        updateQuarantineReason.run(JSON.stringify(["VERIFIED_DISCARD: Generic Non-VR Software"]), item.id);
        continue;
      }
    }

    // C. Check Cosmetic Exclusions
    const isCosmetic = COSMETIC_EXCLUSIONS.some(re => re.test(item.title));
    const isToolForAsset = ["tool", "tools", "fitter", "generator", "baker", "system", "script", "setup", "gimmick", "ツール", "システム", "拡張", "ma", "ndmf", "もちふぃった"].some(t => combined.includes(t));

    if (isCosmetic && !isToolForAsset) {
      discardedCount++;
      discardedByPlatform[item.platform] = (discardedByPlatform[item.platform] || 0) + 1;
      updateQuarantineReason.run(JSON.stringify(["VERIFIED_DISCARD: Pure Cosmetic Asset (Clothing/Hair/Tattoo/Base Avatar)"]), item.id);
      continue;
    }

    // D. Ecosystem Context & Tool Pattern Matching
    const hasVrcContext = [
      "vrchat", "vrc", "vpm", "unity", "udon", "avatar", "world", "shader", "osc",
      "physbone", "blendshape", "animator", "prefab", "gimmick", "ギミック"
    ].some(t => combined.includes(t)) || item.platform === "booth"; // BOOTH items are sourced from 3D Tools Category 208

    const matchedTools = TOOL_PATTERNS.filter(t => combined.includes(t));

    if ((hasVrcContext && matchedTools.length > 0) || isWhitelisted) {
      // SALVAGE: Reinstate into pristine entities table
      salvagedCount++;
      salvagedByPlatform[item.platform] = (salvagedByPlatform[item.platform] || 0) + 1;

      const currency = item.platform === "booth" ? "JPY" : "USD";
      const tags = JSON.stringify(matchedTools.slice(0, 5));

      insertEntity.run(
        item.id,
        item.platform,
        item.url,
        item.title || "Untitled Tool",
        item.author || "Unknown",
        currency,
        0, // default price amount
        item.title, // description fallback
        tags,
        "[]",
        JSON.stringify({ salvaged_from_quarantine: true, matched_tools: matchedTools }),
        item.quarantined_at || now,
        now
      );

      deleteQuarantine.run(item.id);
    } else {
      // CONFIRMED DISCARD
      discardedCount++;
      discardedByPlatform[item.platform] = (discardedByPlatform[item.platform] || 0) + 1;
      updateQuarantineReason.run(JSON.stringify(["VERIFIED_DISCARD: Insufficient Toolchain Signals"]), item.id);
    }
  }
})();

console.log("\n==================================================================");
console.log("             QUARANTINE AUDIT & SALVAGE COMPLETE                  ");
console.log("==================================================================");
console.log(`Total Audited:                      ${quarantined.length}`);
console.log(`  + Salvaged & Reinstated Tools:    ${salvagedCount}`);
console.log(`  - Confirmed Quarantined Discards: ${discardedCount}`);

console.log("\nPlatform Breakdown (Salvaged vs Confirmed Discarded):");
for (const p of Object.keys(salvagedByPlatform)) {
  const s = salvagedByPlatform[p] || 0;
  const d = discardedByPlatform[p] || 0;
  const tot = s + d;
  const pct = tot > 0 ? ((s / tot) * 100).toFixed(1) : "0.0";
  console.log(`  [${p.toUpperCase().padEnd(7)}] Salvaged: ${s.toString().padStart(5)} (${pct.padStart(5)}%) | Discarded: ${d.toString().padStart(5)}`);
}

// Checkpoint and verify integrity
db.run("PRAGMA wal_checkpoint(TRUNCATE);");
const totalEntities = (db.query("SELECT COUNT(*) as c FROM entities;").get() as any).c;
const remainingQuarantined = (db.query("SELECT COUNT(*) as c FROM quarantined_entities;").get() as any).c;

console.log("\nUpdated Database State:");
console.log(`  Pristine Entities in DB:    ${totalEntities}`);
console.log(`  Confirmed Quarantined:      ${remainingQuarantined}`);

db.close();
console.log("\nPhase 1: Quarantine Verification Pass completed successfully.\n");
