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
  CatalogDeltaResponseSchema
} from "../src/protocol/catalog.ts";
import {
  DelistRequestSchema,
  CatalogSearchRequestSchema,
  ReportSubmissionRequestSchema
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
  VerifyTakedownResponseSchema
} from "../src/protocol/operator.ts";

describe("src-package wire protocols", () => {
  it("validates CatalogPackage schema", () => {
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
    expect(CatalogPackageSchema.parse(validPkg)).toEqual(validPkg);
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

  it("validates DelistRequest requires targetUrl or canonicalId", () => {
    const validUrl = {
      schemaVersion: 1,
      targetUrl: "https://booth.pm/ja/items/123",
      reason: "Takedown request"
    };
    expect(() => DelistRequestSchema.parse(validUrl)).not.toThrow();

    const validId = {
      schemaVersion: 1,
      canonicalId: "item-456",
      reason: "DMCA"
    };
    expect(() => DelistRequestSchema.parse(validId)).not.toThrow();

    const invalid = {
      schemaVersion: 1,
      reason: "Neither provided"
    };
    expect(() => DelistRequestSchema.parse(invalid)).toThrow();
  });

  it("validates CatalogSearchRequest and enforces queryOrigin", () => {
    const req = {
      schemaVersion: 1,
      query: "avatar clothes",
      queryOrigin: "user_authored" as const,
      limit: 20
    };
    const parsed = CatalogSearchRequestSchema.parse(req);
    expect(parsed.queryOrigin).toBe("user_authored");
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
  });
});
