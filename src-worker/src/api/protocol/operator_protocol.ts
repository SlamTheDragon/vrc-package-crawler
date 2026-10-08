import { z } from "zod";
import { CreateAutoQueueRuleSchema, DisableAutoQueueRuleSchema, AutoQueueRuleListResponseSchema,
  AutoQueueRuleResponseSchema, IssueNodeCredentialSchema, NodeCredentialResponseSchema,
  CatalogListResponseSchema,
  OperatorAppRecordSchema, OperatorAppListResponseSchema, SetAppDelegationRequestSchema, SetAppDelegationResponseSchema,
  decodeOperatorAppCursor, encodeOperatorAppCursor, OperatorAppCursorSchema, OperatorAppListQuerySchema,
  type OperatorAppRecord, type OperatorAppCursor, type OperatorAppListQuery,
  type SetAppDelegationRequest, type SetAppDelegationResponse
} from "vrc-packages-api";

export const OPERATOR_PROTOCOL_VERSION = 1 as const;
export const LeadStatusSchema = z.enum(["pending_review", "approved", "rejected"]);
export const LeadRowSchema = z.strictObject({
  lead_key: z.string(), kind: z.string(), target_url: z.string(), claimed_package_id: z.string().nullable(),
  discovered_from_url: z.string(), discovered_from_item_key: z.string().nullable(), status: LeadStatusSchema,
  first_seen_at: z.string(), last_seen_at: z.string()
});
export type LeadRow = z.infer<typeof LeadRowSchema>;
export const LeadCursorSchema = z.strictObject({
  status: LeadStatusSchema, firstSeenAt: z.iso.datetime(), leadKey: z.string().regex(/^[a-f0-9]{64}$/)
});
export type LeadCursor = z.infer<typeof LeadCursorSchema>;
export function encodeLeadCursor(cursor: LeadCursor): string {
  return btoa(JSON.stringify(LeadCursorSchema.parse(cursor)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export function decodeLeadCursor(value: string, status: LeadCursor["status"]): LeadCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const decoded = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
    const cursor = LeadCursorSchema.parse(JSON.parse(decoded));
    return cursor.status === status && encodeLeadCursor(cursor) === value ? cursor : null;
  } catch { return null; }
}
export const LeadListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), leads: z.array(LeadRowSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export const ApproveLeadSchema = z.strictObject({ schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300), minDelayMs: z.number().int().min(0).max(86_400_000).optional() });
export const RejectLeadSchema = z.strictObject({ schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300) });
export const LeadActionResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), leadKey: z.string(),
    status: z.literal("approved"), jobId: z.string() }),
  z.strictObject({ schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), leadKey: z.string(),
    status: z.literal("rejected") })
]);

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
  recordedAt: z.iso.datetime()
});
export type TakedownRecord = z.infer<typeof TakedownRecordSchema>;

export const TakedownCursorSchema = z.strictObject({
  recordedAt: z.iso.datetime(),
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
  updatedAt: z.iso.datetime()
});
export type VerifyTakedownResponse = z.infer<typeof VerifyTakedownResponseSchema>;

export const VerifyDelegatedClaimRequestSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  verdict: z.enum(["accepted", "rejected"]),
  notes: z.string().trim().max(1000).optional()
});
export type VerifyDelegatedClaimRequest = z.infer<typeof VerifyDelegatedClaimRequestSchema>;

export const VerifyDelegatedClaimResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  claimId: z.string().uuid(),
  status: z.enum(["accepted", "rejected"]),
  updatedAt: z.iso.datetime()
});
export type VerifyDelegatedClaimResponse = z.infer<typeof VerifyDelegatedClaimResponseSchema>;

export const DelegatedClaimRecordSchema = z.strictObject({
  claimId: z.string().uuid(),
  appId: z.string().uuid(),
  action: z.literal("creator_ownership_claim"),
  frontUrl: z.string(),
  creatorId: z.string(),
  challengeToken: z.string(),
  expiresAt: z.number().int(),
  nonce: z.string(),
  signature: z.string(),
  reason: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  reviewStatus: z.enum(["pending", "accepted", "rejected"]),
  reviewNotes: z.string().nullable().optional(),
  recordedAt: z.iso.datetime()
});
export type DelegatedClaimRecord = z.infer<typeof DelegatedClaimRecordSchema>;

export const DelegatedClaimCursorSchema = z.strictObject({
  recordedAt: z.iso.datetime(),
  claimId: z.string().uuid()
});
export type DelegatedClaimCursor = z.infer<typeof DelegatedClaimCursorSchema>;

export function encodeDelegatedClaimCursor(cursor: DelegatedClaimCursor): string {
  return btoa(JSON.stringify(DelegatedClaimCursorSchema.parse(cursor)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeDelegatedClaimCursor(value: string): DelegatedClaimCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const cursor = DelegatedClaimCursorSchema.parse(JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/"))));
    return encodeDelegatedClaimCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}

export const DelegatedClaimListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  records: z.array(DelegatedClaimRecordSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export type DelegatedClaimListResponse = z.infer<typeof DelegatedClaimListResponseSchema>;

export const OPERATOR_API_JSON_SCHEMAS = {
  approveLead: z.toJSONSchema(ApproveLeadSchema),
  rejectLead: z.toJSONSchema(RejectLeadSchema),
  leadListResponse: z.toJSONSchema(LeadListResponseSchema),
  leadActionResponse: z.toJSONSchema(LeadActionResponseSchema),
  createAutoQueueRule: z.toJSONSchema(CreateAutoQueueRuleSchema),
  disableAutoQueueRule: z.toJSONSchema(DisableAutoQueueRuleSchema),
  autoQueueRuleListResponse: z.toJSONSchema(AutoQueueRuleListResponseSchema),
  autoQueueRuleResponse: z.toJSONSchema(AutoQueueRuleResponseSchema),
  issueNodeCredential: z.toJSONSchema(IssueNodeCredentialSchema),
  nodeCredentialResponse: z.toJSONSchema(NodeCredentialResponseSchema),
  catalogListResponse: z.toJSONSchema(CatalogListResponseSchema),
  takedownListResponse: z.toJSONSchema(TakedownListResponseSchema),
  verifyTakedownRequest: z.toJSONSchema(VerifyTakedownRequestSchema),
  verifyTakedownResponse: z.toJSONSchema(VerifyTakedownResponseSchema),
  delegatedClaimListResponse: z.toJSONSchema(DelegatedClaimListResponseSchema),
  verifyDelegatedClaimRequest: z.toJSONSchema(VerifyDelegatedClaimRequestSchema),
  verifyDelegatedClaimResponse: z.toJSONSchema(VerifyDelegatedClaimResponseSchema),
  operatorAppListResponse: z.toJSONSchema(OperatorAppListResponseSchema),
  setAppDelegationRequest: z.toJSONSchema(SetAppDelegationRequestSchema),
  setAppDelegationResponse: z.toJSONSchema(SetAppDelegationResponseSchema)
};

export {
  OperatorAppRecordSchema,
  OperatorAppListResponseSchema,
  SetAppDelegationRequestSchema,
  SetAppDelegationResponseSchema,
  decodeOperatorAppCursor,
  encodeOperatorAppCursor,
  OperatorAppCursorSchema,
  OperatorAppListQuerySchema,
  type OperatorAppRecord,
  type OperatorAppCursor,
  type OperatorAppListQuery,
  type SetAppDelegationRequest,
  type SetAppDelegationResponse
};
