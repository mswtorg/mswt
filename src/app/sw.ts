import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";
import { isCacheable, isPublicPage, LOCALES } from "../lib/pwa/routes";

// Service worker (Step 9, docs/standards.md PWA-04..06), bundled by Serwist and served at
// /serwist/sw.js. Donations, payments, the admin, APIs and receipts always go to the network.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  // Never from a cache: donate, thank-you, admin, API, receipts, payments, server actions, RSC data.
  {
    matcher: ({ request, url }) => !isCacheable(request, url, self.location.origin),
    handler: new NetworkOnly(),
  },
  // Public pages: show the last copy at once and refresh it in the background.
  {
    matcher: ({ request, url }) => isPublicPage(request, url, self.location.origin),
    handler: new StaleWhileRevalidate({
      cacheName: "pages",
      plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 3600 })],
    }),
  },
  // Build files (hashed names: a new deploy means new URLs).
  {
    matcher: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: "static",
      plugins: [new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 30 * 24 * 3600 })],
    }),
  },
  // Photos, logos and fonts: they never change in place (new uploads get new names).
  {
    matcher: ({ request }) => request.destination === "image" || request.destination === "font",
    handler: new CacheFirst({
      cacheName: "media",
      plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new version takes over when every tab of the site has closed, never in the middle of a page
  // (a donation in progress is not interrupted; PWA-06).
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: true,
  runtimeCaching,
  // Offline and not in the cache: the offline page in the page's language.
  fallbacks: {
    entries: LOCALES.map((locale) => ({
      url: `/${locale}/offline`,
      matcher: ({ request }) =>
        request.destination === "document" && new URL(request.url).pathname.split("/")[1] === locale,
    })),
  },
});

serwist.addEventListeners();
