import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import {
  appearanceSettings,
  auditLog,
  causeTranslations,
  causes,
  donations,
  donors,
  events,
  media,
  newsPosts,
  paymentSettings,
  users,
} from "@/lib/db/schema";
import { promote } from "@/lib/promote/apply";
import { compareSites, readStage } from "@/lib/promote/source";
import type { MediaStorage } from "@/lib/storage/media";
import { freshStageCopy, onStage } from "../stage-db";

const prodUrl = process.env.DATABASE_URL ?? "";
if (!prodUrl || new URL(prodUrl).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

/** Production's photo storage, in memory; stage's files come from a fake fetch. */
function fakeStorage() {
  const files = new Map<string, Uint8Array>();
  const storage: MediaStorage = {
    name: "local",
    publicBase: "/media-local",
    put: async (key, body) => void files.set(key, body),
    remove: async (key) => void files.delete(key),
    presignPut: async () => null,
    inspect: async (key) =>
      files.has(key) ? { bytes: files.get(key)!.length, start: new Uint8Array() } : null,
  };
  const fetched: string[] = [];
  const fetchFake = (async (url: string) => {
    fetched.push(url);
    return url.includes("missing")
      ? new Response("no", { status: 404 })
      : new Response(new Uint8Array([1, 2, 3]));
  }) as unknown as typeof fetch;
  return { storage, files, fetched, deps: { storage, fetch: fetchFake } };
}

async function rowFor(ref: string) {
  const cmp = await compareSites();
  if (!cmp.ok) throw new Error(cmp.message);
  return cmp.rows.find((r) => r.ref === ref);
}

let actor: { userId: string };
beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ email: `promote-${Date.now()}@example.com`, name: "Promote tester", role: "super_admin" })
    .returning();
  actor = { userId: u!.id };
  await freshStageCopy(prodUrl);
}, 120_000);

