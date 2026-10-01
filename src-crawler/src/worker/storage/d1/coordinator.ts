import { type CrawlerRules, compileRobotsText } from "@trybyte/robotstxt-parser";
import { CRAWLER_ROBOTS_TOKEN } from "../../../shared/robots/crawler_identity.ts";
import { isPrivateOrReservedIp } from "../../../shared/policy/ip_policy.ts";
import { type Platform, type HeartbeatRequest, type HeartbeatResponse, PROTOCOL_VERSION, type ClaimRequest, type ClaimResponse, type ResultRequest, type ResultResponse, observationMatchesPlatform, ClaimRequestSchema, PlatformSchema } from "../../../shared/protocol/node_protocol.ts";
import { type AutoQueueRule, AutoQueueRuleSchema, type IssueNodeCredential, IssueNodeCredentialSchema, type LeadCursor, type LeadRow, encodeLeadCursor, type RuleCursor, encodeRuleCursor, type CreateAutoQueueRule, CreateAutoQueueRuleSchema, type CatalogCursor, type CatalogPackage, type CatalogIdentityLink, type PackageFront, encodeCatalogCursor } from "../../../shared/protocol/operator_protocol.ts";
import { robotsResultAllowsMissingFile, OriginRobotsSnapshotSchema } from "../../../shared/robots/robots_snapshot.ts";
import { type SourceAccessProfile, SourceAccessProfileSchema, sourceAccessProfileMatches, type SourcePurpose, type ProfileCursor, encodeProfileCursor, type CreateSourceAccessProfile, CreateSourceAccessProfileSchema, sourcePathScopesOverlap } from "../../../shared/policy/source_access_profile.ts";
import { isItchSearchUrl } from "../../../shared/policy/source_path_policy.ts";
import { isBoothBrowseTarget, boothItemIdentity, isShopifyProductSitemapTarget, shopifyProductLead, githubApiRepositoryIdentity, isSellfyProductTarget } from "../../../shared/policy/source_targets.ts";
import { type CoordinatorStore, type NodePrincipal, CoordinatorConflict } from "../../api/handler.ts";
import type { OperatorStore } from "../../api/operator_handler.ts";
import type { PublicCatalogStore } from "../../api/public_handler.ts";
import { type CatalogDelta, type CatalogDeltaCursor, encodeCatalogDeltaCursor } from "../../../shared/protocol/catalog_protocol.ts";
import { D1_SCHEMA_SQL, sha256Hex, timingSafeEqual, generateToken, isIp } from "./utils.ts";
import { D1Database, AutoQueueRuleRow, SourceAccessProfileRow, JobRow, D1PreparedStatement, CanonicalUmbrella, CanonicalLifecycle, CanonicalPackage, EvidenceKind, LinkReviewState, IdentityLink } from "./definitions.ts";
import { deriveCategoryFromTags, type DesktopToolEvidence } from "../../../shared/taxonomy/taxonomy.ts";
import { extractAvatarCompatibility, type AvatarCompatibility } from "../../../shared/taxonomy/avatar_compatibility.ts";


export class Coordinator implements CoordinatorStore, OperatorStore, PublicCatalogStore {
  private readonly robotsMatchers = new Map<string, { snapshotId: string; matcher: CrawlerRules; }>();

  constructor(
    readonly db: D1Database,
    readonly now: () => number = Date.now
  ) { }

