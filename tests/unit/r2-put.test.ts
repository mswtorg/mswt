import { AwsClient } from "aws4fetch";
import { afterEach, describe, expect, it, vi } from "vitest";
import { r2Put } from "@/lib/storage/r2-put";

const client = new AwsClient({ accessKeyId: "k", secretAccessKey: "s", service: "s3", region: "auto" });
const url = "https://acct.r2.cloudflarestorage.com/bucket/media/x-640.webp";

afterEach(() => vi.unstubAllGlobals());

describe("r2Put", () => {
  it("sends the bytes on every attempt and retries 5xx with a fresh request", async () => {
    const seen: number[] = [];
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      seen.push((init.body as Uint8Array).byteLength);
      return new Response(null, { status: seen.length === 1 ? 503 : 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await r2Put(client, url, new Uint8Array(1234), { "content-type": "image/webp" });
    expect(seen).toEqual([1234, 1234]);
    const headers = new Headers(fetchMock.mock.calls[1]![1].headers);
    expect(headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256/);
  });

  it("doesn't retry a 4xx", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(r2Put(client, url, new Uint8Array(1), {})).rejects.toThrow(/failed \(403\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
