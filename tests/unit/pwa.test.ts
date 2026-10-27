import { describe, expect, it } from "vitest";
import { webManifest } from "@/lib/pwa/manifest";
import { isCacheable, isPublicPage } from "@/lib/pwa/routes";

const ORIGIN = "https://mswelfaretrust.org";
const get = (headers: Record<string, string> = {}) => ({ method: "GET", headers: new Headers(headers) });
const cacheable = (path: string, req = get()) => isCacheable(req, new URL(path, ORIGIN), ORIGIN);

describe("service worker caching rules (PWA-05)", () => {
  it.each([
    "/en/donate",
    "/hi/donate?cause=school",
    "/en/donate/thank-you?order=MSWT-abc",
    "/admin",
    "/admin/donations",
    "/api/receipts/MSWT-abc?sig=x",
    "/api/payments/webhook",
    "/serwist/sw.js",
    "https://sdk.cashfree.com/js/v3/cashfree.js",
    "https://payments.cashfree.com/order",
    "https://challenges.cloudflare.com/turnstile/v0/api.js",
  ])("never caches %s", (path) => {
    expect(cacheable(path)).toBe(false);
  });

  it("never caches POST requests, server actions or RSC data", () => {
    expect(cacheable("/en/contact", { method: "POST", headers: new Headers() })).toBe(false);
    expect(cacheable("/en/contact", get({ "next-action": "abc" }))).toBe(false);
    expect(cacheable("/en/about", get({ rsc: "1" }))).toBe(false);
    expect(cacheable("/en/about?_rsc=xyz")).toBe(false);
  });

  it.each([
    "/en",
    "/hi/about",
    "/gu/causes/school",
    "/en/offline",
    "/brand/mswt-mark.svg",
    "/_next/static/x.css",
  ])("may cache %s", (path) => expect(cacheable(path)).toBe(true));

  it("caches photos from the public media bucket only", () => {
    expect(cacheable("https://pub-123.r2.dev/photos/a-640.webp")).toBe(true);
    expect(cacheable("https://media.mswelfaretrust.org/photos/a-640.webp")).toBe(true);
    expect(cacheable("https://abc.r2.cloudflarestorage.com/mswt-media/a.pdf")).toBe(false);
  });

  it("treats navigations and saved locale pages as pages", () => {
    const url = (p: string) => new URL(p, ORIGIN);
    expect(isPublicPage({ mode: "navigate", destination: "document" }, url("/en/news"), ORIGIN)).toBe(true);
    expect(isPublicPage({ mode: "cors", destination: "" }, url("/mr/events"), ORIGIN)).toBe(true);
    expect(isPublicPage({ mode: "cors", destination: "" }, url("/manifest.webmanifest"), ORIGIN)).toBe(false);
    expect(
      isPublicPage({ mode: "navigate", destination: "document" }, new URL("https://x.org/en"), ORIGIN),
    ).toBe(false);
  });
});

describe("web app manifest (PWA-01/02)", () => {
  const m = webManifest();
  it("has the installability fields", () => {
    expect(m.name).toBe("MS Welfare Trust");
    expect(m.short_name!.length).toBeLessThanOrEqual(12);
    expect(m).toMatchObject({ start_url: "/en", scope: "/", display: "standalone", lang: "en" });
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(m.background_color).toBe("#ffffff");
  });

  it("lists 192 and 512 icons plus a maskable one, and both screenshot sizes", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    expect((m.screenshots ?? []).map((s) => s.form_factor).sort()).toEqual(["narrow", "wide"]);
  });
});
