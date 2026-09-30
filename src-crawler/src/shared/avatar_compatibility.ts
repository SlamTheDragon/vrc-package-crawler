import { z } from "zod";

/**
 * Avatar compatibility schema linking cosmetics to target avatar base meshes (IDENTITY-02).
 */
export const AvatarCompatibilitySchema = z.object({
  compatibilityId: z.string(),
  itemKey: z.string(),
  targetAvatarBase: z.string(), // e.g. "kikyo", "manuka", "shinano", "selestia", "generic"
  scope: z.enum(["named_base", "universal", "uncertain"]),
  confidence: z.enum(["creator_declared", "keyword_inferred", "unverified"]),
  evidenceSource: z.string()
});
export type AvatarCompatibility = z.infer<typeof AvatarCompatibilitySchema>;

interface KnownBaseDef {
  slug: string;
  patterns: RegExp[];
}

const KNOWN_AVATAR_BASES: KnownBaseDef[] = [
  { slug: "kikyo", patterns: [/桔梗/, /\b(?:kikyo|kikyou)\b/i] },
  { slug: "manuka", patterns: [/マヌカ/, /\bmanuka\b/i] },
  { slug: "shinano", patterns: [/縹乃|しなの/, /\bshinano\b/i] },
  { slug: "selestia", patterns: [/セレスティア/, /\b(?:selestia|celestia)\b/i] },
  { slug: "rindo", patterns: [/竜胆/, /\b(?:rindo|rindou)\b/i] },
  { slug: "karin", patterns: [/カリン/, /\bkarin\b/i] },
  { slug: "grus", patterns: [/(?<!サン)グラス/, /\bgrus\b/i] },
  { slug: "maya", patterns: [/舞夜/, /\bmaya\b/i] },
  { slug: "moe", patterns: [/(?<![a-zA-Z])萌(?!え)/, /\bmoe\b/i] },
  { slug: "lime", patterns: [/ライム/, /\blime\b/i] },
  { slug: "mint", patterns: [/ミント/, /\bmint\b/i] },
  { slug: "milk", patterns: [/ミルク/, /\bmilk\b/i] },
  { slug: "komano", patterns: [/狛乃/, /\bkomano\b/i] },
  { slug: "minase", patterns: [/水瀬/, /\bminase\b/i] },
  { slug: "sio", patterns: [/汐/, /\bsio\b/i] },
  { slug: "uzuki", patterns: [/卯月/, /\buzuki\b/i] },
  { slug: "chiffon", patterns: [/シフォン/, /\bchiffon\b/i] },
  { slug: "cheryl", patterns: [/シェリル/, /\bcheryl\b/i] },
  { slug: "lunalitt", patterns: [/ルナリット/, /\blunalitt\b/i] },
  { slug: "rushan", patterns: [/ルーシャン/, /\brushan\b/i] },
  { slug: "anri", patterns: [/アンリ/, /\banri\b/i] },
  { slug: "misaki", patterns: [/みさき/, /\bmisaki\b/i] },
  { slug: "vroid", patterns: [/\bv-?roid\b/i] }
];

const UNIVERSAL_PATTERNS = [
  /全アバター対応/,
  /全アバター向け/,
  /全アバター用/,
  /全アバター/,
  /全対応/,
  /汎用/,
  /アバター問わず/,
  /\buniversal(?:\s+fit|\s+avatar)?\b/i,
  /\ball\s+avatars?\s*(?:compatible|supported)?\b/i,
  /\bany\s+avatar\b/i,
  /【対応】/
];

/**
 * Extracts avatar base compatibility records from title, description, and tags (IDENTITY-02).
 * Normalizes CJK brackets and NFKC, matches known base avatars, and flags universal compatibility.
 */
export function extractAvatarCompatibility(
  title: string,
  description: string,
  tags: string[] = [],
  itemKey: string = "unknown"
): AvatarCompatibility[] {
  const normTitle = (title || "").normalize("NFKC");
  const normDesc = (description || "").normalize("NFKC");
  const normTags = (tags || []).map(t => (t || "").normalize("NFKC"));

  const results = new Map<string, AvatarCompatibility>();

  const addRecord = (
    base: string,
    scope: "named_base" | "universal" | "uncertain",
    confidence: "creator_declared" | "keyword_inferred" | "unverified",
    source: string
  ) => {
    const existing = results.get(base);
    if (!existing) {
      results.set(base, {
        compatibilityId: `${itemKey}:${base}:${scope}`,
        itemKey,
        targetAvatarBase: base,
        scope,
        confidence,
        evidenceSource: source
      });
      return;
    }

    // Elevate confidence if stronger evidence found
    const confidenceRanks = { creator_declared: 3, keyword_inferred: 2, unverified: 1 };
    if (confidenceRanks[confidence] > confidenceRanks[existing.confidence]) {
      existing.confidence = confidence;
      existing.evidenceSource = source;
    }
  };

  // 1. Check Universal Compatibility
  let isUniversal = false;
  let universalSource = "";

  for (const pat of UNIVERSAL_PATTERNS) {
    if (pat.test(normTitle)) {
      isUniversal = true;
      universalSource = "title";
      break;
    }
  }

  if (!isUniversal) {
    for (const tag of normTags) {
      if (UNIVERSAL_PATTERNS.some(p => p.test(tag))) {
        isUniversal = true;
        universalSource = "tags";
        break;
      }
    }
  }

  if (!isUniversal) {
    for (const pat of UNIVERSAL_PATTERNS) {
      if (pat.test(normDesc)) {
        isUniversal = true;
        universalSource = "description";
        break;
      }
    }
  }

  if (isUniversal) {
    const confidence = universalSource === "description" ? "keyword_inferred" : "creator_declared";
    addRecord("generic", "universal", confidence, universalSource);
  }

  // 2. Extract bracketed titles for high-confidence creator declarations
  const bracketMatches = normTitle.match(/[【\[(（][^】\])）]+[】\])）]/g) || [];
  const bracketContent = bracketMatches.join(" ");

  // 3. Scan Known Avatar Bases
  for (const avatar of KNOWN_AVATAR_BASES) {
    // Check in bracketed title sections (strongest creator declaration)
    const matchedInBracket = avatar.patterns.some(p => p.test(bracketContent));
    if (matchedInBracket) {
      addRecord(avatar.slug, "named_base", "creator_declared", "title");
      continue;
    }

    // Check in tags
    const matchedInTag = normTags.some(t => avatar.patterns.some(p => p.test(t)));
    if (matchedInTag) {
      addRecord(avatar.slug, "named_base", "creator_declared", "tags");
      continue;
    }

    // Check in full title
    const matchedInTitle = avatar.patterns.some(p => p.test(normTitle));
    if (matchedInTitle) {
      addRecord(avatar.slug, "named_base", "creator_declared", "title");
      continue;
    }

    // Check in description
    const matchedInDesc = avatar.patterns.some(p => p.test(normDesc));
    if (matchedInDesc) {
      // Check if description has explicit compatibility declaration
      const hasCompatContext = /(?:対応|supported|compatible|for\s+|designed\s+for|動作確認)/i.test(normDesc);
      addRecord(
        avatar.slug,
        "named_base",
        hasCompatContext ? "creator_declared" : "keyword_inferred",
        "description"
      );
    }
  }

  return Array.from(results.values());
}
