"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { routing, type Locale } from "@/i18n/routing";
import { moveItem } from "@/lib/admin/order";
import { LANGUAGES } from "@/lib/admin/languages";
import type { ReceiptKind } from "@/lib/receipts/numbering";
import {
  ACK_REASONS,
  BLOCK_LABEL,
  type AckReason,
  type EmailTemplate,
  type EmailTemplates,
  type FieldDef,
  type PdfBlock,
  type PdfTemplate,
} from "@/lib/receipts/template";
import { compactControl } from "./ui";

type PreviewResult =
  { ok: true; pdf?: string; email?: { subject: string; html: string } } | { ok: false; error: string };
type Preview = (
  part: ReceiptKind | "email",
  json: string,
  opts: { reason?: AckReason; locale?: Locale; emailKind?: ReceiptKind },
) => Promise<PreviewResult>;

const small =
  "inline-flex min-h-9 items-center rounded-md border border-border-input bg-bg-canvas px-2.5 text-sm font-medium text-fg-default hover:bg-bg-subtle disabled:opacity-40";
const fieldId = (form: string, name: string) => `${form}-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

/** Stable keys for blocks, so a moved block keeps its inputs (and focus). */
const keys = new WeakMap<object, string>();
let seq = 0;
const keyOf = (o: object) => keys.get(o) ?? (keys.set(o, `b${++seq}`), keys.get(o)!);
const carry = <T extends object>(from: object, to: T): T => (keys.set(to, keyOf(from)), to);

const NEW_BLOCK: Record<PdfBlock["type"], () => PdfBlock> = {
  header: () => ({ type: "header", logo: true, title: "", text: "No. {receipt.number}" }),
  text: () => ({ type: "text", text: "", style: "normal", align: "left" }),
  row: () => ({ type: "row", label: "", value: "", hideIfEmpty: true }),
  rule: () => ({ type: "rule", style: "thin" }),
  space: () => ({ type: "space", size: "small" }),
  footer: () => ({ type: "footer", text: "" }),
};

/** Tells the surrounding AdminForm that something changed (its "unsaved changes" bar). */
function useChanged() {
  const hidden = useRef<HTMLInputElement>(null);
  const changed = () =>
    queueMicrotask(() => hidden.current?.dispatchEvent(new Event("change", { bubbles: true })));
  return { hidden, changed };
}

/** A text box with an "Insert field" menu that puts {field} where the cursor is. */
function FieldText({
  id,
  label,
  value,
  onChange,
  fields,
  rows,
  hint,
  lang,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  fields: FieldDef[];
  rows?: number;
  hint?: string;
  lang?: string;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const groups = [...new Set(fields.map((f) => f.group))];
  const insert = (key: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? at;
    const token = `{${key}}`;
    onChange(value.slice(0, at) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  const control = {
    id,
    ref,
    value,
    lang,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  return (
    <div className="grid gap-1 text-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="font-medium text-fg-strong">
          {label}
        </label>
        <select
          value=""
          aria-label={`Insert field into ${label}`}
          onChange={(e) => e.target.value && insert(e.target.value)}
          className={`${compactControl} min-h-8 w-auto py-0.5 text-xs`}
        >
          <option value="">Insert field…</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {fields
                .filter((f) => f.group === g)
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      {rows ? (
        <textarea {...control} rows={rows} className={`${compactControl} py-2`} />
      ) : (
        <input {...control} className={compactControl} />
      )}
      {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-fg-strong">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={compactControl}>
        {(Object.keys(options) as T[]).map((k) => (
          <option key={k} value={k}>
            {options[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-action-primary-bg"
      />
      {label}
    </label>
  );
}

/** Runs a preview and shows its error or status (announced). */
function PreviewBar({ children, run }: { children: ReactNode; run: () => Promise<string | null> }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border-decorative bg-bg-subtle p-3">
      {children}
      <button
        type="button"
        className={small}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setStatus("");
            setStatus((await run()) ?? "");
          })
        }
      >
        {pending ? "Preparing…" : "Preview"}
      </button>
      <p role="status" className="m-0 basis-full text-sm text-fg-muted empty:hidden">
        {status}
      </p>
    </div>
  );
}

const ALIGN = { left: "Left", center: "Centre", right: "Right" } as const;
const STYLE = {
  title: "Title (large, bold)",
  heading: "Heading (bold)",
  strong: "Bold",
  normal: "Normal",
  small: "Small (grey)",
} as const;

/**
 * Builds a receipt PDF from blocks: add, edit, move (↑ ↓) and remove; text takes {fields} from the
 * "Insert field" menus. Posted as JSON in a hidden "template" field of the surrounding AdminForm.
 */
export function PdfTemplateBuilder({
  formId,
  kind,
  initial,
  fields,
  preview,
}: {
  formId: string;
  kind: ReceiptKind;
  initial: PdfTemplate;
  fields: FieldDef[];
  preview: Preview;
}) {
  const [blocks, setBlocks] = useState(initial.blocks);
  const [notes, setNotes] = useState(initial.notes ?? {});
  const [adding, setAdding] = useState<PdfBlock["type"]>("text");
  const [reason, setReason] = useState<AckReason>("not_requested");
  const { hidden, changed } = useChanged();
  const template: PdfTemplate = kind === "acknowledgement" ? { blocks, notes } : { blocks };

  const update = (next: PdfBlock[]) => {
    setBlocks(next);
    changed();
  };
  const set = (n: number, patch: Partial<PdfBlock>) =>
    update(blocks.map((b, j) => (j === n ? carry(b, { ...b, ...patch } as PdfBlock) : b)));
  const id = (n: number, name: string) => fieldId(formId, `blocks.${n}.${name}`);
  const summary = (b: PdfBlock) =>
    b.type === "header"
      ? b.title
      : b.type === "row"
        ? b.label
        : b.type === "text" || b.type === "footer"
          ? b.text
          : b.type === "rule"
            ? b.style === "brand"
              ? "Green line"
              : "Thin line"
            : `${b.size} space`;

  return (
    <div className="grid gap-4">
      <input type="hidden" name="part" value={kind} />
      <input ref={hidden} type="hidden" name="template" value={JSON.stringify(template)} />
      <p className="m-0 text-sm text-fg-muted">
        Blocks print from top to bottom. Text in {"{braces}"} is filled in for each receipt: use{" "}
        <strong>Insert field</strong> to add one. A detail row with “Hide when empty” is left out when its
        fields are empty (for example, no PAN).
      </p>
      <ol id={fieldId(formId, "blocks")} tabIndex={-1} className="m-0 grid list-none gap-2 p-0">
        {blocks.map((b, n) => (
          <li
            key={keyOf(b)}
            className="grid gap-3 rounded-md border border-border-decorative bg-bg-canvas p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-fg-strong">
                  {n + 1}. {BLOCK_LABEL[b.type]}
                </span>
                <span className="block truncate text-xs text-fg-muted">{summary(b)}</span>
              </span>
              <button
                type="button"
                className={small}
                disabled={n === 0}
                onClick={() => update(moveItem(blocks, n, n - 1))}
                aria-label={`Move block ${n + 1} up`}
              >
                ↑
              </button>
              <button
                type="button"
                className={small}
                disabled={n === blocks.length - 1}
                onClick={() => update(moveItem(blocks, n, n + 1))}
                aria-label={`Move block ${n + 1} down`}
              >
                ↓
              </button>
              <button
                type="button"
                className={small}
                onClick={() => update(blocks.filter((_, j) => j !== n))}
                aria-label={`Remove block ${n + 1}`}
              >
                Remove
              </button>
            </div>
            {b.type === "header" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldText
                  id={id(n, "title")}
                  label={`Block ${n + 1}: title`}
                  value={b.title}
                  onChange={(title) => set(n, { title })}
                  fields={fields}
                />
                <FieldText
                  id={id(n, "text")}
                  label={`Block ${n + 1}: lines under the title`}
                  value={b.text}
                  rows={2}
                  onChange={(text) => set(n, { text })}
                  fields={fields}
                />
                <Check label="Show the logo" checked={b.logo} onChange={(logo) => set(n, { logo })} />
              </div>
            ) : b.type === "text" ? (
              <div className="grid gap-3">
                <FieldText
                  id={id(n, "text")}
                  label={`Block ${n + 1}: text`}
                  value={b.text}
                  rows={3}
                  onChange={(text) => set(n, { text })}
                  fields={fields}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice
                    label="Style"
                    value={b.style}
                    options={STYLE}
                    onChange={(style) => set(n, { style })}
                  />
                  <Choice
                    label="Align"
                    value={b.align}
                    options={ALIGN}
                    onChange={(align) => set(n, { align })}
                  />
                </div>
              </div>
            ) : b.type === "row" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldText
                  id={id(n, "label")}
                  label={`Block ${n + 1}: label`}
                  value={b.label}
                  onChange={(label) => set(n, { label })}
                  fields={fields}
                />
                <FieldText
                  id={id(n, "value")}
                  label={`Block ${n + 1}: value`}
                  value={b.value}
                  onChange={(value) => set(n, { value })}
                  fields={fields}
                />
                <Check
                  label="Hide when empty"
                  checked={b.hideIfEmpty}
                  onChange={(hideIfEmpty) => set(n, { hideIfEmpty })}
                />
              </div>
            ) : b.type === "rule" ? (
              <Choice
                label="Line"
                value={b.style}
                options={{ brand: "Green line (thick)", thin: "Thin grey line" }}
                onChange={(style) => set(n, { style })}
              />
            ) : b.type === "space" ? (
              <Choice
                label="Size"
                value={b.size}
                options={{ small: "Small", medium: "Medium", large: "Large" }}
                onChange={(size) => set(n, { size })}
              />
            ) : (
              <FieldText
                id={id(n, "text")}
                label={`Block ${n + 1}: footer text`}
                value={b.text}
                onChange={(text) => set(n, { text })}
                fields={fields}
              />
            )}
          </li>
        ))}
      </ol>
      <fieldset className="flex flex-wrap items-end gap-2 rounded-md border border-border-decorative p-3">
        <legend className="px-1 text-sm font-semibold text-fg-strong">Add a block at the end</legend>
        <Choice label="Block" value={adding} options={BLOCK_LABEL} onChange={setAdding} />
        <button type="button" className={small} onClick={() => update([...blocks, NEW_BLOCK[adding]()])}>
          Add
        </button>
      </fieldset>
      {kind === "acknowledgement" ? (
        <fieldset className="grid gap-3 rounded-md border border-border-decorative p-3">
          <legend className="px-1 text-sm font-semibold text-fg-strong">Reason notes</legend>
          <p className="m-0 text-sm text-fg-muted">
            The field <strong>Reason note</strong> ({"{ack.note}"}) prints the sentence for the reason this
            donation got an acknowledgement instead of an 80G receipt.
          </p>
          {ACK_REASONS.map((r) => (
            <FieldText
              key={r.key}
              id={fieldId(formId, `notes.${r.key}`)}
              label={r.label}
              value={notes[r.key] ?? ""}
              rows={2}
              onChange={(v) => {
                setNotes({ ...notes, [r.key]: v });
                changed();
              }}
              fields={fields.filter((f) => f.key !== "ack.note")}
            />
          ))}
        </fieldset>
      ) : null}
      <PreviewBar
        run={async () => {
          const r = await preview(kind, JSON.stringify(template), { reason });
          if (!r.ok) return r.error;
          const url = URL.createObjectURL(
            new Blob([Uint8Array.from(atob(r.pdf ?? ""), (c) => c.charCodeAt(0))], {
              type: "application/pdf",
            }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = `sample-${kind === "80g" ? "80g-receipt" : "acknowledgement"}.pdf`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          return "Sample PDF downloaded (marked SAMPLE), with this template as it is now, saved or not.";
        }}
      >
        {kind === "acknowledgement" ? (
          <Choice
            label="Preview with reason"
            value={reason}
            options={
              Object.fromEntries(ACK_REASONS.map((r) => [r.key, r.label])) as Record<AckReason, string>
            }
            onChange={setReason}
          />
        ) : null}
        <p className="m-0 flex-1 text-sm text-fg-muted">
          Download a sample PDF with sample donor details and the Trust’s saved details.
        </p>
      </PreviewBar>
    </div>
  );
}

const EMAIL_KINDS: { kind: ReceiptKind; label: string }[] = [
  { kind: "80g", label: "With an 80G receipt" },
  { kind: "acknowledgement", label: "With an acknowledgement" },
];

/**
 * The receipt email per receipt kind and language: subject and text, with {fields}. Paragraphs are
 * separated by a blank line; {link} is the download link. A language left as built in follows the
 * site's own translation.
 */
export function EmailTemplateBuilder({
  formId,
  initial,
  defaults,
  fields,
  preview,
}: {
  formId: string;
  initial: EmailTemplates;
  defaults: EmailTemplates;
  fields: FieldDef[];
  preview: Preview;
}) {
  const [value, setValue] = useState(initial);
  const [locale, setLocale] = useState<Locale>("en");
  const [shown, setShown] = useState<{ subject: string; html: string } | null>(null);
  const { hidden, changed } = useChanged();
  const effective = (k: ReceiptKind, l: Locale): EmailTemplate => value[k][l] ?? defaults[k][l]!;
  // Only what differs from the built-in text is saved, so the built-in translations stay in use.
  const toSave: EmailTemplates = {
    "80g": {},
    acknowledgement: {},
  };
  for (const { kind } of EMAIL_KINDS)
    for (const l of routing.locales) {
      const e = value[kind][l];
      const d = defaults[kind][l];
      if (e && (e.subject !== d?.subject || e.body !== d?.body)) toSave[kind][l] = e;
    }
  const set = (k: ReceiptKind, l: Locale, patch: Partial<EmailTemplate>) => {
    setValue({ ...value, [k]: { ...value[k], [l]: { ...effective(k, l), ...patch } } });
    changed();
  };

  return (
    <div className="grid gap-4">
      <input type="hidden" name="part" value="email" />
      <input ref={hidden} type="hidden" name="template" value={JSON.stringify(toSave)} />
      <div role="group" aria-label="Language" className="flex flex-wrap gap-1">
        {routing.locales.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={l === locale}
            onClick={() => setLocale(l)}
            className={`${small} aria-pressed:border-action-primary-bg aria-pressed:bg-bg-brand-subtle`}
          >
            <span lang={l}>{LANGUAGES[l].native}</span>
          </button>
        ))}
      </div>
      <p className="m-0 text-sm text-fg-muted">
        Donors get the email in the language they used on the site. Separate paragraphs with a blank line; the
        field <strong>Download link</strong> ({"{link}"}) becomes the link to the PDF.
      </p>
      {EMAIL_KINDS.map(({ kind, label }) => {
        const e = effective(kind, locale);
        const custom = Boolean(toSave[kind][locale]);
        return (
          <fieldset key={kind} className="grid gap-3 rounded-md border border-border-decorative p-3">
            <legend className="px-1 text-sm font-semibold text-fg-strong">
              {label} · {LANGUAGES[locale].name}
            </legend>
            <FieldText
              id={fieldId(formId, `${kind}.${locale}.subject`)}
              label="Subject"
              value={e.subject}
              lang={locale}
              onChange={(subject) => set(kind, locale, { subject })}
              fields={fields.filter((f) => f.key !== "link")}
            />
            <FieldText
              id={fieldId(formId, `${kind}.${locale}.body`)}
              label="Email text"
              value={e.body}
              rows={10}
              lang={locale}
              onChange={(body) => set(kind, locale, { body })}
              fields={fields}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg-muted">{custom ? "Edited" : "Built-in text"}</span>
              {custom ? (
                <button
                  type="button"
                  className={small}
                  onClick={() => {
                    setValue({ ...value, [kind]: { ...value[kind], [locale]: undefined } });
                    changed();
                  }}
                >
                  Use the built-in text
                </button>
              ) : null}
            </div>
            <PreviewBar
              run={async () => {
                const r = await preview("email", JSON.stringify(toSave), { locale, emailKind: kind });
                if (!r.ok) return r.error;
                setShown(r.email ?? null);
                return "Preview shown below.";
              }}
            >
              <p className="m-0 flex-1 text-sm text-fg-muted">See this email with sample details.</p>
            </PreviewBar>
          </fieldset>
        );
      })}
      {shown ? (
        <section aria-label="Email preview" className="grid gap-2">
          <p className="m-0 text-sm">
            <span className="font-medium text-fg-strong">Subject:</span> {shown.subject}
          </p>
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={shown.html}
            className="h-[32rem] w-full rounded-md border border-border-decorative bg-bg-canvas"
          />
        </section>
      ) : null}
    </div>
  );
}
