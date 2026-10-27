import { safeHref, type Block, type Blocks } from "./blocks";

/**
 * The admin's text format for content blocks (Step 8c). One block per paragraph, separated by a
 * blank line:
 *
 *   ## Heading            ### Smaller heading
 *   - item / 1. item      (consecutive lines make one list)
 *   > Note                >! Warning note
 *   ![Caption](media:ID)  (a photo from the media library, alone on its line)
 *   !slider[Caption](media:ID,ID,…)  (2–20 photos shown as a slider)
 *
 * Inline: **bold** and [label](https://… | /path | mailto: | tel:). Stored as typed blocks, never HTML.
 */
export type MarkupError = { line: number; message: string };

const IMAGE = /^!\[([^\]]*)\]\(media:([0-9a-f-]{36})\)$/i;
const SLIDER = /^!slider\[([^\]]*)\]\(media:([^)]*)\)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Links only: "![…](media:…)" is an image line, checked separately.
const LINK = /(?<!!)\[([^\]]+)\]\(([^)\s]*)\)/g;
const ORDERED = /^\d+\.\s+/;

export function markupToBlocks(text: string): { blocks: Blocks; errors: MarkupError[] } {
  const blocks: Blocks = [];
  const errors: MarkupError[] = [];
  let para: string[] = [];
  let list: Extract<Block, { type: "list" }> | null = null;
  let note: Extract<Block, { type: "callout" }> | null = null;

  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", text: para.join(" ") });
    para = [];
    list = null;
    note = null;
  };
  const checkLinks = (line: string, n: number) => {
    for (const m of line.matchAll(LINK))
      if (!safeHref(m[2]!))
        errors.push({
          line: n,
          message: `Line ${n}: the link “${m[1]}” must start with https://, /, mailto: or tel:`,
        });
  };

  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((raw, i) => {
      const n = i + 1;
      const line = raw.trim();
      if (!line) return flush();
      // Photo lines ("![…](media:…)", "!slider[…](media:…)") are checked below, not as links.
      if (!line.startsWith("!")) checkLinks(line, n);

      if (line.toLowerCase().startsWith("!slider[")) {
        flush();
        const m = SLIDER.exec(line);
        const ids = m
          ? m[2]!
              .split(",")
              .map((x) => x.trim().toLowerCase())
              .filter(Boolean)
          : [];
        if (!m || ids.some((id) => !UUID.test(id)))
          errors.push({ line: n, message: `Line ${n}: insert sliders with the “Insert slider” button` });
        else if (ids.length < 2 || ids.length > 20)
          errors.push({ line: n, message: `Line ${n}: a slider needs 2 to 20 photos` });
        else blocks.push({ type: "slider", mediaIds: ids, ...(m[1] ? { caption: m[1] } : {}) });
        return;
      }

      const heading = /^(#+)\s*(.*)$/.exec(line);
      if (heading) {
        flush();
        const level = heading[1]!.length;
        if (level !== 2 && level !== 3)
          errors.push({ line: n, message: `Line ${n}: use ## for a heading or ### for a smaller one` });
        else if (!heading[2]) errors.push({ line: n, message: `Line ${n}: the heading is empty` });
        else blocks.push({ type: "heading", level: level as 2 | 3, text: heading[2] });
        return;
      }

      if (line.startsWith("![")) {
        flush();
        const m = IMAGE.exec(line);
        if (!m) errors.push({ line: n, message: `Line ${n}: insert photos with the “Insert image” button` });
        else blocks.push({ type: "image", mediaId: m[2]!.toLowerCase(), ...(m[1] ? { caption: m[1] } : {}) });
        return;
      }

      const bullet = line.startsWith("- ") || line.startsWith("* ");
      const ordered = ORDERED.test(line);
      if (bullet || ordered) {
        const item = (bullet ? line.slice(2) : line.replace(ORDERED, "")).trim();
        if (para.length || note) flush();
        if (!item) return void errors.push({ line: n, message: `Line ${n}: the list item is empty` });
        const current = list as Extract<Block, { type: "list" }> | null;
        if (current && Boolean(current.ordered) === ordered) current.items.push(item);
        else {
          list = ordered ? { type: "list", ordered: true, items: [item] } : { type: "list", items: [item] };
          blocks.push(list);
        }
        return;
      }

      if (line.startsWith(">")) {
        const warning = line.startsWith(">!");
        const body = line.slice(warning ? 2 : 1).trim();
        if (para.length || list) flush();
        const current = note as Extract<Block, { type: "callout" }> | null;
        if (!body) return;
        if (current && current.tone === (warning ? "warning" : "info")) current.text += ` ${body}`;
        else {
          note = { type: "callout", tone: warning ? "warning" : "info", text: body };
          blocks.push(note);
        }
        return;
      }

      if (list || note) flush();
      para.push(line);
    });
  flush();
  return { blocks, errors };
}

/** The editor's starting text for stored blocks. `markupToBlocks(blocksToMarkup(b))` gives `b` back. */
export function blocksToMarkup(blocks: Blocks): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `${"#".repeat(b.level)} ${b.text}`;
        case "paragraph":
          return b.text;
        case "list":
          return b.items.map((item, i) => (b.ordered ? `${i + 1}. ${item}` : `- ${item}`)).join("\n");
        case "callout":
          return `${b.tone === "warning" ? ">!" : ">"} ${b.text}`;
        case "image":
          return `![${b.caption ?? ""}](media:${b.mediaId})`;
        case "slider":
          return `!slider[${b.caption ?? ""}](media:${b.mediaIds.join(",")})`;
      }
    })
    .join("\n\n");
}

/** Media ids used by image blocks (for alt-text checks and "used in"). */
export function imageIds(blocks: Blocks): string[] {
  return [
    ...new Set(
      blocks.flatMap((b) => (b.type === "image" ? [b.mediaId] : b.type === "slider" ? b.mediaIds : [])),
    ),
  ];
}
