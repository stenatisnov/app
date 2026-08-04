/**
 * Minimal S3-compatible REST client (PUT/GET-list/DELETE only, just enough
 * for the backup job) using `fetch` + Web Crypto for AWS Signature V4.
 * Deliberately not the `@aws-sdk/client-s3` package: it assumes a Node.js
 * environment and doesn't run cleanly in the Cloudflare Workers runtime,
 * which this app also deploys to. `fetch` and `crypto.subtle` are native
 * to both, so this works unmodified everywhere.
 *
 * Addressing: AWS S3 (no custom endpoint configured) uses virtual-hosted
 * style (`bucket.s3.region.amazonaws.com`). Any custom endpoint (R2, MinIO,
 * Backblaze, DigitalOcean Spaces, ...) uses path-style (`endpoint/bucket/key`)
 * instead, since path-style is the one addressing mode nearly every
 * S3-compatible provider supports without extra DNS/TLS setup.
 */

export type S3Config = {
  bucket: string;
  region: string;
  /** Custom S3-compatible endpoint host, no protocol (e.g. an R2/MinIO host); empty = AWS S3. */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return toHex(new Uint8Array(digest));
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

/** Strips an accidental "http(s)://" prefix and trailing slashes — easy to paste in from a provider's dashboard, but the URLs built below already supply the protocol. */
function normalizeEndpointHost(endpoint: string): string {
  return endpoint.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function isPathStyle(config: S3Config): boolean {
  return Boolean(config.endpoint.trim());
}

function hostFor(config: S3Config): string {
  return isPathStyle(config) ? normalizeEndpointHost(config.endpoint) : `${config.bucket}.s3.${config.region}.amazonaws.com`;
}

/** Canonical (already-encoded) request path, addressing-mode aware. `key` may be "" for bucket-root requests. */
function canonicalPath(config: S3Config, key: string): string {
  const encodedKey = key
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  if (isPathStyle(config)) {
    const bucket = encodeURIComponent(config.bucket);
    return key ? `/${bucket}/${encodedKey}` : `/${bucket}`;
  }
  return key ? `/${encodedKey}` : "/";
}

/** Builds the signed URL + headers for one S3 request (AWS Signature V4). */
async function signRequest(
  config: S3Config,
  method: string,
  key: string,
  query: string,
  bodyHash: string,
  date: Date,
): Promise<{ url: string; headers: Record<string, string> }> {
  const host = hostFor(config);
  const isoStamp = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const amzDate = isoStamp; // e.g. 20260804T123045Z
  const dateStamp = isoStamp.slice(0, 8); // e.g. 20260804
  const path = canonicalPath(config, key);

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, bodyHash].join("\n");
  const canonicalRequestHash = await sha256Hex(canonicalRequest);

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, canonicalRequestHash].join("\n");

  const kDate = await hmac(new TextEncoder().encode(`AWS4${config.secretAccessKey}`), dateStamp);
  const kRegion = await hmac(kDate, config.region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}${path}${query ? `?${query}` : ""}`,
    headers: {
      "x-amz-content-sha256": bodyHash,
      "x-amz-date": amzDate,
      authorization,
    },
  };
}

export async function s3PutObject(config: S3Config, key: string, body: Uint8Array, contentType: string): Promise<void> {
  const bodyHash = await sha256Hex(body);
  const { url, headers } = await signRequest(config, "PUT", key, "", bodyHash, new Date());
  const res = await fetch(url, { method: "PUT", headers: { ...headers, "content-type": contentType }, body: body as BodyInit });
  if (!res.ok) throw new Error(`S3 PUT ${key} failed: ${res.status} ${await res.text()}`);
}

/** Lists object keys under `prefix` (single page — fine for our low object counts). */
export async function s3ListObjectKeys(config: S3Config, prefix: string): Promise<string[]> {
  const bodyHash = await sha256Hex("");
  const query = `list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const { url, headers } = await signRequest(config, "GET", "", query, bodyHash, new Date());
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`S3 LIST ${prefix} failed: ${res.status} ${text}`);

  const keys: string[] = [];
  const re = /<Key>([^<]+)<\/Key>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    keys.push(match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
  }
  return keys;
}

export async function s3DeleteObject(config: S3Config, key: string): Promise<void> {
  const bodyHash = await sha256Hex("");
  const { url, headers } = await signRequest(config, "DELETE", key, "", bodyHash, new Date());
  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${key} failed: ${res.status} ${await res.text()}`);
}
