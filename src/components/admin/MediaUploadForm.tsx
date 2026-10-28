"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { ErrorSummary, FieldError, Hint, fieldControlProps } from "@/components/ui/Form";
import type { FormState } from "./form-state";
import { compactControl } from "./ui";
import { cn } from "@/lib/cn";
import { imagesFrom, shrink } from "@/lib/media/shrink";

export function MediaUploadForm({
  action,
  disabled,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  disabled?: string;
}) {
  const [state, run, pending] = useActionState(action, { status: "idle" } as FormState);
  const [preparing, setPreparing] = useState(false);
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const busy = pending || preparing;
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // A photo pasted (Ctrl/⌘+V) or dropped anywhere on the form goes into the file field.
  const take = (data: DataTransfer | null) => {
    const [file] = imagesFrom(data);
    if (!file || !fileInput.current) return false;
    const list = new DataTransfer();
    list.items.add(file.name ? file : new File([file], "pasted-photo.png", { type: file.type }));
    fileInput.current.files = list.files;
    setPasted(fileInput.current.files[0]?.name ?? null);
    return true;
  };

  useEffect(() => {
    if (state.status === "error") document.getElementById("upload-summary")?.focus();
  }, [state]);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- listens for a pasted or dropped photo only
    <form
      noValidate
      className={cn("grid gap-5 rounded-md", dragging && "outline-2 outline-offset-4 outline-focus-ring")}
      onPaste={(e) => {
        if (take(e.clipboardData)) e.preventDefault();
      }}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false);
        if (take(e.dataTransfer)) e.preventDefault();
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const file = form.get("file");
        setPreparing(true);
        try {
          if (file instanceof File && file.size) form.set("file", await shrink(file));
        } finally {
          setPreparing(false);
        }
        startTransition(() => run(form));
      }}
    >
      {disabled ? (
        <Alert tone="warning">
          <p>{disabled}</p>
        </Alert>
      ) : null}
      {Object.keys(errors).length ? (
        <ErrorSummary
          id="upload-summary"
          title="Please fix the following:"
          errors={Object.entries(errors).map(([name, message]) => ({ fieldId: `upload-${name}`, message }))}
        />
      ) : null}
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        <div className="grid content-start gap-1.5 sm:col-span-2">
          <label htmlFor="upload-file" className="text-sm font-medium text-fg-strong">
            Photo <span className="ml-1 text-xs font-normal text-fg-muted">(required)</span>
          </label>
          <input
            {...fieldControlProps("upload-file", { hint: "x", error: errors.file, required: true })}
            ref={fileInput}
            name="file"
            type="file"
            onChange={() => setPasted(null)}
            accept="image/jpeg,image/png,image/webp"
            className={compactControl}
          />
          {errors.file ? (
            <FieldError id="upload-file-error">{errors.file}</FieldError>
          ) : (
            <Hint id="upload-file-hint">
              JPEG, PNG or WebP. You can also paste a photo (Ctrl/⌘+V) or drop one on this form. Location and
              camera details are removed; web copies are made at 3 sizes.
            </Hint>
          )}
          {pasted ? (
            <p role="status" className="m-0 text-sm text-fg-muted">
              Pasted photo ready: {pasted}
            </p>
          ) : null}
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor="upload-alt" className="text-sm font-medium text-fg-strong">
            Alt text (English) <span className="ml-1 text-xs font-normal text-fg-muted">(required)</span>
          </label>
          <input
            {...fieldControlProps("upload-alt", { hint: "x", error: errors.alt, required: true })}
            name="alt"
            defaultValue={values.alt}
            maxLength={250}
            className={compactControl}
          />
          {errors.alt ? (
            <FieldError id="upload-alt-error">{errors.alt}</FieldError>
          ) : (
            <Hint id="upload-alt-hint">What the photo shows, for people who can’t see it.</Hint>
          )}
        </div>
        <div className="grid content-start gap-1.5">
          <label htmlFor="upload-caption" className="text-sm font-medium text-fg-strong">
            Caption (English)
          </label>
          <input
            id="upload-caption"
            name="caption"
            defaultValue={values.caption}
            maxLength={300}
            className={compactControl}
          />
        </div>
      </div>
      <div>
        <button
          type="submit"
          disabled={busy || Boolean(disabled)}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-action-primary-bg px-4 text-sm font-semibold text-action-primary-fg hover:bg-action-primary-bg-hover disabled:cursor-not-allowed disabled:bg-bg-muted disabled:text-fg-disabled"
        >
          {preparing ? "Preparing photo…" : pending ? "Uploading…" : "Upload photo"}
        </button>
      </div>
    </form>
  );
}
