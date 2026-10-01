import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as cheerio from "cheerio";
import type { CrawlJob, DiscoveryLead, Observation, ResultRequest, VpmListingIssue } from "../../shared/protocol/node_protocol.ts";
import { isVpmVersion } from "../../shared/taxonomy/vpm_version.ts";
import { classifyAccessFailure, retryAfterSeconds } from "../../shared/protocol/access_outcome.ts";
import { githubApiRepositoryIdentity, isBoothBrowseTarget, boothItemIdentity,
  isShopifyProductSitemapTarget, shopifyProductLead,
  isSellfyProductTarget, sellfyProductIdentity, isCustomDomainProductTarget } from "../../shared/policy/source_targets.ts";
import { CRAWLER_USER_AGENT } from "../../shared/robots/crawler_identity.ts";
import { UnsafeMetadataTarget } from "../client/public_metadata_fetch.ts";

type Outcome = ResultRequest["outcome"];

/**
 * Safely resolves an existing scoped GitHub token from .env or bin/.env in the working directory without exposing it.
 * Used exclusively for scoped rate scaling on api.github.com.
 */
export function loadScopedGitHubTokenFromEnvFile(dir: string = process.cwd()): string | undefined {
  const candidatePaths = [
    join(dir, ".env"),
    join(dir, "bin", ".env")
  ];
  for (const envPath of candidatePaths) {
    try {
      if (existsSync(envPath)) {
        const content = readFileSync(envPath, "utf8");
        const match = content.match(/^ *(?:export +)?(?:GITHUB_TOKEN|GH_TOKEN) *= *["']?([^"'#\r\n]+)["']?/m);
        if (match && match[1]?.trim()) {
          return match[1].trim();
        }
      }
    } catch {
      // Fall through safely on permission or missing file error
    }
  }
  return undefined;
}

async function boundedText(response: Response, maxBytes = 2_000_000): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) { await reader.cancel(); throw new Error("Response over 2 MB"); }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function normalizedDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function httpsLinks(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string")
    .filter((value) => { try { return new URL(value).protocol === "https:"; } catch { return false; } }))].slice(0, 100);
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function authorName(value: unknown): string | null {
  return string(value) || string(object(value)?.name);
}

/**
 * Normalises a VPM manifest `keywords` field into a deduplicated, trimmed list capped at 50.
 * Returns undefined when no valid tags survive so the wire field stays omitted.
 */
function vpmKeywords(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= 100)
  )].slice(0, 50);
  return tags.length > 0 ? tags : undefined;
}

function httpsLink(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { return new URL(value).protocol === "https:" ? value : undefined; } catch { return undefined; }
}

/** Only the public REST repository metadata endpoint is supported; no HTML or README archival. */
export function parseGitHubRepository(job: CrawlJob, body: string): Observation | null {
  if (job.platform !== "github") return null;
  const requestedName = githubApiRepositoryIdentity(job.url);
  if (!requestedName) return null;
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return null; }
  const repo = object(raw);
  const fullName = string(repo?.full_name);
  const owner = string(object(repo?.owner)?.login);
  const name = string(repo?.name);
  const id = repo?.id;
  const htmlUrl = httpsLink(repo?.html_url);
  if (!repo || repo.private !== false || !fullName || !owner || !name || !htmlUrl ||
      !Number.isSafeInteger(id) || (id as number) <= 0 ||
      fullName.toLowerCase() !== requestedName.toLowerCase() ||
      `${owner}/${name}`.toLowerCase() !== requestedName.toLowerCase() ||
      htmlUrl.toLowerCase() !== `https://github.com/${requestedName}`.toLowerCase()) return null;
  return {
    sourceItemKey: `github:${id}`,
    title: name.slice(0, 500),
    author: owner.slice(0, 300),
    summary: (string(repo.description) || "").slice(0, 1024),
    outboundLinks: httpsLinks([htmlUrl, repo.homepage]),
    originUpdatedAt: normalizedDate(repo.updated_at)
  };
}

