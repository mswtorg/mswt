"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { createContext, useContext, useId } from "react";
import { cn } from "@/lib/cn";
import { compactControl } from "../ui";

export type PhotoInfo = { thumb: string | null; label: string; alt: string | null };
/** Thumbnails and names for library photos, by media id (from the page's library + preview views). */
export const PhotoLookup = createContext<(id: string) => PhotoInfo | undefined>(() => undefined);

/**
 * The cards' own controls (caption, position, size) are kept out of the page's form: they are not
 * posted (the editor's text is), and the form's reset after each save must not blank them.
 * No element has this id, so the browser gives these controls no form.
 */
const NO_FORM = "rich-editor-card-controls";

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
          form={NO_FORM}
          onChange={(e) => props.updateAttributes({ caption: e.target.value })}
          className={compactControl}
        />
      </label>
    </NodeViewWrapper>
  );
}

const POSITIONS = [
  ["", "Full width"],
  ["center", "Centre"],
  ["left", "Left, text on the right"],
  ["right", "Right, text on the left"],
] as const;
const SIZES = [
  ["small", "Small (a third of the width)"],
  ["medium", "Medium (half)"],
  ["large", "Large (two thirds)"],
] as const;

/** A labelled select inside a photo card (writes one node attribute). */
function LayoutSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid gap-1 text-sm">
      <span className="font-medium text-fg-strong">{label}</span>
      <select
        id={id}
        value={value}
        form={NO_FORM}
        onChange={(e) => onChange(e.target.value)}
        className={compactControl}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A small sketch of the layout: the photo (filled) and the text lines around it. */
function LayoutSketch({ align, size }: { align: string; size: string }) {
  const w = !align ? 100 : size === "small" ? 33 : size === "large" ? 66 : 50;
  const photoX = align === "right" ? 100 - w : align === "center" ? (100 - w) / 2 : 0;
  const beside = align === "left" || align === "right";
  return (
    <svg viewBox="0 0 100 40" aria-hidden="true" className="h-10 w-24 text-fg-muted">
      <rect x={photoX} y="0" width={w} height="24" rx="2" className="fill-current opacity-60" />
      {beside
        ? [4, 10, 16].map((y) => (
            <rect
              key={y}
              x={align === "left" ? w + 4 : 0}
              y={y}
              width={100 - w - 4}
              height="3"
              className="fill-current opacity-30"
            />
          ))
        : null}
      {[30, 36].map((y) => (
        <rect key={y} x="0" y={y} width="100" height="3" className="fill-current opacity-30" />
      ))}
    </svg>
  );
}

export function PhotoCard(props: NodeViewProps) {
  const align = String(props.node.attrs.align ?? "");
  const size = String(props.node.attrs.size ?? "") || "medium";
  return (
    <Card title="Photo" props={props}>
      <div className="flex flex-wrap items-end gap-4">
        <Thumb id={String(props.node.attrs.mediaId)} />
        <LayoutSelect
          label="Position"
          value={align}
          options={POSITIONS}
          onChange={(v) => props.updateAttributes({ align: v, size: v ? size : "" })}
        />
        {align ? (
          <LayoutSelect
            label="Size"
            value={size}
            options={SIZES}
            onChange={(v) => props.updateAttributes({ size: v })}
          />
        ) : null}
        <LayoutSketch align={align} size={size} />
      </div>
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
      <div className="max-w-xs">
        <LayoutSelect
          label="Size"
          value={String(props.node.attrs.size ?? "")}
          options={[
            ["", "Full width"],
            ["large", "Large (two thirds, centred)"],
            ["medium", "Medium (half, centred)"],
          ]}
          onChange={(v) => props.updateAttributes({ size: v })}
        />
      </div>
    </Card>
  );
}
