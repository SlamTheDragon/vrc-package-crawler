/**
 * Authoritative Identity and Token Prefix Configuration for Version 0.
 * Enforces unified `vrcp_` prepend identity across all system credentials.
 */

export {
  IDENTITY_PREFIX,
  APP_TOKEN_PREFIX,
  APP_TOKEN_REGEX,
  formatAppToken,
  isAppToken,
  USER_TOKEN_PREFIX,
  USER_TOKEN_REGEX,
  formatUserToken,
  isUserToken
} from "vrc-packages-api";

/**
 * Crawler-specific Node credentials prepend `vrcp_` followed by 64-hex entropy and 4-hex capability code.
 * Maintained strictly within crawler infrastructure and never exposed to downstream consumer SDK.
 */
export const NODE_TOKEN_PREFIX = "vrcp_" as const;
export const NODE_TOKEN_REGEX = /^vrcp_([0-9a-fA-F]{64})([0-9a-fA-F]{4})$/;

export function isNodeToken(token: string): boolean {
  return NODE_TOKEN_REGEX.test(token);
}