function releaseEvidence(version: string, manifest: Record<string, unknown>): NonNullable<Observation["release"]> | null {
  if (!isVpmVersion(version)) return null;
  const dependencyObject = manifest.vpmDependencies === undefined ? {} : object(manifest.vpmDependencies);
  if (!dependencyObject || Object.keys(dependencyObject).length > 100) return null;
  const dependencyRanges: Record<string, string> = Object.create(null);
  for (const [name, range] of Object.entries(dependencyObject)) {
    if (!name || name.length > 200 || !string(range) || string(range)!.length > 200) return null;
    dependencyRanges[name] = string(range)!;
  }
  const hash = string(manifest.zipSHA256);
  if (hash && !/^[a-fA-F0-9]{64}$/.test(hash)) return null;
  return {
    version,
    dependencyRanges,
    ...(httpsLink(manifest.url) ? { downloadUrl: httpsLink(manifest.url) } : {}),
    ...(hash ? { zipSha256: hash.toLowerCase() } : {})
  };
}

/** A template source is a build recipe. Its URLs are leads, not package or version evidence. */
export function parseVpmListingRecipe(job: CrawlJob, body: string): DiscoveryLead[] | null {
  if (job.platform !== "vpm" && job.platform !== "curated") return null;
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return null; }
  const recipe = object(raw);
  if (!recipe || !string(recipe.name) || !httpsLink(recipe.url)) return null;
  if (recipe.packages !== undefined && !Array.isArray(recipe.packages)) return null;
  if (recipe.githubRepos !== undefined && !Array.isArray(recipe.githubRepos)) return null;
  if (!Array.isArray(recipe.packages) && !Array.isArray(recipe.githubRepos)) return null;
  const packages = recipe.packages || [];
  const githubRepos = recipe.githubRepos || [];
  if (packages.length > 100 || githubRepos.length > 100) return null;
  const leads: DiscoveryLead[] = [{ kind: "vpm_listing", url: new URL(recipe.url as string).href }];
  for (const repo of githubRepos) {
    if (typeof repo !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null;
    const [owner, name] = repo.split("/");
    if (owner === "." || owner === ".." || name === "." || name === "..") return null;
    leads.push({ kind: "github_repository", url: `https://github.com/${owner}/${name}` });
  }
  for (const entry of packages) {
    const packageInfo = object(entry);
    if (!packageInfo || !Array.isArray(packageInfo.releases) || packageInfo.releases.length > 100) return null;
    const claimedPackageId = string(packageInfo.id) || string(packageInfo.name);
    if (claimedPackageId && claimedPackageId.length > 200) return null;
    for (const release of packageInfo.releases) {
      const url = httpsLink(release);
      if (!url || !new URL(url).pathname.toLowerCase().endsWith(".zip")) return null;
      leads.push({ kind: "release_zip", url: new URL(url).href,
        ...(claimedPackageId ? { claimedPackageId } : {}) });
    }
  }
  if (leads.length > 100) return null;
  return [...new Map(leads.map((lead) => [`${lead.kind}:${lead.url}:${lead.claimedPackageId || ""}`, lead])).values()];
}

