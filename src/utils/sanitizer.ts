import { IanaRegistry } from "./iana.ts";

/**
 * Unescapes standard HTML entity codes
 */
export function unescapeHtml(text: string): string {
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

/**
 * Common promotional / marketing brackets and prefixes found in Japanese and Western listings
 */
export const MARKETING_BRACKETS = [
  /^[【\[(]?(?:VRC(?:hat)?|Unity|3Dモデル|3D衣装|VRC想定|3Dシステム|3Dアバター|VRC向け)[】\])]\s*/gi,
  /[【\[(]?(?:VRC(?:hat)?|Unity|3Dモデル|3D衣装|VRC想定|3Dシステム|3Dアバター|VRC向け)[】\])]$/gi,
  /^[【\[(]?(?:無料|FREE|Free|Sale|セール|VerUP|早急用|簡単導入|全アバター対応|汎用|MA対応|Modular Avatar対応|VRCFury対応|非公式)[】\])]\s*/gi,
  /[【\[(]?(?:無料|FREE|Free|Sale|セール|VerUP|早急用|簡単導入|全アバター対応|汎用|MA対応|Modular Avatar対応|VRCFury対応|非公式)[】\])]$/gi,
  /\s*[【\[(](?:VRC(?:hat)?|Unity|3Dモデル|3D衣装|無料|FREE|Free|Sale|セール|VerUP|早急用)[】\])]/gi
];

/**
 * Normalizes storefront listing title:
 * 1. NFKC normalization
 * 2. Unescape HTML entities
 * 3. Strips decorative / marketing bracket boilerplate
 * 4. Strips trailing version numbers (e.g. v1.0.0 beta)
 * 5. Collapses whitespace
 */
export function cleanTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  let title = unescapeHtml(rawTitle).normalize("NFKC");
  for (let i = 0; i < 3; i++) {
    for (const pat of MARKETING_BRACKETS) {
      title = title.replace(pat, " ");
    }
  }
  // Remove decorative CJK brackets content if boilerplate
  title = title
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[（(][^）)]*[）)]/g, " ");
  title = title.replace(/\s+v?[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:\s*beta|\s*alpha)?$/i, "");
  title = title.replace(/\s+/g, " ").trim();
  return title.length > 0 ? title : unescapeHtml(rawTitle).trim();
}

