import { Fragment } from "react";
import { parseInline, type Block, type Blocks } from "@/lib/content/blocks";
import { cn } from "@/lib/cn";
import type { ImageView } from "@/lib/media/view";
import { ResponsiveImage } from "@/components/content/ResponsiveImage";
import { PhotoSlider, type PhotoStrings, type SlidePhoto } from "@/components/content/PhotoSlider";
import { Alert } from "./Alert";

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) =>
        part.kind === "bold" ? (
          <strong key={i}>{part.text}</strong>
        ) : part.kind === "link" ? (
          <a
            key={i}
            href={part.href}
            className="text-link-default underline underline-offset-4 hover:text-link-hover"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

type ImageBlock = Extract<Block, { type: "image" }>;
const WIDTH = { small: "md:w-1/3", medium: "md:w-1/2", large: "md:w-2/3" } as const;
const SIZES = {
  small: "(min-width: 1280px) 400px, (min-width: 768px) 33vw, 100vw",
  medium: "(min-width: 1280px) 608px, (min-width: 768px) 50vw, 100vw",
  large: "(min-width: 1280px) 810px, (min-width: 768px) 66vw, 100vw",
} as const;

/** A photo's place in the text: full width, centred, or floated with the text beside it (md+). */
function photoLayout(b: ImageBlock): { className: string; sizes: string } {
  if (!b.align) return { className: "", sizes: "(min-width: 1280px) 1216px, 100vw" };
  const size = b.size ?? "medium";
  const place =
    b.align === "left"
      ? "md:float-left md:mr-6 md:mb-4"
      : b.align === "right"
        ? "md:float-right md:ml-6 md:mb-4"
        : "mx-auto";
  return { className: cn(WIDTH[size], place), sizes: SIZES[size] };
}

/** Space above each block (the first has none). Normal flow, not a grid, so photos can float. */
const gap = "mt-4 first:mt-0";

/**
 * Renders stored content blocks. Text is always escaped by React; only safe links are allowed.
 * Image blocks need `media` (from getMediaViews); an image without alt text in this language is
 * left out, or shown as a marked placeholder when `markMissing` (previews and the admin editor).
 */
export function RichText({
  blocks,
  media = {},
  markMissing = false,
  photoStrings,
}: {
  blocks: Blocks;
  media?: Record<string, ImageView>;
  markMissing?: boolean;
  /** Slider labels in the page's language (English when omitted, e.g. the admin preview). */
  photoStrings?: PhotoStrings;
}) {
  return (
    <div className="flow-root">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.level === 2 ? (
              <h2 key={i} className="mt-8 clear-both text-2xl first:mt-0">
                <InlineText text={b.text} />
              </h2>
            ) : (
              <h3 key={i} className="mt-6 clear-both text-xl first:mt-0">
                <InlineText text={b.text} />
              </h3>
            );
          case "paragraph":
            return (
              <p key={i} className={gap}>
                <InlineText text={b.text} />
              </p>
            );
          case "list": {
            const List = b.ordered ? "ol" : "ul";
            return (
              // flow-root: beside a floated photo, the list (and its markers) sits next to it, not under.
              <List key={i} className={cn(gap, "flow-root pl-6", b.ordered ? "list-decimal" : "list-disc")}>
                {b.items.map((item, j) => (
                  <li key={j} className="mb-1">
                    <InlineText text={item} />
                  </li>
                ))}
              </List>
            );
          }
          case "callout":
            return (
              <Alert key={i} tone={b.tone} className={cn(gap, "overflow-hidden")}>
                <p>
                  <InlineText text={b.text} />
                </p>
              </Alert>
            );
          case "slider": {
            const photos = b.mediaIds.map((id) => media[id]).filter((m): m is SlidePhoto => Boolean(m?.alt));
            const missing = b.mediaIds.length - photos.length;
            return (
              <figure
                key={i}
                className={cn(
                  gap,
                  "mb-0 grid gap-2",
                  b.size ? cn("clear-both mx-auto", WIDTH[b.size]) : "mx-0",
                )}
              >
                {missing && markMissing ? (
                  <Alert tone="warning">
                    <p>{missing} photo(s) hidden: alt text missing in this language, or not found.</p>
                  </Alert>
                ) : null}
                <PhotoSlider photos={photos} t={photoStrings} {...(b.size ? { sizes: SIZES[b.size] } : {})} />
                {b.caption ? (
                  <figcaption className="text-sm text-fg-muted">
                    <InlineText text={b.caption} />
                  </figcaption>
                ) : null}
              </figure>
            );
          }
          case "image": {
            const image = media[b.mediaId];
            if (!image?.alt) {
              if (!markMissing) return null;
              return (
                <Alert key={i} tone="warning" className={gap}>
                  <p>{image ? "Photo hidden: alt text missing in this language." : "Photo not found."}</p>
                </Alert>
              );
            }
            const layout = photoLayout(b);
            return (
              <figure
                key={i}
                className={cn(gap, "mb-0 grid gap-2", b.align === "center" ? "" : "mx-0", layout.className)}
              >
                <ResponsiveImage image={image} alt={image.alt} sizes={layout.sizes} />
                {b.caption ? (
                  <figcaption className="text-sm text-fg-muted">
                    <InlineText text={b.caption} />
                  </figcaption>
                ) : null}
              </figure>
            );
          }
        }
      })}
    </div>
  );
}
