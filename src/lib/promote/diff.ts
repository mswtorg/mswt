import { LANGUAGES } from "@/lib/admin/languages";
import type { Locale } from "@/i18n/routing";
import type { Area, Row, UnitType } from "./kinds";
import { stable, type Unit } from "./snapshot";

export type Status = "new" | "changed" | "same" | "prod_only" | "clash";
export type Change = { label: string; before?: string; after?: string };
export type Compared = {
  ref: string;
  type: UnitType;
  area: Area;
  id: string;
  title: string;
  status: Status;
  /** Stage's version (what a move copies); production's for "only on production". */
  hash: string;
  changes: Change[];
  /** Why it can't be moved (clash) or removed (a cause with donations). */
  note?: string;
};

const FIELD_LABEL: Record<string, string> = {
  slug: "Address (slug)",
  status: "Status",
  title: "Title",
  h1: "Heading",
  intro: "Intro",
  headline: "Headline",
  summary: "Summary",
  excerpt: "Excerpt",
  body: "Text",
  sections: "Page text",
  extras: "Home page fields",
  tag: "Card label",
  name: "Name",
  role: "Role",
  seoTitle: "Search title",
  seoDescription: "Search description",
  reviewed: "Reviewed",
  coverImageId: "Cover photo",
  coverSize: "Cover photo height",
  photoIds: "Photos",
  photoId: "Photo",
  heroMediaIds: "Header photos",
  heroSize: "Header photo height",
  sectionOrder: "Section order",
  hiddenSections: "Hidden sections",
  goalPaise: "Goal",
  sortOrder: "Order",
  is80gEligible: "80G eligible",
  isSample: "Sample content",
  publishedAt: "Publish date",
  startsAt: "Starts",
  endsAt: "Ends",
  pdfR2Key: "PDF file",
  pdfFilename: "PDF file name",
  pdfBytes: "PDF size",
  fy: "Financial year",
  kind: "Document type",
  pdf80g: "80G receipt template",
  pdfAck: "Acknowledgement template",
  email: "Email",
  trustees: "Trustees",
  logoMediaId: "Logo",
  signatureMediaId: "Signature",
  defaultOgImageId: "Share image",
};
const label = (k: string) =>
  FIELD_LABEL[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const lang = (l: unknown) => LANGUAGES[l as Locale]?.name ?? String(l);

/** A short, readable value for the change list (long text cut, structures summarised). */
export function show(v: unknown): string {
  if (v == null || v === "") return "(empty)";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.length ? `${v.length} item${v.length === 1 ? "" : "s"}` : "(none)";
  if (typeof v === "object") return "(changed)";
  const s = String(v);
  return s.length > 140 ? `${s.slice(0, 137)}…` : s;
}

const same = (a: unknown, b: unknown) => stable(a) === stable(b);

function fieldChanges(stage: Row, prod: Row, prefix = ""): Change[] {
  const keys = [...new Set([...Object.keys(stage), ...Object.keys(prod)])].sort();
  return keys
    .filter((k) => !same(stage[k], prod[k]))
    .map((k) => ({ label: `${prefix}${label(k)}`, before: show(prod[k]), after: show(stage[k]) }));
}

/** What differs between production's version of an item and stage's, in plain words. */
export function changesBetween(stage: Unit, prod: Unit): Change[] {
  const out: Change[] = [];
  const s = stage.compare;
  const p = prod.compare;
  if (s.fields || p.fields) out.push(...fieldChanges((s.fields as Row) ?? {}, (p.fields as Row) ?? {}));
  if ("translations" in s) {
    const st = (s.translations as Row[]) ?? [];
    const pt = (p.translations as Row[]) ?? [];
    for (const l of [...new Set([...st, ...pt].map((t) => t.locale as string))].sort()) {
      const a = st.find((t) => t.locale === l);
      const b = pt.find((t) => t.locale === l);
      if (a && !b) out.push({ label: `${lang(l)} text added` });
      else if (!a && b) out.push({ label: `${lang(l)} text removed` });
      else if (a && b) out.push(...fieldChanges(a, b, `${lang(l)}: `));
    }
  }
  if ("photos" in s && !same(s.photos, p.photos))
    out.push({
      label: "Photos in the album",
      before: show(p.photos),
      after: show(s.photos),
    });
  if ("links" in s && !same(s.links, p.links))
    out.push({ label: "Menu links", before: show(p.links), after: show(s.links) });
  if (!same(s.media, p.media)) {
    // Only the photos' own details (files, alt text): which photos are used shows above.
    const pm = new Map(((p.media as Row[]) ?? []).map((m) => [m.id, m]));
    const changed = ((s.media as Row[]) ?? []).filter((m) => pm.has(m.id) && !same(m, pm.get(m.id)));
    if (changed.length)
      out.push({
        label: `Photo details (alt text or file): ${changed.length} photo${changed.length === 1 ? "" : "s"}`,
      });
  }
  return out;
}

/**
 * Lines stage up against production: new on stage, changed, the same, only on production, or a
 * clash (a new stage item using an address that a different production item already has).
 */
export function compare(stage: Unit[], prod: Unit[]): Compared[] {
  const prodByRef = new Map(prod.map((u) => [u.ref, u]));
  const stageRefs = new Set(stage.map((u) => u.ref));
  const out: Compared[] = [];
  for (const u of stage) {
    const base = { ref: u.ref, type: u.type, area: u.area, id: u.id, title: u.title, hash: u.hash };
    const p = prodByRef.get(u.ref);
    const clash = u.slug
      ? prod.find((x) => x.type === u.type && x.slug === u.slug && x.id !== u.id)
      : undefined;
    if (clash)
      out.push({
        ...base,
        status: "clash",
        changes: [],
        note: `Production has a different ${u.type} at the address “${u.slug}” (${clash.title}). Change the address on one of them first.`,
      });
    else if (!p) out.push({ ...base, status: "new", changes: [] });
    else if (p.hash === u.hash) out.push({ ...base, status: "same", changes: [] });
    else {
      const changes = changesBetween(u, p);
      out.push({ ...base, status: "changed", changes: changes.length ? changes : [{ label: "Details" }] });
    }
  }
  for (const p of prod)
    if (!stageRefs.has(p.ref))
      out.push({
        ref: p.ref,
        type: p.type,
        area: p.area,
        id: p.id,
        title: p.title,
        hash: p.hash,
        status: "prod_only",
        changes: [],
      });
  return out;
}
