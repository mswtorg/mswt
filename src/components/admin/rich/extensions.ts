import { mergeAttributes, Node } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import { ListItem } from "@tiptap/extension-list";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { safeHref } from "@/lib/content/blocks";
import { PhotoCard, SliderCard } from "./cards";

/** Headings 2 and 3 only; pasted h1 becomes 2, h4–h6 become 3 (Word and Google Docs use h1). */
const BlockHeading = Heading.extend({
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((n) => ({ tag: `h${n}`, attrs: { level: n <= 2 ? 2 : 3 } }));
  },
}).configure({ levels: [2, 3] });

/** A list item is one line of text: no nested lists (blocks can't store them). */
const FlatListItem = ListItem.extend({ content: "paragraph" });

/** Note or warning (an Alert on the site): one paragraph of text. */
const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "info",
        parseHTML: (el) => (el.getAttribute("data-callout") === "warning" ? "warning" : "info"),
        renderHTML: (a) => ({ "data-callout": a.tone }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },
});

/** A media-library photo. Only made by "Insert photo": pasted <img> tags are dropped. */
const Photo = Node.create({
  name: "photo",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { mediaId: { default: "" }, caption: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-photo]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-photo": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PhotoCard, { stopEvent: ({ event }) => isField(event.target) });
  },
});

/** Two or more library photos shown as a slider. */
const Slider = Node.create({
  name: "slider",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { mediaIds: { default: [] }, caption: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "figure[data-slider]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-slider": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SliderCard, { stopEvent: ({ event }) => isField(event.target) });
  },
});

// Typing in a card's caption field or pressing its buttons must not move the editor's cursor.
const isField = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLButtonElement;

/** Everything the visual editor offers: exactly what content blocks can store. */
export const richExtensions = [
  StarterKit.configure({
    heading: false,
    listItem: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    hardBreak: false,
    horizontalRule: false,
    italic: false,
    strike: false,
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: "https",
      isAllowedUri: (url) => Boolean(safeHref(url)),
      HTMLAttributes: { rel: null, target: null },
    },
  }),
  BlockHeading,
  FlatListItem,
  Callout,
  Photo,
  Slider,
];
