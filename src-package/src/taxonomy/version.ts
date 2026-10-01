import validSemver from "semver/functions/valid.js";
import compareSemver from "semver/functions/compare.js";
import cleanSemver from "semver/functions/clean.js";

/**
 * Validates whether a string is a strict SemVer 2.0.0 release version.
 * Manifest identities must already be strict SemVer, not cleaned variants with leading 'v' or whitespace.
 */
export function isVpmVersion(version: string): boolean {
  return version === version.trim() && /^[0-9]/.test(version) && validSemver(version) !== null;
}

/**
 * Compares two valid VPM SemVer strings.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareVpmVersions(a: string, b: string): number {
  return compareSemver(a, b);
}

/**
 * Cleans loose version strings into canonical SemVer, returning null if invalid.
 */
export function cleanVpmVersion(version: string): string | null {
  return cleanSemver(version);
}
