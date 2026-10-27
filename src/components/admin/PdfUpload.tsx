"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { compactControl } from "./ui";

type Start = (
  filename: string,
  bytes: number,
) => Promise<{ ok: true; key: string; url: string | null } | { ok: false; message: string }>;
type Done = { ok: boolean; message: string };

const MAX = 25 * 1024 * 1024;

/**
 * Uploads a PDF: straight from the browser to the public bucket with a short-lived signed URL
 * (so large reports skip Vercel's request limit), then asks the server to check and attach it.
 * Locally the file is posted to the server instead.
 */
export function PdfUpload({
  start,
  finish,
  throughServer,
  disabled,
}: {
  start: Start;
  finish: (key: string, filename: string) => Promise<Done>;
  throughServer: (form: FormData) => Promise<Done>;
  disabled?: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Done | null>(null);

  async function upload() {
    if (!file) return;
    setResult(null);
    if (file.size > MAX) return setResult({ ok: false, message: "The PDF is too large (25 MB at most)." });
    setBusy(true);
    try {
      const s = await start(file.name, file.size);
      if (!s.ok) return setResult(s);
      let done: Done;
      if (s.url) {
        const put = await fetch(s.url, {
          method: "PUT",
          body: file,
          headers: { "content-type": "application/pdf" },
        });
        done = put.ok
          ? await finish(s.key, file.name)
          : { ok: false, message: `The upload was refused (${put.status}). Check the bucket's CORS rule.` };
      } else {
        const form = new FormData();
        form.set("file", file);
        done = await throughServer(form);
      }
      setResult(done);
      if (done.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "The upload failed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {disabled ? (
        <Alert tone="warning">
          <p>{disabled}</p>
        </Alert>
      ) : null}
      <div className="grid gap-1.5">
        <label htmlFor="pdf-file" className="text-sm font-medium text-fg-strong">
          PDF file
        </label>
        <input
          id="pdf-file"
          type="file"
          accept="application/pdf"
          aria-describedby="pdf-hint"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className={compactControl}
        />
        <p id="pdf-hint" className="m-0 text-sm text-fg-hint">
          Up to 25 MB. It is public once the document is published.
        </p>
      </div>
      <div>
        <button
          type="button"
          onClick={upload}
          disabled={!file || busy || Boolean(disabled)}
          className="inline-flex min-h-10 items-center rounded-md bg-action-primary-bg px-4 text-sm font-semibold text-action-primary-fg hover:bg-action-primary-bg-hover disabled:bg-bg-muted disabled:text-fg-disabled"
        >
          {busy ? "Uploading…" : "Upload PDF"}
        </button>
      </div>
      <div aria-live="polite">
        {result ? (
          <Alert tone={result.ok ? "success" : "error"}>
            <p>{result.message}</p>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
