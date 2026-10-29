"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const face =
  "col-start-1 row-start-1 rounded-xl border border-border-decorative bg-bg-canvas p-6 backface-hidden";
const toggle =
  "justify-self-center rounded-sm text-sm font-semibold text-link-default underline underline-offset-4";

/**
 * A team card that turns over to show the person's details: on mouse hover, or with its button
 * (keyboard, touch, screen readers). The hidden side is inert so focus never lands on it.
 * "Reduce motion" swaps the sides without the turn.
 */
export function FlipCard({
  front,
  back,
  moreLabel,
  backLabel,
}: {
  front: ReactNode;
  back: ReactNode;
  moreLabel: string;
  backLabel: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const flipped = hovered || pinned;

  return (
    <div
      className="perspective-distant"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
    >
      <div
        data-flipped={flipped}
        className={cn(
          "grid transform-3d transition-transform duration-(--duration-slow) ease-standard motion-reduce:transition-none",
          flipped && "rotate-y-180",
        )}
      >
        <div
          className={cn(face, "grid content-start justify-items-center gap-2 text-center")}
          inert={flipped}
        >
          {front}
          <button
            ref={moreButton}
            type="button"
            aria-expanded={flipped}
            className={cn(toggle, "mt-2")}
            onClick={() => {
              setPinned(true);
              // After the turn, continue on the other side.
              requestAnimationFrame(() => backButton.current?.focus());
            }}
          >
            {moreLabel}
          </button>
        </div>
        <div className={cn(face, "grid content-start gap-4 rotate-y-180")} inert={!flipped}>
          {back}
          <button
            ref={backButton}
            type="button"
            className={toggle}
            onClick={() => {
              setPinned(false);
              setHovered(false);
              requestAnimationFrame(() => moreButton.current?.focus());
            }}
          >
            {backLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
