import type { Platform } from "../../../../../src-crawler/src/shared/protocol/node_protocol.ts";
import type { SourcePurpose } from "../../../../../src-crawler/src/shared/policy/source_access_profile.ts";


export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: object;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}
export type JobRow = {
  job_id: string; platform: Platform; url: string; origin: string; state: string;
  next_fetch_at: string; lease_id: string | null; lease_expires_at: string | null; claimed_by: string | null;
  etag: string | null; last_modified: string | null; source_rule_id: string | null;
  job_purpose: SourcePurpose; lease_profile_id: string | null;
};
export type AutoQueueRuleRow = {
  rule_id: string; lead_kind: string; origin: string; path_scope: string; min_delay_ms: number;
  expires_at: string; review_reference: string; reason: string; created_at: string; disabled_at: string | null;
};
export type SourceAccessProfileRow = {
  profile_id: string; platform: Platform; origin: string; path_scope: string; query_scope: string | null;
  method: "GET";
  purpose: SourcePurpose; min_delay_ms: number; expires_at: string; review_reference: string;
  reason: string; retain_classes_json: string; publish_classes_json: string;
  created_at: string; disabled_at: string | null;
};

export type CanonicalUmbrella = "tools" | "assets" | "avatars";
export type CanonicalLifecycle = "active" | "deprecated" | "quarantined" | "delisted";
export type EvidenceKind = "vpm_id" | "repository_match" | "cross_storefront_link" | "curator_verified" | "simhash_match";
export type LinkReviewState = "provisional" | "accepted" | "rejected";

export type CanonicalPackage = {
  canonicalId: string;
  umbrella: CanonicalUmbrella;
  category: string;
  lifecycle: CanonicalLifecycle;
  displayName: string;
  vpmId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IdentityLink = {
  linkId: string;
  sourceKey: string;
  canonicalId: string;
  evidenceKind: EvidenceKind;
  confidence: number;
  reviewState: LinkReviewState;
  createdAt: string;
  reviewedAt: string | null;
};
