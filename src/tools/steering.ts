import fs from "fs";
import path from "path";
import { logger } from "../logger.ts";
import { db, type CrawlerDB, type UserReport, type PlatformType } from "../db.ts";
import { sanitizeOutboundUrl } from "../utils/image_proxy.ts";
import { validateSchema4Payload } from "../server.ts";

export interface SteeringOptions {
  reportsDir?: string;
  pollIntervalMs?: number;
  db?: CrawlerDB;
}

let steeringTimer: Timer | null = null;
let isProcessing = false;

/**
 * Detect platform type from seed URL
 */
function inferPlatformFromUrl(url: string): PlatformType {
  const lower = url.toLowerCase();
  if (lower.includes("booth.pm")) return "booth";
  if (lower.includes("github.com") || lower.includes("api.github.com")) return "github";
  if (lower.includes("gumroad.com")) return "gumroad";
  if (lower.includes("jinxxy.com")) return "jinxxy";
  if (lower.includes("itch.io")) return "itch";
  return "vpm";
}

/**
 * Process all pending user reports in the database
 */
export async function processPendingReports(customDb?: CrawlerDB): Promise<{ processed: number; applied: number; failed: number }> {
  const targetDb = customDb || db;
  const pendingReports = targetDb.getPendingReports(100);

  if (pendingReports.length === 0) {
    return { processed: 0, applied: 0, failed: 0 };
  }

  logger.info(`[Steering] Processing ${pendingReports.length} pending user reports...`);

  let applied = 0;
  let failed = 0;

  for (const report of pendingReports) {
    try {
      let payload: any = {};
      try {
        payload = JSON.parse(report.branch_payload_json);
      } catch {
        targetDb.markReportStatus(report.report_id, "rejected");
        failed++;
        continue;
      }

      const now = new Date().toISOString();

      switch (report.branch) {
        case "categorization": {
          targetDb.upsertCuratorOverride({
            canonicalId: report.target_package_id,
            categoryOverride: payload.suggestedClass,
            subcategoryOverride: payload.suggestedSubcategory || null,
            reason: report.reporter_notes || null,
            reporterId: report.client_fingerprint || null
          });

          // Immediate projection update
          targetDb.rawDb.run(`
            UPDATE canonical_packages
            SET category = ?,
                subcategory = COALESCE(?, subcategory),
                updated_at = ?
            WHERE canonical_id = ?;
          `, [payload.suggestedClass, payload.suggestedSubcategory || null, now, report.target_package_id]);
          break;
        }

        case "irrelevance": {
          const reason = payload.irrelevanceReason;
          // Flag package as delisted or quarantined
          if (reason === "cosmetics_only" || reason === "malicious_or_scam") {
            targetDb.rawDb.run(`
              UPDATE canonical_packages
              SET lifecycle = 'delisted',
                  lifecycle_updated_at = ?,
                  updated_at = ?
              WHERE canonical_id = ?;
            `, [now, now, report.target_package_id]);

            // Mark observation lake as quarantined via constituent source_ids_json
            const pkgRow = targetDb.rawDb.prepare("SELECT source_ids_json FROM canonical_packages WHERE canonical_id = ?;").get(report.target_package_id) as any;
            if (pkgRow) {
              let sourceIds: string[] = [];
              try { sourceIds = JSON.parse(pkgRow.source_ids_json || "[]"); } catch (_) {}
              for (const sid of sourceIds) {
                targetDb.rawDb.run(`
                  UPDATE entities
                  SET is_quarantined = 1,
                      quarantine_reasons_json = json_insert(COALESCE(quarantine_reasons_json, '[]'), '$[#]', ?),
                      updated_at = ?
                  WHERE id = ?;
                `, [`user_reported_${reason}`, now, sid]);
              }
            }

            targetDb.rawDb.run(`
              UPDATE entities
              SET is_quarantined = 1,
                  quarantine_reasons_json = json_insert(COALESCE(quarantine_reasons_json, '[]'), '$[#]', ?),
                  updated_at = ?
              WHERE id = ? OR url LIKE ?;
            `, [`user_reported_${reason}`, now, report.target_package_id, `%${report.target_package_id}%`]);
          }

          // Register negative exclusion tokens
          if (Array.isArray(payload.negativeTokens) && payload.negativeTokens.length > 0) {
            targetDb.upsertSearchPattern({
              query: report.target_package_name,
              queryIntent: `Negative token filter for ${report.target_package_name}`,
              relevanceVote: "suppress",
              negativeTokens: payload.negativeTokens,
              weight: 2.0
            });
          }
          break;
        }

        case "listing": {
          const title = payload.correctedTitle || payload.nameOverride;
          const url = payload.correctedUrl ? sanitizeOutboundUrl(payload.correctedUrl) : null;
          const desc = payload.correctedDescription;

          targetDb.upsertCuratorOverride({
            canonicalId: report.target_package_id,
            nameOverride: payload.nameOverride || null,
            titleOverride: payload.correctedTitle || null,
            urlOverride: url,
            descriptionOverride: desc || null,
            reason: report.reporter_notes || null,
            reporterId: report.client_fingerprint || null
          });

          // Immediate projection update
          targetDb.rawDb.run(`
            UPDATE canonical_packages
            SET name = COALESCE(?, name),
                url = COALESCE(?, url),
                description = COALESCE(?, description),
                updated_at = ?
            WHERE canonical_id = ?;
          `, [title || null, url || null, desc || null, now, report.target_package_id]);
          break;
        }

        case "tags": {
          const addTags: string[] = Array.isArray(payload.addTags) ? payload.addTags : [];
          const removeTags: string[] = Array.isArray(payload.removeTags) ? payload.removeTags : [];

          targetDb.upsertCuratorOverride({
            canonicalId: report.target_package_id,
            addedTags: addTags,
            removedTags: removeTags,
            reason: report.reporter_notes || null,
            reporterId: report.client_fingerprint || null
          });

          // Apply to existing tags in canonical_packages
          const existingPkg = targetDb.rawDb.prepare("SELECT tags_json FROM canonical_packages WHERE canonical_id = ?;").get(report.target_package_id) as any;
          if (existingPkg) {
            let currentTags: string[] = [];
            try {
              currentTags = JSON.parse(existingPkg.tags_json || "[]");
            } catch (_) {}

            const tagSet = new Set(currentTags);
            for (const t of addTags) tagSet.add(t);
            for (const t of removeTags) tagSet.delete(t);

            const updatedTags = Array.from(tagSet);
            targetDb.rawDb.run(`
              UPDATE canonical_packages
              SET tags_json = ?, updated_at = ?
              WHERE canonical_id = ?;
            `, [JSON.stringify(updatedTags), now, report.target_package_id]);
          }
          break;
        }

        case "discovery_query": {
          const seeds: string[] = Array.isArray(payload.suggestedSeeds) ? payload.suggestedSeeds : [];
          const negTokens: string[] = Array.isArray(payload.negativeTokens) ? payload.negativeTokens : [];

          targetDb.upsertSearchPattern({
            query: payload.searchQuery,
            queryIntent: payload.queryIntent || null,
            relevanceVote: payload.relevanceVote || "boost",
            negativeTokens: negTokens,
            suggestedSeeds: seeds,
            weight: 1.5
          });

          // Enqueue high-priority discovery seeds into frontier
          for (const rawSeed of seeds) {
            const cleanUrl = sanitizeOutboundUrl(rawSeed);
            if (cleanUrl) {
              const platform = inferPlatformFromUrl(cleanUrl);
              targetDb.queueUrl(cleanUrl, platform, 100);
            }
          }
          break;
        }
      }

      targetDb.markReportStatus(report.report_id, "applied");
      applied++;
    } catch (err) {
      logger.error(`[Steering] Error applying report ${report.report_id}:`, err);
      targetDb.markReportStatus(report.report_id, "rejected");
      failed++;
    }
  }

  logger.info(`[Steering] Completed processing batch: ${applied} applied, ${failed} failed.`);
  return { processed: pendingReports.length, applied, failed };
}

