import { z } from "zod";
import { PlatformSchema, JobPurposeSchema, type Platform, type JobPurpose } from "../protocol/node_protocol.ts";
import { isPrivateOrReservedIp } from "./ip_policy.ts";
import { EvidenceClassSchema } from "./evidence_class.ts";
export { EvidenceClassSchema } from "./evidence_class.ts";
export type { EvidenceClass } from "./evidence_class.ts";

export const SOURCE_ACCESS_SCHEMA_VERSION = 1 as const;
export const SourcePurposeSchema = JobPurposeSchema;
export type SourcePurpose = JobPurpose;

const OriginSchema = z.url().refine(value => {
  const url = new URL(value);
  const addressLiteral = /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.startsWith("[");
  return url.protocol === "https:" && url.origin === value && !url.username && !url.password &&
    !url.hostname.endsWith(".") && url.hostname !== "localhost" && !url.port &&
    (!addressLiteral || !isPrivateOrReservedIp(url.hostname));
}, "Canonical public HTTPS origin required");
function canonicalPath(value: string): boolean {
  if (!/^\/(?:[A-Za-z0-9._~/-]|%[0-9A-F]{2})*$/.test(value) || value.includes("//") ||
      value.split("/").some(segment => segment === "." || segment === "..")) return false;
  try {
    // An encoded ASCII slash/dot can change path boundaries after a later decode.
    // Only canonical UTF-8 non-ASCII escapes are admitted, and only for exact paths.
    return value.split("/").every(segment => {
      if (!segment.includes("%")) return true;
      const escapes = segment.match(/%[0-9A-F]{2}/g) ?? [];
      return escapes.every(escape => Number.parseInt(escape.slice(1), 16) >= 0x80) &&
        encodeURIComponent(decodeURIComponent(segment)) === segment;
    });
  } catch { return false; }
}
const PathScopeSchema = z.string().min(1).max(300).refine(canonicalPath,
  "Canonical exact or directory path required");
const ExactQuerySchema = z.string().min(3).max(200)
  .regex(/^[A-Za-z0-9._~-]+=[A-Za-z0-9._~-]+(?:&[A-Za-z0-9._~-]+=[A-Za-z0-9._~-]+)*$/);

export const CreateSourceAccessProfileSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_ACCESS_SCHEMA_VERSION),
  platform: PlatformSchema, origin: OriginSchema, pathScope: PathScopeSchema,
  exactQuery: ExactQuerySchema.optional(),
  method: z.literal("GET"), purpose: SourcePurposeSchema,
  minDelayMs: z.number().int().min(1000).max(86_400_000),
  expiresAt: z.iso.datetime(), reviewReference: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(3).max(300),
  retainClasses: z.array(EvidenceClassSchema).max(4),
  publishClasses: z.array(EvidenceClassSchema).max(4)
}).superRefine((profile, ctx) => {
  if (profile.exactQuery && profile.pathScope.endsWith("/")) {
    ctx.addIssue({ code: "custom", message: "A query grant requires an exact path" });
  }
  if (profile.pathScope.includes("%") && profile.pathScope.endsWith("/")) {
    ctx.addIssue({ code: "custom", message: "Encoded paths cannot grant directories" });
  }
  if (new Set(profile.retainClasses).size !== profile.retainClasses.length ||
      new Set(profile.publishClasses).size !== profile.publishClasses.length) {
    ctx.addIssue({ code: "custom", message: "Evidence classes must be unique" });
  }
  if (profile.publishClasses.some(value => !profile.retainClasses.includes(value))) {
    ctx.addIssue({ code: "custom", message: "Publish classes must be retained classes" });
  }
  if (!profile.retainClasses.includes("normalized_facts")) {
    ctx.addIssue({ code: "custom", message: "A fetch profile must retain normalized facts" });
  }
});
export type CreateSourceAccessProfile = z.infer<typeof CreateSourceAccessProfileSchema>;

export const SourceAccessProfileSchema = CreateSourceAccessProfileSchema.safeExtend({
  profileId: z.uuid(), createdAt: z.iso.datetime(), disabledAt: z.iso.datetime().nullable()
});
export type SourceAccessProfile = z.infer<typeof SourceAccessProfileSchema>;
export const DisableSourceAccessProfileSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_ACCESS_SCHEMA_VERSION), reason: z.string().trim().min(3).max(300)
});
export const ProfileCursorSchema = z.strictObject({ createdAt: z.iso.datetime(), profileId: z.uuid() });
export type ProfileCursor = z.infer<typeof ProfileCursorSchema>;
export function encodeProfileCursor(cursor: ProfileCursor): string {
  return btoa(JSON.stringify(ProfileCursorSchema.parse(cursor)))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export function decodeProfileCursor(value: string): ProfileCursor | null {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) return null;
  try {
    const cursor = ProfileCursorSchema.parse(JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/"))));
    return encodeProfileCursor(cursor) === value ? cursor : null;
  } catch { return null; }
}
export const SourceAccessProfileResponseSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_ACCESS_SCHEMA_VERSION), profile: SourceAccessProfileSchema
});
export const SourceAccessProfileListResponseSchema = z.strictObject({
  schemaVersion: z.literal(SOURCE_ACCESS_SCHEMA_VERSION), profiles: z.array(SourceAccessProfileSchema),
  nextCursor: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).nullable()
});

/** Exact canonical path or slash-terminated directory scope; a query needs an explicit exact grant. */
export function sourceAccessProfileMatches(profile: SourceAccessProfile, platform: Platform, target: string,
  purpose: SourcePurpose, nowMs: number): boolean {
  if (profile.platform !== platform || profile.purpose !== purpose || profile.method !== "GET" ||
      profile.disabledAt !== null || Date.parse(profile.expiresAt) <= nowMs) return false;
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.origin !== profile.origin || url.href !== target ||
        url.hash || url.username || url.password || url.port || !canonicalPath(url.pathname) ||
        url.search !== (profile.exactQuery ? `?${profile.exactQuery}` : "")) return false;
    if (url.pathname.includes("%") && url.pathname !== profile.pathScope) return false;
    if (profile.exactQuery) return url.pathname === profile.pathScope;
    return profile.pathScope.endsWith("/") ? url.pathname.startsWith(profile.pathScope) :
      url.pathname === profile.pathScope;
  } catch { return false; }
}

/** Conservative overlap test used to avoid implicit fallback from a disabled narrow grant. */
export function sourcePathScopesOverlap(a: string, b: string,
  aQuery?: string, bQuery?: string): boolean {
  if (aQuery !== bQuery) return false;
  if (a === b) return true;
  // Encoded paths never inherit a directory grant; two different encoded
  // exact paths therefore cannot overlap either.
  if (a.includes("%") || b.includes("%")) return false;
  if (a.endsWith("/") && b.startsWith(a)) return true;
  if (b.endsWith("/") && a.startsWith(b)) return true;
  return false;
}

export const SOURCE_ACCESS_API_JSON_SCHEMAS = {
  createSourceAccessProfile: z.toJSONSchema(CreateSourceAccessProfileSchema),
  disableSourceAccessProfile: z.toJSONSchema(DisableSourceAccessProfileSchema),
  sourceAccessProfile: z.toJSONSchema(SourceAccessProfileSchema),
  sourceAccessProfileResponse: z.toJSONSchema(SourceAccessProfileResponseSchema),
  sourceAccessProfileListResponse: z.toJSONSchema(SourceAccessProfileListResponseSchema)
};
