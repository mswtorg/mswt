"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { ImageView } from "@/lib/media/view";
import { ResponsiveImage } from "./ResponsiveImage";

/** UI text for sliders and the viewer (from the "Photos" messages, or English in the admin). */
export type PhotoStrings = {
  label: string;
  previous: string;
  next: string;
  /** "Photo {n} of {total}" */
  slide: string;
  open: string;
  close: string;
};

export const ENGLISH_PHOTO_STRINGS: PhotoStrings = {
  label: "Photos",
  previous: "Previous photo",
  next: "Next photo",
  slide: "Photo {n} of {total}",
  open: "View full screen",
  close: "Close",
};

export type SlidePhoto = ImageView & { alt: string; caption?: string | null };

const fill = (s: string, n: number, total: number) =>
  s.replace("{n}", String(n)).replace("{total}", String(total));

const navButton =
  "grid size-11 place-items-center rounded-full border border-border-input bg-bg-canvas text-fg-strong shadow-sm hover:bg-bg-subtle disabled:opacity-40";

const Arrow = ({ dir }: { dir: "left" | "right" }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="size-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
  >
    <path
      d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Full-screen photo viewer (native <dialog>: Esc closes and focus returns to the opener).
 * ‹ › buttons and arrow keys move between photos; captions show under each.
 */
export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  t,
}: {
  photos: SlidePhoto[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  t: PhotoStrings;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (index !== null && !d.open) d.showModal();
    if (index === null && d.open) d.close();
  }, [index]);
  const photo = index !== null ? photos[index] : null;
  const go = (delta: number) => {
    if (index !== null) onIndex((index + delta + photos.length) % photos.length);
  };
  // Arrow keys move between photos while the viewer is open.
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") onIndex((index + 1) % photos.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex]);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={t.label}
      className="m-auto h-dvh max-h-none w-screen max-w-none bg-bg-inverse p-0 text-fg-inverse backdrop:bg-bg-inverse"
    >
      {photo ? (
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="m-0 text-sm" aria-live="polite">
              {fill(t.slide, index! + 1, photos.length)}
            </p>
            <button type="button" className={navButton} onClick={onClose} aria-label={t.close}>
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="grid min-h-0 place-items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- copies are resized at upload */}
            <img
              src={photo.src ?? undefined}
              srcSet={photo.srcset ?? undefined}
              sizes="100vw"
              alt={photo.alt}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <button type="button" className={navButton} onClick={() => go(-1)} aria-label={t.previous}>
              <Arrow dir="left" />
            </button>
            <p className="m-0 text-center text-sm text-fg-inverse-muted">{photo.caption}</p>
            <button type="button" className={navButton} onClick={() => go(1)} aria-label={t.next}>
              <Arrow dir="right" />
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

/**
 * Swipeable photo slider: native scroll-snap (works without JavaScript as a scrollable row),
 * ‹ › buttons, dots, arrow keys, and a full-screen viewer. Never moves on its own.
 */
export function PhotoSlider({
  photos,
  t = ENGLISH_PHOTO_STRINGS,
  ratio = "wide",
  priority = false,
  sizes = "(min-width: 1024px) 960px, 100vw",
  className,
}: {
  photos: SlidePhoto[];
  t?: PhotoStrings;
  ratio?: "wide" | "photo";
  /** The first slide loads eagerly with high priority (page hero only). */
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [current, setCurrent] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const total = photos.length;

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setCurrent(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(total - 1, i));
    el.scrollTo?.({ left: next * el.clientWidth, behavior: "smooth" });
    setCurrent(next);
  };

  if (total === 0) return null;
  return (
    <section aria-roledescription="carousel" aria-label={t.label} className={cn("grid gap-3", className)}>
      <div className="relative">
        {/* Keyboard users move with the ‹ › and dot buttons (each slide's button is focusable too). */}
        <ul
          ref={track}
          aria-label={t.label}
          className="m-0 flex list-none snap-x snap-mandatory overflow-x-auto scroll-smooth rounded-lg p-0 [scrollbar-width:none] motion-reduce:scroll-auto"
        >
          {photos.map((p, i) => (
            <li
              key={`${p.id}-${i}`}
              aria-roledescription="slide"
              aria-label={fill(t.slide, i + 1, total)}
              className="relative w-full flex-none snap-center"
            >
              <button
                type="button"
                onClick={() => setViewing(i)}
                className="block w-full cursor-zoom-in"
                aria-label={`${t.open}: ${p.alt}`}
              >
                <ResponsiveImage
                  image={p}
                  alt={p.alt}
                  sizes={sizes}
                  priority={priority && i === 0}
                  className={cn("rounded-none", ratio === "wide" ? "aspect-video" : "aspect-[4/3]")}
                />
              </button>
              {p.caption ? <p className="m-0 px-1 pt-2 text-sm text-fg-muted">{p.caption}</p> : null}
            </li>
          ))}
        </ul>
        {total > 1 ? (
          <>
            <button
              type="button"
              onClick={() => goTo(current - 1)}
              disabled={current === 0}
              aria-label={t.previous}
              className={cn(navButton, "absolute top-1/2 left-3 -translate-y-1/2")}
            >
              <Arrow dir="left" />
            </button>
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              disabled={current === total - 1}
              aria-label={t.next}
              className={cn(navButton, "absolute top-1/2 right-3 -translate-y-1/2")}
            >
              <Arrow dir="right" />
            </button>
          </>
        ) : null}
      </div>
      {total > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {photos.map((p, i) => (
            <button
              key={`dot-${p.id}-${i}`}
              type="button"
              onClick={() => goTo(i)}
              aria-label={fill(t.slide, i + 1, total)}
              aria-current={i === current ? "true" : undefined}
              className="grid size-6 place-items-center"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block size-2.5 rounded-full",
                  i === current ? "bg-action-primary-bg" : "bg-border-input",
                )}
              />
            </button>
          ))}
          <span className="sr-only" aria-live="polite">
            {fill(t.slide, current + 1, total)}
          </span>
        </div>
      ) : null}
      <PhotoViewer
        photos={photos}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        t={t}
      />
    </section>
  );
}

/** A grid of photos (gallery albums); each opens the full-screen viewer. */
export function PhotoGrid({ photos, t }: { photos: SlidePhoto[]; t: PhotoStrings }) {
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => (
          <li key={`${p.id}-${i}`}>
            <button
              type="button"
              onClick={() => setViewing(i)}
              className="block w-full cursor-zoom-in"
              aria-label={`${t.open}: ${p.alt}`}
            >
              <ResponsiveImage
                image={p}
                alt={p.alt}
                sizes="(min-width: 1024px) 300px, 50vw"
                className="aspect-square"
              />
            </button>
            {p.caption ? <p className="m-0 pt-1 text-sm text-fg-muted">{p.caption}</p> : null}
          </li>
        ))}
      </ul>
      <PhotoViewer
        photos={photos}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        t={t}
      />
    </>
  );
}
