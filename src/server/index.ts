import { Database } from "bun:sqlite";
import crypto from "crypto";
import { logger } from "../logger.ts";
import { db, type CrawlerDB } from "../db.ts";

export interface ServerConfig {
  port?: number;
  host?: string;
  apiToken?: string;
  db?: CrawlerDB;
}

// In-memory sliding window rate limiter: 10 reports per minute per fingerprint
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly maxRequests = 10;
  private readonly windowMs = 60 * 1000;

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

export function validateSchema4Payload(body: any): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  if (!body || typeof body !== "object") {
    return { valid: false, errors: ["Request body must be a valid JSON object."] };
  }

  if (!body.reportId || typeof body.reportId !== "string") {
    errors.push("Field 'reportId' is required and must be a string.");
  }
  if (!body.targetPackageId || typeof body.targetPackageId !== "string") {
    errors.push("Field 'targetPackageId' is required and must be a string.");
  }
  if (!body.targetPackageName || typeof body.targetPackageName !== "string") {
    errors.push("Field 'targetPackageName' is required and must be a string.");
  }

  const validBranches = ["categorization", "irrelevance", "listing", "tags", "discovery_query"];
  if (!body.branch || !validBranches.includes(body.branch)) {
    errors.push(`Field 'branch' is required and must be one of: ${validBranches.join(", ")}.`);
  }

  if (!body.submittedAt || isNaN(Date.parse(body.submittedAt))) {
    errors.push("Field 'submittedAt' is required and must be an ISO 8601 date string.");
  }

  if (!body.branchPayload || typeof body.branchPayload !== "object") {
    errors.push("Field 'branchPayload' is required and must be an object.");
  } else {
    // Branch-specific validations
    switch (body.branch) {
      case "categorization":
        if (!body.branchPayload.suggestedClass) {
          errors.push("Branch 'categorization' requires 'branchPayload.suggestedClass'.");
        }
        break;
      case "irrelevance":
        if (!body.branchPayload.irrelevanceReason) {
          errors.push("Branch 'irrelevance' requires 'branchPayload.irrelevanceReason'.");
        }
        break;
      case "listing":
        if (!body.branchPayload.nameOverride && !body.branchPayload.correctedTitle && !body.branchPayload.correctedUrl && !body.branchPayload.correctedDescription) {
          errors.push("Branch 'listing' requires at least one of nameOverride, correctedTitle, correctedUrl, or correctedDescription.");
        }
        break;
      case "tags":
        if (!Array.isArray(body.branchPayload.addTags) && !Array.isArray(body.branchPayload.removeTags)) {
          errors.push("Branch 'tags' requires at least one array of 'addTags' or 'removeTags'.");
        }
        break;
      case "discovery_query":
        if (!body.branchPayload.searchQuery) {
          errors.push("Branch 'discovery_query' requires 'branchPayload.searchQuery'.");
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
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
  const apiToken = config.apiToken || process.env.API_SECRET_TOKEN;
  const targetDb = config.db || db;

  const rateLimiter = new RateLimiter();
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

      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
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
        }), { status: 200, headers: corsHeaders });
      }

      // --- GET /v1/media/:id or /v1/thumbs/:id (Low-Resolution WebP Proxy) ---
      if (method === "GET" && (path.startsWith("/v1/media/") || path.startsWith("/v1/thumbs/"))) {
        const mediaId = path.split("/").pop()?.replace(/\.webp$/, "");
        if (mediaId) {
          const row = targetDb.rawDb.prepare("SELECT webp_data, content_type FROM media_cache WHERE id = ?;").get(mediaId) as any;
          if (row && row.webp_data) {
            return new Response(row.webp_data, {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": row.content_type || "image/webp",
                "Cache-Control": "public, max-age=31536000, immutable"
              }
            });
          }
        }
        return new Response(JSON.stringify({ error: "Media not found" }), { status: 404, headers: corsHeaders });
      }

      // --- POST /v1/reports (Schema 4 Ingestion) ---
      if (method === "POST" && path === "/v1/reports") {
        // Optional Auth Check
        if (apiToken) {
          const authHeader = req.headers.get("Authorization") || "";
          const token = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (token !== apiToken) {
            return new Response(JSON.stringify({
              error: "Unauthorized: Invalid or missing API bearer token."
            }), { status: 401, headers: corsHeaders });
          }
        }

        // Rate limiting by IP / Fingerprint
        const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                         req.headers.get("x-real-ip") ||
                         req.headers.get("cf-connecting-ip") ||
                         server.requestIP(req)?.address ||
                         "unknown-client";
        const clientFingerprint = req.headers.get("x-client-fingerprint") || clientIp;

        if (!rateLimiter.isAllowed(clientFingerprint)) {
          return new Response(JSON.stringify({
            error: "Too Many Requests: Rate limit of 10 reports per minute exceeded."
          }), { status: 429, headers: corsHeaders });
        }

        let body: any;
        try {
          body = await req.json();
        } catch {
          return new Response(JSON.stringify({
            error: "Bad Request: Malformed JSON payload."
          }), { status: 400, headers: corsHeaders });
        }

        const validation = validateSchema4Payload(body);
        if (!validation.valid) {
          return new Response(JSON.stringify({
            error: "Schema 4 Validation Failed",
            details: validation.errors
          }), { status: 400, headers: corsHeaders });
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
          }), { status: 500, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
          success: true,
          reportId: body.reportId,
          status: "pending",
          message: "Steering report queued for autonomous processing loop."
        }), { status: 201, headers: corsHeaders });
      }

      // --- GET /v1/catalog/delta (Schema 1 Delta Stream) ---
      if (method === "GET" && path === "/v1/catalog/delta") {
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
            const mRow = targetDb.rawDb.prepare("SELECT blurhash FROM media_cache WHERE id = ?;").get(pkg.media_id) as any;
            mediaObj = {
              thumbnailUrl: `${url.origin}/v1/media/${pkg.media_id}.webp`,
              blurhash: mRow?.blurhash || undefined
            };
          }

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

        return new Response(JSON.stringify(responsePayload), { status: 200, headers: corsHeaders });
      }

      // --- GET /v1/vpm/index.json (Schema 2 VCC/ALCOM Repository Manifest) ---
      if (method === "GET" && (path === "/v1/vpm/index.json" || path === "/index.json")) {
        const vpmPackages = targetDb.getVpmPackages();

        const packagesObj: Record<string, any> = {};

        for (const p of vpmPackages) {
          const pkgId = p.id;
          let deps = {};
          try {
            deps = JSON.parse(p.dependencies_json || "{}");
          } catch (_) {}

          const defaultVersion = "1.0.0";

          packagesObj[pkgId] = {
            versions: {
              [defaultVersion]: {
                name: pkgId,
                version: defaultVersion,
                displayName: p.name,
                description: p.description || "",
                author: {
                  name: p.author,
                  url: p.github_url || p.url
                },
                url: p.vcc_url || p.url,
                vpmDependencies: deps
              }
            }
          };
        }

        const manifest = {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          name: "VRChat Community Asset Catalog",
          id: "net.vrc-catalog.community",
          url: `${url.origin}/v1/vpm/index.json`,
          author: "VRChat Community Indexers",
          description: "Decentralized VPM repository aggregating community tools and packages",
          packages: packagesObj
        };

        return new Response(JSON.stringify(manifest), { status: 200, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });
    }
  });

  logger.info(`[Server] Headless API Gateway running on http://${host}:${port}`);
  return server;
}

if (import.meta.main) {
  const cliConfig = parseServerArgs();
  startServer(cliConfig);
}
