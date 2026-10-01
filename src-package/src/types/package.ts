import { z } from "zod";
import { PlatformSchema, type Platform } from "./platform.ts";

/** One accepted identity link embedded in a catalog package response row. */
export const CatalogIdentityLinkSchema = z.strictObject({
  linkId: z.string().uuid(),
  sourceKey: z.string().min(1).max(500),
  evidenceKind: z.enum([
    "vpm_id",
    "repository_match",
    "cross_storefront_link",
    "curator_verified",
    "simhash_match"
  ]),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime()
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

export const TimestampConfidenceSchema = z.enum(["confirmed", "inferred", "observed"]);
export type TimestampConfidence = z.infer<typeof TimestampConfidenceSchema>;

/** One canonical package item. */
export const CatalogPackageSchema = z.strictObject({
  canonicalId: z.string().min(1).max(500),
  umbrella: z.enum(["tools", "assets", "avatars"]),
  category: z.string().min(1).max(200),
  lifecycle: z.enum(["active", "deprecated", "quarantined", "delisted"]),
  displayName: z.string().min(1).max(500),
  vpmId: z.string().min(1).max(200).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable().optional(),
  timestampConfidence: TimestampConfidenceSchema.nullable().optional(),
  acceptedLinks: z.array(CatalogIdentityLinkSchema),
  fronts: z.array(PackageFrontSchema).default([])
});
export type CatalogPackage = z.infer<typeof CatalogPackageSchema>;

export const CatalogCursorSchema = z.strictObject({
  createdAt: z.string().datetime(),
  canonicalId: z.string().min(1).max(500)
});
export type CatalogCursor = z.infer<typeof CatalogCursorSchema>;

export function encodeCatalogCursor(cursor: CatalogCursor): string {
  return btoa(JSON.stringify(CatalogCursorSchema.parse(cursor)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodeCatalogCursor(value: string): CatalogCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const cursor = CatalogCursorSchema.parse(
      JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/")))
    );
    return encodeCatalogCursor(cursor) === value ? cursor : null;
  } catch {
    return null;
  }
}
