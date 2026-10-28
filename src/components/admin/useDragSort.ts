"use client";

import { useEffect, useRef, useState } from "react";

const EDGE = 64;
const SCROLL_STEP = 12;

type Drag = { from: number; at: number; grabDy: number };

/**
 * Drag-and-drop reordering for an admin list, with a grip button on each row.
 * Pointer Events, so a mouse, a finger and a pen all work; the grip has `touch-action: none` so
 * the page still scrolls elsewhere. Rows move aside live; Esc puts the row back.
 * Keyboard: Space (or Enter) on the grip picks the row up, ↑ ↓ move it, Space drops it, Esc cancels.
 * The ↑ ↓ buttons beside it stay as the single-click alternative (WCAG 2.5.7).
 * Rows must have stable keys, so the dragged row's element (and focus) survives each move.
 */
export function useDragSort({
  list,
  count,
  onMove,
  name,
}: {
  /** The `<ol>` whose children are the rows. */
  list: React.RefObject<HTMLOListElement | null>;
  count: number;
  /** Move the item at `from` to `to` (the hook calls it many times during one drag). */
  onMove: (from: number, to: number) => void;
  /** How a row is announced, e.g. "News" or "photo 2". */
  name: (i: number) => string;
}) {
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [lifted, setLifted] = useState<{ from: number; at: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const latest = useRef({ onMove, name, count });
  useEffect(() => {
    latest.current = { onMove, name, count };
  });

  const rows = () => Array.from(list.current?.children ?? []) as HTMLElement[];
  const announce = (i: number, at: number) =>
    setStatus(`${latest.current.name(i)}: position ${at + 1} of ${latest.current.count}`);

  const end = (cancel: boolean) => {
    const d = drag.current;
    drag.current = null;
    setDragging(null);
    setOffset(0);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onEscape);
    if (!d) return;
    if (cancel && d.at !== d.from) {
      latest.current.onMove(d.at, d.from);
      announce(d.from, d.from);
    } else if (d.at !== d.from) announce(d.at, d.at);
  };
  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    e.preventDefault();
    if (e.clientY < EDGE) window.scrollBy(0, -SCROLL_STEP);
    else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP);
    const all = rows();
    // The slot under the pointer: past another row's middle means swap with it.
    let target = d.at;
    all.forEach((row, i) => {
      if (i === d.at) return;
      const r = row.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if ((i < d.at && e.clientY < mid) || (i > d.at && e.clientY > mid)) {
        target = i < d.at ? Math.min(target, i) : Math.max(target, i);
      }
    });
    if (target !== d.at) {
      latest.current.onMove(d.at, target);
      d.at = target;
      setDragging(target);
    }
    // Let the row follow the pointer within its slot (its untransformed top is rect.top - offset).
    const row = all[d.at];
    if (row) {
      const r = row.getBoundingClientRect();
      const current = Number(row.dataset.dragOffset ?? 0);
      setOffset(e.clientY - d.grabDy - (r.top - current));
    }
  }
  function onPointerUp() {
    end(false);
  }
  function onPointerCancel() {
    end(true);
  }
  function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") end(true);
  }
  useEffect(() => () => end(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Props for row `i`'s grip button. */
  const grip = (i: number) => ({
    type: "button" as const,
    "aria-label": `Reorder ${name(i)}`,
    "aria-pressed": lifted?.at === i,
    title: "Drag to reorder, or press Space then the arrow keys",
    className:
      "inline-flex min-h-9 w-8 flex-none cursor-grab touch-none items-center justify-center rounded-md text-lg leading-none text-fg-muted select-none hover:bg-bg-subtle active:cursor-grabbing aria-pressed:bg-bg-brand-subtle aria-pressed:text-fg-brand",
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || count < 2) return;
      e.preventDefault();
      const row = rows()[i];
      if (!row) return;
      drag.current = { from: i, at: i, grabDy: e.clientY - row.getBoundingClientRect().top };
      setDragging(i);
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("keydown", onEscape);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (lifted) {
          announce(lifted.at, lifted.at);
          setLifted(null);
        } else {
          setLifted({ from: i, at: i });
          setStatus(
            `${name(i)} picked up. Use the arrow keys to move it, Space to drop it, Escape to cancel.`,
          );
        }
      } else if (lifted && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const to = lifted.at + (e.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= count) return;
        onMove(lifted.at, to);
        setLifted({ from: lifted.from, at: to });
        announce(lifted.at, to);
      } else if (lifted && e.key === "Escape") {
        e.preventDefault();
        if (lifted.at !== lifted.from) onMove(lifted.at, lifted.from);
        setStatus(`${name(lifted.at)}: move cancelled`);
        setLifted(null);
      }
    },
    onBlur: () => setLifted(null),
    children: "⠿",
  });

  /** Props for row `i` itself (the dragged row is raised and follows the pointer). */
  const row = (i: number) =>
    dragging === i
      ? {
          "data-dragging": "",
          "data-drag-offset": String(offset),
          style: { transform: `translateY(${offset}px)`, position: "relative" as const, zIndex: 10 },
        }
      : {};

  return { grip, row, status };
}
