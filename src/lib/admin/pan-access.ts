import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import { recordAudit, type Actor } from "@/lib/audit";
import { authSecret } from "@/lib/auth/signed";
import { decryptPiiForDisplay } from "@/lib/crypto/pii";
import { db } from "@/lib/db/client";
import { panAccessCodes, users } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";
import { getEmailProvider } from "@/lib/email";
import { emailLayout, p } from "@/lib/email/templates/layout";

// Full donor PANs are shown only after a one-time code emailed to the admin's own address
// (owner decision, Step 8b). A correct code opens a 15-minute window; every step is audited.
export const CODE_TTL_MS = 10 * 60_000;
export const ACCESS_WINDOW_MS = 15 * 60_000;
export const MAX_ATTEMPTS = 5;
export const MAX_CODES_PER_HOUR = 5;

const hashCode = (userId: string, code: string) =>
  createHmac("sha256", authSecret()).update(`pan-code:${userId}:${code}`).digest("hex");

export class PanAccessError extends Error {
  constructor(readonly code: "rate" | "invalid" | "expired" | "attempts") {
    super(code);
  }
}

export async function panAccessUntil(userId: string, now = new Date()): Promise<Date | null> {
  const [u] = await db.select({ until: users.panAccessUntil }).from(users).where(eq(users.id, userId));
  return u?.until && u.until > now ? u.until : null;
}

/** Emails a 6-digit code to the admin. */
export async function requestPanCode(userId: string, actor: Actor, now = new Date()) {
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new PanAccessError("invalid");
  const [recent] = await db
    .select({ n: count() })
    .from(panAccessCodes)
    .where(
      and(
        eq(panAccessCodes.userId, userId),
        gt(panAccessCodes.createdAt, new Date(now.getTime() - 3_600_000)),
      ),
    );
  if ((recent?.n ?? 0) >= MAX_CODES_PER_HOUR) throw new PanAccessError("rate");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await withTx(async (tx) => {
    await tx
      .insert(panAccessCodes)
      .values({ userId, codeHash: hashCode(userId, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS) });
    await recordAudit(tx, actor, { action: "pan.otp_sent", entityType: "user", entityId: userId });
  });
  const body =
    "It shows full donor PANs for 15 minutes and expires in 10 minutes. If you didn't ask for it, tell a Super Admin.";
  await getEmailProvider().send({
    to: { email: user.email, name: user.name },
    // The code stays at the end of the subject (mail previews show it).
    subject: `MS Welfare Trust: your code to view donor PANs: ${code}`,
    text: `Your MSWT admin code is ${code}.\n\n${body}`,
    html: emailLayout({
      lang: "en",
      heading: "MS Welfare Trust admin",
      body: `<p style="margin:0 0 16px">Your MSWT admin code is <strong style="font-size:20px;letter-spacing:4px">${code}</strong>.</p>${p(body)}`,
    }),
    tag: "pan-otp",
  });
}

/** Checks the latest unused code; opens the 15-minute window on success. */
export async function verifyPanCode(
  userId: string,
  code: string,
  actor: Actor,
  now = new Date(),
): Promise<Date> {
  const clean = code.replace(/\s/g, "");
  // The transaction commits the attempt count (or the unlock) before any error is thrown, so a
  // failed guess is never rolled back.
  const outcome = await withTx(
    async (tx): Promise<{ ok: true; until: Date } | { ok: false; error: PanAccessError["code"] }> => {
      const [row] = await tx
        .select()
        .from(panAccessCodes)
        .where(and(eq(panAccessCodes.userId, userId), isNull(panAccessCodes.usedAt)))
        .orderBy(desc(panAccessCodes.createdAt))
        .limit(1)
        .for("update");
      if (!row || row.expiresAt <= now) return { ok: false, error: "expired" };
      if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "attempts" };
      const expected = Buffer.from(row.codeHash);
      const given = Buffer.from(hashCode(userId, clean));
      if (!/^\d{6}$/.test(clean) || expected.length !== given.length || !timingSafeEqual(expected, given)) {
        await tx
          .update(panAccessCodes)
          .set({ attempts: row.attempts + 1 })
          .where(eq(panAccessCodes.id, row.id));
        await recordAudit(tx, actor, { action: "pan.otp_failed", entityType: "user", entityId: userId });
        return { ok: false, error: row.attempts + 1 >= MAX_ATTEMPTS ? "attempts" : "invalid" };
      }
      const until = new Date(now.getTime() + ACCESS_WINDOW_MS);
      await tx.update(panAccessCodes).set({ usedAt: now }).where(eq(panAccessCodes.id, row.id));
      await tx.update(users).set({ panAccessUntil: until }).where(eq(users.id, userId));
      await recordAudit(tx, actor, {
        action: "pan.unlocked",
        entityType: "user",
        entityId: userId,
        after: { until },
      });
      return { ok: true, until };
    },
  );
  if (!outcome.ok) throw new PanAccessError(outcome.error);
  return outcome.until;
}

/** Full PAN for display while the window is open; logs the view. */
export async function revealPans(
  userId: string,
  encrypted: { entityType: string; entityId: string; panEnc: string | null }[],
  actor: Actor,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!(await panAccessUntil(userId))) return out;
  for (const e of encrypted) if (e.panEnc) out.set(e.entityId, decryptPiiForDisplay(e.panEnc));
  if (out.size)
    await withTx((tx) =>
      recordAudit(tx, actor, {
        action: "pan.viewed",
        entityType: encrypted[0]!.entityType,
        entityId: encrypted.length === 1 ? encrypted[0]!.entityId : null,
        after: { count: out.size },
      }),
    );
  return out;
}
