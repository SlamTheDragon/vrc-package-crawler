import { type CrawlerRules, compileRobotsText } from "@trybyte/robotstxt-parser";
import { EnqueueJobRequestSchema, type EnqueueJobRequest } from "../../../../../src-package/src/protocol/operator.ts";
import { RevokeNodeRequestSchema, RevokeNodeResponseSchema, type RevokeNodeRequest } from "../../../../../src-package/src/protocol/operator.ts";
import { CRAWLER_ROBOTS_TOKEN } from "../../../../../src-crawler/src/shared/robots/crawler_identity.ts";
import { isPrivateOrReservedIp } from "../../../../../src-crawler/src/shared/policy/ip_policy.ts";
import { type Platform, type HeartbeatRequest, type HeartbeatResponse, PROTOCOL_VERSION, type ClaimRequest, type ClaimResponse, type ResultRequest, type ResultResponse, observationMatchesPlatform, ClaimRequestSchema, PlatformSchema, type DiscoveryLead } from "../../../../../src-crawler/src/shared/protocol/node_protocol.ts";
import { type AutoQueueRule, AutoQueueRuleSchema, type IssueNodeCredential, IssueNodeCredentialSchema, type LeadCursor, type LeadRow, encodeLeadCursor, type RuleCursor, encodeRuleCursor, type CreateAutoQueueRule, CreateAutoQueueRuleSchema, type CatalogCursor, type CatalogPackage, type CatalogIdentityLink, type PackageFront, encodeCatalogCursor, decodeCatalogCursor, encodeTakedownCursor, type TakedownCursor, type TakedownRecord } from "../../../../../src-crawler/src/shared/protocol/operator_protocol.ts";
import { robotsResultAllowsMissingFile, OriginRobotsSnapshotSchema, ROBOTS_REFRESH_LEASE_MS, type OriginRobotsSnapshot } from "../../../../../src-crawler/src/shared/robots/robots_snapshot.ts";
import { type SourceAccessProfile, SourceAccessProfileSchema, sourceAccessProfileMatches, type SourcePurpose, type ProfileCursor, encodeProfileCursor, type CreateSourceAccessProfile, CreateSourceAccessProfileSchema, sourcePathScopesOverlap } from "../../../../../src-crawler/src/shared/policy/source_access_profile.ts";
import { isItchSearchUrl } from "../../../../../src-crawler/src/shared/policy/source_path_policy.ts";
import { isBoothBrowseTarget, boothItemIdentity, isShopifyProductSitemapTarget, shopifyProductLead, githubApiRepositoryIdentity, isSellfyProductTarget } from "../../../../../src-crawler/src/shared/policy/source_targets.ts";
import { type CoordinatorStore, type NodePrincipal, CoordinatorConflict } from "../../api/handler.ts";
import type { OperatorStore } from "../../api/operator_handler.ts";
import type { PublicCatalogStore } from "../../api/public_handler.ts";
import { type CatalogDelta, type CatalogDeltaCursor, encodeCatalogDeltaCursor } from "../../../../../src-crawler/src/shared/protocol/catalog_protocol.ts";
import { formatCapabilityToken, parseCapabilityToken, isCapabilityToken } from "../../../../../src-crawler/src/shared/protocol/capability_token.ts";
import {
  RegisterAppRequestSchema,
  UserAppListQuerySchema, UserAppSchema, type UserAppListResponse,
  ReportSubmissionRequestSchema,
  type ReportSubmissionRequest,
  type ReportSubmissionResponse,
  DownstreamFeedbackRequestSchema,
  CatalogSearchRequestSchema,
  DOWNSTREAM_PROTOCOL_VERSION,
  type RegisterAppRequest,
  type RegisterAppResponse,
  type DownstreamFeedbackRequest,
  type DownstreamFeedbackResponse,
  type CatalogSearchRequest,
  type CatalogSearchResponse,
  type DelistResponse
} from "../../../../../src-crawler/src/shared/protocol/downstream_protocol.ts";
import type { UserStore } from "../../api/user_handler.ts";
import { D1_SCHEMA_SQL, sha256Hex, timingSafeEqual, generateToken, isIp } from "./utils.ts";
import { deriveCategoryFromTags, deriveUmbrellaFromTags, classifyDesktopTool, inferSupportedOS, type DesktopToolEvidence } from "../../../../../src-crawler/src/shared/taxonomy/taxonomy.ts";
import { extractAvatarCompatibility, type AvatarCompatibility } from "../../../../../src-crawler/src/shared/taxonomy/avatar_compatibility.ts";
import { cleanTitle, cleanTrackingParams } from "../../../../../src-crawler/src/utils/text/sanitizer.ts";
import { STOREFRONT_PLATFORMS } from "../../../../../src-crawler/src/shared/protocol/node_protocol.ts";
import { DEFAULT_SEED_JOBS } from "../default_seeds.ts";
import type {
  D1Database,
  D1PreparedStatement,
  JobRow,
  AutoQueueRuleRow,
  SourceAccessProfileRow,
  CanonicalUmbrella,
  CanonicalLifecycle,
  EvidenceKind,
  LinkReviewState,
  CanonicalPackage,
  IdentityLink
} from "./definitions.ts";

export function classifyOutboundLeadKind(targetUrl: string): DiscoveryLead["kind"] | null {
  try {
    const url = new URL(targetUrl);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password || (url.port && url.port !== "443")) return null;
    const pathLower = url.pathname.toLowerCase();
    if (pathLower.endsWith(".zip") || pathLower.endsWith(".unitypackage") || pathLower.endsWith(".tar.gz")) {
      return null;
    }
    if (url.hostname === "github.com") {
      const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/.*)?$/.exec(url.pathname);
      if (match && match[1] !== "." && match[2] !== ".") {
        return "github_repository";
      }
    }
    if (url.hostname === "booth.pm" || url.hostname === "gumroad.com" ||
        url.hostname === "jinxxy.com" || url.hostname.endsWith(".itch.io") ||
        url.hostname === "sellfy.com" || url.hostname === "payhip.com") {
      return "storefront_product";
    }
    if (!url.hostname.includes("localhost") && !url.hostname.endsWith(".internal") &&
        !url.hostname.endsWith(".local") && url.hostname.includes(".")) {
      return "publisher_site";
    }
    return null;
  } catch {
    return null;
  }
}

/** SQL predicates are repeated inside atomic writes, not just candidate reads. */
function approvedRobotsJobDelaySql(origin: string, now: string): string {
  return `(SELECT MAX(p.min_delay_ms) FROM crawl_jobs j JOIN source_access_profiles p
    ON p.platform=j.platform AND p.origin=j.origin AND p.purpose=j.job_purpose
    WHERE j.origin=${origin} AND j.next_fetch_at<=${now}
      AND (j.state IN ('pending','done','backoff') OR (j.state='leased' AND j.lease_expires_at<=${now}))
      AND NOT EXISTS (SELECT 1 FROM suppressed_urls s WHERE s.url=j.url)
      AND (j.source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules ar
        WHERE ar.rule_id=j.source_rule_id AND ar.disabled_at IS NULL AND ar.expires_at>${now}))
      AND p.disabled_at IS NULL AND p.expires_at>${now} AND instr(j.url,'#')=0
      AND ((p.query_scope IS NOT NULL AND j.url=p.origin||p.path_scope||'?'||p.query_scope)
        OR (p.query_scope IS NULL AND instr(j.url,'?')=0 AND
          (j.url=p.origin||p.path_scope OR (substr(p.path_scope,-1)='/' AND
            substr(j.url,1,length(p.origin||p.path_scope))=p.origin||p.path_scope)))))`;
}

export class Coordinator implements CoordinatorStore, OperatorStore, PublicCatalogStore, UserStore {
  private readonly robotsMatchers = new Map<string, { snapshotId: string; matcher: CrawlerRules; }>();

  constructor(
    readonly db: D1Database,
    readonly now: () => number = Date.now
  ) { }

  async seedInitialJobs(): Promise<void> {
    for (const job of DEFAULT_SEED_JOBS) {
      const existing = await this.db.prepare(`SELECT 1 FROM crawl_jobs WHERE url=?
        UNION ALL SELECT 1 FROM suppressed_urls WHERE url=? LIMIT 1`).bind(job.url, job.url).first();
      if (!existing) await this.seedJob(job.url, job.platform, job.minDelayMs, undefined, job.purpose);
    }
  }

  async initSchema(autoSeed: boolean = false): Promise<void> {
    await this.db.exec(D1_SCHEMA_SQL);
    try { await this.db.exec("ALTER TABLE canonical_packages ADD COLUMN published_at TEXT;"); } catch {}
    try { await this.db.exec("ALTER TABLE canonical_packages ADD COLUMN timestamp_confidence TEXT;"); } catch {}
    if (autoSeed) {
      await this.seedInitialJobs();
    }
  }

  private autoQueueRuleFromRow(row: AutoQueueRuleRow): AutoQueueRule {
    return AutoQueueRuleSchema.parse({
      ruleId: row.rule_id,
      leadKind: row.lead_kind,
      origin: row.origin,
      pathScope: row.path_scope,
      minDelayMs: row.min_delay_ms,
      expiresAt: row.expires_at,
      reviewReference: row.review_reference,
      reason: row.reason,
      createdAt: row.created_at,
      disabledAt: row.disabled_at
    });
  }

  private sourceAccessProfileFromRow(row: SourceAccessProfileRow): SourceAccessProfile {
    return SourceAccessProfileSchema.parse({
      schemaVersion: 1,
      profileId: row.profile_id,
      platform: row.platform,
      origin: row.origin,
      pathScope: row.path_scope,
      exactQuery: row.query_scope ?? undefined,
      method: row.method,
      purpose: row.purpose,
      minDelayMs: row.min_delay_ms,
      expiresAt: row.expires_at,
      reviewReference: row.review_reference,
      reason: row.reason,
      retainClasses: JSON.parse(row.retain_classes_json),
      publishClasses: JSON.parse(row.publish_classes_json),
      createdAt: row.created_at,
      disabledAt: row.disabled_at
    });
  }

  private async assertCurrentPrincipal(principal: NodePrincipal): Promise<void> {
    const current = await this.db.prepare(
      "SELECT 1 FROM node_credentials WHERE node_id=? AND token_hash=? AND revoked_at IS NULL"
    ).bind(principal.nodeId, principal.credentialVersion).first();
    if (!current) throw new CoordinatorConflict("Node credential changed or revoked", 403);
  }

  private async leaseProfileAllowsJob(job: JobRow): Promise<SourceAccessProfile | null> {
    if (!job.lease_profile_id) return null;
    const row = await this.db.prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
      .bind(job.lease_profile_id).first<SourceAccessProfileRow>();
    if (!row) return null;
    const profile = this.sourceAccessProfileFromRow(row);
    return sourceAccessProfileMatches(profile, job.platform, job.url, job.job_purpose, this.now()) ?
      profile : null;
  }

  private robotsAllows(job: JobRow & { robots_snapshot_id: string; robots_status_code: number; robots_body: string; }): boolean {
    if (robotsResultAllowsMissingFile(job.robots_status_code)) return true;
    if (job.robots_status_code < 200 || job.robots_status_code >= 300) return false;
    let cached = this.robotsMatchers.get(job.origin);
    if (!cached || cached.snapshotId !== job.robots_snapshot_id) {
      cached = {
        snapshotId: job.robots_snapshot_id,
        matcher: compileRobotsText(job.robots_body, { policy: "rfc9309" }).forCrawler(CRAWLER_ROBOTS_TOKEN)
      };
      this.robotsMatchers.set(job.origin, cached);
    }
    return cached.matcher.isAllowed(job.url);
  }

  async activeSourceAccessProfileForTarget(platform: Platform, target: string, purpose: SourcePurpose): Promise<SourceAccessProfile | null> {
    let origin: string;
    try { origin = new URL(target).origin; } catch { return null; }
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const res = await this.db.prepare(`SELECT * FROM source_access_profiles
      WHERE platform=? AND origin=? AND purpose=? AND disabled_at IS NULL AND expires_at>?
      ORDER BY length(path_scope) DESC,created_at ASC,profile_id ASC`)
      .bind(platform, origin, purpose, now).all<SourceAccessProfileRow>();
    const rows = res.results || [];
    for (const row of rows) {
      const profile = this.sourceAccessProfileFromRow(row);
      if (sourceAccessProfileMatches(profile, platform, target, purpose, nowMs)) return profile;
    }
    return null;
  }

  private async activeAutoQueueRuleForLead(kind: string, url: string): Promise<AutoQueueRule | null> {
    if (kind !== "vpm_listing") return null;
    let target: URL;
    try { target = new URL(url); } catch { return null; }
    if (target.protocol !== "https:" || target.username || target.password || target.hash || target.search ||
      target.port || target.hostname.endsWith(".")) return null;
    const res = await this.db.prepare(`SELECT * FROM lead_autoqueue_rules
      WHERE lead_kind=? AND origin=? AND disabled_at IS NULL AND expires_at>?
      ORDER BY length(path_scope) DESC,created_at DESC`)
      .bind(kind, target.origin, new Date(this.now()).toISOString()).all<AutoQueueRuleRow>();
    const rows = res.results || [];
    const match = rows.find((row) => row.path_scope.endsWith("/") ?
      target.pathname.startsWith(row.path_scope) : target.pathname === row.path_scope);
    return match ? this.autoQueueRuleFromRow(match) : null;
  }

  private async approvedDueProfileDelayForOrigin(origin: string, now: string): Promise<number | null> {
    const res = await this.db.prepare(`SELECT j.* FROM crawl_jobs j WHERE j.origin=?
      AND j.state!='blocked' AND j.next_fetch_at<=?
      AND (j.source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules ar
        WHERE ar.rule_id=j.source_rule_id AND ar.disabled_at IS NULL AND ar.expires_at>?))`)
      .bind(origin, now, now).all<JobRow>();
    const rows = res.results || [];
    let delay: number | null = null;
    for (const job of rows) {
      const profile = await this.activeSourceAccessProfileForTarget(job.platform, job.url, job.job_purpose);
      if (profile) delay = Math.max(delay ?? 0, profile.minDelayMs);
    }
    return delay;
  }

  // --- CoordinatorStore Methods ---
  async authenticate(nodeId: string, bearer: string): Promise<NodePrincipal | null> {
    const row = await this.db.prepare(
      "SELECT token_hash,capabilities_json,revoked_at FROM node_credentials WHERE node_id = ?"
    ).bind(nodeId).first<{ token_hash: string; capabilities_json: string; revoked_at: string | null; }>();
    if (!row || row.revoked_at) return null;

    const suppliedHash = await sha256Hex(bearer);
    if (!timingSafeEqual(suppliedHash, row.token_hash)) return null;

    const storedCapabilities = JSON.parse(row.capabilities_json) as Platform[];
    if (isCapabilityToken(bearer)) {
      const parsed = parseCapabilityToken(bearer);
      if (!parsed) return null;
      const parsedSet = new Set(parsed.capabilities);
      const storedSet = new Set(storedCapabilities);
      if (parsedSet.size !== storedSet.size || [...parsedSet].some((c) => !storedSet.has(c))) {
        return null;
      }
    }

    return {
      nodeId,
      capabilities: storedCapabilities,
      credentialVersion: row.token_hash
    };
  }

