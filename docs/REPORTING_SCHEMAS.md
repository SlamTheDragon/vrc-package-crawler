# Standardized Client and Ingestion Reporting Schemas

This document defines standardized JSON schemas for downstream clients, package managers, diagnostic audits, user steering feedback, and search telemetry.

---

## 1. Schema Selection Matrix

| Schema Name | Target Consumer | Primary Format | Update Frequency | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Schema 1: Feed Delta Report** | VRCX, Obsidian, RSS | JSON Stream / SSE | Continuous | Ingest new, modified, and delisted tools |
| **Schema 2: VCC Community Manifest** | VCC, ALCOM | Standard `index.json` | Daily Snapshot | Install packages in Unity projects |
| **Schema 3: Project Dependency Audit** | Unity Editor, CI/CD | JSON Report | On-Demand | Detect missing dependencies and vulnerabilities |
| **Schema 4: Branched Steering Report** | Web Catalog, Desktop UI | Branched JSON Payload | User-Driven | Submit closed-loop query steering, negative tokens, and overrides |
| **Schema 5: Interaction & Search Telemetry** | Downstream Clients, Portals | Aggregated JSON Payload | Periodic / Batch | Ingest anonymous click rates, queries, and bookmarks to seed discovery |

---

## 2. Schema 1: Downstream Feed Delta Ingestion Report

Downstream tools sync tool changes incrementally. This schema gives cursor-based delta synchronization.

