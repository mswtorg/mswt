import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCAL_MEDIA_DIR } from "@/lib/storage/media";

export const dynamic = "force-dynamic";

/**
 * Local development only: serves photos and PDFs stored in .data/media when no R2 media bucket is set.
 * On Vercel (preview and production) photos come from the public bucket and this answers 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const notFound = () => new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  if (process.env.VERCEL_ENV) return notFound();
  const { key } = await params;
  const type = key.at(-1)?.endsWith(".webp")
    ? "image/webp"
    : key.at(-1)?.endsWith(".pdf")
      ? "application/pdf"
      : null;
  if (key.some((part) => part === ".." || part.includes("/")) || !type) return notFound();
  try {
    const body = await readFile(join(process.cwd(), LOCAL_MEDIA_DIR, ...key));
    return new Response(body, {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return notFound();
  }
}
