"use client";

import { useRef } from "react";

const small =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle";

/** Move from stage: tick (or untick) every new and changed item; removals stay a choice per item. */
export function SelectAllMoves() {
  const ref = useRef<HTMLDivElement>(null);
  const set = (checked: boolean) => {
    const boxes =
      ref.current?.closest("form")?.querySelectorAll<HTMLInputElement>('input[name="move"]') ?? [];
    for (const box of boxes) {
      box.checked = checked;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  return (
    <div ref={ref} className="flex flex-wrap gap-2">
      <button type="button" className={small} onClick={() => set(true)}>
        Select all new and changed
      </button>
      <button type="button" className={small} onClick={() => set(false)}>
        Clear selection
      </button>
    </div>
  );
}
