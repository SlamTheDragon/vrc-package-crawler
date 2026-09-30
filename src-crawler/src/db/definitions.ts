export type PlatformType = "booth" | "github" | "vpm" | "gumroad" | "jinxxy" | "itch" | "vrchat" | "shopify";

export interface PlatformMetrics {
  pending: number;
  retrying: number;
  fetching: number;
  done: number;
  failed: number;
  entities: number;
}

export interface SystemMetrics {
  totalDiscovered: number;
  totalPending: number;
  totalFreshPending: number;
  totalRetrying: number;
  totalFetching: number;
  totalDone: number;
  totalFailed: number;
  totalDiscarded: number;
  totalEntities: number;
  totalQuarantined: number;
  totalMerged: number;
  totalCanonical: number;
  platformStats: Record<PlatformType, PlatformMetrics>;
}

export interface FrontierItem {
  url: string;
  platform: PlatformType;
  status: "pending" | "fetching" | "done" | "failed" | "blocked" | "dead_letter" | "circuit_broken" | "backoff";
  attempts: number;
  etag?: string | null;
  last_modified?: string | null;
  change_rate_lambda: number;
  fetch_interval_sec: number;
  last_fetched_at?: string | null;
  next_fetch_at: string;
  priority: number;
  discovered_at: string;
  updated_at: string;
  last_failure_code?: number | null;
  last_failure_reason?: string | null;
  failure_count?: number;
}

export interface EntityRecord {
  id: string;
  platform: string;
  url: string;
  title: string;
  author: string;
  price_currency?: string | null;
  price_amount?: number | null;
  description: string;
  tags_json?: string;
  external_links_json?: string;
  raw_json?: string;
  is_quarantined?: number;
  quarantine_reasons_json?: string;
  origin_created_at?: string | null;
  origin_updated_at?: string | null;
  observed_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CanonicalPackage {
  id: string;
  canonical_id: string;
  name: string;
  author: string;
  authors_json: string;
  category: string;
  subcategory: string;
  type: string;
  description: string;
  primary_platform: string;
  platforms_json: string;
  url: string;
  vcc_url?: string | null;
  price_currency: string;
  price_amount: number;
  is_vcc: number;
  tags_json: string;
  dependencies_json: string;
  source_ids_json: string;
  media_id?: string | null;
  /** Internal media indexing attempt time; null means newly eligible for inspection. */
  media_checked_at?: string | null;
  /** JSON array of deduplicated preview image/GIF URLs (quality-filtered, ≥200px, no icons/logos) */
  media_urls_json?: string;
  /** JSON array of deduplicated YouTube video URLs found on the storefront listing */
  youtube_urls_json?: string;
  origin_created_at?: string | null;
  origin_updated_at?: string | null;
  created_at_confidence?: "confirmed" | "inferred" | "unknown" | null;
  lifecycle?: "published" | "updated" | "delisted" | "archived" | "paywall_introduced" | "dmca_removed" | "creator_opted_out" | "needs_review";
  lifecycle_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CuratorOverride {
  id: string;
  canonical_id: string;
  name_override?: string | null;
  url_override?: string | null;
  description_override?: string | null;
  category_override?: string | null;
  subcategory_override?: string | null;
  added_tags_json?: string;
  removed_tags_json?: string;
  reason?: string | null;
  reporter_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserReport {
  report_id: string;
  target_package_id: string;
  target_package_name: string;
  branch: "categorization" | "irrelevance" | "listing" | "tags" | "discovery_query";
  branch_payload_json: string;
  reporter_notes?: string | null;
  client_fingerprint?: string | null;
  trust_tier?: "anonymous" | "verified_creator" | "trusted_curator";
  status: "pending" | "applied" | "rejected" | "needs_review";
  applied_at?: string | null;
  submitted_at: string;
  created_at: string;
}

export interface SearchPattern {
  id: string;
  query: string;
  query_intent?: string | null;
  relevance_vote: "boost" | "suppress";
  negative_tokens_json: string;
  suggested_seeds_json: string;
  weight?: number;
  created_at: string;
  updated_at: string;
}

export interface PackageFront {
  id: string;
  canonical_id: string;
  platform: string;
  platform_item_id: string;
  url: string;
  title: string;
  author: string;
  price_currency?: string | null;
  price_amount?: number | null;
  origin_created_at?: string | null;
  origin_updated_at?: string | null;
  raw_entity_id: string;
  /** JSON array of this storefront's preview image/GIF URLs (quality-filtered, no icons/logos) */
  media_urls_json?: string;
  /** JSON array of YouTube video URLs found on this storefront listing */
  youtube_urls_json?: string;
  created_at: string;
  updated_at: string;
}

export interface CreatorOptOut {
  id: string;
  creator_name: string;
  platform: string;
  pattern: string;
  reason: string;
  opted_out_at: string;
  verified: number;
}

export interface MediaCacheRecord {
  id: string;
  source_url: string;
  blurhash?: string | null;
  phash_64?: string | null;
  width?: number;
  height?: number;
  content_type?: string;
  etag?: string | null;
  last_processed_at: string;
}
