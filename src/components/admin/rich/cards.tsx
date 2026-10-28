"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { createContext, useContext, useId } from "react";
import { cn } from "@/lib/cn";
import { compactControl } from "../ui";

export type PhotoInfo = { thumb: string | null; label: string; alt: string | null };
/** Thumbnails and names for library photos, by media id (from the page's library + preview views). */
export const PhotoLookup = createContext<(id: string) => PhotoInfo | undefined>(() => undefined);

const small =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle";

function Thumb({ id }: { id: string }) {
  const info = useContext(PhotoLookup)(id);
  return (
    <span className="grid gap-1">
      {info?.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail of a library photo
        <img src={info.thumb} alt="" className="h-24 w-32 rounded-sm object-cover" />
      ) : (
        <span className="grid h-24 w-32 place-items-center rounded-sm bg-bg-muted text-xs text-fg-muted">
          No preview
        </span>
      )}
      <span className="max-w-32 truncate text-xs text-fg-muted">{info?.label ?? "Missing photo"}</span>
      {info && !info.alt ? (
        <span className="max-w-32 text-xs text-status-error-fg-on-canvas">No alt text yet</span>
      ) : null}
    </span>
  );
}

function Card({
  title,
  props,
  children,
}: {
  title: string;
  props: NodeViewProps;
  children: React.ReactNode;
}) {
  const captionId = useId();
  return (
    <NodeViewWrapper
      as="figure"
      contentEditable={false}
      className={cn(
        "m-0 grid gap-2 rounded-md border border-border-decorative bg-bg-subtle p-3",
        props.selected && "outline-2 outline-offset-2 outline-focus-ring",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-fg-muted uppercase" data-drag-handle>
          {title}
        </span>
        <button type="button" className={small} onClick={() => props.deleteNode()}>
          Remove {title.toLowerCase()}
        </button>
      </div>
      {children}
      <label htmlFor={captionId} className="grid gap-1 text-sm">
        <span className="font-medium text-fg-strong">Caption (optional)</span>
        <input
          id={captionId}
          value={String(props.node.attrs.caption ?? "")}
          maxLength={200}
          onChange={(e) => props.updateAttributes({ caption: e.target.value })}
          className={compactControl}
        />
      </label>
    </NodeViewWrapper>
  );
}

export function PhotoCard(props: NodeViewProps) {
  return (
    <Card title="Photo" props={props}>
      <Thumb id={String(props.node.attrs.mediaId)} />
    </Card>
  );
}

export function SliderCard(props: NodeViewProps) {
  const ids = (props.node.attrs.mediaIds ?? []) as string[];
  return (
    <Card title={`Slider · ${ids.length} photos`} props={props}>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <Thumb key={id} id={id} />
        ))}
      </div>
    </Card>
  );
}
