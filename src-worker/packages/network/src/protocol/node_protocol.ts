/** Internal leased-ingestion contract; not part of the consumer SDK API. */
import { z } from "zod";
import { IssueNodeCredentialSchema } from "vrc-packages-api";
import { EvidenceClassSchema } from "../policy/evidence_class.ts";
import { isVpmVersion } from "../taxonomy/vpm_version.ts";

export const PROTOCOL_VERSION = 1 as const;

export const PlatformSchema = z.enum([
  "booth", "github", "vpm", "gumroad", "jinxxy", "itch", "curated", "shopify", "sellfy", "custom_domain"
]);
export type Platform = z.infer<typeof PlatformSchema>;
export const STOREFRONT_PLATFORMS: ReadonlySet<Platform> = new Set([
  "booth", "gumroad", "jinxxy", "itch", "shopify", "sellfy", "custom_domain"
]);
export const JobPurposeSchema = z.enum(["discovery", "metadata"]);
export type JobPurpose = z.infer<typeof JobPurposeSchema>;

export const NodeIdSchema = IssueNodeCredentialSchema.shape.nodeId;
const JobIdSchema = z.string().min(1).max(120);
const HttpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", "HTTPS URL required");

export const ClaimRequestSchema = z.strictObject({
  schemaVersion: z.literal(PROTOCOL_VERSION),
  nodeId: NodeIdSchema,
  capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length)
});
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

export const CrawlJobSchema = z.strictObject({
  jobId: JobIdSchema,
  leaseId: z.uuid(),
  platform: PlatformSchema,
  purpose: JobPurposeSchema,
  url: HttpsUrlSchema,
  origin: HttpsUrlSchema,
  leaseExpiresAt: z.iso.datetime(),
  retainClasses: z.array(EvidenceClassSchema).min(1).max(4),
  etag: z.string().nullable(),
  lastModified: z.string().nullable()
});
export type CrawlJob = z.infer<typeof CrawlJobSchema>;

export const ClaimResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ schemaVersion: z.literal(PROTOCOL_VERSION), status: z.literal("leased"), job: CrawlJobSchema }),
  z.strictObject({ schemaVersion: z.literal(PROTOCOL_VERSION), status: z.literal("empty"), retryAfterMs: z.number().int().min(0).max(300000) })
]);
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

export const HeartbeatRequestSchema = z.discriminatedUnion("state", [
  z.strictObject({ schemaVersion: z.literal(PROTOCOL_VERSION), nodeId: NodeIdSchema,
    capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length), state: z.literal("idle") }),
  z.strictObject({ schemaVersion: z.literal(PROTOCOL_VERSION), nodeId: NodeIdSchema,
    capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length), state: z.literal("fetching"),
    activeJobId: JobIdSchema, activeLeaseId: z.uuid() })
]);
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;