  async heartbeat(request: HeartbeatRequest, principal: NodePrincipal): Promise<HeartbeatResponse> {
    if (request.nodeId !== principal.nodeId ||
      request.capabilities.some((capability) => !principal.capabilities.includes(capability))) {
      throw new CoordinatorConflict("Node identity or capability mismatch", 403);
    }
    await this.assertCurrentPrincipal(principal);
    if (request.state === "fetching") {
      const now = new Date(this.now()).toISOString();
      const live = await this.db.prepare(`SELECT * FROM crawl_jobs WHERE job_id=? AND claimed_by=? AND lease_id=?
        AND state='leased' AND lease_expires_at>?
        AND (source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules r
          WHERE r.rule_id=source_rule_id AND r.disabled_at IS NULL AND r.expires_at>?))`)
        .bind(request.activeJobId, principal.nodeId, request.activeLeaseId, now, now).first<JobRow>();
      if (!live || !(await this.leaseProfileAllowsJob(live))) {
        throw new CoordinatorConflict("Node does not hold an authorized active job", 403);
      }
    }
    const now = new Date(this.now()).toISOString();
    await this.db.prepare(`INSERT INTO node_heartbeats(node_id,last_seen_at,state,active_job_id) VALUES (?,?,?,?)
      ON CONFLICT(node_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,
        state=excluded.state,active_job_id=excluded.active_job_id`)
      .bind(principal.nodeId, now, request.state, request.state === "fetching" ? request.activeJobId : null).run();
    return { schemaVersion: PROTOCOL_VERSION, status: "alive" as const, serverTime: now };
  }

  async claim(request: ClaimRequest, principal: NodePrincipal): Promise<ClaimResponse> {
    if (request.nodeId !== principal.nodeId) throw new CoordinatorConflict("Node identity mismatch", 403);
    if (request.capabilities.some((capability) => !principal.capabilities.includes(capability))) {
      throw new CoordinatorConflict("Capability not granted to node", 403);
    }
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    await this.assertCurrentPrincipal(principal);

    const placeholders = request.capabilities.map(() => "?").join(",");
    const eligibleFrom = `FROM crawl_jobs j
      JOIN origin_leases o ON o.origin = j.origin
      JOIN origin_robots r ON r.origin = j.origin AND r.expires_at > ?
      LEFT JOIN origin_robots_refresh_leases rl ON rl.origin=j.origin AND rl.lease_expires_at>?
      WHERE j.platform IN (${placeholders})
        AND rl.origin IS NULL
        AND j.next_fetch_at <= ?
        AND (j.state IN ('pending','done','backoff') OR (j.state='leased' AND j.lease_expires_at <= ?))
        AND o.next_allowed_at <= ?
        AND (o.active_job_id IS NULL OR o.lease_expires_at <= ?)
        AND (j.source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules ar
          WHERE ar.rule_id=j.source_rule_id AND ar.disabled_at IS NULL AND ar.expires_at>?))
        AND EXISTS (SELECT 1 FROM source_access_profiles p
          WHERE p.platform=j.platform AND p.origin=j.origin AND p.purpose=j.job_purpose
            AND p.disabled_at IS NULL AND p.expires_at>?
            AND instr(j.url,'#')=0 AND
            ((p.query_scope IS NOT NULL AND
                j.url=p.origin||p.path_scope||'?'||p.query_scope) OR
              (p.query_scope IS NULL AND instr(j.url,'?')=0 AND
                (j.url=p.origin||p.path_scope OR
                  (substr(p.path_scope,-1)='/' AND
                    substr(j.url,1,length(p.origin||p.path_scope))=p.origin||p.path_scope)))))
    `;
    const eligibilityParams = (at: string) => [at, at, ...request.capabilities, at, at, at, at, at, at];
    const query = `SELECT j.*,r.snapshot_id AS robots_snapshot_id,r.status_code AS robots_status_code,
      r.body AS robots_body,r.expires_at AS robots_expires_at ${eligibleFrom}
      ORDER BY j.next_fetch_at ASC, j.created_at ASC, j.job_id ASC LIMIT 100 OFFSET ?`;

    let offset = 0;
    for (; ;) {
      const bindParams = [...eligibilityParams(now), offset];
      const res = await this.db.prepare(query).bind(...bindParams).all<JobRow & {
        robots_snapshot_id: string; robots_status_code: number; robots_body: string; robots_expires_at: string;
      }>();
      const candidates = res.results || [];
      if (candidates.length === 0) break;
      let deferred = false;
      for (const job of candidates) {
        const profile = await this.activeSourceAccessProfileForTarget(job.platform, job.url, job.job_purpose);
        if (!profile) continue;
        if (!this.robotsAllows(job)) {
          await this.db.prepare(`UPDATE crawl_jobs SET next_fetch_at=?,robots_deferred_until=?,
            state=CASE WHEN state='leased' THEN 'pending' ELSE state END,
            claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=? AND job_id IN (
              SELECT j.job_id ${eligibleFrom} AND j.job_id=? AND r.snapshot_id=?)`)
            .bind(job.robots_expires_at, job.robots_expires_at, job.job_id,
              ...eligibilityParams(new Date(this.now()).toISOString()), job.job_id, job.robots_snapshot_id).run();
          deferred = true;
          continue;
        }
        const lease = await this.db.prepare("SELECT * FROM origin_leases WHERE origin = ?").bind(job.origin).first<{
          active_job_id: string | null; lease_expires_at: string | null;
          next_allowed_at: string; min_delay_ms: number;
        }>();
        if (!lease) continue;
        if (lease.next_allowed_at > now || (lease.active_job_id && lease.lease_expires_at && lease.lease_expires_at > now)) continue;
        const reservationMs = this.now();
        const reservationTime = new Date(reservationMs).toISOString();
        const expires = new Date(reservationMs + 5 * 60 * 1000).toISOString();
        const leaseId = crypto.randomUUID();
        const nextAllowed = new Date(reservationMs + Math.max(lease.min_delay_ms, profile.minDelayMs)).toISOString();

        // D1 batches are transactional. Recheck eligibility inside the write, not only
        // in preceding reads; the origin update belongs exclusively to this lease.
        const reservation = await this.db.batch([
          this.db.prepare(`UPDATE crawl_jobs SET state='leased',claimed_by=?,lease_id=?,
            lease_expires_at=?,lease_profile_id=? WHERE job_id=? AND job_id IN (
              SELECT j.job_id ${eligibleFrom} AND j.job_id=? AND r.snapshot_id=? AND o.min_delay_ms=?
                AND EXISTS (SELECT 1 FROM source_access_profiles p WHERE p.profile_id=?
                  AND p.disabled_at IS NULL AND p.expires_at>?)
                AND EXISTS (SELECT 1 FROM node_credentials c WHERE c.node_id=?
                  AND c.token_hash=? AND c.revoked_at IS NULL))`)
            .bind(principal.nodeId, leaseId, expires, profile.profileId, job.job_id,
              ...eligibilityParams(reservationTime), job.job_id, job.robots_snapshot_id,
              lease.min_delay_ms, profile.profileId, reservationTime, principal.nodeId, principal.credentialVersion),
          this.db.prepare(`UPDATE origin_leases SET active_job_id=?,lease_expires_at=?,next_allowed_at=?
            WHERE origin=? AND EXISTS (SELECT 1 FROM crawl_jobs j WHERE j.job_id=?
              AND j.state='leased' AND j.lease_id=? AND j.claimed_by=?)`)
            .bind(job.job_id, expires, nextAllowed, job.origin, job.job_id, leaseId, principal.nodeId)
        ]);
        if ((reservation[0]?.meta as { changes?: number } | undefined)?.changes !== 1) continue;
        return {
          schemaVersion: PROTOCOL_VERSION, status: "leased" as const,
          job: {
            jobId: job.job_id, leaseId, platform: job.platform, purpose: job.job_purpose,
            url: job.url, origin: job.origin,
            leaseExpiresAt: expires, retainClasses: profile.retainClasses,
            etag: job.etag, lastModified: job.last_modified
          }
        };
      }
      if (deferred) offset = 0;
      else offset += candidates.length;
    }
    return { schemaVersion: PROTOCOL_VERSION, status: "empty" as const, retryAfterMs: 1000 };
  }

