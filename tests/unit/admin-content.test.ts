import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MenuInput, menuInputFor } from "@/lib/admin/menus";
import { HomeExtras } from "@/lib/content/home";
import { TestimonialInput, TestimonialTextInput } from "@/lib/admin/testimonials";
import { storySummary } from "@/lib/content/testimonials";
import { moveItem } from "@/lib/admin/order";
import {
  HiddenSectionsInput,
  normalizeSectionOrder,
  SectionOrderInput,
  visibleSections,
} from "@/lib/content/home";
import { CauseInput, CauseTextInput } from "@/lib/admin/causes";
import { formatCount, parseCount } from "@/components/content/CountUp";
import { blocksToMarkup, imageIds, markupToBlocks } from "@/lib/content/markup";
import { mediaSlug } from "@/lib/media/process";
import { imageView } from "@/lib/media/view";
import { imagesFrom, pastedName } from "@/lib/media/shrink";

const ID = "d6a00170-1303-480e-b894-efd1e93e4af2";

describe("content text format (markup ↔ blocks)", () => {
  it("turns every mark into its block", () => {
    const { blocks, errors } = markupToBlocks(
      [
        "## Our work",
        "### Camps",
        "We run free camps in **Pune**,",
        "every month.",
        "",
        "- Medical camps",
        "- School kits",
        "1. First",
        "2. Second",
        "> A note",
        "> continues here",
        ">! A warning",
        `![The last camp](media:${ID})`,
        "Read [80G](/en/80g-disclaimer).",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "Our work" },
      { type: "heading", level: 3, text: "Camps" },
      { type: "paragraph", text: "We run free camps in **Pune**, every month." },
      { type: "list", items: ["Medical camps", "School kits"] },
      { type: "list", ordered: true, items: ["First", "Second"] },
      { type: "callout", tone: "info", text: "A note continues here" },
      { type: "callout", tone: "warning", text: "A warning" },
      { type: "image", mediaId: ID, caption: "The last camp" },
      { type: "paragraph", text: "Read [80G](/en/80g-disclaimer)." },
    ]);
    expect(imageIds(blocks)).toEqual([ID]);
  });

  it("keeps Indian scripts as typed", () => {
    const text = "## हमारा काम\n\nहर महीने **मुफ़्त** जाँच।\n\n- ગુજરાતી યાદી";
    expect(blocksToMarkup(markupToBlocks(text).blocks)).toBe(text);
  });

  it("reports problems by line", () => {
    const { errors } = markupToBlocks(
      "Hello\n\n# Too big\n\nSee [this](javascript:alert(1))\n\n![x](media:nope)",
    );
    expect(errors.map((e) => e.line)).toEqual([3, 5, 7]);
    expect(errors[0]!.message).toMatch(/Line 3: use ##/);
    expect(errors[1]!.message).toMatch(/Line 5: the link “this” must start with https/);
  });

  it("an image line is not mistaken for a link", () => {
    expect(markupToBlocks(`![](media:${ID})`)).toEqual({
      blocks: [{ type: "image", mediaId: ID }],
      errors: [],
    });
  });

  it("round-trips all real and sample content exactly", () => {
    let checked = 0;
    const walk = (o: unknown) => {
      if (Array.isArray(o) && o.length && typeof o[0] === "object" && o[0] && "type" in o[0]) {
        checked++;
        expect(markupToBlocks(blocksToMarkup(o as never))).toEqual({ blocks: o, errors: [] });
      } else if (o && typeof o === "object") Object.values(o).forEach(walk);
    };
    for (const f of ["data/content/content.json", "data/sample/content.json"])
      walk(JSON.parse(readFileSync(f, "utf8")));
    expect(checked).toBeGreaterThan(20);
  });
});

