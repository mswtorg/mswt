"use client";

import { useDeferredValue, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { markupToBlocks } from "@/lib/content/markup";
import type { ImageView } from "@/lib/media/view";
import { RichText } from "@/components/ui/RichText";
import { PhotoPicker, type LibraryItem, type PhotoPickerHandle } from "./PhotoPicker";
import { compactControl } from "./ui";

export type { LibraryItem } from "./PhotoPicker";

const tool =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle";

/** Set a textarea's value so React (and the form's "unsaved changes") notice it. */
function setValue(ta: HTMLTextAreaElement, value: string, selStart: number, selEnd = selStart) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, value);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus();
  ta.setSelectionRange(selStart, selEnd);
}

/**
 * Content text with a toolbar and a live preview (docs/spec.md §5, Step 8c). The text is posted
 * as-is and turned into blocks on the server (markupToBlocks), which reports errors by line.
 */
export function BlocksEditor({
  id,
  name,
  defaultValue,
  lang,
  error,
  describedBy,
  media,
  library,
}: {
  id: string;
  name: string;
  defaultValue: string;
  lang?: string;
  error?: string;
  describedBy?: string;
  media: Record<string, ImageView>;
  library: LibraryItem[];
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const imagePicker = useRef<PhotoPickerHandle>(null);
  const sliderPicker = useRef<PhotoPickerHandle>(null);
  const [text, setText] = useState(defaultValue);
  const deferred = useDeferredValue(text);
  const { blocks, errors } = markupToBlocks(deferred);
  const helpId = useId();
  const previewId = useId();

  const wrap = (before: string, after: string, placeholder: string) => {
    const el = ta.current!;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const inner = value.slice(s, e) || placeholder;
    setValue(
      el,
      value.slice(0, s) + before + inner + after + value.slice(e),
      s + before.length,
      s + before.length + inner.length,
    );
  };
  const prefixLines = (prefix: (i: number) => string) => {
    const el = ta.current!;
    const { selectionStart: s, selectionEnd: e, value } = el;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const lines = value.slice(start, e).split("\n");
    const next = lines.map((l, i) => prefix(i) + l.replace(/^(#{1,3} |- |\d+\. |>!? )/, "")).join("\n");
    setValue(el, value.slice(0, start) + next + value.slice(e), start + next.length);
  };
  const insertBlock = (block: string) => {
    const el = ta.current!;
    const { selectionEnd: e, value } = el;
    const before = value.slice(0, e).replace(/\s*$/, "");
    const insert = `${before ? "\n\n" : ""}${block}\n\n`;
    setValue(el, before + insert + value.slice(e).replace(/^\s*/, ""), before.length + insert.length);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "b") {
      e.preventDefault();
      wrap("**", "**", "bold text");
    } else if (e.key === "k") {
      e.preventDefault();
      wrap("[", "](https://)", "link text");
    }
  };

  return (
    // Side by side only when the form column is wide enough (container query), stacked otherwise.
    <div className="@container">
      <div className="grid gap-3 @3xl:grid-cols-2">
        <div className="grid content-start gap-2">
          <div role="group" aria-label="Formatting" className="flex flex-wrap gap-1.5">
            <button type="button" className={tool} onClick={() => prefixLines(() => "## ")}>
              Heading
            </button>
            <button type="button" className={tool} onClick={() => prefixLines(() => "### ")}>
              Subheading
            </button>
            <button type="button" className={tool} onClick={() => prefixLines(() => "- ")}>
              List
            </button>
            <button type="button" className={tool} onClick={() => prefixLines((i) => `${i + 1}. `)}>
              Numbered
            </button>
            <button type="button" className={tool} onClick={() => wrap("**", "**", "bold text")}>
              Bold <span className="ml-1 text-xs text-fg-muted">Ctrl+B</span>
            </button>
            <button type="button" className={tool} onClick={() => wrap("[", "](https://)", "link text")}>
              Link <span className="ml-1 text-xs text-fg-muted">Ctrl+K</span>
            </button>
            <button type="button" className={tool} onClick={() => prefixLines(() => "> ")}>
              Note
            </button>
            <button type="button" className={tool} onClick={() => prefixLines(() => ">! ")}>
              Warning
            </button>
            <button type="button" className={tool} onClick={() => imagePicker.current?.open()}>
              Insert image
            </button>
            <button type="button" className={tool} onClick={() => sliderPicker.current?.open()}>
              Insert slider
            </button>
          </div>
          <textarea
            ref={ta}
            id={id}
            name={name}
            lang={lang}
            rows={16}
            defaultValue={defaultValue}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            aria-invalid={error ? true : undefined}
            aria-describedby={[describedBy, helpId].filter(Boolean).join(" ")}
            spellCheck
            className={cn(
              compactControl,
              "font-mono text-sm leading-6",
              "aria-invalid:border-2 aria-invalid:border-status-error-fg-on-canvas",
            )}
          />
          <p id={helpId} className="m-0 text-xs text-fg-muted">
            Leave a blank line between paragraphs. Photos and sliders go on their own line.{" "}
            <code>## Heading</code>, <code>- list item</code>, <code>**bold**</code>,{" "}
            <code>[link](https://…)</code>, <code>&gt; note</code>, <code>&gt;! warning</code>.
          </p>
          <div aria-live="polite" className="empty:hidden">
            {errors.length ? (
              <ul className="m-0 grid gap-1 pl-5 text-sm text-status-error-fg-on-canvas">
                {errors.slice(0, 5).map((e) => (
                  <li key={`${e.line}-${e.message}`}>{e.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <section
          aria-labelledby={previewId}
          lang={lang}
          className="min-h-40 rounded-md border border-border-decorative bg-bg-subtle p-4"
        >
          <h3 id={previewId} className="mb-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            Preview
          </h3>
          {blocks.length ? (
            <RichText blocks={blocks} media={media} markMissing />
          ) : (
            <p className="m-0 text-sm text-fg-muted">Nothing written yet.</p>
          )}
        </section>
        <PhotoPicker
          ref={imagePicker}
          id={`${id}-image`}
          library={library}
          mode="single"
          title="Insert a photo"
          onPick={([photo]) => insertBlock(`![](media:${photo})`)}
        />
        <PhotoPicker
          ref={sliderPicker}
          id={`${id}-slider`}
          library={library}
          mode="multi"
          min={2}
          title="Insert a slider"
          onPick={(ids) => insertBlock(`!slider[](media:${ids.join(",")})`)}
        />
      </div>
    </div>
  );
}
