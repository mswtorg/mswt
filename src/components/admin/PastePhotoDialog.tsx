"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { uploadPastedPhotoAction } from "@/app/admin/(app)/content/actions";
import { pastedName, shrink } from "@/lib/media/shrink";
import type { LibraryItem } from "./PhotoPicker";
import { compactControl } from "./ui";

/**
 * The dialog's own fields are kept out of the page's form: they are not posted with it, and the
 * form's reset and "unsaved changes" check must ignore them. No element has this id.
 */
const NO_FORM = "paste-photo-controls";

type Pending = { file: File; preview: string; place: (item: LibraryItem) => void };

const tool =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle";

/**
 * Photos pasted or dropped into an admin field. Each one asks for its English alt text (every
 * library photo needs it), is uploaded to the media library like any other, and is then handed
 * to `place` so the field puts it where it was pasted. Several photos are asked about in turn.
 * Render `dialog` once in the component and call `paste(files, place)` from its paste/drop handlers.
 */
export function usePastePhoto(id: string): {
  paste: (files: File[], place: (item: LibraryItem) => void) => void;
  dialog: ReactNode;
} {
  const [queue, setQueue] = useState<Pending[]>([]);
  const paste = useCallback((files: File[], place: (item: LibraryItem) => void) => {
    if (!files.length) return;
    setQueue((q) => [...q, ...files.map((file) => ({ file, preview: URL.createObjectURL(file), place }))]);
  }, []);
  const next = useCallback((all = false) => {
    setQueue((q) => {
      for (const p of all ? q : q.slice(0, 1)) URL.revokeObjectURL(p.preview);
      return all ? [] : q.slice(1);
    });
  }, []);
  return {
    paste,
    dialog: (
      <PastePhotoDialog
        id={id}
        current={queue[0]}
        left={queue.length}
        onDone={(item) => {
          queue[0]?.place(item);
          next();
        }}
        onCancel={() => next(true)}
      />
    ),
  };
}

function PastePhotoDialog({
  id,
  current,
  left,
  onDone,
  onCancel,
}: {
  id: string;
  current: Pending | undefined;
  left: number;
  onDone: (item: LibraryItem) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (current && !d.open) d.showModal();
    if (!current && d.open) d.close();
  }, [current]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-border-decorative bg-bg-canvas p-5 text-fg-default shadow-md backdrop:bg-bg-inverse/60"
    >
      <h3 id={`${id}-title`} className="mb-1 text-lg">
        Describe this photo
      </h3>
      <p className="mt-0 mb-3 text-sm text-fg-muted">
        It is added to the media library and placed where you pasted it.
        {left > 1 ? ` ${left - 1} more after this one.` : ""}
      </p>
      {/* Keyed by the photo, so each one starts with empty fields. */}
      {current ? (
        <PhotoFields key={current.preview} id={id} current={current} onDone={onDone} onCancel={onCancel} />
      ) : null}
    </dialog>
  );
}

function PhotoFields({
  id,
  current,
  onDone,
  onCancel,
}: {
  id: string;
  current: Pending;
  onDone: (item: LibraryItem) => void;
  onCancel: () => void;
}) {
  const altInput = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<{ field: "file" | "alt"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (busy) return;
    if (alt.trim().length < 3) {
      setError({ field: "alt", message: "Describe the photo in a few words" });
      altInput.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const file = await shrink(current.file);
      const form = new FormData();
      form.set("file", new File([file], pastedName(file), { type: file.type }));
      form.set("alt", alt);
      form.set("caption", caption);
      const result = await uploadPastedPhotoAction(form);
      if (result.ok) return onDone(result.item);
      setError({ field: result.field, message: result.message });
    } catch {
      setError({ field: "file", message: "The upload failed. Check your connection and try again." });
    }
    setBusy(false);
  }

  const altError = error?.field === "alt" ? error.message : null;
  const fileError = error?.field === "file" ? error.message : null;

  return (
    <>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview of the pasted file
        <img
          src={current.preview}
          alt=""
          className="mb-4 max-h-56 w-full rounded-sm bg-bg-muted object-contain"
        />
      ) : null}
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-alt`} className="text-sm font-medium text-fg-strong">
            Alt text (English) <span className="ml-1 text-xs font-normal text-fg-muted">(required)</span>
          </label>
          <input
            ref={altInput}
            id={`${id}-alt`}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog opens to ask for this
            autoFocus
            form={NO_FORM}
            value={alt}
            maxLength={250}
            required
            aria-required="true"
            aria-invalid={altError ? true : undefined}
            aria-describedby={`${id}-alt-note`}
            onChange={(e) => setAlt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              void upload();
            }}
            className={compactControl}
          />
          <p
            id={`${id}-alt-note`}
            className={altError ? "m-0 text-sm text-status-error-fg-on-canvas" : "m-0 text-xs text-fg-muted"}
          >
            {altError ?? "What the photo shows, for people who can’t see it."}
          </p>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-caption`} className="text-sm font-medium text-fg-strong">
            Caption (English)
          </label>
          <input
            id={`${id}-caption`}
            form={NO_FORM}
            value={caption}
            maxLength={300}
            onChange={(e) => setCaption(e.target.value)}
            className={compactControl}
          />
        </div>
      </div>
      <p role="status" className="mt-3 mb-0 text-sm empty:hidden">
        {busy ? (
          "Uploading…"
        ) : fileError ? (
          <span className="text-status-error-fg-on-canvas">{fileError}</span>
        ) : null}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={tool} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void upload()}
          className="inline-flex min-h-9 items-center rounded-md bg-action-primary-bg px-3 text-sm font-semibold text-action-primary-fg hover:bg-action-primary-bg-hover disabled:bg-bg-muted disabled:text-fg-disabled"
        >
          {busy ? "Uploading…" : "Upload and insert"}
        </button>
      </div>
    </>
  );
}
