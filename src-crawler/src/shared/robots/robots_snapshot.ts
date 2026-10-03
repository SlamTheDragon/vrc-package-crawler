import { z } from "zod";

export const MAX_ROBOTS_BYTES = 512 * 1024;
export const ROBOTS_REFRESH_TIMEOUT_MS = 15_000;
export const ROBOTS_REFRESH_LEASE_MS = 45_000;

/** The coordinator stores only a bounded, origin-specific robots fetch result. */
export const OriginRobotsSnapshotSchema = z.strictObject({
  origin: z.url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value && !url.username && !url.password;
  }, "Canonical HTTPS origin required"),
  statusCode: z.number().int().min(200).max(599),
  body: z.string().max(MAX_ROBOTS_BYTES)
}).superRefine((value, context) => {
  if (new TextEncoder().encode(value.body).byteLength > MAX_ROBOTS_BYTES) {
    context.addIssue({ code: "custom", message: "Robots body exceeds 512 KiB", path: ["body"] });
  }
});

export type OriginRobotsSnapshot = z.infer<typeof OriginRobotsSnapshotSchema>;

export function robotsResultAllowsMissingFile(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}