export const HeartbeatResponseSchema = z.strictObject({
  schemaVersion: z.literal(PROTOCOL_VERSION),
  status: z.literal("alive"),
  serverTime: z.iso.datetime()
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;

const VpmReleaseEvidenceSchema = z.strictObject({
  version: z.string().min(1).max(100).refine(isVpmVersion, "Canonical SemVer 2.0.0 version required"),
  dependencyRanges: z.record(z.string().min(1).max(200), z.string().min(1).max(200))
    .refine((value) => Object.keys(value).length <= 100, "At most 100 dependencies"),
  downloadUrl: HttpsUrlSchema.optional(),
  zipSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional()
});

export const VpmListingIssueSchema = z.strictObject({
  sourceItemKey: z.string().min(1).max(200),
  version: z.string().min(1).max(100).optional(),
  code: z.enum(["invalid_package", "invalid_manifest", "identity_mismatch", "invalid_version", "invalid_release_evidence"])
});
export type VpmListingIssue = z.infer<typeof VpmListingIssueSchema>;

export const ObservationSchema = z.strictObject({
  sourceItemKey: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  author: z.string().min(1).max(300),
  summary: z.string().max(1024),
  outboundLinks: z.array(HttpsUrlSchema).max(100),
  originUpdatedAt: z.iso.datetime().nullable(),
  release: VpmReleaseEvidenceSchema.optional(),
  releases: z.array(VpmReleaseEvidenceSchema).min(1).max(100).optional(),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  availability: z.enum(["available", "delisted", "unknown"]).optional(),
  storefrontUrl: HttpsUrlSchema.optional(),
  platformTags: z.array(z.string().max(100)).max(50).optional()
});
export type Observation = z.infer<typeof ObservationSchema>;

/** A lease's platform, not a node-supplied item, determines release authority. */
export function observationMatchesPlatform(platform: Platform, observation: Observation): boolean {
  const directRelease = observation.release !== undefined;
  const listingReleases = observation.releases !== undefined;
  // VPM source metadata may lack installable release proof; never synthesize one.
  return platform === "vpm" ? !(directRelease && listingReleases) : !directRelease && !listingReleases;
}

export const DiscoveryLeadSchema = z.strictObject({
  kind: z.enum(["vpm_listing", "github_repository", "release_zip",
    "creator_profile", "publisher_site", "storefront_product"]),
  url: HttpsUrlSchema,
  discoveredFromItemKey: z.string().min(1).max(200).optional(),
  claimedPackageId: z.string().min(1).max(200).optional()
});
export type DiscoveryLead = z.infer<typeof DiscoveryLeadSchema>;

export const ResultRequestSchema = z.strictObject({
  schemaVersion: z.literal(PROTOCOL_VERSION),
  nodeId: NodeIdSchema,
  jobId: JobIdSchema,
  leaseId: z.uuid(),
  idempotencyKey: z.string().min(16).max(150),
  outcome: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("changed"), observation: ObservationSchema }),
    z.strictObject({ kind: z.literal("batch"), observations: z.array(ObservationSchema).min(1).max(100) }),
    z.strictObject({ kind: z.literal("partial_batch"), observations: z.array(ObservationSchema).max(100),
      issues: z.array(VpmListingIssueSchema).min(1).max(100) }),
    z.strictObject({ kind: z.literal("discovery"), leads: z.array(DiscoveryLeadSchema).max(100) }),
    z.strictObject({ kind: z.literal("unchanged") }),
    z.strictObject({ kind: z.literal("gone") }),
    z.strictObject({ kind: z.literal("temporary_failure"), reason: z.string().min(1).max(300) }),
    z.strictObject({ kind: z.literal("rate_limited"), retryAfterSeconds: z.number().int().min(1).max(86400) }),
    z.strictObject({ kind: z.literal("blocked"), reason: z.string().min(1).max(300) })
  ])
});
export type ResultRequest = z.infer<typeof ResultRequestSchema>;

export const ResultResponseSchema = z.strictObject({
  schemaVersion: z.literal(PROTOCOL_VERSION),
  status: z.literal("accepted"),
  jobId: JobIdSchema,
  duplicate: z.boolean(),
  sourceVersionCreated: z.boolean()
});
export type ResultResponse = z.infer<typeof ResultResponseSchema>;

export const ProtocolErrorSchema = z.strictObject({
  schemaVersion: z.literal(PROTOCOL_VERSION),
  error: z.string().min(1),
  code: z.enum(["bad_json", "invalid_payload", "unauthorized", "forbidden", "conflict", "not_found", "internal_error"])
});

/** These schemas are exported for documentation and non-TypeScript consumers. */
export const NODE_API_JSON_SCHEMAS = {
  claimRequest: z.toJSONSchema(ClaimRequestSchema),
  claimResponse: z.toJSONSchema(ClaimResponseSchema),
  heartbeatRequest: z.toJSONSchema(HeartbeatRequestSchema),
  heartbeatResponse: z.toJSONSchema(HeartbeatResponseSchema),
  resultRequest: z.toJSONSchema(ResultRequestSchema),
  resultResponse: z.toJSONSchema(ResultResponseSchema),
  error: z.toJSONSchema(ProtocolErrorSchema)
} as const;
