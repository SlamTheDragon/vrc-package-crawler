import { z } from "zod";
import { PlatformSchema } from "./node_protocol.ts";
import { DOWNSTREAM_PROTOCOL_VERSION } from "vrc-packages-api";

/**
 * Downstream application and user protocol contracts.
 * Consumer-facing schemas are re-exported from shared package SDK (vrc-packages-api).
 */
export {
  DOWNSTREAM_PROTOCOL_VERSION,
  RegisterAppRequestSchema,
  type RegisterAppRequest,
  RegisterAppResponseSchema,
  type RegisterAppResponse,
  DelistProofKindSchema,
  type DelistProofKind,
  DelistRequestSchema,
  type DelistRequest,
  DelistResponseSchema,
  type DelistResponse,
  FeedbackSignalTypeSchema,
  type FeedbackSignalType,
  DownstreamFeedbackRequestSchema,
  type DownstreamFeedbackRequest,
  DownstreamFeedbackResponseSchema,
  type DownstreamFeedbackResponse,
  QueryOriginSchema,
  type QueryOrigin,
  CatalogSearchRequestSchema,
  type CatalogSearchRequest,
  CatalogSearchResponseSchema,
  type CatalogSearchResponse,
  CatalogRandomResponseSchema,
  type CatalogRandomResponse,
  ConsolidatedReportTypeSchema,
  type ConsolidatedReportType,
  DemandSignalKindSchema,
  type DemandSignalKind,
  IssueReportKindSchema,
  type IssueReportKind,
  ReportSubmissionRequestSchema,
  type ReportSubmissionRequest,
  ReportSubmissionResponseSchema,
  type ReportSubmissionResponse
} from "vrc-packages-api";

/**
 * Crawler-specific Node registration contracts.
 * Maintained strictly within crawler infrastructure and never exposed to downstream consumer SDK.
 */
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
