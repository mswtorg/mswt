import { desc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  changeOwnPassword,
  createResetLink,
  enrolTwoFactor,
  inviteUser,
  linkUser,
  resetTwoFactor,
  setActive,
  setPasswordFromLink,
  setRole,
  UserError,
} from "@/lib/admin/users";
import { updateOrganization, updateReceiptTemplate } from "@/lib/admin/settings/service";
import { DEFAULT_PDF } from "@/lib/receipts/template";
import { loadReceiptTemplates } from "@/lib/receipts/templates-store";
import {
  activeUser,
  checkPassword,
  checkSecondFactor,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
} from "@/lib/auth/login";
import { hashPassword } from "@/lib/auth/password";
import { currentTotp, newTotpSecret } from "@/lib/auth/totp";
import { db } from "@/lib/db/client";
import { auditLog, organizationSettings, users } from "@/lib/db/schema";
import { withTx } from "@/lib/db/tx";

const url = process.env.DATABASE_URL ?? "";
if (!url || new URL(url).hostname.endsWith(".neon.tech"))
  throw new Error("Integration tests need a throwaway Postgres (npm run db:local), never Neon");

const PASSWORD = "integration test passphrase";
const unique = () => `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function makeUser(role: "super_admin" | "accountant" | "content_editor" = "super_admin") {
  const email = unique();
  const [u] = await db
    .insert(users)
    .values({ email, name: `Test ${role}`, role, passwordHash: await hashPassword(PASSWORD) })
    .returning();
  return u!;
}

async function makeEnrolledUser(role: "super_admin" | "accountant" | "content_editor" = "super_admin") {
  const u = await makeUser(role);
  const secret = newTotpSecret();
  const codes = await enrolTwoFactor(u.id, secret, currentTotp(secret));
  return { user: (await db.select().from(users).where(eq(users.id, u.id)))[0]!, secret, codes };
}

const lastAudit = async (entityId: string) =>
  (
    await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, entityId))
      .orderBy(desc(auditLog.id))
      .limit(1)
  )[0];

describe("sign-in", () => {
  it("locks the account after 5 failures and unlocks after 15 minutes", async () => {
    const u = await makeUser();
    const now = new Date();
    for (let i = 1; i < MAX_FAILED_LOGINS; i++)
      expect(await checkPassword(u.email, "wrong password!!", now)).toEqual({ ok: false, error: "invalid" });
    expect(await checkPassword(u.email, "wrong password!!", now)).toEqual({ ok: false, error: "locked" });
    expect(await checkPassword(u.email, PASSWORD, now)).toEqual({ ok: false, error: "locked" });
    const later = new Date(now.getTime() + LOCK_MINUTES * 60_000 + 1000);
    expect(await checkPassword(u.email, PASSWORD, later)).toMatchObject({ ok: true, needsSetup: true });
  });

  it("gives the same answer for unknown emails and wrong passwords", async () => {
    expect(await checkPassword(unique(), PASSWORD)).toEqual({ ok: false, error: "invalid" });
  });

  it("accepts a TOTP code once and a recovery code once", async () => {
    const { user, secret, codes } = await makeEnrolledUser();
    const later = new Date(Date.now() + 60_000); // the enrolment code's step is already used
    const code = currentTotp(secret, later.getTime());
    expect(await checkSecondFactor(user.id, code, later)).toEqual({ ok: true, usedRecoveryCode: false });
    expect(await checkSecondFactor(user.id, code, later)).toEqual({ ok: false, error: "invalid" });
    expect(await checkSecondFactor(user.id, codes[0]!, later)).toEqual({ ok: true, usedRecoveryCode: true });
    expect(await checkSecondFactor(user.id, codes[0]!, later)).toEqual({ ok: false, error: "invalid" });
  });

  it("ends sessions when a user is deactivated, reset or changes role", async () => {
    const admin = await makeEnrolledUser();
    const { user } = await makeEnrolledUser("content_editor");
    expect(await activeUser(user.id, user.sessionVersion)).not.toBeNull();
    await setRole(user.id, "accountant", { userId: admin.user.id });
    expect(await activeUser(user.id, user.sessionVersion)).toBeNull();
    const fresh = (await db.select().from(users).where(eq(users.id, user.id)))[0]!;
    await setActive(user.id, false, { userId: admin.user.id });
    expect(await activeUser(user.id, fresh.sessionVersion + 1)).toBeNull();
    expect((await lastAudit(user.id))?.action).toBe("user.deactivate");
  });
});

describe("user management", () => {
  it("invite → set password once → set up 2FA", async () => {
    const admin = await makeEnrolledUser();
    const email = unique();
    const { userId, token } = await inviteUser(
      { name: "Invited Editor", email, role: "content_editor" },
      { userId: admin.user.id },
    );
    expect((await lastAudit(userId))?.action).toBe("user.invite");
    expect(await linkUser(token, "reset")).toBeNull(); // wrong kind
    await expect(setPasswordFromLink(token, "invite", "short")).rejects.toMatchObject({
      code: "password",
      detail: "short",
    });
    await setPasswordFromLink(token, "invite", PASSWORD);
    await expect(setPasswordFromLink(token, "invite", PASSWORD)).rejects.toMatchObject({ code: "token" });
    expect(await checkPassword(email, PASSWORD)).toMatchObject({ ok: true, needsSetup: true });
    const secret = newTotpSecret();
    await expect(enrolTwoFactor(userId, secret, "000000")).rejects.toBeInstanceOf(UserError);
    expect(await enrolTwoFactor(userId, secret, currentTotp(secret))).toHaveLength(10);
  });

  it("refuses self-changes and removing the last Super Admin", async () => {
    const { user } = await makeEnrolledUser();
    const editor = await makeEnrolledUser("content_editor");
    await expect(setRole(user.id, "accountant", { userId: user.id })).rejects.toMatchObject({ code: "self" });
    // Throwaway database: leave this user as the only active Super Admin.
    await db
      .update(users)
      .set({ isActive: false })
      .where(sql`${users.role} = 'super_admin' and ${users.id} <> ${user.id}`);
    await expect(setActive(user.id, false, { userId: editor.user.id })).rejects.toMatchObject({
      code: "last_super_admin",
    });
    await expect(setRole(user.id, "content_editor", { userId: editor.user.id })).rejects.toMatchObject({
      code: "last_super_admin",
    });
  });

  it("reset links, 2FA reset and password change are audited without secrets", async () => {
    const admin = await makeEnrolledUser();
    const { user } = await makeEnrolledUser("accountant");
    const { kind, token } = await createResetLink(user.id, { userId: admin.user.id });
    expect(kind).toBe("reset");
    await setPasswordFromLink(token, "reset", "a brand new passphrase");
    await resetTwoFactor(user.id, { userId: admin.user.id });
    expect(
      (await checkPassword(user.email, "a brand new passphrase")) as { needsSetup: boolean },
    ).toMatchObject({ needsSetup: true });
    await expect(changeOwnPassword(user.id, "nope", "another long passphrase")).rejects.toMatchObject({
      code: "current_password",
    });
    await changeOwnPassword(user.id, "a brand new passphrase", "another long passphrase");
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, user.id));
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        "user.2fa_enrolled",
        "user.reset_link",
        "user.password_reset",
        "user.2fa_reset",
        "user.password_change",
      ]),
    );
    const blob = JSON.stringify(entries);
    expect(blob).not.toMatch(/argon2|passphrase|totp_secret|recovery/i);
  });
});

describe("settings", () => {
  it("organization changes are validated, saved and audited with before/after", async () => {
    const admin = await makeEnrolledUser();
    const [before] = await db.select().from(organizationSettings);
    const input = {
      ...before,
      foundingDate: before?.foundingDate ?? null,
      city: "Mumbai",
      signatoryName: "Test Signatory",
      signatoryTitle: "Managing Trustee",
    };
    await withTx((tx) => updateOrganization(tx, input, { userId: admin.user.id }));
    const [after] = await db.select().from(organizationSettings);
    expect(after?.city).toBe("Mumbai");
    expect(after?.updatedBy).toBe(admin.user.id);
    const entry = await lastAudit("1");
    expect(entry?.action).toBe("settings.organization.update");
    expect((entry?.after as { city: string }).city).toBe("Mumbai");
    await expect(
      withTx((tx) => updateOrganization(tx, { ...input, trustPan: "bad" }, { userId: admin.user.id })),
    ).rejects.toThrow();
  });

  it("receipt templates are validated, saved, audited and can be reset", async () => {
    const admin = await makeEnrolledUser();
    const actor = { userId: admin.user.id };
    const ack = { blocks: [{ type: "text", text: "Thanks {donor.name}", style: "normal", align: "left" }] };
    await withTx((tx) => updateReceiptTemplate(tx, "acknowledgement", ack, actor));
    expect((await loadReceiptTemplates()).pdf.acknowledgement).toEqual(ack);
    expect((await loadReceiptTemplates()).pdf["80g"]).toEqual(DEFAULT_PDF["80g"]);
    const entry = await lastAudit("1");
    expect(entry?.action).toBe("settings.receipts.update");
    // An 80G template without the donor's PAN is refused.
    await expect(withTx((tx) => updateReceiptTemplate(tx, "80g", ack, actor))).rejects.toThrow(/must show/);
    await withTx((tx) => updateReceiptTemplate(tx, "acknowledgement", null, actor));
    expect((await loadReceiptTemplates()).pdf.acknowledgement).toEqual(DEFAULT_PDF.acknowledgement);
  });

  it("audit_log stays append-only", async () => {
    const error = await db
      .execute(sql`update audit_log set action = 'x' where id = (select max(id) from audit_log)`)
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error & { cause?: Error }).cause?.message ?? (error as Error).message)).toMatch(
      /append-only/,
    );
  });
});
