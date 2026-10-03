import { z } from "zod";

/**
 * Top-level package umbrella categories.
 */
export const UmbrellaSchema = z.enum(["tools", "assets", "avatars"]);
export type Umbrella = z.infer<typeof UmbrellaSchema>;
