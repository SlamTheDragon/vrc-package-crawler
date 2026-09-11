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

// FIXME: need an on-time decision instead of relying on hardcoded seeds for a closely monitored filtering. Perhaps use a neural network?
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
    "macos app", "gnome", "wayland", "audio player for terminal"
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
    /\bminigun\b/i
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
    "アドオン", "プラグイン", "エディタ", "ボーン", "ウェイト", "改変"
  ];

  // 5. Secondary VRChat Ecosystem Signals (+1 to +2)
  private static SECONDARY_VRC_TERMS = [
    "vrchat", "vrc", "unitypackage", "vcc", "av3", "avatars 3.0",
    "animator", "blendshape", "constraint", "menu generator", "toggle system",
    "camera tool", "prefab system", "interactive", "audiolink", "audio link",
    "unity", "prefab", "pb"
  ];

  private static hasTerm(target: string, term: string): boolean {
    const isAscii = /^[\x00-\x7F]+$/.test(term);
    if (isAscii && term.length <= 4) {
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
    const descLower = (e.description || "").toLowerCase();
    const tagsLower = (e.tags_json || "").toLowerCase();
    const idLower = (e.id || "").toLowerCase();
    const rawLower = (e.raw_json || "").toLowerCase();
    const combinedText = `${idLower} ${titleLower} ${descLower} ${tagsLower}`;

    // A. Check VPM manifests (always 100% verified toolchain packages)
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

    // B. Check GitHub Blacklisted Owners & generic software signals
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

      // STRICT REQUIREMENT: Must have explicit VRChat or Unity ecosystem context on GitHub
      const hasVrcContext = [
        "vrchat", "vrc", "vpm", "udon", "unity", "avatar", "shader", "modular avatar",
        "modular-avatar", "vrcfury", "ndmf", "physbone", "dynamicbone", "liltoon",
        "poiyomi", "unlitwf", "gogoloco", "faceemo", "osc", "saccflight", "qvpen",
        "cyanemu", "udonemu", "facetracking", "cats-blender"
      ].some((term) => this.hasTerm(combinedText, term));

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
        if (combinedText.includes(term) && !combinedText.includes("vrchat") && !combinedText.includes("unity")) {
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
          "setup", "gimmick", "ギミック", "ツール", "システム", "アドオン", "プラグイン"
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

    // Extract slug/repo name without author prefix to avoid author false positives
    const slug = e.id.includes("/") ? e.id.split("/").slice(1).join("/") : e.id.replace(/^[a-z]+:/, "");
    const nameToSearch = `${e.title} ${slug}`.toLowerCase();

    // D. Positive Scoring
    for (const term of this.STRONG_TOOL_TERMS) {
      if (this.hasTerm(nameToSearch, term)) {
        score += 5;
        reasons.push(`Strong tool term in name: ${term}`);
        break;
      } else if (this.hasTerm(combinedText, term)) {
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
      } else if (this.hasTerm(combinedText, term)) {
        score += 1;
        reasons.push(`VRC term in text: ${term}`);
        break;
      }
    }

    // BOOTH Category 208 (3D Tools & Systems) baseline bonus
    if (e.platform === "booth") {
      score += 2;
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

    return { isRelevant, score, confidence, category, reasons };
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

      // Repository URLs must contain at least one VRChat/Unity ecosystem keyword
      const VRC_URL_TERMS = [
        "vrchat", "vrc", "vpm", "udon", "avatar", "shader", "modular", "vrcfury",
        "ndmf", "liltoon", "poiyomi", "blendshape", "physbone", "dynamicbone",
        "gogoloco", "faceemo", "saccflight", "qvpen", "kurotu", "anatawa12",
        "nadena", "baryon", "d4rk", "pumkin", "cyanlaser", "vrclib", "lyuma",
        "hai-vr", "unity", "blender", "facetrack", "openvr", "steamvr", "ovr",
        "bdunderscore", "merlinvr", "dreadrith", "architech", "vrlabs", "reimajo",
        "whiteflare", "cascadianvr", "rollthered", "jansharp", "thryrallo",
        "jlchntoz", "yueby", "netnarazaka", "happyrobot", "sonic853", "hoshinolabs",
        "furality", "sacc", "techan", "vrchat-community", "rurre", "razgriz", "varneon", "z3y"
      ];

      return VRC_URL_TERMS.some((term) => u.includes(term));
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
