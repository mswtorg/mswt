"use server";

import { and, count, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { routing, type Locale } from "@/i18n/routing";
import { db } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";
import { notifyContactMessage } from "@/lib/contact/notify";
import { ContactSchema, type ContactErrorCode, type ContactField } from "@/lib/contact/schema";
import { clientIp, hashIp, isRateLimited } from "@/lib/security/rate-limit";
import { verifyTurnstile } from "@/lib/security/turnstile";

export type ContactState =
  | { status: "idle" }
  | { status: "sent" }
  | {
      status: "error";
      errors: Partial<Record<ContactField | "form", ContactErrorCode>>;
      values: Record<string, string>;
    };

/** Contact form submission: validate, verify Turnstile, rate-limit by hashed IP, then store. */
export async function sendContactMessage(_prev: ContactState, form: FormData): Promise<ContactState> {
  const values = Object.fromEntries(
    ["name", "email", "phone", "subject", "message"].map((k) => [k, String(form.get(k) ?? "")]),
  );
  const localeRaw = String(form.get("locale") ?? "en");
  const locale: Locale = (routing.locales as readonly string[]).includes(localeRaw)
    ? (localeRaw as Locale)
    : "en";

  const parsed = ContactSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Partial<Record<ContactField, ContactErrorCode>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as ContactField;
      errors[field] ??= field;
    }
    return { status: "error", errors, values };
  }

  const h = await headers();
  const ip = clientIp(h);
  if (!(await verifyTurnstile(String(form.get("cf-turnstile-response") ?? ""), ip))) {
    return { status: "error", errors: { form: "captcha" }, values };
  }

  try {
    const ipHash = hashIp(ip);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [recent] = await db
      .select({ n: count() })
      .from(messages)
      .where(and(eq(messages.ipHash, ipHash), gt(messages.createdAt, since)));
    if (isRateLimited(recent?.n ?? 0)) return { status: "error", errors: { form: "rate" }, values };

    const d = parsed.data;
    const [saved] = await db
      .insert(messages)
      .values({
        name: d.name,
        email: d.email,
        phone: d.phone || null,
        subject: d.subject,
        body: d.message,
        locale,
        ipHash,
      })
      .returning({ id: messages.id });
    // Emails go out after the response, so the visitor isn't kept waiting.
    if (saved) after(() => notifyContactMessage(saved.id));
  } catch (error) {
    console.error("Contact form failed", error);
    return { status: "error", errors: { form: "server" }, values };
  }
  return { status: "sent" };
}
