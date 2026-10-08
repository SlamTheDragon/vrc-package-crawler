import { describe, it, expect } from "bun:test";
import {
  CatalogPackageSchema,
  CatalogCursorSchema,
  encodeCatalogCursor,
  decodeCatalogCursor
} from "../src/types/package.ts";
import {
  CatalogDeltaCursorSchema,
  encodeCatalogDeltaCursor,
  decodeCatalogDeltaCursor,
  CatalogDeltaResponseSchema,
  PublicCatalogListQuerySchema,
  PublicCatalogListResponseSchema
} from "../src/protocol/catalog.ts";
import {
  CatalogSearchRequestSchema,
  ReportSubmissionRequestSchema,
  CreatorDelegationAttestationSchema,
  CreatorClaimIntakeRequestSchema,
  CreatorClaimIntakeResponseSchema
} from "../src/protocol/downstream.ts";
import {
  LeadRowSchema,
  LeadCursorSchema,
  encodeLeadCursor,
  decodeLeadCursor,
  ApproveLeadSchema,
  RejectLeadSchema,
  SourceAccessProfileSchema,
  CreateSourceAccessProfileSchema,
  ProfileCursorSchema,
  encodeProfileCursor,
  decodeProfileCursor,
  AutoQueueRuleSchema,
  CreateAutoQueueRuleSchema,
  RuleCursorSchema,
  encodeRuleCursor,
  decodeRuleCursor,
  IssueNodeCredentialSchema,
  NodeCredentialResponseSchema,
  TakedownRecordSchema,
  TakedownCursorSchema,
  encodeTakedownCursor,
  decodeTakedownCursor,
  VerifyTakedownRequestSchema,
  VerifyTakedownResponseSchema,
  DelegatedClaimRecordSchema,
  encodeDelegatedClaimCursor,
  decodeDelegatedClaimCursor,
  VerifyDelegatedClaimRequestSchema,
  VerifyDelegatedClaimResponseSchema
} from "../src/protocol/operator.ts";

