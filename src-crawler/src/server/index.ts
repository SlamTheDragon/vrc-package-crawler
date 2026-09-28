import { Database } from "bun:sqlite";
import crypto from "crypto";
import dns from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import { logger } from "../utils/logger.ts";
import { db, type CrawlerDB } from "../db/db.ts";
import { CONFIG } from "../config.ts";
import { validateSchema4Payload } from "../shared/report_validation.ts";
export { validateSchema4Payload } from "../shared/report_validation.ts";
import { isPrivateOrReservedIp } from "../shared/ip_policy.ts";
export { isPrivateOrReservedIp } from "../shared/ip_policy.ts";

export interface ServerConfig {
  port?: number;
  host?: string;
  apiToken?: string;
  db?: CrawlerDB;
}

const originalFetch = globalThis.fetch;

export async function fetchWithPinnedIp(
  targetUrl: string,
  options: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    maxBytes?: number;
  } = {}
): Promise<{ status: number; statusText: string; headers: Headers; body: Buffer }> {
  const parsed = new URL(targetUrl);
  const cleanHostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const lookup = await dns.lookup(cleanHostname);

  if (isPrivateOrReservedIp(lookup.address)) {
    throw new Error(`SSRF blocked: Hostname '${parsed.hostname}' resolves to private/reserved IP ${lookup.address}`);
  }

  // If fetch is mocked (e.g. in testbed execution), dispatch through globalThis.fetch
  if (globalThis.fetch !== originalFetch) {
    const resp = await globalThis.fetch(targetUrl, {
      signal: options.signal,
      headers: options.headers,
      redirect: "manual"
    });
    const ab = await resp.arrayBuffer();
    if (options.maxBytes && ab.byteLength > options.maxBytes) {
      throw new Error(`Response exceeded maximum allowed size of ${options.maxBytes} bytes`);
    }
    return {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
      body: Buffer.from(ab)
    };
  }

  // Live production runtime: connect directly to pinned IP with TLS SNI servername (OVERLOOKED-2)
  return new Promise((resolve, reject) => {
    const isHttps = parsed.protocol === "https:";
    const transport = isHttps ? https : http;
    const port = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);
    const headers = { ...options.headers, Host: parsed.hostname };

    const req = transport.request({
      host: lookup.address,
      port,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers,
      servername: isHttps ? cleanHostname : undefined,
    }, (res) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      res.on("data", (chunk) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buf);
        totalBytes += buf.length;
        if (options.maxBytes && totalBytes > options.maxBytes) {
          const err = new Error(`Response exceeded maximum allowed size of ${options.maxBytes} bytes`);
          res.destroy(err);
          req.destroy(err);
        }
      });
      res.on("error", (err) => {
        reject(err);
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const respHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) {
            for (const item of v) respHeaders.append(k, item);
          } else if (v !== undefined) {
            respHeaders.set(k, v);
          }
        }
        resolve({
          status: res.statusCode || 200,
          statusText: res.statusMessage || "OK",
          headers: respHeaders,
          body
        });
      });
    });

    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        req.destroy(new Error("Request aborted"));
      });
    }

    req.on("error", reject);
    req.end();
  });
}

/** Follow only same-origin HTTPS storefront redirects, re-resolving and pinning every hop. */
export async function fetchStorefrontProofWithRedirects(
  storefrontUrl: string,
  options: { signal?: AbortSignal; headers?: Record<string, string>; maxBytes?: number } = {}
): ReturnType<typeof fetchWithPinnedIp> {
  const origin = new URL(storefrontUrl).origin;
  let currentUrl = storefrontUrl;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchWithPinnedIp(currentUrl, options);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new Error("Storefront redirect missing location or exceeded three hops");
    const next = new URL(location, currentUrl);
    if (next.protocol !== "https:" || next.origin !== origin || next.username || next.password) {
      throw new Error("Storefront redirect must remain on the original HTTPS origin");
    }
    currentUrl = next.href;
  }
  throw new Error("Storefront redirect limit reached");
}

// In-memory sliding window rate limiter
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  constructor(
    private readonly maxRequests: number = 10,
    private readonly windowMs: number = 60 * 1000
  ) {}

  public isAllowed(fingerprint: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(fingerprint) || [];
    const recent = timestamps.filter(t => now - t < this.windowMs);
    if (recent.length >= this.maxRequests) {
      this.requests.set(fingerprint, recent);
      return false;
    }
    recent.push(now);
    this.requests.set(fingerprint, recent);
    return true;
  }
}

