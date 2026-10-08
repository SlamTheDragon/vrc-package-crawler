import { z } from "zod";

/**
 * Top-level package umbrella categories.
 */
export const UmbrellaSchema = z.enum(["tools", "assets", "avatars"]);
export type Umbrella = z.infer<typeof UmbrellaSchema>;

/**
 * Standardized scaled content ratings.
 * Attached per API delivery for downstream interpretation.
 */
export const ContentRatingSchema = z.enum([
  "general",
  "mature",
  "sexual_suggestive",
  "adult_restricted",
  "unknown_restricted",
  "prohibited"
]);
export type ContentRating = z.infer<typeof ContentRatingSchema>;