describe("library photos", () => {
  const row = {
    id: ID,
    r2Key: `media/${ID}/camp`,
    variants: [640, 1280, 1600],
    width: 1600,
    height: 1200,
    blur: null,
  };

  it("builds srcset from the stored widths", () => {
    const v = imageView(row, "https://media.example.org", "Camp");
    expect(v.src).toBe(`https://media.example.org/media/${ID}/camp-1600.webp`);
    expect(v.srcset).toBe(
      [640, 1280, 1600].map((w) => `https://media.example.org/media/${ID}/camp-${w}.webp ${w}w`).join(", "),
    );
  });

  it("has no source without a stored file or storage (placeholder)", () => {
    expect(imageView({ ...row, r2Key: null }, "https://m.example.org", "x").src).toBeNull();
    expect(imageView(row, null, "x").srcset).toBeNull();
  });

  it("names files descriptively in kebab case", () => {
    expect(mediaSlug("Health Camp – Pune 2026.JPG")).toBe("health-camp-pune-2026");
    expect(mediaSlug("स्वास्थ्य शिविर.jpg")).toBe("photo");
    expect(mediaSlug("Café.png")).toBe("cafe");
  });
});

describe("home page fields", () => {
  it("needs exactly three points with title and text", () => {
    const point = { title: "80G", text: "Tax benefit" };
    expect(HomeExtras.safeParse({ eyebrow: "", points: [point, point, point] }).success).toBe(true);
    expect(HomeExtras.safeParse({ points: [point, point] }).success).toBe(false);
    expect(HomeExtras.safeParse({ points: [point, point, { title: "", text: "x" }] }).success).toBe(false);
  });

  it("takes up to four impact numbers, each with a value and a label", () => {
    const point = { title: "80G", text: "Tax benefit" };
    const n = { value: "1,200+", label: "families helped" };
    const parse = (impact: unknown) => HomeExtras.safeParse({ points: [point, point, point], impact });
    expect(HomeExtras.parse({ points: [point, point, point] }).impact).toEqual([]);
    expect(parse([n, n, n, n]).success).toBe(true);
    expect(parse([n, n, n, n, n]).success).toBe(false);
    expect(parse([{ value: "12", label: "" }]).success).toBe(false);
    expect(parse([{ value: "x".repeat(21), label: "y" }]).success).toBe(false);
  });
});

describe("testimonial fields", () => {
  const settings = {
    slug: "asha-school",
    storyDate: "2026-03-14",
    sortOrder: "3",
    showOnHome: true,
    photoId: "",
  };
  it("settings: address, date, status, order and an optional photo", () => {
    expect(TestimonialInput.parse({ ...settings, status: "published" })).toEqual({
      slug: "asha-school",
      storyDate: "2026-03-14",
      status: "published",
      sortOrder: 3,
      showOnHome: true,
      photoId: null,
    });
    const bad = (over: object) =>
      TestimonialInput.safeParse({ ...settings, status: "draft", ...over }).success;
    expect(bad({ status: "live" })).toBe(false);
    expect(bad({ sortOrder: "-1" })).toBe(false);
    expect(bad({ photoId: "x" })).toBe(false);
    expect(bad({ slug: "Asha School" })).toBe(false);
    expect(bad({ storyDate: "" })).toBe(false);
    expect(bad({ storyDate: "14/03/2026" })).toBe(false);
  });

  it("text: heading, story and name are required; summary and role are optional", () => {
    const text = {
      title: " Back to school ",
      body: "She is in class 6 now.",
      summary: "",
      name: "Asha",
      role: "",
    };
    expect(TestimonialTextInput.parse({ ...text, reviewed: true })).toEqual({
      title: "Back to school",
      body: "She is in class 6 now.",
      summary: null,
      name: "Asha",
      role: null,
      reviewed: true,
    });
    const bad = (over: object) =>
      TestimonialTextInput.safeParse({ ...text, reviewed: false, ...over }).success;
    expect(bad({ title: "" })).toBe(false);
    expect(bad({ name: "" })).toBe(false);
    expect(bad({ summary: "x".repeat(301) })).toBe(false);
  });

  it("cards use the summary, else the story's first paragraph without markup, shortened", () => {
    expect(storySummary("Own summary", [{ type: "paragraph", text: "Story" }])).toBe("Own summary");
    expect(
      storySummary(null, [
        { type: "heading", level: 2, text: "Start" },
        { type: "paragraph", text: "She is **back** at [school](/en/causes/education) now." },
      ]),
    ).toBe("She is back at school now.");
    const long = storySummary(null, [{ type: "paragraph", text: "word ".repeat(80) }]);
    expect(long.length).toBeLessThanOrEqual(201);
    expect(long.endsWith("word…")).toBe(true);
    expect(storySummary(null, [])).toBe("");
  });
});

