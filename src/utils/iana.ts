import { logger } from "../logger.ts";

export class IanaRegistry {
  private static tlds: Set<string> = new Set();
  private static isInitialized = false;

  static async init(): Promise<void> {
    if (this.isInitialized && this.tlds.size > 0) return;

    try {
      logger.info("[IANA] Fetching official Root Zone Database from data.iana.org...");
      const resp = await fetch("https://data.iana.org/TLD/tlds-alpha-by-domain.txt", {
        headers: { "User-Agent": "VRCPackageCrawler/2.0 (IANA Root Zone Synchronizer)" }
      });

      if (resp.ok) {
        const text = await resp.text();
        const lines = text.split("\n");
        let count = 0;
        for (const line of lines) {
          const trimmed = line.trim().toLowerCase();
          if (trimmed && !trimmed.startsWith("#")) {
            this.tlds.add(trimmed);
            count++;
          }
        }
        this.isInitialized = true;
        logger.info(`[IANA] Successfully loaded ${count} authoritative TLDs from IANA.`);
        return;
      }
    } catch (err) {
      logger.warn("[IANA] Could not fetch live IANA Root Zone Database, falling back to bootstrap set.", err);
    }

    // Comprehensive bootstrap baseline if network is unreachable
    const bootstrapTlds = [
      "com", "net", "org", "edu", "gov", "mil", "int", "arpa",
      "io", "dev", "app", "me", "tech", "xyz", "art", "club", "space", "online", "site",
      "jp", "at", "de", "uk", "fr", "ru", "cn", "ca", "au", "eu", "us", "ch", "nl",
      "se", "no", "fi", "es", "it", "kr", "tw", "hk", "sg", "in", "br", "nz", "pl"
    ];
    for (const tld of bootstrapTlds) {
      this.tlds.add(tld);
    }
    this.isInitialized = true;
  }

  static isTld(segment: string): boolean {
    if (!segment) return false;
    const clean = segment.toLowerCase().trim();
    return this.tlds.has(clean);
  }

  // Extracts the meaningful non-TLD segments from a reverse-DNS identifier (e.g. jp.lilxyzw.basispatcher -> ['lilxyzw', 'basispatcher'])
  static cleanReverseDnsSegments(id: string): string[] {
    const clean = id.replace(/^vpm:/i, "").trim();
    const rawParts = clean.split(".").map((p) => p.trim()).filter(Boolean);
    
    // Drop leading parts that are official TLDs or generic prefix namespaces
    const filtered: string[] = [];
    let pastTlds = false;

    for (const part of rawParts) {
      const pLower = part.toLowerCase();
      if (!pastTlds && (this.isTld(pLower) || pLower === "users" || pLower === "github" || pLower === "gitlab" || pLower === "codeberg")) {
        continue;
      }
      pastTlds = true;
      filtered.push(part);
    }

    return filtered.length > 0 ? filtered : rawParts;
  }
}
