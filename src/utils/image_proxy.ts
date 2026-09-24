import fs from "fs";
import path from "path";
import { db, type MediaCacheRecord, type CrawlerDB } from "../db.ts";
import { logger } from "../logger.ts";
import { CONFIG } from "../config.ts";

// Base83 characters for BlurHash RFC specification
const BASE83_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";

export function encodeBase83(value: number, length: number): string {
  let result = "";
  for (let i = 1; i <= length; i++) {
    const digit = Math.floor(value / Math.pow(83, length - i)) % 83;
    result += BASE83_CHARS.charAt(digit);
  }
  return result;
}

/**
 * Calculates a standard BlurHash string for given RGB pixel data.
 */
export function computeBlurHash(
  pixels: Uint8Array | Buffer,
  width: number,
  height: number,
  componentX: number = 4,
  componentY: number = 3
): string {
  const factors: [number, number, number][] = [];

  for (let y = 0; y < componentY; y++) {
    for (let x = 0; x < componentX; x++) {
      const normalisation = x === 0 && y === 0 ? 1 : 2;
      let r = 0;
      let g = 0;
      let b = 0;

      for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
          const basis =
            Math.cos((Math.PI * x * px) / width) *
            Math.cos((Math.PI * y * py) / height);
          const idx = (py * width + px) * 3;
          r += basis * sRgbToLinear(pixels[idx]);
          g += basis * sRgbToLinear(pixels[idx + 1]);
          b += basis * sRgbToLinear(pixels[idx + 2]);
        }
      }

      const scale = normalisation / (width * height);
      factors.push([r * scale, g * scale, b * scale]);
    }
  }

  const dc = factors[0];
  const ac = factors.slice(1);

  let hash = "";
  const sizeFlag = (componentX - 1) + (componentY - 1) * 9;
  hash += encodeBase83(sizeFlag, 1);

  let maximumValue: number;
  if (ac.length > 0) {
    const actualMaximumValue = Math.max(
      ...ac.map(([r, g, b]) => Math.max(Math.abs(r), Math.abs(g), Math.abs(b)))
    );
    const quantisedMaximumValue = Math.max(
      0,
      Math.min(82, Math.floor(actualMaximumValue * 166 - 0.5))
    );
    maximumValue = (quantisedMaximumValue + 1) / 166;
    hash += encodeBase83(quantisedMaximumValue, 1);
  } else {
    maximumValue = 1;
    hash += encodeBase83(0, 1);
  }

  hash += encodeBase83(encodeDC(dc), 4);

  for (const factor of ac) {
    hash += encodeBase83(encodeAC(factor, maximumValue), 2);
  }

  return hash;
}

function sRgbToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearTosRgb(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return v <= 0.0031308
    ? Math.round(v * 12.92 * 255 + 0.5)
    : Math.round((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5);
}

function encodeDC([r, g, b]: [number, number, number]): number {
  return (linearTosRgb(r) << 16) + (linearTosRgb(g) << 8) + linearTosRgb(b);
}

function encodeAC([r, g, b]: [number, number, number], maximumValue: number): number {
  const quantR = Math.max(0, Math.min(18, Math.floor(signPow(r / maximumValue, 0.5) * 9 + 9.5)));
  const quantG = Math.max(0, Math.min(18, Math.floor(signPow(g / maximumValue, 0.5) * 9 + 9.5)));
  const quantB = Math.max(0, Math.min(18, Math.floor(signPow(b / maximumValue, 0.5) * 9 + 9.5)));
  return quantR * 19 * 19 + quantG * 19 + quantB;
}

function signPow(val: number, exp: number): number {
  return Math.sign(val) * Math.pow(Math.abs(val), exp);
}

/**
 * Computes 64-bit DCT perceptual hash (pHash) from 32x32 grayscale buffer.
 * Returns a 16-character hex string (e.g. "a3f5c1d84b2e90f6").
 */
export function computePHash64(grayscale32x32: Uint8Array | Buffer): string {
  const N = 32;
  const vals: number[][] = [];

  for (let y = 0; y < N; y++) {
    vals[y] = [];
    for (let x = 0; x < N; x++) {
      vals[y][x] = grayscale32x32[y * N + x];
    }
  }

  // 1D DCT on rows then columns (reduced to 8x8 low frequencies)
  const dct: number[][] = [];
  for (let u = 0; u < 8; u++) {
    dct[u] = [];
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          sum += vals[i][j] *
            Math.cos(((2 * i + 1) * u * Math.PI) / (2 * N)) *
            Math.cos(((2 * j + 1) * v * Math.PI) / (2 * N));
        }
      }
      const alphaU = u === 0 ? 1 / Math.sqrt(2) : 1;
      const alphaV = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u][v] = 0.25 * alphaU * alphaV * sum;
    }
  }

  // Compute average of 8x8 DCT excluding DC term [0][0]
  let total = 0;
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) continue;
      total += dct[u][v];
    }
  }
  const avg = total / 63;

  // Build 64-bit binary string
  let hexResult = "";
  let currentNibble = 0;
  let bitCount = 0;

  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      const bit = dct[u][v] > avg ? 1 : 0;
      currentNibble = (currentNibble << 1) | bit;
      bitCount++;
      if (bitCount === 4) {
        hexResult += currentNibble.toString(16);
        currentNibble = 0;
        bitCount = 0;
      }
    }
  }

  return hexResult.padStart(16, "0");
}

/**
 * Strips tracking query parameters, referral tags, and affiliate tokens to maintain
 * canonical creator traffic routing invariants.
 */
export function sanitizeOutboundUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const trackingParams = [
      "aff", "affiliate", "ref", "referrer", "tag", "partner",
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "fbclid", "gclid", "msclkid", "_ga"
    ];
    for (const p of trackingParams) {
      u.searchParams.delete(p);
    }
    // Remove trailing ? if no params remain
    const cleanHref = u.toString().replace(/\?$/, "");
    return cleanHref;
  } catch {
    return rawUrl;
  }
}

/**
 * Manages a persistent bun subprocess that handles all Sharp image processing.
 *
 * When the crawler runs as a compiled standalone binary, `import("sharp")` fails because
 * Bun's bundler cannot resolve the native `.node` addon at runtime. This class solves the
 * problem by spawning a separate `bun run sharp_worker.ts` child process that has full
 * access to node_modules, then communicating with it via newline-delimited JSON on
 * stdin/stdout.
 *
 * The worker process is started lazily on first use and kept alive for the duration of
 * the parent process. It is restarted automatically if it crashes.
 */
class SharpSubprocess {
  private static _instance: SharpSubprocess | null = null;
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private _stdin: import("bun").FileSink | null = null;
  private ready = false;
  private pendingCallbacks: Map<string, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map();
  private leftover = "";
  private workerScriptPath: string;
  private startFailures = 0;
  private lastFailureTime = 0;
  private readonly MAX_FAILURES = 3;
  private readonly COOLDOWN_MS = 60000; // 60s cooldown before retrying worker startup