/**
 * Downloads steering reports from Cloudflare R2 bucket if configured
 */
export async function pullReportsFromCloudflareR2(customDb?: CrawlerDB): Promise<number> {
  const targetDb = customDb || db;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || process.env.CLOUDFLARE_REPORTS_BUCKET;

  if (!accountId || !apiToken || !bucketName) {
    return 0;
  }

  logger.info(`[Steering:R2] Checking Cloudflare R2 bucket '${bucketName}' for remote steering reports...`);

  try {
    const listUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects?prefix=reports/pending/`;
    const listResp = await fetch(listUrl, {
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!listResp.ok) {
      return 0;
    }

    const listData = await listResp.json() as any;
    const objects: any[] = listData.result || [];
    let downloadedCount = 0;

    for (const obj of objects) {
      if (!obj.key?.endsWith(".json")) continue;
      const getUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects/${encodeURIComponent(obj.key)}`;
      const getResp = await fetch(getUrl, {
        headers: { "Authorization": `Bearer ${apiToken}` }
      });

      if (!getResp.ok) continue;
      const json = await getResp.json() as any;
      const validation = validateSchema4Payload(json);

      if (validation.valid) {
        targetDb.insertReport({
          reportId: json.reportId,
          targetPackageId: json.targetPackageId,
          targetPackageName: json.targetPackageName,
          branch: json.branch,
          branchPayload: json.branchPayload,
          reporterNotes: json.reporterNotes || null,
          clientFingerprint: json.clientFingerprint || "cloudflare-r2-sync",
          trustTier: json.trustTier || "anonymous",
          submittedAt: json.submittedAt
        });
        downloadedCount++;

        // Delete or move from pending
        await fetch(getUrl, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${apiToken}` }
        }).catch(() => {});
      }
    }

    if (downloadedCount > 0) {
      logger.info(`[Steering:R2] Downloaded and queued ${downloadedCount} steering reports from Cloudflare R2.`);
    }
    return downloadedCount;
  } catch (err) {
    logger.warn("[Steering:R2] Notice during Cloudflare R2 steering download:", err);
    return 0;
  }
}

/**
 * Pull reports from local directory or Cloudflare R2
 */
export async function pullReportsFromDirectory(dirPath?: string, customDb?: CrawlerDB): Promise<number> {
  const targetDb = customDb || db;
  let totalPulled = 0;

  // 1. Try remote Cloudflare R2 download if credentials exist
  try {
    const r2Count = await pullReportsFromCloudflareR2(targetDb);
    totalPulled += r2Count;
  } catch (_) {}

  // 2. Read local filesystem reports directory
  const baseDir = dirPath || process.env.CRAWLER_REPORTS_DIR || path.resolve(process.cwd(), "reports");
  const pendingDir = path.resolve(baseDir, "pending");
  const processedDir = path.resolve(baseDir, "processed");

  if (!fs.existsSync(pendingDir)) {
    return totalPulled;
  }

  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }

  const files = fs.readdirSync(pendingDir).filter(f => f.endsWith(".json"));

  for (const file of files) {
    const filePath = path.join(pendingDir, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const json = JSON.parse(content);
      const validation = validateSchema4Payload(json);

      if (validation.valid) {
        targetDb.insertReport({
          reportId: json.reportId,
          targetPackageId: json.targetPackageId,
          targetPackageName: json.targetPackageName,
          branch: json.branch,
          branchPayload: json.branchPayload,
          reporterNotes: json.reporterNotes || null,
          clientFingerprint: json.clientFingerprint || "r2-pull-sync",
          trustTier: json.trustTier || "anonymous",
          submittedAt: json.submittedAt
        });
        totalPulled++;
      } else {
        logger.warn(`[Steering:Pull] File ${file} failed Schema 4 validation:`, validation.errors);
      }

      // Move to processed archive
      const destPath = path.join(processedDir, file);
      fs.renameSync(filePath, destPath);
    } catch (err) {
      logger.error(`[Steering:Pull] Error processing report file ${file}:`, err);
    }
  }

  if (totalPulled > 0) {
    logger.info(`[Steering:Pull] Successfully ingested ${totalPulled} reports into database.`);
  }
  return totalPulled;
}

/**
 * Continuous steering daemon runner
 */
export function startSteeringLoop(options: SteeringOptions = {}) {
  const intervalMs = options.pollIntervalMs ||
    (parseInt(process.env.CRAWLER_REPORTS_POLL_INTERVAL_MINUTES || "5", 10) * 60 * 1000);
  const targetDb = options.db || db;

  logger.info(`[Steering] Initializing autonomous steering loop (Interval: ${intervalMs / 1000}s)...`);

  const runTick = async () => {
    if (isProcessing) return;
    isProcessing = true;
    try {
      await pullReportsFromDirectory(options.reportsDir, targetDb);
      await processPendingReports(targetDb);
    } catch (err) {
      logger.error("[Steering] Error in steering loop cycle:", err);
    } finally {
      isProcessing = false;
    }
  };

  // Run immediately, then schedule
  runTick();
  steeringTimer = setInterval(runTick, intervalMs);
}

export function stopSteeringLoop() {
  if (steeringTimer) {
    clearInterval(steeringTimer);
    steeringTimer = null;
    logger.info("[Steering] Steering loop stopped.");
  }
}

if (import.meta.main) {
  startSteeringLoop();
}
