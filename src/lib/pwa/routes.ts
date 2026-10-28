// What the service worker may cache (docs/standards.md PWA-05). Kept free of browser/worker globals
// so unit tests can check every rule.

export const LOCALES = ["en", "hi", "mr", "gu"] as const;

const NEVER = [
  /^\/(en|hi|mr|gu)\/donate(\/|$)/, // donate form and thank-you page
  /^\/admin(\/|$)/,
  /^\/api\//, // webhooks, receipts, status, cron, forms
  /^\/serwist\//, // the service worker itself
];

/**
 * True when a GET request may be served from a cache. Everything else (POST and server actions,
 * donate, admin, API and receipt links, other sites such as Cashfree, Next.js data requests)
 * always goes to the network.
 */
export function isCacheable(
  request: { method: string; headers: { get(name: string): string | null } },
  url: URL,
  origin: string,
): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.get("next-action") || request.headers.get("rsc") || url.searchParams.has("_rsc"))
    return false;
  if (url.origin === origin) return !NEVER.some((re) => re.test(url.pathname));
  // Other sites: only photos from the public media bucket (r2.dev or the media domain).
  return /\.r2\.dev$|^media\./.test(url.hostname);
}

/**
 * A public page (HTML): a browser navigation, or the copy SerwistProvider asks the worker to save
 * after a client-side navigation (a plain GET of a locale URL).
 */
export function isPublicPage(
  request: { mode: string; destination: string },
  url: URL,
  origin: string,
): boolean {
  if (url.origin !== origin) return false;
  return (
    request.mode === "navigate" || (request.destination === "" && /^\/(en|hi|mr|gu)(\/|$)/.test(url.pathname))
  );
}
