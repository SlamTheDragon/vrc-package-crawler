export interface RelevanceResult {
  isRelevant: boolean;
  score: number;
  confidence: number;
  category: "toolchain" | "system" | "asset_pollution" | "generic_software";
  reasons: string[];
}

export interface MinimalEntity {
  id: string;
  platform: string;
  url: string;
  title: string;
  author?: string;
  description?: string;
  tags_json?: string;
  raw_json?: string;
}

// Core bootstrap creators for seeding initial portfolio crawlers (canonical GitHub handles)
export const TOP_VRCHAT_CREATORS = [
  "anatawa12", "bdunderscore", "hai-vr", "vrcfury", "poiyomi", "lilxyzw",
  "CyanLaser", "MerlinVR", "Dreadrith", "techan", "VRLabs", "pumkin", "d4rkc0d3r",
  "VRCFaceTracking", "Reimajo", "whiteflare", "CascadianVR", "RollTheRed", "kurotu",
  "JanSharp", "thryrallo", "JLChnToZ", "yueby", "Narazaka", "happyrobot33", "sonic853",
  "hoshinolabs", "furality", "sacc", "vrchat-community", "rurre", "RazgrizOne",
  "nadena", "baryon", "Varneon", "z3y", "REDSIM", "Reava", "orange3134", "Udonite",
  "lightbulb4", "RealWhyKnot", "you5248", "MagmaVRC", "AlanBacker", "ElMoha943",
  "mitsuya0077", "lumixmc401", "sizimityper", "rassi0429", "cympfh", "yuna0x0"
];

export const CREATOR_WHITELIST = new Set([
  ...TOP_VRCHAT_CREATORS.map((c) => c.toLowerCase()),
  "markcreator", "cyanlaser", "kurotu", "bd_", "bdunderscore", "anatawa12", "lil", "mag",
  "fooma", "dreadrith", "sacc", "vrcx", "eyetrackvr", "slimevr", "zentan", "kamishiro",
  "vrchat", "hai-vr", "vrcfury", "poiyomi", "synqark", "neitri", "raivovfx", "merlinvr",
  "reava", "orels1", "phasedragon", "vrc-get", "alcom", "sylantroh", "coooookies",
  "redhawk989", "ju1ce", "raphiiko", "misyaguziya", "vrcbilliards", "grim-es", "mega-gorilla",
  "cascadianvr", "bunnykyra", "amanoissui", "soltros", "sentfromspacevr", "tommaier123",
  "squiddingme", "zyoh", "deltaneverused", "slaynash", "skyeca", "uuunyaa", "powroupi",
  "regzo2", "euan142", "yum-food", "enitimeago", "i5ucc", "zenithval", "awakenginexe",
  "modular-avatar", "architechanon", "architechvr", "d4rkmini", "d4rkpl4y3r", "netnarazaka", "razgriz-one"
]);

// Canonical aliases for prominent creators / tooling where community references differ from current GitHub handles
export const CREATOR_ALIASES: Record<string, string> = {
  "modular-avatar": "bdunderscore",
  "architechanon": "techan",
  "architech-vr": "techan",
  "architechvr": "techan",
  "d4rkmini": "d4rkc0d3r",
  "d4rkpl4y3r": "d4rkc0d3r",
  "netnarazaka": "Narazaka",
  "razgriz-one": "RazgrizOne",
  "bd_": "bdunderscore"
};

// Multi-signal deterministic relevance gatekeeper combining heuristic scoring, token context, asset penalties, and binary release verification
export class RelevanceFilter {
  // 1. Blacklisted generic software repository owners (GitHub)
  private static BLACKLIST_OWNERS = new Set([
    "sindresorhus", "freecodecamp", "ebookfoundation", "kamranahmedse",
    "donnemartin", "public-apis", "awesome", "vinhnx", "practical-tutorials",
    "charlax", "danluu", "ashishb", "serhii-londar", "eugeneyan", "lissy93",
    "open-source-society", "karan", "munificent", "trekhleb", "yangshun",
    "jwasham", "ossu", "goldbergyoni", "ryanmcdermott", "torvalds"
  ]);

  // 2. Generic non-VR tech signals (instant rejection on GitHub if no VRC/Unity context)
  private static GENERIC_TECH_TERMS = [
    "docker", "kubernetes", "linux kernel", "android app", "react native",
    "next.js", "spring boot", "django", "machine learning tutorial",
    "interview preparation", "curated list of awesome", "cli tool for linux",
    "macos app", "gnome", "wayland", "audio player for terminal",
    "discord bot", "discord-bot", "bot for discord", "telegram bot",
    "slack bot", "twitch bot", "php form", "form mailer", "cryptocurrency"
  ];

