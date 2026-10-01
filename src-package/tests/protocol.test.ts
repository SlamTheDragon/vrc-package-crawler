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
  RegisterNodeRequestSchema,
  RegisterNodeResponseSchema
} from "../src/protocol/user.ts";
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

  it("validates user RegisterNodeRequest and RegisterNodeResponse", () => {
    const validReq = {
      schemaVersion: 1 as const,
      nodeId: "my-worker-node_01",
      reason: "Home server node",
      requestedCapabilities: ["vpm" as const]
    };
    expect(RegisterNodeRequestSchema.parse(validReq)).toEqual(validReq);

    const invalidReq = {
      schemaVersion: 1,
      nodeId: "invalid node with spaces!"
    };
    expect(() => RegisterNodeRequestSchema.parse(invalidReq)).toThrow();

    const validRes = {
      schemaVersion: 1 as const,
      nodeId: "my-worker-node_01",
      capabilities: ["vpm" as const],
      token: "vrcp_" + "0".repeat(64) + "1234"
    };
    expect(RegisterNodeResponseSchema.parse(validRes)).toEqual(validRes);
  });

  it("encodes, decodes, and validates operator cursors", () => {
    const leadCursor = {
      lastSeenAt: "2026-10-01T12:00:00.000Z",
      leadKey: "a".repeat(64)
    };
    const encLead = encodeLeadCursor(leadCursor);
    expect(decodeLeadCursor(encLead)).toEqual(leadCursor);
    expect(decodeLeadCursor("invalid-lead-cursor")).toBeNull();

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
      pathScope: "/ja/items/*",
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
