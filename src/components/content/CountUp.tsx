"use client";

import { useEffect, useRef, useState } from "react";

export type ParsedCount = {
  prefix: string;
  value: number;
  decimals: number;
  grouped: boolean;
  suffix: string;
};

/** "1,200+ Families" → { prefix "", value 1200, suffix "+ Families" }; text without a number → null. */
export function parseCount(text: string): ParsedCount | null {
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/.exec(text);
  if (!m) return null;
  const digits = m[2]!.replace(/,/g, "");
  const value = Number(digits);
  if (!Number.isFinite(value)) return null;
  return {
    prefix: m[1]!,
    value,
    decimals: digits.includes(".") ? digits.split(".")[1]!.length : 0,
    grouped: m[2]!.includes(","),
    suffix: m[3]!,
  };
}

/** The text with its number at `value` (Indian grouping, 1,20,000, when the original had commas). */
export function formatCount(p: ParsedCount, value: number): string {
  const n = value.toLocaleString("en-IN", {
    minimumFractionDigits: p.decimals,
    maximumFractionDigits: p.decimals,
    useGrouping: p.grouped,
  });
  return `${p.prefix}${n}${p.suffix}`;
}

const DURATION_MS = 1500;

/**
 * A figure that counts up from 0 the first time it scrolls into view. The server HTML holds the
 * final text (search engines, no JavaScript); screen readers get the final text only, and with
 * "reduce motion" it never animates.
 */
export function CountUp({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);

  useEffect(() => {
    const parsed = parseCount(text);
    const el = ref.current;
    if (!parsed || !el || parsed.value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    let frame = 0;
    // Start from 0 on the next frame (before the figure is likely seen), then count when in view.
    frame = requestAnimationFrame(() => setShown(formatCount(parsed, 0)));
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION_MS);
          const eased = 1 - (1 - t) ** 3;
          const v = parsed.decimals
            ? Number((parsed.value * eased).toFixed(parsed.decimals))
            : Math.round(parsed.value * eased);
          setShown(t < 1 ? formatCount(parsed, v) : text);
          if (t < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [text]);

  return (
    <>
      <span ref={ref} aria-hidden="true" data-count-up="">
        {shown}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}
