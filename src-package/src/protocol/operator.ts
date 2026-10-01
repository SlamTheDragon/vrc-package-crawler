import { z } from "zod";
import { PlatformSchema, type Platform } from "../types/platform.ts";
import { CatalogPackageSchema, type CatalogPackage } from "../types/package.ts";

export const OPERATOR_PROTOCOL_VERSION = 1 as const;

/* -------------------------------------------------------------------------- */
/* Leads                                                                      */
/* -------------------------------------------------------------------------- */

export const LeadStatusSchema = z.enum(["pending_review", "approved", "rejected"]);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const LeadKindSchema = z.enum([
  "vpm_listing",
  "github_repository",
  "release_zip",
  "creator_profile",
  "publisher_site",
  "storefront_product"
]);
export type LeadKind = z.infer<typeof LeadKindSchema>;

export const LeadRowSchema = z.strictObject({
  leadKey: z.string().regex(/^[a-f0-9]{64}$/),
  leadKind: LeadKindSchema,
  targetUrl: z.string().url(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  status: LeadStatusSchema,
  reviewedAt: z.string().datetime().nullable(),
  reviewedBy: z.string().nullable(),
  reviewReason: z.string().nullable()
});
export type LeadRow = z.infer<typeof LeadRowSchema>;

export const LeadCursorSchema = z.strictObject({
  lastSeenAt: z.string().datetime(),
  leadKey: z.string().regex(/^[a-f0-9]{64}$/)
});
export type LeadCursor = z.infer<typeof LeadCursorSchema>;

export function encodeLeadCursor(cursor: LeadCursor): string {
  return btoa(JSON.stringify(LeadCursorSchema.parse(cursor)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeLeadCursor(value: string, _status?: LeadStatus): LeadCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const cursor = LeadCursorSchema.parse(JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/"))));
    return encodeLeadCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}

export const ApproveLeadSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  minDelayMs: z.number().int().min(1000).max(86_400_000).optional(),
  reason: z.string().trim().min(3).max(300).default("Operator approved")
});
export type ApproveLead = z.infer<typeof ApproveLeadSchema>;

export const RejectLeadSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300).default("Operator rejected")
});
export type RejectLead = z.infer<typeof RejectLeadSchema>;

export const LeadListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  leads: z.array(LeadRowSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export type LeadListResponse = z.infer<typeof LeadListResponseSchema>;

export const LeadActionResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({
    schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
    leadKey: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.literal("approved"),
    jobId: z.string()
  }),
  z.strictObject({
    schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
    leadKey: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.literal("rejected")
  })
]);
export type LeadActionResponse = z.infer<typeof LeadActionResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Source Access Profiles                                                     */
/* -------------------------------------------------------------------------- */

export const EvidenceClassSchema = z.enum(["normalized_facts", "creator_prose", "raw_payload", "media_metadata"]);
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

export const SourcePurposeSchema = z.enum(["discovery", "metadata"]);
export type SourcePurpose = z.infer<typeof SourcePurposeSchema>;

export const CreateSourceAccessProfileSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  platform: PlatformSchema,
  origin: z.string().url(),
  pathScope: z.string().min(1).max(300),
  exactQuery: z.string().min(3).max(200).optional(),
  method: z.literal("GET"),
  purpose: SourcePurposeSchema,
  minDelayMs: z.number().int().min(1000).max(86_400_000),
  expiresAt: z.string().datetime(),
  reviewReference: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(3).max(300),
  retainClasses: z.array(EvidenceClassSchema).max(4),
  publishClasses: z.array(EvidenceClassSchema).max(4)
});
export type CreateSourceAccessProfile = z.infer<typeof CreateSourceAccessProfileSchema>;

export const SourceAccessProfileSchema = CreateSourceAccessProfileSchema.safeExtend({
  profileId: z.string().uuid(),
  createdAt: z.string().datetime(),
  disabledAt: z.string().datetime().nullable()
});
export type SourceAccessProfile = z.infer<typeof SourceAccessProfileSchema>;

export const DisableSourceAccessProfileSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300)
});
export type DisableSourceAccessProfile = z.infer<typeof DisableSourceAccessProfileSchema>;

export const ProfileCursorSchema = z.strictObject({
  createdAt: z.string().datetime(),
  profileId: z.string().uuid()
});
export type ProfileCursor = z.infer<typeof ProfileCursorSchema>;

