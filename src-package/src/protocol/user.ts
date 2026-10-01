import { z } from "zod";
import { PlatformSchema, type Platform } from "../types/platform.ts";
import { DOWNSTREAM_PROTOCOL_VERSION } from "./downstream.ts";

export const RegisterNodeRequestSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  nodeId: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  reason: z.string().trim().max(500).optional(),
  requestedCapabilities: z.array(PlatformSchema).min(1).max(10).optional()
});
export type RegisterNodeRequest = z.infer<typeof RegisterNodeRequestSchema>;

export const RegisterNodeResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION),
  nodeId: z.string(),
  capabilities: z.array(PlatformSchema),
  token: z.string().regex(/^vrcp_[0-9a-fA-F]{64}[0-9a-fA-F]{4}$/)
});
export type RegisterNodeResponse = z.infer<typeof RegisterNodeResponseSchema>;