  async submit(request: ResultRequest, principal: NodePrincipal): Promise<ResultResponse> {
    if (request.nodeId !== principal.nodeId) throw new CoordinatorConflict("Node identity mismatch", 403);
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const requestDigest = await sha256Hex(JSON.stringify(request));
    await this.assertCurrentPrincipal(principal);

    const prior = await this.db.prepare(
      "SELECT job_id,node_id,idempotency_key,request_digest,response_json FROM job_results WHERE lease_id=?"
    ).bind(request.leaseId).first<{
      job_id: string; node_id: string; idempotency_key: string; request_digest: string; response_json: string;
    }>();
    if (prior) {
      if (prior.job_id !== request.jobId || prior.node_id !== principal.nodeId ||
        prior.idempotency_key !== request.idempotencyKey || prior.request_digest !== requestDigest) {
        throw new CoordinatorConflict("Job already submitted with a different identity or key");
      }
      return { ...JSON.parse(prior.response_json), duplicate: true } as ResultResponse;
    }

    const job = await this.db.prepare("SELECT * FROM crawl_jobs WHERE job_id=?").bind(request.jobId).first<JobRow>();
    if (!job) throw new CoordinatorConflict("Job not found", 404);
    if (!principal.capabilities.includes(job.platform)) throw new CoordinatorConflict("Capability not granted to node", 403);
    if (request.outcome.kind === "batch" && job.platform !== "vpm") {
      throw new CoordinatorConflict("Multi-item batches require a VPM job");
    }
    if (request.outcome.kind === "partial_batch" && job.platform !== "vpm") {
      throw new CoordinatorConflict("Listing diagnostics require a VPM job");
    }
    if (job.source_rule_id) {
      const activeRule = await this.db.prepare(`SELECT 1 FROM lead_autoqueue_rules
        WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?`).bind(job.source_rule_id, now).first();
      if (!activeRule) {
        throw new CoordinatorConflict("Auto-queue rule no longer authorizes this job", 403);
      }
    }
    if (job.state !== "leased" || job.claimed_by !== principal.nodeId ||
      job.lease_id !== request.leaseId || !job.lease_expires_at || job.lease_expires_at <= now) {
      throw new CoordinatorConflict("Node does not hold a live lease for this job", 403);
    }
    const sourceProfile = await this.leaseProfileAllowsJob(job);
    if (!sourceProfile) throw new CoordinatorConflict("Source profile no longer authorizes this job", 403);
    const robots = await this.db.prepare(`SELECT snapshot_id AS robots_snapshot_id,status_code AS robots_status_code,
      body AS robots_body,expires_at AS robots_expires_at FROM origin_robots WHERE origin=?`)
      .bind(job.origin).first<{
        robots_snapshot_id: string; robots_status_code: number;
        robots_body: string; robots_expires_at: string;
      }>();
    if (!robots || robots.robots_expires_at <= now || !this.robotsAllows({ ...job, ...robots })) {
      throw new CoordinatorConflict("Origin robots policy no longer allows this job", 403);
    }

    let sourceVersionCreated = false;
    const outcome = request.outcome;
    if (job.platform === "booth" && job.job_purpose === "discovery") {
      if (!isBoothBrowseTarget(job.url) ||
        outcome.kind === "changed" || outcome.kind === "batch" || outcome.kind === "partial_batch") {
        throw new CoordinatorConflict("BOOTH browse jobs can report leads, not product observations");
      }
      if (outcome.kind === "discovery" && outcome.leads.some(lead => {
        const id = boothItemIdentity(lead.url);
        return lead.kind !== "storefront_product" || !id ||
          lead.url !== `https://booth.pm/ja/items/${id}` ||
          lead.discoveredFromItemKey !== undefined || lead.claimedPackageId !== undefined;
      })) {
        throw new CoordinatorConflict("BOOTH browse leads require canonical BOOTH product URLs");
      }
    }
    if (job.platform === "shopify" && job.job_purpose === "discovery") {
      if (!isShopifyProductSitemapTarget(job.url) ||
        outcome.kind === "changed" || outcome.kind === "batch" || outcome.kind === "partial_batch") {
        throw new CoordinatorConflict("Shopify product sitemap jobs can report leads, not product observations");
      }
      if (outcome.kind === "discovery" && outcome.leads.some(lead => lead.kind !== "storefront_product" || !shopifyProductLead(lead.url, job.origin) ||
        lead.discoveredFromItemKey !== undefined || lead.claimedPackageId !== undefined)) {
        throw new CoordinatorConflict("Shopify sitemap leads require same-origin product URLs");
      }
    }
    if (job.platform === "curated" && job.job_purpose === "discovery") {
      if (outcome.kind === "changed" || outcome.kind === "batch" || outcome.kind === "partial_batch") {
        throw new CoordinatorConflict("Curated discovery jobs report discovery leads, not product observations");
      }
    }

    const observations = outcome.kind === "changed" ? [outcome.observation] :
      outcome.kind === "batch" || outcome.kind === "partial_batch" ? outcome.observations : [];
    if (observations.some(observation => !observationMatchesPlatform(job.platform, observation))) {
      throw new CoordinatorConflict("Release evidence does not match the leased platform");
    }
    if ((observations.length > 0 || outcome.kind === "discovery" || outcome.kind === "partial_batch") &&
      !sourceProfile.retainClasses.includes("normalized_facts")) {
      throw new CoordinatorConflict("Source profile does not permit retaining normalized evidence", 403);
    }
    if (observations.some(observation => observation.summary.length > 0) &&
      !sourceProfile.retainClasses.includes("creator_prose")) {
      throw new CoordinatorConflict("Source profile does not permit retaining creator prose", 403);
    }
    if (new Set(observations.map((observation) => observation.sourceItemKey)).size !== observations.length) {
      throw new CoordinatorConflict("Result batch contains duplicate source identities");
    }

    const batchStmts: D1PreparedStatement[] = [];

    for (const observation of observations) {
      const sourceKey = `${job.platform}:${job.url}:${observation.sourceItemKey}`;
      let versionId: string | null = null;
      const payload = JSON.stringify(observation);
      const digest = await sha256Hex(payload);
      const complete = outcome.kind !== "partial_batch" ||
        !outcome.issues.some((issue) => issue.sourceItemKey === observation.sourceItemKey);
      const previous = await this.db.prepare(`SELECT i.latest_digest,i.latest_version_no,i.gone_at,v.complete
        FROM source_items i JOIN source_versions v ON v.source_key=i.source_key AND v.version_no=i.latest_version_no
        WHERE i.source_key=?`)
        .bind(sourceKey).first<{ latest_digest: string; latest_version_no: number; gone_at: string | null; complete: number; }>();

      if (!previous || previous.latest_digest !== digest || (complete && previous.complete === 0)) {
        const versionNo = (previous?.latest_version_no || 0) + 1;
        versionId = crypto.randomUUID();
        batchStmts.push(
          this.db.prepare(`INSERT INTO source_items(source_key,platform,source_url,latest_digest,latest_version_no)
            VALUES (?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_url=excluded.source_url,
              latest_digest=excluded.latest_digest,latest_version_no=excluded.latest_version_no,
              gone_at=CASE WHEN ? THEN NULL ELSE source_items.gone_at END`)
            .bind(sourceKey, job.platform, job.url, digest, versionNo, complete ? 1 : 0),
          this.db.prepare(`INSERT INTO source_versions
            (version_id,source_key,version_no,digest,payload_json,observed_at,complete,
              contributor_node_id,submission_lease_id,source_profile_id)
            VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(versionId, sourceKey, versionNo, digest, payload, now,
            complete ? 1 : 0, principal.nodeId, request.leaseId, sourceProfile.profileId)
        );
        sourceVersionCreated = true;
      } else {
        batchStmts.push(
          this.db.prepare("UPDATE source_items SET source_url=?,gone_at=CASE WHEN ? THEN NULL ELSE gone_at END WHERE source_key=?")
            .bind(job.url, complete ? 1 : 0, sourceKey)
        );
      }

      const avatarCompatibilities = extractAvatarCompatibility(
        observation.title,
        observation.summary,
        observation.outboundLinks,
        observation.platformTags ?? [],
        observation.sourceItemKey
      );
      for (const compat of avatarCompatibilities) {
        batchStmts.push(
          this.db.prepare(`
            INSERT OR REPLACE INTO avatar_compatibilities
            (compatibility_id, source_key, target_avatar_base, scope, confidence, evidence_source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            compat.compatibilityId,
            sourceKey,
            compat.targetAvatarBase,
            compat.scope,
            compat.confidence,
            compat.evidenceSource,
            now
          )
        );
      }

      batchStmts.push(
        this.db.prepare(`INSERT INTO source_events
          (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
          VALUES (?,?,?,?,?,?,?,?)`)
          .bind(job.job_id, sourceKey, previous?.gone_at && complete ? "restored" : versionId ? "changed" : "unchanged", now, versionId,
            principal.nodeId, request.leaseId, sourceProfile.profileId)
      );

      if (job.platform === "vpm" && complete) {
        const vpmId = observation.sourceItemKey;
        const umbrella = deriveUmbrellaFromTags(observation.platformTags, "tools");
        const originUpdated = observation.originUpdatedAt;
        const publishedAt = originUpdated ?? null;
        const timestampConfidence = originUpdated ? "confirmed" : "observed";
        batchStmts.push(
          this.db.prepare(`INSERT INTO canonical_packages
            (canonical_id,umbrella,category,lifecycle,display_name,vpm_id,created_at,updated_at,published_at,timestamp_confidence)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(canonical_id) DO UPDATE SET
              display_name=excluded.display_name,
              vpm_id=COALESCE(excluded.vpm_id,canonical_packages.vpm_id),
              updated_at=excluded.updated_at,
              published_at=COALESCE(excluded.published_at, canonical_packages.published_at),
              timestamp_confidence=CASE
                WHEN excluded.timestamp_confidence = 'confirmed' THEN 'confirmed'
                WHEN canonical_packages.timestamp_confidence = 'confirmed' THEN 'confirmed'
                WHEN excluded.timestamp_confidence = 'inferred' THEN 'inferred'
                ELSE COALESCE(canonical_packages.timestamp_confidence, excluded.timestamp_confidence)
              END`).bind(
            vpmId, umbrella, deriveCategoryFromTags(observation.platformTags, "vpm_package"), "active", cleanTitle(observation.title), vpmId, now, now, publishedAt, timestampConfidence),
          this.db.prepare(`INSERT OR IGNORE INTO identity_links
            (link_id,source_key,canonical_id,evidence_kind,confidence,review_state,created_at,reviewed_at)
            VALUES (?,?,?,'vpm_id',1.0,'accepted',?,?)`).bind(
            crypto.randomUUID(), sourceKey, vpmId, now, now)
        );

        for (const outbound of observation.outboundLinks) {
          const leadKind = classifyOutboundLeadKind(outbound);
          if (leadKind) {
            const identity = [job.url, vpmId, leadKind, outbound, vpmId];
            const leadKey = await sha256Hex(JSON.stringify(identity));
            batchStmts.push(
              this.db.prepare(`INSERT INTO source_leads
                (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,
                  kind,target_url,claimed_package_id,status,
                  first_seen_at,last_seen_at,first_seen_node_id,first_seen_lease_id,first_seen_profile_id,
                  last_seen_node_id,last_seen_lease_id,last_seen_profile_id)
                VALUES (?,?,?,?,?,?,?,'pending_review',?,?,?,?,?,?,?,?)
                ON CONFLICT(lead_key) DO UPDATE SET last_seen_at=excluded.last_seen_at,
                  last_seen_node_id=excluded.last_seen_node_id,last_seen_lease_id=excluded.last_seen_lease_id,
                  last_seen_profile_id=excluded.last_seen_profile_id`)
                .bind(leadKey, job.url, job.job_id, vpmId,
                  leadKind, outbound, vpmId,
                  now, now, principal.nodeId, request.leaseId, sourceProfile.profileId,
                  principal.nodeId, request.leaseId, sourceProfile.profileId)
            );
          }
        }
      }

      if (job.platform === "github" && complete) {
        const ownerRepo = job.url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)/)?.[1];
        if (ownerRepo) {
          const normalizedHtmlUrl = `https://github.com/${ownerRepo}`.toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
          const linkedRes = await this.db.prepare(`
            SELECT DISTINCT il.canonical_id
            FROM source_leads sl
            JOIN identity_links il ON (
              (sl.discovered_from_item_key IS NOT NULL AND (
                il.canonical_id = sl.discovered_from_item_key
                OR il.source_key = sl.discovered_from_item_key
                OR il.source_key = 'vpm:' || sl.discovered_from_url || ':' || sl.discovered_from_item_key
              ))
              OR (sl.claimed_package_id IS NOT NULL AND il.canonical_id = sl.claimed_package_id)
            )
            WHERE sl.kind = 'github_repository'
              AND LOWER(RTRIM(CASE WHEN RTRIM(sl.target_url, '/') LIKE '%.git' THEN SUBSTR(RTRIM(sl.target_url, '/'), 1, LENGTH(RTRIM(sl.target_url, '/')) - 4) ELSE RTRIM(sl.target_url, '/') END, '/')) = ?
              AND il.review_state = 'accepted'
              AND il.evidence_kind = 'vpm_id'
          `).bind(normalizedHtmlUrl).all<{ canonical_id: string; }>();
          const linkedCanonicals = linkedRes.results || [];
          for (const { canonical_id } of linkedCanonicals) {
            batchStmts.push(
              this.db.prepare(`INSERT OR IGNORE INTO identity_links
                (link_id,source_key,canonical_id,evidence_kind,confidence,review_state,created_at)
                VALUES (?,?,?,'repository_match',0.7,'provisional',?)`).bind(
                crypto.randomUUID(), sourceKey, canonical_id, now)
            );
          }
        }
      }

      // G2/G4 package_fronts relational projection:
      // When an observation has an accepted or provisional identity link to a canonical package
      // (or if it is a storefront platform with an outbound match), upsert a row into package_fronts.
      const linkedCanonicalIds = new Set<string>();
      const existingLinksRes = await this.db.prepare(`
        SELECT canonical_id FROM identity_links
        WHERE source_key = ? AND review_state IN ('accepted', 'provisional')
      `).bind(sourceKey).all<{ canonical_id: string; }>();
      for (const { canonical_id } of existingLinksRes.results || []) {
        linkedCanonicalIds.add(canonical_id);
      }

      const isStorefront = STOREFRONT_PLATFORMS.has(job.platform) || observation.price !== undefined;
      if (isStorefront) {
        // Outbound match 1: observation outbound links matching source items or leads linked to a canonical package
        for (const outbound of observation.outboundLinks) {
          const normalizedOutbound = outbound.toLowerCase().replace(/\/+$/, "");
          const matchesRes = await this.db.prepare(`
            SELECT DISTINCT il.canonical_id
            FROM identity_links il
            JOIN source_items si ON si.source_key = il.source_key
            WHERE LOWER(RTRIM(si.source_url, '/')) = ?
              AND il.review_state IN ('accepted', 'provisional')
          `).bind(normalizedOutbound).all<{ canonical_id: string; }>();
          for (const { canonical_id } of matchesRes.results || []) {
            linkedCanonicalIds.add(canonical_id);
          }

          const ghMatch = normalizedOutbound.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)/);
          if (ghMatch) {
            const apiGhUrl = `https://api.github.com/repos/${ghMatch[1]}`.toLowerCase();
            const ghMatchesRes = await this.db.prepare(`
              SELECT DISTINCT il.canonical_id
              FROM identity_links il
              JOIN source_items si ON si.source_key = il.source_key
              WHERE LOWER(RTRIM(si.source_url, '/')) = ?
                AND il.review_state IN ('accepted', 'provisional')
            `).bind(apiGhUrl).all<{ canonical_id: string; }>();
            for (const { canonical_id } of ghMatchesRes.results || []) {
              linkedCanonicalIds.add(canonical_id);
            }
          }

          const leadMatchesRes = await this.db.prepare(`
            SELECT DISTINCT il.canonical_id
            FROM source_leads sl
            JOIN identity_links il ON (
              (sl.discovered_from_item_key IS NOT NULL AND (
                il.canonical_id = sl.discovered_from_item_key
                OR il.source_key = sl.discovered_from_item_key
                OR il.source_key = 'vpm:' || sl.discovered_from_url || ':' || sl.discovered_from_item_key
              ))
              OR (sl.claimed_package_id IS NOT NULL AND il.canonical_id = sl.claimed_package_id)
            )
            WHERE LOWER(RTRIM(sl.target_url, '/')) = ?
              AND il.review_state IN ('accepted', 'provisional')
          `).bind(normalizedOutbound).all<{ canonical_id: string; }>();
          for (const { canonical_id } of leadMatchesRes.results || []) {
            linkedCanonicalIds.add(canonical_id);
          }
        }

