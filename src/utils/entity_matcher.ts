/**
 * Fellegi-Sunter Probabilistic Record Linkage & Disjoint Set Union (DSU) Entity Clusterer
 * References:
 * - Fellegi, I. P., & Sunter, A. B. (1969). "A theory for record linkage."
 * - Dong, X. L., et al. (2014). "Knowledge vault: A web-scale approach to probabilistic knowledge fusion."
 */

export interface CandidateEntity {
  id: string;
  platform: string;
  url: string;
  title: string;
  author: string;
  description?: string;
  tags?: string[];
  externalLinks?: string[];
  repoUrl?: string;
  authorsList?: string[];
  dependencies?: Record<string, string>;
}

export interface CanonicalClusterResult {
  primaryId: string;
  name: string;
  canonicalId: string;
  author: string;
  authors: string[];
  platforms: string[];
  urls: Record<string, string>;
  dependencies: Record<string, string>;
  sourceEntityIds: string[];
}

export class DisjointSetUnion {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  makeSet(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    if (!this.parent.has(x)) this.makeSet(x);
    let p = this.parent.get(x)!;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p); // Path compression
    }
    return p;
  }

  union(x: string, y: string): boolean {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return false;

    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
    return true;
  }
}

export class EntityMatcher {
  private static normalizeSlug(str: string): string {
    if (!str) return "";
    return str
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private static extractGitHubSlug(url: string): string | null {
    if (!url) return null;
    const match = url.match(/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/i);
    if (!match) return null;
    const owner = match[1].toLowerCase();
    const repo = match[2].toLowerCase().replace(/\.git$/, "");
    return `${owner}/${repo}`;
  }

  /**
   * Computes the Fellegi-Sunter log-likelihood linkage score between two candidate records.
   * A score >= 10 indicates high-confidence identity match.
   */
  static computeLinkageScore(a: CandidateEntity, b: CandidateEntity): number {
    // 0. Dependent Package Anti-Merge Invariant:
    // If entity A lists entity B in its dependencies (or vice-versa), NEVER merge!
    const aDeps = Object.keys(a.dependencies || {});
    const bDeps = Object.keys(b.dependencies || {});
    const cleanAId = a.id.replace(/^[a-z]+:/, "");
    const cleanBId = b.id.replace(/^[a-z]+:/, "");

    if (aDeps.includes(cleanBId) || bDeps.includes(cleanAId)) {
      return -Infinity; // Strict veto
    }

    let score = 0;

    // 1. Exact Reverse-DNS Package Identifier Match (Level 1: Certainty)
    if (a.platform === "vpm" && b.platform === "vpm") {
      return a.id === b.id ? 100 : -50;
    }

    const pkgMatchA = cleanAId.match(/^([a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+)$/);
    const pkgMatchB = cleanBId.match(/^([a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+)$/);
    if (pkgMatchA && pkgMatchB && pkgMatchA[1].toLowerCase() === pkgMatchB[1].toLowerCase()) {
      score += 25;
    }

    // 2. Exact Canonical GitHub Repository Link (Level 2: Strong Provenance)
    const ghA = this.extractGitHubSlug(a.repoUrl || a.url);
    const ghB = this.extractGitHubSlug(b.repoUrl || b.url);
    if (ghA && ghB && ghA === ghB) {
      score += 20;
    }

    // 3. Cross-Referenced External Links (Level 3: Direct Reference)
    const extLinksA = new Set((a.externalLinks || []).map((l) => l.toLowerCase()));
    const extLinksB = new Set((b.externalLinks || []).map((l) => l.toLowerCase()));

    if (b.url && extLinksA.has(b.url.toLowerCase())) score += 15;
    if (a.url && extLinksB.has(a.url.toLowerCase())) score += 15;
    if (ghB && extLinksA.has(`https://github.com/${ghB}`)) score += 18;
    if (ghA && extLinksB.has(`https://github.com/${ghA}`)) score += 18;

    // 4. Normalized Slug Concordance
    const slugA = this.normalizeSlug(a.title);
    const slugB = this.normalizeSlug(b.title);
    if (slugA && slugB && slugA === slugB) {
      score += 8;
    }

    // 5. Author Concordance
    const authA = this.normalizeSlug(a.author);
    const authB = this.normalizeSlug(b.author);
    if (authA && authB && authA === authB && authA !== "unknown" && authA !== "vrchat") {
      score += 6;
    }

    return score;
  }

  /**
   * Clusters candidate entities into canonical multi-platform groups using DSU
   */
  static clusterEntities(entities: CandidateEntity[], threshold: number = 10): CanonicalClusterResult[] {
    const dsu = new DisjointSetUnion();
    for (const e of entities) {
      dsu.makeSet(e.id);
    }

    // Fast-blocking index by GitHub repo and reverse-DNS slug
    const ghIndex = new Map<string, string[]>();
    const titleAuthorIndex = new Map<string, string[]>();

    for (const e of entities) {
      const ghCandidates = new Set<string>();
      const directGh = this.extractGitHubSlug(e.repoUrl || e.url);
      if (directGh) ghCandidates.add(directGh);

      if (e.externalLinks) {
        for (const link of e.externalLinks) {
          const extGh = this.extractGitHubSlug(link);
          if (extGh) ghCandidates.add(extGh);
        }
      }

      for (const gh of ghCandidates) {
        if (!ghIndex.has(gh)) ghIndex.set(gh, []);
        ghIndex.get(gh)!.push(e.id);
      }

      const key = `${this.normalizeSlug(e.author)}::${this.normalizeSlug(e.title)}`;
      if (key !== "::") {
        if (!titleAuthorIndex.has(key)) titleAuthorIndex.set(key, []);
        titleAuthorIndex.get(key)!.push(e.id);
      }
    }

    const entityMap = new Map(entities.map((e) => [e.id, e]));

    // Connect entities sharing exact GitHub repos with score validation
    for (const [, group] of ghIndex.entries()) {
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          const e1 = entityMap.get(group[0])!;
          const e2 = entityMap.get(group[i])!;
          if (this.computeLinkageScore(e1, e2) >= threshold) {
            dsu.union(group[0], group[i]);
          }
        }
      }
    }

    // Connect entities sharing normalized Author + Title with score validation
    for (const [, group] of titleAuthorIndex.entries()) {
      if (group.length > 1) {
        for (let i = 1; i < group.length; i++) {
          const e1 = entityMap.get(group[0])!;
          const e2 = entityMap.get(group[i])!;
          if (this.computeLinkageScore(e1, e2) >= threshold) {
            dsu.union(group[0], group[i]);
          }
        }
      }
    }

    // Group entities by DSU root
    const rootGroups = new Map<string, CandidateEntity[]>();

    for (const e of entities) {
      const root = dsu.find(e.id);
      if (!rootGroups.has(root)) rootGroups.set(root, []);
      rootGroups.get(root)!.push(e);
    }

    // Build Canonical Cluster Results
    const clusters: CanonicalClusterResult[] = [];

    for (const [, group] of rootGroups.entries()) {
      // Prioritize VPM > GitHub > Storefront for canonical identity
      const primary = group.find((e) => e.platform === "vpm") || group.find((e) => e.platform === "github") || group[0];

      const allAuthors = new Set<string>();
      const platforms = new Set<string>();
      const urls: Record<string, string> = {};
      const mergedDeps: Record<string, string> = {};

      for (const member of group) {
        platforms.add(member.platform);
        urls[member.platform] = member.url;

        if (member.author && member.author !== "Unknown") {
          allAuthors.add(member.author);
        }
        if (member.authorsList) {
          member.authorsList.forEach((a) => allAuthors.add(a));
        }

        if (member.dependencies) {
          for (const [k, v] of Object.entries(member.dependencies)) {
            if (!mergedDeps[k]) mergedDeps[k] = v;
          }
        }
      }

      clusters.push({
        primaryId: primary.id,
        name: primary.title,
        canonicalId: this.normalizeSlug(primary.id.replace(/^[a-z]+:/, "")),
        author: primary.author || (allAuthors.size > 0 ? Array.from(allAuthors)[0] : "Unknown"),
        authors: Array.from(allAuthors),
        platforms: Array.from(platforms),
        urls,
        dependencies: mergedDeps,
        sourceEntityIds: group.map((e) => e.id)
      });
    }

    return clusters;
  }
}