describe("src-package wire protocols", () => {
  it("validates CatalogPackage schema and defaults contentRating to general", () => {
    const validPkg = {
      canonicalId: "pkg-123",
      umbrella: "tools" as const,
      category: "companion_client",
      lifecycle: "active" as const,
      displayName: "My Tool",
      vpmId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      acceptedLinks: [],
      fronts: [
        {
          frontId: "front-1",
          canonicalId: "pkg-123",
          sourceKey: "booth:12345",
          platform: "booth" as const,
          storefrontUrl: "https://booth.pm/ja/items/12345",
          price: 1500,
          currency: "JPY",
          availability: "available" as const,
          observedAt: new Date().toISOString()
        }
      ]
    };
    const parsed = CatalogPackageSchema.parse(validPkg);
    expect(parsed.contentRating).toBe("general");
    expect(parsed).toEqual({ ...validPkg, contentRating: "general" });

    const ratedPkg = { ...validPkg, contentRating: "sexual_suggestive" as const };
    expect(CatalogPackageSchema.parse(ratedPkg).contentRating).toBe("sexual_suggestive");
  });


  it("encodes and decodes catalog delta cursors", () => {
    const cursor = {
      updatedAt: "2026-10-01T12:00:00.000Z",
      canonicalId: "canonical-456"
    };
    const encoded = encodeCatalogDeltaCursor(cursor);
    expect(typeof encoded).toBe("string");
    const decoded = decodeCatalogDeltaCursor(encoded);
    expect(decoded).toEqual(cursor);

    expect(decodeCatalogDeltaCursor("invalid-cursor-token-xxx")).toBeNull();
  });

  it("encodes and decodes standard catalog page cursors", () => {
    const cursor = {
      createdAt: "2026-10-01T12:00:00.000Z",
      canonicalId: "canonical-789"
    };
    const encoded = encodeCatalogCursor(cursor);
    const decoded = decodeCatalogCursor(encoded);
    expect(decoded).toEqual(cursor);
  });

  it("validates public catalog paging and rejects unusable continuation tokens", () => {
    const cursor = encodeCatalogCursor({ createdAt: "2026-10-01T12:00:00.000Z", canonicalId: "pkg-1" });
    expect(PublicCatalogListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(PublicCatalogListQuerySchema.parse({ limit: 100, cursor })).toEqual({ limit: 100, cursor });
    const page = { schemaVersion: 1 as const, packages: [], nextCursor: cursor };
    expect(PublicCatalogListResponseSchema.parse(page)).toEqual(page);
    expect(PublicCatalogListResponseSchema.parse({ ...page, nextCursor: null }).nextCursor).toBeNull();
    for (const invalid of ["", "bad/cursor", btoa("{}"), cursor + "=",
      btoa(JSON.stringify({ createdAt: "not-a-date", canonicalId: "pkg-1" }))]) {
      expect(PublicCatalogListQuerySchema.safeParse({ cursor: invalid }).success).toBe(false);
      expect(PublicCatalogListResponseSchema.safeParse({ ...page, nextCursor: invalid }).success).toBe(false);
    }
  });

  it("validates CatalogSearchRequest and enforces queryOrigin with optional rating", () => {
    const req = {
      schemaVersion: 1,
      query: "avatar clothes",
      queryOrigin: "user_authored" as const,
      rating: "mature" as const,
      limit: 20
    };
    const parsed = CatalogSearchRequestSchema.parse(req);
    expect(parsed.queryOrigin).toBe("user_authored");
    expect(parsed.rating).toBe("mature");
  });


  it("validates ReportSubmissionRequest for both demand signals and issue reports", () => {
    const removal = { schemaVersion: 1, reportType: "removal_request", canonicalId: "pkg-123", reason: "Incorrect attribution" };
    expect(ReportSubmissionRequestSchema.safeParse(removal).success).toBe(true);
    for (const invalid of [{ ...removal, reason: "" }, { ...removal, canonicalId: undefined },
      { ...removal, signalKind: "refresh_demand" }, { ...removal, query: "search" }]) {
      expect(ReportSubmissionRequestSchema.safeParse(invalid).success).toBe(false);
    }
    const demand = {
      schemaVersion: 1,
      reportType: "demand_signal" as const,
      signalKind: "search_miss" as const,
      query: "missing package",
      zeroHits: true
    };
    expect(() => ReportSubmissionRequestSchema.parse(demand)).not.toThrow();

    const issue = {
      schemaVersion: 1,
      reportType: "issue_report" as const,
      reportKind: "broken_link" as const,
      targetUrl: "https://example.com/broken",
      canonicalId: "pkg-123"
    };
    expect(() => ReportSubmissionRequestSchema.parse(issue)).not.toThrow();

    // Explicit content report sub-categories (R56-C56C)
    const falsePositive = {
      schemaVersion: 1,
      reportType: "issue_report" as const,
      reportKind: "explicit_false_positive" as const,
      canonicalId: "pkg-safe-model",
      reason: "Safe avatar asset flagged incorrectly as explicit"
    };
    expect(() => ReportSubmissionRequestSchema.parse(falsePositive)).not.toThrow();

    const falseNegative = {
      schemaVersion: 1,
      reportType: "issue_report" as const,
      reportKind: "explicit_false_negative" as const,
      targetUrl: "https://booth.pm/ja/items/999999",
      reason: "Unrated asset contains unflagged explicit adult content"
    };
    expect(() => ReportSubmissionRequestSchema.parse(falseNegative)).not.toThrow();

    // Unknown report kinds are rejected
    expect(ReportSubmissionRequestSchema.safeParse({
      ...issue,
      reportKind: "unauthorized_kind" as any
    }).success).toBe(false);
  });

  it("encodes, decodes, and validates operator cursors", () => {
    const leadCursor = {
      status: "pending_review" as const,
      firstSeenAt: "2026-10-01T12:00:00.000Z",
      leadKey: "a".repeat(64)
    };
    const encLead = encodeLeadCursor(leadCursor);
    expect(decodeLeadCursor(encLead)).toEqual(leadCursor);
    expect(decodeLeadCursor("invalid-lead-cursor")).toBeNull();

    // Coordinator-style cursor with status and firstSeenAt
    const coordLeadCursor = {
      status: "pending_review" as const,
      firstSeenAt: "2026-10-01T10:00:00.000Z",
      leadKey: "b".repeat(64)
    };
    const encCoordLead = encodeLeadCursor(coordLeadCursor);
    expect(decodeLeadCursor(encCoordLead, "pending_review")).toEqual(coordLeadCursor);
    expect(decodeLeadCursor(encCoordLead, "rejected")).toBeNull();

    const profileCursor = {
      createdAt: "2026-10-01T12:00:00.000Z",
      profileId: "123e4567-e89b-12d3-a456-426614174000"
    };
    const encProfile = encodeProfileCursor(profileCursor);
    expect(decodeProfileCursor(encProfile)).toEqual(profileCursor);
    expect(decodeProfileCursor("invalid-profile-cursor")).toBeNull();

    const ruleCursor = {
      createdAt: "2026-10-01T12:00:00.000Z",
      ruleId: "123e4567-e89b-12d3-a456-426614174000"
    };
    const encRule = encodeRuleCursor(ruleCursor);
    expect(decodeRuleCursor(encRule)).toEqual(ruleCursor);
    expect(decodeRuleCursor("invalid-rule-cursor")).toBeNull();

    const takedownCursor = {
      recordedAt: "2026-10-01T12:00:00.000Z",
      takedownId: "123e4567-e89b-12d3-a456-426614174000"
    };
    const encTakedown = encodeTakedownCursor(takedownCursor);
    expect(decodeTakedownCursor(encTakedown)).toEqual(takedownCursor);
    expect(decodeTakedownCursor("invalid-takedown-cursor")).toBeNull();
  });
  it("rejects lead cursors that cannot be used by the coordinator", () => {
    const key = "a".repeat(64);
    for (const invalid of [
      { leadKey: key },
      { leadKey: key, lastSeenAt: "2026-10-01T12:00:00.000Z" },
      { leadKey: key, firstSeenAt: "2026-10-01T12:00:00.000Z" },
      { leadKey: key, status: "pending_review", firstSeenAt: "not-a-date" },
      { leadKey: key, status: "pending_review", firstSeenAt: "2026-10-01T12:00:00.000Z", extra: true }
    ]) {
      expect(LeadCursorSchema.safeParse(invalid).success).toBe(false);
      const encoded = btoa(JSON.stringify(invalid)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      expect(decodeLeadCursor(encoded, "pending_review")).toBeNull();
    }
  });

  it("enforces source-profile path, query and evidence constraints", () => {
    const input = { schemaVersion: 1, platform: "booth", origin: "https://booth.pm",
      pathScope: "/ja/items/", method: "GET", purpose: "metadata", minDelayMs: 2000,
      expiresAt: "2027-01-01T00:00:00.000Z", reviewReference: "REV-2026-BOOTH",
      reason: "Reviewed metadata", retainClasses: ["normalized_facts"], publishClasses: [] };
    expect(CreateSourceAccessProfileSchema.safeParse(input).success).toBe(true);
    for (const pathScope of ["/ja/items/*", "ja/items/", "/ja//items/", "/ja/../items/",
      "/ja/%2Fitems", "/ja/%2E", "/ja/%e3%81%82", "/ja/%FF", "/ja/%E3%81%82/"]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, pathScope }).success).toBe(false);
    }
    expect(CreateSourceAccessProfileSchema.safeParse({ ...input, pathScope: "/ja/%E3%81%82" }).success).toBe(true);
    expect(CreateSourceAccessProfileSchema.safeParse({ ...input, pathScope: "/ja/items", exactQuery: "page=1&sort=new" }).success).toBe(true);
    for (const change of [
      { exactQuery: "page=1" }, { pathScope: "/ja/items", exactQuery: "page=1&next=%2F" },
      { retainClasses: [] }, { retainClasses: ["normalized_facts", "normalized_facts"] },
      { publishClasses: ["normalized_facts", "normalized_facts"] }, { publishClasses: ["creator_prose"] }
    ]) expect(CreateSourceAccessProfileSchema.safeParse({ ...input, ...change }).success).toBe(false);
    for (const origin of ["http://booth.pm", "https://booth.pm/", "https://booth.pm:8443", "https://user@booth.pm"]) {
      expect(CreateSourceAccessProfileSchema.safeParse({ ...input, origin }).success).toBe(false);
    }
  });

  it("rejects auto-queue grants outside the implemented wire contract", () => {
    const rule = { schemaVersion: 1, leadKind: "vpm_listing", origin: "https://packages.example.org",
      pathScope: "/index.json", minDelayMs: 1000, expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "Review fixture", reason: "Reviewed listing" };
    expect(CreateAutoQueueRuleSchema.safeParse(rule).success).toBe(true);
    for (const change of [
      { leadKind: "storefront_product" }, { leadKind: "github_repository" },
      { origin: "http://packages.example.org" }, { origin: "https://packages.example.org/path" },
      { origin: "https://user@packages.example.org" }, { pathScope: "/vpm/*" },
      { pathScope: "index.json" }, { pathScope: "/vpm//" }, { pathScope: "/vpm/../" },
      { pathScope: "/%E3%81%82" }, { pathScope: "/" + "x".repeat(200) }
    ]) expect(CreateAutoQueueRuleSchema.safeParse({ ...rule, ...change }).success).toBe(false);
    const stored = { ...rule, ruleId: "123e4567-e89b-12d3-a456-426614174000",
      createdAt: "2026-10-01T00:00:00.000Z", disabledAt: null };
    const { schemaVersion, ...response } = stored;
    expect(AutoQueueRuleSchema.safeParse(response).success).toBe(true);
    expect(AutoQueueRuleSchema.safeParse({ ...response, pathScope: "/vpm/*" }).success).toBe(false);
    expect(AutoQueueRuleSchema.safeParse({ ...response, leadKind: "publisher_site" }).success).toBe(false);
  });

  it("rejects credential responses that violate coordinator identity bounds", () => {
    const response = { schemaVersion: 1, nodeId: "fixture-node", capabilities: ["vpm"],
      token: "vrcp_" + "0".repeat(64) + "0004" };
    expect(NodeCredentialResponseSchema.safeParse(response).success).toBe(true);
    for (const schema of [NodeCredentialResponseSchema]) {
      for (const nodeId of ["", "node with spaces", "x".repeat(101), "../node"]) {
        expect(schema.safeParse({ ...response, nodeId }).success).toBe(false);
      }
      for (const capabilities of [[], Array(11).fill("vpm"), ["unknown"]]) {
        expect(schema.safeParse({ ...response, capabilities }).success).toBe(false);
      }
      expect(schema.safeParse({ ...response, extra: true }).success).toBe(false);
      expect(schema.safeParse({ ...response, token: "vrcp_invalid" }).success).toBe(false);
    }
  });

  it("validates operator request schemas: leads, profiles, rules, nodes, takedowns", () => {
    const wireLead = { lead_key: "a".repeat(64), kind: "vpm_listing", target_url: "https://publisher.example/index.json",
      claimed_package_id: null, discovered_from_url: "https://directory.example/catalog", discovered_from_item_key: null,
      status: "pending_review" as const, first_seen_at: "2026-10-04T00:00:00.000Z", last_seen_at: "2026-10-04T00:00:00.000Z" };
    expect(LeadRowSchema.parse(wireLead)).toEqual(wireLead);
    for (const input of [{ ...wireLead, leadKey: wireLead.lead_key }, { ...wireLead, extra: true },
      { ...wireLead, discovered_from_url: undefined }, { ...wireLead, discovered_from_url: null }]) {
      expect(LeadRowSchema.safeParse(input).success).toBe(false);
    }
    for (const schema of [ApproveLeadSchema, RejectLeadSchema]) {
      expect(schema.safeParse({ schemaVersion: 1 }).success).toBe(false);
    }
    // Approve / Reject Lead
    expect(() => ApproveLeadSchema.parse({
      schemaVersion: 1,
      minDelayMs: 2000,
      reason: "Valid lead approved"
    })).not.toThrow();

    expect(() => RejectLeadSchema.parse({
      schemaVersion: 1,
      reason: "Irrelevant content"
    })).not.toThrow();

    // Source Access Profile
    expect(() => CreateSourceAccessProfileSchema.parse({
      schemaVersion: 1,
      platform: "booth",
      origin: "https://booth.pm",
      pathScope: "/ja/items/",
      method: "GET",
      purpose: "metadata",
      minDelayMs: 2000,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-2026-BOOTH",
      reason: "Storefront access approved",
      retainClasses: ["normalized_facts"],
      publishClasses: ["normalized_facts"]
    })).not.toThrow();

    // AutoQueue Rule
    expect(() => CreateAutoQueueRuleSchema.parse({
      schemaVersion: 1,
      leadKind: "vpm_listing",
      origin: "https://vpm.example.com",
      pathScope: "/index.json",
      minDelayMs: 2000,
      expiresAt: "2027-01-01T00:00:00.000Z",
      reviewReference: "REV-2026-VPM",
      reason: "Auto-queue trusted listing"
    })).not.toThrow();

    // Issue Node Credential
    expect(() => IssueNodeCredentialSchema.parse({
      schemaVersion: 1,
      nodeId: "primary-node",
      capabilities: ["vpm", "github"],
      reason: "Primary production worker"
    })).not.toThrow();

    // Verify Takedown
    expect(() => VerifyTakedownRequestSchema.parse({
      schemaVersion: 1,
      verdict: "accepted",
      notes: "Proof verified in bio token"
    })).not.toThrow();

    expect(() => VerifyTakedownResponseSchema.parse({
      schemaVersion: 1,
      takedownId: "123e4567-e89b-12d3-a456-426614174000",
      status: "accepted",
      updatedAt: "2026-10-01T12:00:00.000Z"
    })).not.toThrow();

    // Delegated Creator Claim Attestation (R54-C38C)
    const validAttestation = {
      appId: "123e4567-e89b-12d3-a456-426614174000",
      action: "creator_ownership_claim" as const,
      frontUrl: "https://creator.booth.pm",
      creatorId: "booth_creator_123",
      challengeToken: "vrcp_chal_0123456789abcdef",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      nonce: "nonce_abcdef0123456789"
    };
    expect(() => CreatorDelegationAttestationSchema.parse(validAttestation)).not.toThrow();

    const claimRequest = {
      schemaVersion: 1,
      attestation: validAttestation,
      signature: "sig_abc123456789",
      reason: "Creator requested storefront claim",
      contactEmail: "creator@example.com"
    };
    expect(() => CreatorClaimIntakeRequestSchema.parse(claimRequest)).not.toThrow();

    const claimResponse = {
      schemaVersion: 1,
      status: "accepted" as const,
      claimId: "123e4567-e89b-12d3-a456-426614174001",
      reviewStatus: "pending" as const,
      recordedAt: new Date().toISOString()
    };
    expect(() => CreatorClaimIntakeResponseSchema.parse(claimResponse)).not.toThrow();

    // Delegated Claim Record & Cursor
    const claimRecord = {
      claimId: "123e4567-e89b-12d3-a456-426614174001",
      appId: "123e4567-e89b-12d3-a456-426614174000",
      action: "creator_ownership_claim" as const,
      frontUrl: "https://creator.booth.pm",
      creatorId: "booth_creator_123",
      challengeToken: "vrcp_chal_0123456789abcdef",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      nonce: "nonce_abcdef0123456789",
      signature: "sig_abc123456789",
      reason: "Creator requested storefront claim",
      contactEmail: "creator@example.com",
      reviewStatus: "pending" as const,
      reviewNotes: null,
      recordedAt: "2026-10-01T12:00:00.000Z"
    };
    expect(() => DelegatedClaimRecordSchema.parse(claimRecord)).not.toThrow();

    const claimCursor = {
      recordedAt: "2026-10-01T12:00:00.000Z",
      claimId: "123e4567-e89b-12d3-a456-426614174001"
    };
    const encClaimCursor = encodeDelegatedClaimCursor(claimCursor);
    expect(decodeDelegatedClaimCursor(encClaimCursor)).toEqual(claimCursor);
    expect(decodeDelegatedClaimCursor("invalid-cursor")).toBeNull();

    // Verify Delegated Claim
    expect(() => VerifyDelegatedClaimRequestSchema.parse({
      schemaVersion: 1,
      verdict: "accepted",
      notes: "Attestation signature and storefront check verified"
    })).not.toThrow();

    expect(() => VerifyDelegatedClaimResponseSchema.parse({
      schemaVersion: 1,
      claimId: "123e4567-e89b-12d3-a456-426614174001",
      status: "accepted",
      updatedAt: "2026-10-01T12:00:00.000Z"
    })).not.toThrow();
  });
});
