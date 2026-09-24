/**
 * 64-bit SimHash Locality-Sensitive Hashing & Permutation Table Index
 * References:
 * - Charikar, M. (2002). "Similarity estimation techniques from rounding algorithms."
 * - Henzinger, M. (2006). "Finding near-duplicate web pages: a large-scale evaluation of algorithms."
 */

export class SimHash64 {
  private static FNV_PRIME = 0x100000001b3n;
  private static FNV_OFFSET_BASIS = 0xcbf29ce484222325n;

  /**
   * 64-bit FNV-1a Hash
   */
  static hash64(str: string): bigint {
    let hash = this.FNV_OFFSET_BASIS;
    const len = str.length;
    for (let i = 0; i < len; i++) {
      hash ^= BigInt(str.charCodeAt(i));
      hash = (hash * this.FNV_PRIME) & 0xffffffffffffffffn;
    }
    return hash;
  }

  private static JAPANESE_LOANWORDS: Record<string, string> = {
    "ツール": "tool",
    "シェーダー": "shader",
    "シェーダ": "shader",
    "アバター": "avatar",
    "システム": "system",
    "ギミック": "gimmick",
    "ワールド": "world",
    "プラグイン": "plugin",
    "エディタ": "editor",
    "エディター": "editor",
    "アニメーション": "animator",
    "アニメーター": "animator"
  };

  /**
   * Tokenizes text into word-tokens and CJK character n-grams (Task 2.4)
   */
  static tokenize(text: string): Map<string, number> {
    if (!text) return new Map();

    let clean = text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/【[^】]*】/g, " ") // Strip marketing brackets (e.g. 【VRChat想定・無料】)
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/[（(][^）)]*[）)]/g, " ")
      .replace(/\bv?[0-9]+\.[0-9]+(?:\.[0-9]+)?\b/g, " ") // Strip version numbers
      .replace(/([a-z0-9]+)([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff])/gi, "$1 $2") // CJK boundary separation
      .replace(/([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff])([a-z0-9]+)/gi, "$1 $2")
      .replace(/[（）「」『』_.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Map common Japanese technical loanwords to English equivalents
    for (const [ja, en] of Object.entries(this.JAPANESE_LOANWORDS)) {
      clean = clean.replaceAll(ja, ` ${en} `);
    }
    // Strip common Japanese marketing / compatibility suffixes
    clean = clean.replace(/(?:対応|向け|専用|無料|非公式)/g, " ");
    clean = clean.replace(/\s+/g, " ").trim();

    const tokenCounts = new Map<string, number>();

    // 1. Word-boundary tokens (Western/Latin words + mapped loanwords)
    const words = clean.split(/\s+/).filter((w) => w.length >= 2);
    for (const w of words) {
      tokenCounts.set(w, (tokenCounts.get(w) || 0) + 1);
    }

    // 2. CJK 2-gram shingling for remaining Japanese kanji/kana
    const cjkChars = clean.replace(/[\x00-\x7F]/g, ""); // isolate non-ASCII
    for (let i = 0; i < cjkChars.length - 1; i++) {
      const shingle = cjkChars.slice(i, i + 2);
      tokenCounts.set(shingle, (tokenCounts.get(shingle) || 0) + 1);
    }

    return tokenCounts;
  }

  /**
   * Significant domain keywords receive higher weight
   */
  private static KEYWORD_WEIGHTS: Record<string, number> = {
    vpm: 3.5,
    vcc: 3.5,
    ndmf: 3.5,
    modularavatar: 3.5,
    modular: 3.0,
    udon: 3.0,
    udonsharp: 3.0,
    shader: 2.5,
    avatar: 2.5,
    world: 2.0,
    gimmick: 2.5,
    tool: 3.0,
    plugin: 2.5,
    system: 2.0,
    prefab: 2.0,
    physbone: 2.5,
    editor: 2.5,
    animator: 2.5
  };

  /**
   * Computes the 64-bit SimHash fingerprint for given text
   */
  static compute(text: string): bigint {
    const tokens = this.tokenize(text);
    if (tokens.size === 0) return 0n;

    const v = new Int32Array(64);

    for (const [token, count] of tokens.entries()) {
      const h = this.hash64(token);
      const weight = (this.KEYWORD_WEIGHTS[token] || 1.0) * Math.min(count, 5);

      for (let i = 0; i < 64; i++) {
        const bit = (h >> BigInt(i)) & 1n;
        if (bit === 1n) {
          v[i] += weight;
        } else {
          v[i] -= weight;
        }
      }
    }

    let fingerprint = 0n;
    for (let i = 0; i < 64; i++) {
      if (v[i] > 0) {
        fingerprint |= 1n << BigInt(i);
      }
    }

    return fingerprint;
  }

  /**
   * Computes the bitwise Hamming distance between two 64-bit SimHash values
   */
  static hammingDistance(a: bigint, b: bigint): number {
    let x = a ^ b;
    let dist = 0;
    while (x > 0n) {
      dist += Number(x & 1n);
      x >>= 1n;
    }
    return dist;
  }

  /**
   * Returns true if two items are near-duplicates (Hamming distance <= threshold, default 3)
   */
  static isNearDuplicate(a: bigint, b: bigint, thresholdBits: number = 3): boolean {
    return this.hammingDistance(a, b) <= thresholdBits;
  }
}

/**
 * 4-Table Permutation Index for sub-millisecond near-duplicate querying
 * By Pigeonhole Principle: if distance <= 3 across 64 bits, at least one 16-bit block must match.
 */
export class SimHashIndex {
  private tables: [
    Map<number, Set<string>>,
    Map<number, Set<string>>,
    Map<number, Set<string>>,
    Map<number, Set<string>>
  ] = [new Map(), new Map(), new Map(), new Map()];

  private hashes: Map<string, bigint> = new Map();

  private extractBlocks(hash: bigint): [number, number, number, number] {
    const b0 = Number(hash & 0xffffn);
    const b1 = Number((hash >> 16n) & 0xffffn);
    const b2 = Number((hash >> 32n) & 0xffffn);
    const b3 = Number((hash >> 48n) & 0xffffn);
    return [b0, b1, b2, b3];
  }

  /**
   * Insert a document ID and its 64-bit SimHash into the index
   */
  insert(id: string, hash: bigint): void {
    this.hashes.set(id, hash);
    const blocks = this.extractBlocks(hash);
    for (let i = 0; i < 4; i++) {
      const key = blocks[i];
      if (!this.tables[i].has(key)) {
        this.tables[i].set(key, new Set());
      }
      this.tables[i].get(key)!.add(id);
    }
  }

  /**
   * Find all document IDs with Hamming distance <= maxDistance (default 3)
   */
  query(hash: bigint, maxDistance: number = 3): Array<{ id: string; distance: number }> {
    const blocks = this.extractBlocks(hash);
    const candidateIds = new Set<string>();

    for (let i = 0; i < 4; i++) {
      const bucket = this.tables[i].get(blocks[i]);
      if (bucket) {
        for (const id of bucket) {
          candidateIds.add(id);
        }
      }
    }

    const matches: Array<{ id: string; distance: number }> = [];
    for (const id of candidateIds) {
      const candidateHash = this.hashes.get(id);
      if (candidateHash !== undefined) {
        const dist = SimHash64.hammingDistance(hash, candidateHash);
        if (dist <= maxDistance) {
          matches.push({ id, distance: dist });
        }
      }
    }

    return matches.sort((a, b) => a.distance - b.distance);
  }

  get size(): number {
    return this.hashes.size;
  }
}
