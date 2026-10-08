import {
  type Platform
} from "./types/index.ts";
import {
  type CatalogDeltaResponse,
  CatalogDeltaResponseSchema,
  CatalogDeltaQuerySchema,
  type PublicCatalogListQuery,
  PublicCatalogListQuerySchema,
  type PublicCatalogListResponse,
  PublicCatalogListResponseSchema
} from "./protocol/catalog.ts";
import {
  type CatalogSearchRequest,
  CatalogSearchRequestSchema,
  type CatalogSearchResponse,
  CatalogSearchResponseSchema,
  type RegisterAppRequest,
  RegisterAppRequestSchema,
  type RegisterAppResponse,
  RegisterAppResponseSchema,
  type ReportSubmissionRequest,
  ReportSubmissionRequestSchema,
  type ReportSubmissionResponse,
  ReportSubmissionResponseSchema,
  type CreatorClaimIntakeRequest,
  CreatorClaimIntakeRequestSchema,
  type CreatorClaimIntakeResponse,
  CreatorClaimIntakeResponseSchema,
  type QueryOrigin
} from "./protocol/downstream.ts";
import { UserAppListQuerySchema, UserAppListResponseSchema, UserAppResponseSchema, UserAppSchema,
  type UserAppListQuery, type UserAppListResponse, type UserAppResponse } from "./protocol/user.ts";
import {
  MODERATOR_PROTOCOL_VERSION,
  type ModeratorRatingRecord,
  ModeratorRatingRecordSchema,
  type ModeratorRatingListQuery,
  ModeratorRatingListQuerySchema,
  type ModeratorRatingListResponse,
  ModeratorRatingListResponseSchema,
  type SetRatingAdjustmentRequest,
  SetRatingAdjustmentRequestSchema,
  type SetRatingAdjustmentResponse,
  SetRatingAdjustmentResponseSchema
} from "./protocol/moderator.ts";
import { type ContentRating } from "./taxonomy/taxonomy.ts";
import {
  type LeadStatus,
  OperatorLeadListQuerySchema, OperatorProfileListQuerySchema, OperatorRuleListQuerySchema,
  OperatorCatalogListQuerySchema, OperatorTakedownListQuerySchema, OperatorClaimListQuerySchema,
  OperatorAppListQuerySchema, type OperatorAppListQuery,
  OperatorAppListResponseSchema, type OperatorAppListResponse,
  SetAppDelegationRequestSchema, SetAppDelegationResponseSchema,
  type SetAppDelegationRequest, type SetAppDelegationResponse,
  LeadCursorSchema, ProfileCursorSchema, RuleCursorSchema, TakedownCursorSchema, DelegatedClaimCursorSchema, OperatorAppCursorSchema,
  ApproveLeadSchema, RejectLeadSchema,
  CreateSourceAccessProfileSchema, DisableSourceAccessProfileSchema,
  CreateAutoQueueRuleSchema, DisableAutoQueueRuleSchema,
  IssueNodeCredentialSchema, VerifyTakedownRequestSchema,
  VerifyDelegatedClaimRequestSchema, VerifyDelegatedClaimResponseSchema,
  type VerifyDelegatedClaimResponse,
  DelegatedClaimListResponseSchema, type DelegatedClaimListResponse,
  RevokeNodeRequestSchema, RevokeNodeResponseSchema, type RevokeNodeResponse,
  EnqueueJobRequestSchema, EnqueueJobResponseSchema,
  type EnqueueJobRequest, type EnqueueJobResponse,
  InitializeCoordinatorRequestSchema,
  InitializeCoordinatorResponseSchema,
  type InitializeCoordinatorResponse,
  type LeadListResponse,
  LeadListResponseSchema,
  type LeadActionResponse,
  LeadActionResponseSchema,
  type SourceAccessProfileListResponse,
  SourceAccessProfileListResponseSchema,
  type CreateSourceAccessProfile,
  type SourceAccessProfileResponse,
  SourceAccessProfileResponseSchema,
  type AutoQueueRuleListResponse,
  AutoQueueRuleListResponseSchema,
  type CreateAutoQueueRule,
  type AutoQueueRuleResponse,
  AutoQueueRuleResponseSchema,
  type IssueNodeCredential,
  type NodeCredentialResponse,
  NodeCredentialResponseSchema,
  type CatalogListResponse,
  CatalogListResponseSchema,
  type TakedownListResponse,
  TakedownListResponseSchema,
  type VerifyTakedownResponse,
  VerifyTakedownResponseSchema
} from "./protocol/operator.ts";

