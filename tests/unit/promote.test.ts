import { describe, expect, it } from "vitest";
import { compare, show } from "@/lib/promote/diff";
import { kindOf, type Row, type UnitType } from "@/lib/promote/kinds";
import { hashOf, normalise, stable, type Unit } from "@/lib/promote/snapshot";

function unit(type: UnitType, id: string, compareData: Row, extra: Partial<Unit> = {}): Unit {
  const k = kindOf(type);
  return {
    type,
    area: k.area,
    id,
    ref: `${type}:${id}`,
    title: id,
    slug: null,
    status: null,
    root: null,
    children: {},
    mediaIds: [],
    compare: compareData,
    hash: hashOf(compareData),
    ...extra,
  };
}

describe("Move from stage: comparing", () => {
  it("leaves out timestamps, who did it, and environment fields", () => {
    const row = {
      id: "x",
      title: "A",
      updatedAt: new Date(),
      createdAt: new Date(),
      updatedBy: "u1",
      reviewedBy: "u2",
      reviewedAt: new Date(),
      raisedPaise: 5,
    };
    expect(normalise(row, kindOf("cause").keep)).toEqual({ id: "x", title: "A", reviewed: true });
    expect(kindOf("seo").keep).toEqual(["indexnowKey"]);
    expect(kindOf("payment").keep).toEqual(["providerMode"]);
  });

  it("gives the same hash for the same content in any key order", () => {
    expect(stable({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      stable({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
    expect(hashOf({ a: 1, b: 2 })).toBe(hashOf({ b: 2, a: 1 }));
    expect(hashOf({ a: 1 })).not.toBe(hashOf({ a: 2 }));
  });

  it("sorts items into new, changed, same, only on production and clash", () => {
    const tr = (title: string, reviewed = true) => [{ locale: "hi", title, reviewed }];
    const stage = [
      unit("cause", "same", { fields: { slug: "a" }, translations: tr("A") }),
      unit("cause", "edited", { fields: { slug: "b", goalPaise: 200 }, translations: tr("New", true) }),
      unit("cause", "added", { fields: { slug: "c" } }, { slug: "c" }),
      unit("news", "stage-news", { fields: { slug: "dup" } }, { slug: "dup" }),
    ];
    const prod = [
      unit("cause", "same", { fields: { slug: "a" }, translations: tr("A") }),
      unit("cause", "edited", { fields: { slug: "b", goalPaise: 100 }, translations: tr("Old", false) }),
      unit("news", "prod-news", { fields: { slug: "dup" } }, { slug: "dup" }),
      unit("event", "gone", { fields: {} }),
    ];
    const rows = Object.fromEntries(compare(stage, prod).map((r) => [r.id, r]));
    expect(rows.same?.status).toBe("same");
    expect(rows.added?.status).toBe("new");
    expect(rows["stage-news"]?.status).toBe("clash");
    expect(rows["stage-news"]?.note).toMatch(/“dup”/);
    expect(rows.gone?.status).toBe("prod_only");
    expect(rows.edited?.status).toBe("changed");
    expect(rows.edited?.changes).toEqual([
      { label: "Goal", before: "100", after: "200" },
      { label: "Hindi: Reviewed", before: "no", after: "yes" },
      { label: "Hindi: Title", before: "Old", after: "New" },
    ]);
  });

  it("lists added and removed languages, album photos and photo details", () => {
    const photo = (alt: string) => [{ id: "m1", r2Key: "media/m1/x", alt: [{ locale: "en", altText: alt }] }];
    const stage = unit("album", "a", {
      fields: {},
      translations: [{ locale: "en", title: "T" }],
      photos: [{ mediaId: "m1" }, { mediaId: "m2" }],
      media: photo("New alt"),
    });
    const prod = unit("album", "a", {
      fields: {},
      translations: [{ locale: "mr", title: "T" }],
      photos: [{ mediaId: "m1" }],
      media: photo("Old alt"),
    });
    expect(compare([stage], [prod])[0]?.changes.map((c) => c.label)).toEqual([
      "English text added",
      "Marathi text removed",
      "Photos in the album",
      "Photo details (alt text or file): 1 photo",
    ]);
  });

  it("shows values shortly", () => {
    expect(show(null)).toBe("(empty)");
    expect(show(true)).toBe("yes");
    expect(show([1, 2])).toBe("2 items");
    expect(show("x".repeat(200))).toHaveLength(138);
  });

  it("collects the photos an item uses, from columns and text", () => {
    const media = kindOf("cause").media!(
      { coverImageId: "c", photoIds: ["p1", "p2"] },
      {
        translations: [
          {
            body: [
              { type: "image", mediaId: "b1" },
              { type: "slider", mediaIds: ["b2"] },
            ],
          },
        ],
      },
    );
    expect(media).toEqual(["c", "p1", "p2", "b1", "b2"]);
    expect(
      kindOf("organization").media!(
        { logoMediaId: "l", signatureMediaId: null, trustees: [{ photoMediaId: "t" }, {}] },
        {},
      ),
    ).toEqual(["l", null, "t", undefined]);
  });
});
