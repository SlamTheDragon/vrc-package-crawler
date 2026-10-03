import validSemver from "semver/functions/valid.js";
import compareSemver from "semver/functions/compare.js";
import cleanSemver from "semver/functions/clean.js";

/** Manifest identities require strict SemVer, without leading v or whitespace. */
export function isVpmVersion(version: string): boolean {
  return version === version.trim() && /^[0-9]/.test(version) && validSemver(version) !== null;
}

/** Compare valid VPM release versions using the SemVer package. */
export function compareVpmVersions(a: string, b: string): number {
  return compareSemver(a, b);
}

/** Clean a loose version string; do not use this to validate manifest identities. */
export function cleanVpmVersion(version: string): string | null {
  return cleanSemver(version);
}
