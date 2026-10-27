import type { AwsClient } from "aws4fetch";

/**
 * PUT a file to R2. aws4fetch's own retries resend a cloned request whose body is a stream, which
 * goes out without Content-Length and R2 refuses with 411. So: sign, send the bytes ourselves
 * (fetch sets Content-Length for a Uint8Array), and retry with a fresh request on 429/5xx.
 */
export async function r2Put(
  client: AwsClient,
  url: string,
  body: Uint8Array,
  headers: Record<string, string>,
  attempts = 3,
): Promise<void> {
  let status = 0;
  for (let i = 0; i < attempts; i++) {
    const signed = await client.sign(url, { method: "PUT", headers, body: body as BodyInit });
    const res = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: body as BodyInit });
    if (res.ok) return;
    status = res.status;
    if (status !== 429 && status < 500) break;
    await new Promise((r) => setTimeout(r, 300 * 2 ** i));
  }
  throw new Error(`R2 PUT ${new URL(url).pathname} failed (${status})`);
}
