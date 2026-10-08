
export async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isIp(hostname: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4) return ipv4.slice(1).every((n) => Number(n) >= 0 && Number(n) <= 255);
  return hostname.includes(":");
}

// D1 exec treats each line as a command. Keep complete statements on single lines.
export const D1_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS node_credentials ( node_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, capabilities_json TEXT NOT NULL, revoked_at TEXT );
CREATE TABLE IF NOT EXISTS node_credential_actions ( action_id INTEGER PRIMARY KEY AUTOINCREMENT, node_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL, FOREIGN KEY(node_id) REFERENCES node_credentials(node_id) );
CREATE TABLE IF NOT EXISTS node_heartbeats ( node_id TEXT PRIMARY KEY, last_seen_at TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('idle','fetching')), active_job_id TEXT, FOREIGN KEY(node_id) REFERENCES node_credentials(node_id) );
CREATE TABLE IF NOT EXISTS crawl_jobs ( job_id TEXT PRIMARY KEY, platform TEXT NOT NULL, url TEXT NOT NULL UNIQUE, origin TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','leased','done','backoff','blocked')), next_fetch_at TEXT NOT NULL, claimed_by TEXT, lease_id TEXT, lease_expires_at TEXT, etag TEXT, last_modified TEXT, created_at TEXT NOT NULL, robots_deferred_until TEXT, source_rule_id TEXT, job_purpose TEXT NOT NULL DEFAULT 'metadata' CHECK(job_purpose IN ('discovery','metadata')), lease_profile_id TEXT, FOREIGN KEY(claimed_by) REFERENCES node_credentials(node_id) );
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_ready ON crawl_jobs(state,next_fetch_at,platform);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_origin_due ON crawl_jobs(origin,next_fetch_at,state);
CREATE TABLE IF NOT EXISTS origin_leases ( origin TEXT PRIMARY KEY, active_job_id TEXT, lease_expires_at TEXT, next_allowed_at TEXT NOT NULL, min_delay_ms INTEGER NOT NULL, FOREIGN KEY(active_job_id) REFERENCES crawl_jobs(job_id) );
CREATE TABLE IF NOT EXISTS origin_robots ( origin TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, status_code INTEGER NOT NULL, body TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS origin_robots_refresh_leases ( origin TEXT PRIMARY KEY, lease_id TEXT NOT NULL, lease_expires_at TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS suppressed_urls ( url TEXT PRIMARY KEY, reason TEXT NOT NULL, suppressed_at TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS source_items ( source_key TEXT PRIMARY KEY, platform TEXT NOT NULL, source_url TEXT NOT NULL, latest_digest TEXT NOT NULL, latest_version_no INTEGER NOT NULL, gone_at TEXT );
CREATE TABLE IF NOT EXISTS source_versions ( version_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, version_no INTEGER NOT NULL, digest TEXT NOT NULL, payload_json TEXT NOT NULL, observed_at TEXT NOT NULL, complete INTEGER NOT NULL DEFAULT 1 CHECK(complete IN (0,1)), contributor_node_id TEXT, submission_lease_id TEXT, source_profile_id TEXT, UNIQUE(source_key,version_no), FOREIGN KEY(source_key) REFERENCES source_items(source_key) );
CREATE TABLE IF NOT EXISTS source_events ( event_id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, source_key TEXT, kind TEXT NOT NULL, observed_at TEXT NOT NULL, version_id TEXT, contributor_node_id TEXT, submission_lease_id TEXT, source_profile_id TEXT, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id) );
CREATE TABLE IF NOT EXISTS source_issues ( issue_id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, source_item_key TEXT NOT NULL, version_key TEXT, code TEXT NOT NULL, observed_at TEXT NOT NULL, contributor_node_id TEXT, submission_lease_id TEXT, source_profile_id TEXT, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id) );
CREATE TABLE IF NOT EXISTS source_leads ( lead_key TEXT PRIMARY KEY, discovered_from_url TEXT NOT NULL, discovered_from_job_id TEXT NOT NULL, discovered_from_item_key TEXT, kind TEXT NOT NULL, target_url TEXT NOT NULL, claimed_package_id TEXT, status TEXT NOT NULL CHECK(status IN ('pending_review','approved','rejected')), first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, first_seen_node_id TEXT, first_seen_lease_id TEXT, first_seen_profile_id TEXT, last_seen_node_id TEXT, last_seen_lease_id TEXT, last_seen_profile_id TEXT, FOREIGN KEY(discovered_from_job_id) REFERENCES crawl_jobs(job_id) );
CREATE INDEX IF NOT EXISTS idx_source_leads_status ON source_leads(status,kind);
CREATE INDEX IF NOT EXISTS idx_source_leads_page ON source_leads(status,first_seen_at,lead_key);
CREATE TABLE IF NOT EXISTS operator_actions ( action_id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, lead_key TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL, FOREIGN KEY(lead_key) REFERENCES source_leads(lead_key) );
CREATE TABLE IF NOT EXISTS job_seed_actions ( action_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, actor TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id) );
CREATE TABLE IF NOT EXISTS lead_autoqueue_rules ( rule_id TEXT PRIMARY KEY, lead_kind TEXT NOT NULL, origin TEXT NOT NULL, path_scope TEXT NOT NULL, min_delay_ms INTEGER NOT NULL, expires_at TEXT NOT NULL, review_reference TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, disabled_at TEXT );
CREATE INDEX IF NOT EXISTS idx_lead_autoqueue_rules_scope ON lead_autoqueue_rules(lead_kind,origin,disabled_at,expires_at);
CREATE INDEX IF NOT EXISTS idx_lead_autoqueue_rules_page ON lead_autoqueue_rules(created_at DESC,rule_id DESC);
CREATE TABLE IF NOT EXISTS operator_rule_actions ( action_id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL, FOREIGN KEY(rule_id) REFERENCES lead_autoqueue_rules(rule_id) );
CREATE TABLE IF NOT EXISTS source_access_profiles ( profile_id TEXT PRIMARY KEY, platform TEXT NOT NULL, origin TEXT NOT NULL, path_scope TEXT NOT NULL, query_scope TEXT, method TEXT NOT NULL CHECK(method='GET'), purpose TEXT NOT NULL CHECK(purpose IN ('discovery','metadata')), min_delay_ms INTEGER NOT NULL, expires_at TEXT NOT NULL, review_reference TEXT NOT NULL, reason TEXT NOT NULL, retain_classes_json TEXT NOT NULL, publish_classes_json TEXT NOT NULL, created_at TEXT NOT NULL, disabled_at TEXT );
CREATE INDEX IF NOT EXISTS idx_source_access_profiles_scope ON source_access_profiles(platform,origin,purpose,disabled_at,expires_at);
CREATE INDEX IF NOT EXISTS idx_source_access_profiles_page ON source_access_profiles(created_at DESC,profile_id DESC);
CREATE TABLE IF NOT EXISTS source_access_profile_actions ( action_id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, occurred_at TEXT NOT NULL, FOREIGN KEY(profile_id) REFERENCES source_access_profiles(profile_id) );
CREATE TABLE IF NOT EXISTS job_results ( lease_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, node_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, response_json TEXT NOT NULL, submitted_at TEXT NOT NULL, FOREIGN KEY(job_id) REFERENCES crawl_jobs(job_id) );
CREATE TABLE IF NOT EXISTS canonical_packages ( canonical_id TEXT PRIMARY KEY, umbrella TEXT NOT NULL CHECK(umbrella IN ('tools','assets','avatars')), category TEXT NOT NULL, lifecycle TEXT NOT NULL CHECK(lifecycle IN ('active','deprecated','quarantined','delisted')), display_name TEXT NOT NULL, vpm_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT, timestamp_confidence TEXT, content_rating TEXT NOT NULL DEFAULT 'general' );

CREATE TABLE IF NOT EXISTS coordinator_meta ( key TEXT PRIMARY KEY, value TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_canonical_packages_updated ON canonical_packages(updated_at ASC, canonical_id ASC);
CREATE INDEX IF NOT EXISTS idx_canonical_packages_created ON canonical_packages(created_at DESC, canonical_id DESC);
CREATE TABLE IF NOT EXISTS identity_links ( link_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, canonical_id TEXT NOT NULL, evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('vpm_id','repository_match','cross_storefront_link','curator_verified','simhash_match')), confidence REAL NOT NULL CHECK(confidence >= 0.0 AND confidence <= 1.0), review_state TEXT NOT NULL CHECK(review_state IN ('provisional','accepted','rejected')), created_at TEXT NOT NULL, reviewed_at TEXT, FOREIGN KEY(source_key) REFERENCES source_items(source_key), FOREIGN KEY(canonical_id) REFERENCES canonical_packages(canonical_id) );
CREATE INDEX IF NOT EXISTS idx_identity_links_source ON identity_links(source_key);
CREATE INDEX IF NOT EXISTS idx_identity_links_canonical ON identity_links(canonical_id);
CREATE TABLE IF NOT EXISTS package_fronts ( front_id TEXT PRIMARY KEY, canonical_id TEXT NOT NULL, source_key TEXT NOT NULL, platform TEXT NOT NULL, storefront_url TEXT NOT NULL, price REAL, currency TEXT, availability TEXT NOT NULL DEFAULT 'available', observed_at TEXT NOT NULL, UNIQUE(canonical_id, source_key), FOREIGN KEY (canonical_id) REFERENCES canonical_packages(canonical_id) ON DELETE CASCADE, FOREIGN KEY (source_key) REFERENCES source_items(source_key) ON DELETE CASCADE );
CREATE INDEX IF NOT EXISTS idx_package_fronts_canonical ON package_fronts(canonical_id);
CREATE INDEX IF NOT EXISTS idx_package_fronts_source ON package_fronts(source_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_package_fronts_canonical_source ON package_fronts(canonical_id, source_key);
CREATE INDEX IF NOT EXISTS idx_source_versions_complete ON source_versions(source_key,complete,version_no DESC);
CREATE INDEX IF NOT EXISTS idx_source_versions_contributor ON source_versions(contributor_node_id,observed_at DESC,version_id DESC);
CREATE INDEX IF NOT EXISTS idx_source_events_contributor ON source_events(contributor_node_id,event_id DESC);
CREATE INDEX IF NOT EXISTS idx_source_issues_contributor ON source_issues(contributor_node_id,issue_id DESC);
CREATE INDEX IF NOT EXISTS idx_source_leads_first_node ON source_leads(first_seen_node_id,first_seen_at DESC,lead_key DESC);
CREATE INDEX IF NOT EXISTS idx_source_leads_last_node ON source_leads(last_seen_node_id,last_seen_at DESC,lead_key DESC);
CREATE TABLE IF NOT EXISTS avatar_compatibilities ( compatibility_id TEXT PRIMARY KEY, source_key TEXT NOT NULL, target_avatar_base TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('named_base', 'universal', 'uncertain')), confidence TEXT NOT NULL CHECK(confidence IN ('creator_declared', 'keyword_inferred', 'unverified')), evidence_source TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (source_key) REFERENCES source_items(source_key) ON DELETE CASCADE );
CREATE INDEX IF NOT EXISTS idx_avatar_compat_source_key ON avatar_compatibilities(source_key);
CREATE INDEX IF NOT EXISTS idx_avatar_compat_target_base ON avatar_compatibilities(target_avatar_base);
CREATE TABLE IF NOT EXISTS desktop_tool_evidence ( canonical_id TEXT PRIMARY KEY, tool_subtype TEXT NOT NULL CHECK(tool_subtype IN ('companion_client','osc_control','tracking_bridge','streaming_accessibility','utility')), supported_os TEXT NOT NULL, particular_vrchat_target INTEGER NOT NULL CHECK(particular_vrchat_target IN (0, 1)), evidence_url TEXT NOT NULL, publisher_claim TEXT NOT NULL, confidence REAL NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (canonical_id) REFERENCES canonical_packages(canonical_id) ON DELETE CASCADE );
CREATE TABLE IF NOT EXISTS registered_apps ( app_id TEXT PRIMARY KEY, app_name TEXT NOT NULL, token_hash TEXT NOT NULL, contact_email TEXT, permissions_json TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT );
CREATE INDEX IF NOT EXISTS idx_registered_apps_token_hash ON registered_apps(token_hash);
CREATE TABLE IF NOT EXISTS catalog_reports ( report_id TEXT PRIMARY KEY, app_id TEXT NOT NULL REFERENCES registered_apps(app_id), report_type TEXT NOT NULL CHECK(report_type='removal_request'), payload_json TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','rejected')), recorded_at TEXT NOT NULL );
CREATE INDEX IF NOT EXISTS idx_catalog_reports_review ON catalog_reports(review_status,recorded_at,report_id);
CREATE TABLE IF NOT EXISTS downstream_demand_signals ( signal_id TEXT PRIMARY KEY, app_id TEXT NOT NULL, signal_type TEXT NOT NULL CHECK(signal_type IN ('search_miss','refresh_demand','popularity_signal')), query TEXT, zero_hits INTEGER NOT NULL DEFAULT 0, requested_platform TEXT, target_url TEXT, category TEXT, metadata_json TEXT, recorded_at TEXT NOT NULL, resolved_at TEXT, FOREIGN KEY (app_id) REFERENCES registered_apps(app_id) );
CREATE INDEX IF NOT EXISTS idx_downstream_demand_platform ON downstream_demand_signals(requested_platform, resolved_at);
CREATE TABLE IF NOT EXISTS registered_users ( user_id TEXT PRIMARY KEY, user_name TEXT NOT NULL, token_hash TEXT NOT NULL, contact_email TEXT, created_at TEXT NOT NULL, revoked_at TEXT, age_verified INTEGER NOT NULL DEFAULT 0, is_moderator INTEGER NOT NULL DEFAULT 0 );
CREATE INDEX IF NOT EXISTS idx_registered_users_token ON registered_users(token_hash);
CREATE TABLE IF NOT EXISTS user_app_ownership ( app_id TEXT PRIMARY KEY REFERENCES registered_apps(app_id), user_id TEXT NOT NULL REFERENCES registered_users(user_id) );
CREATE INDEX IF NOT EXISTS idx_user_app_ownership_user ON user_app_ownership(user_id,app_id);
CREATE TABLE IF NOT EXISTS creator_opt_outs ( takedown_id TEXT PRIMARY KEY, target_url TEXT, canonical_id TEXT, requester_type TEXT NOT NULL CHECK(requester_type IN ('unauthenticated_creator','user','admin_operator')), requester_id TEXT, reason TEXT NOT NULL, proof_kind TEXT CHECK(proof_kind IN ('storefront_bio_token','dns_txt','manual_notice')), proof_value TEXT, contact_email TEXT, recorded_at TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'accepted' CHECK(review_status IN ('pending','accepted','rejected')), review_notes TEXT );
CREATE INDEX IF NOT EXISTS idx_opt_outs_target_url ON creator_opt_outs(target_url);
CREATE INDEX IF NOT EXISTS idx_opt_outs_canonical_id ON creator_opt_outs(canonical_id);
CREATE TABLE IF NOT EXISTS delegated_creator_claims ( claim_id TEXT PRIMARY KEY, app_id TEXT NOT NULL REFERENCES registered_apps(app_id), action TEXT NOT NULL CHECK(action = 'creator_ownership_claim'), front_url TEXT NOT NULL, creator_id TEXT NOT NULL, challenge_token TEXT NOT NULL, expires_at INTEGER NOT NULL, nonce TEXT NOT NULL, signature TEXT NOT NULL, payload_json TEXT NOT NULL, reason TEXT, contact_email TEXT, review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','rejected')), review_notes TEXT, recorded_at TEXT NOT NULL );
CREATE UNIQUE INDEX IF NOT EXISTS idx_delegated_claims_nonce ON delegated_creator_claims(app_id, nonce);
CREATE INDEX IF NOT EXISTS idx_delegated_claims_status ON delegated_creator_claims(review_status, recorded_at, claim_id);
`;

