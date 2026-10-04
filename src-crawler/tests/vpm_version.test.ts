import { describe, it, expect } from "bun:test";
import { isVpmVersion, compareVpmVersions, cleanVpmVersion } from "vrc-packages-network/vpm-version";

describe("Crawler VPM version validation", () => {
  it("keeps manifest validation strict and uses SemVer ordering", () => {
    expect(isVpmVersion("1.0.0")).toBe(true);
    expect(isVpmVersion("2.1.3-beta.1")).toBe(true);
    for (const version of ["v1.0.0", " 1.0.0 ", "1.0", "01.0.0", "latest"]) expect(isVpmVersion(version)).toBe(false);
    expect(compareVpmVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVpmVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVpmVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVpmVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(cleanVpmVersion("v1.2.3")).toBe("1.2.3");
    expect(cleanVpmVersion("invalid")).toBeNull();
  });
});