        // Outbound match 2: source leads where target_url matches this job URL (e.g. storefront discovered from VPM)
        const normalizedJobUrl = job.url.toLowerCase().replace(/\/+$/, "");
        const jobLeadMatchesRes = await this.db.prepare(`
          SELECT DISTINCT il.canonical_id
          FROM source_leads sl
          JOIN identity_links il ON (
            (sl.discovered_from_item_key IS NOT NULL AND (
              il.canonical_id = sl.discovered_from_item_key
              OR il.source_key = sl.discovered_from_item_key
              OR il.source_key = 'vpm:' || sl.discovered_from_url || ':' || sl.discovered_from_item_key
            ))
            OR (sl.claimed_package_id IS NOT NULL AND il.canonical_id = sl.claimed_package_id)
          )
          WHERE LOWER(RTRIM(sl.target_url, '/')) = ?
            AND il.review_state IN ('accepted', 'provisional')
        `).bind(normalizedJobUrl).all<{ canonical_id: string; }>();
        for (const { canonical_id } of jobLeadMatchesRes.results || []) {
          linkedCanonicalIds.add(canonical_id);
        }
      }


      if (isStorefront && complete && job.platform !== "vpm" && linkedCanonicalIds.size === 0) {
        const canonicalId = observation.sourceItemKey;
        const desktopClassification = classifyDesktopTool(
          observation.title,
          observation.summary,
          observation.outboundLinks,
          observation.platformTags ?? []
        );
        const umbrella = desktopClassification.isDesktopTool && desktopClassification.confidence >= 0.8
          ? "tools"
          : deriveUmbrellaFromTags(observation.platformTags, "assets");
        const category = deriveCategoryFromTags(
          observation.platformTags,
          desktopClassification.isDesktopTool && desktopClassification.confidence >= 0.8 && desktopClassification.subtype
            ? desktopClassification.subtype
            : "storefront_package"
        );
        const originUpdated = observation.originUpdatedAt;
        const publishedAt = originUpdated ?? null;
        const timestampConfidence = originUpdated ? "confirmed" : "observed";
        batchStmts.push(
          this.db.prepare(`INSERT INTO canonical_packages
            (canonical_id,umbrella,category,lifecycle,display_name,vpm_id,created_at,updated_at,published_at,timestamp_confidence)
            VALUES (?,?,?,?,?,NULL,?,?,?,?)
            ON CONFLICT(canonical_id) DO UPDATE SET
              display_name=excluded.display_name,
              updated_at=excluded.updated_at,
              published_at=COALESCE(excluded.published_at, canonical_packages.published_at),
              timestamp_confidence=CASE
                WHEN excluded.timestamp_confidence = 'confirmed' THEN 'confirmed'
                WHEN canonical_packages.timestamp_confidence = 'confirmed' THEN 'confirmed'
                WHEN excluded.timestamp_confidence = 'inferred' THEN 'inferred'
                ELSE COALESCE(canonical_packages.timestamp_confidence, excluded.timestamp_confidence)
              END`).bind(
            canonicalId, umbrella, category, "active", cleanTitle(observation.title), now, now, publishedAt, timestampConfidence),
          this.db.prepare(`INSERT OR IGNORE INTO identity_links
            (link_id,source_key,canonical_id,evidence_kind,confidence,review_state,created_at,reviewed_at)
            VALUES (?,?,?,'cross_storefront_link',1.0,'accepted',?,?)`).bind(
            crypto.randomUUID(), sourceKey, canonicalId, now, now)
        );
        linkedCanonicalIds.add(canonicalId);
      }

      for (const canonicalId of linkedCanonicalIds) {
        if (isStorefront) {
          const alreadyLinked = (existingLinksRes.results || []).some(r => r.canonical_id === canonicalId) ||
            canonicalId === observation.sourceItemKey;
          if (!alreadyLinked) {
            batchStmts.push(
              this.db.prepare(`INSERT OR IGNORE INTO identity_links
                (link_id,source_key,canonical_id,evidence_kind,confidence,review_state,created_at)
                VALUES (?,?,?,'cross_storefront_link',0.8,'provisional',?)`).bind(
                crypto.randomUUID(), sourceKey, canonicalId, now)
            );
          }

          const rawStorefrontUrl = (observation as any).storefrontUrl || job.url;
          const storefrontUrl = cleanTrackingParams(rawStorefrontUrl);
          const frontId = crypto.randomUUID();
          const price = observation.price ?? null;
          const currency = observation.currency ?? null;
          const availability = observation.availability ?? "available";

          batchStmts.push(
            this.db.prepare(`
              INSERT INTO package_fronts
                (front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(canonical_id, source_key) DO UPDATE SET
                platform = excluded.platform,
                storefront_url = excluded.storefront_url,
                price = excluded.price,
                currency = excluded.currency,
                availability = excluded.availability,
                observed_at = excluded.observed_at
            `).bind(frontId, canonicalId, sourceKey, job.platform, storefrontUrl, price, currency, availability, now)
          );
        }
      }

      const desktopClassification = classifyDesktopTool(
        observation.title,
        observation.summary,
        observation.outboundLinks,
        observation.platformTags ?? []
      );
      if (desktopClassification.isDesktopTool && desktopClassification.confidence >= 0.8 && desktopClassification.subtype) {
        const evidenceUrl = (observation as any).storefrontUrl || observation.outboundLinks[0] || `https://github.com/${observation.sourceItemKey}`;
        const publisherClaim = observation.summary || observation.title;
        const supportedOS = inferSupportedOS(`${observation.title} ${observation.summary} ${(observation.platformTags ?? []).join(" ")}`);
        for (const canonicalId of linkedCanonicalIds) {
          batchStmts.push(
            this.db.prepare(`
              INSERT INTO desktop_tool_evidence
                (canonical_id, tool_subtype, supported_os, particular_vrchat_target, evidence_url, publisher_claim, confidence, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(canonical_id) DO UPDATE SET
                tool_subtype = excluded.tool_subtype,
                supported_os = excluded.supported_os,
                particular_vrchat_target = excluded.particular_vrchat_target,
                evidence_url = excluded.evidence_url,
                publisher_claim = excluded.publisher_claim,
                confidence = excluded.confidence
            `).bind(
              canonicalId,
              desktopClassification.subtype,
              JSON.stringify(supportedOS),
              1,
              evidenceUrl,
              publisherClaim,
              desktopClassification.confidence,
              now
            )
          );
        }
      }
    }

    if (outcome.kind === "gone") {
      const currentItemsRes = await this.db.prepare(`SELECT source_key FROM source_items
        WHERE platform=? AND source_url=? AND gone_at IS NULL`).bind(job.platform, job.url).all<{ source_key: string; }>();
      const currentItems = currentItemsRes.results || [];
      for (const item of currentItems) {
        batchStmts.push(
          this.db.prepare("UPDATE source_items SET gone_at=? WHERE source_key=?").bind(now, item.source_key),
          this.db.prepare("UPDATE package_fronts SET availability='delisted', observed_at=? WHERE source_key=?").bind(now, item.source_key),
          this.db.prepare(`UPDATE canonical_packages SET lifecycle='delisted', updated_at=?
            WHERE canonical_id IN (SELECT canonical_id FROM package_fronts WHERE source_key=?)
              AND vpm_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM package_fronts pf2 WHERE pf2.canonical_id = canonical_packages.canonical_id AND pf2.availability = 'available')`)
            .bind(now, item.source_key),
          this.db.prepare(`INSERT INTO source_events
            (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
            VALUES (?,?,'gone',?,NULL,?,?,?)`)
            .bind(job.job_id, item.source_key, now, principal.nodeId, request.leaseId, sourceProfile.profileId)
        );
      }
    }

    if (outcome.kind === "partial_batch") {
      for (const issue of outcome.issues) {
        batchStmts.push(
          this.db.prepare(`INSERT INTO source_issues
            (job_id,source_item_key,version_key,code,observed_at,contributor_node_id,submission_lease_id,source_profile_id)
            VALUES (?,?,?,?,?,?,?,?)`).bind(job.job_id, issue.sourceItemKey, issue.version || null,
            issue.code, now, principal.nodeId, request.leaseId, sourceProfile.profileId)
        );
      }
      batchStmts.push(
        this.db.prepare(`INSERT INTO source_events
          (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
          VALUES (?,NULL,'incomplete_listing',?,NULL,?,?,?)`)
          .bind(job.job_id, now, principal.nodeId, request.leaseId, sourceProfile.profileId)
      );
    }

    if (observations.length === 0 && outcome.kind !== "partial_batch") {
      batchStmts.push(
        this.db.prepare(`INSERT INTO source_events
          (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
          VALUES (?,NULL,?,?,NULL,?,?,?)`)
          .bind(job.job_id, outcome.kind, now, principal.nodeId, request.leaseId, sourceProfile.profileId)
      );
    }

    let state = "done";
    let nextFetchAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
    if (outcome.kind === "rate_limited") {
      state = "backoff";
      nextFetchAt = new Date(nowMs + outcome.retryAfterSeconds * 1000).toISOString();
    } else if (outcome.kind === "temporary_failure") {
      state = "backoff";
      nextFetchAt = new Date(nowMs + 15 * 60 * 1000).toISOString();
    } else if (outcome.kind === "blocked") {
      state = "blocked";
      nextFetchAt = new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString();
    }

    const response: ResultResponse = {
      schemaVersion: PROTOCOL_VERSION, status: "accepted", jobId: job.job_id,
      duplicate: false, sourceVersionCreated
    };

    batchStmts.push(
      this.db.prepare("UPDATE crawl_jobs SET state=?,next_fetch_at=?,claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=?")
        .bind(state, nextFetchAt, job.job_id),
      this.db.prepare(`UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL,
        next_allowed_at=MAX(next_allowed_at,?) WHERE origin=? AND active_job_id=?`)
        .bind(outcome.kind === "rate_limited" || outcome.kind === "blocked" ? nextFetchAt : now, job.origin, job.job_id),
      this.db.prepare("INSERT INTO job_results(lease_id,job_id,node_id,idempotency_key,request_digest,response_json,submitted_at) VALUES (?,?,?,?,?,?,?)")
        .bind(request.leaseId, job.job_id, principal.nodeId, request.idempotencyKey, requestDigest, JSON.stringify(response), now)
    );

    if (batchStmts.length > 0) {
      await this.db.batch(batchStmts);
    }

    if (outcome.kind === "discovery") {
      for (const lead of outcome.leads) {
        const identity = lead.discoveredFromItemKey ?
          [job.url, lead.discoveredFromItemKey, lead.kind, lead.url, lead.claimedPackageId || null] :
          [job.url, lead.kind, lead.url, lead.claimedPackageId || null];
        const leadKey = await sha256Hex(JSON.stringify(identity));
        await this.db.prepare(`INSERT INTO source_leads
          (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,
            kind,target_url,claimed_package_id,status,
            first_seen_at,last_seen_at,first_seen_node_id,first_seen_lease_id,first_seen_profile_id,
            last_seen_node_id,last_seen_lease_id,last_seen_profile_id)
          VALUES (?,?,?,?,?,?,?,'pending_review',?,?,?,?,?,?,?,?)
          ON CONFLICT(lead_key) DO UPDATE SET last_seen_at=excluded.last_seen_at,
            last_seen_node_id=excluded.last_seen_node_id,last_seen_lease_id=excluded.last_seen_lease_id,
            last_seen_profile_id=excluded.last_seen_profile_id`)
          .bind(leadKey, job.url, job.job_id, lead.discoveredFromItemKey || null,
            lead.kind, lead.url, lead.claimedPackageId || null,
            now, now, principal.nodeId, request.leaseId, sourceProfile.profileId,
            principal.nodeId, request.leaseId, sourceProfile.profileId).run();

        const status = await this.db.prepare("SELECT status FROM source_leads WHERE lead_key=?")
          .bind(leadKey).first<{ status: string; }>();
        if (status?.status === "pending_review") {
          const rule = await this.activeAutoQueueRuleForLead(lead.kind, lead.url);
          if (rule) {
            try {
              await this.approveVpmListingLead(leadKey, rule.minDelayMs, `auto-rule:${rule.ruleId}`,
                "Matched reviewed auto-queue rule", rule.ruleId);
            } catch (cause) {
              await this.db.prepare(`INSERT INTO operator_rule_actions(rule_id,actor,action,reason,occurred_at)
                VALUES (?,'coordinator','promotion_failed',?,?)`)
                .bind(rule.ruleId, cause instanceof Error ? cause.message.slice(0, 300) : "Unknown promotion failure", now).run();
            }
          }
        }
      }
    }

    return response;
  }

  // --- OperatorStore Methods ---
  async revokeNode(nodeId: string, input: RevokeNodeRequest, actor: string): Promise<void> {
    RevokeNodeResponseSchema.shape.nodeId.parse(nodeId);
    const parsed = RevokeNodeRequestSchema.parse(input);
    if (!actor.trim() || actor.length > 100) throw new Error("Operator actor required");
    const now = new Date(this.now()).toISOString();
    const result = await this.db.batch([
      this.db.prepare(`INSERT INTO node_credential_actions(node_id,actor,action,reason,occurred_at)
        SELECT node_id,?,'revoke',?,? FROM node_credentials WHERE node_id=?`)
        .bind(actor, parsed.reason, now, nodeId),
      this.db.prepare("UPDATE node_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE node_id=?").bind(now, nodeId)
    ]);
    if ((result[0]?.meta as { changes?: number } | undefined)?.changes !== 1) throw new Error("Node not found");
  }

  async createNodeCredential(nodeId: string, capabilities: Platform[]): Promise<string> {
    ClaimRequestSchema.parse({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities });
    const token = formatCapabilityToken(capabilities);
    const hash = await sha256Hex(token);
    await this.db.prepare(`
      INSERT INTO node_credentials(node_id,token_hash,capabilities_json,revoked_at)
      VALUES (?,?,?,NULL)
      ON CONFLICT(node_id) DO UPDATE SET token_hash=excluded.token_hash,
        capabilities_json=excluded.capabilities_json, revoked_at=NULL
    `).bind(nodeId, hash, JSON.stringify([...new Set(capabilities)])).run();
    return token;
  }

  /**
   * Workforce Distribution Evaluator (Edge/D1):
   * Balances workforce across platforms by comparing pending/stale jobs and downstream demand
   * against active node coverage, preventing bot-net clustering on single platforms.
   */
  async evaluateWorkforceDistribution(candidateCapabilities?: Platform[]): Promise<Platform[]> {
    const candidates = candidateCapabilities && candidateCapabilities.length > 0
      ? [...new Set(candidateCapabilities)]
      : [...PlatformSchema.options];
    const now = new Date(this.now()).toISOString();
    const activeCutoff = new Date(this.now() - 15 * 60 * 1000).toISOString();

    const jobsByPlatform = new Map<string, number>();
    const jobRes = await this.db.prepare(`
      SELECT platform, COUNT(*) as cnt FROM crawl_jobs
      WHERE (state IN ('pending', 'backoff') OR (state = 'done' AND next_fetch_at <= ?))
      GROUP BY platform
    `).bind(now).all<{ platform: string; cnt: number }>();
    for (const row of (jobRes.results || [])) {
      jobsByPlatform.set(row.platform, row.cnt);
    }

    const demandByPlatform = new Map<string, number>();
    const demandRes = await this.db.prepare(`
      SELECT requested_platform, COUNT(*) as cnt FROM downstream_demand_signals
      WHERE resolved_at IS NULL AND requested_platform IS NOT NULL
      GROUP BY requested_platform
    `).all<{ requested_platform: string; cnt: number }>();
    for (const row of (demandRes.results || [])) {
      demandByPlatform.set(row.requested_platform, row.cnt);
    }

    const activeNodesByPlatform = new Map<string, number>();
    const activeRes = await this.db.prepare(`
      SELECT c.capabilities_json FROM node_heartbeats h
      JOIN node_credentials c ON c.node_id = h.node_id
      WHERE h.last_seen_at >= ? AND c.revoked_at IS NULL
    `).bind(activeCutoff).all<{ capabilities_json: string }>();
    for (const row of (activeRes.results || [])) {
      try {
        const caps = JSON.parse(row.capabilities_json) as string[];
        for (const cap of caps) {
          activeNodesByPlatform.set(cap, (activeNodesByPlatform.get(cap) || 0) + 1);
        }
      } catch {
        // ignore
      }
    }

    const scored = candidates.map((platform) => {
      const pendingJobs = jobsByPlatform.get(platform) || 0;
      const demandSignals = demandByPlatform.get(platform) || 0;
      const activeWorkers = activeNodesByPlatform.get(platform) || 0;
      const score = ((pendingJobs * 2) + (demandSignals * 5) + 1) / (activeWorkers + 1);
      return { platform, score };
    });

    scored.sort((a, b) => b.score - a.score);

    if (candidateCapabilities && candidateCapabilities.length > 0) {
      return scored.map((s) => s.platform);
    }
    const count = Math.min(3, scored.length);
    return scored.slice(0, count).map((s) => s.platform);
  }

  async issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<string> {
    const parsed = IssueNodeCredentialSchema.parse(input);
    if (!actor.trim()) throw new Error("Operator actor required");
    const capabilities = parsed.capabilities && parsed.capabilities.length > 0
      ? await this.evaluateWorkforceDistribution(parsed.capabilities)
      : await this.evaluateWorkforceDistribution();
    const token = await this.createNodeCredential(parsed.nodeId, capabilities);
    await this.db.prepare(`INSERT INTO node_credential_actions(node_id,actor,action,reason,occurred_at)
      VALUES (?,?,'issue',?,?)`).bind(parsed.nodeId, actor, parsed.reason, new Date(this.now()).toISOString()).run();
    return token;
  }

  async listLeadsPage(status: "pending_review" | "approved" | "rejected", limit: number,
    cursor: LeadCursor | null): Promise<{ leads: LeadRow[]; nextCursor: string | null; }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Lead limit must be 1..100");
    const after = cursor ? "AND (first_seen_at,lead_key)>(?,?)" : "";
    const params = cursor ? [status, cursor.firstSeenAt, cursor.leadKey, limit + 1] : [status, limit + 1];
    const res = await this.db.prepare(`SELECT lead_key,kind,target_url,claimed_package_id,discovered_from_url,
      discovered_from_item_key,status,first_seen_at,last_seen_at FROM source_leads
      WHERE status=? ${after} ORDER BY first_seen_at,lead_key LIMIT ?`)
      .bind(...params).all<LeadRow>();
    const rows = res.results || [];
    const leads = rows.slice(0, limit);
    const last = leads.at(-1);
    return {
      leads,
      nextCursor: rows.length > limit && last ? encodeLeadCursor({
        status,
        firstSeenAt: last.first_seen_at,
        leadKey: last.lead_key
      }) : null
    };
  }

  async approveVpmListingLead(leadKey: string, minDelayMs = 1000, actor = "local-cli",
    reason = "Operator reviewed listing", sourceRuleId?: string): Promise<string> {
    if (!reason.trim() || reason.length > 300) throw new Error("Approval reason required (at most 300 characters)");
    const lead = await this.db.prepare("SELECT kind,status,target_url FROM source_leads WHERE lead_key=?")
      .bind(leadKey).first<{ kind: string; status: string; target_url: string; }>();
    if (!lead) throw new Error("Lead not found");
    if (lead.status === "rejected") throw new Error("Rejected lead cannot be approved");
    let platform: Platform = "vpm";
    let purpose: SourcePurpose = "discovery";
    let jobUrl = lead.target_url;
    let delay = minDelayMs;

    if (lead.kind === "vpm_listing") {
      platform = "vpm";
      purpose = "discovery";
    } else if (lead.kind === "github_repository") {
      platform = "github";
      purpose = "metadata";
      const match = lead.target_url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)/);
      if (match) {
        jobUrl = `https://api.github.com/repos/${match[1].replace(/\.git$/, "")}`;
      }
      delay = Math.max(delay, 60000);
    } else if (lead.kind === "storefront_product") {
      purpose = "metadata";
      const urlObj = new URL(lead.target_url);
      if (urlObj.hostname === "booth.pm") platform = "booth";
      else if (urlObj.hostname === "gumroad.com") platform = "gumroad";
      else if (urlObj.hostname === "jinxxy.com") platform = "jinxxy";
      else if (urlObj.hostname === "sellfy.com") platform = "sellfy";
      else platform = "custom_domain";
      delay = Math.max(delay, 1500);
    } else if (lead.kind === "publisher_site") {
      platform = "custom_domain";
      purpose = "metadata";
      delay = Math.max(delay, 2000);
    } else {
      throw new Error("Only published VPM listing leads can become VPM crawl jobs");
    }

    const jobId = await this.seedJob(jobUrl, platform, delay, sourceRuleId, purpose);
    if (lead.status !== "approved") {
      await this.db.batch([
        this.db.prepare("UPDATE source_leads SET status='approved' WHERE lead_key=?").bind(leadKey),
        this.db.prepare(`INSERT INTO operator_actions(actor,action,lead_key,reason,occurred_at)
          VALUES (?,'approve_lead',?,?,?)`).bind(actor, leadKey, reason.trim(), new Date(this.now()).toISOString())
      ]);
    }
    return jobId;
  }

  async rejectLead(leadKey: string, actor: string, reason: string): Promise<void> {
    if (!reason.trim() || reason.length > 300) throw new Error("Rejection reason required (at most 300 characters)");
    const lead = await this.db.prepare("SELECT status FROM source_leads WHERE lead_key=?")
      .bind(leadKey).first<{ status: string; }>();
    if (!lead) throw new Error("Lead not found");
    if (lead.status === "approved") throw new Error("Approved lead cannot be rejected without revoking its job");
    if (lead.status === "rejected") return;
    await this.db.batch([
      this.db.prepare("UPDATE source_leads SET status='rejected' WHERE lead_key=?").bind(leadKey),
      this.db.prepare(`INSERT INTO operator_actions(actor,action,lead_key,reason,occurred_at)
        VALUES (?,'reject_lead',?,?,?)`).bind(actor, leadKey, reason.trim(), new Date(this.now()).toISOString())
    ]);
  }

  async listAutoQueueRulesPage(limit: number, cursor: RuleCursor | null): Promise<{ rules: AutoQueueRule[]; nextCursor: string | null; }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Rule limit must be 1..100");
    const before = cursor ? "WHERE (created_at,rule_id)<(?,?)" : "";
    const params = cursor ? [cursor.createdAt, cursor.ruleId, limit + 1] : [limit + 1];
    const res = await this.db.prepare(`SELECT * FROM lead_autoqueue_rules ${before}
      ORDER BY created_at DESC,rule_id DESC LIMIT ?`).bind(...params).all<AutoQueueRuleRow>();
    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      rules: visible.map((row) => this.autoQueueRuleFromRow(row)),
      nextCursor: rows.length > limit && last ? encodeRuleCursor({
        createdAt: last.created_at,
        ruleId: last.rule_id
      }) : null
    };
  }

  async createAutoQueueRule(input: CreateAutoQueueRule, actor: string): Promise<AutoQueueRule> {
    const parsed = CreateAutoQueueRuleSchema.parse(input);
    const now = new Date(this.now()).toISOString();
    if (parsed.expiresAt <= now) throw new Error("Rule expiry must be in the future");
    const existing = await this.db.prepare(`SELECT 1 FROM lead_autoqueue_rules
      WHERE lead_kind=? AND origin=? AND path_scope=? AND disabled_at IS NULL AND expires_at>?`)
      .bind(parsed.leadKind, parsed.origin, parsed.pathScope, now).first();
    if (existing) throw new Error("An active rule already covers this exact scope");
    const ruleId = crypto.randomUUID();
    await this.db.batch([
      this.db.prepare(`INSERT INTO lead_autoqueue_rules
        (rule_id,lead_kind,origin,path_scope,min_delay_ms,expires_at,review_reference,reason,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(ruleId, parsed.leadKind, parsed.origin, parsed.pathScope,
        parsed.minDelayMs, parsed.expiresAt, parsed.reviewReference, parsed.reason, now),
      this.db.prepare(`INSERT INTO operator_rule_actions(rule_id,actor,action,reason,occurred_at)
        VALUES (?,?,'create',?,?)`).bind(ruleId, actor, parsed.reason, now)
    ]);
    const row = await this.db.prepare("SELECT * FROM lead_autoqueue_rules WHERE rule_id=?")
      .bind(ruleId).first<AutoQueueRuleRow>();
    return this.autoQueueRuleFromRow(row!);
  }

  async disableAutoQueueRule(ruleId: string, actor: string, reason: string): Promise<AutoQueueRule> {
    if (!reason.trim() || reason.length > 300) throw new Error("Disable reason required (at most 300 characters)");
    const row = await this.db.prepare("SELECT * FROM lead_autoqueue_rules WHERE rule_id=?")
      .bind(ruleId).first<AutoQueueRuleRow>();
    if (!row) throw new Error("Rule not found");
    if (!row.disabled_at) {
      const now = new Date(this.now()).toISOString();
      const leasedRes = await this.db.prepare(`SELECT job_id,origin FROM crawl_jobs
        WHERE source_rule_id=? AND state='leased'`).bind(ruleId).all<{ job_id: string; origin: string; }>();
      const leased = leasedRes.results || [];
      const batchStmts = [
        this.db.prepare("UPDATE lead_autoqueue_rules SET disabled_at=? WHERE rule_id=?").bind(now, ruleId)
      ];
      for (const job of leased) {
        batchStmts.push(
          this.db.prepare(`UPDATE crawl_jobs SET state='pending',claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL
            WHERE job_id=?`).bind(job.job_id),
          this.db.prepare(`UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL
            WHERE origin=? AND active_job_id=?`).bind(job.origin, job.job_id)
        );
      }
      batchStmts.push(
        this.db.prepare(`INSERT INTO operator_rule_actions(rule_id,actor,action,reason,occurred_at)
          VALUES (?,?,'disable',?,?)`).bind(ruleId, actor, reason.trim(), now)
      );
      await this.db.batch(batchStmts);
      row.disabled_at = now;
    }
    return this.autoQueueRuleFromRow(row);
  }

  async listSourceAccessProfilesPage(limit: number, cursor: ProfileCursor | null): Promise<{ profiles: SourceAccessProfile[]; nextCursor: string | null; }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Profile limit must be 1..100");
    const before = cursor ? "WHERE (created_at,profile_id)<(?,?)" : "";
    const params = cursor ? [cursor.createdAt, cursor.profileId, limit + 1] : [limit + 1];
    const res = await this.db.prepare(`SELECT * FROM source_access_profiles ${before}
      ORDER BY created_at DESC,profile_id DESC LIMIT ?`).bind(...params).all<SourceAccessProfileRow>();
    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return {
      profiles: visible.map(row => this.sourceAccessProfileFromRow(row)),
      nextCursor: rows.length > limit && last ? encodeProfileCursor({
        createdAt: last.created_at, profileId: last.profile_id
      }) : null
    };
  }

  async createSourceAccessProfile(input: CreateSourceAccessProfile, actor: string): Promise<SourceAccessProfile> {
    const parsed = CreateSourceAccessProfileSchema.parse(input);
    const now = new Date(this.now()).toISOString();
    if (parsed.expiresAt <= now) throw new Error("Source profile expiry must be in the future");
    const profileId = crypto.randomUUID();
    const existingRes = await this.db.prepare(`SELECT path_scope,query_scope FROM source_access_profiles
      WHERE platform=? AND origin=? AND purpose=? AND disabled_at IS NULL AND expires_at>?`)
      .bind(parsed.platform, parsed.origin, parsed.purpose, now).all<{ path_scope: string; query_scope: string | null; }>();
    const existing = existingRes.results || [];
    if (existing.some(row => sourcePathScopesOverlap(row.path_scope, parsed.pathScope,
      row.query_scope ?? undefined, parsed.exactQuery))) {
      throw new Error("Overlapping active source profile requires disabling the old grant first");
    }
    await this.db.batch([
      this.db.prepare(`INSERT INTO source_access_profiles
        (profile_id,platform,origin,path_scope,query_scope,method,purpose,min_delay_ms,expires_at,
          review_reference,reason,retain_classes_json,publish_classes_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(profileId, parsed.platform, parsed.origin,
        parsed.pathScope, parsed.exactQuery ?? null, parsed.method, parsed.purpose, parsed.minDelayMs, parsed.expiresAt,
        parsed.reviewReference, parsed.reason, JSON.stringify(parsed.retainClasses),
        JSON.stringify(parsed.publishClasses), now),
      this.db.prepare(`INSERT INTO source_access_profile_actions
        (profile_id,actor,action,reason,occurred_at) VALUES (?,?,'create',?,?)`)
        .bind(profileId, actor, parsed.reason, now)
    ]);
    const row = await this.db.prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
      .bind(profileId).first<SourceAccessProfileRow>();
    return this.sourceAccessProfileFromRow(row!);
  }

  async disableSourceAccessProfile(profileId: string, actor: string, reason: string): Promise<SourceAccessProfile> {
    if (!reason.trim() || reason.length > 300) throw new Error("Disable reason required (at most 300 characters)");
    const row = await this.db.prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
      .bind(profileId).first<SourceAccessProfileRow>();
    if (!row) throw new Error("Source profile not found");
    if (row.disabled_at) return this.sourceAccessProfileFromRow(row);
    const now = new Date(this.now()).toISOString();

    const leasedRes = await this.db.prepare(`SELECT job_id,origin FROM crawl_jobs
      WHERE lease_profile_id=? AND state='leased'`).bind(profileId).all<{ job_id: string; origin: string; }>();
    const leased = leasedRes.results || [];

    const batchStmts = [
      this.db.prepare("UPDATE source_access_profiles SET disabled_at=? WHERE profile_id=?").bind(now, profileId)
    ];
    for (const job of leased) {
      batchStmts.push(
        this.db.prepare(`UPDATE crawl_jobs SET state='pending',claimed_by=NULL,lease_id=NULL,
          lease_expires_at=NULL,lease_profile_id=NULL WHERE job_id=?`).bind(job.job_id),
        this.db.prepare(`UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL
          WHERE origin=? AND active_job_id=?`).bind(job.origin, job.job_id)
      );
    }
    const dueDelay = await this.approvedDueProfileDelayForOrigin(row.origin, now);
    if (dueDelay === null) {
      batchStmts.push(this.db.prepare("DELETE FROM origin_robots_refresh_leases WHERE origin=?").bind(row.origin));
    }
    batchStmts.push(
      this.db.prepare(`INSERT INTO source_access_profile_actions
        (profile_id,actor,action,reason,occurred_at) VALUES (?,?,'disable',?,?)`)
        .bind(profileId, actor, reason.trim(), now)
    );
    await this.db.batch(batchStmts);
    const updatedRow = await this.db.prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
      .bind(profileId).first<SourceAccessProfileRow>();
    return this.sourceAccessProfileFromRow(updatedRow!);
  }

  async getCatalogEpoch(): Promise<string> {
    const row = await this.db.prepare("SELECT value FROM coordinator_meta WHERE key='catalog_epoch'").first<{ value: string }>();
    if (row) return row.value;
    const initial = "epoch-d1-default";
    await this.db.prepare("INSERT OR IGNORE INTO coordinator_meta(key, value) VALUES ('catalog_epoch', ?)").bind(initial).run();
    return initial;
  }

  async resetCatalogEpoch(): Promise<string> {
    const next = "epoch-d1-" + Math.random().toString(36).slice(2, 10);
    await this.db.prepare("INSERT INTO coordinator_meta(key, value) VALUES ('catalog_epoch', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(next).run();
    return next;
  }

  private async buildCatalogPackage(pkg: {
    canonical_id: string; umbrella: string; category: string; lifecycle: string;
    display_name: string; vpm_id: string | null; created_at: string; updated_at: string;
    published_at?: string | null; timestamp_confidence?: string | null;
  }): Promise<CatalogPackage> {
    const linkRes = await this.db.prepare(`SELECT link_id,source_key,evidence_kind,confidence,created_at
      FROM identity_links WHERE canonical_id=? AND review_state='accepted'
      ORDER BY created_at ASC`).bind(pkg.canonical_id).all<{
      link_id: string; source_key: string; evidence_kind: string;
      confidence: number; created_at: string;
    }>();
    const linkRows = linkRes.results || [];
    const acceptedLinks: CatalogIdentityLink[] = linkRows.map((l) => ({
      linkId: l.link_id, sourceKey: l.source_key,
      evidenceKind: l.evidence_kind as CatalogIdentityLink["evidenceKind"],
      confidence: l.confidence, createdAt: l.created_at
    }));
    const frontRes = await this.db.prepare(`SELECT front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at
      FROM package_fronts WHERE canonical_id=?
      ORDER BY observed_at ASC, front_id ASC`).bind(pkg.canonical_id).all<{
      front_id: string; canonical_id: string; source_key: string; platform: Platform;
      storefront_url: string; price: number | null; currency: string | null;
      availability: "available" | "delisted" | "unknown"; observed_at: string;
    }>();
    const frontRows = frontRes.results || [];
    const fronts: PackageFront[] = frontRows.map((f) => ({
      frontId: f.front_id,
      canonicalId: f.canonical_id,
      sourceKey: f.source_key,
      platform: f.platform,
      storefrontUrl: f.storefront_url,
      price: f.price,
      currency: f.currency,
      availability: f.availability,
      observedAt: f.observed_at
    }));
    return {
      canonicalId: pkg.canonical_id,
      umbrella: pkg.umbrella as CatalogPackage["umbrella"],
      category: pkg.category,
      lifecycle: pkg.lifecycle as CatalogPackage["lifecycle"],
      displayName: pkg.display_name,
      vpmId: pkg.vpm_id,
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at,
      publishedAt: pkg.published_at ?? null,
      timestampConfidence: (pkg.timestamp_confidence as any) ?? "observed",
      acceptedLinks,
      fronts
    };
  }

  async listCanonicalPackagesPage(limit: number, cursor: CatalogCursor | null): Promise<{ packages: CatalogPackage[]; nextCursor: string | null; }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Catalog limit must be 1..100");
    const before = cursor ? "WHERE (p.created_at,p.canonical_id)<(?,?)" : "";
    const params = cursor ? [cursor.createdAt, cursor.canonicalId, limit + 1] : [limit + 1];
    const pkgRes = await this.db.prepare(`SELECT * FROM canonical_packages p ${before}
      ORDER BY p.created_at DESC, p.canonical_id DESC LIMIT ?`)
      .bind(...params).all<{
        canonical_id: string; umbrella: string; category: string; lifecycle: string;
        display_name: string; vpm_id: string | null; created_at: string; updated_at: string;
      }>();
    const pkgRows = pkgRes.results || [];
    const visible = pkgRows.slice(0, limit);
    const last = visible.at(-1);
    const packages: CatalogPackage[] = [];
    for (const pkg of visible) {
      packages.push(await this.buildCatalogPackage(pkg));
    }
    return {
      packages,
      nextCursor: pkgRows.length > limit && last
        ? encodeCatalogCursor({ createdAt: last.created_at, canonicalId: last.canonical_id })
        : null
    };
  }

  async listCatalogDeltasPage(limit: number, cursor: CatalogDeltaCursor | null): Promise<{ epoch: string; deltas: CatalogDelta[]; nextCursor: string | null; }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Catalog limit must be 1..100");
    const epoch = await this.getCatalogEpoch();
    const after = cursor ? "WHERE (p.updated_at,p.canonical_id)>(?,?)" : "";
    const params = cursor ? [cursor.updatedAt, cursor.canonicalId, limit + 1] : [limit + 1];
    const pkgRes = await this.db.prepare(`SELECT * FROM canonical_packages p ${after}
      ORDER BY p.updated_at ASC, p.canonical_id ASC LIMIT ?`)
      .bind(...params).all<{
        canonical_id: string; umbrella: string; category: string; lifecycle: string;
        display_name: string; vpm_id: string | null; created_at: string; updated_at: string;
      }>();
    const pkgRows = pkgRes.results || [];
    const visible = pkgRows.slice(0, limit);
    const last = visible.at(-1);
    const deltas: CatalogDelta[] = [];
    for (const pkg of visible) {
      if (pkg.lifecycle === "delisted") {
        deltas.push({
          action: "delist",
          canonicalId: pkg.canonical_id,
          updatedAt: pkg.updated_at
        });
      } else {
        deltas.push({
          action: "upsert",
          canonicalId: pkg.canonical_id,
          updatedAt: pkg.updated_at,
          package: await this.buildCatalogPackage(pkg)
        });
      }
    }
    return {
      epoch,
      deltas,
      nextCursor: pkgRows.length > limit && last
        ? encodeCatalogDeltaCursor({ updatedAt: last.updated_at, canonicalId: last.canonical_id })
        : null
    };
  }

  // --- Seed & Robots Helpers ---
  async enqueueJob(input: EnqueueJobRequest, actor: string): Promise<string> {
    const parsed = EnqueueJobRequestSchema.parse(input);
    return this.seedJob(parsed.url, parsed.platform, parsed.minDelayMs, undefined, parsed.purpose,
      { actor, reason: parsed.reason });
  }

  async seedJob(url: string, platform: Platform, minDelayMs = 1000, sourceRuleId?: string,
    purpose: SourcePurpose = "metadata", audit?: { actor: string; reason: string }): Promise<string> {
    if (audit && (!audit.actor.trim() || audit.actor.length > 100 || !audit.reason.trim() || audit.reason.length > 300)) {
      throw new Error("Seed audit actor and reason required");
    }
    PlatformSchema.parse(platform);
    if (purpose !== "metadata" && purpose !== "discovery") throw new Error("Invalid job purpose");
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Crawl jobs require HTTPS");
    if (isItchSearchUrl(parsed.href)) throw new Error("itch.io /search is disallowed by published robots rules");
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    if (parsed.username || parsed.password || parsed.hash || (parsed.port && parsed.port !== "443") ||
      hostname.endsWith(".") || hostname.toLowerCase() === "localhost" ||
      (isIp(hostname) && isPrivateOrReservedIp(hostname))) {
      throw new Error("Crawl job target must be public credential-free HTTPS on port 443");
    }
    if ((platform === "github" || parsed.hostname === "api.github.com") &&
      (platform !== "github" || !githubApiRepositoryIdentity(parsed.href))) {
      throw new Error("GitHub jobs require a public REST repository metadata endpoint");
    }
    if (platform === "shopify") {
      if (purpose === "discovery" && !isShopifyProductSitemapTarget(parsed.href)) {
        throw new Error("Shopify discovery jobs require an exact product-sitemap discovery URL");
      }
      if (purpose === "metadata" && !shopifyProductLead(parsed.href, parsed.origin)) {
        throw new Error("Shopify metadata jobs require an exact merchant product URL");
      }
    }
    if (platform === "sellfy" && purpose === "metadata" && !isSellfyProductTarget(parsed.href)) {
      throw new Error("Sellfy metadata jobs require an exact product URL");
    }
    if (!Number.isInteger(minDelayMs) || minDelayMs < 0 || minDelayMs > 86400000) throw new Error("Invalid origin delay");
    const effectiveMinDelayMs = platform === "github" ? Math.max(minDelayMs, 60000) : minDelayMs;
    const origin = parsed.origin;
    const now = new Date(this.now()).toISOString();
    const id = crypto.randomUUID();

    const suppressed = await this.db.prepare("SELECT 1 FROM suppressed_urls WHERE url=?").bind(parsed.href).first();
    if (suppressed) {
      throw new Error("URL is suppressed and cannot be reseeded");
    }
    if (sourceRuleId) {
      const activeRule = await this.db.prepare(`SELECT 1 FROM lead_autoqueue_rules
        WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?`).bind(sourceRuleId, now).first();
      if (!activeRule) {
        throw new Error("Auto-queue rule is no longer active");
      }
    }

    const authoritySql = `NOT EXISTS (SELECT 1 FROM suppressed_urls WHERE url=?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules
        WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?))`;
    const authorityParams = [parsed.href, sourceRuleId || null, sourceRuleId || null, now];
    const batchStmts = [
      this.db.prepare(`INSERT OR IGNORE INTO crawl_jobs
        (job_id,platform,url,origin,state,next_fetch_at,created_at,source_rule_id,job_purpose)
        SELECT ?,?,?,?,'pending',?,?,?,? WHERE ${authoritySql}`)
        .bind(id, platform, parsed.href, origin, now, now, sourceRuleId || null, purpose, ...authorityParams),
      this.db.prepare(`INSERT OR IGNORE INTO origin_leases(origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms)
        SELECT ?,NULL,NULL,?,? WHERE EXISTS
        (SELECT 1 FROM crawl_jobs WHERE url=? AND platform=? AND job_purpose=?) AND ${authoritySql}`)
        .bind(origin, now, effectiveMinDelayMs, parsed.href, platform, purpose, ...authorityParams),
      this.db.prepare(`UPDATE origin_leases SET min_delay_ms = MAX(min_delay_ms, ?) WHERE origin = ?
        AND EXISTS (SELECT 1 FROM crawl_jobs WHERE url=? AND platform=? AND job_purpose=?) AND ${authoritySql}`)
        .bind(effectiveMinDelayMs, origin, parsed.href, platform, purpose, ...authorityParams)
    ];
    if (sourceRuleId) {
      batchStmts.push(
        this.db.prepare(`UPDATE crawl_jobs SET source_rule_id=?
          WHERE url=? AND platform=? AND job_purpose=? AND source_rule_id IS NOT NULL AND ${authoritySql}`)
          .bind(sourceRuleId, parsed.href, platform, purpose, ...authorityParams)
      );
    }
    if (audit) {
      batchStmts.push(this.db.prepare(`INSERT INTO job_seed_actions(action_id,job_id,actor,reason,occurred_at)
        SELECT ?,job_id,?,?,? FROM crawl_jobs WHERE url=? AND platform=? AND job_purpose=? AND ${authoritySql}`)
        .bind(crypto.randomUUID(), audit.actor, audit.reason.trim(), now, parsed.href, platform, purpose, ...authorityParams));
    }
    await this.db.batch(batchStmts);

    const stored = await this.db.prepare(`SELECT job_id,platform,job_purpose,
      EXISTS (SELECT 1 FROM suppressed_urls WHERE url=?) AS suppressed,
      (? IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules
        WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?)) AS rule_active
      FROM (SELECT 1) LEFT JOIN crawl_jobs ON url=?`)
      .bind(...authorityParams, parsed.href).first<{ job_id: string | null; platform: Platform | null;
        job_purpose: SourcePurpose | null; suppressed: number; rule_active: number; }>();
    if (stored?.suppressed) throw new Error("URL is suppressed and cannot be reseeded");
    if (stored && !stored.rule_active) throw new Error("Auto-queue rule is no longer active");
    if (!stored?.job_id) throw new Error("Job insertion failed");
    if (stored.platform !== platform) throw new Error("Existing job has a different reviewed platform");
    if (stored.job_purpose !== purpose) throw new Error("Existing job has a different reviewed purpose");
    return stored.job_id;
  }

  /** Reserve only a due, authorized origin; never grants a node fetch lease. */
  async reserveRobotsRefresh(origin: string): Promise<string | null> {
    OriginRobotsSnapshotSchema.parse({ origin, statusCode: 599, body: "" });
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const expires = new Date(nowMs + ROBOTS_REFRESH_LEASE_MS).toISOString();
    const leaseId = crypto.randomUUID();
    const delay = approvedRobotsJobDelaySql("?1", "?2");
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO origin_robots_refresh_leases(origin,lease_id,lease_expires_at)
        SELECT o.origin,?3,?4 FROM origin_leases o WHERE o.origin=?1 AND o.next_allowed_at<=?2
          AND (o.active_job_id IS NULL OR o.lease_expires_at<=?2)
          AND NOT EXISTS (SELECT 1 FROM origin_robots r WHERE r.origin=o.origin AND r.expires_at>?2)
          AND ${delay} IS NOT NULL
        ON CONFLICT(origin) DO UPDATE SET lease_id=excluded.lease_id,lease_expires_at=excluded.lease_expires_at
          WHERE origin_robots_refresh_leases.lease_expires_at<=?2`).bind(origin, now, leaseId, expires),
      this.db.prepare(`UPDATE origin_leases SET next_allowed_at=MAX(next_allowed_at,
        strftime('%Y-%m-%dT%H:%M:%fZ',julianday(?2)+MAX(min_delay_ms,${delay})/86400000.0))
        WHERE origin=?1 AND EXISTS (SELECT 1 FROM origin_robots_refresh_leases l
          WHERE l.origin=?1 AND l.lease_id=?3 AND l.lease_expires_at>?2)`)
        .bind(origin, now, leaseId)
    ]);
    return (results[0]?.meta as { changes?: number } | undefined)?.changes === 1 ? leaseId : null;
  }

  async releaseRobotsRefresh(origin: string, leaseId: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM origin_robots_refresh_leases WHERE origin=? AND lease_id=?")
      .bind(origin, leaseId).run();
    return (result.meta as { changes?: number } | undefined)?.changes === 1;
  }

  private robotsSnapshotStatements(parsed: OriginRobotsSnapshot, nowMs: number,
    guard: string | ((offset: number) => string) = "1", guardValues: unknown[] = []): D1PreparedStatement[] {
    const fetchedAt = new Date(nowMs).toISOString();
    const ttlMs = (parsed.statusCode >= 200 && parsed.statusCode < 300) ||
      robotsResultAllowsMissingFile(parsed.statusCode) ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    const expiresAt = new Date(nowMs + ttlMs).toISOString();
    return [
      this.db.prepare(`INSERT INTO origin_robots(origin,snapshot_id,status_code,body,fetched_at,expires_at)
        SELECT ?,?,?,?,?,? WHERE ${typeof guard === "string" ? guard : guard(6)} ON CONFLICT(origin) DO UPDATE SET
        snapshot_id=excluded.snapshot_id,status_code=excluded.status_code,body=excluded.body,
        fetched_at=excluded.fetched_at,expires_at=excluded.expires_at`)
        .bind(parsed.origin, crypto.randomUUID(), parsed.statusCode, parsed.body, fetchedAt, expiresAt, ...guardValues),
      this.db.prepare(`UPDATE crawl_jobs SET next_fetch_at=?,robots_deferred_until=NULL
        WHERE origin=? AND robots_deferred_until IS NOT NULL AND state IN ('pending','done','backoff') AND ${typeof guard === "string" ? guard : guard(2)}`)
        .bind(fetchedAt, parsed.origin, ...guardValues)
    ];
  }

  async completeRobotsRefresh(origin: string, leaseId: string, statusCode: number, body = ""): Promise<boolean> {
    const parsed = OriginRobotsSnapshotSchema.parse({ origin, statusCode, body });
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    // The guard uses positional placeholders relative to each statement's prefix.
    const guardFor = (offset: number) => `EXISTS (SELECT 1 FROM origin_robots_refresh_leases l
      WHERE l.origin=?${offset + 1} AND l.lease_id=?${offset + 2} AND l.lease_expires_at>?${offset + 3})
      AND ${approvedRobotsJobDelaySql(`?${offset + 1}`, `?${offset + 3}`)} IS NOT NULL`;
    const results = await this.db.batch([
      ...this.robotsSnapshotStatements(parsed, nowMs, guardFor, [origin, leaseId, now]),
      this.db.prepare(`DELETE FROM origin_robots_refresh_leases WHERE origin=?1 AND lease_id=?2
        AND ${guardFor(0)}`).bind(origin, leaseId, now)
    ]);
    const completed = (results[0]?.meta as { changes?: number } | undefined)?.changes === 1;
    if (completed) this.robotsMatchers.delete(parsed.origin);
    return completed;
  }

  async recordRobotsSnapshot(origin: string, statusCode: number, body = ""): Promise<void> {
    const parsed = OriginRobotsSnapshotSchema.parse({ origin, statusCode, body });
    await this.db.batch(this.robotsSnapshotStatements(parsed, this.now()));
    this.robotsMatchers.delete(parsed.origin);
  }

  async upsertSourceItem(item: {
    sourceKey: string;
    platform: Platform;
    sourceUrl: string;
    latestDigest: string;
    latestVersionNo?: number;
    goneAt?: string | null;
  }): Promise<void> {
    await this.db.prepare(`
      INSERT INTO source_items (source_key, platform, source_url, latest_digest, latest_version_no, gone_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        platform = excluded.platform,
        source_url = excluded.source_url,
        latest_digest = excluded.latest_digest,
        latest_version_no = excluded.latest_version_no,
        gone_at = excluded.gone_at
    `).bind(
      item.sourceKey,
      item.platform,
      item.sourceUrl,
      item.latestDigest,
      item.latestVersionNo ?? 1,
      item.goneAt ?? null
    ).run();
  }

  async upsertCanonicalPackage(pkg: {
    canonicalId: string;
    umbrella: CanonicalUmbrella;
    category: string;
    lifecycle: CanonicalLifecycle;
    displayName: string;
    vpmId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    publishedAt?: string | null;
    timestampConfidence?: "confirmed" | "inferred" | "observed" | null;
  }): Promise<CanonicalPackage & { publishedAt?: string | null; timestampConfidence?: string | null }> {
    const now = new Date(this.now()).toISOString();
    const createdAt = pkg.createdAt ?? now;
    const updatedAt = pkg.updatedAt ?? now;
    const vpmId = pkg.vpmId ?? null;
    const publishedAt = pkg.publishedAt ?? null;
    const timestampConfidence = pkg.timestampConfidence ?? (publishedAt ? "confirmed" : "observed");
    await this.db.prepare(`
      INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at, published_at, timestamp_confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_id) DO UPDATE SET
        umbrella = excluded.umbrella,
        category = excluded.category,
        lifecycle = excluded.lifecycle,
        display_name = excluded.display_name,
        vpm_id = COALESCE(excluded.vpm_id, canonical_packages.vpm_id),
        updated_at = excluded.updated_at,
        published_at = COALESCE(excluded.published_at, canonical_packages.published_at),
        timestamp_confidence = COALESCE(excluded.timestamp_confidence, canonical_packages.timestamp_confidence)
    `).bind(pkg.canonicalId, pkg.umbrella, pkg.category, pkg.lifecycle, pkg.displayName, vpmId, createdAt, updatedAt, publishedAt, timestampConfidence).run();
    const result = await this.getCanonicalPackage(pkg.canonicalId);
    return result!;
  }

  async getCanonicalPackage(canonicalId: string): Promise<(CanonicalPackage & { publishedAt?: string | null; timestampConfidence?: string | null }) | null> {
    const row = await this.db.prepare(
      "SELECT canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at, published_at, timestamp_confidence FROM canonical_packages WHERE canonical_id = ?"
    ).bind(canonicalId).first<{
      canonical_id: string;
      umbrella: CanonicalUmbrella;
      category: string;
      lifecycle: CanonicalLifecycle;
      display_name: string;
      vpm_id: string | null;
      created_at: string;
      updated_at: string;
      published_at: string | null;
      timestamp_confidence: string | null;
    }>();
    if (!row) return null;
    return {
      canonicalId: row.canonical_id,
      umbrella: row.umbrella,
      category: row.category,
      lifecycle: row.lifecycle,
      displayName: row.display_name,
      vpmId: row.vpm_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      timestampConfidence: row.timestamp_confidence
    };
  }

  async createIdentityLink(link: {
    linkId?: string;
    sourceKey: string;
    canonicalId: string;
    evidenceKind: EvidenceKind;
    confidence: number;
    reviewState?: LinkReviewState;
    createdAt?: string;
    reviewedAt?: string | null;
  }): Promise<IdentityLink> {
    if (link.confidence < 0.0 || link.confidence > 1.0) {
      throw new RangeError("confidence must be between 0.0 and 1.0");
    }
    const linkId = link.linkId ?? crypto.randomUUID();
    const now = new Date(this.now()).toISOString();
    const createdAt = link.createdAt ?? now;
    const reviewState = link.reviewState ?? "provisional";
    const reviewedAt = link.reviewedAt ?? (reviewState !== "provisional" ? now : null);
    await this.db.prepare(`
      INSERT INTO identity_links (link_id, source_key, canonical_id, evidence_kind, confidence, review_state, created_at, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(linkId, link.sourceKey, link.canonicalId, link.evidenceKind, link.confidence, reviewState, createdAt, reviewedAt).run();

    if (reviewState === "accepted" || reviewState === "provisional") {
      await this.syncPackageFrontFromSourceItem(link.canonicalId, link.sourceKey);
    }

    return {
      linkId,
      sourceKey: link.sourceKey,
      canonicalId: link.canonicalId,
      evidenceKind: link.evidenceKind,
      confidence: link.confidence,
      reviewState,
      createdAt,
      reviewedAt
    };
  }

  async listAvatarCompatibilities(sourceKey: string): Promise<AvatarCompatibility[]> {
    const res = await this.db.prepare(`
      SELECT compatibility_id, source_key, target_avatar_base, scope, confidence, evidence_source
      FROM avatar_compatibilities
      WHERE source_key = ?
      ORDER BY target_avatar_base ASC
    `).bind(sourceKey).all<{
      compatibility_id: string;
      source_key: string;
      target_avatar_base: string;
      scope: "named_base" | "universal" | "uncertain";
      confidence: "creator_declared" | "keyword_inferred" | "unverified";
      evidence_source: string;
    }>();
    const rows = res.results || [];
    return rows.map((r) => ({
      compatibilityId: r.compatibility_id,
      itemKey: r.source_key,
      targetAvatarBase: r.target_avatar_base,
      scope: r.scope,
      confidence: r.confidence,
      evidenceSource: r.evidence_source
    }));
  }

  async recordDesktopToolEvidence(evidence: DesktopToolEvidence & { confidence: number }): Promise<void> {
    const now = new Date(this.now()).toISOString();
    await this.db.prepare(`
      INSERT INTO desktop_tool_evidence
        (canonical_id, tool_subtype, supported_os, particular_vrchat_target, evidence_url, publisher_claim, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_id) DO UPDATE SET
        tool_subtype = excluded.tool_subtype,
        supported_os = excluded.supported_os,
        particular_vrchat_target = excluded.particular_vrchat_target,
        evidence_url = excluded.evidence_url,
        publisher_claim = excluded.publisher_claim,
        confidence = excluded.confidence
    `).bind(
      evidence.canonicalId,
      evidence.toolSubtype,
      JSON.stringify(evidence.supportedOS),
      evidence.particularVRChatTarget ? 1 : 0,
      evidence.evidenceUrl,
      evidence.publisherClaim,
      evidence.confidence,
      now
    ).run();
  }

  async getDesktopToolEvidence(canonicalId: string): Promise<(DesktopToolEvidence & { confidence: number }) | null> {
    const row = await this.db.prepare(`
      SELECT canonical_id, tool_subtype, supported_os, particular_vrchat_target, evidence_url, publisher_claim, confidence, created_at
      FROM desktop_tool_evidence
      WHERE canonical_id = ?
    `).bind(canonicalId).first<{
      canonical_id: string;
      tool_subtype: DesktopToolEvidence["toolSubtype"];
      supported_os: string;
      particular_vrchat_target: number;
      evidence_url: string;
      publisher_claim: string;
      confidence: number;
      created_at: string;
    }>();

    if (!row) return null;

    let supportedOS: DesktopToolEvidence["supportedOS"] = ["windows"];
    try {
      supportedOS = JSON.parse(row.supported_os);
    } catch {
      supportedOS = ["windows"];
    }

    return {
      canonicalId: row.canonical_id,
      toolSubtype: row.tool_subtype,
      supportedOS,
      particularVRChatTarget: row.particular_vrchat_target === 1,
      evidenceUrl: row.evidence_url,
      publisherClaim: row.publisher_claim,
      confidence: row.confidence
    };
  }

  async deleteCanonicalPackage(canonicalId: string): Promise<boolean> {
    const res = await this.db.prepare("DELETE FROM canonical_packages WHERE canonical_id = ?").bind(canonicalId).run();
    return ((res.meta as any)?.changes ?? 0) > 0;
  }

  async upsertPackageFront(front: {
    frontId?: string;
    canonicalId: string;
    sourceKey: string;
    platform: Platform;
    storefrontUrl: string;
    price?: number | null;
    currency?: string | null;
    availability?: "available" | "delisted" | "unknown";
    observedAt?: string;
  }): Promise<PackageFront> {
    const frontId = front.frontId ?? crypto.randomUUID();
    const now = new Date(this.now()).toISOString();
    const observedAt = front.observedAt ?? now;
    const availability = front.availability ?? "available";
    const price = front.price ?? null;
    const currency = front.currency ?? null;

    await this.db.prepare(`
      INSERT INTO package_fronts
        (front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_id, source_key) DO UPDATE SET
        platform = excluded.platform,
        storefront_url = excluded.storefront_url,
        price = excluded.price,
        currency = excluded.currency,
        availability = excluded.availability,
        observed_at = excluded.observed_at
    `).bind(frontId, front.canonicalId, front.sourceKey, front.platform, front.storefrontUrl, price, currency, availability, observedAt).run();

    const row = await this.db.prepare(`
      SELECT front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at
      FROM package_fronts WHERE canonical_id = ? AND source_key = ?
    `).bind(front.canonicalId, front.sourceKey).first<{
      front_id: string;
      canonical_id: string;
      source_key: string;
      platform: Platform;
      storefront_url: string;
      price: number | null;
      currency: string | null;
      availability: "available" | "delisted" | "unknown";
      observed_at: string;
    }>();

    return {
      frontId: row!.front_id,
      canonicalId: row!.canonical_id,
      sourceKey: row!.source_key,
      platform: row!.platform,
      storefrontUrl: row!.storefront_url,
      price: row!.price,
      currency: row!.currency,
      availability: row!.availability,
      observedAt: row!.observed_at
    };
  }

  async getPackageFrontsForCanonical(canonicalId: string): Promise<PackageFront[]> {
    const res = await this.db.prepare(`
      SELECT front_id, canonical_id, source_key, platform, storefront_url, price, currency, availability, observed_at
      FROM package_fronts WHERE canonical_id = ?
      ORDER BY observed_at ASC, front_id ASC
    `).bind(canonicalId).all<{
      front_id: string;
      canonical_id: string;
      source_key: string;
      platform: Platform;
      storefront_url: string;
      price: number | null;
      currency: string | null;
      availability: "available" | "delisted" | "unknown";
      observed_at: string;
    }>();
    const rows = res.results || [];
    return rows.map((r) => ({
      frontId: r.front_id,
      canonicalId: r.canonical_id,
      sourceKey: r.source_key,
      platform: r.platform,
      storefrontUrl: r.storefront_url,
      price: r.price,
      currency: r.currency,
      availability: r.availability,
      observedAt: r.observed_at
    }));
  }

  async deletePackageFront(frontId: string): Promise<boolean> {
    const res = await this.db.prepare("DELETE FROM package_fronts WHERE front_id = ?").bind(frontId).run();
    return ((res.meta as any)?.changes ?? 0) > 0;
  }

  private async syncPackageFrontFromSourceItem(canonicalId: string, sourceKey: string): Promise<void> {
    const item = await this.db.prepare(`
      SELECT si.platform, si.source_url, si.gone_at, sv.payload_json, sv.observed_at
      FROM source_items si
      LEFT JOIN source_versions sv ON sv.source_key = si.source_key AND sv.version_no = si.latest_version_no
      WHERE si.source_key = ?
    `).bind(sourceKey).first<{
      platform: Platform;
      source_url: string;
      gone_at: string | null;
      payload_json: string | null;
      observed_at: string | null;
    }>();

    if (!item) return;
    const isStorefront = STOREFRONT_PLATFORMS.has(item.platform);
    let price: number | null = null;
    let currency: string | null = null;
    let availability: "available" | "delisted" | "unknown" = item.gone_at ? "delisted" : "available";
    let storefrontUrl = item.source_url;

    if (item.payload_json) {
      try {
        const parsed = JSON.parse(item.payload_json);
        if (parsed.price !== undefined) price = parsed.price;
        if (parsed.currency !== undefined) currency = parsed.currency;
        if (parsed.availability !== undefined) availability = parsed.availability;
        if (parsed.storefrontUrl) storefrontUrl = parsed.storefrontUrl;
      } catch {}
    }

    if (isStorefront || price !== null) {
      await this.upsertPackageFront({
        canonicalId,
        sourceKey,
        platform: item.platform,
        storefrontUrl: cleanTrackingParams(storefrontUrl),
        price,
        currency,
        availability,
        observedAt: item.observed_at ?? new Date(this.now()).toISOString()
      });
    }
  }

  async recordRemovalReport(appId: string, input: ReportSubmissionRequest): Promise<ReportSubmissionResponse> {
    const parsed = ReportSubmissionRequestSchema.parse(input);
    if (parsed.reportType !== "removal_request") throw new CoordinatorConflict("Removal report required", 403);
    const reportId = crypto.randomUUID();
    const recordedAt = new Date(this.now()).toISOString();
    const result = await this.db.prepare(`INSERT INTO catalog_reports(report_id,app_id,report_type,payload_json,review_status,recorded_at)
      SELECT ?,app_id,'removal_request',?,'pending',? FROM registered_apps WHERE app_id=? AND revoked_at IS NULL`)
      .bind(reportId, JSON.stringify(parsed), recordedAt, appId).run();
    if ((result.meta as { changes?: number } | undefined)?.changes !== 1) throw new CoordinatorConflict("Invalid application credential", 403);
    return { schemaVersion: 1, status: "accepted", reportId, recordedAt };
  }

  /** Lists owned app metadata without credentials or hashes. */
  async listUserApps(userId: string, limit: number, cursor: string | null, appId?: string): Promise<UserAppListResponse> {
    const query = UserAppListQuerySchema.parse({ limit, cursor: cursor ?? undefined });
    const rows = await this.db.prepare(`SELECT a.app_id,a.app_name,a.permissions_json,a.created_at,a.revoked_at
      FROM registered_apps a JOIN user_app_ownership o ON o.app_id=a.app_id
      JOIN registered_users u ON u.user_id=o.user_id
      WHERE o.user_id=? AND u.revoked_at IS NULL AND (? IS NULL OR a.app_id>?) AND (? IS NULL OR a.app_id=?)
      ORDER BY a.app_id LIMIT ?`).bind(userId, query.cursor ?? null, query.cursor ?? null, appId ?? null, appId ?? null, query.limit + 1)
      .all<{ app_id: string; app_name: string; permissions_json: string; created_at: string; revoked_at: string | null }>();
    const items = rows.results ?? [];
    const apps = items.slice(0, query.limit).map(row => UserAppSchema.parse({ appId: row.app_id, appName: row.app_name,
      permissions: JSON.parse(row.permissions_json), createdAt: row.created_at, revokedAt: row.revoked_at }));
    return { schemaVersion: 1, apps, nextCursor: items.length > query.limit ? apps.at(-1)!.appId : null };
  }

  /** Registers a downstream client application with scoped application token. */
  async registerApp(input: RegisterAppRequest, ownerUserId?: string): Promise<RegisterAppResponse> {
    const parsed = RegisterAppRequestSchema.parse(input);
    const appId = crypto.randomUUID();
    const appToken = "vrcp_app_" + (await sha256Hex(crypto.randomUUID() + Date.now().toString())).slice(0, 64);
    const tokenHash = await sha256Hex(appToken);
    const now = new Date(this.now()).toISOString();
    const permissions = ["catalog:read", "catalog:search", "demand:feedback"];

    const insert = this.db.prepare(`
      INSERT INTO registered_apps (app_id, app_name, token_hash, contact_email, permissions_json, created_at, revoked_at)
      SELECT ?, ?, ?, ?, ?, ?, NULL WHERE ? IS NULL OR EXISTS (
        SELECT 1 FROM registered_users WHERE user_id=? AND revoked_at IS NULL)
    `).bind(appId, parsed.appName, tokenHash, parsed.contactEmail || null, JSON.stringify(permissions), now, ownerUserId ?? null, ownerUserId ?? null);
    const writes = [insert];
    if (ownerUserId !== undefined) writes.push(this.db.prepare(`INSERT INTO user_app_ownership(app_id,user_id)
      SELECT app_id,? FROM registered_apps WHERE app_id=?`).bind(ownerUserId, appId));
    const result = await this.db.batch(writes);
    if ((result[0]?.meta as { changes?: number } | undefined)?.changes !== 1) throw new CoordinatorConflict("Invalid user owner", 403);

    return {
      schemaVersion: 1,
      appId,
      appName: parsed.appName,
      appToken,
      permissions
    };
  }

  /** Authenticates a downstream application bearer token. */
  async authenticateApp(appToken: string): Promise<{ appId: string; appName: string; permissions: string[] } | null> {
    if (!/^vrcp_app_[a-f0-9]{64}$/.test(appToken)) return null;
    const tokenHash = await sha256Hex(appToken);
    const row = await this.db.prepare(`
      SELECT app_id, app_name, permissions_json, revoked_at
      FROM registered_apps
      WHERE token_hash = ?
    `).bind(tokenHash).first<{ app_id: string; app_name: string; permissions_json: string; revoked_at: string | null }>();
    if (!row || row.revoked_at) return null;
    return {
      appId: row.app_id,
      appName: row.app_name,
      permissions: JSON.parse(row.permissions_json) as string[]
    };
  }

  /** Ingests search activity and demand feedback signals from authenticated downstream clients. */
  async recordDownstreamFeedback(appId: string, input: DownstreamFeedbackRequest): Promise<DownstreamFeedbackResponse> {
    const parsed = DownstreamFeedbackRequestSchema.parse(input);
    const signalId = crypto.randomUUID();
    const recordedAt = new Date(this.now()).toISOString();

    await this.db.prepare(`
      INSERT INTO downstream_demand_signals (
        signal_id, app_id, signal_type, query, zero_hits, requested_platform,
        target_url, category, metadata_json, recorded_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      signalId,
      appId,
      parsed.signalType,
      parsed.query || null,
      parsed.zeroHits ? 1 : 0,
      parsed.requestedPlatform || null,
      parsed.targetUrl || null,
      parsed.category || null,
      parsed.metadata ? JSON.stringify(parsed.metadata) : null,
      recordedAt
    ).run();

    return {
      schemaVersion: 1,
      status: "accepted",
      signalId,
      recordedAt
    };
  }

  /** Configurable search across canonical packages for registered downstream applications. */
  async searchCatalogPackages(input: CatalogSearchRequest): Promise<CatalogSearchResponse> {
    const parsed = CatalogSearchRequestSchema.parse(input);
    const limit = Math.min(Math.max(parsed.limit ?? 50, 1), 100);
    const conditions = ["p.lifecycle != 'delisted'"];
    const params: (string | number)[] = [];

    if (parsed.umbrella) {
      conditions.push("p.umbrella = ?");
      params.push(parsed.umbrella);
    }
    if (parsed.category) {
      conditions.push("p.category = ?");
      params.push(parsed.category);
    }
    if (parsed.platform) {
      conditions.push("EXISTS (SELECT 1 FROM package_fronts pf WHERE pf.canonical_id = p.canonical_id AND pf.platform = ?)");
      params.push(parsed.platform);
    }
    if (parsed.query && parsed.query.trim()) {
      const term = `%${parsed.query.trim()}%`;
      conditions.push("(p.display_name LIKE ? OR p.category LIKE ? OR p.vpm_id LIKE ?)");
      params.push(term, term, term);
    }

    if (parsed.tags && parsed.tags.length > 0) {
      for (const tag of parsed.tags) {
        const cleanTag = tag.trim().toLowerCase();
        if (!cleanTag) continue;
        const tagPattern = `%${cleanTag}%`;
        conditions.push(`(
          p.category LIKE ? OR
          p.umbrella = ? OR
          EXISTS (
            SELECT 1 FROM identity_links il
            JOIN avatar_compatibilities ac ON ac.source_key = il.source_key
            WHERE il.canonical_id = p.canonical_id AND il.review_state = 'accepted'
              AND (ac.target_avatar_base LIKE ? OR ac.scope LIKE ?)
          ) OR
          p.display_name LIKE ?
        )`);
        params.push(tagPattern, cleanTag, tagPattern, tagPattern, tagPattern);
      }
    }

    const hasKeywordQuery = Boolean(parsed.query && parsed.query.trim());

    if (parsed.cursor) {
      const decoded = decodeCatalogCursor(parsed.cursor);
      if (decoded) {
        if (!hasKeywordQuery) {
          conditions.push("(COALESCE(p.published_at, p.created_at) < ? OR (COALESCE(p.published_at, p.created_at) = ? AND p.canonical_id < ?))");
          params.push(decoded.createdAt, decoded.createdAt, decoded.canonicalId);
        } else {
          conditions.push("(p.created_at < ? OR (p.created_at = ? AND p.canonical_id < ?))");
          params.push(decoded.createdAt, decoded.createdAt, decoded.canonicalId);
        }
      }
    }

    const whereClause = conditions.join(" AND ");
    const countRes = await this.db.prepare(`
      SELECT COUNT(*) as total FROM canonical_packages p WHERE ${whereClause}
    `).bind(...params).first<{ total: number }>();

    const orderClause = hasKeywordQuery
      ? "ORDER BY p.created_at DESC, p.canonical_id DESC"
      : "ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.canonical_id DESC";

    const queryParams = [...params, limit + 1];
    const res = await this.db.prepare(`
      SELECT p.canonical_id, p.umbrella, p.category, p.lifecycle, p.display_name, p.vpm_id, p.created_at, p.updated_at, p.published_at, p.timestamp_confidence
      FROM canonical_packages p
      WHERE ${whereClause}
      ${orderClause}
      LIMIT ?
    `).bind(...queryParams).all<{
      canonical_id: string; umbrella: string; category: string; lifecycle: string;
      display_name: string; vpm_id: string | null; created_at: string; updated_at: string;
      published_at: string | null; timestamp_confidence: string | null;
    }>();

    const rows = res.results || [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible.at(-1);

    const items: CatalogPackage[] = [];
    for (const row of visible) {
      items.push(await this.buildCatalogPackage(row));
    }

    const nextCursor = hasMore && last
      ? encodeCatalogCursor({
          createdAt: !hasKeywordQuery ? (last.published_at || last.created_at) : last.created_at,
          canonicalId: last.canonical_id
        })
      : null;

    return {
      schemaVersion: 1,
      items,
      nextCursor,
      totalEstimated: countRes?.total ?? 0
    };
  }

  /** Issues a `vrcp_usr_` token for a new or returning user. */
  async issueUserToken(userName: string, contactEmail?: string): Promise<{
    userId: string; userName: string; token: string;
  }> {
    if (!userName.trim()) throw new Error("User name required");
    const userId = crypto.randomUUID();
    const entropy = generateToken();
    const token = `vrcp_usr_${entropy}`;
    const tokenHash = await sha256Hex(token);
    const now = new Date(this.now()).toISOString();
    await this.db.prepare(`
      INSERT INTO registered_users (user_id, user_name, token_hash, contact_email, created_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).bind(userId, userName.trim(), tokenHash, contactEmail || null, now).run();
    return { userId, userName: userName.trim(), token };
  }

  /** Authenticates a user bearer token. */
  async authenticateUser(token: string): Promise<{ userId: string; userName: string } | null> {
    if (!/^vrcp_usr_[a-f0-9]{64}$/.test(token)) return null;
    const tokenHash = await sha256Hex(token);
    const row = await this.db.prepare(`
      SELECT user_id, user_name, revoked_at FROM registered_users WHERE token_hash = ?
    `).bind(tokenHash).first<{ user_id: string; user_name: string; revoked_at: string | null }>();
    if (!row || row.revoked_at) return null;
    return { userId: row.user_id, userName: row.user_name };
  }

  /**
   * Records a creator/user delisting request and immediately suppresses the target.
   * Unauthenticated creators use proof verification pathways (dns_txt, storefront_bio_token, manual_notice).
   * Authenticated users may self-service delist on their behalf without external proof.
   */
  async submitDelistRequest(input: {
    targetUrl?: string;
    canonicalId?: string;
    reason: string;
    requesterType: "unauthenticated_creator" | "user" | "admin_operator";
    requesterId?: string;
    proofKind?: "storefront_bio_token" | "dns_txt" | "manual_notice";
    proofValue?: string;
    contactEmail?: string;
  }): Promise<DelistResponse> {
    if (!input.targetUrl && !input.canonicalId) {
      throw new Error("Either targetUrl or canonicalId must be provided");
    }
    const takedownId = crypto.randomUUID();
    const recordedAt = new Date(this.now()).toISOString();
    const target = input.targetUrl || input.canonicalId!;
    const reviewStatus = input.requesterType === "unauthenticated_creator" ? "pending" : "accepted";

    await this.db.prepare(`
      INSERT INTO creator_opt_outs (
        takedown_id, target_url, canonical_id, requester_type, requester_id,
        reason, proof_kind, proof_value, contact_email, recorded_at, review_status, review_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).bind(
      takedownId,
      input.targetUrl || null,
      input.canonicalId || null,
      input.requesterType,
      input.requesterId || null,
      input.reason,
      input.proofKind || null,
      input.proofValue || null,
      input.contactEmail || null,
      recordedAt,
      reviewStatus
    ).run();

    // Suppress the URL in the crawl queue if a targetUrl was given
    if (input.targetUrl) {
      try {
        const normalized = new URL(input.targetUrl).href;
        await this.db.prepare(
          "INSERT OR REPLACE INTO suppressed_urls(url,reason,suppressed_at) VALUES (?,?,?)"
        ).bind(normalized, `Delisting request ${takedownId}: ${input.reason}`, recordedAt).run();
        const job = await this.db.prepare(
          "SELECT job_id,origin FROM crawl_jobs WHERE url=?"
        ).bind(normalized).first<{ job_id: string; origin: string }>();
        if (job) {
          await this.db.prepare(
            "UPDATE crawl_jobs SET state='blocked',claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=?"
          ).bind(job.job_id).run();
          await this.db.prepare(
            "UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL WHERE origin=? AND active_job_id=?"
          ).bind(job.origin, job.job_id).run();
        }
      } catch { /* URL may not exist in queue; suppression is best-effort */ }
    }

    // Transition matching canonical packages to delisted lifecycle
    if (input.canonicalId) {
      await this.db.prepare(`
        UPDATE canonical_packages SET lifecycle = 'delisted', updated_at = ?
        WHERE canonical_id = ? AND lifecycle != 'delisted'
      `).bind(recordedAt, input.canonicalId).run();
    }
    if (input.targetUrl) {
      await this.db.prepare(`
        UPDATE canonical_packages SET lifecycle = 'delisted', updated_at = ?
        WHERE canonical_id IN (
          SELECT DISTINCT pf.canonical_id FROM package_fronts pf WHERE pf.storefront_url = ?
        ) AND lifecycle != 'delisted'
      `).bind(recordedAt, input.targetUrl).run();
    }

    return {
      schemaVersion: DOWNSTREAM_PROTOCOL_VERSION,
      status: "accepted",
      takedownId,
      target,
      action: "delisted",
      requesterType: input.requesterType,
      recordedAt
    };
  }

  async listTakedownsPage(
    requesterType?: string,
    limit = 100,
    cursor: TakedownCursor | null = null
  ): Promise<{ records: TakedownRecord[]; nextCursor: string | null; }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Takedown limit must be 1..100");
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (requesterType) {
      conditions.push("requester_type = ?");
      params.push(requesterType);
    }
    if (cursor) {
      conditions.push("(recorded_at, takedown_id) < (?, ?)");
      params.push(cursor.recordedAt, cursor.takedownId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit + 1);

    const res = await this.db.prepare(`
      SELECT takedown_id, target_url, canonical_id, requester_type, requester_id,
             reason, proof_kind, proof_value, contact_email, review_status, review_notes, recorded_at
      FROM creator_opt_outs
      ${where}
      ORDER BY recorded_at DESC, takedown_id DESC
      LIMIT ?
    `).bind(...params).all<{
      takedown_id: string;
      target_url: string | null;
      canonical_id: string | null;
      requester_type: "unauthenticated_creator" | "user" | "admin_operator";
      requester_id: string | null;
      reason: string;
      proof_kind: "storefront_bio_token" | "dns_txt" | "manual_notice" | null;
      proof_value: string | null;
      contact_email: string | null;
      review_status: "pending" | "accepted" | "rejected";
      review_notes: string | null;
      recorded_at: string;
    }>();

    const rows = res.results || [];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);

    const records: TakedownRecord[] = visible.map((row) => ({
      takedownId: row.takedown_id,
      targetUrl: row.target_url,
      canonicalId: row.canonical_id,
      requesterType: row.requester_type,
      requesterId: row.requester_id,
      reason: row.reason,
      proofKind: row.proof_kind,
      proofValue: row.proof_value,
      contactEmail: row.contact_email,
      reviewStatus: row.review_status,
      reviewNotes: row.review_notes,
      recordedAt: row.recorded_at
    }));

    return {
      records,
      nextCursor: rows.length > limit && last ? encodeTakedownCursor({
        recordedAt: last.recorded_at,
        takedownId: last.takedown_id
      }) : null
    };
  }

  async verifyTakedown(
    takedownId: string,
    verdict: "accepted" | "rejected",
    actor: string,
    notes?: string
  ): Promise<{ takedownId: string; status: "accepted" | "rejected"; updatedAt: string; }> {
    const row = await this.db.prepare(`
      SELECT takedown_id, target_url, canonical_id, requester_type, review_status
      FROM creator_opt_outs
      WHERE takedown_id = ?
    `).bind(takedownId).first<{
      takedown_id: string;
      target_url: string | null;
      canonical_id: string | null;
      requester_type: string;
      review_status: string;
    }>();

    if (!row) {
      throw new Error("Takedown not found");
    }

    const updatedAt = new Date(this.now()).toISOString();
    const batchStatements: D1PreparedStatement[] = [
      this.db.prepare(`
        UPDATE creator_opt_outs
        SET review_status = ?, review_notes = ?
        WHERE takedown_id = ?
      `).bind(verdict, notes || null, takedownId)
    ];

    if (verdict === "rejected") {
      if (row.canonical_id) {
        batchStatements.push(
          this.db.prepare(`
            UPDATE canonical_packages
            SET lifecycle = 'active', updated_at = ?
            WHERE canonical_id = ? AND lifecycle = 'delisted'
          `).bind(updatedAt, row.canonical_id)
        );
      }
      if (row.target_url) {
        try {
          const normalized = new URL(row.target_url).href;
          batchStatements.push(
            this.db.prepare("DELETE FROM suppressed_urls WHERE url = ?").bind(normalized),
            this.db.prepare("UPDATE crawl_jobs SET state = 'pending' WHERE url = ? AND state = 'blocked'").bind(normalized)
          );
        } catch { /* URL normalization best-effort */ }

        batchStatements.push(
          this.db.prepare(`
            UPDATE canonical_packages
            SET lifecycle = 'active', updated_at = ?
            WHERE canonical_id IN (
              SELECT DISTINCT pf.canonical_id FROM package_fronts pf WHERE pf.storefront_url = ?
            ) AND lifecycle = 'delisted'
          `).bind(updatedAt, row.target_url)
        );
      }
    }

    await this.db.batch(batchStatements);

    return {
      takedownId,
      status: verdict,
      updatedAt
    };
  }
}