### Specification
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DownstreamFeedDeltaReport",
  "type": "object",
  "required": ["cursor", "nextCursor", "generatedAt", "deltaCount", "sha256Digest", "deltas"],
  "properties": {
    "cursor": {
      "type": "string",
      "description": "Starting watermark cursor for this synchronization window"
    },
    "nextCursor": {
      "type": "string",
      "description": "High watermark cursor to pass to the next polling request"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time"
    },
    "deltaCount": {
      "type": "integer",
      "minimum": 0
    },
    "sha256Digest": {
      "type": "string",
      "description": "SHA-256 hash of the delta payload for tamper verification"
    },
    "deltas": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["action", "canonicalId", "timestamp", "package"],
        "properties": {
          "action": {
            "type": "string",
            "enum": ["ADDED", "UPDATED", "DELISTED"]
          },
          "canonicalId": { "type": "string" },
          "timestamp": { "type": "string", "format": "date-time" },
          "package": {
            "type": "object",
            "required": ["name", "author", "category", "primaryPlatform", "url"],
            "properties": {
              "name": { "type": "string" },
              "author": { "type": "string" },
              "category": { "type": "string" },
              "subcategory": { "type": "string" },
              "type": { "type": "string" },
              "primaryPlatform": { "type": "string" },
              "url": { "type": "string", "format": "uri" },
              "isVcc": { "type": "boolean" },
              "tags": { "type": "array", "items": { "type": "string" } },
              "media": {
                "type": "object",
                "properties": {
                  "thumbnailUrl": { "type": "string", "format": "uri" },
                  "blurhash": { "type": "string" }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 3. Schema 2: Native VCC and ALCOM Ingestion Manifest

This schema follows the official VPM repository manifest specification (`index.json`). Users can add the catalog directly into the VRChat Creator Companion and ALCOM.

### Specification
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "VpmCommunityRepositoryManifest",
  "type": "object",
  "required": ["name", "id", "url", "author", "packages"],
  "properties": {
    "name": { "type": "string" },
    "id": { "type": "string" },
    "url": { "type": "string", "format": "uri" },
    "author": { "type": "string" },
    "description": { "type": "string" },
    "packages": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["versions"],
        "properties": {
          "versions": {
            "type": "object",
            "additionalProperties": {
              "type": "object",
              "required": ["name", "version", "displayName", "url"],
              "properties": {
                "name": { "type": "string" },
                "version": { "type": "string" },
                "displayName": { "type": "string" },
                "description": { "type": "string" },
                "author": { "type": "object" },
                "url": { "type": "string", "format": "uri" },
                "vpmDependencies": { "type": "object" },
                "legacyFolders": { "type": "object" }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 4. Schema 3: End-User Project Dependency Audit Report

Diagnostic scanners use this schema when inspecting local Unity project manifests.

### Specification
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ProjectDependencyAuditReport",
  "type": "object",
  "required": ["projectPath", "scannedAt", "summary", "installedPackages", "issues"],
  "properties": {
    "projectPath": { "type": "string" },
    "unityVersion": { "type": "string" },
    "vrcSdkType": { "type": "string", "enum": ["Base", "Avatars", "Worlds", "None"] },
    "scannedAt": { "type": "string", "format": "date-time" },
    "summary": {
      "type": "object",
      "required": ["totalPackages", "healthyCount", "outdatedCount", "missingDependenciesCount"],
      "properties": {
        "totalPackages": { "type": "integer" },
        "healthyCount": { "type": "integer" },
        "outdatedCount": { "type": "integer" },
        "missingDependenciesCount": { "type": "integer" }
      }
    },
    "installedPackages": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["packageId", "installedVersion", "isVpm"],
        "properties": {
          "packageId": { "type": "string" },
          "installedVersion": { "type": "string" },
          "latestAvailableVersion": { "type": "string" },
          "isVpm": { "type": "boolean" },
          "canonicalCatalogId": { "type": "string" }
        }
      }
    },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["severity", "code", "packageId", "message", "recommendedAction"],
        "properties": {
          "severity": { "type": "string", "enum": ["ERROR", "WARNING", "INFO"] },
          "code": { "type": "string" },
          "packageId": { "type": "string" },
          "message": { "type": "string" },
          "recommendedAction": { "type": "string" }
        }
      }
    }
  }
}
```

---

## 5. Schema 4: Upstream User Steering Report (Branched Decision Model)

Schema 4 uses a branched decision model. The user picks a single symptom branch. The interface presents only the relevant micro-action.

### Authentication & Gating Invariant
Administrative submissions to `POST /v1/reports` will require the `API_SECRET_TOKEN` bearer token. Delisting reports will be quarantined into `needs_review` to prevent unauthenticated delisting sabotage.

### The 5 Discrete Steering Branches
1. **`BRANCH_CATEGORIZATION`**:
   - Symptom: Tool is placed in the wrong class or subcategory.
   - User Action: Selects 1 of 4 main classes and specifies a subcategory.
2. **`BRANCH_IRRELEVANCE`**:
   - Symptom: Item is cosmetic only, non-VR software, spam, or duplicate.
   - User Action: Selects irrelevance reason. Enters negative exclusion tokens.
3. **`BRANCH_LISTING`**:
   - Symptom: Title, store URL, or description is corrupted or uninformative.
   - User Action: Supplies name override, canonical URL, or corrected description.
4. **`BRANCH_TAGS`**:
   - Symptom: Missing community ecosystem tags or incorrect tags.
   - User Action: Submits positive tags (`addTags`) or negative tags (`removeTags`).
5. **`BRANCH_DISCOVERY_QUERY`**:
   - Symptom: Search queries produce irrelevant tools or fail to locate desired utilities.
   - User Action: Submits search query, relevance direction, negative tokens, and suggested seeds.

### Specification
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "UpstreamUserSteeringReport",
  "type": "object",
  "required": ["reportId", "targetPackageId", "targetPackageName", "branch", "submittedAt", "branchPayload"],
  "properties": {
    "reportId": { "type": "string" },
    "targetPackageId": { "type": "string" },
    "targetPackageName": { "type": "string" },
    "submittedAt": { "type": "string", "format": "date-time" },
    "reporterNotes": { "type": "string", "maxLength": 500 },
    "branch": {
      "type": "string",
      "enum": ["categorization", "irrelevance", "listing", "tags", "discovery_query"]
    },
    "branchPayload": {
      "type": "object",
      "oneOf": [
        {
          "title": "CategorizationBranchPayload",
          "required": ["suggestedClass"],
          "properties": {
            "suggestedClass": {
              "type": "string",
              "enum": ["Avatars", "World Creation", "Shaders & Visuals", "Tools & Utilities"]
            },
            "suggestedSubcategory": { "type": "string" }
          }
        },
        {
          "title": "IrrelevanceBranchPayload",
          "required": ["irrelevanceReason"],
          "properties": {
            "irrelevanceReason": {
              "type": "string",
              "enum": ["cosmetics_only", "non_vr_software", "malicious_or_scam", "duplicate"]
            },
            "replacementCanonicalId": { "type": "string" },
            "negativeTokens": {
              "type": "array",
              "items": { "type": "string" }
            }
          }
        },
        {
          "title": "ListingBranchPayload",
          "properties": {
            "nameOverride": { "type": "string" },
            "correctedTitle": { "type": "string" },
            "correctedUrl": { "type": "string", "format": "uri" },
            "correctedDescription": { "type": "string" }
          }
        },
        {
          "title": "TagsBranchPayload",
          "required": ["addTags"],
          "properties": {
            "addTags": {
              "type": "array",
              "items": { "type": "string" },
              "minItems": 1
            },
            "removeTags": {
              "type": "array",
              "items": { "type": "string" }
            }
          }
        },
        {
          "title": "DiscoveryQueryBranchPayload",
          "required": ["searchQuery", "relevanceVote"],
          "properties": {
            "searchQuery": { "type": "string" },
            "queryIntent": { "type": "string" },
            "relevanceVote": {
              "type": "string",
              "enum": ["boost", "suppress"]
            },
            "negativeTokens": {
              "type": "array",
              "items": { "type": "string" }
            },
            "suggestedSeeds": {
              "type": "array",
              "items": { "type": "string" }
            }
          }
        }
      ]
    }
  }
}
```

---

## 6. Schema 5: Downstream Interaction & Search Telemetry

Downstream applications will use Schema 5 to send aggregate engagement data. This data will seed discovery queues and tune ranking models without harvesting personal data.

### Privacy Invariant
Schema 5 payloads will contain zero personally identifiable information (PII). User accounts, session identifiers, and IP addresses will be stripped before submission.

### Specification
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "InteractionSearchTelemetryReport",
  "type": "object",
  "required": ["batchId", "collectedAt", "metrics"],
  "properties": {
    "batchId": { "type": "string" },
    "collectedAt": { "type": "string", "format": "date-time" },
    "clientVersion": { "type": "string" },
    "metrics": {
      "type": "object",
      "required": ["searchQueries", "packageInteractions"],
      "properties": {
        "searchQueries": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["query", "count", "zeroResults"],
            "properties": {
              "query": { "type": "string" },
              "count": { "type": "integer", "minimum": 1 },
              "zeroResults": { "type": "boolean" },
              "suggestedCategory": { "type": "string" }
            }
          }
        },
        "packageInteractions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["canonicalId", "clickCount", "bookmarkCount"],
            "properties": {
              "canonicalId": { "type": "string" },
              "clickCount": { "type": "integer", "minimum": 0 },
              "bookmarkCount": { "type": "integer", "minimum": 0 }
            }
          }
        }
      }
    }
  }
}
```

---

## 7. Technical Specifications and Architecture (Reference)

### Validation Implementation
Run validation against the schemas in TypeScript using standard validation libraries:

```typescript
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

export function validateReport(schema: object, data: unknown): { valid: boolean; errors?: any } {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return { valid, errors: validate.errors };
}
```
