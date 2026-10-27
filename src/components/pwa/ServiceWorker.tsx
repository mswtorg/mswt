"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Registers the service worker (src/app/sw.ts) on public pages only: the admin layout never
// renders this. Off in development, where pages change on every edit. Kept tiny on purpose
// (no @serwist/window): it runs on every public page.
export function ServiceWorker() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV === "development" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/serwist/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  // Pages opened by client-side navigation never pass through the worker as HTML: ask it to save
  // a copy too, so they open offline later (the worker's rules still decide what may be cached).
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage({
      type: "CACHE_URLS",
      payload: { urlsToCache: [pathname] },
    });
  }, [pathname]);

  return null;
}
