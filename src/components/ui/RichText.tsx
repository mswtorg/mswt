import { Fragment } from "react";
import { parseInline, type Blocks } from "@/lib/content/blocks";
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
    <div className="grid max-w-prose gap-4">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.level === 2 ? (
              <h2 key={i} className="mt-4 text-2xl">
                <InlineText text={b.text} />
              </h2>
            ) : (
              <h3 key={i} className="mt-2 text-xl">
                <InlineText text={b.text} />
              </h3>
            );
          case "paragraph":
            return (
              <p key={i}>
                <InlineText text={b.text} />
              </p>
            );
          case "list": {
            const List = b.ordered ? "ol" : "ul";
            return (
              <List key={i} className={b.ordered ? "list-decimal pl-6" : "list-disc pl-6"}>
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
              <Alert key={i} tone={b.tone}>
                <p>
                  <InlineText text={b.text} />
                </p>
              </Alert>
            );
          case "slider": {
            const photos = b.mediaIds.map((id) => media[id]).filter((m): m is SlidePhoto => Boolean(m?.alt));
            const missing = b.mediaIds.length - photos.length;
            return (
              <figure key={i} className="m-0 grid gap-2">
                {missing && markMissing ? (
                  <Alert tone="warning">
                    <p>{missing} photo(s) hidden: alt text missing in this language, or not found.</p>
                  </Alert>
                ) : null}
                <PhotoSlider photos={photos} t={photoStrings} />
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
                <Alert key={i} tone="warning">
                  <p>{image ? "Photo hidden: alt text missing in this language." : "Photo not found."}</p>
                </Alert>
              );
            }
            return (
              <figure key={i} className="m-0 grid gap-2">
                <ResponsiveImage image={image} alt={image.alt} />
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
