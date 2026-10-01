import validSemver from "semver/functions/valid.js";

/** Syntax check only; VPM range resolution and version ranking need separate parity work. */
export function isVpmVersion(version: string): boolean {
  // node-semver accepts cosmetic prefixes and whitespace even in default mode.
  // A manifest identity must already be SemVer 2.0.0, not a cleaned variant.
  return version === version.trim() && /^[0-9]/.test(version) && validSemver(version) !== null;
}
