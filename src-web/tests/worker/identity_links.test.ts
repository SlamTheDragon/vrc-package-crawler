import { describe, expect, it } from "bun:test";
import { LocalCoordinatorStore } from "../support/local_sqlite.ts";

describe("Gate 2 Identity Links and Canonical Packages", () => {
  it("upserts and retrieves canonical packages correctly", () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      const created = store.upsertCanonicalPackage({
        canonicalId: "vrc-avatar-tool",
        umbrella: "tools",
        category: "Avatar Utility",
        lifecycle: "active",
        displayName: "VRC Avatar Tool",
        vpmId: "com.example.avatartool"
      });

      expect(created.canonicalId).toBe("vrc-avatar-tool");
      expect(created.umbrella).toBe("tools");
      expect(created.category).toBe("Avatar Utility");
      expect(created.lifecycle).toBe("active");
      expect(created.displayName).toBe("VRC Avatar Tool");
      expect(created.vpmId).toBe("com.example.avatartool");
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();

      const fetched = store.getCanonicalPackage("vrc-avatar-tool");
      expect(fetched).not.toBeNull();
      expect(fetched?.displayName).toBe("VRC Avatar Tool");

      // Update canonical package
      const updated = store.upsertCanonicalPackage({
        canonicalId: "vrc-avatar-tool",
        umbrella: "tools",
        category: "Avatar Utility",
        lifecycle: "deprecated",
        displayName: "VRC Avatar Tool (Deprecated)",
        vpmId: "com.example.avatartool"
      });

      expect(updated.lifecycle).toBe("deprecated");
      expect(updated.displayName).toBe("VRC Avatar Tool (Deprecated)");

      const nonExistent = store.getCanonicalPackage("does-not-exist");
      expect(nonExistent).toBeNull();
    } finally {
      store.close();
    }
  });

  it("enforces foreign keys on identity links", () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      store.upsertCanonicalPackage({
        canonicalId: "canon-1",
        umbrella: "tools",
        category: "Inspector",
        lifecycle: "active",
        displayName: "Package Inspector"
      });

      // Attempting to link without a corresponding source_item must fail foreign key check
      expect(() => {
        store.createIdentityLink({
          sourceKey: "missing-source-item",
          canonicalId: "canon-1",
          evidenceKind: "vpm_id",
          confidence: 1.0
        });
      }).toThrow();

      // Now create source item
      store.upsertSourceItem({
        sourceKey: "vpm:com.example.inspector",
        platform: "vpm",
        sourceUrl: "https://vpm.example.com/index.json",
        latestDigest: "sha256:abc123"
      });

      // Attempting to link to a missing canonical package must fail foreign key check
      expect(() => {
        store.createIdentityLink({
          sourceKey: "vpm:com.example.inspector",
          canonicalId: "missing-canonical",
          evidenceKind: "vpm_id",
          confidence: 1.0
        });
      }).toThrow();

      // Successful link when both exist
      const link = store.createIdentityLink({
        sourceKey: "vpm:com.example.inspector",
        canonicalId: "canon-1",
        evidenceKind: "vpm_id",
        confidence: 1.0
      });

      expect(link.linkId).toBeDefined();
      expect(link.sourceKey).toBe("vpm:com.example.inspector");
      expect(link.canonicalId).toBe("canon-1");
      expect(link.reviewState).toBe("provisional");
      expect(link.confidence).toBe(1.0);
    } finally {
      store.close();
    }
  });

  it("validates confidence bounds [0.0, 1.0]", () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      store.upsertCanonicalPackage({
        canonicalId: "canon-1",
        umbrella: "assets",
        category: "Prop",
        lifecycle: "active",
        displayName: "Cool Prop"
      });
      store.upsertSourceItem({
        sourceKey: "booth:12345",
        platform: "booth",
        sourceUrl: "https://booth.pm/en/items/12345",
        latestDigest: "sha256:def456"
      });

      expect(() => {
        store.createIdentityLink({
          sourceKey: "booth:12345",
          canonicalId: "canon-1",
          evidenceKind: "cross_storefront_link",
          confidence: 1.5
        });
      }).toThrow();

      expect(() => {
        store.createIdentityLink({
          sourceKey: "booth:12345",
          canonicalId: "canon-1",
          evidenceKind: "cross_storefront_link",
          confidence: -0.1
        });
      }).toThrow();
    } finally {
      store.close();
    }
  });

  it("supports review lifecycle transitions and multi-link queries", () => {
    const store = new LocalCoordinatorStore(":memory:");
    try {
      store.upsertCanonicalPackage({
        canonicalId: "canon-pkg",
        umbrella: "avatars",
        category: "Base Avatar",
        lifecycle: "active",
        displayName: "Original Avatar"
      });

      store.upsertSourceItem({
        sourceKey: "booth:100",
        platform: "booth",
        sourceUrl: "https://booth.pm/en/items/100",
        latestDigest: "sha256:100"
      });
      store.upsertSourceItem({
        sourceKey: "gumroad:200",
        platform: "gumroad",
        sourceUrl: "https://gumroad.com/l/200",
        latestDigest: "sha256:200"
      });

      const link1 = store.createIdentityLink({
        sourceKey: "booth:100",
        canonicalId: "canon-pkg",
        evidenceKind: "curator_verified",
        confidence: 0.95,
        reviewState: "provisional"
      });

      const link2 = store.createIdentityLink({
        sourceKey: "gumroad:200",
        canonicalId: "canon-pkg",
        evidenceKind: "cross_storefront_link",
        confidence: 0.85,
        reviewState: "provisional"
      });

      // Query by canonical ID
      const canonicalLinks = store.getIdentityLinksForCanonical("canon-pkg");
      expect(canonicalLinks).toHaveLength(2);
      expect(canonicalLinks.map(l => l.sourceKey)).toEqual(["booth:100", "gumroad:200"]);

      // Query by source key
      const sourceLinks1 = store.getIdentityLinksForSourceItem("booth:100");
      expect(sourceLinks1).toHaveLength(1);
      expect(sourceLinks1[0].canonicalId).toBe("canon-pkg");

      // Review transitions
      const updated = store.updateIdentityLinkReview(link1.linkId, "accepted");
      expect(updated).toBe(true);

      const rejected = store.updateIdentityLinkReview(link2.linkId, "rejected");
      expect(rejected).toBe(true);

      const refreshedLinks = store.getIdentityLinksForCanonical("canon-pkg");
      const updatedLink1 = refreshedLinks.find(l => l.linkId === link1.linkId);
      const updatedLink2 = refreshedLinks.find(l => l.linkId === link2.linkId);

      expect(updatedLink1?.reviewState).toBe("accepted");
      expect(updatedLink1?.reviewedAt).toBeDefined();
      expect(updatedLink2?.reviewState).toBe("rejected");
      expect(updatedLink2?.reviewedAt).toBeDefined();

      // Deletion
      const deleted = store.deleteIdentityLink(link2.linkId);
      expect(deleted).toBe(true);

      const remainingLinks = store.getIdentityLinksForCanonical("canon-pkg");
      expect(remainingLinks).toHaveLength(1);
      expect(remainingLinks[0].linkId).toBe(link1.linkId);
    } finally {
      store.close();
    }
  });
});
