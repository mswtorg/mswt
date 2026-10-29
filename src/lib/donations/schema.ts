import { z } from "zod";
import { rupeesToPaise } from "@/lib/money";
import type { PaymentSettings } from "@/lib/payment-settings";
import { DONATE_FIELDS, type DonateErrorCode, type DonateField } from "./fields";

// Donate form validation (server side; SEC-06, also run in the browser as people type).
// Error codes map to translated messages.

export { DONATE_FIELDS, type DonateErrorCode, type DonateField };

/**
 * PAN format, including the holder type in the 4th letter: P individual, H HUF, C company,
 * F firm/LLP, A association of persons, B body of individuals, T trust, L local authority,
 * J artificial juridical person, G government. A free check only: it does not ask the
 * Income Tax Department whether the PAN exists or whose it is.
 */
export const PAN_RE = /^[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z]$/;

/** Indian mobile, with or without +91/0: returns the 10 digits Cashfree expects. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

type Limits = Pick<PaymentSettings, "minAmountPaise" | "maxAmountPaise" | "panRequiredAbovePaise">;

export function donateSchema(settings: Limits) {
  return z
    .object({
      amount: z.string().transform((v, ctx) => {
        let paise: number;
        try {
          paise = rupeesToPaise(v);
        } catch {
          ctx.addIssue({ code: "custom", message: "amount" });
          return z.NEVER;
        }
        if (paise < settings.minAmountPaise) ctx.addIssue({ code: "custom", message: "amountMin" });
        if (settings.maxAmountPaise !== null && paise > settings.maxAmountPaise)
          ctx.addIssue({ code: "custom", message: "amountMax" });
        return paise;
      }),
      // Cause slug ("" = general fund); resolved to an active cause in the database on the server.
      cause: z
        .union([
          z.literal(""),
          z
            .string()
            .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
            .max(120),
        ])
        .transform((v) => v || null),
      name: text(120),
      email: z.email().max(200),
      phone: z
        .string()
        .transform((v, ctx) => normalisePhone(v) ?? (ctx.addIssue({ code: "custom" }), z.NEVER)),
      wants80g: checkbox,
      pan: z.string().trim().toUpperCase().optional(),
      line1: z.string().trim().max(200).optional(),
      line2: z.string().trim().max(200).optional(),
      city: z.string().trim().max(80).optional(),
      state: z.string().trim().max(80).optional(),
      pincode: z.string().trim().optional(),
      anonymous: checkbox,
      coverFee: checkbox,
      citizen: checkbox.refine((v) => v === true),
    })
    .superRefine((d, ctx) => {
      for (const field of missing80gFields(d)) ctx.addIssue({ code: "custom", path: [field] });
      if (panMissing(d.amount, d.pan, settings))
        ctx.addIssue({ code: "custom", path: ["pan"], message: "panRequired" });
    });
}
export type DonateInput = z.output<ReturnType<typeof donateSchema>>;

/** Above Settings → Payments → "PAN required above", every donation needs a valid PAN (80G or not). */
export function panRequired(amountPaise: number, settings: Pick<PaymentSettings, "panRequiredAbovePaise">) {
  return amountPaise > settings.panRequiredAbovePaise;
}

function panMissing(
  amountPaise: number,
  pan: string | undefined,
  settings: Pick<PaymentSettings, "panRequiredAbovePaise">,
) {
  return panRequired(amountPaise, settings) && !PAN_RE.test((pan ?? "").trim().toUpperCase());
}

/**
 * An 80G receipt needs PAN and a postal address (spec §4.3): address line 1 and PIN code; city and
 * state are optional. Checks raw form values too.
 */
export function missing80gFields(v: {
  wants80g?: unknown;
  pan?: string;
  line1?: string;
  pincode?: string;
}): DonateField[] {
  if (!(v.wants80g === true || v.wants80g === "on" || v.wants80g === "true")) return [];
  const missing: DonateField[] = [];
  if (!PAN_RE.test((v.pan ?? "").trim().toUpperCase())) missing.push("pan");
  if (!v.line1?.trim()) missing.push("line1");
  if (!/^[1-9][0-9]{5}$/.test((v.pincode ?? "").trim())) missing.push("pincode");
  return missing;
}

/**
 * All problems at once: zod skips object-level checks while fields are invalid, so the 80G
 * fields and the PAN rule are also checked on the raw values.
 */
export function validateDonation(
  settings: Limits,
  raw: Record<string, string>,
): { ok: true; data: DonateInput } | { ok: false; errors: Partial<Record<DonateField, DonateErrorCode>> } {
  const parsed = donateSchema(settings).safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors = donateErrors(parsed.error.issues);
  for (const field of missing80gFields(raw)) errors[field] ??= field;
  let amount: number | null = null;
  try {
    amount = rupeesToPaise(raw.amount ?? "");
  } catch {}
  if (amount !== null && panMissing(amount, raw.pan, settings)) errors.pan = "panRequired";
  return { ok: false, errors };
}

/** Map zod issues to one error code per field. */
export function donateErrors(issues: z.core.$ZodIssue[]): Partial<Record<DonateField, DonateErrorCode>> {
  const errors: Partial<Record<DonateField, DonateErrorCode>> = {};
  for (const issue of issues) {
    const field = issue.path[0] as DonateField | undefined;
    if (!field || !(DONATE_FIELDS as readonly string[]).includes(field)) continue;
    const code =
      issue.message === "amountMin" || issue.message === "amountMax" || issue.message === "panRequired"
        ? issue.message
        : field;
    errors[field] ??= code;
  }
  return errors;
}

/** Gateway-fee cover, computed on the server only: round half up of amount × bp / 10 000. */
export function feeCoverPaise(
  amountPaise: number,
  settings: Pick<PaymentSettings, "feeCoverEnabled" | "feeCoverPercentBp">,
  wanted: boolean,
): number {
  if (!wanted || !settings.feeCoverEnabled || settings.feeCoverPercentBp <= 0) return 0;
  return Math.floor((amountPaise * settings.feeCoverPercentBp + 5000) / 10000);
}
