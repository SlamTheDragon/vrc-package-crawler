import dns from "node:dns/promises";
import https from "node:https";
import { isPrivateOrReservedIp } from "../shared/ip_policy.ts";

const MAX_METADATA_BYTES = 2_000_000;

export class UnsafeMetadataTarget extends Error {}

type Address = { address: string; family: number };
type ResolveAddresses = (hostname: string) => Promise<Address[]>;

/** One HTTPS GET, bound to a checked DNS answer. Redirects are deliberately never followed. */
export async function fetchPublicMetadata(
  input: string | URL | Request,
  init: RequestInit = {},
  resolveAddresses: ResolveAddresses = (hostname) => dns.lookup(hostname, { all: true }),
  requestHttps: typeof https.request = https.request
): Promise<Response> {
  const target = new URL(input instanceof Request ? input.url : String(input));
  if (target.protocol !== "https:" || target.username || target.password || target.hash ||
      (target.port && target.port !== "443")) {
    throw new UnsafeMetadataTarget("Metadata target must be credential-free HTTPS on port 443");
  }
  if (init.method && init.method.toUpperCase() !== "GET") throw new UnsafeMetadataTarget("Metadata fetch must use GET");
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  if (hostname.endsWith(".")) throw new UnsafeMetadataTarget("Metadata target must use a canonical hostname");
  const addresses = await resolveAddresses(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new UnsafeMetadataTarget("Metadata target resolves to a private or reserved address");
  }
  const address = addresses[0];
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  headers.host = target.host;
  headers["accept-encoding"] = "identity";

  return new Promise<Response>((resolve, reject) => {
    const req = requestHttps({
      hostname: address.address, port: 443, servername: hostname,
      path: target.pathname + target.search, method: "GET", headers, signal: init.signal || undefined
    }, (res) => {
      const declared = Number(res.headers["content-length"] || 0);
      if (declared > MAX_METADATA_BYTES) {
        req.destroy(new Error("Metadata response exceeds 2 MB"));
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      res.on("data", (chunk: Buffer | Uint8Array) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += bytes.byteLength;
        if (received > MAX_METADATA_BYTES) {
          req.destroy(new Error("Metadata response exceeds 2 MB"));
          return;
        }
        chunks.push(bytes);
      });
      res.on("error", reject);
      res.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
          else if (value !== undefined) responseHeaders.set(name, String(value));
        }
        const status = res.statusCode || 502;
        const body = [204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks));
        resolve(new Response(body, { status, statusText: res.statusMessage, headers: responseHeaders }));
      });
    });
    req.on("error", reject);
    req.end();
  });
}
