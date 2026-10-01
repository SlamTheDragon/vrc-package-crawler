/** Transport-neutral validation shared by local and future Worker ingestion paths. */
export function validateSchema4Payload(body: unknown): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, errors: ["Request body must be a valid JSON object."] };
  }
  const report = body as Record<string, unknown>;

  if (!report.reportId || typeof report.reportId !== "string") {
    errors.push("Field 'reportId' is required and must be a string.");
  }
  if (!report.targetPackageId || typeof report.targetPackageId !== "string") {
    errors.push("Field 'targetPackageId' is required and must be a string.");
  }
  if (!report.targetPackageName || typeof report.targetPackageName !== "string") {
    errors.push("Field 'targetPackageName' is required and must be a string.");
  }

  const validBranches = ["categorization", "irrelevance", "listing", "tags", "discovery_query"];
  if (!report.branch || !validBranches.includes(report.branch as string)) {
    errors.push(`Field 'branch' is required and must be one of: ${validBranches.join(", ")}.`);
  }

  if (typeof report.submittedAt !== "string" || !Number.isFinite(Date.parse(report.submittedAt))) {
    errors.push("Field 'submittedAt' is required and must be an ISO 8601 date string.");
  }

  if (!report.branchPayload || typeof report.branchPayload !== "object" || Array.isArray(report.branchPayload)) {
    errors.push("Field 'branchPayload' is required and must be an object.");
  } else {
    const payload = report.branchPayload as Record<string, unknown>;
    switch (report.branch) {
      case "categorization":
        if (!payload.suggestedClass) errors.push("Branch 'categorization' requires 'branchPayload.suggestedClass'.");
        break;
      case "irrelevance":
        if (!payload.irrelevanceReason) errors.push("Branch 'irrelevance' requires 'branchPayload.irrelevanceReason'.");
        break;
      case "listing":
        if (!payload.nameOverride && !payload.correctedTitle && !payload.correctedUrl && !payload.correctedDescription) {
          errors.push("Branch 'listing' requires at least one of nameOverride, correctedTitle, correctedUrl, or correctedDescription.");
        }
        break;
      case "tags":
        if (!Array.isArray(payload.addTags) && !Array.isArray(payload.removeTags)) {
          errors.push("Branch 'tags' requires at least one array of 'addTags' or 'removeTags'.");
        }
        break;
      case "discovery_query":
        if (!payload.searchQuery) errors.push("Branch 'discovery_query' requires 'branchPayload.searchQuery'.");
        break;
    }
  }

  return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
}
