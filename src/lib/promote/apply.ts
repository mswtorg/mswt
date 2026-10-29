import { eq, getTableColumns } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { serverEnv } from "@/env/server";
import { routing } from "@/i18n/routing";
import { recordAudit, type Actor } from "@/lib/audit";
import { CONTENT_TAG } from "@/lib/content/source";
import { media, mediaTranslations, menuItems } from "@/lib/db/schema";
import { withTx, type Tx } from "@/lib/db/tx";
import { variantKey } from "@/lib/media/process";
import { PAYMENT_SETTINGS_TAG } from "@/lib/payment-settings";
import { SETTINGS_TAGS } from "@/lib/settings";
import { getMediaStorage, type MediaStorage } from "@/lib/storage/media";
import { kindOf, type Kind, type Row, type UnitType } from "./kinds";
import { compareSites } from "./source";
import type { Snapshot, Unit } from "./snapshot";

export type Choice = { ref: string; hash: string };
export type MoveResult =
  | { ok: false; message: string }
  | {
      ok: true;
      moved: string[];
      removed: string[];
      refused: { title: string; reason: string }[];
      /** Cache tags to refresh and public paths to tell search engines about (by the caller). */
      tags: string[];
      paths: string[];
    };
export type Deps = { storage?: MediaStorage | null; fetch?: typeof fetch; stageMediaUrl?: string };

const TAGS: Partial<Record<UnitType, string>> = {
  organization: SETTINGS_TAGS.organization,
  seo: SETTINGS_TAGS.seo,
  appearance: SETTINGS_TAGS.appearance,
  email: SETTINGS_TAGS.email,
  payment: PAYMENT_SETTINGS_TAG,
};

const omit = (row: Row, keys: string[]) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
const column = (table: PgTable, name: string) => (getTableColumns(table) as Record<string, PgColumn>)[name]!;

/** Files a unit needs on production: photo copies it doesn't have yet, and a document's PDF. */
function filesFor(s: Unit, p: Unit | undefined, stage: Snapshot, prod: Snapshot) {
  const files: { key: string; type: string }[] = [];
  for (const id of s.mediaIds) {
    const row = stage.media.get(id)?.row;
    const have = prod.media.get(id)?.row;
    if (!row?.r2Key || (have && have.r2Key === row.r2Key)) continue;
    for (const w of (row.variants as number[]) ?? [])
      files.push({ key: variantKey(String(row.r2Key), w), type: "image/webp" });
  }
  const pdf = s.root?.pdfR2Key as string | null | undefined;
  if (pdf && p?.root?.pdfR2Key !== pdf) files.push({ key: pdf, type: "application/pdf" });
  return files;
}

async function copyFiles(files: { key: string; type: string }[], deps: Required<Deps>) {
  const storage = deps.storage!;
  for (const f of files) {
    if (await storage.inspect(f.key, 1)) continue; // already there (keys never change content)
    const url = `${deps.stageMediaUrl}/${f.key.split("/").map(encodeURIComponent).join("/")}`;
    const res = await deps.fetch(url);
    if (!res.ok) throw new Error(`Couldn’t fetch ${f.key} from stage (${res.status})`);
    await storage.put(f.key, new Uint8Array(await res.arrayBuffer()), f.type);
  }
}

async function writeUnit(tx: Tx, kind: Kind, s: Unit, p: Unit | undefined, stage: Snapshot, actor: Actor) {
  const now = new Date();
  for (const id of s.mediaIds) {
    const e = stage.media.get(id);
    if (!e) continue;
    const row = { ...omit(e.row, ["uploadedBy"]), uploadedBy: null };
    await tx
      .insert(media)
      .values(row as never)
      .onConflictDoUpdate({ target: media.id, set: omit(row, ["id", "createdAt", "uploadedBy"]) as never });
    await tx.delete(mediaTranslations).where(eq(mediaTranslations.mediaId, id));
    if (e.translations.length) await tx.insert(mediaTranslations).values(e.translations as never);
  }

  if (kind.root && s.root) {
    const key = kind.key === "single" ? "id" : kind.key;
    // Environment fields keep production's value; a new item gets the column default.
    const keep = kind.keep ?? [];
    const values: Row = omit(s.root, keep);
    if (p?.root) for (const k of keep) values[k] = p.root[k];
    if ("updatedAt" in s.root) values.updatedAt = now;
    if ("updatedBy" in s.root) values.updatedBy = actor.userId;
    await tx
      .insert(kind.root)
      .values(values as never)
      .onConflictDoUpdate({
        target: column(kind.root, key),
        set: omit(values, [key, "createdAt"]) as never,
      });
  }

  for (const c of kind.children) {
    const rows = (s.children[c.name] ?? []).map((r): Row => ({
      ...r,
      ...("reviewedBy" in r ? { reviewedBy: r.reviewedAt ? actor.userId : null } : {}),
      ...("updatedAt" in r ? { updatedAt: now } : {}),
    }));
    if (c.table === menuItems) {
      // The menus move as a whole: top-level links first, then their sub-links.
      await tx.delete(menuItems);
      const top = rows.filter((r) => !r.parentId);
      const sub = rows.filter((r) => r.parentId);
      if (top.length) await tx.insert(menuItems).values(top as never);
      if (sub.length) await tx.insert(menuItems).values(sub as never);
      continue;
    }
    await tx.delete(c.table).where(eq(column(c.table, c.fk), s.id));
    if (rows.length) await tx.insert(c.table).values(rows as never);
  }

  await recordAudit(tx, actor, {
    action: `promote.${kind.type}.move`,
    entityType: kind.type,
    entityId: kind.key === "single" ? null : s.id,
    before: p?.compare ?? null,
    after: s.compare,
  });
}

