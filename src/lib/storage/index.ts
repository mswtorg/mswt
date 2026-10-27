import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AwsClient } from "aws4fetch";
import { serverEnv } from "@/env/server";
import { isProduction } from "@/lib/secrets";
import { r2Put } from "./r2-put";

/** Private file storage for receipt PDFs: Cloudflare R2, or a local folder outside production. */
export interface ReceiptStorage {
  readonly name: "r2" | "local";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  /** Short-lived URL the browser can download from, or null to stream through the app. */
  signedUrl(key: string, filename: string, ttlSeconds?: number): Promise<string | null>;
}

class R2Storage implements ReceiptStorage {
  readonly name = "r2" as const;
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
    this.base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  }

  private url(key: string) {
    return `${this.base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await r2Put(this.client, this.url(key), body, { "content-type": contentType });
  }

  async get(key: string) {
    const res = await this.client.fetch(this.url(key));
    if (!res.ok) throw new Error(`R2 GET ${key} failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async signedUrl(key: string, filename: string, ttlSeconds = 600) {
    const url = new URL(this.url(key));
    url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
    url.searchParams.set("response-content-disposition", `attachment; filename="${filename}"`);
    const signed = await this.client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
    return signed.url;
  }
}

class LocalStorage implements ReceiptStorage {
  readonly name = "local" as const;
  private path(key: string) {
    if (key.includes("..")) throw new Error("Bad storage key");
    return join(process.cwd(), ".data/receipts", key);
  }
  async put(key: string, body: Uint8Array) {
    await mkdir(dirname(this.path(key)), { recursive: true });
    await writeFile(this.path(key), body);
  }
  async get(key: string) {
    return new Uint8Array(await readFile(this.path(key)));
  }
  async signedUrl() {
    return null;
  }
}

export function getReceiptStorage(): ReceiptStorage {
  const e = serverEnv;
  if (e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_RECEIPTS_BUCKET)
    return new R2Storage(e.R2_ACCOUNT_ID, e.R2_ACCESS_KEY_ID, e.R2_SECRET_ACCESS_KEY, e.R2_RECEIPTS_BUCKET);
  if (isProduction()) throw new Error("R2 is not configured (R2_* variables; see .env.example)");
  return new LocalStorage();
}
