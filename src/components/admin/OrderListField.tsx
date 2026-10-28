"use client";

import { useRef, useState } from "react";
import { moveItem } from "@/lib/admin/order";
import { useDragSort } from "./useDragSort";

const small =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle disabled:opacity-40";

/**
 * A fixed set of items put in order by dragging (or ↑ ↓), e.g. the Home sections. Posted as a hidden
 * input of comma-separated values. With `hiddenName`, each item also has a "Show" switch; the items
 * switched off are posted comma-separated under that name and keep their place in the list.
 * Items are keyed by value, so focus stays on the moved item.
 */
export function OrderListField({
  id,
  name,
  label,
  defaultValue,
  items,
  hiddenName,
  hiddenDefault = "",
  describedBy,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  items: { value: string; label: string }[];
  hiddenName?: string;
  hiddenDefault?: string;
  describedBy?: string;
}) {
  const labels = new Map(items.map((i) => [i.value, i.label]));
  const [order, setOrder] = useState<string[]>(() => {
    const saved = defaultValue.split(",").filter((v) => labels.has(v));
    return [...saved, ...items.map((i) => i.value).filter((v) => !saved.includes(v))];
  });
  const [off, setOff] = useState<string[]>(() => hiddenDefault.split(",").filter((v) => labels.has(v)));
  const [status, setStatus] = useState("");
  const hidden = useRef<HTMLInputElement>(null);

  // Tell the surrounding form something changed ("You have unsaved changes").
  const changed = () =>
    queueMicrotask(() => hidden.current?.dispatchEvent(new Event("change", { bubbles: true })));
  const move = (from: number, to: number) => {
    setOrder((o) => moveItem(o, from, to));
    changed();
  };
  const listRef = useRef<HTMLOListElement>(null);
  const dnd = useDragSort({
    list: listRef,
    count: order.length,
    onMove: move,
    name: (i) => labels.get(order[i]!) ?? "",
  });
  const step = (i: number, d: number) => {
    move(i, i + d);
    setStatus(`${labels.get(order[i]!)}: position ${i + d + 1} of ${order.length}`);
  };
  const toggle = (value: string, show: boolean) => {
    setOff((o) => (show ? o.filter((v) => v !== value) : [...o, value]));
    setStatus(`${labels.get(value)}: ${show ? "shown" : "hidden"} on the page`);
    changed();
  };

  return (
    <div role="group" aria-label={label} className="grid gap-2" aria-describedby={describedBy}>
      <input ref={hidden} type="hidden" id={id} name={name} value={order.join(",")} />
      {hiddenName ? (
        <input type="hidden" name={hiddenName} value={order.filter((v) => off.includes(v)).join(",")} />
      ) : null}
      <ol ref={listRef} className="m-0 grid list-none gap-2 p-0">
        {order.map((value, i) => {
          const shown = !off.includes(value);
          return (
            <li
              key={value}
              {...dnd.row(i)}
              className="flex items-center gap-2 rounded-md border border-border-decorative bg-bg-canvas px-2 py-2 data-dragging:shadow-md"
            >
              <button {...dnd.grip(i)} />
              <span className="flex-1 text-sm font-medium">
                <span className={shown ? "text-fg-strong" : "text-fg-muted line-through"}>
                  {i + 1}. {labels.get(value)}
                </span>
                {shown ? null : (
                  <span className="ml-2 rounded-full bg-bg-muted px-2 py-0.5 text-xs font-semibold text-fg-default">
                    Hidden
                  </span>
                )}
              </span>
              {hiddenName ? (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={shown}
                    onChange={(e) => toggle(value, e.target.checked)}
                    aria-label={`Show ${labels.get(value)} on the page`}
                    className="size-4 accent-action-primary-bg"
                  />
                  Show
                </label>
              ) : null}
              <button
                type="button"
                className={small}
                disabled={i === 0}
                onClick={() => step(i, -1)}
                aria-label={`Move ${labels.get(value)} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className={small}
                disabled={i === order.length - 1}
                onClick={() => step(i, 1)}
                aria-label={`Move ${labels.get(value)} down`}
              >
                ↓
              </button>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {dnd.status || status}
      </p>
    </div>
  );
}
