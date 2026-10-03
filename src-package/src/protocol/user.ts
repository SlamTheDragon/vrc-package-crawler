import { z } from "zod";
import { DOWNSTREAM_PROTOCOL_VERSION } from "./downstream.ts";

export const UserAppSchema = z.strictObject({
  appId: z.uuid(), appName: z.string().min(2).max(100),
  permissions: z.array(z.string().min(1).max(50)).max(20),
  createdAt: z.iso.datetime(), revokedAt: z.iso.datetime().nullable()
});
export type UserApp = z.infer<typeof UserAppSchema>;
export const UserAppListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.uuid().optional()
});
export type UserAppListQuery = z.infer<typeof UserAppListQuerySchema>;
export const UserAppListResponseSchema = z.strictObject({
  schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION), apps: z.array(UserAppSchema).max(100), nextCursor: z.uuid().nullable()
});
export type UserAppListResponse = z.infer<typeof UserAppListResponseSchema>;
export const UserAppResponseSchema = z.strictObject({ schemaVersion: z.literal(DOWNSTREAM_PROTOCOL_VERSION), app: UserAppSchema });
export type UserAppResponse = z.infer<typeof UserAppResponseSchema>;

export {
  DOWNSTREAM_PROTOCOL_VERSION as USER_PROTOCOL_VERSION,
  RegisterAppRequestSchema,
  type RegisterAppRequest,
  RegisterAppResponseSchema,
  type RegisterAppResponse,
  DelistProofKindSchema,
  type DelistProofKind,
  DelistRequestSchema,
  type DelistRequest,
  DelistResponseSchema,
  type DelistResponse
} from "./downstream.ts";
