import { describe, expect, it } from "vitest";
import type { Blocks } from "@/lib/content/blocks";
import { blocksToMarkup, markupToBlocks } from "@/lib/content/markup";
import { blocksToDoc, docToBlocks, nodesToInline } from "@/lib/content/rich";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

describe("visual editor ↔ content blocks", () => {
  it("round-trips every block type", () => {
    const blocks: Blocks = [
      { type: "heading", level: 2, text: "Our founder" },
      { type: "paragraph", text: "She started with **flood relief** in [Mumbai](/en/causes) and more." },
      { type: "heading", level: 3, text: "Vision" },
      { type: "list", items: ["Education", "Health **camps**"] },
      { type: "list", ordered: true, items: ["First", "Second"] },
      { type: "callout", tone: "info", text: "Donations are eligible under 80G." },
      { type: "callout", tone: "warning", text: "Indian donors only." },
      { type: "image", mediaId: ID1, caption: "Relief kits" },
      { type: "image", mediaId: ID2 },
      { type: "slider", mediaIds: [ID1, ID2] },
    ];
    expect(docToBlocks(blocksToDoc(blocks))).toEqual(blocks);
    // …and the text the form posts reads back as the same blocks.
    expect(markupToBlocks(blocksToMarkup(docToBlocks(blocksToDoc(blocks)))).blocks).toEqual(blocks);
  });

  it("an empty document is one empty paragraph and saves as nothing", () => {
    const doc = blocksToDoc([]);
    expect(doc.content).toEqual([{ type: "paragraph" }]);
    expect(docToBlocks(doc)).toEqual([]);
  });

  it("joins marks and keeps spaces outside them", () => {
    expect(
      nodesToInline([
        { type: "text", text: "Give " },
        { type: "text", text: "every ", marks: [{ type: "bold" }] },
        { type: "text", text: "month", marks: [{ type: "bold" }] },
        { type: "text", text: "  to " },
        {
          type: "text",
          text: "a cause",
          marks: [{ type: "bold" }, { type: "link", attrs: { href: "/en/causes" } }],
        },
      ]),
    ).toBe("Give **every month** to [a cause](/en/causes)");
  });

  it("drops unsafe links and empty blocks, flattens pasted nested lists", () => {
    const blocks = docToBlocks({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] },
          ],
        },
        { type: "paragraph" },
        { type: "heading", attrs: { level: 2 } },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Food" }] },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [{ type: "paragraph", content: [{ type: "text", text: "Rice" }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "slider", attrs: { mediaIds: [ID1], caption: "" } },
      ],
    });
    expect(blocks).toEqual([
      { type: "paragraph", text: "x" },
      { type: "list", items: ["Food", "Rice"] },
      { type: "image", mediaId: ID1 },
    ]);
  });
});
