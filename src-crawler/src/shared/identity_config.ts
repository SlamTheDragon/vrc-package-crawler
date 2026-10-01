/**
 * Authoritative Identity and Token Prefix Configuration for Version 0.
 * Enforces unified `vrcp_` prepend identity across all system credentials.
 */

export const IDENTITY_PREFIX = "vrcp_" as const;

/** Node credentials prepend `vrcp_` followed by 64-hex entropy and 4-hex capability code. */
export const NODE_TOKEN_PREFIX = "vrcp_" as const;
export const NODE_TOKEN_REGEX = /^vrcp_([0-9a-fA-F]{64})([0-9a-fA-F]{4})$/;

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
 * Registrant credentials prepend `vrcp_reg_` followed by 64-hex entropy.
 * Registrants can register nodes, register downstream apps, and submit
 * delisting requests on their own behalf. Distinct from the admin operator
 * (COORDINATOR_OPERATOR_TOKEN) who controls infrastructure-level decisions.
 */
export const REGISTRANT_TOKEN_PREFIX = "vrcp_reg_" as const;
export const REGISTRANT_TOKEN_REGEX = /^vrcp_reg_[a-f0-9]{64}$/;

export function formatRegistrantToken(entropyHex: string): string {
  return `${REGISTRANT_TOKEN_PREFIX}${entropyHex.toLowerCase()}`;
}

export function isRegistrantToken(token: string): boolean {
  return REGISTRANT_TOKEN_REGEX.test(token);
}
