import { z } from "zod";

export const PlatformSchema = z.enum([
  "booth",
  "github",
  "vpm",
  "gumroad",
  "jinxxy",
  "itch",
  "curated",
  "shopify",
  "sellfy",
  "custom_domain"
]);
export type Platform = z.infer<typeof PlatformSchema>;

export const STOREFRONT_PLATFORMS: ReadonlySet<Platform> = new Set([
  "booth",
  "gumroad",
  "jinxxy",
  "itch",
  "shopify",
  "sellfy",
  "custom_domain"
]);
