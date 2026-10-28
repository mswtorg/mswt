"use client";

import { useRef, useState } from "react";

const small =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle disabled:opacity-40";

/**
 * A fixed set of items put in order with ↑ ↓ buttons (e.g. the Home sections). Posted as a hidden
 * input of comma-separated values. Items are keyed by value, so focus stays on the moved item.
 */
export function OrderListField({
  id,
  name,
  label,
  defaultValue,
  items,
  describedBy,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  items: { value: string; label: string }[];
  describedBy?: string;
}) {
  const labels = new Map(items.map((i) => [i.value, i.label]));
  const [order, setOrder] = useState<string[]>(() => {
    const saved = defaultValue.split(",").filter((v) => labels.has(v));
    return [...saved, ...items.map((i) => i.value).filter((v) => !saved.includes(v))];
  });
  const [status, setStatus] = useState("");
  const hidden = useRef<HTMLInputElement>(null);

  const move = (i: number, d: number) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setOrder(next);
    setStatus(`${labels.get(order[i]!)}: position ${i + d + 1} of ${order.length}`);
    // Tell the surrounding form something changed ("You have unsaved changes").
    queueMicrotask(() => hidden.current?.dispatchEvent(new Event("change", { bubbles: true })));
  };

  return (
    <div role="group" aria-label={label} className="grid gap-2" aria-describedby={describedBy}>
      <input ref={hidden} type="hidden" id={id} name={name} value={order.join(",")} />
      <ol className="m-0 grid list-none gap-2 p-0">
        {order.map((value, i) => (
          <li
            key={value}
            className="flex items-center gap-3 rounded-md border border-border-decorative px-3 py-2"
          >
            <span className="flex-1 text-sm font-medium text-fg-strong">
              {i + 1}. {labels.get(value)}
            </span>
            <button
              type="button"
              className={small}
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Move ${labels.get(value)} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className={small}
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Move ${labels.get(value)} down`}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