/** Keep valid upstream evidence while making malformed entries explicit. Never infer deletion from this result. */
function parseVpmRepositoryEvidence(job: CrawlJob, body: string): {
  observations: Observation[]; issues: VpmListingIssue[]
} | null {
  if (job.platform !== "vpm") return null;
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return null; }
  const repo = object(raw);
  const packages = object(repo?.packages);
  if (!repo || !packages) return null;
  const entries = Object.entries(packages);
  if (entries.length === 0 || entries.length > 100) return null;
  const observations: Observation[] = [];
  const issues: VpmListingIssue[] = [];
  for (const [packageId, packageValue] of entries) {
    if (!packageId || packageId.length > 200) return null;
    const versions = object(object(packageValue)?.versions);
    if (!versions) {
      issues.push({ sourceItemKey: packageId, code: "invalid_package" });
      continue;
    }
    const releases = Object.entries(versions);
    if (releases.length === 0 || releases.length > 100) {
      issues.push({ sourceItemKey: packageId, code: "invalid_package" });
      continue;
    }
    const manifests: { version: string; manifest: Record<string, unknown>; release: NonNullable<Observation["release"]> }[] = [];
    for (const [version, value] of releases) {
      const manifest = object(value);
      const issueVersion = version && version.length <= 100 ? { version } : {};
      if (!version || version.length > 100 || !manifest) {
        issues.push({ sourceItemKey: packageId, ...issueVersion, code: "invalid_manifest" });
        continue;
      }
      if (typeof manifest.name !== "string" || !manifest.name ||
          typeof manifest.version !== "string" || !manifest.version) {
        issues.push({ sourceItemKey: packageId, version, code: "invalid_manifest" });
        continue;
      }
      if (manifest.name !== packageId || manifest.version !== version) {
        issues.push({ sourceItemKey: packageId, version, code: "identity_mismatch" });
        continue;
      }
      if (!isVpmVersion(version)) {
        issues.push({ sourceItemKey: packageId, version, code: "invalid_version" });
        continue;
      }
      const release = releaseEvidence(version, manifest);
      if (!release) {
        issues.push({ sourceItemKey: packageId, version, code: "invalid_release_evidence" });
        continue;
      }
      manifests.push({ version, manifest, release });
    }
    if (issues.length > 100) return null;
    if (manifests.length === 0) continue;
    const author = manifests.map(({ manifest }) => authorName(manifest?.author)).find(Boolean) || authorName(repo.author) || "Unknown";
    const platformTags = vpmKeywords(manifests.map(({ manifest }) => manifest?.keywords).find((kw) => Array.isArray(kw)));
    observations.push({
      sourceItemKey: packageId,
      title: (manifests.map(({ manifest }) => string(manifest?.displayName)).find(Boolean) || packageId).slice(0, 500),
      author: author.slice(0, 300),
      summary: (manifests.map(({ manifest }) => string(manifest?.description)).find(Boolean) || "").slice(0, 1024),
      outboundLinks: httpsLinks([repo.url, object(repo.infoLink)?.url, ...manifests.map(({ manifest }) => object(manifest?.author)?.url)]),
      originUpdatedAt: manifests.map(({ manifest }) => normalizedDate(manifest?.updated_at))
        .filter((date): date is string => date !== null).sort().at(-1) || null,
      releases: manifests.map(({ release }) => release),
      ...(platformTags !== undefined ? { platformTags } : {})
    });
  }
  return { observations, issues };
}

/** Strict convenience parser; partial evidence is available only through the typed outcome. */
export function parseVpmRepository(job: CrawlJob, body: string): Observation[] | null {
  const parsed = parseVpmRepositoryEvidence(job, body);
  return parsed && parsed.issues.length === 0 ? parsed.observations : null;
}

