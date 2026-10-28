"use client";

import { useEffect } from "react";

/**
 * Marks the sticky header with data-scrolled once the page has scrolled, so it gets a shadow
 * instead of its bottom border. Renders nothing; without JavaScript the header keeps its border.
 */
export function HeaderShadow({ headerId }: { headerId: string }) {
  useEffect(() => {
    const header = document.getElementById(headerId);
    if (!header) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      header.toggleAttribute("data-scrolled", window.scrollY > 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [headerId]);
  return null;
}
