import {
  type CatalogPackage,
  type Platform
} from "./types/index.ts";
import {
  type CatalogDeltaResponse,
  CatalogDeltaResponseSchema,
  type PublicCatalogListResponse,
  PublicCatalogListResponseSchema
} from "./protocol/catalog.ts";
import {
  type CatalogSearchRequest,
  type CatalogSearchResponse,
  CatalogSearchResponseSchema,
  type DelistRequest,
  type DelistResponse,
  DelistResponseSchema,
  type RegisterAppRequest,
  type RegisterAppResponse,
  RegisterAppResponseSchema,
  type ReportSubmissionRequest,
  type ReportSubmissionResponse,
  ReportSubmissionResponseSchema,
  type CatalogRandomResponse,
  CatalogRandomResponseSchema,
  type QueryOrigin
} from "./protocol/downstream.ts";
import {
  type RegisterNodeRequest,
  type RegisterNodeResponse,
  RegisterNodeResponseSchema
} from "./protocol/user.ts";
import {
  type LeadStatus,
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

export class VrcApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "VrcApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface VrcPackagesClientOptions {
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

export interface CatalogQueryParams {
  query?: string;
  umbrella?: "tools" | "assets" | "avatars";
  category?: string;
  platform?: Platform;
  limit?: number;
}

export interface CatalogSearchParams {
  query?: string;
  queryOrigin: QueryOrigin;
  umbrella?: "tools" | "assets" | "avatars";
  category?: string;
  platform?: Platform;
  tags?: string[];
  limit?: number;
}

export interface SyncDeltasParams {
  cursor?: string;
  limit?: number;
}

export class VrcPackagesClient {
  private readonly baseUrl: string;
  private readonly appToken?: string;
  private readonly userToken?: string;
  private readonly operatorToken?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: VrcPackagesClientOptions) {
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
      auth?: "app" | "user" | "optional_user" | "operator" | "none";
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
        throw new VrcApiError(401, "Application token (vrcp_app_) required for this endpoint");
      }
      headers["Authorization"] = `Bearer ${this.appToken}`;
    } else if (options.auth === "user") {
      if (!this.userToken) {
        throw new VrcApiError(401, "User token (vrcp_usr_) required for this endpoint");
      }
      headers["Authorization"] = `Bearer ${this.userToken}`;
    } else if (options.auth === "operator") {
      if (!this.operatorToken) {
        throw new VrcApiError(401, "Operator token required for this endpoint");
      }
      headers["Authorization"] = `Bearer ${this.operatorToken}`;
    } else if (options.auth === "optional_user") {
      if (this.userToken) {
        headers["Authorization"] = `Bearer ${this.userToken}`;
      }
    }

    let requestBody: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(options.body);
    }

    const response = await this.fetchFn(url.toString(), {
      method,
      headers,
      body: requestBody
    });

    if (!response.ok) {
      let errorBody: any = null;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      const message = typeof errorBody === "object" && (errorBody?.message || errorBody?.error)
        ? (errorBody.message || errorBody.error)
        : `Request failed with status ${response.status}`;
      const code = typeof errorBody === "object" ? (errorBody?.code ?? errorBody?.error) : undefined;
      throw new VrcApiError(response.status, message, code, errorBody);
    }

    return (await response.json()) as T;
  }

  /* ------------------------------------------------------------------------ */
  /* Public & App Catalog Namespace (/v1/app/*)                               */
  /* ------------------------------------------------------------------------ */

  readonly index = {
    /**
     * Queries the public canonical package index projection (GET /v1/app/index).
     */
    query: async (params: CatalogQueryParams = {}): Promise<{ packages: CatalogPackage[]; count: number }> => {
      const limit = Math.min(params.limit ?? 50, 50);
      const res = await this.request<any>("/v1/app/index", "GET", {
        auth: "none",
        queryParams: {
          query: params.query,
          umbrella: params.umbrella,
          category: params.category,
          platform: params.platform,
          limit
        }
      });
      return {
        packages: res.packages ?? res.items ?? [],
        count: res.count ?? (res.packages ? res.packages.length : 0)
      };
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
        limit: Math.min(params.limit ?? 50, 50)
      };
      const res = await this.request<unknown>("/v1/app/index/search", "POST", {
        auth: "app",
        body: payload
      });
      return CatalogSearchResponseSchema.parse(res);
    },

    /**
     * Synchronizes incremental delta stream since given cursor (GET /v1/app/index/delta).
     */
    syncDeltas: async (params: SyncDeltasParams = {}): Promise<CatalogDeltaResponse> => {
      const res = await this.request<unknown>("/v1/app/index/delta", "GET", {
        auth: "none",
        queryParams: {
          cursor: params.cursor,
          limit: params.limit
        }
      });
      return CatalogDeltaResponseSchema.parse(res);
    },

    /**
     * Samples random package entries for discovery showcases (GET /v1/app/index/random).
     * Requires downstream application token.
     */
    random: async (params: {
      umbrella?: "tools" | "assets" | "avatars";
      category?: string;
      platform?: Platform;
      limit?: number;
    } = {}): Promise<CatalogRandomResponse> => {
      const limit = Math.min(params.limit ?? 10, 50);
      const res = await this.request<unknown>("/v1/app/index/random", "GET", {
        auth: "app",
        queryParams: {
          umbrella: params.umbrella,
          category: params.category,
          platform: params.platform,
          limit
        }
      });
      return CatalogRandomResponseSchema.parse(res);
    }
  };

  readonly app = {
    /**
     * Registers a downstream application (POST /v1/app/register).
     * Gated by user authentication (userToken) or operator token.
     */
    register: async (request: RegisterAppRequest): Promise<RegisterAppResponse> => {
      const auth = this.userToken ? "user" : (this.operatorToken ? "operator" : "none");
      const res = await this.request<unknown>("/v1/app/register", "POST", {
        auth,
        body: request
      });
      return RegisterAppResponseSchema.parse(res);
    }
  };

  readonly reports = {
    /**
     * Submits a demand signal or content issue report to the coordinator (POST /v1/app/reports).
     * Requires downstream application token.
     */
    submit: async (report: ReportSubmissionRequest): Promise<ReportSubmissionResponse> => {
      const res = await this.request<unknown>("/v1/app/reports", "POST", {
        auth: "app",
        body: report
      });
      return ReportSubmissionResponseSchema.parse(res);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* User Namespace (/v1/user/*)                                              */
  /* ------------------------------------------------------------------------ */

  readonly user = {
    /**
     * Submits a delisting request (POST /v1/user/delist).
     * If userToken was configured, authenticates as user.
     * If not, submits unauthenticated (requiring proofKind and proofValue).
     */
    delist: async (request: DelistRequest): Promise<DelistResponse> => {
      const res = await this.request<unknown>("/v1/user/delist", "POST", {
        auth: "optional_user",
        body: request
      });
      return DelistResponseSchema.parse(res);
    },

    /**
     * Registers a downstream application under the authenticated user (POST /v1/user/apps).
     */
    registerApp: async (request: RegisterAppRequest): Promise<RegisterAppResponse> => {
      const res = await this.request<unknown>("/v1/user/apps", "POST", {
        auth: "user",
        body: request
      });
      return RegisterAppResponseSchema.parse(res);
    },

    /**
     * Registers a crawler node under the authenticated user (POST /v1/user/nodes).
     */
    registerNode: async (request: RegisterNodeRequest): Promise<RegisterNodeResponse> => {
      const res = await this.request<unknown>("/v1/user/nodes", "POST", {
        auth: "user",
        body: request
      });
      return RegisterNodeResponseSchema.parse(res);
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
        const res = await this.request<unknown>("/v1/operator/leads", "GET", {
          auth: "operator",
          queryParams: {
            status: params.status,
            limit: params.limit,
            cursor: params.cursor
          }
        });
        return LeadListResponseSchema.parse(res);
      },

      /**
       * Approves a discovery lead into the crawl queue (POST /v1/operator/leads/{leadKey}/approve).
       */
      approve: async (
        leadKey: string,
        params: { minDelayMs?: number; reason?: string } = {}
      ): Promise<LeadActionResponse> => {
        const res = await this.request<unknown>(`/v1/operator/leads/${leadKey}/approve`, "POST", {
          auth: "operator",
          body: {
            schemaVersion: 1,
            minDelayMs: params.minDelayMs,
            reason: params.reason ?? "Operator approved"
          }
        });
        return LeadActionResponseSchema.parse(res);
      },

      /**
       * Rejects a discovery lead (POST /v1/operator/leads/{leadKey}/reject).
       */
      reject: async (
        leadKey: string,
        params: { reason?: string } = {}
      ): Promise<LeadActionResponse> => {
        const res = await this.request<unknown>(`/v1/operator/leads/${leadKey}/reject`, "POST", {
          auth: "operator",
          body: {
            schemaVersion: 1,
            reason: params.reason ?? "Operator rejected"
          }
        });
        return LeadActionResponseSchema.parse(res);
      }
    },

    sourceProfiles: {
      /**
       * Lists source-access profiles (GET /v1/operator/source-profiles).
       */
      list: async (params: { limit?: number; cursor?: string } = {}): Promise<SourceAccessProfileListResponse> => {
        const res = await this.request<unknown>("/v1/operator/source-profiles", "GET", {
          auth: "operator",
          queryParams: {
            limit: params.limit,
            cursor: params.cursor
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
          body: request
        });
        return SourceAccessProfileResponseSchema.parse(res);
      },

      /**
       * Disables a source-access profile (POST /v1/operator/source-profiles/{id}/disable).
       */
      disable: async (profileId: string, reason: string): Promise<SourceAccessProfileResponse> => {
        const res = await this.request<unknown>(`/v1/operator/source-profiles/${profileId}/disable`, "POST", {
          auth: "operator",
          body: { schemaVersion: 1, reason }
        });
        return SourceAccessProfileResponseSchema.parse(res);
      }
    },

    autoQueueRules: {
      /**
       * Lists auto-queue rules (GET /v1/operator/autoqueue-rules).
       */
      list: async (params: { limit?: number; cursor?: string } = {}): Promise<AutoQueueRuleListResponse> => {
        const res = await this.request<unknown>("/v1/operator/autoqueue-rules", "GET", {
          auth: "operator",
          queryParams: {
            limit: params.limit,
            cursor: params.cursor
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
          body: request
        });
        return AutoQueueRuleResponseSchema.parse(res);
      },

      /**
       * Disables an auto-queue rule (POST /v1/operator/autoqueue-rules/{id}/disable).
       */
      disable: async (ruleId: string, reason: string): Promise<AutoQueueRuleResponse> => {
        const res = await this.request<unknown>(`/v1/operator/autoqueue-rules/${ruleId}/disable`, "POST", {
          auth: "operator",
          body: { schemaVersion: 1, reason }
        });
        return AutoQueueRuleResponseSchema.parse(res);
      }
    },

    nodes: {
      /**
       * Issues an audited node credential with assigned capabilities (POST /v1/operator/nodes).
       */
      issue: async (request: IssueNodeCredential): Promise<NodeCredentialResponse> => {
        const res = await this.request<unknown>("/v1/operator/nodes", "POST", {
          auth: "operator",
          body: request
        });
        return NodeCredentialResponseSchema.parse(res);
      }
    },

    catalog: {
      /**
       * Lists canonical packages with operator oversight (GET /v1/operator/catalog).
       */
      list: async (params: { limit?: number; cursor?: string } = {}): Promise<CatalogListResponse> => {
        const res = await this.request<unknown>("/v1/operator/catalog", "GET", {
          auth: "operator",
          queryParams: {
            limit: params.limit,
            cursor: params.cursor
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
        const res = await this.request<unknown>("/v1/operator/takedowns", "GET", {
          auth: "operator",
          queryParams: {
            requesterType: params.requesterType,
            limit: params.limit,
            cursor: params.cursor
          }
        });
        return TakedownListResponseSchema.parse(res);
      },

      /**
       * Adjudicates an unauthenticated creator's ownership proof (POST /v1/operator/takedowns/{id}/verify).
       */
      verify: async (
        takedownId: string,
        request: { verdict: "accepted" | "rejected"; notes?: string }
      ): Promise<VerifyTakedownResponse> => {
        const res = await this.request<unknown>(`/v1/operator/takedowns/${takedownId}/verify`, "POST", {
          auth: "operator",
          body: {
            schemaVersion: 1,
            verdict: request.verdict,
            notes: request.notes
          }
        });
        return VerifyTakedownResponseSchema.parse(res);
      }
    }
  };
}