/** A narrow parser for one item; listing and multi-package manifests require dedicated adapters. */
export function parseObservation(job: CrawlJob, body: string, contentType: string): Observation | null {
  if (job.platform === "github") return parseGitHubRepository(job, body);
  if (job.platform === "vpm" || contentType.includes("json")) {
    try {
      const data: unknown = JSON.parse(body);
      if (!data || typeof data !== "object" || Array.isArray(data)) return null;
      const item = data as Record<string, any>;
      if (job.platform === "vpm" && typeof item.name === "string" && typeof item.version === "string") {
        // Identity fields are evidence, not display text. Truncating either can merge
        // distinct upstream packages or turn one release into a different version.
        const name = string(item.name);
        const version = string(item.version);
        if (!name || name !== item.name || name.length > 200 ||
            !version || version !== item.version || version.length > 100) return null;
        const author = typeof item.author === "string" ? item.author : item.author?.name;
        const release = releaseEvidence(version, item);
        if (!release) return null;
        const platformTags = vpmKeywords(item.keywords);
        return {
          sourceItemKey: name, title: String(item.displayName || name).slice(0, 500),
          author: String(author || "Unknown").slice(0, 300), summary: String(item.description || "").slice(0, 1024),
          outboundLinks: httpsLinks([item.url, item.author?.url]),
          originUpdatedAt: normalizedDate(item.updated_at),
          release,
          ...(platformTags !== undefined ? { platformTags } : {})
        };
      }
      return null;
    } catch { return null; }
  }

  const productUrl = new URL(job.url);
  const productPath = job.platform === "booth" && /^\/(?:[a-z]{2}\/)?items\/\d+\/?$/.test(productUrl.pathname) ||
    job.platform === "gumroad" && /^\/l\/[^/]+\/?$/.test(productUrl.pathname) ||
    job.platform === "jinxxy" && /^\/[^/]+\/[^/]+\/?$/.test(productUrl.pathname) ||
    job.platform === "itch" && productUrl.hostname.endsWith(".itch.io") ||
    job.platform === "shopify" && /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?products\/[a-z0-9][a-z0-9-]*\/?$/i.test(productUrl.pathname) ||
    job.platform === "sellfy" && isSellfyProductTarget(job.url) ||
    job.platform === "custom_domain" && isCustomDomainProductTarget(job.url);
  if (!productPath) return null;
  const $ = cheerio.load(body);
  const metadata = (key: string) => $(`meta[property="${key}"],meta[name="${key}"]`).first().attr("content")?.trim() || "";
  const requested = productUrl;
  const jsonLd = $("script[type='application/ld+json']").toArray().flatMap((node) => {
    try {
      const parsed = JSON.parse($(node).html() || "null");
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch { return []; }
  }).find((value) => {
    if (!value || typeof value !== "object" ||
        !/Product|SoftwareApplication/i.test(String(value["@type"] || ""))) return false;
    if (!value.url) return true;
    try {
      const claimed = new URL(String(value.url), job.url);
      return claimed.origin === requested.origin && claimed.pathname === requested.pathname;
    } catch { return false; }
  });
  const title = String(jsonLd?.name || metadata("og:title") || $(".item-name").first().text() || $("h1").first().text() || "").trim();
  if (!title) return null;
  const author = String(jsonLd?.brand?.name || jsonLd?.author?.name || $(".shop-name").first().text() || $(".user-name").first().text() || metadata("author") || "Unknown").trim();
  const summary = String(jsonLd?.description || metadata("og:description") || $(".item-description, .js-item-description, .description-text").first().text() || metadata("description") || "").trim();
  const descLinks = $(".item-description a[href], .js-item-description a[href], .description-text a[href]").toArray().map((el) => $(el).attr("href"));
  // A page's canonical hint can point at a different product, locale or storefront.
  // Identity stays tied to the fetched URL until a platform-specific equivalence rule is reviewed.
  const identity = requested;
  const sourceItemKey = `${identity.host}${identity.pathname}`;
  if (sourceItemKey.length > 200) return null;
  return {
    sourceItemKey, title: title.slice(0, 500),
    author: author.slice(0, 300), summary: summary.slice(0, 1024),
    outboundLinks: httpsLinks([jsonLd?.url, job.url, ...descLinks]),
    originUpdatedAt: normalizedDate(jsonLd?.dateModified || metadata("article:modified_time") || $(".item-created-date").first().text())
  };
}

/** A BOOTH browse page supplies candidate links, never product facts or fetch authority. */
export function parseBoothBrowseLeads(job: CrawlJob, body: string): DiscoveryLead[] | null {
  if (job.platform !== "booth" || job.purpose !== "discovery" || !isBoothBrowseTarget(job.url)) return null;
  const $ = cheerio.load(body);
  const ids = new Set<string>();
  for (const link of $("a[href]").toArray()) {
    const href = $(link).attr("href");
    if (!href) continue;
    try {
      const target = new URL(href, job.url);
      if (target.username || target.password || target.port) continue;
      target.search = "";
      target.hash = "";
      const id = boothItemIdentity(target.href);
      if (!id) continue;
      ids.add(id);
      if (ids.size > 100) return null;
    } catch { /* A malformed link is not a candidate. */ }
  }
  return [...ids].map(id => ({ kind: "storefront_product", url: `https://booth.pm/ja/items/${id}` }));
}

/** A Shopify product sitemap is discovery evidence only; merchant/product facts need separate review. */
export function parseShopifyProductSitemapLeads(job: CrawlJob, body: string): DiscoveryLead[] | null {
  if (job.platform !== "shopify" || job.purpose !== "discovery" ||
      !isShopifyProductSitemapTarget(job.url) || /<!DOCTYPE|<!ENTITY/i.test(body) ||
      !/<\/urlset>\s*$/.test(body)) return null;
  const $ = cheerio.load(body, { xmlMode: true });
  if ($("urlset").length !== 1 || $("urlset").parent().length !== 0 || $("sitemapindex").length) return null;
  const urls = new Set<string>();
  for (const entry of $("urlset > url").toArray()) {
    const loc = $(entry).children("loc").first().text().trim();
    const product = shopifyProductLead(loc, job.origin);
    if (!product) continue;
    urls.add(product);
    if (urls.size > 100) return null;
  }
  return [...urls].map(url => ({ kind: "storefront_product", url }));
}

/** Curated community collections and repositories.txt feed parser. */
export function parseCuratedDiscoveryLeads(job: CrawlJob, body: string, contentType: string = ""): DiscoveryLead[] | null {
  if (job.platform !== "curated" || job.purpose !== "discovery") return null;

  // 1. Try JSON recipe / manifest list first
  const recipeLeads = parseVpmListingRecipe(job, body);
  if (recipeLeads && recipeLeads.length > 0) return recipeLeads;

  // 2. Text-based repositories.txt (newline delimited HTTPS URLs)
  const leads: DiscoveryLead[] = [];
  const lines = body.split(/[\r\n]+/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    try {
      const parsed = new URL(line);
      if (parsed.protocol === "https:") {
        if (parsed.hostname === "github.com" && /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(parsed.pathname)) {
          leads.push({ kind: "github_repository", url: parsed.href });
        } else if (parsed.pathname.endsWith(".json")) {
          leads.push({ kind: "vpm_listing", url: parsed.href });
        }
      }
    } catch {}
    if (leads.length >= 100) break;
  }

  // 3. If HTML / Markdown, extract github and vpm links
  if (leads.length === 0 && (contentType.includes("html") || body.includes("<html") || body.includes("http"))) {
    const urlMatches = body.match(/https:\/\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.~!$&'()*+,;=:@%-]+)+/g) || [];
    for (const match of urlMatches) {
      try {
        const parsed = new URL(match);
        if (parsed.hostname === "github.com") {
          const m = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/.exec(parsed.pathname);
          if (m && m[1] !== "topics" && m[1] !== "search") {
            leads.push({ kind: "github_repository", url: `https://github.com/${m[1]}/${m[2]}` });
          }
        } else if (parsed.pathname.endsWith("/index.json") || parsed.pathname.endsWith("/vpm.json") || parsed.pathname.endsWith("/packages.json")) {
          leads.push({ kind: "vpm_listing", url: parsed.href });
        }
      } catch {}
      if (leads.length >= 100) break;
    }
  }

  if (leads.length === 0) return null;
  const unique = [...new Map(leads.map(l => [`${l.kind}:${l.url}`, l])).values()];
  return unique.slice(0, 100);
}

export async function fetchJobOutcome(job: CrawlJob,
  fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
  authoritySignal?: AbortSignal,
  options?: { githubToken?: string }): Promise<Outcome> {
  const targetUrl = new URL(job.url);
  if ((job.platform === "github" || targetUrl.hostname === "api.github.com") &&
      (job.platform !== "github" || !githubApiRepositoryIdentity(job.url))) {
    return { kind: "blocked", reason: "GitHub jobs require a public REST repository metadata endpoint" };
  }
  if (job.platform === "booth") {
    if (job.purpose === "discovery" && !isBoothBrowseTarget(job.url)) {
      return { kind: "blocked", reason: "BOOTH discovery requires a browse URL" };
    }
    if (job.purpose === "metadata" && !boothItemIdentity(job.url)) {
      return { kind: "blocked", reason: "BOOTH metadata requires an item URL" };
    }
  }
  if (job.platform === "shopify") {
    if (job.purpose === "discovery" && !isShopifyProductSitemapTarget(job.url)) {
      return { kind: "blocked", reason: "Shopify discovery requires a product sitemap URL" };
    }
    if (job.purpose === "metadata" && !shopifyProductLead(job.url, job.origin)) {
      return { kind: "blocked", reason: "Shopify metadata requires a valid merchant product URL" };
    }
  }
  if (job.platform === "sellfy" && job.purpose === "metadata" && !isSellfyProductTarget(job.url)) {
    return { kind: "blocked", reason: "Sellfy metadata requires a valid product URL" };
  }
  if (job.platform === "custom_domain" && job.purpose === "metadata" && !isCustomDomainProductTarget(job.url)) {
    return { kind: "blocked", reason: "Custom domain metadata requires a valid path" };
  }
  const isGitHubApi = job.platform === "github" && targetUrl.origin === "https://api.github.com";
  const githubToken = isGitHubApi
    ? (options?.githubToken !== undefined
        ? (options.githubToken.trim() || undefined)
        : (process.env.GITHUB_TOKEN || process.env.GH_TOKEN)?.trim())
    : undefined;
  try {
    const response = await fetcher(job.url, {
      headers: {
        "user-agent": CRAWLER_USER_AGENT,
        "accept": job.platform === "github" ? "application/vnd.github+json" :
          job.platform === "shopify" ? "application/xml,text/xml;q=0.9,*/*;q=0.5" :
          "application/json,text/html;q=0.9,*/*;q=0.5",
        ...(job.platform === "github" ? { "x-github-api-version": "2026-03-10" } : {}),
        ...(githubToken ? { "authorization": `Bearer ${githubToken}` } : {}),
        ...(job.etag ? { "if-none-match": job.etag } : {}),
        ...(job.lastModified ? { "if-modified-since": job.lastModified } : {})
      },
      signal: authoritySignal ? AbortSignal.any([authoritySignal, AbortSignal.timeout(25_000)]) :
        AbortSignal.timeout(25_000), redirect: "error"
    });
    const headerFailure = classifyAccessFailure(response);
    if (headerFailure === "challenge") return { kind: "blocked", reason: "Challenge response" };
    if (headerFailure === "rate_limited") return { kind: "rate_limited", retryAfterSeconds: retryAfterSeconds(response.headers) };
    if (job.platform === "github" && response.status === 403 && headerFailure === "forbidden") {
      const errorBody = await boundedText(response, 10_000);
      if (/secondary rate limit|abuse detection/i.test(errorBody)) {
        return { kind: "rate_limited", retryAfterSeconds: Math.max(60, retryAfterSeconds(response.headers, 60)) };
      }
      return { kind: "blocked", reason: "HTTP 403" };
    }
    if (headerFailure === "forbidden" || response.status === 401) return { kind: "blocked", reason: `HTTP ${response.status}` };
    if (response.status === 304) return { kind: "unchanged" };
    if (response.status >= 300 && response.status < 400) return { kind: "blocked", reason: "Redirect requires source review" };
    if (response.status === 404 || response.status === 410) return { kind: "gone" };
    if (!response.ok) return { kind: "temporary_failure", reason: `HTTP ${response.status}` };
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 2_000_000) return { kind: "temporary_failure", reason: "Response over 2 MB" };
    const body = await boundedText(response);
    if (classifyAccessFailure(response, body.slice(0, 5000)) === "challenge") {
      return { kind: "blocked", reason: "Challenge response" };
    }
    if (job.platform === "booth" && job.purpose === "discovery") {
      if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        return { kind: "temporary_failure", reason: "BOOTH browse response was not HTML" };
      }
      const leads = parseBoothBrowseLeads(job, body);
      return leads ? { kind: "discovery", leads } :
        { kind: "temporary_failure", reason: "BOOTH browse exceeds one bounded lead batch" };
    }
    if (job.platform === "shopify" && job.purpose === "discovery") {
      if (!/^(?:application|text)\/xml\b/i.test(response.headers.get("content-type") || "")) {
        return { kind: "temporary_failure", reason: "Shopify sitemap response was not XML" };
      }
      const leads = parseShopifyProductSitemapLeads(job, body);
      return leads ? { kind: "discovery", leads } :
        { kind: "temporary_failure", reason: "Shopify product sitemap was malformed or exceeds one bounded lead batch" };
    }
    if (job.platform === "curated" && job.purpose === "discovery") {
      const leads = parseCuratedDiscoveryLeads(job, body, response.headers.get("content-type") || "");
      return leads ? { kind: "discovery", leads } :
        { kind: "temporary_failure", reason: "Curated discovery exceeds one bounded lead batch" };
    }
    if (job.platform === "vpm") {
      const parsed = parseVpmRepositoryEvidence(job, body);
      if (parsed) {
        const outcome: Outcome = parsed.issues.length > 0
          ? { kind: "partial_batch", observations: parsed.observations, issues: parsed.issues }
          : { kind: "batch", observations: parsed.observations };
        return JSON.stringify(outcome).length <= 240_000 ? outcome :
          { kind: "temporary_failure", reason: "Repository exceeds one bounded result batch" };
      }
      const leads = parseVpmListingRecipe(job, body);
      if (leads) {
        const outcome: Outcome = { kind: "discovery", leads };
        return JSON.stringify(outcome).length <= 240_000 ? outcome :
          { kind: "temporary_failure", reason: "Recipe exceeds one bounded discovery batch" };
      }
    }
    const observation = parseObservation(job, body, response.headers.get("content-type") || "");
    return observation ? { kind: "changed", observation } : { kind: "temporary_failure", reason: "No item observation in response" };
  } catch (error) {
    if (authoritySignal?.aborted) throw new Error("Fetch cancelled because coordinator authority was lost");
    if (error instanceof UnsafeMetadataTarget) return { kind: "blocked", reason: error.message.slice(0, 300) };
    return { kind: "temporary_failure", reason: String(error).slice(0, 300) };
  }
}
