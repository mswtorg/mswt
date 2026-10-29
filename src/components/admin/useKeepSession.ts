"use client";

import { useEffect, type RefObject } from "react";

/** How often an active, unsaved form renews the admin session (well inside the 2-hour idle limit). */
export const KEEP_SESSION_EVERY_MS = 5 * 60 * 1000;

/**
 * While `on` (a form with unsaved changes), renew the session every few minutes, but only if the
 * person typed or clicked in the form since the last renewal. Writing a long text is never cut off
 * by the idle timeout; a forgotten tab with unsaved changes still signs out after 2 hours idle.
 * Auth.js re-signs the session (and re-checks the user) on every GET of /api/auth/session.
 */
export function useKeepSession(on: boolean, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!on || !el) return;
    // Turning on means the person just changed something.
    let active = true;
    const mark = () => {
      active = true;
    };
    const events = ["keydown", "input", "pointerdown"] as const;
    for (const t of events) el.addEventListener(t, mark, true);
    const timer = setInterval(() => {
      if (!active) return;
      active = false;
      void fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" }).catch(() => {});
    }, KEEP_SESSION_EVERY_MS);
    return () => {
      clearInterval(timer);
      for (const t of events) el.removeEventListener(t, mark, true);
    };
  }, [on, root]);
}
