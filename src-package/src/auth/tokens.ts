/**
 * Authoritative Identity and Token Prefix Configuration for Downstream Consumers.
 * Enforces unified `vrcp_` prepend identity across consumer credentials.
 */

export const IDENTITY_PREFIX = "vrcp_" as const;

/** Downstream application credentials prepend `vrcp_app_` followed by 64-hex entropy. */
export const APP_TOKEN_PREFIX = "vrcp_app_" as const;
export const APP_TOKEN_REGEX = /^vrcp_app_[a-f0-9]{64}$/;

export function formatAppToken(entropyHex: string): string {
  return `${APP_TOKEN_PREFIX}${entropyHex.toLowerCase()}`;
}

export function isAppToken(token: string): boolean {
  return APP_TOKEN_REGEX.test(token);
}

/**
 * User credentials prepend `vrcp_usr_` followed by 64-hex entropy.
 * Users can register downstream apps and submit delisting requests on their own behalf.
 */
export const USER_TOKEN_PREFIX = "vrcp_usr_" as const;
export const USER_TOKEN_REGEX = /^vrcp_usr_[a-f0-9]{64}$/;

export function formatUserToken(entropyHex: string): string {
  return `${USER_TOKEN_PREFIX}${entropyHex.toLowerCase()}`;
}

export function isUserToken(token: string): boolean {
  return USER_TOKEN_REGEX.test(token);
}


/**
 * Admin operator credentials are 64-character hex secrets.
 */
export const OPERATOR_TOKEN_REGEX = /^[0-9a-fA-F]{64}$/;

export function isOperatorToken(token: string): boolean {
  return OPERATOR_TOKEN_REGEX.test(token);
}
