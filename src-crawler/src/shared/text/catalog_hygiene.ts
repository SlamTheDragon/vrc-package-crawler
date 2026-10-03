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

/**
 * Outbound Link Hygiene (LEGAL.md Section 4.3):
 * Strips tracking parameters, session identifiers, and third-party affiliate tokens from outbound links.
 */
export function cleanTrackingParams(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return "";
  try {
    const url = new URL(urlStr);
    const trackingExact = new Set([
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "ref", "aff", "affiliate", "fbclid", "gclid", "token", "source",
      "msclkid", "twclid", "igshid", "mc_eid", "_ga", "_gl", "spm", "si",
      "session_id", "feature"
    ]);
    const keysToDelete: string[] = [];
    for (const key of url.searchParams.keys()) {
      const lower = key.toLowerCase();
      if (trackingExact.has(lower) || lower.startsWith("utm_") || lower.startsWith("aff_") || lower.startsWith("ref_")) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      url.searchParams.delete(key);
    }
    let res = url.href;
    if (!urlStr.endsWith("/") && res.endsWith("/") && url.pathname === "/") {
      res = res.slice(0, -1);
    }
    return res;
  } catch {
    return urlStr;
  }
}
