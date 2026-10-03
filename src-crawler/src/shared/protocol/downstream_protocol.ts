import { DOWNSTREAM_PROTOCOL_VERSION } from "vrc-packages-api";

/**
 * Downstream application and user protocol contracts.
 * Consumer-facing schemas are re-exported from shared package SDK (vrc-packages-api).
 */
export {
  UserAppSchema, UserAppListQuerySchema, UserAppListResponseSchema, UserAppResponseSchema,
  type UserApp, type UserAppListQuery, type UserAppListResponse, type UserAppResponse,
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
