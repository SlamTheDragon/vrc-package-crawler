import crypto from "node:crypto";
import { PlatformSchema, type Platform } from "./node_protocol.ts";

/**
 * Deterministic bitmask mapping for platform capabilities.
 * Preserves 1-to-1 correspondence between bit position and Platform enum.
 */
export const PLATFORM_BIT_MAP: Readonly<Record<Platform, number>> = {
  booth: 1 << 0,         // 0x0001
  github: 1 << 1,        // 0x0002
  vpm: 1 << 2,           // 0x0004
  gumroad: 1 << 3,       // 0x0008
  jinxxy: 1 << 4,        // 0x0010
  itch: 1 << 5,          // 0x0020
  curated: 1 << 6,       // 0x0040
  shopify: 1 << 7,       // 0x0080
  sellfy: 1 << 8,        // 0x0100
  custom_domain: 1 << 9  // 0x0200
};

export const ALL_CAPABILITIES_MASK = (1 << 10) - 1; // 0x03ff

/**
 * Encodes an array of platform capabilities into a 4-hex-digit capability code.
 */
export function encodeCapabilityCode(capabilities: readonly Platform[]): string {
  let mask = 0;
  for (const cap of capabilities) {
    const bit = PLATFORM_BIT_MAP[cap];
    if (bit !== undefined) {
      mask |= bit;
    }
  }
  return mask.toString(16).padStart(4, "0").toLowerCase();
}

/**
 * Decodes a 4-hex-digit capability code into an array of Platform capabilities.
 * Returns null if the code is invalid or decodes to zero capabilities.
 */
export function decodeCapabilityCode(code: string): Platform[] | null {
  if (!/^[0-9a-fA-F]{4}$/.test(code)) return null;
  const mask = parseInt(code, 16);
  if (mask <= 0 || (mask & ~ALL_CAPABILITIES_MASK) !== 0) return null;

  const result: Platform[] = [];
  for (const platform of PlatformSchema.options) {
    const bit = PLATFORM_BIT_MAP[platform];
    if (bit !== undefined && (mask & bit) !== 0) {
      result.push(platform);
    }
  }
  return result.length > 0 ? result : null;
}

/**
 * Version 0 node token format: vrcp_<auth_token><capability>
 *  - vrcp_ prefix (5 chars)
 *  - 64 hex characters cryptographic entropy
 *  - 4 hex characters capability bitmask code
 */
export const CAPABILITY_TOKEN_REGEX = /^vrcp_([0-9a-fA-F]{64})([0-9a-fA-F]{4})$/;

/**
 * Checks if a bearer token is formatted as a capability-encoded node token.
 */
export function isCapabilityToken(token: string): boolean {
  return CAPABILITY_TOKEN_REGEX.test(token);
}

/**
 * Formats a capability token: vrcp_<auth_token><capability>
 */
export function formatCapabilityToken(
  capabilities: readonly Platform[],
  entropyHex?: string
): string {
  const code = encodeCapabilityCode(capabilities);
  const entropy = entropyHex && /^[0-9a-fA-F]{64}$/.test(entropyHex)
    ? entropyHex.toLowerCase()
    : crypto.randomBytes(32).toString("hex");
  return `vrcp_${entropy}${code}`;
}

/**
 * Parses and validates a capability token, extracting its decoded capabilities, code, and entropy.
 */
export function parseCapabilityToken(token: string): {
  capabilities: Platform[];
  code: string;
  entropy: string;
} | null {
  const match = CAPABILITY_TOKEN_REGEX.exec(token);
  if (!match) return null;

  const entropy = match[1].toLowerCase();
  const code = match[2].toLowerCase();

  const capabilities = decodeCapabilityCode(code);
  if (!capabilities) return null;
  return { capabilities, code, entropy };
}
