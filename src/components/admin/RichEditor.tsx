"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { safeHref } from "@/lib/content/blocks";
import { blocksToMarkup, markupToBlocks } from "@/lib/content/markup";
import { blocksToDoc, docToBlocks } from "@/lib/content/rich";
import { imagesFrom } from "@/lib/media/shrink";
import type { ImageView } from "@/lib/media/view";
import { BlocksEditor } from "./BlocksEditor";
import { usePastePhoto } from "./PastePhotoDialog";
import { PhotoPicker, type LibraryItem, type PhotoPickerHandle } from "./PhotoPicker";
import { PhotoLookup, type PhotoInfo } from "./rich/cards";
import { richExtensions } from "./rich/extensions";
import { compactControl } from "./ui";

const tool =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle aria-pressed:border-action-primary-bg aria-pressed:bg-bg-subtle aria-pressed:text-fg-strong disabled:opacity-40";

// The document looks like the public page (RichText): same heading sizes, lists, links and notes.
const surface = cn(
  "grid min-h-60 content-start gap-4 rounded-md border border-border-input bg-bg-canvas p-4 text-base text-fg-default",
  "[&_h2]:mt-4 [&_h2]:text-2xl [&_h3]:mt-2 [&_h3]:text-xl [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_a]:text-link-default [&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-semibold",
  "[&_[data-callout]]:rounded-md [&_[data-callout]]:border-l-4 [&_[data-callout]]:p-3",
  "[&_[data-callout=info]]:border-status-info-icon [&_[data-callout=info]]:bg-status-info-bg [&_[data-callout=info]]:text-status-info-fg",
  "[&_[data-callout=warning]]:border-status-warning-icon [&_[data-callout=warning]]:bg-status-warning-bg [&_[data-callout=warning]]:text-status-warning-fg",
  "aria-invalid:border-2 aria-invalid:border-status-error-fg-on-canvas",
);

