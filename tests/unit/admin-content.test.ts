import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MenuInput, menuInputFor } from "@/lib/admin/menus";
import { HomeExtras } from "@/lib/content/home";
import { blocksToMarkup, imageIds, markupToBlocks } from "@/lib/content/markup";
import { mediaSlug } from "@/lib/media/process";
import { imageView } from "@/lib/media/view";

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
