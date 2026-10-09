import { z } from "zod";
import { ContentRatingSchema, type ContentRating } from "../taxonomy/taxonomy.ts";

export const MODERATOR_PROTOCOL_VERSION = 1 as const;

export const ModeratorRatingRecordSchema = z.strictObject({
  canonicalId: z.string().min(1).max(100),
  displayName: z.string(),
  currentRating: ContentRatingSchema,
  umbrella: z.enum(["assets", "tools", "avatars"]),
  category: z.string(),
  reportCount: z.number().int().min(0),
  updatedAt: z.string().datetime()
});
export type ModeratorRatingRecord = z.infer<typeof ModeratorRatingRecordSchema>;

export const ModeratorRatingCursorSchema = z.strictObject({
  updatedAt: z.string().datetime(),
  canonicalId: z.string().min(1).max(100)
});
export type ModeratorRatingCursor = z.infer<typeof ModeratorRatingCursorSchema>;

export function encodeModeratorRatingCursor(cursor: ModeratorRatingCursor): string {
  return btoa(JSON.stringify(ModeratorRatingCursorSchema.parse(cursor)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeModeratorRatingCursor(value: string): ModeratorRatingCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const cursor = ModeratorRatingCursorSchema.parse(JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/"))));
    return encodeModeratorRatingCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}

export const ModeratorRatingListQuerySchema = z.strictObject({
  rating: ContentRatingSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  cursor: z.string().min(1).max(256).optional()
}).refine(query => query.cursor === undefined || decodeModeratorRatingCursor(query.cursor) !== null, "Invalid moderator cursor");
export type ModeratorRatingListQuery = z.infer<typeof ModeratorRatingListQuerySchema>;

export const ModeratorRatingListResponseSchema = z.strictObject({
  schemaVersion: z.literal(MODERATOR_PROTOCOL_VERSION),
  ratings: z.array(ModeratorRatingRecordSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export type ModeratorRatingListResponse = z.infer<typeof ModeratorRatingListResponseSchema>;

export const SetRatingAdjustmentRequestSchema = z.strictObject({
  schemaVersion: z.literal(MODERATOR_PROTOCOL_VERSION),
  newRating: ContentRatingSchema,
  reason: z.string().trim().min(3).max(300)
});
export type SetRatingAdjustmentRequest = z.infer<typeof SetRatingAdjustmentRequestSchema>;

export const SetRatingAdjustmentResponseSchema = z.strictObject({
  schemaVersion: z.literal(MODERATOR_PROTOCOL_VERSION),
  canonicalId: z.string().min(1).max(100),
  previousRating: ContentRatingSchema,
  newRating: ContentRatingSchema,
  adjustedBy: z.string(),
  updatedAt: z.string().datetime()
});
export type SetRatingAdjustmentResponse = z.infer<typeof SetRatingAdjustmentResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Moderator Application Candidate Review                                     */
/* -------------------------------------------------------------------------- */

import {
  CandidateStatusSchema,
  type CandidateStatus,
  decodeOperatorAppCursor,
  encodeOperatorAppCursor,
  type OperatorAppCursor
} from "./operator.ts";

export const ModeratorAppRecordSchema = z.strictObject({
  appId: z.string().uuid(),
  appName: z.string().min(1).max(100),
  contactEmail: z.string().nullable().optional(),
  permissions: z.array(z.string()),
  delegationAllowed: z.boolean(),
  requestCount: z.number().int().min(0).default(0),
  lastActiveAt: z.string().datetime().nullable().optional(),
  candidateStatus: CandidateStatusSchema.default("none"),
  candidateFlags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable()
});
export type ModeratorAppRecord = z.infer<typeof ModeratorAppRecordSchema>;

export const ModeratorAppListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  cursor: z.string().min(1).max(256).optional(),
  candidateStatus: CandidateStatusSchema.optional()
}).refine(query => query.cursor === undefined || decodeOperatorAppCursor(query.cursor) !== null, "Invalid app cursor");
export type ModeratorAppListQuery = z.infer<typeof ModeratorAppListQuerySchema>;

export const ModeratorAppListResponseSchema = z.strictObject({
  schemaVersion: z.literal(MODERATOR_PROTOCOL_VERSION),
  apps: z.array(ModeratorAppRecordSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});
export type ModeratorAppListResponse = z.infer<typeof ModeratorAppListResponseSchema>;

export const ModeratorReviewAppCandidateRequestSchema = z.strictObject({
  schemaVersion: z.literal(MODERATOR_PROTOCOL_VERSION),
  candidateStatus: z.enum(["none", "reviewed", "trusted"]),
  grantDelegation: z.boolean().optional(),
  notes: z.string().trim().min(1).max(500).optional()
});
export type ModeratorReviewAppCandidateRequest = z.infer<typeof ModeratorReviewAppCandidateRequestSchema>;

export const ModeratorReviewAppCandidateResponseSchema = z.strictObject({
  schemaVersion: z.literal(MODERATOR_PROTOCOL_VERSION),
  appId: z.string().uuid(),
  candidateStatus: CandidateStatusSchema,
  candidateFlags: z.array(z.string()),
  delegationAllowed: z.boolean(),
  permissions: z.array(z.string()),
  reviewedAt: z.string().datetime()
});
export type ModeratorReviewAppCandidateResponse = z.infer<typeof ModeratorReviewAppCandidateResponseSchema>;

