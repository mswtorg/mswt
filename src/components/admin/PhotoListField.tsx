"use client";

import { useRef, useState } from "react";
import { PhotoPicker, type LibraryItem, type PhotoPickerHandle } from "./PhotoPicker";

const small =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle disabled:opacity-40";

/**
 * One photo (a cover) or an ordered list of photos (a slider/album) from the media library.
 * Posted as a hidden input of comma-separated ids; reordering uses ↑ ↓ buttons (no drag needed).
 */
export function PhotoListField({
  id,
  name,
  defaultValue,
  library,
  single = false,
  max = 20,
  describedBy,
  label,
}: {
  label: string;
  id: string;
  name: string;
  defaultValue: string;
  library: LibraryItem[];
  single?: boolean;
  max?: number;
  describedBy?: string;
}) {
  const [ids, setIds] = useState<string[]>(defaultValue.split(",").filter(Boolean));
  const hidden = useRef<HTMLInputElement>(null);
  const picker = useRef<PhotoPickerHandle>(null);
  const byId = new Map(library.map((m) => [m.id, m]));

  // Tell the surrounding form something changed ("You have unsaved changes").
  const update = (next: string[]) => {
    setIds(next);
    queueMicrotask(() => hidden.current?.dispatchEvent(new Event("change", { bubbles: true })));
  };
  const move = (i: number, d: number) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    update(next);
  };

  return (
    <div role="group" aria-label={label} className="grid gap-3" aria-describedby={describedBy}>
      <input ref={hidden} type="hidden" id={id} name={name} value={ids.join(",")} />
      {ids.length ? (
        <ol className="m-0 grid list-none gap-2 p-0">
          {ids.map((photoId, i) => {
            const m = byId.get(photoId);
            return (
              <li
                key={`${photoId}-${i}`}
                className="flex items-center gap-3 rounded-md border border-border-decorative p-2"
              >
                {m?.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.thumb} alt="" className="h-12 w-16 flex-none rounded-sm object-cover" />
                ) : (
                  <span className="h-12 w-16 flex-none rounded-sm bg-bg-muted" />
                )}
                <span className="grid min-w-0 flex-1 text-sm">
                  <span className="truncate font-medium text-fg-strong">
                    {single ? "" : `${i + 1}. `}
                    {m?.label ?? "Photo not found"}
                  </span>
                  <span className="truncate text-fg-muted">{m?.alt ?? "No alt text in English"}</span>
                </span>
                {!single ? (
                  <>
                    <button
                      type="button"
                      className={small}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Move photo ${i + 1} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={small}
                      disabled={i === ids.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Move photo ${i + 1} down`}
                    >
                      ↓
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className={small}
                  onClick={() => update(ids.filter((_, j) => j !== i))}
                  aria-label={`Remove photo ${single ? "" : i + 1}`.trim()}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="m-0 text-sm text-fg-muted">
          {single ? "No photo: a placeholder is shown." : "No photos yet."}
        </p>
      )}
      <div>
        <button
          type="button"
          className={small}
          disabled={!single && ids.length >= max}
          onClick={() => picker.current?.open()}
        >
          {single ? (ids.length ? "Change photo" : "Choose photo") : "Add photos"}
        </button>
      </div>
      <PhotoPicker
        ref={picker}
        id={`${id}-picker`}
        library={library.filter((m) => !ids.includes(m.id) || single)}
        mode={single ? "single" : "multi"}
        max={Math.max(1, max - ids.length)}
        title={single ? "Choose a photo" : "Add photos"}
        onPick={(picked) => update(single ? picked.slice(0, 1) : [...ids, ...picked].slice(0, max))}
      />
    </div>
  );
}
