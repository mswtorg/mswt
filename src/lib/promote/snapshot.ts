import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { media, mediaTranslations } from "@/lib/db/schema";
import type { Tx } from "@/lib/db/tx";
import { KINDS, type Area, type Kind, type Row, type UnitType } from "./kinds";

/** Anything Drizzle can read from: the production `db`, a transaction, or the stage reader. */
export type Reader = Pick<Tx, "select" | "execute">;

/** One movable item (a cause, a page, the menus, a settings row) as it is on one side. */
export type Unit = {
  type: UnitType;
  area: Area;
  id: string;
  /** `type:id`, the same on both sides. */
  ref: string;
  title: string;
  slug: string | null;
  status: string | null;
  root: Row | null;
  children: Record<string, Row[]>;
  mediaIds: string[];
  /** What is compared: environment fields, timestamps and who-did-it are left out. */
  compare: Row;
  hash: string;
};

export type MediaEntry = { row: Row; translations: Row[] };
export type Snapshot = { units: Unit[]; media: Map<string, MediaEntry>; migration: string | null };

// Never compared: when and by whom (users differ between the sites).
const DROP = new Set(["createdAt", "updatedAt", "updatedBy", "reviewedBy", "uploadedBy"]);

/** JSON with object keys sorted, so equal content always gives equal text (and hash). */
export function stable(v: unknown): string {
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Row)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable((v as Row)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

export function normalise(row: Row, skip: string[] = []): Row {
  const out: Row = {};
  for (const k of Object.keys(row).sort()) {
    if (DROP.has(k) || skip.includes(k)) continue;
    const v = row[k];
    if (k === "reviewedAt") out.reviewed = v != null;
    else out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

const sortRows = (rows: Row[], order: string[]) =>
  [...rows].sort((a, b) => {
    for (const k of order) {
      const x = String(a[k] ?? "");
      const y = String(b[k] ?? "");
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  });

async function all(r: Reader, table: PgTable): Promise<Row[]> {
  return (await r.select().from(table as never)) as Row[];
}

/** The latest migration applied (both sites must be on the same one before anything moves). */
async function latestMigration(r: Reader): Promise<string | null> {
  try {
    const res = (await r.execute(
      sql`select hash from drizzle.__drizzle_migrations order by created_at desc limit 1`,
    )) as unknown as { rows?: Row[] } | Row[];
    const rows = Array.isArray(res) ? res : (res.rows ?? []);
    return (rows[0]?.hash as string | undefined) ?? null;
  } catch {
    return null;
  }
}

function titleOf(kind: Kind, root: Row | null, children: Record<string, Row[]>): string {
  if (!root || kind.key === "single") return kind.label;
  const translations = children.translations ?? [];
  const t = translations.find((x) => x.locale === "en") ?? translations[0];
  const name = (kind.titleField && (t?.[kind.titleField] as string | undefined)) || "";
  const extra = kind.type === "document" && root.fy ? ` (${String(root.fy)})` : "";
  return `${name || String(root.slug ?? root.key ?? root.id)}${extra}`;
}

export function hashOf(compare: Row) {
  return createHash("sha256").update(stable(compare)).digest("hex").slice(0, 16);
}

/** Every movable item on one site, read the same way on both sides. */
export async function loadSnapshot(r: Reader): Promise<Snapshot> {
  const [mediaRows, mediaTr, migration] = await Promise.all([
    all(r, media),
    all(r, mediaTranslations),
    latestMigration(r),
  ]);
  const mediaMap = new Map<string, MediaEntry>();
  for (const m of mediaRows) mediaMap.set(m.id as string, { row: m, translations: [] });
  for (const t of mediaTr) mediaMap.get(t.mediaId as string)?.translations.push(t);

  const units: Unit[] = [];
  for (const kind of KINDS) {
    const roots = kind.root ? await all(r, kind.root) : [{}];
    const childRows = await Promise.all(kind.children.map((c) => all(r, c.table)));
    for (const root of roots) {
      const id = kind.key === "single" ? kind.type : String(root[kind.key]);
      // A settings table that has no row yet on this site: nothing to compare.
      if (kind.root && kind.key === "single" && root.id == null) continue;
      const children: Record<string, Row[]> = {};
      kind.children.forEach((c, i) => {
        const rows = c.fk ? childRows[i]!.filter((x) => String(x[c.fk]) === id) : childRows[i]!;
        children[c.name] = sortRows(rows, c.order);
      });
      if (kind.type === "menus" && !children.links?.length) continue;
      const mediaIds = [
        ...new Set((kind.media?.(root, children) ?? []).filter((x): x is string => Boolean(x))),
      ].sort();
      const compare: Row = {
        ...(kind.root ? { fields: normalise(root, [...(kind.keep ?? []), "id"]) } : {}),
        ...Object.fromEntries(
          kind.children.map((c) => [c.name, children[c.name]!.map((x) => normalise(x, c.fk ? [c.fk] : []))]),
        ),
        media: mediaIds.map((m) => {
          const e = mediaMap.get(m);
          return e
            ? {
                ...normalise(e.row),
                alt: sortRows(e.translations, ["locale"]).map((t) => normalise(t, ["mediaId"])),
              }
            : { id: m, missing: true };
        }),
      };
      units.push({
        type: kind.type,
        area: kind.area,
        id,
        ref: `${kind.type}:${id}`,
        title: titleOf(kind, kind.root ? root : null, children),
        slug: kind.slug ? String(root.slug) : null,
        status: (root.status as string | undefined) ?? null,
        root: kind.root ? root : null,
        children,
        mediaIds,
        compare,
        hash: hashOf(compare),
      });
    }
  }
  return { units, media: mediaMap, migration };
}
