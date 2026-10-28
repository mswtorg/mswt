import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  breadcrumbList,
  compact,
  donateAction,
  event,
  ids,
  imageObject,
  istIso,
  newsArticle,
  ngo,
  pageGraph,
  serializeJsonLd,
  webPage,
  website,
} from "@/lib/seo/jsonld";
import type { OrganizationSettings } from "@/lib/settings";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mswelfaretrust.org"));
afterEach(() => vi.unstubAllEnvs());

const ORG_ID = "https://mswelfaretrust.org/#organization";

function org(overrides: Partial<OrganizationSettings> = {}): OrganizationSettings {
  return {
    id: 1,
    legalName: "Munira Shoaib Welfare Trust",
    displayName: "MS Welfare Trust",
    alternateNames: { en: ["MS Welfare Trust", "MSWT"] },
    description: {},
    foundingDate: null,
    trustPan: null,
    trustRegistrationNo: null,
    registrationAuthority: null,
    reg12aNumber: null,
    reg12aDate: null,
    reg80gNumber: null,
    reg80gValidFrom: null,
    reg80gValidTo: null,
    streetAddress: null,
    locality: null,
    city: null,
    district: null,
    state: null,
    pincode: null,
    country: "IN",
    geoLat: null,
    geoLng: null,
    phones: [],
    email: "info@mswelfaretrust.org",
    contactHours: {},
    areaServed: [],
    trustees: [],
    sameAs: [],
    logoMediaId: null,
    signatoryName: null,
    signatoryTitle: null,
    signatureMediaId: null,
    updatedBy: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

const json = (v: unknown) => JSON.stringify(v);
/** Loosely typed view of a node for assertions (schema-dts types are unions). */
const o = (v: unknown) => v as Record<string, any>;

describe("ngo()", () => {
  it("has the stable @id, names, url and a 512px logo", () => {
    const n = o(ngo(org(), "en"));
    expect(n["@type"]).toBe("NGO");
    expect(n["@id"]).toBe(ORG_ID);
    expect(n.name).toBe("MS Welfare Trust");
    expect(n.legalName).toBe("Munira Shoaib Welfare Trust");
    expect(n.alternateName).toEqual(["MSWT"]);
    expect(n.logo).toMatchObject({ url: "https://mswelfaretrust.org/brand/mswt-logo-512.png", width: "512" });
  });

  it("omits every field the Trust hasn't provided (no nulls, no empty values)", () => {
    const n = ngo(org(), "en");
    expect(json(n)).not.toMatch(/null|""|\[\]|\{\}/);
    const keys = Object.keys(n);
    for (const key of [
      "foundingDate",
      "taxID",
      "address",
      "founder",
      "member",
      "sameAs",
      "areaServed",
      "telephone",
      "description",
    ]) {
      expect(keys).not.toContain(key);
    }
  });

  it("uses settings when present: address, phone, PAN, trustees, profiles, localised names", () => {
    const n = o(
      ngo(
        org({
          alternateNames: { en: ["MSWT"], hi: ["मुनीरा शोएब वेलफेयर ट्रस्ट"] },
          description: { en: "Mission", hi: "मिशन" },
          foundingDate: "2015-06-01",
          trustPan: "AAATM1234F",
          streetAddress: "1 Main Rd",
          city: "Pune",
          state: "Maharashtra",
          pincode: "411001",
          phones: ["+91 20 1234 5678"],
          trustees: [
            { name: "B Person", role: "Trustee", sort: 2 },
            { name: "A Person", role: "Founder & Managing Trustee", sort: 1 },
          ],
          sameAs: ["https://www.facebook.com/mswt"],
        }),
        "hi",
      ),
    );
    expect(n.description).toBe("मिशन");
    expect(n.alternateName).toEqual(["MSWT", "मुनीरा शोएब वेलफेयर ट्रस्ट"]);
    expect(n.taxID).toBe("AAATM1234F");
    expect(n.foundingDate).toBe("2015-06-01");
    expect(n.address).toMatchObject({
      "@type": "PostalAddress",
      addressLocality: "Pune",
      postalCode: "411001",
      addressCountry: "IN",
    });
    expect(n.contactPoint).toMatchObject({
      contactType: "customer support",
      telephone: "+91 20 1234 5678",
      availableLanguage: ["en", "hi", "mr", "gu"],
    });
    expect(n.member.map((p: { name: string }) => p.name)).toEqual(["A Person", "B Person"]);
    expect(n.founder).toEqual([
      { "@type": "Person", name: "A Person", jobTitle: "Founder & Managing Trustee" },
    ]);
    expect(n.sameAs).toEqual(["https://www.facebook.com/mswt"]);
  });
});

describe("page nodes reference the organisation by @id", () => {
  it("WebSite has no SearchAction and points to the NGO", () => {
    const w = o(website("en", "MS Welfare Trust"));
    expect(w["@id"]).toBe(ids.website());
    expect(w.publisher).toEqual({ "@id": ORG_ID });
    expect(json(w)).not.toContain("SearchAction");
  });

  it("WebSite lists the Trust's other names once, without its own name", () => {
    const w = o(
      website("en", "MS Welfare Trust", [
        "MS Welfare Trust",
        "Munira Shoaib Welfare Trust",
        "MSWT",
        "MSWT",
        " ",
      ]),
    );
    expect(w.alternateName).toEqual(["Munira Shoaib Welfare Trust", "MSWT"]);
    expect(o(website("en", "S")).alternateName).toBeUndefined();
  });

  it("WebPage types carry language, site, publisher and optional breadcrumb", () => {
    const p = o(
      webPage({
        type: "AboutPage",
        locale: "mr",
        path: "/about",
        name: "आमच्याबद्दल",
        hasBreadcrumb: true,
      }),
    );
    expect(p["@type"]).toBe("AboutPage");
    expect(p["@id"]).toBe("https://mswelfaretrust.org/mr/about#webpage");
    expect(p.inLanguage).toBe("mr");
    expect(p.isPartOf).toEqual({ "@id": ids.website() });
    expect(p.publisher).toEqual({ "@id": ORG_ID });
    expect(p.breadcrumb).toEqual({ "@id": "https://mswelfaretrust.org/mr/about#breadcrumb" });
  });

  it("BreadcrumbList numbers items with absolute URLs", () => {
    const b = o(
      breadcrumbList("hi", "/causes/education", [
        { name: "मुखपृष्ठ", path: "" },
        { name: "सेवा कार्य", path: "/causes" },
        { name: "शिक्षा", path: "/causes/education" },
      ]),
    );
    expect(b.itemListElement).toHaveLength(3);
    expect(b.itemListElement[2]).toEqual({
      "@type": "ListItem",
      position: 3,
      name: "शिक्षा",
      item: "https://mswelfaretrust.org/hi/causes/education",
    });
  });

  it("DonateAction targets the localised donate page", () => {
    const d = o(donateAction("gu", "દાન કરો"));
    expect(d.recipient).toEqual({ "@id": ORG_ID });
    expect(d.target.urlTemplate).toBe("https://mswelfaretrust.org/gu/donate");
  });
});

describe("content types", () => {
  it("Event dates carry +05:30 and a Place for offline events", () => {
    const e = o(
      event({
        name: "Health camp",
        url: "https://mswelfaretrust.org/en/events/health-camp",
        start: new Date("2026-11-15T04:30:00Z"),
        end: new Date("2026-11-15T11:30:00Z"),
        status: "scheduled",
        attendance: "offline",
        venue: { name: "Community hall", city: "Pune" },
      }),
    );
    expect(e.startDate).toBe("2026-11-15T10:00:00+05:30");
    expect(e.endDate).toBe("2026-11-15T17:00:00+05:30");
    expect(e.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(e.eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
    expect(e.location).toMatchObject({
      "@type": "Place",
      name: "Community hall",
      address: { addressLocality: "Pune", addressCountry: "IN" },
    });
    expect(e.organizer).toEqual({ "@id": ORG_ID });
  });

  it("online events use a VirtualLocation; mixed events list both", () => {
    const online = o(
      event({
        name: "Webinar",
        url: "u",
        start: new Date(),
        status: "moved_online",
        attendance: "online",
        onlineUrl: "https://meet.example/x",
      }),
    );
    expect(online.location).toEqual({ "@type": "VirtualLocation", url: "https://meet.example/x" });
    const mixed = o(
      event({
        name: "Talk",
        url: "u",
        start: new Date(),
        status: "scheduled",
        attendance: "mixed",
        venue: { name: "Hall" },
        onlineUrl: "https://meet.example/y",
      }),
    );
    expect(mixed.location).toHaveLength(2);
  });

  it("NewsArticle has headline, images, dates and publisher; author falls back to the NGO", () => {
    const a = o(
      newsArticle({
        headline: "Annual report",
        url: "u",
        images: ["https://x/a.jpg"],
        published: new Date("2026-04-01T00:00:00+05:30"),
        locale: "en",
      }),
    );
    expect(a.datePublished).toBe("2026-04-01T00:00:00+05:30");
    expect(a.dateModified).toBe(a.datePublished);
    expect(a.author).toEqual({ "@id": ORG_ID });
    expect(a.publisher).toEqual({ "@id": ORG_ID });
  });

  it("ImageObject keeps only provided fields", () => {
    expect(imageObject({ contentUrl: "https://x/p.jpg", caption: "Camp" })).toEqual({
      "@type": "ImageObject",
      contentUrl: "https://x/p.jpg",
      caption: "Camp",
    });
  });
});

describe("graph and serialisation", () => {
  it("pageGraph drops missing nodes and never includes FAQPage", () => {
    const g = o(pageGraph([null, website("en", "S"), undefined]));
    expect(g["@context"]).toBe("https://schema.org");
    expect(g["@graph"]).toHaveLength(1);
    expect(json(g)).not.toContain("FAQPage");
  });

  it("escapes characters that could close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script> & \u2028" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script> & \u2028");
  });

  it("compact keeps @id-only references", () => {
    expect(compact({ a: { "@id": "x" }, b: {}, c: [], d: null })).toEqual({ a: { "@id": "x" } });
  });

  it("istIso converts to India time", () => {
    expect(istIso(new Date("2026-03-31T18:30:00Z"))).toBe("2026-04-01T00:00:00+05:30");
  });
});