/** Set the posted field's value so the form's "unsaved changes" notices it. */
function post(field: HTMLTextAreaElement | null, value: string) {
  if (!field || field.value === value) return;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Content editor (docs/spec.md §5): **Visual** (what you see is what the page shows, the default)
 * or **Text** (the markup format, with preview). Either way the form posts the same text, which
 * the server turns into blocks (markupToBlocks) and validates, so nothing else changes.
 */
export function RichEditor({
  id,
  name,
  labelId,
  defaultValue,
  lang,
  error,
  describedBy,
  media,
  library,
}: {
  id: string;
  name: string;
  /** The field label's id (a contenteditable can't use <label for>). */
  labelId: string;
  defaultValue: string;
  lang?: string;
  error?: string;
  describedBy?: string;
  media: Record<string, ImageView>;
  library: LibraryItem[];
}) {
  const initial = markupToBlocks(defaultValue);
  // Saved text always parses; if it somehow doesn't, open the Text view so nothing is lost.
  const [mode, setMode] = useState<"visual" | "text">(initial.errors.length ? "text" : "visual");
  const [text, setText] = useState(defaultValue);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const imagePicker = useRef<PhotoPickerHandle>(null);
  const sliderPicker = useRef<PhotoPickerHandle>(null);
  const helpId = useId();
  // Photos pasted or dropped in (uploaded to the library on the way) join the library shown here.
  const [added, setAdded] = useState<LibraryItem[]>([]);
  const photos = [...added, ...library];
  const pasted = usePastePhoto(`${id}-paste`);
  const placePhotos = useRef<(files: File[], at: number) => void>(() => {});

  const editor = useEditor({
    extensions: richExtensions,
    content: blocksToDoc(initial.blocks),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        id: `${id}-visual`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        "aria-describedby": [describedBy, helpId].filter(Boolean).join(" "),
        ...(error ? { "aria-invalid": "true" } : {}),
        ...(lang ? { lang } : {}),
        spellcheck: "true",
        class: surface,
      },
      // A photo pasted or dropped (not text that comes with a picture of itself): ask for its alt
      // text, upload it, and put it where it was pasted or dropped.
      handlePaste: (view, event) => {
        const files = imagesFrom(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        placePhotos.current(files, view.state.selection.from);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = moved ? [] : imagesFrom(event.dataTransfer);
        if (!files.length) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        placePhotos.current(files, at ?? view.state.selection.from);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const markup = blocksToMarkup(docToBlocks(editor.getJSON()));
      setText(markup);
      post(field.current, markup);
    },
  });

  const openLink = () => {
    setHref(String(editor?.getAttributes("link").href ?? ""));
    setLinkError(null);
    setLinkOpen(true);
    queueMicrotask(() => linkInput.current?.focus());
  };

  // The form's Reset button puts the saved text back. React also resets the form after every
  // successful save, by which time the page has the newly saved text: use the latest, never the
  // text the page opened with (that would quietly undo the save, e.g. remove a photo just added).
  // The hidden field's defaultValue is that saved text (React keeps it current, and the browser's
  // own reset of the other fields uses it too).
  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    // The "reset" event fires before the browser resets the fields: rebuild the editor after it.
    const onReset = () =>
      setTimeout(() => {
        const saved = field.current?.defaultValue ?? "";
        const latest = markupToBlocks(saved);
        editor?.commands.setContent(blocksToDoc(latest.blocks), { emitUpdate: false });
        setText(saved);
        setMode(latest.errors.length ? "text" : "visual");
      });
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [editor]);

  useEffect(() => {
    placePhotos.current = (files, at) => {
      let first = true;
      pasted.paste(files, (item) => {
        setAdded((a) => [item, ...a]);
        if (!editor) return;
        // The first goes where it was pasted; the next ones follow it.
        const pos = first ? Math.min(at, editor.state.doc.content.size) : editor.state.selection.to;
        first = false;
        editor
          .chain()
          .focus()
          .insertContentAt(pos, { type: "photo", attrs: { mediaId: item.id, caption: "" } })
          .run();
      });
    };
  }, [editor, pasted]);

  const toVisual = () => {
    const { blocks, errors } = markupToBlocks(text);
    if (errors.length) {
      setSwitchError("Fix the problems listed under the text before switching to Visual.");
      return;
    }
    setSwitchError(null);
    editor?.commands.setContent(blocksToDoc(blocks), { emitUpdate: false });
    setMode("visual");
    post(field.current, text);
  };

  const lookup = (mediaId: string): PhotoInfo | undefined => {
    const item = photos.find((l) => l.id === mediaId);
    const view = media[mediaId];
    if (!item && !view) return undefined;
    return {
      thumb: item?.thumb ?? view?.src ?? null,
      label: item?.label ?? mediaId,
      alt: item?.alt ?? view?.alt ?? null,
    };
  };

  const applyLink = () => {
    const url = href.trim();
    if (!editor) return;
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (!safeHref(url)) {
      setLinkError("Use https://…, a site path like /en/causes, mailto: or tel:.");
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link"))
      chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
    else chain.setLink({ href: url }).run();
    setLinkOpen(false);
  };

  const block = (on: boolean, run: () => void) => ({ "aria-pressed": on, onClick: run });
  const e = editor;

  return (
    <div className="grid gap-2">
      <div role="group" aria-label="Editor view" className="flex gap-1.5">
        <button
          type="button"
          className={tool}
          aria-pressed={mode === "visual"}
          onClick={() => (mode === "text" ? toVisual() : undefined)}
        >
          Visual
        </button>
        <button
          type="button"
          className={tool}
          aria-pressed={mode === "text"}
          onClick={() => {
            setSwitchError(null);
            setMode("text");
          }}
        >
          Text
        </button>
      </div>
      <p aria-live="polite" className="m-0 text-sm text-status-error-fg-on-canvas empty:hidden">
        {switchError}
      </p>

      {mode === "text" ? (
        <BlocksEditor
          id={id}
          name={name}
          defaultValue={text}
          lang={lang}
          error={error}
          describedBy={describedBy}
          media={media}
          library={photos}
          onTextChange={setText}
          onPastePhotos={(files, place) =>
            pasted.paste(files, (item) => {
              setAdded((a) => [item, ...a]);
              place(item);
            })
          }
        />
      ) : null}
      {/* Stays mounted in Text view (hidden) so the visual document isn't rebuilt on every switch. */}
      <div hidden={mode === "text"} className="grid gap-2">
        <PhotoLookup.Provider value={lookup}>
          {/* What the form posts in Visual view, kept in step with the document. */}
          <textarea
            ref={field}
            id={mode === "visual" ? id : undefined}
            name={name}
            defaultValue={defaultValue}
            disabled={mode === "text"}
            hidden
            readOnly
          />
          {/* A mouse click on a button keeps focus (and the selection) in the text. */}
          <div
            role="toolbar"
            aria-label="Formatting"
            aria-controls={`${id}-visual`}
            className="flex flex-wrap gap-1.5"
            onMouseDown={(ev) => {
              if ((ev.target as HTMLElement).closest("button")) ev.preventDefault();
            }}
          >
            <button
              type="button"
              className={tool}
              {...block(Boolean(e?.isActive("paragraph")), () => e?.chain().focus().setParagraph().run())}
            >
              Paragraph
            </button>
            <button
              type="button"
              className={tool}
              {...block(Boolean(e?.isActive("heading", { level: 2 })), () =>
                e?.chain().focus().toggleHeading({ level: 2 }).run(),
              )}
            >
              Heading
            </button>
            <button
              type="button"
              className={tool}
              {...block(Boolean(e?.isActive("heading", { level: 3 })), () =>
                e?.chain().focus().toggleHeading({ level: 3 }).run(),
              )}
            >
              Subheading
            </button>
            <button
              type="button"
              className={tool}
              {...block(Boolean(e?.isActive("bold")), () => e?.chain().focus().toggleBold().run())}
            >
              Bold <span className="ml-1 text-xs text-fg-muted">Ctrl+B</span>
            </button>
            <button
              type="button"
              className={tool}
              aria-pressed={Boolean(e?.isActive("link"))}
              onClick={openLink}
            >
              Link <span className="ml-1 text-xs text-fg-muted">Ctrl+K</span>
            </button>
            <button
              type="button"
              className={tool}
              {...block(Boolean(e?.isActive("bulletList")), () =>
                e?.chain().focus().toggleBulletList().run(),
              )}
            >
              List
            </button>
            <button
              type="button"
              className={tool}
              {...block(Boolean(e?.isActive("orderedList")), () =>
                e?.chain().focus().toggleOrderedList().run(),
              )}
            >
              Numbered
            </button>
            {(["info", "warning"] as const).map((tone) => (
              <button
                key={tone}
                type="button"
                className={tool}
                {...block(Boolean(e?.isActive("callout", { tone })), () =>
                  e?.isActive("callout", { tone })
                    ? e.chain().focus().setParagraph().run()
                    : e?.chain().focus().setNode("callout", { tone }).run(),
                )}
              >
                {tone === "info" ? "Note" : "Warning"}
              </button>
            ))}
            <button type="button" className={tool} onClick={() => imagePicker.current?.open()}>
              Insert image
            </button>
            <button type="button" className={tool} onClick={() => sliderPicker.current?.open()}>
              Insert slider
            </button>
            <button
              type="button"
              className={tool}
              disabled={!e?.can().undo()}
              onClick={() => e?.chain().focus().undo().run()}
            >
              Undo
            </button>
            <button
              type="button"
              className={tool}
              disabled={!e?.can().redo()}
              onClick={() => e?.chain().focus().redo().run()}
            >
              Redo
            </button>
          </div>
          {linkOpen ? (
            <div
              role="group"
              aria-label="Link"
              className="flex flex-wrap items-end gap-2 rounded-md border border-border-decorative p-2"
            >
              <label className="grid min-w-60 flex-1 gap-1 text-sm">
                <span className="font-medium text-fg-strong">Link address</span>
                <input
                  ref={linkInput}
                  value={href}
                  placeholder="https://… or /en/causes"
                  onChange={(ev) => setHref(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      ev.preventDefault();
                      applyLink();
                    } else if (ev.key === "Escape") {
                      ev.preventDefault();
                      setLinkOpen(false);
                      e?.commands.focus();
                    }
                  }}
                  aria-invalid={linkError ? true : undefined}
                  aria-describedby={linkError ? `${id}-link-error` : undefined}
                  className={compactControl}
                />
              </label>
              <button type="button" className={tool} onClick={applyLink}>
                Apply
              </button>
              {e?.isActive("link") ? (
                <button
                  type="button"
                  className={tool}
                  onClick={() => {
                    e.chain().focus().extendMarkRange("link").unsetLink().run();
                    setLinkOpen(false);
                  }}
                >
                  Remove link
                </button>
              ) : null}
              <button
                type="button"
                className={tool}
                onClick={() => {
                  setLinkOpen(false);
                  e?.commands.focus();
                }}
              >
                Cancel
              </button>
              {linkError ? (
                <p id={`${id}-link-error`} className="m-0 w-full text-sm text-status-error-fg-on-canvas">
                  {linkError}
                </p>
              ) : null}
            </div>
          ) : null}
          {/* Ctrl/Cmd+K opens the link field, as in most editors (the key comes from the textbox inside). */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- listens for a shortcut only */}
          <div
            onKeyDown={(ev) => {
              if ((ev.metaKey || ev.ctrlKey) && ev.key === "k") {
                ev.preventDefault();
                openLink();
              }
            }}
          >
            <EditorContent editor={editor} />
          </div>
          <p id={helpId} className="m-0 text-xs text-fg-muted">
            Type as you would in a document. Paste from Word or Google Docs keeps headings, bold, lists and
            links. Photos come from the media library (Insert image), or paste or drop one where it should go.
          </p>
          <PhotoPicker
            ref={imagePicker}
            id={`${id}-image`}
            library={photos}
            mode="single"
            title="Insert a photo"
            onPick={([photo]) =>
              e
                ?.chain()
                .focus()
                .insertContent({ type: "photo", attrs: { mediaId: photo, caption: "" } })
                .run()
            }
          />
          <PhotoPicker
            ref={sliderPicker}
            id={`${id}-slider`}
            library={photos}
            mode="multi"
            min={2}
            title="Insert a slider"
            onPick={(ids) =>
              e
                ?.chain()
                .focus()
                .insertContent({ type: "slider", attrs: { mediaIds: ids, caption: "" } })
                .run()
            }
          />
        </PhotoLookup.Provider>
      </div>
      {pasted.dialog}
    </div>
  );
}