export function normalizeListingTitle(title: string): string {
  if (!title) return "";
  return title
    .normalize("NFKC")
    .replace(/【[^】]*】/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cleans single author name:
 * Strips HTML tags, parentheticals, social handles (@...), and whitespace
 */
export function cleanAuthorName(rawName: string): string {
  if (!rawName) return "Unknown";
  let a = unescapeHtml(rawName).normalize("NFKC");
  a = a.replace(/<[^>]+>/g, "").replace(/\([^)]+\)/g, "");
  a = a.replace(/[@#].*$/, "");
  a = a.replace(/\s+/g, " ").trim();
  return a.length > 0 ? a : "Unknown";
}

/**
 * Cleans and normalizes product description at front stage:
 * 1. Unescapes HTML entities
 * 2. Strips markdown image embeds (![...](...))
 * 3. Strips raw discord invites
 * 4. Normalizes whitespace while preserving paragraph line breaks
 */
export function cleanDescription(rawDesc: string): string {
  if (!rawDesc) return "";
  let desc = unescapeHtml(rawDesc);
  desc = desc.replace(/!\[.*?\]\(.*?\)/g, "").replace(/(?:https?:\/\/discord\.gg\/\S+)/gi, "").trim();
  // Normalize horizontal spaces within lines, and collapse excessive vertical blank lines
  desc = desc.replace(/[^\S\r\n]+/g, " ");
  desc = desc.replace(/\r\n/g, "\n");
  desc = desc.replace(/\n\s*\n\s*\n+/g, "\n\n");
  return desc.trim();
}

/**
 * Extracts and sanitizes informative description content from a repository README:
 * 1. Strips HTML comments, raw tags, linked badges, and image embeds
 * 2. Unescapes HTML entities and normalizes markdown links to plain anchor text
 * 3. Removes code fences, table-of-contents lists, and boilerplate sections (License, Changelog, etc.)
 * 4. Extracts overview paragraphs and feature bullet points
 * 5. Integrates with existing package/repository synopsis without duplication
 * 6. Bounds length cleanly on paragraph/sentence boundaries (up to 2000 chars)
 */
export function extractReadmeDescription(readmeText: string, synopsis?: string): string {
  const cleanSynopsis = synopsis ? cleanDescription(synopsis) : "";
  if (!readmeText || typeof readmeText !== "string") {
    return cleanSynopsis;
  }

  // 1. Normalize line endings and strip HTML comments
  let text = readmeText.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "");

  // 2. Strip code fences (e.g. bash scripts, installation snippets)
  text = text.replace(/```[\s\S]*?```/g, "");

  // 3. Strip linked badges and image embeds
  text = text.replace(/\[!\[.*?\]\(.*?\)\](?:\(.*?\))?/g, "");
  text = text.replace(/!\[.*?\]\(.*?\)/g, "");
  text = text.replace(/<img[^>]*>/gi, "");

  // 4. Strip raw HTML tags while preserving text
  text = text.replace(/<[^>]+>/g, " ");

  // 5. Unescape HTML entities
  text = unescapeHtml(text);

  // 6. Convert markdown links [text](url) to text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 7. Strip inline code backticks
  text = text.replace(/`([^`]+)`/g, "$1");

  // 8. Cut off trailing boilerplate sections: License, Contributing, Changelog, Sponsors, etc.
  const boilerplateRegex = /\n#{1,3}\s+(?:license|contributing|changelog|release notes|sponsors|donations|acknowledgements|credits)\b[\s\S]*/i;
  text = text.replace(boilerplateRegex, "");

  // 9. Process lines into clean paragraphs/bullets
  const rawParagraphs = text.split(/\n\s*\n/);
  const cleanParagraphs: string[] = [];

  for (const para of rawParagraphs) {
    const lines = para.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // Skip TOC lines e.g. - [Overview](#overview)
    if (lines.every(l => /^[-*+]\s*\[.*?\]\(#.*?\)$/.test(l))) continue;

    // Skip lines that are only badges / shield URLs or markdown hr
    if (lines.every(l => /^(?:https?:\/\/(?:img\.shields\.io|badge|github\.com\/[^\/]+\/[^\/]+\/actions)|\-{3,}|\*{3,}|_{3,})/.test(l))) continue;

    const processedLines = lines.map(line => {
      // Remove header markers '# ', '## ', etc.
      let l = line.replace(/^#{1,6}\s+/, "");
      // Clean up markdown bullet points
      if (/^[-*+]\s+/.test(l)) {
        l = "- " + l.replace(/^[-*+]\s+/, "");
      }
      return l;
    });

    const joined = processedLines.join("\n").trim();
    if (joined.length > 0) {
      cleanParagraphs.push(joined);
    }
  }

  // 10. If the first paragraph is just a title or short header (e.g. single line without punctuation), and we have more paragraphs, skip it
  if (cleanParagraphs.length > 1) {
    const first = cleanParagraphs[0];
    if (!first.includes("\n") && first.length < 50 && !first.endsWith(".")) {
      cleanParagraphs.shift();
    }
  }

  // 11. Assemble content up to ~2000 characters
  let assembled = "";
  for (const p of cleanParagraphs) {
    if (!assembled) {
      assembled = p;
    } else {
      if (assembled.length + p.length + 2 > 2000) {
        // Only append if assembled is still relatively short (< 600 chars)
        if (assembled.length < 600) {
          const remaining = 2000 - assembled.length - 2;
          const sentenceEnd = p.slice(0, remaining).lastIndexOf(".");
          if (sentenceEnd > 50) {
            assembled += "\n\n" + p.slice(0, sentenceEnd + 1);
          }
        }
        break;
      }
      assembled += "\n\n" + p;
    }
  }

  assembled = cleanDescription(assembled);

  // 12. Combine with synopsis if present
  if (cleanSynopsis) {
    if (!assembled) {
      return cleanSynopsis;
    }
    const normSynopsis = cleanSynopsis.toLowerCase();
    const normAssembled = assembled.toLowerCase();
    if (normAssembled.startsWith(normSynopsis) || normAssembled.includes(normSynopsis)) {
      return assembled;
    }
    return `${cleanSynopsis}\n\n${assembled}`.slice(0, 2500);
  }

  return assembled;
}

export interface AuthorResolution {
  primaryAuthor: string;
  allAuthors: string[];
}

/**
 * Disambiguates authors from raw author field, repository context, and package ID
 */
export function resolveAuthors(
  rawAuthor: string,
  pkgId: string = "",
  repoUrl: string = "",
  rawAuthorsList?: any[]
): AuthorResolution {
  const authorsSet = new Set<string>();

  // 1. Process structured rawAuthorsList (from manifest authors/contributors)
  if (Array.isArray(rawAuthorsList)) {
    for (const item of rawAuthorsList) {
      const name = typeof item === "string" ? item : item?.name;
      if (name && typeof name === "string") {
        const cleaned = cleanAuthorName(name);
        if (cleaned && !IanaRegistry.isTld(cleaned) && cleaned.toLowerCase() !== "unknown") {
          authorsSet.add(cleaned);
        }
      }
    }
  }

  // 2. Process rawAuthor string (may be comma-separated e.g. "Author1, Author2")
  if (rawAuthor) {
    const parts = rawAuthor.split(/[,;\/&]+/).map(cleanAuthorName).filter(Boolean);
    for (const p of parts) {
      if (p && !IanaRegistry.isTld(p) && p.toLowerCase() !== "unknown") {
        authorsSet.add(p);
      }
    }
  }

  // 3. Empirical Repository Ground Truth: If repoUrl provides an exact GitHub repo owner, verify/augment
  let ghOwner: string | null = null;
  if (repoUrl) {
    const ghMatch = repoUrl.match(/github\.com\/([a-zA-Z0-9_-]+)\//i);
    if (ghMatch && ghMatch[1]) {
      const owner = ghMatch[1];
      if (owner.toLowerCase() === "vrchat") {
        ghOwner = "VRChat";
      } else if (owner.length >= 2 && !IanaRegistry.isTld(owner)) {
        ghOwner = owner;
      }
    }
  }

  // 4. VRChat SDK Components: com.vrchat.* is authored by "VRChat"
  const cleanId = pkgId.replace(/^vpm:/i, "");
  const isVRChatOfficial = cleanId.startsWith("com.vrchat.") || cleanId.startsWith("vrchat.");

  let primaryAuthor = "";

  if (isVRChatOfficial) {
    primaryAuthor = "VRChat";
    authorsSet.add("VRChat");
  } else if (ghOwner) {
    if (authorsSet.size === 0 || Array.from(authorsSet).every(a => a.toLowerCase() === "vrchat" || a.toLowerCase() === "community")) {
      primaryAuthor = ghOwner;
      authorsSet.add(ghOwner);
    } else {
      const firstValid = Array.from(authorsSet).find(a => a.toLowerCase() !== "community" && a.toLowerCase() !== "vrchat");
      primaryAuthor = firstValid || ghOwner;
    }
  }

  // 5. Author Disambiguation for VPM packages with generic, missing, or TLD-polluted authors
  if (!primaryAuthor || primaryAuthor.toLowerCase() === "vrchat" || primaryAuthor.toLowerCase() === "community" || IanaRegistry.isTld(primaryAuthor)) {
    if (pkgId) {
      const parts = IanaRegistry.cleanReverseDnsSegments(cleanId);
      if (parts.length > 0) {
        const candidate = parts[0];
        if (candidate.toLowerCase() === "vrchat") {
          primaryAuthor = "VRChat";
        } else if (candidate.length >= 2 && !IanaRegistry.isTld(candidate)) {
          primaryAuthor = candidate;
        }
      }
    }
  }

  if (!primaryAuthor) {
    const list = Array.from(authorsSet);
    primaryAuthor = list.length > 0 ? list[0] : (cleanAuthorName(rawAuthor) || "Unknown");
  }

  if (primaryAuthor && primaryAuthor !== "Unknown" && !authorsSet.has(primaryAuthor)) {
    authorsSet.add(primaryAuthor);
  }

  const allAuthors = Array.from(authorsSet).filter(a => {
    if (a.toLowerCase() === "community") return false;
    if (a.toLowerCase() === "vrchat" && !isVRChatOfficial && (ghOwner !== "VRChat")) return false;
    return true;
  });

  if (allAuthors.length === 0) {
    allAuthors.push(primaryAuthor);
  }

  return {
    primaryAuthor,
    allAuthors
  };
}
