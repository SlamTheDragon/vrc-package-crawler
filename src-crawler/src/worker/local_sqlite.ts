import { Database } from "bun:sqlite";
import crypto from "node:crypto";
import { isIP } from "node:net";
import {
  ClaimRequestSchema, ObservationSchema, PlatformSchema, PROTOCOL_VERSION, observationMatchesPlatform,
  type ClaimRequest, type ClaimResponse, type HeartbeatRequest, type HeartbeatResponse,
  type Observation, type Platform, type ResultRequest, type ResultResponse
} from "../shared/node_protocol.ts";
import { CoordinatorConflict, type CoordinatorStore, type NodePrincipal } from "./handler.ts";
import { isPrivateOrReservedIp } from "../shared/ip_policy.ts";
import { githubApiRepositoryIdentity, isBoothBrowseTarget, boothItemIdentity } from "../shared/source_targets.ts";
import { isItchSearchUrl } from "../shared/source_path_policy.ts";
import { OriginRobotsSnapshotSchema, robotsResultAllowsMissingFile, type OriginRobotsSnapshot } from "../shared/robots_snapshot.ts";
import { compileRobotsText, type CrawlerRules } from "@trybyte/robotstxt-parser";
import { CRAWLER_ROBOTS_TOKEN } from "../shared/crawler_identity.ts";
import { AutoQueueRuleSchema, CreateAutoQueueRuleSchema,
  encodeLeadCursor, encodeRuleCursor, type AutoQueueRule, type CreateAutoQueueRule,
  type LeadCursor, type LeadRow, type RuleCursor } from "../shared/operator_protocol.ts";
import { CreateSourceAccessProfileSchema, SourceAccessProfileSchema, encodeProfileCursor,
  type CreateSourceAccessProfile, type SourceAccessProfile, type ProfileCursor,
  type SourcePurpose, sourceAccessProfileMatches, sourcePathScopesOverlap } from "../shared/source_access_profile.ts";

type JobRow = {
  job_id: string; platform: Platform; url: string; origin: string; state: string;
  next_fetch_at: string; lease_id: string | null; lease_expires_at: string | null; claimed_by: string | null;
  etag: string | null; last_modified: string | null; source_rule_id: string | null;
  job_purpose: SourcePurpose; lease_profile_id: string | null;
};
type AutoQueueRuleRow = {
  rule_id: string; lead_kind: string; origin: string; path_scope: string; min_delay_ms: number;
  expires_at: string; review_reference: string; reason: string; created_at: string; disabled_at: string | null
};
type SourceAccessProfileRow = {
  profile_id: string; platform: Platform; origin: string; path_scope: string; query_scope: string | null;
  method: "GET";
  purpose: SourcePurpose; min_delay_ms: number; expires_at: string; review_reference: string;
  reason: string; retain_classes_json: string; publish_classes_json: string;
  created_at: string; disabled_at: string | null
};