  private constructor() {
    // Resolve sharp_worker.ts across project root, dist relative, and module dir
    const candidatePaths = [
      path.resolve(process.cwd(), "src/utils/sharp_worker.ts"),
      path.resolve(path.dirname(process.execPath), "../src/utils/sharp_worker.ts"),
      path.resolve(path.dirname(process.execPath), "src/utils/sharp_worker.ts"),
      path.resolve(import.meta.dir, "sharp_worker.ts"),
    ];
    let resolved = candidatePaths[0];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        resolved = p;
        break;
      }
    }
    this.workerScriptPath = resolved;
  }

  public static getInstance(): SharpSubprocess {
    if (!SharpSubprocess._instance) {
      SharpSubprocess._instance = new SharpSubprocess();
    }
    return SharpSubprocess._instance;
  }

  /** Ensure the subprocess is running and ready. Returns false if startup failed. */
  private async ensureRunning(): Promise<boolean> {
    if (this.proc && this.ready) return true;

    // If max failures reached, check if cooldown period has elapsed to allow recovery
    if (this.startFailures >= this.MAX_FAILURES) {
      if (Date.now() - this.lastFailureTime > this.COOLDOWN_MS) {
        logger.info("[SharpWorker] Failure cooldown expired. Resetting failure counter to retry worker startup.");
        this.startFailures = 0;
      } else {
        return false;
      }
    }

    try {
      this.ready = false;
      this.leftover = "";
      this.pendingCallbacks.clear();

      // Locate bun executable
      let bunExe = process.execPath.endsWith("bun") || process.execPath.endsWith("bun.exe")
        ? process.execPath
        : "bun";
      if (process.platform === "win32" && bunExe === "bun") {
        const standardBun = "F:\\dev_tools\\.bun\\bin\\bun.exe";
        if (fs.existsSync(standardBun)) {
          bunExe = standardBun;
        }
      }

      this.proc = Bun.spawn([bunExe, "run", this.workerScriptPath], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        cwd: path.dirname(path.dirname(this.workerScriptPath)),
      });

      const procStdout = this.proc.stdout as ReadableStream<Uint8Array>;
      const procStderr = this.proc.stderr as ReadableStream<Uint8Array>;
      const procStdin  = this.proc.stdin  as import("bun").FileSink;

      // Drain stderr to prevent blocking and log warnings
      (async () => {
        const reader = procStderr.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.length) {
            const txt = new TextDecoder().decode(value).trimEnd();
            logger.warn(`[SharpWorker:stderr] ${txt}`);
          }
        }
      })().catch(() => {});

      // Wire up stdout line reader
      (async () => {
        const reader = procStdout.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          this.leftover += new TextDecoder().decode(value);
          const lines = this.leftover.split("\n");
          this.leftover = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.ready) {
                this.ready = true;
                continue;
              }
              const cb = this.pendingCallbacks.get(msg.id);
              if (cb) {
                this.pendingCallbacks.delete(msg.id);
                cb.resolve(msg);
              }
            } catch { /* malformed line */ }
          }
        }
        // Process exited — mark not ready
        this.ready = false;
        this.proc = null;
        this._stdin = null;
        // Reject all pending with a crash error
        for (const [, cb] of this.pendingCallbacks) {
          cb.reject(new Error("SharpWorker process exited unexpectedly"));
        }
        this.pendingCallbacks.clear();
      })().catch(() => {});

      // Store stdin handle for later writes
      this._stdin = procStdin;

      // Wait up to 10s for the "ready" signal
      const started = await Promise.race([
        new Promise<boolean>((res) => {
          const poll = setInterval(() => {
            if (this.ready) { clearInterval(poll); res(true); }
          }, 50);
        }),
        new Promise<boolean>((res) => setTimeout(() => res(false), 10000)),
      ]);

      if (!started) {
        this.startFailures++;
        this.lastFailureTime = Date.now();
        logger.warn(`[SharpWorker] Worker did not become ready within 10s (attempt ${this.startFailures}/${this.MAX_FAILURES})`);
        this.proc?.kill();
        this.proc = null;
        return false;
      }

      this.startFailures = 0;
      logger.info("[SharpWorker] Subprocess ready");
      return true;
    } catch (err) {
      this.startFailures++;
      this.lastFailureTime = Date.now();
      logger.warn(`[SharpWorker] Failed to start worker: ${String(err)}`);
      this.proc = null;
      return false;
    }
  }

  /**
   * Send an image buffer to the worker for processing.
   * Returns the parsed response or null on failure.
   */
  public async process(imageBuffer: Buffer): Promise<{
    ok: boolean;
    rejected?: boolean;
    webp_b64?: string;
    rgb_b64?: string;
    gray_b64?: string;
    srcW?: number;
    srcH?: number;
    error?: string;
  } | null> {
    const running = await this.ensureRunning();
    if (!running || !this._stdin) return null;

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify({ id, buffer_b64: imageBuffer.toString("base64") }) + "\n";

    return new Promise((resolve, reject) => {
      try {
        this._stdin!.write(new TextEncoder().encode(payload));
        this._stdin!.flush();
      } catch (err) {
        reject(err);
        return;
      }

      // Register callback after write succeeds
      this.pendingCallbacks.set(id, { resolve, reject });

      // 15-second per-request timeout
      const timer = setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          reject(new Error(`SharpWorker timeout for request ${id}`));
        }
      }, 15000);

      // Wrap resolve/reject to clear timer on resolution
      const origEntry = this.pendingCallbacks.get(id)!;
      this.pendingCallbacks.set(id, {
        resolve: (v) => { clearTimeout(timer); origEntry.resolve(v); },
        reject:  (e) => { clearTimeout(timer); origEntry.reject(e); }
      });
    });
  }

  /** Gracefully shut down the worker process. */
  public shutdown(): void {
    if (this.proc) {
      try { this.proc.kill(); } catch {}
      this.proc = null;
      this._stdin = null;
      this.ready = false;
    }
  }

  public static shutdown(): void {
    if (SharpSubprocess._instance) {
      SharpSubprocess._instance.shutdown();
      SharpSubprocess._instance = null;
    }
  }
}

