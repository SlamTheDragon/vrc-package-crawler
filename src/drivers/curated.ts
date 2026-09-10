import { logger } from "../logger.ts";
import { db } from "../db.ts";

export class CuratedDriver {
  // Harvests all 300 community VPM repositories from repositories.txt
  static async ingestVpmRepositoriesList(): Promise<number> {
    logger.info("[Curated] Fetching 300 decentralized community VPM repositories from repositories.txt...");
    try {
      const url = "https://raw.githubusercontent.com/kurotu/vpm-catalog/master/repositories.txt";
      const resp = await fetch(url);
      if (!resp.ok) return 0;
      const text = await resp.text();
      const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

      let count = 0;
      for (const repoUrl of lines) {
        if (db.queueUrl(repoUrl, "vpm")) count++;
      }
      logger.info(`[Curated] Queued ${count} new decentralized VPM repository feeds.`);
      return count;
    } catch (e) {
      logger.error("[Curated] Failed fetching repositories.txt", e);
      return 0;
    }
  }

  // Harvests curated links from madjin/awesome-vrchat
  static async ingestAwesomeVRChat(): Promise<number> {
    logger.info("[Curated] Ingesting madjin/awesome-vrchat curated collection...");
    try {
      const url = "https://raw.githubusercontent.com/madjin/awesome-vrchat/master/README.md";
      const resp = await fetch(url);
      if (!resp.ok) return 0;
      const text = await resp.text();

      const links = text.match(/https?:\/\/[^\s\)\"]+/g) || [];
      let count = 0;

      for (const link of links) {
        if (link.includes("github.com") && !link.endsWith("awesome-vrchat")) {
          // Clean repo URL
          const m = link.match(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/);
          if (m && db.queueUrl(m[0], "github")) count++;
        } else if (link.includes("booth.pm/ja/items/") || link.includes("booth.pm/en/items/")) {
          const m = link.match(/https:\/\/booth\.pm\/(?:ja|en)\/items\/\d+/);
          if (m && db.queueUrl(m[0], "booth")) count++;
        } else if (link.includes("gumroad.com/l/")) {
          const m = link.match(/https:\/\/[^/]*gumroad\.com\/l\/[^/?#]+/);
          if (m && db.queueUrl(m[0], "gumroad")) count++;
        }
      }

      logger.info(`[Curated] Queued ${count} new links from awesome-vrchat.`);
      return count;
    } catch (e) {
      logger.error("[Curated] Failed fetching awesome-vrchat", e);
      return 0;
    }
  }
}