export const MAX_SDK_ERROR_BYTES = 64 * 1024;
export const MAX_SDK_SUCCESS_BYTES = 4 * 1024 * 1024;

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new VRCPApiError(response.status, `Response exceeds maximum byte limit of ${maxBytes} bytes`);
    }
    return text;
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new VRCPApiError(response.status, `Response exceeds maximum byte limit of ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export class VRCPApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "VRCPApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface VRCPackageClientOptions {
  /** Coordinator baseUrl, e.g. "https://api.vrc-packages.example" or "http://127.0.0.1:8787" */
  baseUrl: string;
  /** Downstream application token starting with `vrcp_app_` */
  appToken?: string;
  /** User token starting with `vrcp_usr_` */
  userToken?: string;
  /** Operator token for administrative endpoints */
  operatorToken?: string;
  /** Custom fetch implementation (defaults to global fetch) */
  fetch?: typeof fetch;
}

export interface CatalogSearchParams {
  query?: string;
  queryOrigin: QueryOrigin;
  umbrella?: "tools" | "assets" | "avatars";
  category?: string;
  platform?: Platform;
  tags?: string[];
  limit?: number;
  cursor?: string | null;
}

export interface SyncDeltasParams {
  cursor?: string;
  limit?: number;
}

export class VRCPackageClient {
  private readonly baseUrl: string;
  private readonly appToken?: string;
  private readonly userToken?: string;
  private readonly operatorToken?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: VRCPackageClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.appToken = options.appToken;
    this.userToken = options.userToken;
    this.operatorToken = options.operatorToken;
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "DELETE",
    options: {
      auth?: "app" | "user" | "operator" | "none";
      body?: unknown;
      queryParams?: Record<string, string | number | undefined>;
    } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.queryParams) {
      for (const [key, val] of Object.entries(options.queryParams)) {
        if (val !== undefined && val !== null) {
          url.searchParams.set(key, String(val));
        }
      }
    }

    const headers: Record<string, string> = {
      "Accept": "application/json"
    };

    if (options.auth === "app") {
      if (!this.appToken) {
        throw new VRCPApiError(401, "Application token (vrcp_app_) required for this endpoint");
      }
      headers["Authorization"] = `Bearer ${this.appToken}`;
    } else if (options.auth === "user") {
      if (!this.userToken) {
        throw new VRCPApiError(401, "User token (vrcp_usr_) required for this endpoint");
      }
      headers["Authorization"] = `Bearer ${this.userToken}`;
    } else if (options.auth === "operator") {
      if (!this.operatorToken) {
        throw new VRCPApiError(401, "Operator token required for this endpoint");
      }
      headers["Authorization"] = `Bearer ${this.operatorToken}`;
    }

    let requestBody: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(options.body);
    }

    const response = await this.fetchFn(url.toString(), {
      method,
      headers,
      body: requestBody,
      redirect: "manual"
    });

    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      throw new VRCPApiError(response.status, "API redirects are not permitted");
    }

    if (!response.ok) {
      const errorText = await readBoundedText(response, MAX_SDK_ERROR_BYTES);
      let errorBody: any = errorText;
      try {
        errorBody = JSON.parse(errorText);
      } catch {}
      const message = typeof errorBody === "object" && (errorBody?.message || errorBody?.error)
        ? (errorBody.message || errorBody.error)
        : `Request failed with status ${response.status}`;
      const code = typeof errorBody === "object" ? (errorBody?.code ?? errorBody?.error) : undefined;
      throw new VRCPApiError(response.status, message, code, errorBody);
    }

    const responseText = await readBoundedText(response, MAX_SDK_SUCCESS_BYTES);
    return JSON.parse(responseText) as T;
  }

  /* ------------------------------------------------------------------------ */
  /* Public & App Catalog Namespace (/v1/app/*)                               */
  /* ------------------------------------------------------------------------ */

  readonly index = {
    /**
     * Queries the public canonical package index projection (GET /v1/app/index).
     */
    query: async (params: PublicCatalogListQuery = {}): Promise<PublicCatalogListResponse> => {
      const query = PublicCatalogListQuerySchema.parse(params);
      const res = await this.request<unknown>("/v1/app/index", "GET", {
        auth: "none",
        queryParams: {
          limit: query.limit,
          cursor: query.cursor
        }
      });
      return PublicCatalogListResponseSchema.parse(res);
    },

    /**
     * Executes bounded search with mandatory query attribution (user_authored vs app_automated).
     * Requires downstream application token (POST /v1/app/index/search).
     */
    search: async (params: CatalogSearchParams): Promise<CatalogSearchResponse> => {
      const payload: CatalogSearchRequest = {
        schemaVersion: 1,
        query: params.query,
        queryOrigin: params.queryOrigin,
        umbrella: params.umbrella,
        category: params.category,
        platform: params.platform,
        tags: params.tags,
        limit: params.limit ?? 50,
        cursor: params.cursor
      };
      const res = await this.request<unknown>("/v1/app/index/search", "POST", {
        auth: "app",
        body: CatalogSearchRequestSchema.parse(payload)
      });
      return CatalogSearchResponseSchema.parse(res);
    },

    /**
     * Pages current catalog changes (GET /v1/app/index/delta), not an immutable event log.
     */
    syncDeltas: async (params: SyncDeltasParams = {}): Promise<CatalogDeltaResponse> => {
      const query = CatalogDeltaQuerySchema.parse(params);
      const res = await this.request<unknown>("/v1/app/index/delta", "GET", {
        auth: "none",
        queryParams: {
          cursor: query.cursor,
          limit: query.limit
        }
      });
      return CatalogDeltaResponseSchema.parse(res);
    }

  };

  readonly app = {
    /**
     * Registers a downstream application (POST /v1/app/register).
     * Gated by user authentication (userToken) or operator token.
     */
    register: async (request: RegisterAppRequest): Promise<RegisterAppResponse> => {
      const auth = this.userToken ? "user" : "operator";
      const res = await this.request<unknown>("/v1/app/register", "POST", {
        auth,
        body: RegisterAppRequestSchema.parse(request)
      });
      return RegisterAppResponseSchema.parse(res);
    }
  };

  readonly reports = {
    /**
     * Submits demand, issue or pending removal reports (POST /v1/app/report).
     * Requires downstream application token.
     */
    submit: async (report: ReportSubmissionRequest): Promise<ReportSubmissionResponse> => {
      const res = await this.request<unknown>("/v1/app/report", "POST", {
        auth: "app",
        body: ReportSubmissionRequestSchema.parse(report)
      });
      return ReportSubmissionResponseSchema.parse(res);
    }
  };

  readonly claims = {
    /**
     * Submits signed creator ownership claim attestation for review (POST /v1/app/claims/intake).
     * Requires downstream application token.
     */
    submitIntake: async (request: CreatorClaimIntakeRequest): Promise<CreatorClaimIntakeResponse> => {
      const res = await this.request<unknown>("/v1/app/claims/intake", "POST", {
        auth: "app",
        body: CreatorClaimIntakeRequestSchema.parse(request)
      });
      return CreatorClaimIntakeResponseSchema.parse(res);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* User Namespace (/v1/user/*)                                              */
  /* ------------------------------------------------------------------------ */

  readonly user = {
    apps: {
      list: async (params: Partial<UserAppListQuery> = {}): Promise<UserAppListResponse> => {
        const query = UserAppListQuerySchema.parse(params);
        if (query.cursor) query.cursor = query.cursor.toLowerCase();
        return UserAppListResponseSchema.parse(await this.request<unknown>("/v1/user/apps", "GET", { auth: "user", queryParams: query }));
      },
      get: async (appId: string): Promise<UserAppResponse> => {
        const id = UserAppSchema.shape.appId.parse(appId).toLowerCase();
        return UserAppResponseSchema.parse(await this.request<unknown>(`/v1/user/apps/${id}`, "GET", { auth: "user" }));
      }
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Admin Operator Protocol (/v1/operator/*)                                 */
  /* ------------------------------------------------------------------------ */

  readonly operator = {
    jobs: {
      /** Record a crawl candidate. Existing jobs keep their state and lease. */
      enqueue: async (request: EnqueueJobRequest): Promise<EnqueueJobResponse> => {
        const body = EnqueueJobRequestSchema.parse(request);
        const response = await this.request<unknown>("/v1/operator/jobs", "POST", { auth: "operator", body });
        return EnqueueJobResponseSchema.parse(response);
      }
    },
    /** Initialize storage and optionally queue candidates, without granting source access. */
    init: async (params: { autoSeed?: boolean } = {}): Promise<InitializeCoordinatorResponse> => {
      const body = InitializeCoordinatorRequestSchema.parse({ schemaVersion: 1, ...params });
      const response = await this.request<unknown>("/v1/operator/init", "POST", { auth: "operator", body });
      return InitializeCoordinatorResponseSchema.parse(response);
    },
    leads: {
      /**
       * Lists pending, approved, or rejected discovery leads (GET /v1/operator/leads).
       */
      list: async (params: {
        status?: LeadStatus;
        limit?: number;
        cursor?: string;
      } = {}): Promise<LeadListResponse> => {
        const query = OperatorLeadListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/leads", "GET", {
          auth: "operator",
          queryParams: {
            status: query.status,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return LeadListResponseSchema.parse(res);
      },

      /**
       * Approves a discovery lead into the crawl queue (POST /v1/operator/leads/{leadKey}/approve).
       */
      approve: async (
        leadKey: string,
        params: { minDelayMs?: number; reason: string }
      ): Promise<LeadActionResponse> => {
        const id = LeadCursorSchema.shape.leadKey.parse(leadKey);
        const res = await this.request<unknown>(`/v1/operator/leads/${id}/approve`, "POST", {
          auth: "operator",
          body: ApproveLeadSchema.parse({ schemaVersion: 1, ...params })
        });
        return LeadActionResponseSchema.parse(res);
      },

      /**
       * Rejects a discovery lead (POST /v1/operator/leads/{leadKey}/reject).
       */
      reject: async (
        leadKey: string,
        params: { reason: string }
      ): Promise<LeadActionResponse> => {
        const id = LeadCursorSchema.shape.leadKey.parse(leadKey);
        const res = await this.request<unknown>(`/v1/operator/leads/${id}/reject`, "POST", {
          auth: "operator",
          body: RejectLeadSchema.parse({ schemaVersion: 1, ...params })
        });
        return LeadActionResponseSchema.parse(res);
      }
    },

    sourceProfiles: {
      /**
       * Lists source-access profiles (GET /v1/operator/source-profiles).
       */
      list: async (params: { limit?: number; cursor?: string } = {}): Promise<SourceAccessProfileListResponse> => {
        const query = OperatorProfileListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/source-profiles", "GET", {
          auth: "operator",
          queryParams: {
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return SourceAccessProfileListResponseSchema.parse(res);
      },

      /**
       * Creates a source-access profile (POST /v1/operator/source-profiles).
       */
      create: async (request: CreateSourceAccessProfile): Promise<SourceAccessProfileResponse> => {
        const res = await this.request<unknown>("/v1/operator/source-profiles", "POST", {
          auth: "operator",
          body: CreateSourceAccessProfileSchema.parse(request)
        });
        return SourceAccessProfileResponseSchema.parse(res);
      },

      /**
       * Disables a source-access profile (POST /v1/operator/source-profiles/{id}/disable).
       */
      disable: async (profileId: string, reason: string): Promise<SourceAccessProfileResponse> => {
        const id = ProfileCursorSchema.shape.profileId.parse(profileId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/source-profiles/${id}/disable`, "POST", {
          auth: "operator",
          body: DisableSourceAccessProfileSchema.parse({ schemaVersion: 1, reason })
        });
        return SourceAccessProfileResponseSchema.parse(res);
      }
    },

    autoQueueRules: {
      /**
       * Lists auto-queue rules (GET /v1/operator/autoqueue-rules).
       */
      list: async (params: { limit?: number; cursor?: string } = {}): Promise<AutoQueueRuleListResponse> => {
        const query = OperatorRuleListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/autoqueue-rules", "GET", {
          auth: "operator",
          queryParams: {
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return AutoQueueRuleListResponseSchema.parse(res);
      },

      /**
       * Creates an auto-queue rule (POST /v1/operator/autoqueue-rules).
       */
      create: async (request: CreateAutoQueueRule): Promise<AutoQueueRuleResponse> => {
        const res = await this.request<unknown>("/v1/operator/autoqueue-rules", "POST", {
          auth: "operator",
          body: CreateAutoQueueRuleSchema.parse(request)
        });
        return AutoQueueRuleResponseSchema.parse(res);
      },

      /**
       * Disables an auto-queue rule (POST /v1/operator/autoqueue-rules/{id}/disable).
       */
      disable: async (ruleId: string, reason: string): Promise<AutoQueueRuleResponse> => {
        const id = RuleCursorSchema.shape.ruleId.parse(ruleId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/autoqueue-rules/${id}/disable`, "POST", {
          auth: "operator",
          body: DisableAutoQueueRuleSchema.parse({ schemaVersion: 1, reason })
        });
        return AutoQueueRuleResponseSchema.parse(res);
      }
    },

    nodes: {
      /** Revoke credentials without releasing a possibly in-flight origin reservation. */
      revoke: async (nodeId: string, reason: string): Promise<RevokeNodeResponse> => {
        RevokeNodeResponseSchema.shape.nodeId.parse(nodeId);
        const body = RevokeNodeRequestSchema.parse({ schemaVersion: 1, reason });
        const response = await this.request<unknown>(`/v1/operator/nodes/${encodeURIComponent(nodeId)}/revoke`, "POST", { auth: "operator", body });
        return RevokeNodeResponseSchema.parse(response);
      },
      /**
       * Issues an audited node credential with assigned capabilities (POST /v1/operator/nodes).
       */
      issue: async (request: IssueNodeCredential): Promise<NodeCredentialResponse> => {
        const res = await this.request<unknown>("/v1/operator/nodes", "POST", {
          auth: "operator",
          body: IssueNodeCredentialSchema.parse(request)
        });
        return NodeCredentialResponseSchema.parse(res);
      }
    },

    catalog: {
      /**
       * Lists canonical packages with operator oversight (GET /v1/operator/catalog).
       */
      list: async (params: { limit?: number; cursor?: string } = {}): Promise<CatalogListResponse> => {
        const query = OperatorCatalogListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/catalog", "GET", {
          auth: "operator",
          queryParams: {
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return CatalogListResponseSchema.parse(res);
      }
    },

    takedowns: {
      /**
       * Audits recorded creator opt-outs and delistings (GET /v1/operator/takedowns).
       */
      list: async (params: {
        requesterType?: "unauthenticated_creator" | "user" | "admin_operator";
        limit?: number;
        cursor?: string;
      } = {}): Promise<TakedownListResponse> => {
        const query = OperatorTakedownListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/takedowns", "GET", {
          auth: "operator",
          queryParams: {
            requesterType: query.requesterType,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return TakedownListResponseSchema.parse(res);
      },

      /**
       * Records an operator verdict on a stored creator opt-out (POST /v1/operator/takedowns/{id}/verify).
       */
      verify: async (
        takedownId: string,
        request: { verdict: "accepted" | "rejected"; notes?: string }
      ): Promise<VerifyTakedownResponse> => {
        const id = TakedownCursorSchema.shape.takedownId.parse(takedownId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/takedowns/${id}/verify`, "POST", {
          auth: "operator",
          body: VerifyTakedownRequestSchema.parse({
            schemaVersion: 1,
            verdict: request.verdict,
            notes: request.notes
          })
        });
        return VerifyTakedownResponseSchema.parse(res);
      }
    },

    claims: {
      /**
       * Audits recorded delegated creator claims (GET /v1/operator/claims).
       */
      list: async (params: {
        reviewStatus?: "pending" | "accepted" | "rejected";
        limit?: number;
        cursor?: string;
      } = {}): Promise<DelegatedClaimListResponse> => {
        const query = OperatorClaimListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/claims", "GET", {
          auth: "operator",
          queryParams: {
            reviewStatus: query.reviewStatus,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return DelegatedClaimListResponseSchema.parse(res);
      },

      /**
       * Records an operator verdict on a stored delegated creator claim (POST /v1/operator/claims/{id}/verify).
       */
      verify: async (
        claimId: string,
        request: { verdict: "accepted" | "rejected"; notes?: string }
      ): Promise<VerifyDelegatedClaimResponse> => {
        const id = DelegatedClaimCursorSchema.shape.claimId.parse(claimId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/claims/${id}/verify`, "POST", {
          auth: "operator",
          body: VerifyDelegatedClaimRequestSchema.parse({
            schemaVersion: 1,
            verdict: request.verdict,
            notes: request.notes
          })
        });
        return VerifyDelegatedClaimResponseSchema.parse(res);
      }
    },

    apps: {
      /**
       * Lists registered downstream applications (GET /v1/operator/apps).
       */
      list: async (params: { limit?: number; cursor?: string } = {}): Promise<OperatorAppListResponse> => {
        const query = OperatorAppListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/operator/apps", "GET", {
          auth: "operator",
          queryParams: {
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return OperatorAppListResponseSchema.parse(res);
      },

      /**
       * Sets delegation authority for a registered application (POST /v1/operator/apps/{appId}/delegation).
       */
      setDelegation: async (
        appId: string,
        request: { delegationAllowed: boolean; reason?: string }
      ): Promise<SetAppDelegationResponse> => {
        const id = OperatorAppCursorSchema.shape.appId.parse(appId).toLowerCase();
        const res = await this.request<unknown>(`/v1/operator/apps/${id}/delegation`, "POST", {
          auth: "operator",
          body: SetAppDelegationRequestSchema.parse({
            schemaVersion: 1,
            delegationAllowed: request.delegationAllowed,
            reason: request.reason
          })
        });
        return SetAppDelegationResponseSchema.parse(res);
      }
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Moderator Protocol (/v1/moderator/*)                                     */
  /* ------------------------------------------------------------------------ */

  readonly moderator = {
    ratings: {
      /**
       * Lists canonical packages for content rating review (GET /v1/moderator/ratings).
       * Requires age-verified moderator user token.
       */
      list: async (params: { rating?: ContentRating; limit?: number; cursor?: string } = {}): Promise<ModeratorRatingListResponse> => {
        const query = ModeratorRatingListQuerySchema.parse(params);
        const res = await this.request<unknown>("/v1/moderator/ratings", "GET", {
          auth: "user",
          queryParams: {
            rating: query.rating,
            limit: query.limit,
            cursor: query.cursor
          }
        });
        return ModeratorRatingListResponseSchema.parse(res);
      },

      /**
       * Adjusts the content rating of a canonical package (POST /v1/moderator/ratings/{canonicalId}).
       * Requires age-verified moderator user token.
       */
      adjust: async (
        canonicalId: string,
        request: { newRating: ContentRating; reason: string }
      ): Promise<SetRatingAdjustmentResponse> => {
        const id = ModeratorRatingRecordSchema.shape.canonicalId.parse(canonicalId);
        const res = await this.request<unknown>(`/v1/moderator/ratings/${encodeURIComponent(id)}`, "POST", {
          auth: "user",
          body: SetRatingAdjustmentRequestSchema.parse({
            schemaVersion: MODERATOR_PROTOCOL_VERSION,
            newRating: request.newRating,
            reason: request.reason
          })
        });
        return SetRatingAdjustmentResponseSchema.parse(res);
      }
    }
  };
}
