import { z } from "zod";
import { PlatformSchema, type Platform } from "../types/platform.ts";
import { CatalogPackageSchema, type CatalogPackage } from "../types/package.ts";
import { ContentRatingSchema, type ContentRating } from "../taxonomy/taxonomy.ts";


export const DOWNSTREAM_PROTOCOL_VERSION = 1 as const;

export const RegisterAppRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  appName: z.string().trim().min(2).max(100),
  contactEmail: z.string().email().max(200).optional(),
  description: z.string().trim().max(500).optional()
});
export type RegisterAppRequest = z.infer<typeof RegisterAppRequestSchema>;

export const RegisterAppResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  appId: z.string().uuid(),
  appName: z.string(),
  appToken: z.string().regex(/^vrcp_app_[a-f0-9]{64}$/),
  permissions: z.array(z.string().min(1).max(50))
});
export type RegisterAppResponse = z.infer<typeof RegisterAppResponseSchema>;

const HttpsUrlSchema = z.string().url().refine((value) => new URL(value).protocol === "https:", "HTTPS URL required");

export const FeedbackSignalTypeSchema = z.enum([
  "search_miss",
  "refresh_demand",
  "popularity_signal"
]);
export type FeedbackSignalType = z.infer<typeof FeedbackSignalTypeSchema>;

export const DownstreamFeedbackRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  signalType: FeedbackSignalTypeSchema,
  query: z.string().trim().max(200).optional(),
  zeroHits: z.boolean().optional(),
  requestedPlatform: PlatformSchema.optional(),
  targetUrl: HttpsUrlSchema.optional(),
  category: z.string().trim().max(100).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional()
});
export type DownstreamFeedbackRequest = z.infer<typeof DownstreamFeedbackRequestSchema>;

export const DownstreamFeedbackResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  status: z.literal("accepted"),
  signalId: z.string().uuid(),
  recordedAt: z.string().datetime()
});
export type DownstreamFeedbackResponse = z.infer<typeof DownstreamFeedbackResponseSchema>;

export const QueryOriginSchema = z.enum(["user_authored", "app_automated"]);
export type QueryOrigin = z.infer<typeof QueryOriginSchema>;

export const CatalogSearchRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  query: z.string().trim().max(200).optional(),
  queryOrigin: QueryOriginSchema.default("user_authored"),
  umbrella: z.enum(["tools", "assets", "avatars"]).optional(),
  category: z.string().trim().max(100).optional(),
  platform: PlatformSchema.optional(),
  rating: ContentRatingSchema.optional(),
  tags: z.array(z.string().trim().max(50)).max(20).optional(),
  limit: z.number().int().min(1).max(50).default(50).optional(),
  cursor: z.string().max(256).nullable().optional()
});
export type CatalogSearchRequest = z.infer<typeof CatalogSearchRequestSchema>;

export const CatalogSearchResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  items: z.array(CatalogPackageSchema),
  nextCursor: z.string().nullable().optional(),
  totalEstimated: z.number().int().min(0).optional(),
  count: z.number().int().min(0).optional(),
  queryOrigin: QueryOriginSchema.optional()
});
export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponseSchema>;

/** Consolidated reporting routes per API_ROUTES §2.4 line 90 */
export const ConsolidatedReportTypeSchema = z.enum(["demand_signal", "issue_report", "removal_request"]);
export type ConsolidatedReportType = z.infer<typeof ConsolidatedReportTypeSchema>;

export const DemandSignalKindSchema = z.enum(["search_miss", "refresh_demand", "popularity_signal"]);
export type DemandSignalKind = z.infer<typeof DemandSignalKindSchema>;

export const IssueReportKindSchema = z.enum([
  "broken_link",
  "wrong_metadata",
  "misclassified",
  "inappropriate",
  "explicit_false_positive",
  "explicit_false_negative"
]);
export type IssueReportKind = z.infer<typeof IssueReportKindSchema>;

export const ReportSubmissionRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  reportType: ConsolidatedReportTypeSchema,
  signalKind: DemandSignalKindSchema.optional(),
  reportKind: IssueReportKindSchema.optional(),
  targetUrl: HttpsUrlSchema.optional(),
  canonicalId: z.string().trim().min(1).max(500).optional(),
  query: z.string().trim().max(200).optional(),
  zeroHits: z.boolean().optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
  metadata: z.record(z.string().max(100), z.unknown()).optional()
}).refine(data => data.reportType !== "removal_request" || Boolean(data.reason && (data.targetUrl || data.canonicalId)),
  { message: "Removal requests require a target and reason" })
  .refine(data => data.reportType !== "removal_request" || (data.signalKind === undefined && data.reportKind === undefined && data.query === undefined && data.zeroHits === undefined),
    { message: "Removal requests cannot include demand or issue fields" });
export type ReportSubmissionRequest = z.infer<typeof ReportSubmissionRequestSchema>;

export const ReportSubmissionResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  status: z.literal("accepted"),
  reportId: z.string().uuid(),
  recordedAt: z.string().datetime()
});
export type ReportSubmissionResponse = z.infer<typeof ReportSubmissionResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Delegated Creator Attestation Intake (R54-C38C)                            */
/* -------------------------------------------------------------------------- */

export const CreatorDelegationAttestationSchema = z.strictObject({
  appId: z.string().uuid(),
  action: z.literal("creator_ownership_claim"),
  frontUrl: HttpsUrlSchema,
  creatorId: z.string().trim().min(1).max(200),
  challengeToken: z.string().trim().min(16).max(128),
  expiresAt: z.number().int().positive(),
  nonce: z.string().trim().min(16).max(128)
});
export type CreatorDelegationAttestation = z.infer<typeof CreatorDelegationAttestationSchema>;

export const CreatorClaimIntakeRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  attestation: CreatorDelegationAttestationSchema,
  signature: z.string().trim().min(1).max(512),
  reason: z.string().trim().min(1).max(1000).optional(),
  contactEmail: z.string().email().max(200).optional()
});
export type CreatorClaimIntakeRequest = z.infer<typeof CreatorClaimIntakeRequestSchema>;

export const CreatorClaimIntakeResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  status: z.literal("accepted"),
  claimId: z.string().uuid(),
  reviewStatus: z.literal("pending"),
  recordedAt: z.string().datetime()
});
export type CreatorClaimIntakeResponse = z.infer<typeof CreatorClaimIntakeResponseSchema>;

