import { z } from "zod";

/**
 * Avatar compatibility schema linking cosmetics to target avatar base meshes (IDENTITY-02).
 */
export const AvatarCompatibilitySchema = z.object({
  compatibilityId: z.string(),
  itemKey: z.string(),
  targetAvatarBase: z.string(), // e.g. "kikyo", "manuka", "shinano", "selestia", "generic"
  scope: z.enum(["named_base", "universal", "uncertain"]),
  confidence: z.enum(["creator_declared", "keyword_inferred", "unverified"]),
  evidenceSource: z.string()
});
export type AvatarCompatibility = z.infer<typeof AvatarCompatibilitySchema>;
