"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type LibraryItem = { id: string; label: string; thumb: string | null; alt: string | null };

export type PhotoPickerHandle = { open: () => void };

const tool =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle";

/**
 * Choose photos from the media library in a dialog. "single" returns one photo on click; "multi"
 * collects photos in the order clicked (numbered) and returns them with "Insert".
 * Rendered inside admin forms, so it uses plain buttons, never a nested <form method="dialog">.
 */
export const PhotoPicker = forwardRef<
  PhotoPickerHandle,
  {
    id: string;
    library: LibraryItem[];
    mode: "single" | "multi";
    title: string;
    min?: number;
    max?: number;
    onPick: (ids: string[]) => void;
  }
>(function PhotoPicker({ id, library, mode, title, min = 1, max = 20, onPick }, ref) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  useImperativeHandle(ref, () => ({
    open: () => {
      setChosen([]);
      dialog.current?.showModal();
    },
  }));
  const close = () => dialog.current?.close();
  const toggle = (photoId: string) => {
    if (mode === "single") {
      close();
      return onPick([photoId]);
    }
    setChosen((c) =>
      c.includes(photoId) ? c.filter((x) => x !== photoId) : c.length < max ? [...c, photoId] : c,
    );
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[min(44rem,calc(100vw-2rem))] rounded-lg border border-border-decorative bg-bg-canvas p-5 text-fg-default shadow-md backdrop:bg-bg-inverse/60"
    >
      <h3 id={`${id}-title`} className="mb-1 text-lg">
        {title}
      </h3>
      {mode === "multi" ? (
        <p className="mt-0 mb-3 text-sm text-fg-muted" aria-live="polite">
          {chosen.length} selected · choose {min}–{max}, in the order they should appear
        </p>
      ) : null}
      {library.length ? (
        <ul className="m-0 grid max-h-[60vh] list-none grid-cols-2 gap-3 overflow-y-auto p-0 sm:grid-cols-3">
          {library.map((m) => {
            const order = chosen.indexOf(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={mode === "multi" ? order >= 0 : undefined}
                  className={cn(
                    "relative grid w-full gap-1 rounded-md border p-2 text-left text-xs hover:bg-bg-subtle",
                    order >= 0 ? "border-2 border-action-primary-bg" : "border-border-input",
                  )}
                  onClick={() => toggle(m.id)}
                >
                  {order >= 0 ? (
                    <span className="absolute top-3 left-3 grid size-6 place-items-center rounded-full bg-action-primary-bg text-xs font-bold text-action-primary-fg">
                      {order + 1}
                    </span>
                  ) : null}
                  {m.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumb} alt="" className="aspect-[4/3] w-full rounded-sm object-cover" />
                  ) : (
                    <span className="aspect-[4/3] w-full rounded-sm bg-bg-muted" />
                  )}
                  <span className="font-medium text-fg-strong">{m.label}</span>
                  <span className="text-fg-muted">{m.alt ?? "No alt text in this language"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">No photos yet. Upload them under Content → Media first.</p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={tool} onClick={close}>
          Cancel
        </button>
        {mode === "multi" ? (
          <button
            type="button"
            disabled={chosen.length < min}
            className="inline-flex min-h-9 items-center rounded-md bg-action-primary-bg px-3 text-sm font-semibold text-action-primary-fg hover:bg-action-primary-bg-hover disabled:bg-bg-muted disabled:text-fg-disabled"
            onClick={() => {
              close();
              onPick(chosen);
            }}
          >
            Insert {chosen.length || ""} photos
          </button>
        ) : null}
      </div>
    </dialog>
  );
});