export class LocalCoordinatorStore implements CoordinatorStore {
  readonly db: Database;
  private readonly now: () => number;
  private readonly robotsMatchers = new Map<string, { snapshotId: string; matcher: CrawlerRules }>();

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
        etag TEXT, last_modified TEXT, created_at TEXT NOT NULL, robots_deferred_until TEXT,
        source_rule_id TEXT, job_purpose TEXT NOT NULL DEFAULT 'metadata'
          CHECK(job_purpose IN ('discovery','metadata')), lease_profile_id TEXT,
        FOREIGN KEY(claimed_by) REFERENCES node_credentials(node_id)
      );
      CREATE INDEX IF NOT EXISTS idx_crawl_jobs_ready ON crawl_jobs(state,next_fetch_at,platform);
      CREATE INDEX IF NOT EXISTS idx_crawl_jobs_origin_due ON crawl_jobs(origin,next_fetch_at,state);
      CREATE TABLE IF NOT EXISTS origin_leases (
        origin TEXT PRIMARY KEY, active_job_id TEXT, lease_expires_at TEXT,
        next_allowed_at TEXT NOT NULL, min_delay_ms INTEGER NOT NULL,
        FOREIGN KEY(active_job_id) REFERENCES crawl_jobs(job_id)
      );
      CREATE TABLE IF NOT EXISTS origin_robots (
        origin TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, status_code INTEGER NOT NULL,
        body TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS origin_robots_refresh_leases (
        origin TEXT PRIMARY KEY, lease_id TEXT NOT NULL, lease_expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS suppressed_urls (
        url TEXT PRIMARY KEY, reason TEXT NOT NULL, suppressed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_items (
        source_key TEXT PRIMARY KEY, platform TEXT NOT NULL, source_url TEXT NOT NULL,
        latest_digest TEXT NOT NULL, latest_version_no INTEGER NOT NULL, gone_at TEXT
      );
      CREATE TABLE IF NOT EXISTS source_versions (
        version_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, version_no INTEGER NOT NULL,
        digest TEXT NOT NULL, payload_json TEXT NOT NULL, observed_at TEXT NOT NULL,
        complete INTEGER NOT NULL DEFAULT 1 CHECK(complete IN (0,1)),
        contributor_node_id TEXT, submission_lease_id TEXT, source_profile_id TEXT,
        UNIQUE(source_key,version_no), FOREIGN KEY(source_key) REFERENCES source_items(source_key)
      );
      CREATE TABLE IF NOT EXISTS source_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
        source_key TEXT, kind TEXT NOT NULL, observed_at TEXT NOT NULL,
        version_id TEXT, contributor_node_id TEXT, submission_lease_id TEXT, source_profile_id TEXT,
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id)
      );
      CREATE TABLE IF NOT EXISTS source_issues (
        issue_id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL,
        source_item_key TEXT NOT NULL, version_key TEXT, code TEXT NOT NULL,
        observed_at TEXT NOT NULL, contributor_node_id TEXT, submission_lease_id TEXT, source_profile_id TEXT,
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id)
      );
      CREATE TABLE IF NOT EXISTS source_leads (
        lead_key TEXT PRIMARY KEY, discovered_from_url TEXT NOT NULL,
        discovered_from_job_id TEXT NOT NULL, discovered_from_item_key TEXT, kind TEXT NOT NULL,
        target_url TEXT NOT NULL, claimed_package_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending_review','approved','rejected')),
        first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
        first_seen_node_id TEXT, first_seen_lease_id TEXT, first_seen_profile_id TEXT,
        last_seen_node_id TEXT, last_seen_lease_id TEXT, last_seen_profile_id TEXT,
        FOREIGN KEY(discovered_from_job_id) REFERENCES crawl_jobs(job_id)
      );
      CREATE INDEX IF NOT EXISTS idx_source_leads_status ON source_leads(status,kind);
      CREATE INDEX IF NOT EXISTS idx_source_leads_page ON source_leads(status,first_seen_at,lead_key);
      CREATE TABLE IF NOT EXISTS operator_actions (
        action_id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
        lead_key TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL,
        FOREIGN KEY(lead_key) REFERENCES source_leads(lead_key)
      );
      CREATE TABLE IF NOT EXISTS lead_autoqueue_rules (
        rule_id TEXT PRIMARY KEY, lead_kind TEXT NOT NULL, origin TEXT NOT NULL,
        path_scope TEXT NOT NULL, min_delay_ms INTEGER NOT NULL,
        expires_at TEXT NOT NULL, review_reference TEXT NOT NULL, reason TEXT NOT NULL,
        created_at TEXT NOT NULL, disabled_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_lead_autoqueue_rules_scope
        ON lead_autoqueue_rules(lead_kind,origin,disabled_at,expires_at);
      CREATE INDEX IF NOT EXISTS idx_lead_autoqueue_rules_page
        ON lead_autoqueue_rules(created_at DESC,rule_id DESC);
      CREATE TABLE IF NOT EXISTS operator_rule_actions (
        action_id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id TEXT NOT NULL,
        actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL,
        FOREIGN KEY(rule_id) REFERENCES lead_autoqueue_rules(rule_id)
      );
      CREATE TABLE IF NOT EXISTS source_access_profiles (
        profile_id TEXT PRIMARY KEY, platform TEXT NOT NULL, origin TEXT NOT NULL,
        path_scope TEXT NOT NULL, query_scope TEXT, method TEXT NOT NULL CHECK(method='GET'),
        purpose TEXT NOT NULL CHECK(purpose IN ('discovery','metadata')),
        min_delay_ms INTEGER NOT NULL, expires_at TEXT NOT NULL,
        review_reference TEXT NOT NULL, reason TEXT NOT NULL,
        retain_classes_json TEXT NOT NULL, publish_classes_json TEXT NOT NULL,
        created_at TEXT NOT NULL, disabled_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_source_access_profiles_scope
        ON source_access_profiles(platform,origin,purpose,disabled_at,expires_at);
      CREATE INDEX IF NOT EXISTS idx_source_access_profiles_page
        ON source_access_profiles(created_at DESC,profile_id DESC);
      CREATE TABLE IF NOT EXISTS source_access_profile_actions (
        action_id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL,
        actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        FOREIGN KEY(profile_id) REFERENCES source_access_profiles(profile_id)
      );
      CREATE TABLE IF NOT EXISTS job_results (
        lease_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, node_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL, response_json TEXT NOT NULL, submitted_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id)
      );
    `);
    // Existing local coordinator databases predate these local-only markers.
    this.db.transaction(() => {
      const columns = this.db.prepare("PRAGMA table_info(source_versions)").all() as { name: string }[];
      if (!columns.some((column) => column.name === "complete")) {
        this.db.run("ALTER TABLE source_versions ADD COLUMN complete INTEGER NOT NULL DEFAULT 1 CHECK(complete IN (0,1))");
      }
      const addColumnIfMissing = (table: string, name: string) => {
        const existing = this.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        if (!existing.some((column) => column.name === name)) {
          this.db.run(`ALTER TABLE ${table} ADD COLUMN ${name} TEXT`);
        }
      };
      for (const table of ["source_versions", "source_events", "source_issues"]) {
        addColumnIfMissing(table, "contributor_node_id");
        addColumnIfMissing(table, "submission_lease_id");
        addColumnIfMissing(table, "source_profile_id");
      }
      addColumnIfMissing("source_items", "gone_at");
      addColumnIfMissing("source_access_profiles", "query_scope");
      for (const name of ["first_seen_node_id", "first_seen_lease_id", "last_seen_node_id", "last_seen_lease_id"]) {
        addColumnIfMissing("source_leads", name);
      }
      addColumnIfMissing("source_leads", "first_seen_profile_id");
      addColumnIfMissing("source_leads", "last_seen_profile_id");
      addColumnIfMissing("source_leads", "discovered_from_item_key");
      const jobColumns = this.db.prepare("PRAGMA table_info(crawl_jobs)").all() as { name: string }[];
      if (!jobColumns.some((column) => column.name === "robots_deferred_until")) {
        this.db.run("ALTER TABLE crawl_jobs ADD COLUMN robots_deferred_until TEXT");
      }
      if (!jobColumns.some((column) => column.name === "source_rule_id")) {
        this.db.run("ALTER TABLE crawl_jobs ADD COLUMN source_rule_id TEXT");
      }
      if (!jobColumns.some((column) => column.name === "job_purpose")) {
        this.db.run("ALTER TABLE crawl_jobs ADD COLUMN job_purpose TEXT NOT NULL DEFAULT 'metadata' CHECK(job_purpose IN ('discovery','metadata'))");
      }
      if (!jobColumns.some((column) => column.name === "lease_profile_id")) {
        this.db.run("ALTER TABLE crawl_jobs ADD COLUMN lease_profile_id TEXT");
      }
      // A lease minted before source profiles existed has no authority to continue.
      // Release its origin lock as well, so reviewed work need not wait for expiry.
      this.db.run(`UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL
        WHERE active_job_id IN (SELECT job_id FROM crawl_jobs
          WHERE state='leased' AND lease_profile_id IS NULL)`);
      this.db.run(`UPDATE crawl_jobs SET state='pending',claimed_by=NULL,lease_id=NULL,
        lease_expires_at=NULL WHERE state='leased' AND lease_profile_id IS NULL`);
    }).immediate();
    this.db.run("CREATE INDEX IF NOT EXISTS idx_source_versions_complete ON source_versions(source_key,complete,version_no DESC)");
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_source_versions_contributor
      ON source_versions(contributor_node_id,observed_at DESC,version_id DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_source_events_contributor
      ON source_events(contributor_node_id,event_id DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_source_issues_contributor
      ON source_issues(contributor_node_id,issue_id DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_source_leads_first_node
      ON source_leads(first_seen_node_id,first_seen_at DESC,lead_key DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_source_leads_last_node
      ON source_leads(last_seen_node_id,last_seen_at DESC,lead_key DESC)`);
  }

  close(): void { this.db.close(true); }

  private reserveRobotsRefreshInTransaction(origin: string, now: string, expires: string,
    profileDelayMs: number): string | null {
    const leaseId = crypto.randomUUID();
    const result = this.db.prepare(`INSERT INTO origin_robots_refresh_leases(origin,lease_id,lease_expires_at)
      VALUES (?,?,?) ON CONFLICT(origin) DO UPDATE SET
        lease_id=excluded.lease_id,lease_expires_at=excluded.lease_expires_at
      WHERE origin_robots_refresh_leases.lease_expires_at<=?`).run(origin, leaseId, expires, now);
    if (result.changes !== 1) return null;
    const floor = this.db.prepare("SELECT min_delay_ms FROM origin_leases WHERE origin=?")
      .get(origin) as { min_delay_ms: number };
    const nextAllowed = new Date(this.now() + Math.max(floor.min_delay_ms, profileDelayMs)).toISOString();
    this.db.prepare("UPDATE origin_leases SET next_allowed_at=MAX(next_allowed_at,?) WHERE origin=?")
      .run(nextAllowed, origin);
    return leaseId;
  }

  private approvedDueProfileDelayForOrigin(origin: string, now: string): number | null {
    const rows = this.db.prepare(`SELECT j.* FROM crawl_jobs j WHERE j.origin=?
      AND j.state!='blocked' AND j.next_fetch_at<=?
      AND (j.source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules ar
        WHERE ar.rule_id=j.source_rule_id AND ar.disabled_at IS NULL AND ar.expires_at>?))`)
      .all(origin, now, now) as JobRow[];
    let delay: number | null = null;
    for (const job of rows) {
      const profile = this.activeSourceAccessProfileForTarget(job.platform, job.url, job.job_purpose);
      if (profile) delay = Math.max(delay ?? 0, profile.minDelayMs);
    }
    return delay;
  }

  /** Operator-only reservation, distinct from the node job API. */
  reserveRobotsRefresh(origin: string): string | null {
    OriginRobotsSnapshotSchema.parse({ origin, statusCode: 599, body: "" });
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const expires = new Date(nowMs + 45_000).toISOString();
    return this.db.transaction(() => {
      const available = this.db.prepare(`SELECT 1 FROM origin_leases
        WHERE origin=? AND next_allowed_at<=?
          AND (active_job_id IS NULL OR lease_expires_at<=?)`).get(origin, now, now);
      const profileDelay = available ? this.approvedDueProfileDelayForOrigin(origin, now) : null;
      return profileDelay === null ? null :
        this.reserveRobotsRefreshInTransaction(origin, now, expires, profileDelay);
    }).immediate();
  }

  /** Claim one stale/missing snapshot for an already queued, nonblocked origin. */
  claimDueRobotsRefresh(): { origin: string; leaseId: string } | null {
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const expires = new Date(nowMs + 45_000).toISOString();
    return this.db.transaction(() => {
      let afterOrigin = "";
      for (;;) {
        const due = this.db.prepare(`SELECT o.origin FROM origin_leases o
          LEFT JOIN origin_robots r ON r.origin=o.origin
          LEFT JOIN origin_robots_refresh_leases l ON l.origin=o.origin
          WHERE o.origin>? AND o.next_allowed_at<=? AND (r.origin IS NULL OR r.expires_at<=?)
            AND (l.origin IS NULL OR l.lease_expires_at<=?)
            AND (o.active_job_id IS NULL OR o.lease_expires_at<=?)
            AND EXISTS (SELECT 1 FROM crawl_jobs j WHERE j.origin=o.origin
              AND j.state!='blocked' AND j.next_fetch_at<=?
              AND (j.source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules ar
                WHERE ar.rule_id=j.source_rule_id AND ar.disabled_at IS NULL AND ar.expires_at>?)))
          ORDER BY o.origin ASC LIMIT 1`)
          .get(afterOrigin, now, now, now, now, now, now) as { origin: string } | null;
        if (!due) return null;
        const profileDelay = this.approvedDueProfileDelayForOrigin(due.origin, now);
        if (profileDelay !== null) {
          const leaseId = this.reserveRobotsRefreshInTransaction(due.origin, now, expires, profileDelay);
          if (leaseId) return { origin: due.origin, leaseId };
        }
        afterOrigin = due.origin;
      }
    }).immediate();
  }

  releaseRobotsRefresh(origin: string, leaseId: string): boolean {
    const result = this.db.prepare("DELETE FROM origin_robots_refresh_leases WHERE origin=? AND lease_id=?")
      .run(origin, leaseId);
    return result.changes === 1;
  }

  private writeRobotsSnapshotInTransaction(parsed: OriginRobotsSnapshot, nowMs: number): void {
    const fetchedAt = new Date(nowMs).toISOString();
    const ttlMs = (parsed.statusCode >= 200 && parsed.statusCode < 300) ||
      robotsResultAllowsMissingFile(parsed.statusCode) ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    const expiresAt = new Date(nowMs + ttlMs).toISOString();
    this.db.prepare(`INSERT INTO origin_robots(origin,snapshot_id,status_code,body,fetched_at,expires_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(origin) DO UPDATE SET
      snapshot_id=excluded.snapshot_id,status_code=excluded.status_code,body=excluded.body,
      fetched_at=excluded.fetched_at,expires_at=excluded.expires_at`)
      .run(parsed.origin, crypto.randomUUID(), parsed.statusCode, parsed.body, fetchedAt, expiresAt);
    // Reconsider only jobs previously deferred by robots; normal revisit times stay intact.
    this.db.prepare(`UPDATE crawl_jobs SET next_fetch_at=?,robots_deferred_until=NULL
      WHERE origin=? AND robots_deferred_until IS NOT NULL AND state IN ('pending','done','backoff')`)
      .run(fetchedAt, parsed.origin);
  }

  /** Reject a delayed fetch result after another process has reclaimed the refresh lease. */
  completeRobotsRefresh(origin: string, leaseId: string, statusCode: number, body = ""): boolean {
    const parsed = OriginRobotsSnapshotSchema.parse({ origin, statusCode, body });
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const completed = this.db.transaction(() => {
      const held = this.db.prepare(`SELECT 1 FROM origin_robots_refresh_leases
        WHERE origin=? AND lease_id=? AND lease_expires_at>?`).get(origin, leaseId, now);
      if (!held || this.approvedDueProfileDelayForOrigin(origin, now) === null) return false;
      this.writeRobotsSnapshotInTransaction(parsed, nowMs);
      this.db.prepare("DELETE FROM origin_robots_refresh_leases WHERE origin=? AND lease_id=?").run(origin, leaseId);
      return true;
    }).immediate();
    if (completed) this.robotsMatchers.delete(origin);
    return completed;
  }

  /** Trusted local operator/coordinator observation, never a crawler-node assertion. */
  recordRobotsSnapshot(origin: string, statusCode: number, body = ""): void {
    const parsed = OriginRobotsSnapshotSchema.parse({ origin, statusCode, body });
    this.db.transaction(() => this.writeRobotsSnapshotInTransaction(parsed, this.now())).immediate();
    this.robotsMatchers.delete(parsed.origin);
  }

  private robotsAllows(job: JobRow & { robots_snapshot_id: string; robots_status_code: number; robots_body: string }): boolean {
    if (robotsResultAllowsMissingFile(job.robots_status_code)) return true;
    if (job.robots_status_code < 200 || job.robots_status_code >= 300) return false;
    let cached = this.robotsMatchers.get(job.origin);
    if (!cached || cached.snapshotId !== job.robots_snapshot_id) {
      cached = { snapshotId: job.robots_snapshot_id,
        matcher: compileRobotsText(job.robots_body, { policy: "rfc9309" }).forCrawler(CRAWLER_ROBOTS_TOKEN) };
      this.robotsMatchers.set(job.origin, cached);
    }
    return cached.matcher.isAllowed(job.url);
  }

  /** Operator read model: source evidence only, never an installable VPM repository. */
  listCompleteVpmEvidence(limit = 100): {
    sourceKey: string; sourceUrl: string; sourceVersionNo: number; observedAt: string;
    contributorNodeId: string | null; submissionLeaseId: string | null; observation: Observation
  }[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Evidence limit must be 1..100");
    const rows = this.db.prepare(`SELECT i.source_key,i.source_url,v.version_no,v.observed_at,
      v.contributor_node_id,v.submission_lease_id,v.payload_json
      FROM source_items i JOIN source_versions v ON v.source_key=i.source_key
        AND v.version_no=(SELECT MAX(v2.version_no) FROM source_versions v2
          WHERE v2.source_key=i.source_key AND v2.complete=1)
      LEFT JOIN suppressed_urls s ON s.url=i.source_url
      WHERE i.platform='vpm' AND i.gone_at IS NULL AND s.url IS NULL
      ORDER BY i.source_key LIMIT ?`).all(limit) as {
      source_key: string; source_url: string; version_no: number; observed_at: string;
      contributor_node_id: string | null; submission_lease_id: string | null; payload_json: string
    }[];
    return rows.map((row) => ({ sourceKey: row.source_key, sourceUrl: row.source_url,
      sourceVersionNo: row.version_no, observedAt: row.observed_at,
      contributorNodeId: row.contributor_node_id, submissionLeaseId: row.submission_lease_id,
      observation: ObservationSchema.parse(JSON.parse(row.payload_json)) }));
  }

  /** Bounded operator view for isolating evidence submitted by one credentialed node. */
  inspectNodeEvidence(nodeId: string, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Evidence limit must be 1..100");
    if (!this.db.prepare("SELECT 1 FROM node_credentials WHERE node_id=?").get(nodeId)) {
      throw new Error("Node not found");
    }
    const count = (table: string, column: string) =>
      (this.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column}=?`).get(nodeId) as { n: number }).n;
    return {
      nodeId,
      totals: {
        submissions: count("job_results", "node_id"),
        versions: count("source_versions", "contributor_node_id"),
        events: count("source_events", "contributor_node_id"),
        issues: count("source_issues", "contributor_node_id"),
        leadsFirstSeen: count("source_leads", "first_seen_node_id"),
        leadsLastSeen: count("source_leads", "last_seen_node_id")
      },
      versions: this.db.prepare(`SELECT version_id,source_key,version_no,observed_at,complete,submission_lease_id
        FROM source_versions WHERE contributor_node_id=? ORDER BY observed_at DESC,version_id DESC LIMIT ?`).all(nodeId, limit),
      events: this.db.prepare(`SELECT event_id,job_id,source_key,kind,observed_at,version_id,submission_lease_id
        FROM source_events WHERE contributor_node_id=? ORDER BY event_id DESC LIMIT ?`).all(nodeId, limit),
      issues: this.db.prepare(`SELECT issue_id,job_id,source_item_key,version_key,code,observed_at,submission_lease_id
        FROM source_issues WHERE contributor_node_id=? ORDER BY issue_id DESC LIMIT ?`).all(nodeId, limit),
      leadsFirstSeen: this.db.prepare(`SELECT lead_key,kind,target_url,status,first_seen_at,first_seen_lease_id
        FROM source_leads WHERE first_seen_node_id=? ORDER BY first_seen_at DESC,lead_key DESC LIMIT ?`).all(nodeId, limit),
      leadsLastSeen: this.db.prepare(`SELECT lead_key,kind,target_url,status,last_seen_at,last_seen_lease_id
        FROM source_leads WHERE last_seen_node_id=? ORDER BY last_seen_at DESC,lead_key DESC LIMIT ?`).all(nodeId, limit)
    };
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
        const now = new Date(this.now()).toISOString();
        const live = this.db.prepare(`SELECT * FROM crawl_jobs WHERE job_id=? AND claimed_by=? AND lease_id=?
          AND state='leased' AND lease_expires_at>?
          AND (source_rule_id IS NULL OR EXISTS (SELECT 1 FROM lead_autoqueue_rules r
            WHERE r.rule_id=source_rule_id AND r.disabled_at IS NULL AND r.expires_at>?))`)
          .get(request.activeJobId, principal.nodeId, request.activeLeaseId, now, now) as JobRow | null;
        if (!live || !this.leaseProfileAllowsJob(live)) {
          throw new CoordinatorConflict("Node does not hold an authorized active job", 403);
        }
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
  seedJob(url: string, platform: Platform, minDelayMs = 1000, sourceRuleId?: string,
    purpose: SourcePurpose = "metadata"): string {
    PlatformSchema.parse(platform);
    if (purpose !== "metadata" && purpose !== "discovery") throw new Error("Invalid job purpose");
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("Crawl jobs require HTTPS");
    if (isItchSearchUrl(parsed.href)) throw new Error("itch.io /search is disallowed by published robots rules");
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
      if (sourceRuleId && !this.db.prepare(`SELECT 1 FROM lead_autoqueue_rules
        WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?`).get(sourceRuleId, now)) {
        throw new Error("Auto-queue rule is no longer active");
      }
      this.db.prepare(`INSERT OR IGNORE INTO origin_leases(origin,active_job_id,lease_expires_at,next_allowed_at,min_delay_ms)
        VALUES (?,NULL,NULL,?,?)`).run(origin, now, effectiveMinDelayMs);
      this.db.prepare("UPDATE origin_leases SET min_delay_ms = MAX(min_delay_ms, ?) WHERE origin = ?")
        .run(effectiveMinDelayMs, origin);
      this.db.prepare(`INSERT OR IGNORE INTO crawl_jobs
        (job_id,platform,url,origin,state,next_fetch_at,created_at,source_rule_id,job_purpose)
        VALUES (?,?,?,?,'pending',?,?,?,?)`)
        .run(id, platform, parsed.href, origin, now, now, sourceRuleId || null, purpose);
      if (sourceRuleId) this.db.prepare(`UPDATE crawl_jobs SET source_rule_id=?
        WHERE url=? AND source_rule_id IS NOT NULL`).run(sourceRuleId, parsed.href);
      const stored = this.db.prepare("SELECT job_id,job_purpose FROM crawl_jobs WHERE url = ?")
        .get(parsed.href) as { job_id: string; job_purpose: SourcePurpose };
      if (stored.job_purpose !== purpose) throw new Error("Existing job has a different reviewed purpose");
      return stored.job_id;
    }).immediate();
  }

  listLeads(status: "pending_review" | "approved" | "rejected" = "pending_review", limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Lead limit must be 1..100");
    return this.db.prepare(`SELECT lead_key,kind,target_url,claimed_package_id,discovered_from_url,
      discovered_from_item_key,status,first_seen_at,last_seen_at FROM source_leads WHERE status=?
      ORDER BY first_seen_at,lead_key LIMIT ?`).all(status, limit);
  }

  listLeadsPage(status: "pending_review" | "approved" | "rejected", limit: number,
    cursor: LeadCursor | null): { leads: LeadRow[]; nextCursor: string | null } {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Lead limit must be 1..100");
    const after = cursor ? "AND (first_seen_at,lead_key)>(?,?)" : "";
    const rows = this.db.prepare(`SELECT lead_key,kind,target_url,claimed_package_id,discovered_from_url,
      discovered_from_item_key,status,first_seen_at,last_seen_at FROM source_leads
      WHERE status=? ${after} ORDER BY first_seen_at,lead_key LIMIT ?`)
      .all(...(cursor ? [status, cursor.firstSeenAt, cursor.leadKey, limit + 1] :
        [status, limit + 1])) as LeadRow[];
    const leads = rows.slice(0, limit);
    const last = leads.at(-1);
    return { leads, nextCursor: rows.length > limit && last ? encodeLeadCursor({ status,
      firstSeenAt: last.first_seen_at, leadKey: last.lead_key }) : null };
  }

  private autoQueueRuleFromRow(row: AutoQueueRuleRow): AutoQueueRule {
    return AutoQueueRuleSchema.parse({ ruleId: row.rule_id, leadKind: row.lead_kind,
      origin: row.origin, pathScope: row.path_scope, minDelayMs: row.min_delay_ms,
      expiresAt: row.expires_at, reviewReference: row.review_reference, reason: row.reason,
      createdAt: row.created_at, disabledAt: row.disabled_at });
  }

  listAutoQueueRules(limit = 100): AutoQueueRule[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Rule limit must be 1..100");
    const rows = this.db.prepare(`SELECT * FROM lead_autoqueue_rules
      ORDER BY created_at DESC,rule_id DESC LIMIT ?`).all(limit) as AutoQueueRuleRow[];
    return rows.map((row) => this.autoQueueRuleFromRow(row));
  }

  listAutoQueueRulesPage(limit: number, cursor: RuleCursor | null):
    { rules: AutoQueueRule[]; nextCursor: string | null } {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Rule limit must be 1..100");
    const before = cursor ? "WHERE (created_at,rule_id)<(?,?)" : "";
    const rows = this.db.prepare(`SELECT * FROM lead_autoqueue_rules ${before}
      ORDER BY created_at DESC,rule_id DESC LIMIT ?`)
      .all(...(cursor ? [cursor.createdAt, cursor.ruleId, limit + 1] : [limit + 1])) as AutoQueueRuleRow[];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return { rules: visible.map((row) => this.autoQueueRuleFromRow(row)),
      nextCursor: rows.length > limit && last ? encodeRuleCursor({ createdAt: last.created_at,
        ruleId: last.rule_id }) : null };
  }

  private sourceAccessProfileFromRow(row: SourceAccessProfileRow): SourceAccessProfile {
    return SourceAccessProfileSchema.parse({
      schemaVersion: 1, profileId: row.profile_id, platform: row.platform,
      origin: row.origin, pathScope: row.path_scope, exactQuery: row.query_scope ?? undefined,
      method: row.method,
      purpose: row.purpose, minDelayMs: row.min_delay_ms, expiresAt: row.expires_at,
      reviewReference: row.review_reference, reason: row.reason,
      retainClasses: JSON.parse(row.retain_classes_json), publishClasses: JSON.parse(row.publish_classes_json),
      createdAt: row.created_at, disabledAt: row.disabled_at
    });
  }

  listSourceAccessProfilesPage(limit: number, cursor: ProfileCursor | null):
    { profiles: SourceAccessProfile[]; nextCursor: string | null } {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Profile limit must be 1..100");
    const before = cursor ? "WHERE (created_at,profile_id)<(?,?)" : "";
    const rows = this.db.prepare(`SELECT * FROM source_access_profiles ${before}
      ORDER BY created_at DESC,profile_id DESC LIMIT ?`)
      .all(...(cursor ? [cursor.createdAt, cursor.profileId, limit + 1] : [limit + 1])) as SourceAccessProfileRow[];
    const visible = rows.slice(0, limit);
    const last = visible.at(-1);
    return { profiles: visible.map(row => this.sourceAccessProfileFromRow(row)),
      nextCursor: rows.length > limit && last ? encodeProfileCursor({
        createdAt: last.created_at, profileId: last.profile_id }) : null };
  }

  /** Narrowest active match; no permission union across overlapping records. */
  activeSourceAccessProfileForTarget(platform: Platform, target: string, purpose: SourcePurpose):
    SourceAccessProfile | null {
    let origin: string;
    try { origin = new URL(target).origin; } catch { return null; }
    const nowMs = this.now();
    const now = new Date(nowMs).toISOString();
    const rows = this.db.prepare(`SELECT * FROM source_access_profiles
      WHERE platform=? AND origin=? AND purpose=? AND disabled_at IS NULL AND expires_at>?
      ORDER BY length(path_scope) DESC,created_at ASC,profile_id ASC`)
      .all(platform, origin, purpose, now) as SourceAccessProfileRow[];
    for (const row of rows) {
      const profile = this.sourceAccessProfileFromRow(row);
      if (sourceAccessProfileMatches(profile, platform, target, purpose, nowMs)) return profile;
    }
    return null;
  }

  private leaseProfileAllowsJob(job: JobRow): SourceAccessProfile | null {
    if (!job.lease_profile_id) return null;
    const row = this.db.prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
      .get(job.lease_profile_id) as SourceAccessProfileRow | null;
    if (!row) return null;
    const profile = this.sourceAccessProfileFromRow(row);
    return sourceAccessProfileMatches(profile, job.platform, job.url, job.job_purpose, this.now()) ?
      profile : null;
  }

  createSourceAccessProfile(input: CreateSourceAccessProfile, actor: string): SourceAccessProfile {
    const parsed = CreateSourceAccessProfileSchema.parse(input);
    const now = new Date(this.now()).toISOString();
    if (parsed.expiresAt <= now) throw new Error("Source profile expiry must be in the future");
    const profileId = crypto.randomUUID();
    return this.db.transaction(() => {
      const existing = this.db.prepare(`SELECT path_scope,query_scope FROM source_access_profiles
        WHERE platform=? AND origin=? AND purpose=? AND disabled_at IS NULL AND expires_at>?`)
        .all(parsed.platform, parsed.origin, parsed.purpose, now) as
          { path_scope: string; query_scope: string | null }[];
      if (existing.some(row => sourcePathScopesOverlap(row.path_scope, parsed.pathScope,
        row.query_scope ?? undefined, parsed.exactQuery))) {
        throw new Error("Overlapping active source profile requires disabling the old grant first");
      }
      this.db.prepare(`INSERT INTO source_access_profiles
        (profile_id,platform,origin,path_scope,query_scope,method,purpose,min_delay_ms,expires_at,
          review_reference,reason,retain_classes_json,publish_classes_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(profileId, parsed.platform, parsed.origin,
        parsed.pathScope, parsed.exactQuery ?? null, parsed.method, parsed.purpose, parsed.minDelayMs, parsed.expiresAt,
        parsed.reviewReference, parsed.reason, JSON.stringify(parsed.retainClasses),
        JSON.stringify(parsed.publishClasses), now);
      this.db.prepare(`INSERT INTO source_access_profile_actions
        (profile_id,actor,action,reason,occurred_at) VALUES (?,?,'create',?,?)`)
        .run(profileId, actor, parsed.reason, now);
      return this.sourceAccessProfileFromRow(this.db.prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
        .get(profileId) as SourceAccessProfileRow);
    }).immediate();
  }

  disableSourceAccessProfile(profileId: string, actor: string, reason: string): SourceAccessProfile {
    if (!reason.trim() || reason.length > 300) throw new Error("Disable reason required (at most 300 characters)");
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
        .get(profileId) as SourceAccessProfileRow | null;
      if (!row) throw new Error("Source profile not found");
      if (row.disabled_at) return this.sourceAccessProfileFromRow(row);
      const now = new Date(this.now()).toISOString();
      this.db.prepare("UPDATE source_access_profiles SET disabled_at=? WHERE profile_id=?")
        .run(now, profileId);
      const leased = this.db.prepare(`SELECT job_id,origin FROM crawl_jobs
        WHERE lease_profile_id=? AND state='leased'`).all(profileId) as { job_id: string; origin: string }[];
      for (const job of leased) {
        this.db.prepare(`UPDATE crawl_jobs SET state='pending',claimed_by=NULL,lease_id=NULL,
          lease_expires_at=NULL,lease_profile_id=NULL WHERE job_id=?`).run(job.job_id);
        this.db.prepare(`UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL
          WHERE origin=? AND active_job_id=?`).run(job.origin, job.job_id);
      }
      if (this.approvedDueProfileDelayForOrigin(row.origin, now) === null) {
        this.db.prepare("DELETE FROM origin_robots_refresh_leases WHERE origin=?").run(row.origin);
      }
      this.db.prepare(`INSERT INTO source_access_profile_actions
        (profile_id,actor,action,reason,occurred_at) VALUES (?,?,'disable',?,?)`)
        .run(profileId, actor, reason.trim(), now);
      return this.sourceAccessProfileFromRow(this.db.prepare("SELECT * FROM source_access_profiles WHERE profile_id=?")
        .get(profileId) as SourceAccessProfileRow);
    }).immediate();
  }

  createAutoQueueRule(input: CreateAutoQueueRule, actor: string): AutoQueueRule {
    const parsed = CreateAutoQueueRuleSchema.parse(input);
    const now = new Date(this.now()).toISOString();
    if (parsed.expiresAt <= now) throw new Error("Rule expiry must be in the future");
    return this.db.transaction(() => {
      const existing = this.db.prepare(`SELECT 1 FROM lead_autoqueue_rules
        WHERE lead_kind=? AND origin=? AND path_scope=? AND disabled_at IS NULL AND expires_at>?`)
        .get(parsed.leadKind, parsed.origin, parsed.pathScope, now);
      if (existing) throw new Error("An active rule already covers this exact scope");
      const ruleId = crypto.randomUUID();
      this.db.prepare(`INSERT INTO lead_autoqueue_rules
        (rule_id,lead_kind,origin,path_scope,min_delay_ms,expires_at,review_reference,reason,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(ruleId, parsed.leadKind, parsed.origin, parsed.pathScope,
          parsed.minDelayMs, parsed.expiresAt, parsed.reviewReference, parsed.reason, now);
      this.db.prepare(`INSERT INTO operator_rule_actions(rule_id,actor,action,reason,occurred_at)
        VALUES (?,?,'create',?,?)`).run(ruleId, actor, parsed.reason, now);
      return this.autoQueueRuleFromRow(this.db.prepare("SELECT * FROM lead_autoqueue_rules WHERE rule_id=?")
        .get(ruleId) as AutoQueueRuleRow);
    }).immediate();
  }

  disableAutoQueueRule(ruleId: string, actor: string, reason: string): AutoQueueRule {
    if (!reason.trim() || reason.length > 300) throw new Error("Disable reason required (at most 300 characters)");
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT * FROM lead_autoqueue_rules WHERE rule_id=?")
        .get(ruleId) as AutoQueueRuleRow | null;
      if (!row) throw new Error("Rule not found");
      if (!row.disabled_at) {
        const now = new Date(this.now()).toISOString();
        this.db.prepare("UPDATE lead_autoqueue_rules SET disabled_at=? WHERE rule_id=?").run(now, ruleId);
        const leased = this.db.prepare(`SELECT job_id,origin FROM crawl_jobs
          WHERE source_rule_id=? AND state='leased'`).all(ruleId) as { job_id: string; origin: string }[];
        for (const job of leased) {
          this.db.prepare(`UPDATE crawl_jobs SET state='pending',claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL
            WHERE job_id=?`).run(job.job_id);
          this.db.prepare(`UPDATE origin_leases SET active_job_id=NULL,lease_expires_at=NULL
            WHERE origin=? AND active_job_id=?`).run(job.origin, job.job_id);
        }
        this.db.prepare(`INSERT INTO operator_rule_actions(rule_id,actor,action,reason,occurred_at)
          VALUES (?,?,'disable',?,?)`).run(ruleId, actor, reason.trim(), now);
        row.disabled_at = now;
      }
      return this.autoQueueRuleFromRow(row);
    }).immediate();
  }

  private activeAutoQueueRuleForLead(kind: string, url: string): AutoQueueRule | null {
    if (kind !== "vpm_listing") return null;
    let target: URL;
    try { target = new URL(url); } catch { return null; }
    if (target.protocol !== "https:" || target.username || target.password || target.hash || target.search ||
        target.port || target.hostname.endsWith(".")) return null;
    const rows = this.db.prepare(`SELECT * FROM lead_autoqueue_rules
      WHERE lead_kind=? AND origin=? AND disabled_at IS NULL AND expires_at>?
      ORDER BY length(path_scope) DESC,created_at DESC`).all(kind, target.origin,
        new Date(this.now()).toISOString()) as AutoQueueRuleRow[];
    const match = rows.find((row) => row.path_scope.endsWith("/") ?
      target.pathname.startsWith(row.path_scope) : target.pathname === row.path_scope);
    return match ? this.autoQueueRuleFromRow(match) : null;
  }

  /** Explicit operator action after reviewing a discovered listing and its host policy. */
  approveVpmListingLead(leadKey: string, minDelayMs = 1000, actor = "local-cli",
    reason = "Operator reviewed listing", sourceRuleId?: string): string {
    if (!reason.trim() || reason.length > 300) throw new Error("Approval reason required (at most 300 characters)");
    return this.db.transaction(() => {
      const lead = this.db.prepare("SELECT kind,status,target_url FROM source_leads WHERE lead_key=?")
        .get(leadKey) as { kind: string; status: string; target_url: string } | null;
      if (!lead) throw new Error("Lead not found");
      if (lead.kind !== "vpm_listing") throw new Error("Only published VPM listing leads can become VPM crawl jobs");
      if (lead.status === "rejected") throw new Error("Rejected lead cannot be approved");
      const jobId = this.seedJob(lead.target_url, "vpm", minDelayMs, sourceRuleId, "discovery");
      if (lead.status !== "approved") {
        this.db.prepare("UPDATE source_leads SET status='approved' WHERE lead_key=?").run(leadKey);
        this.db.prepare(`INSERT INTO operator_actions(actor,action,lead_key,reason,occurred_at)
          VALUES (?,'approve_lead',?,?,?)`).run(actor, leadKey, reason.trim(), new Date(this.now()).toISOString());
      }
      return jobId;
    }).immediate();
  }

  rejectLead(leadKey: string, actor: string, reason: string): void {
    if (!reason.trim() || reason.length > 300) throw new Error("Rejection reason required (at most 300 characters)");
    this.db.transaction(() => {
      const lead = this.db.prepare("SELECT status FROM source_leads WHERE lead_key=?")
        .get(leadKey) as { status: string } | null;
      if (!lead) throw new Error("Lead not found");
      if (lead.status === "approved") throw new Error("Approved lead cannot be rejected without revoking its job");
      if (lead.status === "rejected") return;
      this.db.prepare("UPDATE source_leads SET status='rejected' WHERE lead_key=?").run(leadKey);
      this.db.prepare(`INSERT INTO operator_actions(actor,action,lead_key,reason,occurred_at)
        VALUES (?,'reject_lead',?,?,?)`).run(actor, leadKey, reason.trim(), new Date(this.now()).toISOString());
    }).immediate();
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
      const selectCandidates = this.db.prepare(`
        SELECT j.*,r.snapshot_id AS robots_snapshot_id,r.status_code AS robots_status_code,
          r.body AS robots_body,r.expires_at AS robots_expires_at FROM crawl_jobs j
        JOIN origin_leases o ON o.origin = j.origin
        JOIN origin_robots r ON r.origin = j.origin AND r.expires_at > ?
        LEFT JOIN origin_robots_refresh_leases rl ON rl.origin=j.origin AND rl.lease_expires_at>?
        WHERE j.platform IN (${request.capabilities.map(() => "?").join(",")})
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
      `);
      // Disallowed ready rows are deferred in bounded batches so they cannot hide
      // a later allowed origin behind the first 100 rows.
      let offset = 0;
      for (;;) {
        const candidates = selectCandidates.all(now, now, ...request.capabilities, now, now, now, now, now,
          now, offset) as (JobRow & {
          robots_snapshot_id: string; robots_status_code: number; robots_body: string; robots_expires_at: string
        })[];
        if (candidates.length === 0) break;
        let deferred = false;
        for (const job of candidates) {
          const profile = this.activeSourceAccessProfileForTarget(job.platform, job.url, job.job_purpose);
          if (!profile) continue;
          if (!this.robotsAllows(job)) {
            this.db.prepare(`UPDATE crawl_jobs SET next_fetch_at=?,robots_deferred_until=?,
              state=CASE WHEN state='leased' THEN 'pending' ELSE state END,
              claimed_by=NULL,lease_id=NULL,lease_expires_at=NULL WHERE job_id=?`)
              .run(job.robots_expires_at, job.robots_expires_at, job.job_id);
            deferred = true;
            continue;
          }
          const lease = this.db.prepare("SELECT * FROM origin_leases WHERE origin = ?").get(job.origin) as {
            active_job_id: string | null; lease_expires_at: string | null;
            next_allowed_at: string; min_delay_ms: number;
          };
          if (lease.next_allowed_at > now || (lease.active_job_id && lease.lease_expires_at && lease.lease_expires_at > now)) continue;
          const expires = new Date(nowMs + 5 * 60 * 1000).toISOString();
          const leaseId = crypto.randomUUID();
          const nextAllowed = new Date(nowMs + Math.max(lease.min_delay_ms, profile.minDelayMs)).toISOString();
          this.db.prepare(`UPDATE crawl_jobs SET state='leased',claimed_by=?,lease_id=?,
            lease_expires_at=?,lease_profile_id=? WHERE job_id=?`)
            .run(principal.nodeId, leaseId, expires, profile.profileId, job.job_id);
          this.db.prepare("UPDATE origin_leases SET active_job_id=?,lease_expires_at=?,next_allowed_at=? WHERE origin=?")
            .run(job.job_id, expires, nextAllowed, job.origin);
          return {
            schemaVersion: PROTOCOL_VERSION, status: "leased" as const,
            job: { jobId: job.job_id, leaseId, platform: job.platform, purpose: job.job_purpose,
              url: job.url, origin: job.origin,
              leaseExpiresAt: expires, retainClasses: profile.retainClasses,
              etag: job.etag, lastModified: job.last_modified }
          };
        }
        if (deferred) offset = 0;
        else offset += candidates.length;
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
      if (request.outcome.kind === "batch" && job.platform !== "vpm") {
        throw new CoordinatorConflict("Multi-item batches require a VPM job");
      }
      if (request.outcome.kind === "partial_batch" && job.platform !== "vpm") {
        throw new CoordinatorConflict("Listing diagnostics require a VPM job");
      }
      if (job.source_rule_id && !this.db.prepare(`SELECT 1 FROM lead_autoqueue_rules
        WHERE rule_id=? AND disabled_at IS NULL AND expires_at>?`).get(job.source_rule_id, now)) {
        throw new CoordinatorConflict("Auto-queue rule no longer authorizes this job", 403);
      }
      if (job.state !== "leased" || job.claimed_by !== principal.nodeId || job.lease_id !== request.leaseId || !job.lease_expires_at || job.lease_expires_at <= now) {
        throw new CoordinatorConflict("Node does not hold a live lease for this job", 403);
      }
      const sourceProfile = this.leaseProfileAllowsJob(job);
      if (!sourceProfile) throw new CoordinatorConflict("Source profile no longer authorizes this job", 403);
      const robots = this.db.prepare(`SELECT snapshot_id AS robots_snapshot_id,status_code AS robots_status_code,
        body AS robots_body,expires_at AS robots_expires_at FROM origin_robots WHERE origin=?`)
        .get(job.origin) as { robots_snapshot_id: string; robots_status_code: number;
          robots_body: string; robots_expires_at: string } | null;
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
      for (const observation of observations) {
        // A package ID can appear in multiple listings. Keep each source's evidence separate;
        // canonical identity linking is a later, reversible decision.
        const sourceKey = `${job.platform}:${job.url}:${observation.sourceItemKey}`;
        let versionId: string | null = null;
        const payload = JSON.stringify(observation);
        const digest = crypto.createHash("sha256").update(payload).digest("hex");
        const complete = outcome.kind !== "partial_batch" ||
          !outcome.issues.some((issue) => issue.sourceItemKey === observation.sourceItemKey);
        const previous = this.db.prepare(`SELECT i.latest_digest,i.latest_version_no,i.gone_at,v.complete
          FROM source_items i JOIN source_versions v ON v.source_key=i.source_key AND v.version_no=i.latest_version_no
          WHERE i.source_key=?`)
          .get(sourceKey) as { latest_digest: string; latest_version_no: number; gone_at: string | null; complete: number } | null;
        if (!previous || previous.latest_digest !== digest || (complete && previous.complete === 0)) {
          const versionNo = (previous?.latest_version_no || 0) + 1;
          versionId = crypto.randomUUID();
          this.db.prepare(`INSERT INTO source_items(source_key,platform,source_url,latest_digest,latest_version_no)
            VALUES (?,?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET source_url=excluded.source_url,
              latest_digest=excluded.latest_digest,latest_version_no=excluded.latest_version_no,
              gone_at=CASE WHEN ? THEN NULL ELSE source_items.gone_at END`)
            .run(sourceKey, job.platform, job.url, digest, versionNo, complete ? 1 : 0);
          this.db.prepare(`INSERT INTO source_versions
            (version_id,source_key,version_no,digest,payload_json,observed_at,complete,
              contributor_node_id,submission_lease_id,source_profile_id)
            VALUES (?,?,?,?,?,?,?,?,?,?)`).run(versionId, sourceKey, versionNo, digest, payload, now,
              complete ? 1 : 0, principal.nodeId, request.leaseId, sourceProfile.profileId);
          sourceVersionCreated = true;
        } else {
          this.db.prepare("UPDATE source_items SET source_url=?,gone_at=CASE WHEN ? THEN NULL ELSE gone_at END WHERE source_key=?")
            .run(job.url, complete ? 1 : 0, sourceKey);
        }
        this.db.prepare(`INSERT INTO source_events
          (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
          VALUES (?,?,?,?,?,?,?,?)`)
          .run(job.job_id, sourceKey, previous?.gone_at && complete ? "restored" : versionId ? "changed" : "unchanged", now, versionId,
            principal.nodeId, request.leaseId, sourceProfile.profileId);
      }
      if (outcome.kind === "gone") {
        const currentItems = this.db.prepare(`SELECT source_key FROM source_items
          WHERE platform=? AND source_url=? AND gone_at IS NULL`).all(job.platform, job.url) as { source_key: string }[];
        for (const item of currentItems) {
          this.db.prepare("UPDATE source_items SET gone_at=? WHERE source_key=?").run(now, item.source_key);
          this.db.prepare(`INSERT INTO source_events
            (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
            VALUES (?,?,'gone',?,NULL,?,?,?)`)
            .run(job.job_id, item.source_key, now, principal.nodeId, request.leaseId, sourceProfile.profileId);
        }
      }
      if (outcome.kind === "discovery") {
        for (const lead of outcome.leads) {
          // Preserve pre-anchor keys so rediscovering an older lead does not duplicate it.
          const identity = lead.discoveredFromItemKey ?
            [job.url, lead.discoveredFromItemKey, lead.kind, lead.url, lead.claimedPackageId || null] :
            [job.url, lead.kind, lead.url, lead.claimedPackageId || null];
          const leadKey = crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
          this.db.prepare(`INSERT INTO source_leads
            (lead_key,discovered_from_url,discovered_from_job_id,discovered_from_item_key,
              kind,target_url,claimed_package_id,status,
              first_seen_at,last_seen_at,first_seen_node_id,first_seen_lease_id,first_seen_profile_id,
              last_seen_node_id,last_seen_lease_id,last_seen_profile_id)
            VALUES (?,?,?,?,?,?,?,'pending_review',?,?,?,?,?,?,?,?)
            ON CONFLICT(lead_key) DO UPDATE SET last_seen_at=excluded.last_seen_at,
              last_seen_node_id=excluded.last_seen_node_id,last_seen_lease_id=excluded.last_seen_lease_id,
              last_seen_profile_id=excluded.last_seen_profile_id`)
            .run(leadKey, job.url, job.job_id, lead.discoveredFromItemKey || null,
              lead.kind, lead.url, lead.claimedPackageId || null,
              now, now, principal.nodeId, request.leaseId, sourceProfile.profileId,
              principal.nodeId, request.leaseId, sourceProfile.profileId);
          const status = this.db.prepare("SELECT status FROM source_leads WHERE lead_key=?")
            .get(leadKey) as { status: string };
          if (status.status === "pending_review") {
            const rule = this.activeAutoQueueRuleForLead(lead.kind, lead.url);
            if (rule) {
              try {
                this.approveVpmListingLead(leadKey, rule.minDelayMs, `auto-rule:${rule.ruleId}`,
                  "Matched reviewed auto-queue rule", rule.ruleId);
              } catch (cause) {
                this.db.prepare(`INSERT INTO operator_rule_actions(rule_id,actor,action,reason,occurred_at)
                  VALUES (?,'coordinator','promotion_failed',?,?)`)
                  .run(rule.ruleId, cause instanceof Error ? cause.message.slice(0, 300) : "Unknown promotion failure", now);
              }
            }
          }
        }
      }
      if (outcome.kind === "partial_batch") {
        for (const issue of outcome.issues) {
          this.db.prepare(`INSERT INTO source_issues
            (job_id,source_item_key,version_key,code,observed_at,contributor_node_id,submission_lease_id,source_profile_id)
            VALUES (?,?,?,?,?,?,?,?)`).run(job.job_id, issue.sourceItemKey, issue.version || null,
              issue.code, now, principal.nodeId, request.leaseId, sourceProfile.profileId);
        }
        this.db.prepare(`INSERT INTO source_events
          (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
          VALUES (?,NULL,'incomplete_listing',?,NULL,?,?,?)`)
          .run(job.job_id, now, principal.nodeId, request.leaseId, sourceProfile.profileId);
      }
      if (observations.length === 0 && outcome.kind !== "partial_batch") {
        this.db.prepare(`INSERT INTO source_events
          (job_id,source_key,kind,observed_at,version_id,contributor_node_id,submission_lease_id,source_profile_id)
          VALUES (?,NULL,?,?,NULL,?,?,?)`)
          .run(job.job_id, outcome.kind, now, principal.nodeId, request.leaseId, sourceProfile.profileId);
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