export class ImageProxyService {
  public static readonly MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB limit (accommodates animated GIFs and high-res store previews)

  /**
   * Fetches an image with zero-binary socket guardrail:
   * Rejects immediately if Content-Type is not image/* or size > 10MB.
   */
  public static async fetchImageBufferGuarded(imageUrl: string): Promise<{
    buffer: Buffer;
    contentType: string;
    oversized?: boolean;
    reportedLength?: number;
  } | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": CONFIG.userAgent,
          "Accept": "image/webp,image/png,image/jpeg,image/*;q=0.8"
        }
      });

      if (!resp.ok) {
        clearTimeout(timeoutId);
        return null;
      }

      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) {
        logger.warn(`[ImageProxy] Rejected non-image payload (${contentType}): ${imageUrl}`);
        controller.abort();
        clearTimeout(timeoutId);
        return null;
      }

      const contentLengthStr = resp.headers.get("content-length");
      if (contentLengthStr) {
        const length = parseInt(contentLengthStr, 10);
        if (length > this.MAX_PAYLOAD_BYTES) {
          logger.warn(`[ImageProxy] Aborted download: Payload size ${length} exceeds 10MB limit: ${imageUrl} (indexing source)`);
          controller.abort();
          clearTimeout(timeoutId);
          return { buffer: Buffer.alloc(0), contentType, oversized: true, reportedLength: length };
        }
      }

      if (!resp.body) {
        clearTimeout(timeoutId);
        return null;
      }

      const reader = resp.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > this.MAX_PAYLOAD_BYTES) {
            logger.warn(`[ImageProxy] Stream exceeded 10MB socket guardrail. Aborting: ${imageUrl} (indexing source)`);
            await reader.cancel();
            clearTimeout(timeoutId);
            return { buffer: Buffer.alloc(0), contentType, oversized: true, reportedLength: totalBytes };
          }
          chunks.push(value);
        }
      }

      clearTimeout(timeoutId);
      const fullBuffer = Buffer.concat(chunks);
      return { buffer: fullBuffer, contentType };
    } catch (err) {
      return null;
    }
  }

  /**
   * Processes an image into WebP (480x270, quality 75), BlurHash, and 64-bit pHash.
   * If the image exceeds payload thresholds or contains unsupported formats, the
   * source URL is still indexed with null webp_data to avoid HOL blocking.
   */
  public static async processAndCacheImage(imageUrl: string, customDb?: CrawlerDB): Promise<MediaCacheRecord | null> {
    const targetDb = customDb || db;
    const cleanUrl = sanitizeOutboundUrl(imageUrl);
    const existing = targetDb.query("SELECT * FROM media_cache WHERE source_url = ?;").get(cleanUrl) as any;
    if (existing) {
      return existing as MediaCacheRecord;
    }

    const fetched = await this.fetchImageBufferGuarded(cleanUrl);
    if (!fetched) return null;

    const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // If payload was oversized (>10MB), record source URL directly without binary payload
    if (fetched.oversized) {
      const record: MediaCacheRecord = {
        id,
        source_url: cleanUrl,
        blurhash: null,
        phash_64: null,
        width: 0,
        height: 0,
        content_type: fetched.contentType || "image/*",
        last_processed_at: now
      };
      try {
        targetDb.run(`
          INSERT OR REPLACE INTO media_cache (
            id, source_url, blurhash, phash_64,
            width, height, content_type, etag, last_processed_at
          ) VALUES (?, ?, NULL, NULL, 0, 0, ?, NULL, ?);
        `, [record.id, record.source_url, record.content_type, record.last_processed_at]);
        logger.info(`[ImageProxy] Indexed oversized image as source-only: ${cleanUrl} (${fetched.reportedLength || 0} bytes)`);
        return record;
      } catch (err) {
        logger.error(`[ImageProxy] Failed to store oversized media cache for ${cleanUrl}`, err);
        return record;
      }
    }

    let webpData: Buffer | null = null;
    let blurhash: string | null = null;
    let phash64: string | null = null;
    const width = 480;
    const height = 270;

    try {
      // Attempt 1: direct import (works in dev / bun run mode)
      let sharpModule: any = null;
      try {
        sharpModule = (await import("sharp")).default;
      } catch (_) {}

      if (sharpModule) {
        // ── In-process path (bun run / dev) ──────────────────────────────────
        const meta = await sharpModule(fetched.buffer).metadata();
        const srcW = meta.width || 0;
        const srcH = meta.height || 0;
        if (srcW > 0 && srcH > 0 && Math.min(srcW, srcH) < 200) {
          logger.debug(`[ImageProxy] Rejecting icon-sized image (${srcW}x${srcH}): ${cleanUrl}`);
          return null;
        }

        webpData = await sharpModule(fetched.buffer)
          .resize(480, 270, { fit: "cover" })
          .webp({ quality: 75 })
          .toBuffer();

        const { data: rawRgb } = await sharpModule(fetched.buffer)
          .resize(32, 32, { fit: "fill" })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        blurhash = computeBlurHash(rawRgb, 32, 32, 4, 3);

        const { data: rawGray } = await sharpModule(fetched.buffer)
          .resize(32, 32, { fit: "fill" })
          .grayscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        phash64 = computePHash64(rawGray);

      } else {
        // ── Subprocess path (compiled binary) ────────────────────────────────
        // Sharp's native .node addon cannot be resolved inside a Bun standalone binary.
        // Delegate to the SharpSubprocess worker which runs via `bun run` and has full
        // access to node_modules.
        logger.debug(`[ImageProxy] Sharp not available in-process, delegating to subprocess worker: ${cleanUrl}`);
        const worker = SharpSubprocess.getInstance();
        const result = await worker.process(fetched.buffer);

        if (!result) {
          logger.warn(`[ImageProxy] SharpWorker returned null for: ${cleanUrl}`);
          return null;
        }
        if (result.rejected) {
          logger.debug(`[ImageProxy] SharpWorker rejected icon-sized image: ${cleanUrl}`);
          return null;
        }
        if (result.error) {
          logger.warn(`[ImageProxy] SharpWorker error for ${cleanUrl}: ${result.error}`);
          // Format/decode error from worker — index source-only so we don't spin indefinitely
          const record: MediaCacheRecord = {
            id,
            source_url: cleanUrl,
            blurhash: null,
            phash_64: null,
            width: 0,
            height: 0,
            content_type: fetched.contentType || "image/*",
            last_processed_at: now
          };
          targetDb.run(`
            INSERT OR REPLACE INTO media_cache (
              id, source_url, blurhash, phash_64,
              width, height, content_type, etag, last_processed_at
            ) VALUES (?, ?, NULL, NULL, 0, 0, ?, NULL, ?);
          `, [record.id, record.source_url, record.content_type, record.last_processed_at]);
          return record;
        }
        if (!result.ok || !result.webp_b64 || !result.rgb_b64 || !result.gray_b64) {
          logger.warn(`[ImageProxy] SharpWorker returned incomplete result for: ${cleanUrl}`);
          return null;
        }

        webpData  = Buffer.from(result.webp_b64,  "base64");
        const rawRgb  = Buffer.from(result.rgb_b64,  "base64");
        const rawGray = Buffer.from(result.gray_b64, "base64");
        blurhash = computeBlurHash(rawRgb, 32, 32, 4, 3);
        phash64  = computePHash64(rawGray);
      }
    } catch (err) {
      logger.warn(`[ImageProxy] Error during image transcoding: ${String(err)}`);
      // Index source URL so unprocessable formats do not stall the pipeline in an infinite loop
      const record: MediaCacheRecord = {
        id,
        source_url: cleanUrl,
        blurhash: null,
        phash_64: null,
        width: 0,
        height: 0,
        content_type: fetched.contentType || "image/*",
        last_processed_at: now
      };
      try {
        targetDb.run(`
          INSERT OR REPLACE INTO media_cache (
            id, source_url, blurhash, phash_64,
            width, height, content_type, etag, last_processed_at
          ) VALUES (?, ?, NULL, NULL, 0, 0, ?, NULL, ?);
        `, [record.id, record.source_url, record.content_type, record.last_processed_at]);
        return record;
      } catch (_) {
        return null;
      }
    }

    const record: MediaCacheRecord = {
      id,
      source_url: cleanUrl,
      blurhash,
      phash_64: phash64,
      width,
      height,
      content_type: "image/webp",
      last_processed_at: now
    };

    try {
      targetDb.run(`
        INSERT OR REPLACE INTO media_cache (
          id, source_url, blurhash, phash_64,
          width, height, content_type, etag, last_processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?);
      `, [
        record.id, record.source_url,
        record.blurhash, record.phash_64, record.width, record.height,
        record.content_type, record.last_processed_at
      ]);
      return record;
    } catch (err) {
      logger.error(`[ImageProxy] Failed to store media cache for ${cleanUrl}`, err);
      return record;
    }
  }

  /**
   * Indexes pending images for canonical packages that currently lack a media_id.
   *
   * Systematically queries packages where media_id IS NULL, inspects package media_urls_json
   * and constituent entities for valid image candidates, processes and caches the image,
   * and updates canonical_packages. If a package has no candidate images, media_id is
   * set to 'none' to permanently prevent head-of-line blocking.
   */
  public static async indexPendingMedia(limit: number = 25, customDb?: CrawlerDB): Promise<number> {
    const targetDb = customDb || db;
    try {
      const pendingPackages = targetDb.rawDb.prepare(`
        SELECT canonical_id, source_ids_json, media_urls_json
        FROM canonical_packages
        WHERE media_id IS NULL
        ORDER BY rowid ASC
        LIMIT ?;
      `).all(limit * 2) as any[];

      if (pendingPackages.length === 0) return 0;

      // Known icon/logo/favicon and video embed URL patterns to skip (quality filter at URL level)
      const skipPatterns = [
        /\/favicon\./i, /\/icon[s]?\./i, /\/logo[s]?\./i,
        /\/user-profile\//i, /\/avatar\//i, /\/a\/[^/]+\.(png|jpg|gif|webp)$/i,
        /[?&]s=(\d+)(&|$)/, // GitHub avatar size param — raw avatars are square icons
        /opengraph\.githubassets\.com/, // exclude GitHub OG cards from WebP download
        /youtube\.com\/embed\//i,
        /youtu\.be\//i,
        /vimeo\.com\//i
      ];

      let indexedCount = 0;

      for (const pkg of pendingPackages) {
        if (indexedCount >= limit) break;

        // 1. Check if package already has candidate URLs in media_urls_json
        const candidates: string[] = [];
        if (pkg.media_urls_json) {
          try {
            const arr = JSON.parse(pkg.media_urls_json);
            if (Array.isArray(arr)) {
              for (const u of arr) {
                if (typeof u === "string" && u.startsWith("http") && !candidates.includes(u)) {
                  candidates.push(u);
                }
              }
            }
          } catch (_) {}
        }

        // 2. If no candidates from package, inspect constituent entities
        let sourceIds: string[] = [];
        try { sourceIds = JSON.parse(pkg.source_ids_json || "[]"); } catch (_) {}

        if (candidates.length === 0 && sourceIds.length > 0) {
          const placeholders = sourceIds.map(() => "?").join(",");
          const entitiesWithRaw = targetDb.rawDb.prepare(`
            SELECT raw_json FROM entities WHERE id IN (${placeholders})
          `).all(...sourceIds) as any[];

          for (const ent of entitiesWithRaw) {
            try {
              const raw = JSON.parse(ent.raw_json || "{}");
              if (raw.thumbnail_url && typeof raw.thumbnail_url === "string" && raw.thumbnail_url.startsWith("http")) {
                if (!candidates.includes(raw.thumbnail_url)) candidates.push(raw.thumbnail_url);
              }
              if (Array.isArray(raw.media_urls)) {
                for (const mu of raw.media_urls) {
                  if (typeof mu === "string" && mu.startsWith("http") && !candidates.includes(mu)) {
                    candidates.push(mu);
                  }
                }
              }
            } catch (_) {}
          }
        }

        // 3. Filter candidate URLs
        const validUrls = candidates
          .map((c) => sanitizeOutboundUrl(c))
          .filter((u) => !skipPatterns.some((p) => p.test(u)));

        if (validUrls.length === 0) {
          // No media candidate exists for this package — mark as 'none' to prevent HOL blocking
          targetDb.run(`
            UPDATE canonical_packages
            SET media_id = 'none'
            WHERE canonical_id = ?;
          `, [pkg.canonical_id]);
          continue;
        }

        // 4. Try to link to existing cached media or process new candidate
        let assignedMediaId: string | null = null;
        for (const candidateUrl of validUrls) {
          const existing = targetDb.query("SELECT id FROM media_cache WHERE source_url = ? LIMIT 1;").get(candidateUrl) as any;
          if (existing?.id) {
            assignedMediaId = existing.id;
            break;
          }
        }

        if (!assignedMediaId) {
          // Process first valid candidate URL
          const selectedUrl = validUrls[0];
          const mediaRecord = await this.processAndCacheImage(selectedUrl, targetDb);
          if (mediaRecord) {
            assignedMediaId = mediaRecord.id;
          }
        }

        if (assignedMediaId) {
          targetDb.run(`
            UPDATE canonical_packages
            SET media_id = ?
            WHERE canonical_id = ?;
          `, [assignedMediaId, pkg.canonical_id]);
          indexedCount++;
        }
      }

      if (indexedCount > 0) {
        logger.info(`[ImageProxy] Indexed ${indexedCount} proxy images for canonical packages.`);
      }
      return indexedCount;
    } catch (err) {
      logger.error("[ImageProxy] Error during batch media indexation", err);
      return 0;
    }
  }

  public static shutdown(): void {
    SharpSubprocess.shutdown();
  }
}

