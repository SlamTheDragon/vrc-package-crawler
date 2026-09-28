/** Supported public GitHub REST endpoint, excluding search, HTML, content and archive URLs. */
export function githubApiRepositoryIdentity(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.hostname !== "api.github.com" || url.port || url.search || url.hash ||
      url.username || url.password) return null;
  const match = /^\/repos\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/.exec(url.pathname);
  if (!match || match[2] === "." || match[2] === "..") return null;
  return `${match[1]}/${match[2]}`;
}

/** Current leased BOOTH discovery endpoint class: a single category page. */
export function isBoothBrowseTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return url.href === value && url.origin === "https://booth.pm" && !url.username && !url.password &&
      !url.port && /^\/(?:ja|en)\/browse\/[A-Za-z0-9._~%-]+$/.test(url.pathname) &&
      /^\?page=[1-9]\d{0,2}$/.test(url.search) && !url.hash;
  } catch { return false; }
}

/** A canonical BOOTH item URL, with no tracking query or locale ambiguity. */
export function boothItemIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.href !== value || url.origin !== "https://booth.pm" || url.username || url.password ||
        url.port || url.search || url.hash) return null;
    return /^\/(?:ja\/|en\/)?items\/([1-9]\d{0,17})\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch { return null; }
}

/** An explicitly seeded Shopify product sitemap, never an arbitrary shop page or sitemap index. */
export function isShopifyProductSitemapTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return url.href === value && url.protocol === "https:" && !url.username && !url.password &&
      !url.port && !url.hash && /^\/sitemap_products_[1-9]\d*\.xml$/.test(url.pathname) &&
      (!url.search || /^\?from=[1-9]\d*&to=[1-9]\d*$/.test(url.search));
  } catch { return false; }
}

/** Keep a sitemap lead on the reviewed merchant origin; never infer cross-domain equivalence. */
export function shopifyProductLead(value: string, origin: string): string | null {
  try {
    const url = new URL(value);
    if (value.length > 1000 || url.href !== value || url.origin !== origin || url.username ||
        url.password || url.port || url.search || url.hash ||
        !/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\/[a-z0-9][a-z0-9-]*$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
