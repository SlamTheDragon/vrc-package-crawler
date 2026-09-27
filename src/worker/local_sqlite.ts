import { Database } from "bun:sqlite";
import crypto from "node:crypto";
import { isIP } from "node:net";
import {
  ClaimRequestSchema, ObservationSchema, PlatformSchema, PROTOCOL_VERSION,
  type ClaimRequest, type ClaimResponse, type HeartbeatRequest, type HeartbeatResponse,
  type Observation, type Platform, type ResultRequest, type ResultResponse
} from "../shared/node_protocol.ts";
import { CoordinatorConflict, type CoordinatorStore, type NodePrincipal } from "./handler.ts";
import { isPrivateOrReservedIp } from "../shared/ip_policy.ts";
import { githubApiRepositoryIdentity } from "../shared/source_targets.ts";

type JobRow = {
  job_id: string; platform: Platform; url: string; origin: string; state: string;
  next_fetch_at: string; lease_id: string | null; lease_expires_at: string | null; claimed_by: string | null;
  etag: string | null; last_modified: string | null;
};

export class LocalCoordinatorStore implements CoordinatorStore {
  readonly db: Database;
  private readonly now: () => number;

  constructor(databasePath: string = ":memory:", now: () => number = Date.now) {
    this.db = new Database(databasePath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA foreign_keys = ON;");
    this.db.run("PRAGMA busy_timeout = 10000;");
    this.now = now;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS node_credentials (
        node_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, capabilities_json TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS node_heartbeats (
        node_id TEXT PRIMARY KEY, last_seen_at TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('idle','fetching')), active_job_id TEXT,
        FOREIGN KEY(node_id) REFERENCES node_credentials(node_id)
      );
      CREATE TABLE IF NOT EXISTS crawl_jobs (
        job_id TEXT PRIMARY KEY, platform TEXT NOT NULL, url TEXT NOT NULL UNIQUE, origin TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending','leased','done','backoff','blocked')),
        next_fetch_at TEXT NOT NULL, claimed_by TEXT, lease_id TEXT, lease_expires_at TEXT,
        etag TEXT, last_modified TEXT, created_at TEXT NOT NULL,
        FOREIGN KEY(claimed_by) REFERENCES node_credentials(node_id)
      );
      CREATE INDEX IF NOT EXISTS idx_crawl_jobs_ready ON crawl_jobs(state,next_fetch_at,platform);
      CREATE TABLE IF NOT EXISTS origin_leases (
        origin TEXT PRIMARY KEY, active_job_id TEXT, lease_expires_at TEXT,
        next_allowed_at TEXT NOT NULL, min_delay_ms INTEGER NOT NULL,
        FOREIGN KEY(active_job_id) REFERENCES crawl_jobs(job_id)
      );
      CREATE TABLE IF NOT EXISTS suppressed_urls (
        url TEXT PRIMARY KEY, reason TEXT NOT NULL, suppressed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_items (
        source_key TEXT PRIMARY KEY, platform TEXT NOT NULL, source_url TEXT NOT NULL,
        latest_digest TEXT NOT NULL, latest_version_no INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_versions (
        version_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, version_no INTEGER NOT NULL,
        digest TEXT NOT NULL, payload_json TEXT NOT NULL, observed_at TEXT NOT NULL,
        complete INTEGER NOT NULL DEFAULT 1 CHECK(complete IN (0,1)),
        UNIQUE(source_key,version_no), FOREIGN KEY(source_key) REFERENCES source_items(source_key)
      );
      CREATE TABLE IF NOT EXISTS source_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
        source_key TEXT, kind TEXT NOT NULL, observed_at TEXT NOT NULL,
        version_id TEXT, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id)
      );
      CREATE TABLE IF NOT EXISTS source_issues (
        issue_id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
        source_item_key TEXT NOT NULL, version_key TEXT, code TEXT NOT NULL,
        observed_at TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id)
      );
      CREATE TABLE IF NOT EXISTS source_leads (
        lead_key TEXT PRIMARY KEY, discovered_from_url TEXT NOT NULL,
        discovered_from_job_id TEXT NOT NULL, kind TEXT NOT NULL,
        target_url TEXT NOT NULL, claimed_package_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending_review','approved','rejected')),
        first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
        FOREIGN KEY(discovered_from_job_id) REFERENCES crawl_jobs(job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_source_leads_status ON source_leads(status,kind);
      CREATE TABLE IF NOT EXISTS job_results (
        lease_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, node_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL, response_json TEXT NOT NULL, submitted_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id)
      );
    `);
    // Existing local coordinator databases predate the completeness marker.
    this.db.transaction(() => {
      const columns = this.db.prepare("PRAGMA table_info(source_versions)").all() as { name: string }[];
      if (!columns.some((column) => column.name === "complete")) {
        this.db.run("ALTER TABLE source_versions ADD COLUMN complete INTEGER NOT NULL DEFAULT 1 CHECK(complete IN (0,1))");
      }
    }).immediate();
    this.db.run("CREATE INDEX IF NOT EXISTS idx_source_versions_complete ON source_versions(source_key,complete,version_no DESC)");
  }

  close(): void { this.db.close(); }

  /** Operator read model: source evidence only, never an installable VPM repository. */
  listCompleteVpmEvidence(limit = 100): {
    sourceKey: string; sourceUrl: string; sourceVersionNo: number; observedAt: string; observation: Observation
  }[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Evidence limit must be 1..100");
    const rows = this.db.prepare(`SELECT i.source_key,i.source_url,v.version_no,v.observed_at,v.payload_json
      FROM source_items i JOIN source_versions v ON v.source_key=i.source_key
        AND v.version_no=(SELECT MAX(v2.version_no) FROM source_versions v2
          WHERE v2.source_key=i.source_key AND v2.complete=1)
      LEFT JOIN suppressed_urls s ON s.url=i.source_url
      WHERE i.platform='vpm' AND s.url IS NULL
      ORDER BY i.source_key LIMIT ?`).all(limit) as {
      source_key: string; source_url: string; version_no: number; observed_at: string; payload_json: string
    }[];
    return rows.map((row) => ({ sourceKey: row.source_key, sourceUrl: row.source_url,
      sourceVersionNo: row.version_no, observedAt: row.observed_at,
      observation: ObservationSchema.parse(JSON.parse(row.payload_json)) }));
  }

  /** Local operator action; never exposed on the crawler-node API. */
  createNodeCredential(nodeId: string, capabilities: Platform[]): string {
    ClaimRequestSchema.parse({ schemaVersion: PROTOCOL_VERSION, nodeId, capabilities });
    const token = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    this.db.prepare(`
      INSERT INTO node_credentials(node_id,token_hash,capabilities_json,revoked_at)
      VALUES (?,?,?,NULL)
      ON CONFLICT(node_id) DO UPDATE SET token_hash=excluded.token_hash,
        capabilities_json=excluded.capabilities_json, revoked_at=NULL
    `).run(nodeId, hash, JSON.stringify([...new Set(capabilities)]));
    return token;
  }

  revokeNode(nodeId: string): void {
    this.db.prepare("UPDATE node_credentials SET revoked_at = ? WHERE node_id = ?")
      .run(new Date(this.now()).toISOString(), nodeId);
  }

  /** Local operator stop switch; queued and leased work is invalidated atomically. */
  suppressUrl(url: string, reason: string): void {
    const normalized = new URL(url).href;
    if (!reason.trim()) throw new Error("Suppression reason required");
    const now = new Date(this.now()).toISOString();
    this.db.transaction(() => {
      this.db.prepare("INSERT OR REPLACE INTO suppressed_urls(url,reason,suppressed_at) VALUES (?,?,?)")
        .run(normalized, reason, now);
      const job = this.db.prepare("SELECT job_id,origin FROM crawl_jobs WHERE url=?")
        .get(normalized) as { job_id: string; origin: string } | null;
      if (!job) return;
      this.db.prepare("UPDATE crawl_jobs SET state='blocked',claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=?")
        .run(job.job_id);
      this.db.prepare("UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL WHERE origin=? AND active_job_id=?")
        .run(job.origin, job.job_id);
      this.db.prepare("INSERT INTO source_events(job_id,source_key,kind,observed_at,version_id) VALUES (?,NULL,'suppressed',?,NULL)")
        .run(job.job_id, now);
    }).immediate();
  }

  authenticate(nodeId: string, bearer: string): NodePrincipal | null {
    const row = this.db.prepare("SELECT token_hash,capabilities_json,revoked_at FROM node_credentials WHERE node_id = ?")
      .get(nodeId) as { token_hash: string; capabilities_json: string; revoked_at: string | null } | null;
    if (!row || row.revoked_at) return null;
    const supplied = crypto.createHash("sha256").update(bearer).digest();
    const expected = Buffer.from(row.token_hash, "hex");
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
    return { nodeId, capabilities: JSON.parse(row.capabilities_json) as Platform[], credentialVersion: row.token_hash };
  }

  private assertCurrentPrincipal(principal: NodePrincipal): void {
    const current = this.db.prepare(`SELECT 1 FROM node_credentials
      WHERE node_id=? AND token_hash=? AND revoked_at IS NULL`)
      .get(principal.nodeId, principal.credentialVersion);
    if (!current) throw new CoordinatorConflict("Node credential changed or revoked", 403);
  }

  heartbeat(request: HeartbeatRequest, principal: NodePrincipal): HeartbeatResponse {
    if (request.nodeId !== principal.nodeId ||
        request.capabilities.some((capability) => !principal.capabilities.includes(capability))) {
      throw new CoordinatorConflict("Node identity or capability mismatch", 403);
    }
    return this.db.transaction(() => {
      this.assertCurrentPrincipal(principal);
      if (request.state === "fetching") {
        const live = this.db.prepare(`SELECT 1 FROM crawl_jobs WHERE job_id=? AND claimed_by=?
          AND state='leased' AND lease_expires_at>?`).get(request.activeJobId, principal.nodeId,
            new Date(this.now()).toISOString());
        if (!live) throw new CoordinatorConflict("Node does not hold the reported active job", 403);
      }
      const now = new Date(this.now()).toISOString();
      this.db.prepare(`INSERT INTO node_heartbeats(node_id,last_seen_at,state,active_job_id) VALUES (?,?,?,?)
        ON CONFLICT(node_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,
          state=excluded.state,active_job_id=excluded.active_job_id`)
        .run(principal.nodeId, now, request.state, request.state === "fetching" ? request.activeJobId : null);
      return { schemaVersion: PROTOCOL_VERSION, status: "alive" as const, serverTime: now };
    }).immediate();
  }

  /** Local operator seed/import action. Nodes cannot assign their own jobs. */
  seedJob(url: string, platform: Platform, minDelayMs = 1000): string {
    PlatformSchema.parse(platform);
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Crawl jobs require HTTPS");
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    if (parsed.username || parsed.password || parsed.hash || (parsed.port && parsed.port !== "443") ||
        hostname.endsWith(".") || hostname.toLowerCase() === "localhost" ||
        (isIP(hostname) && isPrivateOrReservedIp(hostname))) {
      throw new Error("Crawl job target must be public credential-free HTTPS on port 443");
    }
    if ((platform === "github" || parsed.hostname === "api.github.com") &&
        (platform !== "github" || !githubApiRepositoryIdentity(parsed.href))) {
      throw new Error("GitHub jobs require a public REST repository metadata endpoint");
    }
    if (!Number.isInteger(minDelayMs) || minDelayMs < 0 || minDelayMs > 86_400_000) throw new Error("Invalid origin delay");
    // The standalone node is unauthenticated; GitHub's public API budget is 60 requests/hour per IP.
    const effectiveMinDelayMs = platform === "github" ? Math.max(minDelayMs, 60_000) : minDelayMs;
    const origin = parsed.origin;
    const now = new Date(this.now()).toISOString();
    const id = crypto.randomUUID();
    return this.db.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM suppressed_urls WHERE url=?").get(parsed.href)) {
        throw new Error("URL is suppressed and cannot be reseeded");
      }
      this.db.prepare(`INSERT OR IGNORE INTO origin_leases(origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms)
        VALUES (?,NULL,NULL,?,?)`).run(origin, now, effectiveMinDelayMs);
      this.db.prepare("UPDATE origin_leases SET min_delay_ms = MAX(min_delay_ms, ?) WHERE origin = ?")
        .run(effectiveMinDelayMs, origin);
      this.db.prepare(`INSERT OR IGNORE INTO crawl_jobs
        (job_id,platform,url,origin,state,next_fetch_at,created_at) VALUES (?,?,?,?,'pending',?,?)`)
        .run(id, platform, parsed.href, origin, now, now);
      const stored = this.db.prepare("SELECT job_id FROM crawl_jobs WHERE url = ?").get(parsed.href) as { job_id: string };
      return stored.job_id;
    }).immediate();
  }

  /** Explicit local operator action after reviewing a discovered listing and its host policy. */
  approveVpmListingLead(leadKey: string, minDelayMs = 1000): string {
    const lead = this.db.prepare("SELECT kind,status,target_url FROM source_leads WHERE lead_key=?")
      .get(leadKey) as { kind: string; status: string; target_url: string } | null;
    if (!lead) throw new Error("Lead not found");
    if (lead.kind !== "vpm_listing") throw new Error("Only published VPM listing leads can become VPM crawl jobs");
    if (lead.status === "rejected") throw new Error("Rejected lead cannot be approved");
    const jobId = this.seedJob(lead.target_url, "vpm", minDelayMs);
    this.db.prepare("UPDATE source_leads SET status='approved' WHERE lead_key=?").run(leadKey);
    return jobId;
  }

  claim(request: ClaimRequest, principal: NodePrincipal): ClaimResponse {
    if (request.nodeId !== principal.nodeId) throw new CoordinatorConflict("Node identity mismatch", 403);
    if (request.capabilities.some((capability) => !principal.capabilities.includes(capability))) {
      throw new CoordinatorConflict("Capability not granted to node", 403);
    }
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    return this.db.transaction(() => {
      this.assertCurrentPrincipal(principal);
      const candidates = this.db.prepare(`
        SELECT j.* FROM crawl_jobs j
        JOIN origin_leases o ON o.origin = j.origin
        WHERE j.platform IN (${request.capabilities.map(() => "?").join(",")})
          AND j.next_fetch_at <= ?
          AND (j.state IN ('pending','done','backoff') OR (j.state='leased' AND j.lease_expires_at <= ?))
          AND o.next_allowed_at <= ?
          AND (o.active_job_id IS NULL OR o.lease_expires_at <= ?)
        ORDER BY j.next_fetch_at ASC, j.created_at ASC LIMIT 100
      `).all(...request.capabilities, now, now, now, now) as JobRow[];

      for (const job of candidates) {
        const lease = this.db.prepare("SELECT * FROM origin_leases WHERE origin = ?").get(job.origin) as {
          active_job_id: string | null; lease_expires_at: string | null;
          next_allowed_at: string; min_delay_ms: number;
        };
        if (lease.next_allowed_at > now || (lease.active_job_id && lease.lease_expires_at && lease.lease_expires_at > now)) continue;
        const expires = new Date(nowMs + 5 * 60 * 1000).toISOString();
        const leaseId = crypto.randomUUID();
        const nextAllowed = new Date(nowMs + lease.min_delay_ms).toISOString();
        this.db.prepare("UPDATE crawl_jobs SET state='leased',claimed_by=?,lease_id=?,lease_expires_at=? WHERE job_id=?")
          .run(principal.nodeId, leaseId, expires, job.job_id);
        this.db.prepare("UPDATE origin_leases SET active_job_id=?,lease_expires_at=?,next_allowed_at=? WHERE origin=?")
          .run(job.job_id, expires, nextAllowed, job.origin);
        return {
          schemaVersion: PROTOCOL_VERSION, status: "leased" as const,
          job: { jobId: job.job_id, leaseId, platform: job.platform, url: job.url, origin: job.origin,
            leaseExpiresAt: expires, etag: job.etag, lastModified: job.last_modified }
        };
      }
      return { schemaVersion: PROTOCOL_VERSION, status: "empty" as const, retryAfterMs: 1000 };
    }).immediate();
  }

  submit(request: ResultRequest, principal: NodePrincipal): ResultResponse {
    if (request.nodeId !== principal.nodeId) throw new CoordinatorConflict("Node identity mismatch", 403);
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const requestDigest = crypto.createHash("sha256").update(JSON.stringify(request)).digest("hex");
    return this.db.transaction(() => {
      this.assertCurrentPrincipal(principal);
      const prior = this.db.prepare("SELECT job_id,node_id,idempotency_key,request_digest,response_json FROM job_results WHERE lease_id=?")
        .get(request.leaseId) as { job_id: string; node_id: string; idempotency_key: string; request_digest: string; response_json: string } | null;
      if (prior) {
        if (prior.job_id !== request.jobId || prior.node_id !== principal.nodeId || prior.idempotency_key !== request.idempotencyKey || prior.request_digest !== requestDigest) {
          throw new CoordinatorConflict("Job already submitted with a different identity or key");
        }
        return { ...JSON.parse(prior.response_json), duplicate: true } as ResultResponse;
      }

      const job = this.db.prepare("SELECT * FROM crawl_jobs WHERE job_id=?").get(request.jobId) as JobRow | null;
      if (!job) throw new CoordinatorConflict("Job not found", 404);
      if (!principal.capabilities.includes(job.platform)) throw new CoordinatorConflict("Capability not granted to node", 403);
      if (request.outcome.kind === "partial_batch" && job.platform !== "vpm") {
        throw new CoordinatorConflict("Listing diagnostics require a VPM job");
      }
      if (job.state !== "leased" || job.claimed_by !== principal.nodeId || job.lease_id !== request.leaseId || !job.lease_expires_at || job.lease_expires_at <= now) {
        throw new CoordinatorConflict("Node does not hold a live lease for this job", 403);
      }

      let sourceVersionCreated = false;
      const outcome = request.outcome;
      const observations = outcome.kind === "changed" ? [outcome.observation] :
        outcome.kind === "batch" || outcome.kind === "partial_batch" ? outcome.observations : [];
      if (new Set(observations.map((observation) => observation.sourceItemKey)).size !== observations.length) {
        throw new CoordinatorConflict("Result batch contains duplicate source identities");
      }
      for (const observation of observations) {
        // A package ID can appear in multiple listings. Keep each source's evidence separate;
        // canonical identity linking is a later, reversible decision.
        const sourceKey = `${job.platform}:${job.url}:${observation.sourceItemKey}`;
        let versionId: string | null = null;
        const payload = JSON.stringify(observation);
        const digest = crypto.createHash("sha256").update(payload).digest("hex");
        const complete = outcome.kind !== "partial_batch" ||
          !outcome.issues.some((issue) => issue.sourceItemKey === observation.sourceItemKey);
        const previous = this.db.prepare(`SELECT i.latest_digest,i.latest_version_no,v.complete
          FROM source_items i JOIN source_versions v ON v.source_key=i.source_key AND v.version_no=i.latest_version_no
          WHERE i.source_key=?`)
          .get(sourceKey) as { latest_digest: string; latest_version_no: number; complete: number } | null;
        if (!previous || previous.latest_digest !== digest || (complete && previous.complete === 0)) {
          const versionNo = (previous?.latest_version_no || 0) + 1;
          versionId = crypto.randomUUID();
          this.db.prepare(`INSERT INTO source_items(source_key,platform,source_url,latest_digest,latest_version_no)
            VALUES (?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_url=excluded.source_url,
              latest_digest=excluded.latest_digest,latest_version_no=excluded.latest_version_no`)
            .run(sourceKey, job.platform, job.url, digest, versionNo);
          this.db.prepare(`INSERT INTO source_versions(version_id,source_key,version_no,digest,payload_json,observed_at,complete)
            VALUES (?,?,?,?,?,?,?)`).run(versionId, sourceKey, versionNo, digest, payload, now, complete ? 1 : 0);
          sourceVersionCreated = true;
        } else {
          this.db.prepare("UPDATE source_items SET source_url=? WHERE source_key=?")
            .run(job.url, sourceKey);
        }
        this.db.prepare("INSERT INTO source_events(job_id,source_key,kind,observed_at,version_id) VALUES (?,?,?,?,?)")
          .run(job.job_id, sourceKey, versionId ? "changed" : "unchanged", now, versionId);
      }
      if (outcome.kind === "discovery") {
        for (const lead of outcome.leads) {
          const leadKey = crypto.createHash("sha256")
            .update(JSON.stringify([job.url, lead.kind, lead.url, lead.claimedPackageId || null])).digest("hex");
          this.db.prepare(`INSERT INTO source_leads
            (lead_key,discovered_from_url,discovered_from_job_id,kind,target_url,claimed_package_id,status,first_seen_at,last_seen_at)
            VALUES (?,?,?,?,?,?,'pending_review',?,?)
            ON CONFLICT(lead_key) DO UPDATE SET last_seen_at=excluded.last_seen_at`)
            .run(leadKey, job.url, job.job_id, lead.kind, lead.url, lead.claimedPackageId || null, now, now);
        }
      }
      if (outcome.kind === "partial_batch") {
        for (const issue of outcome.issues) {
          this.db.prepare(`INSERT INTO source_issues(job_id,source_item_key,version_key,code,observed_at)
            VALUES (?,?,?,?,?)`).run(job.job_id, issue.sourceItemKey, issue.version || null, issue.code, now);
        }
        this.db.prepare("INSERT INTO source_events(job_id,source_key,kind,observed_at,version_id) VALUES (?,NULL,'incomplete_listing',?,NULL)")
          .run(job.job_id, now);
      }
      if (observations.length === 0 && outcome.kind !== "partial_batch") {
        this.db.prepare("INSERT INTO source_events(job_id,source_key,kind,observed_at,version_id) VALUES (?,NULL,?,?,NULL)")
          .run(job.job_id, outcome.kind, now);
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
      this.db.prepare(`UPDATE crawl_jobs SET state=?,next_fetch_at=?,claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=?`)
        .run(state, nextFetchAt, job.job_id);
      this.db.prepare(`UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL,
        next_allowed_at=MAX(next_allowed_at,?) WHERE origin=? AND active_job_id=?`)
        .run(outcome.kind === "rate_limited" || outcome.kind === "blocked" ? nextFetchAt : now, job.origin, job.job_id);

      const response: ResultResponse = {
        schemaVersion: PROTOCOL_VERSION, status: "accepted", jobId: job.job_id,
        duplicate: false, sourceVersionCreated
      };
      this.db.prepare("INSERT INTO job_results(lease_id,job_id,node_id,idempotency_key,request_digest,response_json,submitted_at) VALUES (?,?,?,?,?,?,?)")
        .run(request.leaseId, job.job_id, principal.nodeId, request.idempotencyKey, requestDigest, JSON.stringify(response), now);
      return response;
    }).immediate();
  }
}