export function parseServerArgs(argv: string[] = process.argv.slice(2)): Partial<ServerConfig> {
  const config: Partial<ServerConfig> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(`
VRChat Package Crawler - Headless HTTP REST Gateway
Usage:
  vrc-server.exe [options]
  bun run server [options]

Options:
  --port, -p <number>     Port to bind HTTP server (default: 8080 or PORT env var)
  --host, -H <string>     Host IP interface (default: 0.0.0.0 or HOST env var)
  --token <string>        Secret API token for authorized endpoints
  --help, -h              Show this help message
`);
      process.exit(0);
    } else if ((arg === "--port" || arg === "-p") && i + 1 < argv.length) {
      config.port = parseInt(argv[++i], 10);
    } else if ((arg === "--host" || arg === "-H") && i + 1 < argv.length) {
      config.host = argv[++i];
    } else if (arg === "--token" && i + 1 < argv.length) {
      config.apiToken = argv[++i];
    }
  }
  return config;
}

export function startServer(config: ServerConfig = {}) {
  const port = config.port || parseInt(process.env.PORT || process.env.API_PORT || "8080", 10);
  const host = config.host || process.env.HOST || process.env.API_HOST || "0.0.0.0";
  // An explicitly empty token disables protected routes, even if the environment has one.
  const apiToken = (config.apiToken ?? process.env.API_SECRET_TOKEN ?? CONFIG.apiSecretToken).trim();
  const targetDb = config.db || db;

  const reportRateLimiter = new RateLimiter(10, 60 * 1000);
  const optOutRateLimiter = new RateLimiter(5, 60 * 1000);
  const startTime = Date.now();

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // CORS Preflight & Headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Fingerprint",
        "Access-Control-Max-Age": "86400"
      };

      // Downstream Terms of Use notice headers (LEGAL.md §10.1, §11.1, RFC 6648, RFC 8288, RFC 9110)
      const termsHeaders = {
        "VRC-Packages-Terms-Of-Use": "https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md",
        "VRC-Packages-Terms-Version": "1.1",
        "VRC-Packages-Repository": "https://github.com/SlamTheDragon/vrc-package-crawler",
        "VRC-Packages-License": "Layer-A: AGPL-3.0 / Layer-B: Database Compilation Terms / Layer-C: Third-Party Origin Rights",
        "Link": '<https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md>; rel="terms-of-service"',
        "X-Robots-Tag": "noai, noimageai"
      };

      const baseHeaders = {
        ...corsHeaders,
        ...termsHeaders
      };

      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: baseHeaders });
      }

      // --- GET / (Root API Discovery Route) ---
      if (method === "GET" && (path === "/" || path === "")) {
        return new Response(JSON.stringify({
          name: "vrc-package-crawler API Gateway",
          version: "1.1.0",
          repository: "https://github.com/SlamTheDragon/vrc-package-crawler",
          terms_of_use: "https://github.com/SlamTheDragon/vrc-package-crawler/blob/main/LEGAL.md",
          license: "Layer-A: AGPL-3.0 / Layer-B: Database Compilation Terms / Layer-C: Origin Author Rights",
          endpoints: {
            health: "/v1/health",
            packages_stream: "/v1/packages/stream",
            catalog_delta: "/v1/catalog/delta",
            reports: "/v1/reports",
            opt_out: "/v1/opt-out",
            telemetry: "/v1/telemetry",
            media_stream: "/v1/media/stream"
          }
        }, null, 2), {
          status: 200,
          headers: {
            ...baseHeaders,
            "Content-Type": "application/json; charset=utf-8"
          }
        });
      }

      // --- GET /v1/health ---
      if (method === "GET" && path === "/v1/health") {
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const metrics = targetDb.getMetrics();
        return new Response(JSON.stringify({
          status: "healthy",
          version: "2.0.0",
          uptimeSeconds: uptime,
          metrics,
          timestamp: new Date().toISOString()
        }), { status: 200, headers: { ...baseHeaders, "Content-Type": "application/json" } });
      }

      // --- GET /v1/media/stream (Ephemeral In-Memory Streaming Proxy - Task 3.2) ---
      if (method === "GET" && path === "/v1/media/stream") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
          return new Response(JSON.stringify({
            error: "Missing required 'url' query parameter"
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        let parsedMediaUrl: URL;
        try {
          parsedMediaUrl = new URL(targetUrl);
        } catch {
          return new Response(JSON.stringify({
            error: "Invalid URL parameter"
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        if (parsedMediaUrl.protocol !== "https:") {
          return new Response(JSON.stringify({
            error: "Invalid URL: Scheme must be https"
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        // Origin Host Whitelist: *.pximg.net, public-files.gumroad.com, assets.jinxxy.com, raw.githubusercontent.com, img.itch.zone
        const allowedCdnRegex = /^(?:[a-zA-Z0-9_-]+\.)*(?:pximg\.net|gumroad\.com|jinxxy\.com|raw\.githubusercontent\.com|itch\.zone)$/i;
        if (!allowedCdnRegex.test(parsedMediaUrl.hostname)) {
          return new Response(JSON.stringify({
            error: "Forbidden: Origin host not in media CDN whitelist"
          }), { status: 403, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 8000);

        let originResp: { status: number; statusText: string; headers: Headers; body: Buffer };
        try {
          originResp = await fetchWithPinnedIp(parsedMediaUrl.href, {
            signal: abortController.signal,
            headers: {
              "User-Agent": CONFIG.userAgent,
              "Accept": "image/webp,image/avif,image/*;q=0.8",
              "Referer": "" // strip referrers to bypass storefront hotlink blocks
            },
            maxBytes: 15 * 1024 * 1024
          });
        } catch (err: any) {
          clearTimeout(timeoutId);
          if (err.message && err.message.includes("SSRF blocked")) {
            return new Response(JSON.stringify({
              error: "Bad Request: SSRF blocked - origin hostname resolves to a private or reserved IP address."
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({
            error: "Bad Gateway: Origin CDN request failed or timed out"
          }), { status: 502, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        } finally {
          clearTimeout(timeoutId);
        }

        if (originResp.status === 404) {
          return new Response(JSON.stringify({
            error: "Media not found on origin CDN"
          }), { status: 404, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        if (originResp.status < 200 || originResp.status >= 300) {
          return new Response(JSON.stringify({
            error: `Bad Gateway: Origin CDN returned HTTP ${originResp.status}`
          }), { status: 502, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        const inputBuffer = originResp.body;

        if (inputBuffer.length > 15 * 1024 * 1024) {
          return new Response(JSON.stringify({
            error: "Payload Too Large: Origin media exceeds 15MB limit"
          }), { status: 413, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        let outBuffer: Buffer = inputBuffer;
        let contentType = originResp.headers.get("content-type") || "image/webp";

        try {
          let sharpModule: any = null;
          try { sharpModule = (await import("sharp")).default; } catch (_) {}
          if (sharpModule) {
            outBuffer = await sharpModule(inputBuffer)
              .resize({ width: 800, withoutEnlargement: true })
              .webp({ quality: 75 })
              .toBuffer();
            contentType = "image/webp";
          }
        } catch (_) {}

        return new Response(outBuffer, {
          status: 200,
          headers: {
            ...baseHeaders,
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=86400, stale-while-revalidate=3600",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }

      // --- GET /v1/media/:id or /v1/thumbs/:id (Low-Resolution WebP Proxy) ---
      if (method === "GET" && (path.startsWith("/v1/media/") || path.startsWith("/v1/thumbs/"))) {
        const mediaId = path.split("/").pop()?.replace(/\.webp$/, "");
        if (mediaId && mediaId !== "none") {
          const row = targetDb.rawDb.prepare("SELECT source_url FROM media_cache WHERE id = ?;").get(mediaId) as any;
          if (row?.source_url) {
            // Redirect to original origin CDN URL (Server Test / pure origin pointer)
            return Response.redirect(row.source_url, 302);
          }
        }
        return new Response(JSON.stringify({ error: "Media not found" }), { status: 404, headers: { ...baseHeaders, "Content-Type": "application/json" } });
      }

      // --- POST /v1/reports (Schema 4 Ingestion) ---
      if (method === "POST" && path === "/v1/reports") {
        // Administrative Auth Check (Task 2.2):
        // Must supply valid Bearer token matching API_SECRET_TOKEN.
        // If API_SECRET_TOKEN is unset or token is invalid, fail with 401 Unauthorized.
        const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
        if (!apiToken || !authHeader.startsWith("Bearer ")) {
          return new Response(JSON.stringify({
            error: "Unauthorized: Administrative bearer token required"
          }), { status: 401, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }
        const providedToken = authHeader.slice(7).trim();
        const tokenBuffer = Buffer.from(providedToken);
        const expectedBuffer = Buffer.from(apiToken);
        if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
          return new Response(JSON.stringify({
            error: "Unauthorized: Invalid administrative bearer token"
          }), { status: 401, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        // Rate limiting by IP / Fingerprint
        const clientIp = req.headers.get("cf-connecting-ip") ||
                         req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                         req.headers.get("x-real-ip") ||
                         server.requestIP(req)?.address ||
                         "unknown-client";
        const clientFingerprint = req.headers.get("x-client-fingerprint") || clientIp;

        if (!reportRateLimiter.isAllowed(clientFingerprint)) {
          return new Response(JSON.stringify({
            error: "Too Many Requests: Rate limit of 10 reports per minute exceeded."
          }), { status: 429, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        let body: any;
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({
            error: "Bad Request: Malformed JSON payload."
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        const validation = validateSchema4Payload(body);
        if (!validation.valid) {
          return new Response(JSON.stringify({
            error: "Schema 4 Validation Failed",
            details: validation.errors
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        const inserted = targetDb.insertReport({
          reportId: body.reportId,
          targetPackageId: body.targetPackageId,
          targetPackageName: body.targetPackageName,
          branch: body.branch,
          branchPayload: body.branchPayload,
          reporterNotes: body.reporterNotes || null,
          clientFingerprint,
          trustTier: body.trustTier || "anonymous",
          submittedAt: body.submittedAt
        });

        if (!inserted) {
          return new Response(JSON.stringify({
            error: "Internal Server Error: Failed to queue report into user_reports."
          }), { status: 500, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({
          success: true,
          reportId: body.reportId,
          status: "pending",
          message: "Steering report queued for autonomous processing loop."
        }), { status: 201, headers: { ...baseHeaders, "Content-Type": "application/json" } });
      }

      // --- POST /v1/opt-out (Creator & Rights-Holder Automated Non-Scraping Delisting - Task 3.1) ---
      if (method === "POST" && path === "/v1/opt-out") {
        const clientIp = req.headers.get("cf-connecting-ip") ||
                         req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                         req.headers.get("x-real-ip") ||
                         server.requestIP(req)?.address ||
                         "unknown-client";

        if (!optOutRateLimiter.isAllowed(clientIp)) {
          return new Response(JSON.stringify({
            error: "Too Many Requests: Rate limit of 5 opt-out verification requests per minute exceeded."
          }), { status: 429, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        let body: any;
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({
            error: "Bad Request: Malformed JSON payload."
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        const { vendorId, proofType, proofValue, storefrontUrl } = body || {};

        if (!vendorId || typeof vendorId !== "string" || !vendorId.trim()) {
          return new Response(JSON.stringify({
            error: "Bad Request: 'vendorId' is required and must be a non-empty string."
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        if (!proofType || !["dns_txt", "storefront_bio_token", "signed_commit"].includes(proofType)) {
          return new Response(JSON.stringify({
            error: "Bad Request: 'proofType' must be one of 'dns_txt', 'storefront_bio_token', or 'signed_commit'."
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        if (!proofValue || typeof proofValue !== "string" || !proofValue.trim()) {
          return new Response(JSON.stringify({
            error: "Bad Request: 'proofValue' is required and must be a non-empty string."
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        const cleanVendorId = vendorId.trim();

        // Verification Logic
        if (proofType === "dns_txt") {
          const domain = proofValue.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
          if (!domain || !domain.includes(".") || /[^a-z0-9.-]/i.test(domain)) {
            return new Response(JSON.stringify({
              error: "Bad Request: 'proofValue' for dns_txt must be a valid domain name."
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          }

          try {
            const txtRecords = await dns.resolveTxt(`_vrc-opt-out.${domain}`);
            const expectedRecord = `vrc-opt-out=${cleanVendorId}`;
            const matched = txtRecords.some(chunkArr => {
              const recStr = Array.isArray(chunkArr) ? chunkArr.join("") : String(chunkArr);
              const tokens = recStr.split(/[\s;]+/);
              return tokens.includes(expectedRecord) || recStr.trim() === expectedRecord;
            });
            if (!matched) {
              return new Response(JSON.stringify({
                error: `DNS verification failed: TXT record '_vrc-opt-out.${domain}' did not contain '${expectedRecord}'.`
              }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
            }
          } catch (err: any) {
            return new Response(JSON.stringify({
              error: `DNS lookup failed for _vrc-opt-out.${domain}: ${err?.code || err?.message || String(err)}`
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          }
        } else if (proofType === "storefront_bio_token") {
          if (!storefrontUrl || typeof storefrontUrl !== "string") {
            return new Response(JSON.stringify({
              error: "Bad Request: 'storefrontUrl' is required for proofType 'storefront_bio_token'."
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          }

          let parsedStorefront: URL;
          try {
            parsedStorefront = new URL(storefrontUrl.trim());
          } catch {
            return new Response(JSON.stringify({
              error: "Bad Request: 'storefrontUrl' must be a valid URL."
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          }

          if (parsedStorefront.protocol !== "https:") {
            return new Response(JSON.stringify({
              error: "Bad Request: 'storefrontUrl' scheme must be https."
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          }

          const allowedStorefrontRegex = /^https:\/\/([a-zA-Z0-9_-]+\.)*(booth\.pm|gumroad\.com|jinxxy\.com)\//i;
          if (!allowedStorefrontRegex.test(parsedStorefront.href)) {
            return new Response(JSON.stringify({
              error: "Bad Request: 'storefrontUrl' host must match authorized storefront domains (booth.pm, gumroad.com, jinxxy.com)."
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          }

          const expectedToken = proofValue.trim();
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), 5000);

          let foundToken = false;
          try {
            const probeResp = await fetchStorefrontProofWithRedirects(parsedStorefront.href, {
              signal: abortController.signal,
              headers: {
                "User-Agent": "VRCDiscoveryBot/1.0 (+https://github.com/SlamTheDragon/vrc-package-crawler; slamthedragon@gmail.com; verification-probe)",
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
              },
              maxBytes: 512 * 1024
            });

            if (probeResp.status < 200 || probeResp.status >= 300) {
              clearTimeout(timeoutId);
              return new Response(JSON.stringify({
                error: `Storefront probe failed: HTTP ${probeResp.status} ${probeResp.statusText}`
              }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
            }

            const html = probeResp.body.toString("utf-8");
            if (html.includes(expectedToken)) {
              foundToken = true;
            }
          } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.message && err.message.includes("SSRF blocked")) {
              return new Response(JSON.stringify({
                error: "Bad Request: SSRF blocked - storefront hostname resolves to a private or reserved IP address."
              }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
            }
            return new Response(JSON.stringify({
              error: `Storefront probe failed or timed out: ${err?.message || String(err)}`
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          } finally {
            clearTimeout(timeoutId);
          }

          if (!foundToken) {
            return new Response(JSON.stringify({
              error: `Verification failed: Token '${expectedToken}' was not found in storefront profile bio at ${parsedStorefront.href}.`
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          }
        } else if (proofType === "signed_commit") {
          let validSig = false;
          try {
            const sigData = JSON.parse(proofValue);
            if (sigData.publicKey && sigData.signature) {
              const verifier = crypto.createVerify("SHA256");
              verifier.update(sigData.message || cleanVendorId);
              verifier.end();
              validSig = verifier.verify(sigData.publicKey, Buffer.from(sigData.signature, "hex"));
            }
          } catch (_) {
            validSig = false;
          }

          if (!validSig) {
            return new Response(JSON.stringify({
              error: "Verification failed: Invalid cryptographic commit signature or public key format."
            }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
          }
        }

        // Register in DB & delist matching canonical packages
        const escapedVendorRegex = `^${cleanVendorId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
        let optOutPlatform = "all";
        if (proofType === "storefront_bio_token" && storefrontUrl) {
          const lowerUrl = storefrontUrl.toLowerCase();
          if (lowerUrl.includes("booth.pm")) optOutPlatform = "booth";
          else if (lowerUrl.includes("gumroad.com")) optOutPlatform = "gumroad";
          else if (lowerUrl.includes("jinxxy.com")) optOutPlatform = "jinxxy";
        }
        targetDb.registerOptOut(cleanVendorId, optOutPlatform, escapedVendorRegex, `Automated creator opt-out verified via ${proofType}`, proofType);
        const delistedCount = targetDb.delistCreatorPackages(cleanVendorId, storefrontUrl);

        return new Response(JSON.stringify({
          success: true,
          vendorId: cleanVendorId,
          proofType,
          status: "opted_out",
          packagesDelisted: delistedCount,
          message: "Opt-out verified successfully. Matching packages delisted from canonical index."
        }), { status: 200, headers: { ...baseHeaders, "Content-Type": "application/json" } });
      }

      // --- GET /v1/catalog/delta & GET /v1/packages/stream (Schema 1 Delta Stream / Route Alias - OVERLOOKED-6) ---
      if (method === "GET" && (path === "/v1/catalog/delta" || path === "/v1/packages/stream")) {
        const cursorParam = url.searchParams.get("cursor") || "0";
        const limitParam = parseInt(url.searchParams.get("limit") || "50", 10);
        const limit = Math.min(Math.max(1, limitParam), 200);

        const cursorRowid = parseInt(cursorParam, 10) || 0;
        const deltaData = targetDb.getDeltaCanonicalPackages(cursorRowid, limit);

        const deltas = deltaData.packages.map((pkg) => {
          let action = "UPDATED";
          if (pkg.lifecycle === "dmca_removed" || pkg.lifecycle === "delisted") {
            action = "DELISTED";
          } else if (pkg.created_at === pkg.updated_at) {
            action = "ADDED";
          }

          let tags: string[] = [];
          try {
            tags = JSON.parse(pkg.tags_json || "[]");
          } catch (_) {}

          let mediaObj: any = undefined;
          if (pkg.media_id) {
            const mRow = targetDb.rawDb.prepare("SELECT source_url, blurhash FROM media_cache WHERE id = ?;").get(pkg.media_id) as any;
            mediaObj = {
              thumbnailUrl: mRow?.source_url || `${url.origin}/v1/media/${pkg.media_id}.webp`,
              sourceUrl: mRow?.source_url || undefined,
              blurhash: mRow?.blurhash || undefined
            };
          }

          // Deserialize media gallery and YouTube URL arrays
          let mediaUrls: string[] = [];
          let youtubeUrls: string[] = [];
          try { mediaUrls = JSON.parse(pkg.media_urls_json || "[]"); } catch (_) {}
          try { youtubeUrls = JSON.parse(pkg.youtube_urls_json || "[]"); } catch (_) {}

          return {
            action,
            canonicalId: pkg.canonical_id,
            timestamp: pkg.updated_at,
            package: {
              name: pkg.name,
              author: pkg.author,
              category: pkg.category,
              subcategory: pkg.subcategory,
              type: pkg.type,
              primaryPlatform: pkg.primary_platform,
              url: pkg.url,
              isVcc: Boolean(pkg.is_vcc),
              tags,
              media: mediaObj,
              mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
              youtubeUrls: youtubeUrls.length > 0 ? youtubeUrls : undefined,
              originCreatedAt: pkg.origin_created_at || null,
              originUpdatedAt: pkg.origin_updated_at || null,
              createdAtConfidence: pkg.created_at_confidence || "unknown",
              createdAt: pkg.created_at,
              updatedAt: pkg.updated_at
            }
          };

        });

        const digest = crypto.createHash("sha256").update(JSON.stringify(deltas)).digest("hex");

        const responsePayload = {
          cursor: String(cursorRowid),
          nextCursor: String(deltaData.nextCursor),
          generatedAt: new Date().toISOString(),
          deltaCount: deltas.length,
          sha256Digest: digest,
          deltas
        };

        return new Response(JSON.stringify(responsePayload), { status: 200, headers: { ...baseHeaders, "Content-Type": "application/json" } });
      }

      // A catalog of external VPM repositories is not itself an installable VPM
      // repository. Until verified upstream release evidence exists, do not mint
      // synthetic package versions or package URLs here.
      if (method === "GET" && (path === "/v1/vpm/index.json" || path === "/index.json")) {
        return new Response(JSON.stringify({ error: "This catalog does not publish installable VPM packages. Follow verified upstream repository links in the catalog instead.", catalog: "/v1/catalog/delta" }),
          { status: 410, headers: { ...baseHeaders, "Content-Type": "application/json" } });
      }

      // --- POST /v1/telemetry (Schema 5 Interaction & Search Telemetry - CANON-5, Task 4.3) ---
      if (method === "POST" && path === "/v1/telemetry") {
        // Administrative Bearer Auth (Task 1.1, Task 4.3)
        const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
        if (!apiToken || !authHeader.startsWith("Bearer ")) {
          return new Response(JSON.stringify({
            error: "Unauthorized: Administrative bearer token required"
          }), { status: 401, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }
        const providedToken = authHeader.slice(7).trim();
        const tokenBuffer = Buffer.from(providedToken);
        const expectedBuffer = Buffer.from(apiToken);
        if (tokenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
          return new Response(JSON.stringify({
            error: "Unauthorized: Invalid administrative bearer token"
          }), { status: 401, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        let body: any;
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({
            error: "Bad Request: Malformed JSON payload."
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        if (!body || typeof body !== "object") {
          return new Response(JSON.stringify({
            error: "Bad Request: Payload must be a JSON object"
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        if (!body.batchId || typeof body.batchId !== "string" || !body.collectedAt || typeof body.collectedAt !== "string" || !body.metrics || typeof body.metrics !== "object") {
          return new Response(JSON.stringify({
            error: "Bad Request: Missing required Schema 5 fields ('batchId', 'collectedAt', 'metrics')"
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        const { searchQueries, packageInteractions } = body.metrics;
        if (!Array.isArray(searchQueries) || !Array.isArray(packageInteractions)) {
          return new Response(JSON.stringify({
            error: "Bad Request: 'metrics.searchQueries' and 'metrics.packageInteractions' must be arrays"
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        // Schema 5 Privacy & Anti-PII Invariant (LEGAL §8.5, REPORTING_SCHEMAS §6)
        const prohibitedKeyRegex = /^(user_?id|session_?id|client_?ip|ip_address|user_?email|password|cookie|fingerprint|auth_token|token)$/i;
        const emailValueRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const ipv4ValueRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/;

        function scanForPii(obj: any, path: string = ""): string | null {
          if (!obj || typeof obj !== "object") return null;
          for (const [key, value] of Object.entries(obj)) {
            if (prohibitedKeyRegex.test(key)) {
              return `Prohibited tracker/PII key '${key}' detected at ${path || "root"}`;
            }
            if (typeof value === "string") {
              if (emailValueRegex.test(value)) {
                return `Email address detected in value at ${path ? path + "." + key : key}`;
              }
              if (ipv4ValueRegex.test(value) && (key.toLowerCase().includes("ip") || key.toLowerCase().includes("client"))) {
                return `IP address detected in value at ${path ? path + "." + key : key}`;
              }
            } else if (typeof value === "object") {
              const err = scanForPii(value, path ? `${path}.${key}` : key);
              if (err) return err;
            }
          }
          return null;
        }

        const piiError = scanForPii(body);
        if (piiError) {
          return new Response(JSON.stringify({
            error: `Schema 5 Privacy Violation: ${piiError}. Anonymous metrics only.`
          }), { status: 400, headers: { ...baseHeaders, "Content-Type": "application/json" } });
        }

        // Ingest aggregated search queries into search_patterns
        let processedQueries = 0;
        for (const sq of searchQueries) {
          if (sq && typeof sq.query === "string" && sq.query.trim()) {
            targetDb.upsertSearchPattern({
              query: sq.query.trim(),
              queryIntent: sq.suggestedCategory ? `Category: ${sq.suggestedCategory}` : null,
              relevanceVote: sq.zeroResults ? "suppress" : "boost",
              negativeTokens: [],
              suggestedSeeds: [],
              weight: typeof sq.count === "number" && sq.count > 0 ? sq.count : 1.0
            });
            processedQueries++;
          }
        }

        return new Response(JSON.stringify({
          success: true,
          batchId: body.batchId,
          processedQueries,
          processedInteractions: packageInteractions.length,
          message: "Schema 5 telemetry batch ingested successfully"
        }), { status: 200, headers: { ...baseHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { ...baseHeaders, "Content-Type": "application/json" } });
    }
  });

  logger.info(`[Server] Headless API Gateway running on http://${host}:${port}`);
  return server;
}

if (import.meta.main) {
  const cliConfig = parseServerArgs();
  startServer(cliConfig);
}