  async initSchema(): Promise<void> {
    await this.db.exec(D1_SCHEMA_SQL);
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

    return {
      nodeId,
      capabilities: JSON.parse(row.capabilities_json) as Platform[],
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
    const query = `
      SELECT j.*,r.snapshot_id AS robots_snapshot_id,r.status_code AS robots_status_code,
        r.body AS robots_body,r.expires_at AS robots_expires_at FROM crawl_jobs j
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
      ORDER BY j.next_fetch_at ASC, j.created_at ASC, j.job_id ASC LIMIT 100 OFFSET ?
    `;

    let offset = 0;
    for (; ;) {
      const bindParams = [now, now, ...request.capabilities, now, now, now, now, now, now, offset];
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
            claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=?`)
            .bind(job.robots_expires_at, job.robots_expires_at, job.job_id).run();
          deferred = true;
          continue;
        }
        const lease = await this.db.prepare("SELECT * FROM origin_leases WHERE origin = ?").bind(job.origin).first<{
          active_job_id: string | null; lease_expires_at: string | null;
          next_allowed_at: string; min_delay_ms: number;
        }>();
        if (!lease) continue;
        if (lease.next_allowed_at > now || (lease.active_job_id && lease.lease_expires_at && lease.lease_expires_at > now)) continue;
        const expires = new Date(nowMs + 5 * 60 * 1000).toISOString();
        const leaseId = crypto.randomUUID();
        const nextAllowed = new Date(nowMs + Math.max(lease.min_delay_ms, profile.minDelayMs)).toISOString();

        await this.db.batch([
          this.db.prepare(`UPDATE crawl_jobs SET state='leased',claimed_by=?,lease_id=?,
            lease_expires_at=?,lease_profile_id=? WHERE job_id=?`)
            .bind(principal.nodeId, leaseId, expires, profile.profileId, job.job_id),
          this.db.prepare("UPDATE origin_leases SET active_job_id=?,lease_expires_at=?,next_allowed_at=? WHERE origin=?")
            .bind(job.job_id, expires, nextAllowed, job.origin)
        ]);
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
        batchStmts.push(
          this.db.prepare(`INSERT INTO canonical_packages
            (canonical_id,umbrella,category,lifecycle,display_name,vpm_id,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(canonical_id) DO UPDATE SET
              display_name=excluded.display_name,
              vpm_id=COALESCE(excluded.vpm_id,canonical_packages.vpm_id),
              updated_at=excluded.updated_at`).bind(
            vpmId, "tools", deriveCategoryFromTags(observation.platformTags, "vpm_package"), "active", observation.title, vpmId, now, now),
          this.db.prepare(`INSERT OR IGNORE INTO identity_links
            (link_id,source_key,canonical_id,evidence_kind,confidence,review_state,created_at,reviewed_at)
            VALUES (?,?,?,'vpm_id',1.0,'accepted',?,?)`).bind(
            crypto.randomUUID(), sourceKey, vpmId, now, now)
        );
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
    }

    if (outcome.kind === "gone") {
      const currentItemsRes = await this.db.prepare(`SELECT source_key FROM source_items
        WHERE platform=? AND source_url=? AND gone_at IS NULL`).bind(job.platform, job.url).all<{ source_key: string; }>();
      const currentItems = currentItemsRes.results || [];
      for (const item of currentItems) {
        batchStmts.push(
          this.db.prepare("UPDATE source_items SET gone_at=? WHERE source_key=?").bind(now, item.source_key),
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
  async createNodeCredential(nodeId: string, capabilities: Platform[]): Promise<string> {
    ClaimRequestSchema.parse({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities });
    const token = generateToken();
    const hash = await sha256Hex(token);
    await this.db.prepare(`
      INSERT INTO node_credentials(node_id,token_hash,capabilities_json,revoked_at)
      VALUES (?,?,?,NULL)
      ON CONFLICT(node_id) DO UPDATE SET token_hash=excluded.token_hash,
        capabilities_json=excluded.capabilities_json, revoked_at=NULL
    `).bind(nodeId, hash, JSON.stringify([...new Set(capabilities)])).run();
    return token;
  }

  async issueNodeCredential(input: IssueNodeCredential, actor: string): Promise<string> {
    const parsed = IssueNodeCredentialSchema.parse(input);
    if (!actor.trim()) throw new Error("Operator actor required");
    const token = await this.createNodeCredential(parsed.nodeId, parsed.capabilities);
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
    if (lead.kind !== "vpm_listing") throw new Error("Only published VPM listing leads can become VPM crawl jobs");
    if (lead.status === "rejected") throw new Error("Rejected lead cannot be approved");
    const jobId = await this.seedJob(lead.target_url, "vpm", minDelayMs, sourceRuleId, "discovery");
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
  async seedJob(url: string, platform: Platform, minDelayMs = 1000, sourceRuleId?: string,
    purpose: SourcePurpose = "metadata"): Promise<string> {
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

    const batchStmts = [
      this.db.prepare(`INSERT OR IGNORE INTO origin_leases(origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms)
        VALUES (?,NULL,NULL,?,?)`).bind(origin, now, effectiveMinDelayMs),
      this.db.prepare("UPDATE origin_leases SET min_delay_ms = MAX(min_delay_ms, ?) WHERE origin = ?")
        .bind(effectiveMinDelayMs, origin),
      this.db.prepare(`INSERT OR IGNORE INTO crawl_jobs
        (job_id,platform,url,origin,state,next_fetch_at,created_at,source_rule_id,job_purpose)
        VALUES (?,?,?,?,'pending',?,?,?,?)`)
        .bind(id, platform, parsed.href, origin, now, now, sourceRuleId || null, purpose)
    ];
    if (sourceRuleId) {
      batchStmts.push(
        this.db.prepare(`UPDATE crawl_jobs SET source_rule_id=?
          WHERE url=? AND source_rule_id IS NOT NULL`).bind(sourceRuleId, parsed.href)
      );
    }
    await this.db.batch(batchStmts);

    const stored = await this.db.prepare("SELECT job_id,job_purpose FROM crawl_jobs WHERE url = ?")
      .bind(parsed.href).first<{ job_id: string; job_purpose: SourcePurpose; }>();
    if (!stored) throw new Error("Job insertion failed");
    if (stored.job_purpose !== purpose) throw new Error("Existing job has a different reviewed purpose");
    return stored.job_id;
  }

  async recordRobotsSnapshot(origin: string, statusCode: number, body = ""): Promise<void> {
    const parsed = OriginRobotsSnapshotSchema.parse({ origin, statusCode, body });
    const nowMs = this.now();
    const fetchedAt = new Date(nowMs).toISOString();
    const ttlMs = (parsed.statusCode >= 200 && parsed.statusCode < 300) ||
      robotsResultAllowsMissingFile(parsed.statusCode) ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    const expiresAt = new Date(nowMs + ttlMs).toISOString();
    await this.db.batch([
      this.db.prepare(`INSERT INTO origin_robots(origin,snapshot_id,status_code,body,fetched_at,expires_at)
        VALUES (?,?,?,?,?,?) ON CONFLICT(origin) DO UPDATE SET
        snapshot_id=excluded.snapshot_id,status_code=excluded.status_code,body=excluded.body,
        fetched_at=excluded.fetched_at,expires_at=excluded.expires_at`)
        .bind(parsed.origin, crypto.randomUUID(), parsed.statusCode, parsed.body, fetchedAt, expiresAt),
      this.db.prepare(`UPDATE crawl_jobs SET next_fetch_at=?,robots_deferred_until=NULL
        WHERE origin=? AND robots_deferred_until IS NOT NULL AND state IN ('pending','done','backoff')`)
        .bind(fetchedAt, parsed.origin)
    ]);
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
  }): Promise<CanonicalPackage> {
    const now = new Date(this.now()).toISOString();
    const createdAt = pkg.createdAt ?? now;
    const updatedAt = pkg.updatedAt ?? now;
    const vpmId = pkg.vpmId ?? null;
    await this.db.prepare(`
      INSERT INTO canonical_packages (canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canonical_id) DO UPDATE SET
        umbrella = excluded.umbrella,
        category = excluded.category,
        lifecycle = excluded.lifecycle,
        display_name = excluded.display_name,
        vpm_id = COALESCE(excluded.vpm_id, canonical_packages.vpm_id),
        updated_at = excluded.updated_at
    `).bind(pkg.canonicalId, pkg.umbrella, pkg.category, pkg.lifecycle, pkg.displayName, vpmId, createdAt, updatedAt).run();
    const result = await this.getCanonicalPackage(pkg.canonicalId);
    return result!;
  }

  async getCanonicalPackage(canonicalId: string): Promise<CanonicalPackage | null> {
    const row = await this.db.prepare(
      "SELECT canonical_id, umbrella, category, lifecycle, display_name, vpm_id, created_at, updated_at FROM canonical_packages WHERE canonical_id = ?"
    ).bind(canonicalId).first<{
      canonical_id: string;
      umbrella: CanonicalUmbrella;
      category: string;
      lifecycle: CanonicalLifecycle;
      display_name: string;
      vpm_id: string | null;
      created_at: string;
      updated_at: string;
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
      updatedAt: row.updated_at
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
}