describe("Move from stage", () => {
  it("a fresh copy of production has nothing to move", async () => {
    const cmp = await compareSites();
    expect(cmp.ok).toBe(true);
    if (!cmp.ok) return;
    expect(cmp.rows.filter((r) => r.status !== "same")).toEqual([]);
  });

  it("stage is only ever read, inside a read-only transaction", async () => {
    const error = await readStage((r) =>
      r.execute(sql`insert into appearance_settings (id) values (1) on conflict do nothing`),
    ).catch((e: Error & { cause?: Error }) => e);
    expect(String((error as Error & { cause?: Error }).cause?.message)).toMatch(/read-only transaction/);
  });

  const causeId = randomUUID();
  const photoId = randomUUID();

  it("moves a new cause with its text and photo; the amount raised is never copied", async () => {
    await onStage(prodUrl, async (s) => {
      await s`insert into media (id, r2_key, filename, mime, width, height, variants)
              values (${photoId}, ${`media/${photoId}/well`}, 'well.jpg', 'image/webp', 800, 600, '[480,960]')`;
      await s`insert into media_translations (media_id, locale, alt_text) values (${photoId}, 'en', 'A new well')`;
      await s`insert into causes (id, slug, status, raised_paise, cover_image_id)
              values (${causeId}, ${`water-${causeId.slice(0, 8)}`}, 'active', 500000, ${photoId})`;
      await s`insert into cause_translations (cause_id, locale, title, summary, reviewed_at)
              values (${causeId}, 'en', 'Clean water', 'Wells for villages', now())`;
    });
    const row = await rowFor(`cause:${causeId}`);
    expect(row?.status).toBe("new");
    const { deps, files } = fakeStorage();
    const result = await promote({ move: [{ ref: row!.ref, hash: row!.hash }], remove: [] }, actor, deps);
    expect(result).toMatchObject({ ok: true, moved: ["Clean water"], refused: [] });
    if (!result.ok) return;
    expect(result.tags).toContain("content");
    expect(result.paths).toContain(`/en/causes/water-${causeId.slice(0, 8)}`);

    const [cause] = await db.select().from(causes).where(eq(causes.id, causeId));
    expect(cause?.raisedPaise).toBe(0);
    expect(cause?.coverImageId).toBe(photoId);
    const [t] = await db.select().from(causeTranslations).where(eq(causeTranslations.causeId, causeId));
    expect(t?.title).toBe("Clean water");
    expect(t?.reviewedBy).toBe(actor.userId); // production's user, not stage's
    expect((await db.select().from(media).where(eq(media.id, photoId)))[0]?.r2Key).toBe(
      `media/${photoId}/well`,
    );
    expect([...files.keys()].sort()).toEqual([
      `media/${photoId}/well-480.webp`,
      `media/${photoId}/well-960.webp`,
    ]);
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, causeId), eq(auditLog.action, "promote.cause.move")));
    expect(audit?.actorUserId).toBe(actor.userId);
    expect((await rowFor(`cause:${causeId}`))?.status).toBe("same");
  });

  it("moves a change and keeps production's amount raised; refuses a stale comparison", async () => {
    await db.update(causes).set({ raisedPaise: 777 }).where(eq(causes.id, causeId));
    await onStage(
      prodUrl,
      (s) => s`update cause_translations set title = 'Clean water for all' where cause_id = ${causeId}`,
    );
    const row = await rowFor(`cause:${causeId}`);
    expect(row?.status).toBe("changed");
    expect(row?.changes).toContainEqual({
      label: "English: Title",
      before: "Clean water",
      after: "Clean water for all",
    });
    // Raised amounts differ between the sites, but that's never a change.
    expect(row?.changes.map((c) => c.label)).not.toContain("Raised Paise");

    const stale = await promote({ move: [{ ref: row!.ref, hash: "0000000000000000" }], remove: [] }, actor);
    expect(stale).toMatchObject({
      ok: true,
      moved: [],
      refused: [{ reason: expect.stringMatching(/compare again/) }],
    });

    const { deps } = fakeStorage();
    await promote({ move: [{ ref: row!.ref, hash: row!.hash }], remove: [] }, actor, deps);
    const [cause] = await db.select().from(causes).where(eq(causes.id, causeId));
    expect(cause?.raisedPaise).toBe(777);
    const [t] = await db.select().from(causeTranslations).where(eq(causeTranslations.causeId, causeId));
    expect(t?.title).toBe("Clean water for all");
  });

  it("refuses a clash and a photo that can't be fetched", async () => {
    const slug = `clash-${Date.now()}`;
    await db.insert(newsPosts).values({ slug, status: "draft" });
    const stageId = randomUUID();
    await onStage(
      prodUrl,
      (s) => s`insert into news_posts (id, slug, status) values (${stageId}, ${slug}, 'draft')`,
    );
    const clash = await rowFor(`news:${stageId}`);
    expect(clash?.status).toBe("clash");
    const r1 = await promote({ move: [{ ref: clash!.ref, hash: clash!.hash }], remove: [] }, actor);
    expect(r1).toMatchObject({
      ok: true,
      moved: [],
      refused: [{ reason: expect.stringMatching(/address/) }],
    });

    const eventId = randomUUID();
    const missing = randomUUID();
    await onStage(prodUrl, async (s) => {
      await s`insert into media (id, r2_key, filename, mime, width, height, variants)
              values (${missing}, ${`media/${missing}/missing`}, 'm.jpg', 'image/webp', 10, 10, '[480]')`;
      await s`insert into events (id, slug, starts_at, cover_image_id)
              values (${eventId}, ${`ev-${eventId.slice(0, 8)}`}, now(), ${missing})`;
    });
    const ev = await rowFor(`event:${eventId}`);
    const { deps } = fakeStorage();
    const r2 = await promote({ move: [{ ref: ev!.ref, hash: ev!.hash }], remove: [] }, actor, deps);
    expect(r2).toMatchObject({ ok: true, moved: [], refused: [{ reason: expect.stringMatching(/fetch/) }] });
    expect(await db.select().from(events).where(eq(events.id, eventId))).toEqual([]);
  });

  it("removes a production-only item when ticked, but never a cause with donations", async () => {
    const [ev] = await db
      .insert(events)
      .values({ slug: `old-${Date.now()}`, startsAt: new Date() })
      .returning();
    const [kept] = await db
      .insert(causes)
      .values({ slug: `kept-${Date.now()}` })
      .returning();
    const [donor] = await db
      .insert(donors)
      .values({
        fullName: "Test",
        email: "t@example.com",
        phone: "9999999999",
        isIndianCitizenDeclared: true,
        declaredAt: new Date(),
        createdVia: "offline",
      })
      .returning();
    await db.insert(donations).values({
      publicOrderId: `ord-${Date.now()}`,
      donorId: donor!.id,
      causeId: kept!.id,
      amountPaise: 10000,
      totalPaise: 10000,
      mode: "cash",
      nameSnapshot: "Test",
      emailSnapshot: "t@example.com",
    });
    const gone = await rowFor(`event:${ev!.id}`);
    const used = await rowFor(`cause:${kept!.id}`);
    expect(gone?.status).toBe("prod_only");
    expect(used?.note).toMatch(/donations/);
    const result = await promote(
      {
        move: [],
        remove: [
          { ref: gone!.ref, hash: gone!.hash },
          { ref: used!.ref, hash: used!.hash },
        ],
      },
      actor,
    );
    expect(result).toMatchObject({ ok: true, removed: [gone!.title], refused: [{ title: used!.title }] });
    expect(await db.select().from(events).where(eq(events.id, ev!.id))).toEqual([]);
    expect(await db.select().from(causes).where(eq(causes.id, kept!.id))).toHaveLength(1);
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, ev!.id))
      .orderBy(desc(auditLog.id));
    expect(audit?.action).toBe("promote.event.remove");
  });

  it("moves settings but keeps the payment gateway mode and this site's IndexNow key", async () => {
    await db.update(paymentSettings).set({ providerMode: "production", minAmountPaise: 10000 });
    await db.update(appearanceSettings).set({ siteFont: "poppins" });
    await onStage(prodUrl, async (s) => {
      await s`update appearance_settings set site_font = 'mukta'`;
      await s`update payment_settings set min_amount_paise = 20000, provider_mode = 'sandbox'`;
    });
    const font = await rowFor("appearance:appearance");
    const pay = await rowFor("payment:payment");
    expect(pay?.changes.map((c) => c.label)).toEqual(["Min Amount Paise"]);
    const result = await promote(
      {
        move: [
          { ref: font!.ref, hash: font!.hash },
          { ref: pay!.ref, hash: pay!.hash },
        ],
        remove: [],
      },
      actor,
    );
    expect(result).toMatchObject({ ok: true, refused: [] });
    if (result.ok) expect(result.tags.sort()).toEqual(["settings:appearance", "settings:payment"]);
    expect((await db.select().from(appearanceSettings))[0]?.siteFont).toBe("mukta");
    const [p] = await db.select().from(paymentSettings);
    expect(p?.minAmountPaise).toBe(20000);
    expect(p?.providerMode).toBe("production");
    expect(p?.updatedBy).toBe(actor.userId);
  });

  it("won't compare when the sites are on different database versions", async () => {
    await onStage(
      prodUrl,
      (s) => s`insert into drizzle.__drizzle_migrations (hash, created_at) values ('future', 99999999999999)`,
    );
    try {
      const cmp = await compareSites();
      expect(cmp).toMatchObject({ ok: false, message: expect.stringMatching(/Release the code/) });
    } finally {
      await onStage(prodUrl, (s) => s`delete from drizzle.__drizzle_migrations where hash = 'future'`);
    }
  });
});
