import { expect, test } from "bun:test";
import * as sdk from "../src/index.ts";
import * as user from "../src/protocol/user.ts";
import * as downstream from "../src/protocol/downstream.ts";

test("SDK exports use owner-approved VRCP identity without old-name aliases", () => {
  expect(typeof sdk.VRCPackageClient).toBe("function");
  expect(typeof sdk.VRCPApiError).toBe("function");
  for (const name of ["VrcPackagesClient", "VrcApiError", "VRCPPackageClient", "VRCPPackagesClient"]) {
    expect(Object.hasOwn(sdk, name)).toBe(false);
  }
  const error = new sdk.VRCPApiError(403, "Fixture rejection", "forbidden");
  expect(error.name).toBe("VRCPApiError");
  expect(error.status).toBe(403);
  expect(error.code).toBe("forbidden");
});

test("SDK entry points do not expose the retired direct-delisting contract", () => {
  for (const entry of [sdk, user, downstream]) {
    for (const name of ["DelistRequestSchema", "DelistResponseSchema", "DelistProofKindSchema"]) {
      expect(Object.hasOwn(entry, name)).toBe(false);
    }
  }
  expect(sdk.ReportSubmissionRequestSchema.safeParse({ schemaVersion: 1,
    reportType: "removal_request", canonicalId: "fixture-package", reason: "Review attribution" }).success).toBe(true);
});
