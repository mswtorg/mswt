"use client";

import { useRef, useState } from "react";
import { compactControl } from "./ui";

export type MenuOption = { kind: "page" | "cause" | "news" | "event"; target: string; label: string };
export type MenuItemState = {
  kind: "page" | "cause" | "news" | "event" | "url";
  target: string;
  hidden: boolean;
  labels: Partial<Record<"en" | "hi" | "mr" | "gu", string>>;
};

const LANGS = [
  ["en", "English"],
  ["hi", "हिन्दी"],
  ["mr", "मराठी"],
  ["gu", "ગુજરાતી"],
] as const;
const KIND_LABEL = { page: "Page", cause: "Cause", news: "News", event: "Event", url: "Web link" } as const;
const small =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle disabled:opacity-40";

/**
 * Edits one menu: order (↑ ↓), show/hide, rename per language, remove, and add links to pages,
 * causes, news, events or web pages. Posted as JSON in a hidden "items" field.
 */
export function MenuEditor({ initial, options }: { initial: MenuItemState[]; options: MenuOption[] }) {
  const [items, setItems] = useState(initial);
  const [adding, setAdding] = useState("");
  const [url, setUrl] = useState("");
  const [urlLabel, setUrlLabel] = useState("");
  const hidden = useRef<HTMLInputElement>(null);

  const update = (next: MenuItemState[]) => {
    setItems(next);
    queueMicrotask(() => hidden.current?.dispatchEvent(new Event("change", { bubbles: true })));
  };
  const nameOf = (i: MenuItemState) =>
    i.kind === "url"
      ? i.target
      : (options.find((o) => o.kind === i.kind && o.target === i.target)?.label ?? i.target);
  const move = (n: number, d: number) => {
    const next = [...items];
    [next[n], next[n + d]] = [next[n + d]!, next[n]!];
    update(next);
  };
  const set = (n: number, patch: Partial<MenuItemState>) =>
    update(items.map((it, j) => (j === n ? { ...it, ...patch } : it)));

  return (
    <div className="grid gap-4">
      <input ref={hidden} type="hidden" name="items" value={JSON.stringify(items)} />
      {items.length ? (
        <ol className="m-0 grid list-none gap-2 p-0">
          {items.map((it, n) => (
            <li
              key={`${it.kind}-${it.target}-${n}`}
              className="grid gap-2 rounded-md border border-border-decorative p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-fg-strong">
                    {n + 1}. {it.labels.en || nameOf(it)}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {KIND_LABEL[it.kind]} · {it.kind === "url" ? it.target : nameOf(it)}
                    {it.hidden ? " · hidden" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className={small}
                  disabled={n === 0}
                  onClick={() => move(n, -1)}
                  aria-label={`Move link ${n + 1} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={small}
                  disabled={n === items.length - 1}
                  onClick={() => move(n, 1)}
                  aria-label={`Move link ${n + 1} down`}
                >
                  ↓
                </button>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={it.hidden}
                    onChange={(e) => set(n, { hidden: e.target.checked })}
                    className="size-4 accent-action-primary-bg"
                  />
                  Hide
                </label>
                <button
                  type="button"
                  className={small}
                  onClick={() => update(items.filter((_, j) => j !== n))}
                >
                  Remove
                </button>
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-link-default">
                  Rename in each language
                </summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {LANGS.map(([code, name]) => (
                    <label key={code} className="grid gap-1 text-sm">
                      <span className="font-medium text-fg-strong">{name}</span>
                      <input
                        lang={code}
                        value={it.labels[code] ?? ""}
                        maxLength={60}
                        placeholder={
                          it.kind === "url" ? "Required to show in this language" : "Built-in name"
                        }
                        onChange={(e) => set(n, { labels: { ...it.labels, [code]: e.target.value } })}
                        className={compactControl}
                      />
                    </label>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-sm text-fg-muted">No links: the built-in menu is shown.</p>
      )}
      <fieldset className="grid gap-3 rounded-md border border-border-decorative p-3">
        <legend className="px-1 text-sm font-semibold text-fg-strong">Add a link</legend>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-60 flex-1 gap-1 text-sm">
            <span className="font-medium text-fg-strong">Page, cause, news or event</span>
            <select value={adding} onChange={(e) => setAdding(e.target.value)} className={compactControl}>
              <option value="">Choose…</option>
              {(["page", "cause", "news", "event"] as const).map((k) => (
                <optgroup key={k} label={KIND_LABEL[k]}>
                  {options
                    .filter((o) => o.kind === k)
                    .map((o) => (
                      <option key={`${o.kind}:${o.target}`} value={`${o.kind}:${o.target}`}>
                        {o.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={small}
            disabled={!adding}
            onClick={() => {
              const [kind, target] = adding.split(/:(.*)/) as [MenuOption["kind"], string];
              update([...items, { kind, target, hidden: false, labels: {} }]);
              setAdding("");
            }}
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-48 flex-1 gap-1 text-sm">
            <span className="font-medium text-fg-strong">Web link</span>
            <input
              type="url"
              value={url}
              placeholder="https://…"
              onChange={(e) => setUrl(e.target.value)}
              className={compactControl}
            />
          </label>
          <label className="grid min-w-40 flex-1 gap-1 text-sm">
            <span className="font-medium text-fg-strong">Label (English)</span>
            <input
              value={urlLabel}
              maxLength={60}
              onChange={(e) => setUrlLabel(e.target.value)}
              className={compactControl}
            />
          </label>
          <button
            type="button"
            className={small}
            disabled={!/^https:\/\/\S+$/.test(url) || !urlLabel.trim()}
            onClick={() => {
              update([
                ...items,
                { kind: "url", target: url.trim(), hidden: false, labels: { en: urlLabel.trim() } },
              ]);
              setUrl("");
              setUrlLabel("");
            }}
          >
            Add link
          </button>
        </div>
      </fieldset>
    </div>
  );
}
