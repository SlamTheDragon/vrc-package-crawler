import { z } from "zod";
import { NodeIdSchema, PlatformSchema } from "./node_protocol.ts";

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
export const IssueNodeCredentialSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), nodeId: NodeIdSchema,
  capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length),
  reason: z.string().trim().min(3).max(300)
});
export type IssueNodeCredential = z.infer<typeof IssueNodeCredentialSchema>;
export const NodeCredentialResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), nodeId: NodeIdSchema,
  capabilities: z.array(PlatformSchema).min(1).max(PlatformSchema.options.length),
  token: z.string().regex(/^[a-f0-9]{64}$/)
});
const RuleOriginSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.origin === value && !url.username && !url.password;
}, "Canonical HTTPS origin required");
const RulePathScopeSchema = z.string().min(1).max(200).regex(/^\/[A-Za-z0-9._~/-]*$/)
  .refine((value) => !value.includes("//") && !value.split("/").some((segment) => segment === "." || segment === ".."),
    "Canonical path scope required");
export const CreateAutoQueueRuleSchema = z.strictObject({ schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  leadKind: z.literal("vpm_listing"), origin: RuleOriginSchema, pathScope: RulePathScopeSchema,
  minDelayMs: z.number().int().min(1000).max(86_400_000),
  expiresAt: z.iso.datetime(), reviewReference: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(3).max(300) });
export type CreateAutoQueueRule = z.infer<typeof CreateAutoQueueRuleSchema>;
export const DisableAutoQueueRuleSchema = z.strictObject({ schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  reason: z.string().trim().min(3).max(300) });
export const AutoQueueRuleSchema = z.strictObject({
  ruleId: z.uuid(), leadKind: z.literal("vpm_listing"), origin: RuleOriginSchema,
  pathScope: RulePathScopeSchema, minDelayMs: z.number().int().min(1000).max(86_400_000),
  expiresAt: z.iso.datetime(), reviewReference: z.string(), reason: z.string(),
  createdAt: z.iso.datetime(), disabledAt: z.iso.datetime().nullable()
});
export type AutoQueueRule = z.infer<typeof AutoQueueRuleSchema>;
export const RuleCursorSchema = z.strictObject({
  createdAt: z.iso.datetime(), ruleId: z.uuid()
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
  } catch { return null; }
}
export const AutoQueueRuleListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), rules: z.array(AutoQueueRuleSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export const AutoQueueRuleResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), rule: AutoQueueRuleSchema
});
export const LeadActionResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), leadKey: z.string(),
    status: z.literal("approved"), jobId: z.string() }),
  z.strictObject({ schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION), leadKey: z.string(),
    status: z.literal("rejected") })
]);

/** One accepted identity link embedded in a catalog package response row. */
export const CatalogIdentityLinkSchema = z.strictObject({
  linkId: z.uuid(),
  sourceKey: z.string().min(1).max(500),
  evidenceKind: z.enum(["vpm_id", "repository_match", "cross_storefront_link", "curator_verified", "simhash_match"]),
  confidence: z.number().min(0).max(1),
  createdAt: z.iso.datetime()
});
export type CatalogIdentityLink = z.infer<typeof CatalogIdentityLinkSchema>;

export const PackageFrontSchema = z.object({
  frontId: z.string(),
  canonicalId: z.string(),
  sourceKey: z.string(),
  platform: PlatformSchema,
  storefrontUrl: z.string().url(),
  price: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  availability: z.enum(["available", "delisted", "unknown"]).default("available"),
  observedAt: z.string()
});
export type PackageFront = z.infer<typeof PackageFrontSchema>;

/** One row in the canonical catalog page. */
export const CatalogPackageSchema = z.strictObject({
  canonicalId: z.string().min(1).max(500),
  umbrella: z.enum(["tools", "assets", "avatars"]),
  category: z.string().min(1).max(200),
  lifecycle: z.enum(["active", "deprecated", "quarantined", "delisted"]),
  displayName: z.string().min(1).max(500),
  vpmId: z.string().min(1).max(200).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  acceptedLinks: z.array(CatalogIdentityLinkSchema),
  fronts: z.array(PackageFrontSchema).default([])
});
export type CatalogPackage = z.infer<typeof CatalogPackageSchema>;

export const CatalogCursorSchema = z.strictObject({
  createdAt: z.iso.datetime(), canonicalId: z.string().min(1).max(500)
});
export type CatalogCursor = z.infer<typeof CatalogCursorSchema>;
export function encodeCatalogCursor(cursor: CatalogCursor): string {
  return btoa(JSON.stringify(CatalogCursorSchema.parse(cursor)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export function decodeCatalogCursor(value: string): CatalogCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const cursor = CatalogCursorSchema.parse(JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/"))));
    return encodeCatalogCursor(cursor) === value ? cursor : null;
  } catch { return null; }
}

export const CatalogListResponseSchema = z.strictObject({
  schemaVersion: z.literal(OPERATOR_PROTOCOL_VERSION),
  packages: z.array(CatalogPackageSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});

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
  catalogListResponse: z.toJSONSchema(CatalogListResponseSchema)
};
