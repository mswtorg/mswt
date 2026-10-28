import type { JSONContent } from "@tiptap/core";
import {
  parseInline,
  PHOTO_ALIGNS,
  PHOTO_SIZES,
  safeHref,
  SLIDER_SIZES,
  type Block,
  type Blocks,
  type PhotoAlign,
  type PhotoSize,
  type SliderSize,
} from "./blocks";

/**
 * Content blocks ↔ the visual editor's document (Tiptap JSON). The editor only offers what blocks
 * can store: headings (2, 3), paragraphs, lists, notes/warnings, library photos and sliders, with
 * **bold** and links inline. Anything else (pasted from Word, Google Docs…) is reduced to that.
 * `docToBlocks(blocksToDoc(b))` gives `b` back.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };

function inlineToNodes(text: string): JSONContent[] {
  return parseInline(text).flatMap((p): JSONContent[] =>
    !p.text
      ? []
      : p.kind === "bold"
        ? [{ type: "text", text: p.text, marks: [{ type: "bold" }] }]
        : p.kind === "link"
          ? [{ type: "text", text: p.text, marks: [{ type: "link", attrs: { href: p.href } }] }]
          : [{ type: "text", text: p.text }],
  );
}

/** Inline editor content → stored inline text (**bold**, [label](href)); whitespace collapsed. */
export function nodesToInline(nodes: readonly JSONContent[] | undefined): string {
  // Join neighbouring text with the same mark first, so "**a****b**" never appears.
  const runs: { text: string; bold: boolean; href: string | null }[] = [];
  for (const n of nodes ?? []) {
    if (n.type !== "text" || !n.text) continue;
    const marks = (n.marks ?? []) as Mark[];
    const link = marks.find((m) => m.type === "link");
    const href = link ? safeHref(String(link.attrs?.href ?? "")) : null;
    // Markup has no bold inside a link: a bold link is stored as a link.
    const bold = !href && marks.some((m) => m.type === "bold");
    const text = n.text.replace(/\s+/g, " ");
    const last = runs.at(-1);
    if (last && last.bold === bold && last.href === href) last.text += text;
    else runs.push({ text, bold, href });
  }
  return runs
    .map((r) => {
      // Spaces stay outside the markers: "**word** next", never "**word **next".
      const [, lead, core, trail] = /^(\s*)(.*?)(\s*)$/s.exec(r.text)!;
      if (!core) return r.text;
      if (r.href) return `${lead}[${core}](${r.href})${trail}`;
      if (r.bold) return `${lead}**${core}**${trail}`;
      return r.text;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function blocksToDoc(blocks: Blocks): JSONContent {
  const content = blocks.map((b): JSONContent => {
    switch (b.type) {
      case "heading":
        return { type: "heading", attrs: { level: b.level }, content: inlineToNodes(b.text) };
      case "paragraph":
        return { type: "paragraph", content: inlineToNodes(b.text) };
      case "list":
        return {
          type: b.ordered ? "orderedList" : "bulletList",
          content: b.items.map((item) => ({
            type: "listItem",
            content: [{ type: "paragraph", content: inlineToNodes(item) }],
          })),
        };
      case "callout":
        return { type: "callout", attrs: { tone: b.tone }, content: inlineToNodes(b.text) };
      case "image":
        return {
          type: "photo",
          attrs: { mediaId: b.mediaId, caption: b.caption ?? "", size: b.size ?? "", align: b.align ?? "" },
        };
      case "slider":
        return {
          type: "slider",
          attrs: { mediaIds: b.mediaIds, caption: b.caption ?? "", size: b.size ?? "" },
        };
    }
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** A photo node's layout: a position (none: full width) and, with one, a size (default medium). */
function photoAttrs(n: JSONContent): { size?: PhotoSize; align?: PhotoAlign } {
  const align = String(n.attrs?.align ?? "");
  if (!(PHOTO_ALIGNS as readonly string[]).includes(align)) return {};
  const size = String(n.attrs?.size ?? "");
  return {
    align: align as PhotoAlign,
    ...((PHOTO_SIZES as readonly string[]).includes(size) ? { size: size as PhotoSize } : {}),
  };
}

/** Text of a node that should hold inline content but may hold paragraphs (pasted lists, notes). */
function textOf(node: JSONContent): string {
  const inline = (node.content ?? []).flatMap((c) => (c.type === "text" ? [c] : (c.content ?? [])));
  return nodesToInline(inline);
}

export function docToBlocks(doc: JSONContent): Blocks {
  const blocks: Blocks = [];
  const walk = (nodes: readonly JSONContent[] | undefined) => {
    for (const n of nodes ?? []) {
      switch (n.type) {
        case "heading": {
          const text = textOf(n);
          if (text) blocks.push({ type: "heading", level: n.attrs?.level === 3 ? 3 : 2, text });
          break;
        }
        case "paragraph": {
          const text = textOf(n);
          if (text) blocks.push({ type: "paragraph", text });
          break;
        }
        case "bulletList":
        case "orderedList": {
          // Nested lists (pasted) are flattened into the same list.
          const items: string[] = [];
          const collect = (list: JSONContent) => {
            for (const li of list.content ?? []) {
              const text = nodesToInline(
                (li.content ?? []).filter((c) => c.type === "paragraph").flatMap((c) => c.content ?? []),
              );
              if (text) items.push(text);
              for (const sub of li.content ?? [])
                if (sub.type === "bulletList" || sub.type === "orderedList") collect(sub);
            }
          };
          collect(n);
          if (items.length)
            blocks.push(
              n.type === "orderedList" ? { type: "list", ordered: true, items } : { type: "list", items },
            );
          break;
        }
        case "callout": {
          const text = textOf(n);
          if (text)
            blocks.push({ type: "callout", tone: n.attrs?.tone === "warning" ? "warning" : "info", text });
          break;
        }
        case "photo": {
          const mediaId = String(n.attrs?.mediaId ?? "");
          const caption = String(n.attrs?.caption ?? "").trim();
          if (mediaId)
            blocks.push({
              type: "image",
              mediaId,
              ...(caption ? { caption } : {}),
              ...photoAttrs(n),
            } as Block);
          break;
        }
        case "slider": {
          const mediaIds = (n.attrs?.mediaIds ?? []) as string[];
          const caption = String(n.attrs?.caption ?? "").trim();
          const size = (SLIDER_SIZES as readonly string[]).includes(String(n.attrs?.size))
            ? { size: n.attrs!.size as SliderSize }
            : {};
          if (mediaIds.length >= 2)
            blocks.push({ type: "slider", mediaIds, ...(caption ? { caption } : {}), ...size });
          else if (mediaIds.length === 1)
            blocks.push({ type: "image", mediaId: mediaIds[0]!, ...(caption ? { caption } : {}) });
          break;
        }
        default:
          // Unknown wrappers (pasted blockquotes, tables…) keep their text.
          walk(n.content);
      }
    }
  };
  walk(doc.content);
  return blocks;
}
