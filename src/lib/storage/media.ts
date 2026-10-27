import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AwsClient } from "aws4fetch";
import { serverEnv } from "@/env/server";
import { isProduction } from "@/lib/secrets";
import { r2Put } from "./r2-put";

/**
 * Public storage for website photos (Step 8c): a public R2 bucket, or `.data/media` served by
 * /media-local outside production. Files are immutable: a new upload gets a new id.
 */
export interface MediaStorage {
  readonly name: "r2" | "local";
  /** Public base URL for keys, e.g. https://media.example.org or /media-local. */
  readonly publicBase: string;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  /**
   * A short-lived URL the browser can PUT a file to directly (large PDFs skip Vercel's 4.5 MB
   * request limit). Null for local storage, where files go through the server instead.
   */
  presignPut(key: string, ttlSeconds?: number): Promise<string | null>;
  /** Size and first bytes of a stored file (to check an upload), or null if it isn't there. */
  inspect(key: string, firstBytes: number): Promise<{ bytes: number; start: Uint8Array } | null>;
}

class R2MediaStorage implements MediaStorage {
  readonly name = "r2" as const;
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(
    accountId: string,
    accessKeyId: string,
    secretAccessKey: string,
    bucket: string,
    readonly publicBase: string,
  ) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
    this.base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  }

  private url(key: string) {
    return `${this.base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await r2Put(this.client, this.url(key), body, {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
    });
  }

  async remove(key: string) {
    const res = await this.client.fetch(this.url(key), { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key} failed (${res.status})`);
  }

  async presignPut(key: string, ttlSeconds = 300) {
    const url = new URL(this.url(key));
    url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
    const signed = await this.client.sign(url.toString(), { method: "PUT", aws: { signQuery: true } });
    return signed.url;
  }

  async inspect(key: string, firstBytes: number) {
    const res = await this.client.fetch(this.url(key), { headers: { range: `bytes=0-${firstBytes - 1}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 GET ${key} failed (${res.status})`);
    // "bytes 0-4/1234567": the total size after the slash.
    const total = Number(
      res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length"),
    );
    return { bytes: total, start: new Uint8Array(await res.arrayBuffer()).slice(0, firstBytes) };
  }
}

export const LOCAL_MEDIA_DIR = ".data/media";

class LocalMediaStorage implements MediaStorage {
  readonly name = "local" as const;
  readonly publicBase = "/media-local";
  private path(key: string) {
    if (key.includes("..")) throw new Error("Bad storage key");
    return join(process.cwd(), LOCAL_MEDIA_DIR, key);
  }
  async put(key: string, body: Uint8Array) {
    await mkdir(dirname(this.path(key)), { recursive: true });
    await writeFile(this.path(key), body);
  }
  async remove(key: string) {
    await rm(this.path(key), { force: true });
  }
  async presignPut() {
    return null;
  }
  async inspect(key: string, firstBytes: number) {
    try {
      const { size } = await stat(this.path(key));
      const file = await open(this.path(key));
      const start = new Uint8Array(firstBytes);
      await file.read(start, 0, firstBytes, 0);
      await file.close();
      return { bytes: size, start };
    } catch {
      return null;
    }
  }
}

/** Null when the public bucket isn't set up yet in production (the admin says so). */
export function getMediaStorage(): MediaStorage | null {
  const e = serverEnv;
  if (
    e.R2_ACCOUNT_ID &&
    e.R2_ACCESS_KEY_ID &&
    e.R2_SECRET_ACCESS_KEY &&
    e.R2_MEDIA_BUCKET &&
    e.R2_MEDIA_PUBLIC_URL
  )
    return new R2MediaStorage(
      e.R2_ACCOUNT_ID,
      e.R2_ACCESS_KEY_ID,
      e.R2_SECRET_ACCESS_KEY,
      e.R2_MEDIA_BUCKET,
      e.R2_MEDIA_PUBLIC_URL,
    );
  if (e.VERCEL_ENV === "preview" || isProduction()) return null;
  return new LocalMediaStorage();
}
