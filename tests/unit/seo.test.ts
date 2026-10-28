import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMetadata } from "@/lib/seo/metadata";
import { crawlAllowed, isCanonicalHost, languageAlternates } from "@/lib/seo/site";
import { pingIndexNow } from "@/lib/seo/indexnow";
import { robotsFor } from "@/app/robots";
import { contentEntries, sitemapEntries, storyEntries } from "@/app/sitemap";
import { ContentFileSchema } from "@/lib/content/format";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mswelfaretrust.org"));
afterEach(() => vi.unstubAllEnvs());

describe("buildMetadata", () => {
  const base = {
    locale: "hi" as const,
    path: "/causes",
    title: "सेवा कार्य",
    description: "d",
    siteName: "S",
  };

  it("gives every page the locale share card unless it has its own image", () => {
    const og = buildMetadata(base).openGraph as { images: { url: string }[] };
    expect(og.images[0]!.url).toBe("https://mswelfaretrust.org/hi/opengraph-image");
    const tw = buildMetadata(base).twitter as { images: { url: string }[] };
    expect(tw.images[0]!.url).toBe("https://mswelfaretrust.org/hi/twitter-image");
    const own = buildMetadata({ ...base, image: "https://cdn.example/x.jpg" }).openGraph as {
      images: { url: string }[];
    };
    expect(own.images[0]!.url).toBe("https://cdn.example/x.jpg");
  });

  it("sets an absolute canonical and hreflang for all locales plus x-default", () => {
    const m = buildMetadata(base);
    expect(m.alternates?.canonical).toBe("https://mswelfaretrust.org/hi/causes");
    expect(m.alternates?.languages).toEqual({
      en: "https://mswelfaretrust.org/en/causes",
      hi: "https://mswelfaretrust.org/hi/causes",
      mr: "https://mswelfaretrust.org/mr/causes",
      gu: "https://mswelfaretrust.org/gu/causes",
      "x-default": "https://mswelfaretrust.org/en/causes",
    });
  });

  it("maps Open Graph locales and alternates", () => {
    const og = buildMetadata(base).openGraph as { locale: string; alternateLocale: string[] };
    expect(og.locale).toBe("hi_IN");
    expect(og.alternateLocale).toEqual(["en_IN", "mr_IN", "gu_IN"]);
  });

  it("noindex pages drop hreflang and set robots", () => {
    const m = buildMetadata({ ...base, noindex: true });
    expect(m.robots).toEqual({ index: false, follow: false });
    expect(m.alternates?.languages).toBeUndefined();
  });
});

describe("site helpers", () => {
  it("only the canonical host is indexable", () => {
    expect(isCanonicalHost("mswelfaretrust.org")).toBe(true);
    expect(isCanonicalHost("MSWelfareTrust.org:443")).toBe(true);
    expect(isCanonicalHost("mswelfaretrust.vercel.app")).toBe(false);
    expect(isCanonicalHost("www.mswelfaretrust.org")).toBe(false);
    expect(isCanonicalHost(null)).toBe(false);
  });
  it("only production may be crawled", () => {
    expect(crawlAllowed("production")).toBe(true);
    expect(crawlAllowed("preview")).toBe(false);
    expect(crawlAllowed(undefined)).toBe(false);
  });
  it("x-default points to English", () => {
    expect(languageAlternates("")["x-default"]).toBe("https://mswelfaretrust.org/en");
  });
});

describe("robots", () => {
  it("production allows crawling except admin and api, and lists the sitemap", () => {
    const r = robotsFor("production");
    expect(r.rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] });
    expect(r.sitemap).toBe("https://mswelfaretrust.org/sitemap.xml");
  });
  it("previews and local builds disallow everything", () => {
    expect(robotsFor("preview").rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(robotsFor(undefined).sitemap).toBeUndefined();
  });
});

describe("sitemap", () => {
  it("lists every ready page once per locale, with alternates", () => {
    const entries = sitemapEntries(new Date("2026-10-22T00:00:00Z"));
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://mswelfaretrust.org/en");
    expect(urls).toContain("https://mswelfaretrust.org/gu/causes");
    expect(urls).toContain("https://mswelfaretrust.org/mr/contact");
    // Donate is listed once donations are on (always outside production; see src/lib/flags.ts).
    expect(urls).toContain("https://mswelfaretrust.org/hi/donate");
    expect(urls.some((u) => u.includes("/privacy") || u.includes("/thank-you"))).toBe(false);
    expect(urls.length % 4).toBe(0);
    expect(entries[0]?.alternates?.languages?.["x-default" as "en"]).toBe("https://mswelfaretrust.org/en");
  });

  it("lists content items only in the languages they exist in", () => {
    const content = {
      ...ContentFileSchema.parse({
        causes: [
          {
            slug: "x",
            status: "active",
            translations: { en: { title: "X", summary: "s" }, hi: { title: "X", summary: "s" } },
          },
        ],
      }),
      sampleParts: [],
    };
    const urls = contentEntries(content).map((e) => e.url);
    expect(urls).toEqual([
      "https://mswelfaretrust.org/en/causes/x",
      "https://mswelfaretrust.org/hi/causes/x",
    ]);
  });
});

describe("pingIndexNow", () => {
  it("does nothing outside production or without a key", async () => {
    const fetchImpl = vi.fn();
    expect(await pingIndexNow(["u"], { key: "k", vercelEnv: "preview", fetchImpl })).toEqual({
      sent: false,
      reason: "not-production",
    });
    expect(await pingIndexNow(["u"], { key: null, vercelEnv: "production", fetchImpl })).toEqual({
      sent: false,
      reason: "no-key",
    });
    expect(await pingIndexNow([], { key: "k", vercelEnv: "production", fetchImpl })).toEqual({
      sent: false,
      reason: "no-urls",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("posts host, key, keyLocation and URLs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const result = await pingIndexNow(["https://mswelfaretrust.org/en"], {
      key: "abc123",
      vercelEnv: "production",
      fetchImpl,
    });
    expect(result).toEqual({ sent: true, status: 202 });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.indexnow.org/indexnow");
    expect(JSON.parse(init.body as string)).toEqual({
      host: "mswelfaretrust.org",
      key: "abc123",
      keyLocation: "https://mswelfaretrust.org/indexnow-key.txt",
      urlList: ["https://mswelfaretrust.org/en"],
    });
  });
  it("never throws on network errors", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await pingIndexNow(["u"], { key: "k", vercelEnv: "production", fetchImpl })).toEqual({
      sent: true,
      status: 0,
    });
  });
});

describe("testimonial stories in the sitemap", () => {
  it("lists each story only in the languages it is written in, with hreflang", () => {
    const entries = storyEntries({ en: ["asha", "ravi"], hi: ["asha"] });
    expect(entries.map((e) => e.url).sort()).toEqual(
      [
        "https://mswelfaretrust.org/en/testimonials/asha",
        "https://mswelfaretrust.org/en/testimonials/ravi",
        "https://mswelfaretrust.org/hi/testimonials/asha",
      ].sort(),
    );
    const asha = entries.find((e) => e.url.endsWith("/en/testimonials/asha"))!;
    expect(Object.keys(asha.alternates!.languages!)).toEqual(expect.arrayContaining(["en", "hi"]));
    expect(Object.keys(asha.alternates!.languages!)).not.toContain("mr");
  });
});