export function encodeProfileCursor(cursor: ProfileCursor): string {
  return btoa(JSON.stringify(ProfileCursorSchema.parse(cursor)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeProfileCursor(value: string): ProfileCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const cursor = ProfileCursorSchema.parse(JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/"))));
    return encodeProfileCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}

export const SourceAccessProfileResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  profile: SourceAccessProfileSchema
});
export type SourceAccessProfileResponse = z.infer<typeof SourceAccessProfileResponseSchema>;

export const SourceAccessProfileListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  profiles: z.array(SourceAccessProfileSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export type SourceAccessProfileListResponse = z.infer<typeof SourceAccessProfileListResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Auto-Queue Rules                                                           */
/* -------------------------------------------------------------------------- */

export const AutoQueueRuleSchema = z.strictObject({
  ruleId: z.string().uuid(),
  leadKind: LeadKindSchema,
  origin: z.string().url(),
  pathScope: z.string().min(1).max(300),
  minDelayMs: z.number().int().min(1000).max(86_400_000),
  expiresAt: z.string().datetime(),
  reviewReference: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(3).max(300),
  createdAt: z.string().datetime(),
  disabledAt: z.string().datetime().nullable()
});
export type AutoQueueRule = z.infer<typeof AutoQueueRuleSchema>;

export const CreateAutoQueueRuleSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  leadKind: LeadKindSchema,
  origin: z.string().url(),
  pathScope: z.string().min(1).max(300),
  minDelayMs: z.number().int().min(1000).max(86_400_000),
  expiresAt: z.string().datetime(),
  reviewReference: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(3).max(300)
});
export type CreateAutoQueueRule = z.infer<typeof CreateAutoQueueRuleSchema>;

export const DisableAutoQueueRuleSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300)
});
export type DisableAutoQueueRule = z.infer<typeof DisableAutoQueueRuleSchema>;

export const RuleCursorSchema = z.strictObject({
  createdAt: z.string().datetime(),
  ruleId: z.string().uuid()
});
export type RuleCursor = z.infer<typeof RuleCursorSchema>;

export function encodeRuleCursor(cursor: RuleCursor): string {
  return btoa(JSON.stringify(RuleCursorSchema.parse(cursor)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeRuleCursor(value: string): RuleCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const cursor = RuleCursorSchema.parse(JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/"))));
    return encodeRuleCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}

export const AutoQueueRuleListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  rules: z.array(AutoQueueRuleSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export type AutoQueueRuleListResponse = z.infer<typeof AutoQueueRuleListResponseSchema>;

export const AutoQueueRuleResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  rule: AutoQueueRuleSchema
});
export type AutoQueueRuleResponse = z.infer<typeof AutoQueueRuleResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Operator Node Issuance                                                     */
/* -------------------------------------------------------------------------- */

export const IssueNodeCredentialSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodeId: z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/),
  capabilities: z.array(PlatformSchema).min(1).max(10).optional(),
  reason: z.string().trim().min(3).max(300)
});
export type IssueNodeCredential = z.infer<typeof IssueNodeCredentialSchema>;

export const NodeCredentialResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  nodeId: z.string(),
  capabilities: z.array(PlatformSchema),
  token: z.string().regex(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/)
});
export type NodeCredentialResponse = z.infer<typeof NodeCredentialResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Operator Catalog Page                                                      */
/* -------------------------------------------------------------------------- */

export const CatalogListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  packages: z.array(CatalogPackageSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export type CatalogListResponse = z.infer<typeof CatalogListResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Takedowns & Creator Opt-Outs Audit                                         */
/* -------------------------------------------------------------------------- */

export const TakedownRecordSchema = z.strictObject({
  takedownId: z.string().uuid(),
  targetUrl: z.string().nullable(),
  canonicalId: z.string().nullable(),
  requesterType: z.enum(["unauthenticated_creator", "user", "admin_operator"]),
  requesterId: z.string().nullable(),
  reason: z.string(),
  proofKind: z.enum(["storefront_bio_token", "dns_txt", "manual_notice"]).nullable(),
  proofValue: z.string().nullable(),
  contactEmail: z.string().nullable(),
  reviewStatus: z.enum(["pending", "accepted", "rejected"]),
  reviewNotes: z.string().nullable().optional(),
  recordedAt: z.string().datetime()
});
export type TakedownRecord = z.infer<typeof TakedownRecordSchema>;

export const TakedownCursorSchema = z.strictObject({
  recordedAt: z.string().datetime(),
  takedownId: z.string().uuid()
});
export type TakedownCursor = z.infer<typeof TakedownCursorSchema>;

export function encodeTakedownCursor(cursor: TakedownCursor): string {
  return btoa(JSON.stringify(TakedownCursorSchema.parse(cursor)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeTakedownCursor(value: string): TakedownCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const cursor = TakedownCursorSchema.parse(JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/"))));
    return encodeTakedownCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}

export const TakedownListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  records: z.array(TakedownRecordSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export type TakedownListResponse = z.infer<typeof TakedownListResponseSchema>;

export const VerifyTakedownRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  verdict: z.enum(["accepted", "rejected"]),
  notes: z.string().trim().max(1000).optional()
});
export type VerifyTakedownRequest = z.infer<typeof VerifyTakedownRequestSchema>;

export const VerifyTakedownResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  takedownId: z.string().uuid(),
  status: z.enum(["accepted", "rejected"]),
  updatedAt: z.string().datetime()
});
export type VerifyTakedownResponse = z.infer<typeof VerifyTakedownResponseSchema>;