describe("menus", () => {
  it("accepts pages, items and https links with a label", () => {
    const ok = MenuInput.safeParse([
      { kind: "page", target: "about" },
      { kind: "cause", target: "school-support", labels: { hi: "स्कूल" } },
      { kind: "url", target: "https://example.org/report", labels: { en: "Report" }, hidden: true },
    ]);
    expect(ok.success).toBe(true);
  });
  it("refuses unknown pages, http links and unlabelled web links", () => {
    for (const bad of [
      [{ kind: "page", target: "nope" }],
      [{ kind: "url", target: "http://example.org", labels: { en: "x" } }],
      [{ kind: "url", target: "https://example.org" }],
      [{ kind: "news", target: "Not A Slug" }],
    ])
      expect(MenuInput.safeParse(bad).success).toBe(false);
  });
  it("header links take hand-picked or automatic sub-links (one level, at most 12)", () => {
    const header = menuInputFor("header");
    const sub = { kind: "page", target: "contact" };
    const ok = header.safeParse([
      { kind: "page", target: "about", children: [sub, { kind: "cause", target: "school-support" }] },
      { kind: "page", target: "causes", auto: "causes" },
      { kind: "page", target: "news" },
    ]);
    expect(ok.success).toBe(true);
    expect(ok.data![2]).toMatchObject({ auto: null, children: [] });
    for (const bad of [
      [{ kind: "page", target: "about", auto: "events", children: [sub] }],
      [{ kind: "page", target: "about", children: [{ ...sub, children: [sub] }] }],
      [{ kind: "page", target: "about", children: [{ ...sub, auto: "news" }] }],
      [{ kind: "page", target: "about", children: Array(13).fill(sub) }],
      [{ kind: "page", target: "about", auto: "gallery" }],
    ])
      expect(header.safeParse(bad).success).toBe(false);
  });
  it("footer menus stay flat", () => {
    const footer = menuInputFor("footer_trust");
    expect(footer.safeParse([{ kind: "page", target: "about" }]).success).toBe(true);
    expect(footer.safeParse([{ kind: "page", target: "about", auto: "news" }]).success).toBe(false);
    expect(
      footer.safeParse([{ kind: "page", target: "about", children: [{ kind: "page", target: "contact" }] }])
        .success,
    ).toBe(false);
  });
});

describe("built-in page texts (ensure defaults)", () => {
  it("covers every editable page in every language, with no empty headings", async () => {
    const { builtInPages } = await import("@/lib/admin/defaults");
    const { CONTENT_PAGES } = await import("@/lib/admin/content-pages");
    const legal = new Set(["privacy", "terms", "refund_policy", "disclaimer_80g"]);
    for (const locale of ["en", "hi", "mr", "gu"] as const) {
      const m = (await import(`@/messages/${locale}.json`)).default;
      const pages = builtInPages(m);
      for (const p of CONTENT_PAGES.filter((x) => !legal.has(x.key))) {
        const text = pages[p.key];
        expect(text?.title, `${locale}/${p.key}`).toBeTruthy();
        expect(text?.h1, `${locale}/${p.key}`).toBeTruthy();
        expect(text?.reviewed).toBe(true);
      }
      expect(HomeExtras.safeParse(pages.home!.extras).success).toBe(true);
    }
  });
});

