/**
 * sharp_worker.ts
 *
 * Standalone subprocess for image processing using Sharp.
 * The compiled binary cannot load Sharp's native addon directly.
 * This script is spawned via `bun run` (which has full node_modules access)
 * and communicates via newline-delimited JSON on stdin/stdout.
 *
 * Protocol:
 *   IN  (one JSON line):  { "id": string, "buffer_b64": string }
 *   OUT (one JSON line):  { "id": string, "ok": true, "webp_b64": string, "rgb_b64": string, "gray_b64": string, "srcW": number, "srcH": number }
 *               OR:  { "id": string, "rejected": true }
 *               OR:  { "id": string, "error": string }
 *   READY signal: { "ready": true }
 */

let sharpFn: any = null;
try {
  sharpFn = (await import("sharp")).default;
} catch (e: any) {
  process.stderr.write(`[SharpWorker] Failed to load sharp: ${e.message}\n`);
  process.exit(1);
}

// Signal ready to parent
process.stdout.write(JSON.stringify({ ready: true }) + "\n");

process.stdin.setEncoding("utf8");

let buffer = "";

process.stdin.on("data", async (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;
    let req: any;
    try {
      req = JSON.parse(line);
    } catch {
      continue;
    }

    const { id, buffer_b64 } = req;
    try {
      const imgBuf = Buffer.from(buffer_b64, "base64");

      const meta = await sharpFn(imgBuf).metadata();
      const srcW: number = meta.width || 0;
      const srcH: number = meta.height || 0;

      if (srcW > 0 && srcH > 0 && Math.min(srcW, srcH) < 200) {
        process.stdout.write(JSON.stringify({ id, rejected: true }) + "\n");
        continue;
      }

      const webpBuf: Buffer = await sharpFn(imgBuf)
        .resize(480, 270, { fit: "cover" })
        .webp({ quality: 75 })
        .toBuffer();

      const rgbResult = await sharpFn(imgBuf)
        .resize(32, 32, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const grayResult = await sharpFn(imgBuf)
        .resize(32, 32, { fit: "fill" })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      process.stdout.write(JSON.stringify({
        id,
        ok: true,
        webp_b64: webpBuf.toString("base64"),
        rgb_b64:  rgbResult.data.toString("base64"),
        gray_b64: grayResult.data.toString("base64"),
        srcW,
        srcH
      }) + "\n");
    } catch (err: any) {
      process.stdout.write(JSON.stringify({ id, error: err.message }) + "\n");
    }
  }
});

process.stdin.on("end", () => process.exit(0));
process.stdin.on("error", () => process.exit(0));
