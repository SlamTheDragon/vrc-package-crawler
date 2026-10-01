import { z } from "zod";
import { PlatformSchema, type Platform } from "./node_protocol.ts";
import { CatalogPackageSchema, type CatalogPackage } from "./operator_protocol.ts";

export const DOWNSTREAM_PROTOCOL_VERSION = 1 as const;

export const RegisterAppRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  appName: z.string().trim().min(2).max(100),
  contactEmail: z.email().max(200).optional(),
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

export const RegisterNodeRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  nodeId: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  reason: z.string().trim().max(500).optional(),
  requestedCapabilities: z.array(PlatformSchema).min(1).max(10).optional()
});
export type RegisterNodeRequest = z.infer<typeof RegisterNodeRequestSchema>;

export const RegisterNodeResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  nodeId: z.string(),
  capabilities: z.array(PlatformSchema),
  token: z.string().regex(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/)
});
export type RegisterNodeResponse = z.infer<typeof RegisterNodeResponseSchema>;

const HttpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", "HTTPS URL required");

export const DelistProofKindSchema = z.enum([
  "storefront_bio_token",
  "dns_txt",
  "manual_notice"
]);
export type DelistProofKind = z.infer<typeof DelistProofKindSchema>;

export const DelistRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  targetUrl: HttpsUrlSchema.optional(),
  canonicalId: z.string().trim().min(1).max(500).optional(),
  reason: z.string().trim().min(1).max(1000),
  contactEmail: z.email().max(200).optional(),
  proofKind: DelistProofKindSchema.optional(),
  proofValue: z.string().trim().max(500).optional()
}).refine(
  (data) => Boolean(data.targetUrl || data.canonicalId),
  { message: "Either targetUrl or canonicalId must be provided for delisting" }
);
export type DelistRequest = z.infer<typeof DelistRequestSchema>;

export const DelistResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  status: z.literal("accepted"),
  takedownId: z.string().uuid(),
  target: z.string(),
  action: z.literal("delisted"),
  requesterType: z.enum(["unauthenticated_creator", "registrant", "admin_operator"]),
  recordedAt: z.iso.datetime()
});
export type DelistResponse = z.infer<typeof DelistResponseSchema>;

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
  recordedAt: z.iso.datetime()
});
export type DownstreamFeedbackResponse = z.infer<typeof DownstreamFeedbackResponseSchema>;

export const CatalogSearchRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  query: z.string().trim().max(200).optional(),
  umbrella: z.enum(["tools", "assets", "avatars"]).optional(),
  category: z.string().trim().max(100).optional(),
  platform: PlatformSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50).optional(),
  cursor: z.string().max(256).nullable().optional()
});
export type CatalogSearchRequest = z.infer<typeof CatalogSearchRequestSchema>;

export const CatalogSearchResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  items: z.array(CatalogPackageSchema),
  nextCursor: z.string().nullable(),
  totalEstimated: z.number().int().min(0)
});
export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponseSchema>;

export const CatalogRandomResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  items: z.array(CatalogPackageSchema)
});
export type CatalogRandomResponse = z.infer<typeof CatalogRandomResponseSchema>;
