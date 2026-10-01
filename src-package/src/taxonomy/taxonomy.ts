import { z } from "zod";

/**
 * Top-level package umbrella categories.
 */
export const UmbrellaSchema = z.enum(["tools", "assets", "avatars"]);
export type Umbrella = z.infer<typeof UmbrellaSchema>;

/**
 * Supported subtypes for standalone VRChat desktop software (Task 5.5 / Gate G4).
 */
export const DesktopToolSubtypeSchema = z.enum([
  "companion_client",
  "osc_control",
  "tracking_bridge",
  "streaming_accessibility",
  "utility"
]);
export type DesktopToolSubtype = z.infer<typeof DesktopToolSubtypeSchema>;

/**
 * Publisher-evidenced desktop tool schema.
 */
export const DesktopToolEvidenceSchema = z.object({
  canonicalId: z.string(),
  toolSubtype: DesktopToolSubtypeSchema,
  supportedOS: z.array(z.enum(["windows", "linux", "macos"])),
  particularVRChatTarget: z.boolean(),
  evidenceUrl: z.string().url(),
  publisherClaim: z.string()
});
export type DesktopToolEvidence = z.infer<typeof DesktopToolEvidenceSchema>;