  // 3. Pure cosmetic asset exclusion regexes (Clothing, Hair, Outfits, Tattoos, Pure Avatars, Props)
  private static ASSET_EXCLUSION_PATTERNS = [
    /\btattoo\s+(?:set|pack|bundle)\b/i,
    /\btattoos\b/i,
    /\bmakeup\b/i,
    /\b(?:eye|face|skin|body)\s+texture\b/i,
    /\boutfit(?:s)?\b/i,
    /\bcostume(?:s)?\b/i,
    /\bjacket(?:s)?\b/i,
    /\bhoodie(?:s)?\b/i,
    /\bcardigan(?:s)?\b/i,
    /\b(?<!un)dress(?:es)?\b/i, // matches dress/dresses but NOT undress or undressing
    /\bskirt(?:s)?\b/i,
    /\bpants\b/i,
    /\bshorts\b/i,
    /\bbriefs\b/i,
    /\bunderwear\b/i,
    /\blingerie\b/i,
    /\bbikini\b/i,
    /\bswimsuit\b/i,
    /\bfishnets?\b/i,
    /\bboots\b/i,
    /\bsneakers\b/i,
    /\bshoes\b/i,
    /\bsandals\b/i,
    /\bhigh\s+heels\b/i,
    /\bhair\s+(?:style|pack|texture|bundle)\b/i,
    /\bponytail(?:s)?\b/i,
    /\btwintails?\b/i,
    /\bbangs\b/i,
    /\bnecklace(?:s)?\b/i,
    /\bbracelets?\b/i,
    /\bearrings?\b/i,
    /\bpiercings?\b/i,
    /\bchoker(?:s)?\b/i,
    /\brosary\b/i,
    /\bring\s+bundle\b/i,
    /\bwallart\b/i,
    /\bfurniture\b/i,
    /\bcouch\b/i,
    /\bplush(?:ie)?\b/i,
    /\bplush\s+toy\b/i,
    /\bdevil\s+horn\s+cap\b/i,
    /\bwitch\s+hat\b/i,
    /\bglasses\s+\(3d\s+model\b/i,
    /\bglasses\s+commercial\b/i,
    /\bcute\s+bat\b/i,
    /\bhorn\s+bundle\b/i,
    /\btailcoat\b/i,
    /\bminigun\b/i,
    // Expanded Japanese & accessory cosmetic terms
    /\b(?:wings?|feather|羽|翼)\b/i,
    /\b(?:horns?|角)\b/i,
    /\b(?:ears?|耳|ねこみみ|うさみみ|ケモ耳)\b/i,
    /\b(?:tail|tails|しっぽ|尻尾)\b/i,
    /\b(?:crown|tiara|王冠|ティアラ)\b/i,
    /\b(?:glasses|megane|メガネ|眼鏡|サングラス)\b/i,
    /\b(?:hat|cap|beanie|帽子|キャップ|ハット|ベレー帽)\b/i,
    /\b(?:ring|rings|指輪|リング)\b/i,
    /\b(?:necklace|choker|ネックレス|チョーカー)\b/i,
    /\b(?:earrings?|ピアス|イヤリング)\b/i,
    /\b(?:costume|outfit|dress|skirt|pants|hoodie|jacket|衣装|服|ドレス|スカート|パンツ|パーカー|ジャケット|水着|下着)\b/i,
    /\b(?:hair|wig|髪|ヘア|ツインテール|ポニーテール|ボブ|ショートヘア|ロングヘア)\b/i,
    /\b(?:texture|skin|eye|face|テクスチャ|アイテクスチャ|スキン|メイク)\b/i
  ];

  // 4. Strong Tool & System Inclusion Signals (+4 to +6)
  private static STRONG_TOOL_TERMS = [
    "vpm", "vpm-package", "vpmdependencies", "vrcfury", "modular avatar", "modular-avatar",
    "ndmf", "udon", "udonsharp", "u#", "aao", "avatar optimizer", "avataroptimizer", "protv",
    "usharpvideo", "yamaplayer", "liltoon", "poiyomi", "unlitwf", "pcss", "gogoloco", "gogo loco",
    "faceemo", "unitypackage manager", "editor extension", "エディタ拡張", "ツール", "システム",
    "system", "systems", "ギミック", "gimmick", "gimmicks", "oscbattery", "vrc-osc", "saccflight",
    "qvpen", "kisekae", "kisetter", "mochifitter", "armature scale", "armature", "bone setup",
    "physbone", "dynamicbone", "culling", "occlusion", "texture baker", "mesh combiner",
    "avatar compressor", "blender-addon", "cats-blender", "material combiner", "light limit changer",
    "shape maker", "pose system", "tracking system", "sleeping system", "locomotion",
    "pumkin", "cyanemu", "facetracking", "face tracking", "eyetrack", "blendshape",
    "editor tool", "avatar tool", "world tool", "unity editor", "converter", "helper",
    "generator", "setup tool", "workflow", "shader", "shaders", "シェーダー", "osc",
    "skinedit", "ssrt", "virtuallens", "ragdoll", "polytool", "suiminsystem",
    "ovr", "steamvr", "openvr", "vrcx", "adjuster", "addon", "add-on", "tool", "tools",
    "integration", "integrations", "bridge", "bridges", "overlay", "overlays",
    "streamer", "streaming", "twitch", "widget", "widgets", "interactable", "controller",
    "controllers", "utility", "utilities",
    "アドオン", "プラグイン", "エディタ", "ボーン", "ウェイト", "改変",
    "アニメーション", "表情", "ポーズ", "追従", "カメラ", "メニュー", "ライト", "パーティクル",
    "時計", "ペン", "ミラー", "フライト", "マーカー", "設定", "補助", "導入", "プレハブ",
    "コライダー", "コンストレイント", "オーディオ", "揺れもの", "ワールド"
  ];


  // 5. Secondary VRChat Ecosystem Signals (+1 to +2)
  private static SECONDARY_VRC_TERMS = [
    "vrchat", "vrc", "unitypackage", "vcc", "av3", "avatars 3.0",
    "animator", "blendshape", "constraint", "menu generator", "toggle system",
    "camera tool", "prefab system", "interactive", "audiolink", "audio link",
    "unity", "prefab", "pb", "vrc向け", "vrc想定", "vrc用", "unity用",
    "アバター改変", "ワールド制作", "ギミック付き"
  ];

  private static hasTerm(target: string, term: string): boolean {
    const isAscii = /^[\x00-\x7F]+$/.test(term);
    if (isAscii && term.length <= 4) {
      if (term === "vrc") {
        return target.includes("vrc");
      }
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(target);
    }
    return target.includes(term);
  }

  // Evaluates an entity and returns whether it should be kept or quarantined
  static evaluate(e: MinimalEntity): RelevanceResult {
    const reasons: string[] = [];
    let score = 0;

    const titleLower = (e.title || "").toLowerCase();
    const rawDescLower = (e.description || "").toLowerCase();
    const descLower = rawDescLower.startsWith("vrchat tool repository by") ? "" : rawDescLower;
    const tagsLower = (e.tags_json || "").toLowerCase();
    const idLower = (e.id || "").toLowerCase();
    const authorLower = (e.author || "").toLowerCase();
    const rawLower = (e.raw_json || "").toLowerCase();
    const combinedText = `${idLower} ${authorLower} ${titleLower} ${descLower} ${tagsLower}`;

    // A. Check uncustomized sample templates and dummy test packages (reject immediately)
    if (
      titleLower === "0" ||
      idLower === "vpm:0" ||
      idLower.includes("listing-action-type-detection") ||
      idLower.includes("bug-report") ||
      titleLower.includes("listing action type detection") ||
      titleLower === "vrchat example package" ||
      titleLower === "example package 1" ||
      titleLower === "example package 2" ||
      titleLower === "example package 3" ||
      idLower.includes("demo-template") ||
      idLower.includes("example-listing") ||
      idLower.includes("upm-test") ||
      descLower.includes("simple package for testing automation") ||
      descLower.includes("this is an example package")
    ) {
      return {
        isRelevant: false,
        score: -10,
        confidence: 0.99,
        category: "generic_software",
        reasons: ["Uncustomized sample template / dummy test package"]
      };
    }

    // B. Check VPM manifests (always 100% verified toolchain packages)
    if (
      e.platform === "vpm" ||
      tagsLower.includes("vpm-package") ||
      rawLower.includes("vpmdependencies") ||
      descLower.includes("vpmdependencies")
    ) {
      return {
        isRelevant: true,
        score: 10,
        confidence: 0.99,
        category: "toolchain",
        reasons: ["Verified VPM manifest / vpmDependencies"]
      };
    }

    // Check Whitelist status early
    const ghOwner = e.platform === "github" ? e.id.replace(/^github:/, "").split("/")[0]?.toLowerCase() : "";
    const isWhitelistedAuthor =
      CREATOR_WHITELIST.has(authorLower) ||
      (ghOwner && CREATOR_WHITELIST.has(ghOwner));

    if (isWhitelistedAuthor) {
      score += 5;
      reasons.push(`Whitelisted prominent VRChat creator: ${e.author || ghOwner}`);
    }

    // Extract slug/repo name without author prefix to avoid author false positives
    const slug = e.id.includes("/") ? e.id.split("/").slice(1).join("/") : e.id.replace(/^[a-z]+:/, "");
    const nameToSearch = `${e.title} ${slug}`.toLowerCase();
    const repoText = `${nameToSearch} ${descLower} ${tagsLower}`;

    // C. Check GitHub Blacklisted Owners & generic software signals
    if (e.platform === "github") {
      const ownerMatch = e.id.match(/^github:([^/]+)/);
      const owner = ownerMatch ? ownerMatch[1].toLowerCase() : "";
      if (this.BLACKLIST_OWNERS.has(owner)) {
        return {
          isRelevant: false,
          score: -10,
          confidence: 0.98,
          category: "generic_software",
          reasons: [`Blacklisted owner: ${owner}`]
        };
      }

      // Reject curated awesome list repositories (collections of markdown links)
      if (
        titleLower.startsWith("awesome-") ||
        titleLower.endsWith("-awesome") ||
        titleLower === "awesome" ||
        idLower.includes("/awesome-")
      ) {
        return {
          isRelevant: false,
          score: -10,
          confidence: 0.99,
          category: "generic_software",
          reasons: ["Curated awesome list repository, not an installable package/tool"]
        };
      }

      // Detect skeleton / empty repos (0 README length and empty description/topics)
      let rawObj: any = {};
      try { rawObj = JSON.parse(e.raw_json || "{}"); } catch {}
      const readmeLen = rawObj.readmeLength !== undefined ? rawObj.readmeLength : 100;
      const hasRealDesc = descLower && !descLower.startsWith("vrchat tool repository by") && descLower !== titleLower;
      if (readmeLen === 0 && !hasRealDesc && (!tagsLower || tagsLower === "[]" || tagsLower === '["salvaged"]')) {
        return {
          isRelevant: false,
          score: -5,
          confidence: 0.95,
          category: "generic_software",
          reasons: ["Skeleton repository with 0 README, no description, and no topics"]
        };
      }

      // STRICT REQUIREMENT: Must have explicit VRChat or Unity ecosystem context on GitHub, or verified release assets
      const hasRelease = rawObj.hasReleaseAssets || tagsLower.includes("verified-release");
      const hasVrcContext = hasRelease || [
        "vrchat", "vrc", "vpm", "udon", "unity", "avatar", "shader", "modular avatar",
        "modular-avatar", "vrcfury", "ndmf", "physbone", "dynamicbone", "liltoon",
        "poiyomi", "unlitwf", "gogoloco", "faceemo", "osc", "saccflight", "qvpen",
        "cyanemu", "udonemu", "facetracking", "cats-blender", "blender-addon", "world"
      ].some((term) => this.hasTerm(repoText, term));

      if (!hasVrcContext) {
        return {
          isRelevant: false,
          score: 0,
          confidence: 0.98,
          category: "generic_software",
          reasons: ["No VRChat or Unity ecosystem context found on GitHub"]
        };
      }

      for (const term of this.GENERIC_TECH_TERMS) {
        if (repoText.includes(term) && !repoText.includes("vrchat") && !repoText.includes("unity") && !hasRelease) {
          return {
            isRelevant: false,
            score: -10,
            confidence: 0.95,
            category: "generic_software",
            reasons: [`Generic non-VR tech indicator: ${term}`]
          };
        }
      }
    }

    // C. Check Asset Exclusion Patterns (Clothing, Tattoos, Hair, Jewelry, Outfits)
    for (const pat of this.ASSET_EXCLUSION_PATTERNS) {
      if (pat.test(titleLower)) {
        const isToolForAsset = [
          "tool", "tools", "fitter", "generator", "baker", "system", "script", "converter",
          "gimmick", "ギミック", "ツール", "システム", "アドオン", "プラグイン", "エディタ", "editor"
        ].some((t) => titleLower.includes(t));

        if (!isToolForAsset) {
          return {
            isRelevant: false,
            score: -5,
            confidence: 0.95,
            category: "asset_pollution",
            reasons: [`Excluded asset pattern in title: ${pat.toString()}`]
          };
        }
      }
    }

    // Check commercial full avatar bases
    if (
      (titleLower.includes("avatar base") ||
        titleLower.includes("original 3d avatar") ||
        titleLower.includes("3d avatar") ||
        titleLower.includes("vrchat avatar base")) &&
      !titleLower.includes("tool") &&
      !titleLower.includes("optimizer") &&
      !titleLower.includes("system") &&
      !titleLower.includes("sdk")
    ) {
      return {
        isRelevant: false,
        score: -5,
        confidence: 0.92,
        category: "asset_pollution",
        reasons: ["Commercial avatar base model, not a toolchain or system"]
      };
    }

    // D. Positive Scoring
    for (const term of this.STRONG_TOOL_TERMS) {
      if (this.hasTerm(nameToSearch, term)) {
        score += 5;
        reasons.push(`Strong tool term in name: ${term}`);
        break;
      } else if (this.hasTerm(repoText, term)) {
        score += 3;
        reasons.push(`Strong tool term in text: ${term}`);
        break;
      }
    }

    for (const term of this.SECONDARY_VRC_TERMS) {
      if (this.hasTerm(nameToSearch, term)) {
        score += 2;
        reasons.push(`VRC term in name: ${term}`);
        break;
      } else if (this.hasTerm(repoText, term)) {
        score += 1;
        reasons.push(`VRC term in text: ${term}`);
        break;
      }
    }

    // BOOTH Category 208 (3D Tools & Systems) baseline bonus (requires additional tool signals to pass threshold 3)
    if (e.platform === "booth") {
      score += 1;
      reasons.push("BOOTH Category 208 (3D Tools & Systems)");
    }

    // Threshold check (score >= 3)
    const isRelevant = score >= 3;
    const confidence = isRelevant
      ? Math.min(0.99, 0.85 + score * 0.02)
      : Math.max(0.1, 0.7 - Math.abs(score) * 0.05);

    const category =
      score >= 5
        ? "toolchain"
        : score >= 3
        ? "system"
        : e.platform === "github"
        ? "generic_software"
        : "asset_pollution";

    const finalReasons = isRelevant
      ? reasons
      : reasons.length > 0 && !reasons.some((r) => r.toLowerCase().includes("commercial") || r.toLowerCase().includes("skeleton") || r.toLowerCase().includes("blacklisted") || r.toLowerCase().includes("generic") || r.toLowerCase().includes("asset"))
      ? [`Score ${score}/3 below minimum relevance threshold (matched: ${reasons.join(", ")})`]
      : reasons.length > 0
      ? reasons
      : [`Score ${score}/3 below minimum relevance threshold (no tool signals found)`];

    return { isRelevant, score, confidence, category, reasons: finalReasons };
  }


  // Pre-screening candidate URLs before queuing into frontier
  static isUrlCandidateRelevant(url: string, platform: string): boolean {
    const u = url.toLowerCase();

    // Fast reject blacklisted GitHub orgs & awesome lists
    if (platform === "github") {
      if (
        u.includes("/awesome-") ||
        u.includes("awesome_") ||
        u.endsWith("/awesome") ||
        u.includes("/awesome/") ||
        u.includes("/sindresorhus/")
      ) {
        return false;
      }

      const match = u.match(/github\.com\/([^/]+)/);
      if (match && this.BLACKLIST_OWNERS.has(match[1].toLowerCase())) {
        return false;
      }

      // API search endpoints are always valid
      if (u.includes("api.github.com/search")) return true;

      // Filter out non-repository and non-code paths
      if (
        u.includes("/actions") ||
        u.includes("/issues") ||
        u.includes("/pulls") ||
        u.includes("/commit/") ||
        u.includes("/blob/") ||
        u.includes("/tree/")
      ) {
        return false;
      }

      // Graph propagation: allow candidate repositories to be crawled and inspected for package.json/release assets
      return true;
    }

    // Fast reject obvious cosmetic slugs on Jinxxy, Gumroad & Itch
    if (platform === "jinxxy" || platform === "gumroad" || platform === "itch") {
      for (const pat of this.ASSET_EXCLUSION_PATTERNS) {
        if (pat.test(u)) return false;
      }
    }

    return true;
  }
}