describe("home design", () => {
  it("count-up keeps the text around the number", () => {
    expect(parseCount("1,200+ Families")).toMatchObject({ prefix: "", value: 1200, suffix: "+ Families" });
    expect(parseCount("₹5.5 lakh")).toMatchObject({ prefix: "₹", value: 5.5, decimals: 1, suffix: " lakh" });
    expect(parseCount("Hundreds")).toBeNull();
    const p = parseCount("1,20,000 meals")!;
    expect(formatCount(p, 0)).toBe("0 meals");
    expect(formatCount(p, 120000)).toBe("1,20,000 meals");
    expect(formatCount(parseCount("45 Relief Kits")!, 7)).toBe("7 Relief Kits");
  });

  it("section order: unknown keys dropped, missing ones appended; duplicates rejected", () => {
    expect(normalizeSectionOrder(["news", "old", "impact"])).toEqual([
      "news",
      "impact",
      "why",
      "story",
      "causes",
      "events",
      "testimonials",
      "band",
    ]);
    expect(normalizeSectionOrder([])[0]).toBe("impact");
    expect(SectionOrderInput.safeParse(["news", "news"]).success).toBe(false);
    expect(SectionOrderInput.safeParse(["news", "nope"]).success).toBe(false);
    expect(SectionOrderInput.safeParse(["band", "news"]).success).toBe(true);
  });

  it("cause card icon from the list, and a short card label", () => {
    const base = {
      slug: "school-kits",
      status: "draft",
      goal: "",
      is80gEligible: true,
      sortOrder: "0",
      coverImageId: "",
    };
    expect(CauseInput.parse({ ...base, icon: "education" }).icon).toBe("education");
    expect(CauseInput.parse({ ...base, icon: "" }).icon).toBeNull();
    expect(CauseInput.safeParse({ ...base, icon: "rocket" }).success).toBe(false);
    const text = { title: "T", summary: "S", body: "", seoTitle: "", seoDescription: "", reviewed: false };
    expect(CauseTextInput.parse({ ...text, tag: " Education " }).tag).toBe("Education");
    expect(CauseTextInput.parse({ ...text, tag: "" }).tag).toBeNull();
    expect(CauseTextInput.safeParse({ ...text, tag: "x".repeat(25) }).success).toBe(false);
  });
});

describe("admin sorting and hidden sections", () => {
  it("moveItem moves one item and leaves the rest in order", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    const list = ["a", "b"];
    expect(moveItem(list, 0, 1)).not.toBe(list);
  });

  it("hidden sections: known keys only, each once; the rest keep their order", () => {
    expect(HiddenSectionsInput.safeParse(["news", "band"]).success).toBe(true);
    expect(HiddenSectionsInput.safeParse([]).success).toBe(true);
    expect(HiddenSectionsInput.safeParse(["old"]).success).toBe(false);
    expect(HiddenSectionsInput.safeParse(["news", "news"]).success).toBe(false);
    expect(visibleSections(["news", "impact"], ["impact", "band"])).toEqual([
      "news",
      "why",
      "story",
      "causes",
      "events",
      "testimonials",
    ]);
  });
});

describe("pasted photos", () => {
  const png = new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });
  const clip = (files: File[], data: Record<string, string> = {}) => ({
    files: files as unknown as FileList,
    getData: (type: string) => data[type] ?? "",
  });

  it("takes the photos from a paste or drop of images", () => {
    expect(imagesFrom(clip([png]))).toEqual([png]);
    // "Copy image" in a browser: HTML that is only the <img>.
    expect(
      imagesFrom(clip([png], { "text/html": '<meta charset="utf-8"><img src="https://x/y.png">' })),
    ).toEqual([png]);
  });

  it("leaves text pastes alone, even when a picture of the text comes with them (Word)", () => {
    expect(imagesFrom(clip([png], { "text/plain": "Our annual camp" }))).toEqual([]);
    expect(imagesFrom(clip([png], { "text/html": "<p>Our <b>annual</b> camp</p>" }))).toEqual([]);
    expect(imagesFrom(clip([], { "text/plain": "hello" }))).toEqual([]);
    expect(imagesFrom(null)).toEqual([]);
  });

  it("ignores files that aren't JPEG, PNG or WebP", () => {
    const gif = new File([new Uint8Array([1])], "a.gif", { type: "image/gif" });
    const pdf = new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" });
    expect(imagesFrom(clip([gif, pdf]))).toEqual([]);
  });

  it("names screenshots by date, keeps real file names", () => {
    const at = new Date("2026-10-28T09:05:00Z");
    expect(pastedName(png, at)).toBe("pasted-202610280905.png");
    expect(pastedName(new File([], "camp-day.jpg", { type: "image/jpeg" }), at)).toBe("camp-day.jpg");
  });
});
