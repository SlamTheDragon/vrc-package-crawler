import { dbV2, type MediaCacheRecord } from "../db_v2.ts";
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

export class ImageProxyService {
  private static readonly MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB strict socket limit

  /**
   * Fetches an image with zero-binary socket guardrail:
   * Rejects immediately if Content-Type is not image/* or size > 2MB.
   */
  public static async fetchImageBufferGuarded(imageUrl: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

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
          logger.warn(`[ImageProxy] Aborted download: Payload size ${length} exceeds 2MB limit: ${imageUrl}`);
          controller.abort();
          clearTimeout(timeoutId);
          return null;
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
            logger.warn(`[ImageProxy] Stream exceeded 2MB socket guardrail. Aborting: ${imageUrl}`);
            await reader.cancel();
            clearTimeout(timeoutId);
            return null;
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
   */
  public static async processAndCacheImage(imageUrl: string): Promise<MediaCacheRecord | null> {
    const existing = dbV2.query("SELECT * FROM media_cache_v2 WHERE source_url = ?;").get(imageUrl) as any;
    if (existing) {
      return existing as MediaCacheRecord;
    }

    const fetched = await this.fetchImageBufferGuarded(imageUrl);
    if (!fetched) return null;

    let webpData: Buffer | null = null;
    let blurhash: string | null = null;
    let phash64: string | null = null;
    let width = 480;
    let height = 270;

    try {
      // Dynamic import of sharp so standalone binaries without sharp native dlls don't crash
      let sharpModule: any = null;
      try {
        sharpModule = (await import("sharp")).default;
      } catch (_) {}

      if (sharpModule) {
        const img = sharpModule(fetched.buffer);
        // Transcode to WebP 480x270
        webpData = await img
          .clone()
          .resize(480, 270, { fit: "cover" })
          .webp({ quality: 75 })
          .toBuffer();

        // 32x32 raw RGB for BlurHash
        const { data: rawRgb } = await sharpModule(fetched.buffer)
          .resize(32, 32, { fit: "fill" })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        blurhash = computeBlurHash(rawRgb, 32, 32, 4, 3);

        // 32x32 grayscale for 64-bit pHash
        const { data: rawGray } = await sharpModule(fetched.buffer)
          .resize(32, 32, { fit: "fill" })
          .grayscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        phash64 = computePHash64(rawGray);
      } else {
        // Fallback when sharp native addon is absent: preserve raw buffer
        webpData = fetched.buffer;
        blurhash = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";
        phash64 = "0000000000000000";
      }
    } catch (err) {
      logger.warn(`[ImageProxy] Error during image transcoding: ${String(err)}`);
      webpData = fetched.buffer;
    }

    const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const record: MediaCacheRecord = {
      id,
      source_url: imageUrl,
      webp_data: webpData,
      webp_size_bytes: webpData?.length || 0,
      blurhash,
      phash_64: phash64,
      width,
      height,
      content_type: "image/webp",
      last_processed_at: now
    };

    try {
      dbV2.run(`
        INSERT OR REPLACE INTO media_cache_v2 (
          id, source_url, webp_data, webp_size_bytes, blurhash, phash_64,
          width, height, content_type, etag, last_processed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?);
      `, [
        record.id, record.source_url, record.webp_data, record.webp_size_bytes,
        record.blurhash, record.phash_64, record.width, record.height,
        record.content_type, record.last_processed_at
      ]);
      return record;
    } catch (err) {
      logger.error(`[ImageProxy] Failed to store media cache for ${imageUrl}`, err);
      return record;
    }
  }
}