function publicPaths(kind: Kind, s: Unit) {
  if (!kind.paths || !s.root || !kind.published?.(s.root)) return [];
  const reviewed = (s.children.translations ?? []).filter((t) => t.reviewedAt).map((t) => t.locale);
  return routing.locales.filter((l) => reviewed.includes(l)).flatMap((l) => kind.paths!(s.root!, l));
}

/**
 * Moves the chosen stage items to production and removes the chosen production-only items.
 * Everything is compared again first: an item moves only if stage still has the version that was
 * reviewed (its hash), so nothing changed after the comparison slips through.
 */
export async function promote(
  picks: { move: Choice[]; remove: Choice[] },
  actor: Actor,
  deps: Deps = {},
): Promise<MoveResult> {
  const cmp = await compareSites();
  if (!cmp.ok) return { ok: false, message: cmp.message };
  const d: Required<Deps> = {
    storage: deps.storage === undefined ? getMediaStorage() : deps.storage,
    fetch: deps.fetch ?? fetch,
    stageMediaUrl: deps.stageMediaUrl ?? serverEnv.STAGE_MEDIA_PUBLIC_URL ?? "",
  };
  const rows = new Map(cmp.rows.map((r) => [r.ref, r]));
  const stageUnits = new Map(cmp.stage.units.map((u) => [u.ref, u]));
  const prodUnits = new Map(cmp.prod.units.map((u) => [u.ref, u]));
  const refused: { title: string; reason: string }[] = [];
  const moving: Unit[] = [];
  const removing: Unit[] = [];

  for (const pick of picks.move) {
    const row = rows.get(pick.ref);
    const s = stageUnits.get(pick.ref);
    if (!row || !s || (row.status !== "new" && row.status !== "changed" && row.status !== "clash")) {
      refused.push({ title: row?.title ?? pick.ref, reason: "Nothing to move any more: compare again." });
      continue;
    }
    if (row.status === "clash") {
      refused.push({ title: row.title, reason: row.note ?? "Address clash." });
      continue;
    }
    if (row.hash !== pick.hash) {
      refused.push({ title: row.title, reason: "Changed on stage since you compared: compare again." });
      continue;
    }
    const files = filesFor(s, prodUnits.get(s.ref), cmp.stage, cmp.prod);
    if (files.length) {
      try {
        if (!d.storage) throw new Error("Photo storage isn’t set up on this site");
        await copyFiles(files, d);
      } catch (error) {
        refused.push({ title: row.title, reason: (error as Error).message });
        continue;
      }
    }
    moving.push(s);
  }
  for (const pick of picks.remove) {
    const row = rows.get(pick.ref);
    const p = prodUnits.get(pick.ref);
    if (!row || !p || row.status !== "prod_only" || row.hash !== pick.hash) {
      refused.push({ title: row?.title ?? pick.ref, reason: "Changed since you compared: compare again." });
      continue;
    }
    if (!kindOf(p.type).removable || row.note) {
      refused.push({ title: row.title, reason: row.note ?? "This can’t be removed." });
      continue;
    }
    removing.push(p);
  }

  if (moving.length || removing.length)
    await withTx(async (tx) => {
      for (const s of moving) await writeUnit(tx, kindOf(s.type), s, prodUnits.get(s.ref), cmp.stage, actor);
      for (const p of removing) {
        const kind = kindOf(p.type);
        await tx.delete(kind.root!).where(eq(column(kind.root!, kind.key), p.id));
        await recordAudit(tx, actor, {
          action: `promote.${kind.type}.remove`,
          entityType: kind.type,
          entityId: p.id,
          before: p.compare,
        });
      }
    });

  const touched = [...moving, ...removing];
  return {
    ok: true,
    moved: moving.map((u) => u.title),
    removed: removing.map((u) => u.title),
    refused,
    tags: [
      ...new Set(
        touched
          .map((u) => (u.area === "content" ? CONTENT_TAG : TAGS[u.type]))
          .filter((t): t is string => !!t),
      ),
    ],
    paths: [...new Set(moving.flatMap((u) => publicPaths(kindOf(u.type), u)))],
  };
}
